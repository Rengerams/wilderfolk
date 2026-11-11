/**
 * The rollback snapshot shares each entity's `friendships` / `feuds` / `feudPeaks` records rather
 * than cloning them, which is sound only while every writer uses copy-on-write.
 */
import { describe, expect, it } from 'vitest';
import { gameTick, initGame } from '../src/game/gameEngine';
import { EntityType, MapSize } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import { extractSimPrep, applySimPrep } from '../src/game/simWorker/simPrep';
import {
  advanceSocialRelationships,
  hurtFriendship,
  reconcileCloseFriendships,
  startFeud,
} from '../src/game/relationships';
import { playerHumansFrom } from '../src/game/playerHuman';
import { createEntity } from '../src/game/worldGen';

type SnapshotRecords = Array<{ id: number; friendships: string; feuds: string; feudPeaks: string }>;

function records(entities: readonly Entity[]): SnapshotRecords {
  return entities.map((entity) => ({
    id: entity.id,
    friendships: JSON.stringify(entity.friendships ?? null),
    feuds: JSON.stringify(entity.feuds ?? null),
    feudPeaks: JSON.stringify(entity.feudPeaks ?? null),
  }));
}

function seedRelationships(world: WorldState): Entity[] {
  const people = playerHumansFrom(world.entities).slice(0, 3);
  while (people.length < 3) {
    const id = world.nextEntityId ?? world.entities.length;
    const person = createEntity(EntityType.Human, world.width / 2 + people.length * 12, world.height / 2, id, 250);
    world.entities.push(person);
    world.nextEntityId = id + 1;
    people.push(person);
  }
  startFeud(world, people[0], people[1], 40);
  hurtFriendship(people[0], people[2], 10);
  advanceSocialRelationships(world, world.entities);
  return people;
}

describe('rollback relationships are copy-on-write', () => {
  it('keeps the snapshot records pristine through every social mutator', () => {
    const world = initGame({ size: MapSize.Medium, seed: 777 });
    const people = seedRelationships(world);
    const prep = extractSimPrep(world);
    const before = records(prep.entities);

    startFeud(world, people[1], people[2], 30);
    hurtFriendship(people[1], people[0], 5);
    advanceSocialRelationships(world, world.entities);
    reconcileCloseFriendships(playerHumansFrom(world.entities));

    expect(records(prep.entities), 'a writer mutated the snapshot record in place').toEqual(before);

    applySimPrep(world, prep);
    expect(records(world.entities)).toEqual(before);
  });

  it('keeps the snapshot records pristine across a real day of social ticks', () => {
    const world = initGame({ size: MapSize.Medium, seed: 778 });
    seedRelationships(world);
    const prep = extractSimPrep(world);
    const before = records(prep.entities);

    for (let i = 0; i < 288; i++) gameTick(world);

    expect(records(prep.entities), 'a tick mutated the snapshot record in place').toEqual(before);
  });
});
