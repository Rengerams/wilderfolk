/**
 * Reputation cannot exceed its ceiling, whichever writer moves it.
 *
 * Regression for audit L5 (`docs/private/audits/2026-09-16/sim-economy-leadership-combat.md`, tracked
 * in `LIVE-FINDINGS-STATUS.md`): the owner `simHelpers.addReputation` clamps **both** ends
 * (`Math.max(0, Math.min(100, …))` — the documented 0..100 contract), but three callers re-stated the
 * rule with only the floor, so a positive delta ran past 100: `storyHelpers.bumpVillageReputation`,
 * the private `storyEvents.bumpRep`, and the election-promise judgement inline in
 * `electionPromises.tickElectionPromises`. The two copies reachable through a public surface are
 * exercised here; the third (`storyEvents.bumpRep`) had no callers outside its own file and was
 * deleted outright, with its ten call sites now calling the owner directly.
 */
import { describe, expect, it } from 'vitest';
import { BuildingType } from '../src/game/gameTypes';
import type { Building, WorldState } from '../src/game/gameTypes';
import { DAYS_PER_YEAR, TICKS_PER_DAY } from '../src/game/dayCycle';
import { initGame } from '../src/game/worldGen';
import { bumpVillageReputation } from '../src/game/storyHelpers';
import {
  EVAL_DAY_OFFSET,
  recordElectionPromises,
  tickElectionPromises,
} from '../src/game/electionPromises';

const FIXTURE_SEED = 20_260_917;
/** `simHelpers.addReputation`'s documented ceiling. */
const REPUTATION_MAX = 100;
/** One point below it, so a small positive delta is what would breach it. */
const NEAR_MAX = REPUTATION_MAX - 1;
/** Walls and forge orders the two promises in play require (`electionPromises` thresholds). */
const WALLS_FOR_PROMISE = 5;
const FORGE_ORDERS_FOR_PROMISE = 3;

function wall(id: number): Building {
  return {
    id, type: BuildingType.Wall, x: 100, y: 100, width: 20, height: 20, occupants: [], level: 1,
    constructionProgress: 100, completed: true, health: 100, maxHealth: 100, spriteScale: 1,
    buildAnimTimer: 0,
  };
}

function world(): WorldState {
  const state = initGame({ villageName: 'Repute', size: 'medium', seed: FIXTURE_SEED });
  state.villageReputation = NEAR_MAX;
  return state;
}

describe('reputation clamps at 100 through every writer (L5)', () => {
  it('clamps a story-side reward', () => {
    const state = world();

    bumpVillageReputation(state, 2);

    expect(state.villageReputation).toBe(REPUTATION_MAX);
  });

  it('clamps the election-promise judgement', () => {
    const state = world();
    state.buildings = Array.from({ length: WALLS_FOR_PROMISE }, (_, i) => wall(i + 1));
    state.villageForge = {
      activeOrder: null,
      progress: 0,
      completed: { iron_spears: true, iron_shields: true, iron_pickaxes: true },
    };
    // A fresh colony stores 4800 food, so the granary promise is met too: every promise the two-slot
    // selection can pick is fulfilled, giving the +6 best case (2 kept × 3) that breaches the ceiling.
    expect(state.resources.food).toBeGreaterThanOrEqual(400);
    expect(Object.keys(state.villageForge.completed)).toHaveLength(FORGE_ORDERS_FOR_PROMISE);

    const year = 3;
    state.year = year;
    state.dayInYear = 0;
    state.tick = year * DAYS_PER_YEAR * TICKS_PER_DAY;
    recordElectionPromises(state, year);

    state.dayInYear = EVAL_DAY_OFFSET;
    state.tick = (year * DAYS_PER_YEAR + EVAL_DAY_OFFSET) * TICKS_PER_DAY;
    tickElectionPromises(state);

    expect(state.villageReputation).toBe(REPUTATION_MAX);
  });
});
