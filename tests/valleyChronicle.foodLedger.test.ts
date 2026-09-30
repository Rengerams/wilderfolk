/**
 * A Valley Chronicle chapter's food reward reaches the food ledger.
 *
 * Found while fixing audit M5 (`LIVE-FINDINGS-STATUS.md`): the M5 defect *over*-recorded a catch,
 * this one *under*-records a grant — `advanceValleyChronicle` credited chapter rewards through
 * `addCappedResource` and never told the ledger, so food really did enter storage while the
 * "why is my food low?" panel and the 30-day `foodHistory` could not see it. Three chapters reward
 * food: `first_harvest` +100, `the_hunt` +80, `the_river` +80.
 *
 * The chapter is driven directly rather than through a tick so the fixture contains no other
 * producer, no spoilage and no cap pressure: the assertion is exactly "the store gained 80 and the
 * ledger says 80".
 */
import { describe, expect, it } from 'vitest';
import { BuildingType } from '../src/game/gameTypes';
import type { Building, WorldState } from '../src/game/gameTypes';
import { initGame } from '../src/game/worldGen';
import { advanceValleyChronicle } from '../src/game/valleyChronicle';

const FIXTURE_SEED = 20_260_917;
/** `the_hunt` — met by a completed Hunting Spot, grants `{ food: 80 }`. */
const CHAPTER_ID = 'the_hunt';
const REWARD_FOOD = 80;

function huntingSpot(): Building {
  return {
    id: 10, type: BuildingType.HuntingSpot, x: 80, y: 80, width: 40, height: 40, occupants: [],
    level: 1, constructionProgress: 100, completed: true, health: 100, maxHealth: 100,
    spriteScale: 1, buildAnimTimer: 0,
  };
}

function world(): WorldState {
  const state = initGame({ villageName: 'Chronicle', size: 'medium', seed: FIXTURE_SEED });
  state.buildings = [huntingSpot()];
  state.chronicleChapters = [];
  state.resources.food = 0;
  // Above the reward, so the grant is not clipped and the store total is the assertion's floor.
  expect(state.storageMax.food).toBeGreaterThan(REWARD_FOOD);
  return state;
}

describe('a Chronicle chapter food reward is recorded as produced', () => {
  it('credits the store and the ledger with the same amount', () => {
    const state = world();

    const unlocked = advanceValleyChronicle(state);

    expect(unlocked).toContain(CHAPTER_ID);
    expect(state.resources.food).toBe(REWARD_FOOD);
    // The pre-fix ledger has no entry at all: the food is in the store and nothing explains it.
    expect(state.economyLedger?.produced.chronicle).toBe(REWARD_FOOD);
  });
});
