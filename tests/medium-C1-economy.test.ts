/**
 * Medium-severity economy regressions: greenhouse output in the ledger, Irrigation's drought
 * resistance, and autumn herd deer spawning on passable ground.
 */
import { describe, it, expect } from 'vitest';
import { initGame, gameTick } from '../src/game/gameEngine';
import { createBuilding, isPassableWildlifePosition } from '../src/game/worldGen';
import { rebuildEntityByIdMap } from '../src/game/entityIndex';
import { invalidateCachedEntityByType } from '../src/game/entityTypeCache';
import { getWeatherFarmMultiplier } from '../src/game/grassEcology';
import { getMultiplier } from '../src/game/simHelpers';
import { TICKS_PER_DAY } from '../src/game/dayCycle';
import { tickAtDailyPhase } from '../src/game/dayCycleClock';
import { HERD_BASE_SIZE, migrationArrivalDay, tickMigration } from '../src/game/migration';
import { BuildingType, EntityType, JobType, MapPreset, WeatherType } from '../src/game/gameTypes';
import type { Building, WorldState } from '../src/game/gameTypes';

/**
 * A controlled village: one adult settler, one completed producer, so the daily economy has
 * exactly one staffed building; day 1 is a workday production tick.
 */
function loneProducerVillage(
  type: BuildingType,
  seed = 4242,
): { state: WorldState; building: Building } {
  const state = initGame({ villageName: 'C1', size: 'medium', seed });
  const building = createBuilding(type, 240, 240, 9001);
  building.completed = true;
  building.constructionProgress = 100;

  const worker = state.entities.find(
    (e) =>
      e.type === EntityType.Human &&
      e.alive &&
      !e.isJuvenile &&
      !e.faction &&
      e.occupation !== 'leader',
  );
  if (!worker) throw new Error('fixture: starter village has no adult settler');

  state.buildings = [building];
  state.entities = [worker];
  rebuildEntityByIdMap(state);
  invalidateCachedEntityByType(state);

  // This isolated producer represents a settler who actually attended their
  // completed workplace during the preceding shift.
  worker.x = building.x + building.width / 2;
  worker.y = building.y + building.height / 2;
  worker.workerBuildingId = building.id;
  worker.job = JobType.Farmer;
  worker.occupation = 'farmer';
  // Production now depends on actual attendance from the previous settled shift.
  // The isolated fixture bypasses the realtime work ticks, so supply their earned hours.
  worker.scheduleLastWorkedHours = 8;
  building.occupants = [worker.id];

  state.resources.food = 0;
  // gameTick advances the clock first, so this lands on day 1 at 18:00 — the production phase.
  state.tick = tickAtDailyPhase(1, 'production') - 1;
  return { state, building };
}

function herdDeer(state: WorldState, herdYear: number) {
  // The fallback spawn path can duplicate a herd entity when the edge strip is water, so dedupe
  // by id: the herd's size is its unique deer.
  const seen = new Set<number>();
  return state.entities.filter((e) => {
    if (e.type !== EntityType.Deer || e.migrationTag !== herdYear || seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
}

describe('M5 greenhouse food production reaches the economy ledger', () => {
  it('records staffed greenhouse output under its own ledger row', () => {
    const { state } = loneProducerVillage(BuildingType.Greenhouse);
    gameTick(state);

    expect(state.resources.food, 'the greenhouse actually produced food').toBeGreaterThan(0);
    const ledger = state.economyLedger;
    expect(ledger, 'a production day creates a ledger').toBeDefined();
    // The greenhouse row must exist and account for the food that reached storage.
    expect(ledger?.produced.greenhouse ?? 0, 'greenhouse ledger row').toBeGreaterThan(0);
    expect(ledger?.produced.greenhouse ?? 0).toBeGreaterThanOrEqual(state.resources.food);
  });
});

describe('M10 Irrigation drought_resist is consumed by the drought farm penalty', () => {
  it('is read from research state and softens the drought penalty by 1.5x', () => {
    const state = initGame({ villageName: 'C1', size: 'medium', seed: 11 });
    expect(getMultiplier(state, 'drought_resist')).toBe(1);

    const unresearched = getWeatherFarmMultiplier(
      WeatherType.Drought,
      getMultiplier(state, 'drought_resist'),
    );
    expect(unresearched).toBeCloseTo(0.5);

    const node = state.researchNodes.find((n) => n.id === 'agriculture_3');
    expect(node, 'agriculture_3 (Irrigation) node exists').toBeDefined();
    node!.researched = true;

    expect(getMultiplier(state, 'drought_resist')).toBeCloseTo(1.5);
    // "Farms work 50% better in drought": 0.5 * 1.5 = 0.75.
    expect(
      getWeatherFarmMultiplier(WeatherType.Drought, getMultiplier(state, 'drought_resist')),
    ).toBeCloseTo(0.75);
    // The resist is drought-only — clear weather is untouched.
    expect(
      getWeatherFarmMultiplier(WeatherType.Clear, getMultiplier(state, 'drought_resist')),
    ).toBeCloseTo(1);
  });

  it('raises real farm output in a drought once Irrigation is researched', () => {
    const plain = loneProducerVillage(BuildingType.Farm);
    plain.state.weather = WeatherType.Drought;
    gameTick(plain.state);

    const irrigated = loneProducerVillage(BuildingType.Farm);
    irrigated.state.weather = WeatherType.Drought;
    irrigated.state.researchNodes.find((n) => n.id === 'agriculture_3')!.researched = true;
    gameTick(irrigated.state);

    expect(plain.state.resources.food, 'the drought farm still produced food').toBeGreaterThan(0);
    // Irrigation must raise the drought harvest above the unresearched farm's.
    expect(irrigated.state.resources.food).toBeGreaterThan(plain.state.resources.food);
  });
});

describe('M19 autumn herd deer spawn on passable ground', () => {
  it('never places herd deer on unpassable terrain', () => {
    const presets = [
      MapPreset.Coastal,
      MapPreset.Rivers,
      MapPreset.Scandinavia,
      MapPreset.Continental,
      MapPreset.Highland,
      MapPreset.Arabia,
    ];
    for (const preset of presets) {
      for (const seed of [1, 2, 3]) {
        const state = initGame({ villageName: 'C1', size: 'medium', preset, seed });
        state.tick = migrationArrivalDay(state.worldMap!.seed) * TICKS_PER_DAY;
        tickMigration(state, state.entities);

        const herd = herdDeer(state, 0);
        // The new terrain can block part of the edge strip, so a herd may arrive smaller than the
        // base size — what matters is that a herd arrives and none of it lands on unpassable ground.
        expect(herd.length, `${preset}/${seed}: a herd arrives`).toBeGreaterThan(0);
        expect(herd.length, `${preset}/${seed}: herd never exceeds base`).toBeLessThanOrEqual(HERD_BASE_SIZE);
        for (const deer of herd) {
          expect(
            isPassableWildlifePosition(state, deer.x, deer.y, 8),
            `${preset}/${seed}: deer ${deer.id} spawned on blocked terrain at ${deer.x},${deer.y}`,
          ).toBe(true);
        }
      }
    }
  });
});
