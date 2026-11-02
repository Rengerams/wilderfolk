/**
 * PERF1 completion: profile fields (skills, traits, career, childhood bonds) are read by the display
 * but written rarely, so they ship on change with a bounded refresh — never every tick.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/gameEngine';
import { EntityType, JobType } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import { createEntity } from '../src/game/worldGen';
import { writableEntitySkills } from '../src/game/skills';
import { PROFILE_REVISION, revisionOf } from '../src/game/entityRevision';
import {
  PROFILE_REFRESH_TICKS,
  applySimTickDelta,
  extractSimTickDelta,
  stripUnchangedProfile,
} from '../src/game/simBuffers/simDelta';

function fixture(): { world: WorldState; people: Entity[] } {
  const world = initGame({ seed: 707 });
  const people = Array.from({ length: 3 }, (_, i) =>
    createEntity(EntityType.Human, 1000 + i * 8, 1000, 100 + i, 300));
  for (const person of people) {
    person.alive = true;
    person.traits = [];
  }
  world.entities = people;
  return { world, people };
}

function revisions(world: WorldState): Map<number, number> {
  return new Map(world.entities.map((entity) => [entity.id, revisionOf(entity, PROFILE_REVISION)]));
}

describe('entity profile payload', () => {
  it('ships profile fields once, omits them while unchanged, and reships on a change', () => {
    const { world, people } = fixture();
    const replica = structuredClone(world);
    const sent = new Map<number, { revision: number; tick: number }>();

    const first = extractSimTickDelta(world, world.entities.filter((e) => e.alive));
    stripUnchangedProfile(first, revisions(world), sent, 1);
    expect(first.aliveEntities.every((entity) => entity.skills !== undefined)).toBe(true);
    expect(first.aliveEntities.every((entity) => entity.traits !== undefined)).toBe(true);
    applySimTickDelta(replica, first);

    const second = extractSimTickDelta(world, world.entities.filter((e) => e.alive));
    stripUnchangedProfile(second, revisions(world), sent, 2);
    expect(second.aliveEntities.every((entity) => entity.skills === undefined)).toBe(true);
    expect(second.aliveEntities.every((entity) => entity.traits === undefined)).toBe(true);
    applySimTickDelta(replica, second);

    writableEntitySkills(people[1])[JobType.Farmer] = 12;
    const third = extractSimTickDelta(world, world.entities.filter((e) => e.alive));
    stripUnchangedProfile(third, revisions(world), sent, 3);
    const withProfile = third.aliveEntities.filter((entity) => entity.skills !== undefined);
    expect(withProfile.map((entity) => entity.id)).toEqual([people[1].id]);
    applySimTickDelta(replica, third);
    for (const person of people) {
      const mirror = replica.entities.find((entity) => entity.id === person.id);
      expect(mirror?.skills).toEqual(person.skills);
      expect(mirror?.traits).toEqual(person.traits);
    }

    const refreshed = extractSimTickDelta(world, world.entities.filter((e) => e.alive));
    stripUnchangedProfile(refreshed, revisions(world), sent, 3 + PROFILE_REFRESH_TICKS);
    expect(refreshed.aliveEntities.every((entity) => entity.skills !== undefined)).toBe(true);
  });
});
