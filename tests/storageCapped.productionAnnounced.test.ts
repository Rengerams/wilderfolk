/**
 * F6 — a full store used to discard production in silence
 * (`docs/private/audits/2026-09-16/playability-gamefeel.md`, tracked in `LIVE-FINDINGS-STATUS.md`).
 *
 * Every production gain goes through the clamp `addResource`, which caps at `storageMax` and returns
 * what it actually accepted. The producers in `dailyBuildingEconomy` threw that return away, so a
 * capped Lumber Mill was indistinguishable from an idle one — measured in the audit, wood sat at
 * exactly 800 (the cap) from ~day 60 to day 290 while a staffed mill kept running, and the only clue
 * was a number that stopped moving. The helper that answers "is this store full?" existed and had **no
 * consumer** (`resourceUtils.isResourceCapped`, grep: definition only).
 *
 * The fix routes production gains through `addProductionOutput`, which announces a refused gain —
 * **total or partial** — and returns the accepted amount for the ledger and skill reward. These tests
 * drive the real daily boundary through `gameTick` so the wiring, not the helper, is what is pinned.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initGame } from '../src/game/worldGen';
import { gameTick } from '../src/game/gameTick';
import { BuildingType } from '../src/game/gameTypes';
import type { WorldState } from '../src/game/gameTypes';
import { BUILDING_CONFIGS } from '../src/game/buildings';
import { TICKS_PER_DAY } from '../src/game/dayCycleClock';
import { PRODUCTION_INTERVAL, isProductionTick } from '../src/game/dayCycle';
import { isPlayerHuman } from '../src/game/playerHuman';

const FIXTURE_SEED = 20_260_917;
const MILL_ID = 10_000;

/** With no storage buildings the daily recompute owns the wood cap: `updateStorageCaps` gives 800. */
const WOOD_CAP = 800;

function addLumberMill(state: WorldState): void {
  const cfg = BUILDING_CONFIGS[BuildingType.LumberMill];
  state.buildings.push({
    id: MILL_ID,
    type: BuildingType.LumberMill,
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

/** A colony with a *staffed* Lumber Mill, sitting on the day boundary the mill produces on. */
function millWorld(wood: number): WorldState {
  const state = initGame({ seed: FIXTURE_SEED });
  expect(state.storageMax.wood, 'fixture premise: no storage buildings, so the base cap applies').toBe(WOOD_CAP);
  addLumberMill(state);
  const worker = state.entities.find((e) => e.alive && isPlayerHuman(e));
  expect(worker, 'fixture premise: the colony starts with a settler').toBeTruthy();
  // Staffing is counted from the workplace assignment and only for settlers with no faction.
  worker!.homeBuildingId = MILL_ID;
  worker!.faction = undefined;
  state.resources.wood = wood;
  state.tick = TICKS_PER_DAY - 1;
  expect(isProductionTick(TICKS_PER_DAY, PRODUCTION_INTERVAL.lumber)).toBe(true);
  return state;
}

function storesFullFloats(state: WorldState): number {
  return state.floatingTexts.filter((f) => f.text === 'Stores full!').length;
}

describe('a clamped store announces what it discarded', () => {
  it('tells the player when the mill produced into a full store', () => {
    const state = millWorld(WOOD_CAP);
    gameTick(state);

    expect(state.storageMax.wood).toBe(WOOD_CAP);
    expect(storesFullFloats(state), 'the mill deleted its output without a word').toBeGreaterThan(0);
    expect(state.resources.wood).toBe(WOOD_CAP);
  });

  it('announces a partial clamp, which was silent even where a total one was not', () => {
    const state = millWorld(WOOD_CAP - 5);
    gameTick(state);

    expect(state.resources.wood).toBe(WOOD_CAP); // the 5 that fit
    expect(storesFullFloats(state), 'the refused remainder went unmentioned').toBeGreaterThan(0);
  });

  it('leaves no producer that discards the clamp result, and gives the predicate a consumer', () => {
    const economy = readFileSync(resolve(process.cwd(), 'src/game/dailyBuildingEconomy.ts'), 'utf8');
    expect(economy).toContain('function addProductionOutput');
    // The pre-fix shape: the accepted amount used only as a truthiness gate.
    expect(economy, 'a producer still gates on the clamp result and drops the refusal')
      .not.toMatch(/if \(addResource\(/);

    const header = readFileSync(resolve(process.cwd(), 'src/components/GameHeader.tsx'), 'utf8');
    for (const resource of ['food', 'wood', 'gold', 'stone', 'iron']) {
      expect(header, `the ${resource} badge never shows a full store`)
        .toContain(`isResourceCapped(world, '${resource}')`);
    }
  });
});
