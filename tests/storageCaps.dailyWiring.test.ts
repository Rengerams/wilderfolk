/**
 * `updateStorageCaps` is wired into the daily economy owner: this test drives the real daily
 * boundary through `gameTick`, so removing the call from `tickStaticDaily` fails it.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { gameTick } from '../src/game/gameTick';
import { BuildingType } from '../src/game/gameTypes';
import type { WorldState } from '../src/game/gameTypes';
import { BUILDING_CONFIGS } from '../src/game/buildings';
import { TICKS_PER_DAY, tickAtDailyPhase } from '../src/game/dayCycleClock';
import { updateStorageCaps, siloFoodStorageForLevel } from '../src/game/economy';

const FIXTURE_SEED = 20240913;

function addCompleted(state: WorldState, type: BuildingType): void {
  const cfg = BUILDING_CONFIGS[type];
  state.buildings.push({
    id: 10_000 + state.buildings.length,
    type,
    x: 0,
    y: 0,
    width: cfg.width,
    height: cfg.height,
    occupants: [],
    level: 1,
    constructionProgress: 100,
    completed: true,
    health: 100,
    maxHealth: 100,
    spriteScale: 1,
    buildAnimTimer: 0,
    faction: 'player',
  } as never);
}

describe('storage caps are recomputed by the daily economy owner', () => {
  it('applies a Barn and a Silo bonus on the next colony-day boundary', () => {
    const state = initGame({ seed: FIXTURE_SEED });
    // World-gen seeds its caps from `computeStorageMax([])`. The wiring stays observable because the
    // Barn/Silo assertions below only hold if `updateStorageCaps` runs on the boundary.
    addCompleted(state, BuildingType.Barn);
    addCompleted(state, BuildingType.Silo);

    // Land exactly on a day boundary when gameTick increments the tick.
    state.tick = tickAtDailyPhase(1, 'production') - 1;
    gameTick(state);

    expect(state.storageMax.wood).toBe(800 + 300); // base + Barn
    expect(state.storageMax.food).toBe(800 + 400 + siloFoodStorageForLevel(1)); // base + Barn + Silo
    expect(state.storageMax.gold).toBe(20000);
    expect(state.foodSpoilageRate).toBeCloseTo(0.008); // Silo cut
  });

  it('matches the pure formula after a day boundary', () => {
    const ticked = initGame({ seed: FIXTURE_SEED });
    addCompleted(ticked, BuildingType.WoodStorehouse);
    addCompleted(ticked, BuildingType.Store);
    ticked.tick = tickAtDailyPhase(1, 'production') - 1;
    gameTick(ticked);

    const formula = initGame({ seed: FIXTURE_SEED });
    formula.buildings = ticked.buildings;
    updateStorageCaps(formula);

    expect(ticked.storageMax).toEqual(formula.storageMax);
    expect(ticked.foodSpoilageRate).toBeCloseTo(formula.foodSpoilageRate);
  });
});