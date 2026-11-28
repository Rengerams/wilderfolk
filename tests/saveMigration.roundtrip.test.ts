import { invalidateWorldRuntimeCaches } from '../src/game/worldRuntimeCaches';
/**
 * The autumn-migration state survives save/load: the save schema carries
 * `activeMigration`, `migrationNextHerdSize` and `migrationTag`.
 */
import { describe, it, expect } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { BuildingType, EntityType, MapSize, type WorldState } from '../src/game/gameTypes';
import { building } from '../src/test/factories';
import { createInitialView } from '../src/game/viewState';
import { buildSaveData, loadGameFromParsed, parseSaveJson, loadGameFromParsedOutcome } from '../src/game/saveLoad';
import { WORLD_STATE_SAVE_KEYS } from '../src/game/saveSchema';
import { extractSimPrep, applySimPrep } from '../src/game/simWorker/simPrep';
import { extractSimTickDelta, applySimTickDelta } from '../src/game/simBuffers/simDelta';
import { computePopulationCounts } from '../src/game/entityCounts';
import { tickEcosystemMetrics } from '../src/game/dailyEcology';
import { getEcosystemBreakdown } from '../src/game/ecoBreakdown';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/game/dayCycleClock';
import { HERD_BASE_SIZE, MIGRATION_WINDOW_DAYS } from '../src/game/migration';
import { getAbsoluteCalendarDay } from '../src/game/dayCycle';

function roundTrip(
  world: Parameters<typeof buildSaveData>[0],
  preparePayload?: (payload: Record<string, unknown>) => void,
) {
  const raw = JSON.stringify(buildSaveData(world, createInitialView(world.width, world.height)));
  const parsed = parseSaveJson(raw);
  expect(parsed.valid).toBe(true);
  if (!parsed.valid || !parsed.parsed) throw new Error('save invalid');
  preparePayload?.(parsed.parsed);
  const loaded = loadGameFromParsed(parsed.parsed);
  expect(loaded).not.toBeNull();
  return loaded!.world;
}

describe('migration survives save/load', () => {
  it('mid-migration save keeps the active herd window and the herd memory', () => {
    const state = initGame({ villageName: 'M', size: 'medium' });
    state.activeMigration = {
      herdYear: 3,
      endDay: getAbsoluteCalendarDay(state.tick) + MIGRATION_WINDOW_DAYS,
      spawned: HERD_BASE_SIZE,
    };
    state.migrationNextHerdSize = 6;
    // A tagged herd deer still in the world
    const deer = state.entities.find((e) => e.type === EntityType.Deer);
    if (deer) deer.migrationTag = 3;

    const loaded = roundTrip(state);

    expect(loaded.activeMigration?.herdYear).toBe(3);
    expect(loaded.activeMigration?.spawned).toBe(HERD_BASE_SIZE);
    expect(loaded.migrationNextHerdSize).toBe(6);
    const loadedDeer = loaded.entities.find((e) => e.type === EntityType.Deer);
    if (deer && loadedDeer) expect(loadedDeer.migrationTag).toBe(3);
  });
});

describe('legacy rival camp save compatibility', () => {
  it('retires old rival structures without discarding player buildings', () => {
    const state = initGame({ villageName: 'M', size: 'medium' });
    state.buildings.push(building(9001, BuildingType.House), building(9002, BuildingType.Store));
    state.nextBuildingId = Math.max(state.nextBuildingId, 9003);

    const loaded = roundTrip(state, (payload) => {
      // Old faction tags exist only in serialized saves, not the active Building model.
      const saved = payload.buildings as Array<{ id: number; faction?: string }>;
      saved.find((item) => item.id === 9001)!.faction = 'rival';
      saved.find((item) => item.id === 9002)!.faction = 'player';
    });

    expect(loaded.buildings.some((item) => item.id === 9001)).toBe(false);
    const store = loaded.buildings.find((item) => item.id === 9002);
    expect(store).toBeDefined();
    expect((store as typeof store & { faction?: string }).faction).toBeUndefined();
    expect(loaded.nextBuildingId).toBeGreaterThan(9001);
    expect(loaded.appliedSaveMigrations).toContain('legacy-village-camps');
  });

  it('still cleans an old save that already has the migration marker', () => {
    const state = initGame({ villageName: 'M', size: 'medium' });
    state.buildings.push(building(9001, BuildingType.House));
    state.nextBuildingId = Math.max(state.nextBuildingId, 9002);
    const loaded = roundTrip(state, (payload) => {
      const saved = payload.buildings as Array<{ id: number; faction?: string }>;
      saved.find((item) => item.id === 9001)!.faction = 'rival';
      payload.appliedSaveMigrations = ['legacy-village-camps'];
    });
    expect(loaded.buildings.some((item) => item.id === 9001)).toBe(false);
    expect(loaded.appliedSaveMigrations?.filter((id) => id === 'legacy-village-camps')).toHaveLength(1);
  });
});

describe('M20/M25/M34 — simulation state round-trips', () => {
  it('preserves ecology stage and hysteresis state across repeated save/load cycles', () => {
    const state = initGame({ villageName: 'Valley', size: 'medium', seed: 7 });
    state.tick = TICKS_PER_DAY * 20;
    const savedStage = {
      valleyStage: 'collapse' as const,
      valleyStageSinceDay: 16,
      valleyRawStressStreakDays: 0,
      valleyRawCalmStreakDays: 1,
      valleyLastStageNotifyDay: 16,
    };
    Object.assign(state, savedStage);
    const loaded = roundTrip(state);
    expect(loaded).toMatchObject(savedStage);
    expect(roundTrip(loaded)).toMatchObject(savedStage);
  });

  it('keeps the moon-howler cooldowns, village happiness and chronicle in the save allow-list', () => {
    for (const key of ['lastMoonHowlerExorcismTick', 'moonHowlerPriestsFleeUntil', 'villageHappiness', 'chronicleChapters']) {
      expect(WORLD_STATE_SAVE_KEYS).toContain(key);
    }
  });

  it('preserves the settled ecology explanation and pending late settlement across save and worker boundaries', () => {
    const state = initGame({ skipTerrain: true, seed: 20240913 });
    tickEcosystemMetrics(state, computePopulationCounts(state.entities.filter(entity => entity.alive)), state.buildings);
    state.workSchedule = { startHour: 12, endHour: 23 };
    state.tick = TICKS_PER_DAY + 20 * TICKS_PER_HOUR;
    state.productionDeferred = true;
    state.productionValleyStage = state.valleyStage ?? 'stable';
    state.ecologySettlementPending = true;
    const expected = getEcosystemBreakdown(state);

    const loaded = roundTrip(state);
    expect(loaded.settledEcology).toEqual(state.settledEcology);
    expect(loaded.ecologySettlementPending).toBe(true);
    expect(getEcosystemBreakdown(loaded)).toEqual(expected);

    const target = initGame({ skipTerrain: true, seed: 20240913 });
    applySimPrep(target, extractSimPrep(state));
    expect(target.settledEcology).toEqual(state.settledEcology);
    expect(target.ecologySettlementPending).toBe(true);

    target.settledEcology = undefined;
    target.ecologySettlementPending = false;
    applySimTickDelta(target, extractSimTickDelta(state, undefined, { cloneMode: 'isolated' }), { cloneMode: 'isolated' });
    expect(target.settledEcology).toEqual(state.settledEcology);
    expect(target.ecologySettlementPending).toBe(true);
    expect(getEcosystemBreakdown(target)).toEqual(expected);
  });

  it('survives a save/load round-trip', () => {
    const state = initGame({ skipTerrain: true, seed: 20240913 });
    state.lastMoonHowlerExorcismTick = 1234;
    state.moonHowlerPriestsFleeUntil = 4321;
    state.villageHappiness = 73;
    state.chronicleChapters = ['first_harvest'];

    const loaded = roundTrip(state);

    expect(loaded.lastMoonHowlerExorcismTick).toBe(1234);
    expect(loaded.moonHowlerPriestsFleeUntil).toBe(4321);
    expect(loaded.villageHappiness).toBe(73);
    expect(loaded.chronicleChapters).toEqual(['first_harvest']);
  });
});

describe('what the tick writes is durable', () => {
  it('saves the heating decision the simulation reads for the rest of the day', () => {
    // `humanNeeds` reads the cached `villageCanHeat` to apply the 1.5x unheated-winter penalty, so a
    // reload must not refund the rest of the day it was decided for.
    expect(
      (WORLD_STATE_SAVE_KEYS as readonly string[]).includes('villageCanHeat'),
      'villageCanHeat is not saved, so a reload cancels the rest of the day it was decided for',
    ).toBe(true);
  });

  it('rebuilds the beauty grid on load without discarding the saved happiness', () => {
    // `beautyGrid` is a stripped runtime cache and `villageHappiness` is saved, so the load rebuilds
    // the grid from the stored decor without recomputing the happiness it already has.
    const world = initGame({ villageName: 'Pretty', seed: 20260927, size: MapSize.Medium });
    world.buildings = [
      ...world.buildings,
      { ...world.buildings[0], id: 9001, type: BuildingType.Garden, completed: true, occupants: [] },
    ] as WorldState['buildings'];
    world.villageHappiness = 73;

    const saved = buildSaveData(world, createInitialView(world.width, world.height));
    // The save does not carry the grid…
    expect('beautyGrid' in saved).toBe(false);

    const outcome = loadGameFromParsedOutcome(saved);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    // …the load rebuilds it from the stored decor…
    expect(outcome.world.beautyGrid, 'the beauty grid was not rebuilt on load').toBeDefined();
    // …and the persisted happiness survives, because the next daily tick owns refining it.
    expect(outcome.world.villageHappiness).toBe(73);
  });
});

describe('runtime caches are stripped by their owner', () => {
  it('drops the beauty grid as well as the spatial indexes', () => {
    // A live `Int16Array` riding an export clone is the cost of leaving a non-serializable field out
    // of the drop list — and nothing then forces the load path to recompute it.
    const world = initGame({ villageName: 'Caches', seed: 20260928, size: MapSize.Medium });
    world.beautyGrid = { cols: 1, rows: 1, values: new Int16Array(1) };
    invalidateWorldRuntimeCaches(world);
    expect(world.beautyGrid).toBeUndefined();
  });
});
