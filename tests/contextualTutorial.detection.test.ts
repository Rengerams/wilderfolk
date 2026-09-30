/**
 * Contextual-tutorial detection is a function of the current world alone.
 *
 * Regression for the defect where detection compared the world against a "previous"
 * world that was in fact the same object: the game loop mutates one `WorldState` in
 * place (`GameLoop.frame` calls `gameTick(this.world)`, the worker host hands back its
 * single `worldRef`), so every `prev` vs `curr` transition check was false and no tip
 * ever appeared (`BUG_REPORTS/2026-09-17-contextual-tips-never-fire.md`).
 *
 * Every test here mutates the world **in place** — no new object identity — and still
 * requires the tip to be reported. If detection ever goes back to holding a previous
 * world reference, these tests fail.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import {
  detectContextualTutorials,
  seedTutorialSeenForExistingState,
} from '../src/game/contextualTutorial';
import { Season } from '../src/game/gameTypes';
import type { WorldState } from '../src/game/gameTypes';

const FIXTURE_SEED = 20_260_917;

function freshWorld(): WorldState {
  const world = initGame({ villageName: 'Tips', size: 'medium', seed: FIXTURE_SEED });
  world.tutorialSeen = [];
  return world;
}

function detectedIds(world: WorldState): string[] {
  return detectContextualTutorials(world).map((tip) => tip.id);
}

describe('detectContextualTutorials reads the current state, not a previous world object', () => {
  it('reports a mechanic that becomes true while the world object is mutated in place', () => {
    const world = freshWorld();
    // A fresh colony starts in spring on a stable valley, so neither tip is due yet.
    expect(detectedIds(world)).not.toContain('first_winter');
    expect(detectedIds(world)).not.toContain('valley_strained');

    // In-place mutation — the same object identity the game loop keeps across ticks.
    world.season = Season.Winter;
    world.valleyStage = 'strained';

    const ids = detectedIds(world);
    expect(ids).toContain('first_winter');
    expect(ids).toContain('valley_strained');
  });

  it('suppresses a mechanic the player has already been shown', () => {
    const world = freshWorld();
    world.season = Season.Winter;
    expect(detectedIds(world)).toContain('first_winter');

    world.tutorialSeen = ['first_winter'];
    expect(detectedIds(world)).not.toContain('first_winter');
  });
});

describe('the load-time seeding and live detection share one definition of "has happened"', () => {
  it('seeds every mechanic already true, so loading a save never replays tips', () => {
    const world = freshWorld();
    world.season = Season.Winter;
    world.valleyStage = 'strained';
    world.ecosystemHealth = 10;
    world.resources.food = 0;

    // The fixture must actually exercise the derivation, or this test proves nothing.
    const beforeSeeding = detectedIds(world);
    for (const id of ['first_winter', 'valley_strained', 'ecosystem_low', 'low_food']) {
      expect(beforeSeeding).toContain(id);
    }

    world.tutorialSeen = seedTutorialSeenForExistingState(world);

    // Nothing but the day-one shelter nudge may survive seeding. This fails if a tip is
    // added to the detector's id list without a matching condition in the derivation.
    const afterSeeding = detectedIds(world);
    expect(afterSeeding.every((id) => id === 'shelter_night')).toBe(true);
  });
});
