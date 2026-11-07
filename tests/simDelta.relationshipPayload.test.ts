/**
 * The entity payload ships relationship maps only when a settler's revision changed, and the replica
 * sparse-merges them; this pins both the elision and the parity.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/gameEngine';
import { EntityType } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import { createEntity } from '../src/game/worldGen';
import { hurtFriendship } from '../src/game/relationships';
import { RELATIONSHIP_REVISION, revisionOf } from '../src/game/entityRevision';
import { applySimTickDelta, extractSimTickDelta, stripUnchangedRelationships } from '../src/game/simBuffers/simDelta';

function colony(size: number): { world: WorldState; people: Entity[] } {
  const world = initGame({ seed: 909 });
  const people = Array.from({ length: size }, (_, i) =>
    createEntity(EntityType.Human, 1000 + (i % 20) * 8, 1000 + Math.floor(i / 20) * 8, 200 + i, 300));
  for (const person of people) {
    person.alive = true;
    person.friendships = {};
    for (let f = 1; f <= 10; f++) {
      person.friendships[`friend_${200 + ((person.id + f) % size)}`] = 70;
    }
  }
  world.entities = people;
  return { world, people };
}

function revisions(world: WorldState): Map<number, number> {
  return new Map(world.entities.map((entity) => [entity.id, revisionOf(entity, RELATIONSHIP_REVISION)]));
}

describe('relationship payload elision', () => {
  it('ships the maps once, then keeps the replica in step through changes', () => {
    const { world, people } = colony(12);
    const replica = structuredClone(world);
    const sent = new Map<number, number>();

    const first = extractSimTickDelta(world, world.entities.filter((e) => e.alive));
    stripUnchangedRelationships(first, revisions(world), sent);
    expect(first.aliveEntities.some((entity) => entity.friendships !== undefined)).toBe(true);
    applySimTickDelta(replica, first);

    const second = extractSimTickDelta(world, world.entities.filter((e) => e.alive));
    stripUnchangedRelationships(second, revisions(world), sent);
    expect(second.aliveEntities.every((entity) => entity.friendships === undefined)).toBe(true);
    applySimTickDelta(replica, second);

    hurtFriendship(people[0], people[1], 10);
    const third = extractSimTickDelta(world, world.entities.filter((e) => e.alive));
    stripUnchangedRelationships(third, revisions(world), sent);
    const withFriends = third.aliveEntities.filter((entity) => entity.friendships !== undefined);
    expect(withFriends.map((entity) => entity.id).sort()).toEqual([people[0].id, people[1].id].sort());
    applySimTickDelta(replica, third);

    for (const source of people) {
      const mirror = replica.entities.find((entity) => entity.id === source.id);
      expect(mirror?.friendships).toEqual(source.friendships);
    }
  });

  it('ships no relationship bytes once the replica is in step', () => {
    const { world } = colony(300);
    const sent = new Map<number, number>();
    const first = extractSimTickDelta(world, world.entities.filter((e) => e.alive));
    stripUnchangedRelationships(first, revisions(world), sent);
    const firstRelationshipBytes = first.aliveEntities.reduce((sum, entity) =>
      sum + Buffer.byteLength(JSON.stringify(entity.friendships ?? null))
      + Buffer.byteLength(JSON.stringify(entity.feuds ?? null))
      + Buffer.byteLength(JSON.stringify(entity.feudPeaks ?? null)), 0);
    expect(firstRelationshipBytes).toBeGreaterThan(0);

    const second = extractSimTickDelta(world, world.entities.filter((e) => e.alive));
    stripUnchangedRelationships(second, revisions(world), sent);
    const secondRelationshipBytes = second.aliveEntities.reduce((sum, entity) =>
      sum + (entity.friendships === undefined ? 0 : 1)
      + (entity.feuds === undefined ? 0 : 1)
      + (entity.feudPeaks === undefined ? 0 : 1), 0);
    expect(secondRelationshipBytes).toBe(0);
  });
});
