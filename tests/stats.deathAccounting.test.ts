/**
 * Tick death accounting classifies by ownership before the visual entity type, and records a
 * settler's age when the death commits instead of only sampling survivors at year end.
 */
import { describe, expect, it } from 'vitest';
import { createEmptyLifetimeStats, tallyTickDeaths } from '../src/game/stats';
import { EntityType } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';

function world(): WorldState {
  return {
    lifetimeStats: createEmptyLifetimeStats(),
    deathsThisYear: { humans: 0, animals: 0 },
  } as unknown as WorldState;
}

function dead(overrides: Partial<Entity>): Entity {
  return {
    id: 1,
    name: 'Ada',
    surname: 'Whitfield',
    age: 88,
    alive: false,
    type: EntityType.Human,
    x: 0,
    y: 0,
    ...overrides,
  } as Entity;
}

describe('tick death accounting', () => {
  it('counts a cursed settler dying in wolf form as a human, not an animal', () => {
    const state = world();
    tallyTickDeaths(state, [
      dead({
        type: EntityType.Werewolf,
        moonHowlerCursed: true,
        moonHowlerSaved: {} as Entity['moonHowlerSaved'],
      }),
    ]);
    expect(state.deathsThisYear).toEqual({ humans: 1, animals: 0 });
  });

  it('leaves visitor and rival deaths out of both tallies', () => {
    const state = world();
    tallyTickDeaths(state, [
      dead({ faction: 'visitor' }),
      dead({ id: 2, faction: 'rival' }),
    ]);
    expect(state.deathsThisYear).toEqual({ humans: 0, animals: 0 });
  });

  it('counts wildlife but ignores trees and grass', () => {
    const state = world();
    tallyTickDeaths(state, [
      dead({ id: 1, type: EntityType.Wolf }),
      dead({ id: 2, type: EntityType.Tree }),
      dead({ id: 3, type: EntityType.Grass }),
    ]);
    expect(state.deathsThisYear).toEqual({ humans: 0, animals: 1 });
  });

  it('records the age of an elder who died before year end', () => {
    const state = world();
    tallyTickDeaths(state, [dead({ age: 88 })]);
    expect(state.lifetimeStats.longestLivingHuman).toEqual({ name: 'Ada Whitfield', age: 88 });
  });

  it('keeps the older record when a younger settler dies', () => {
    const state = world();
    state.lifetimeStats.longestLivingHuman = { name: 'Old Tom', age: 91 };
    tallyTickDeaths(state, [dead({ age: 40 })]);
    expect(state.lifetimeStats.longestLivingHuman).toEqual({ name: 'Old Tom', age: 91 });
  });
});
