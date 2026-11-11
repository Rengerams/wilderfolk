/**
 * The close-friend cap (`MAX_CLOSE_FRIENDS_PER_SETTLER`) holds for new play and for saves that
 * predate it: load clamps to the strongest mutual bonds, and the cap holds over a long social run.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/gameEngine';
import { EntityType } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import { createEntity } from '../src/game/worldGen';
import {
  MAX_CLOSE_FRIENDS_PER_SETTLER,
  advanceSocialRelationships,
  friendCount,
  reconcileCloseFriendships,
} from '../src/game/relationships';
import { setSimSeed } from '../src/game/simRng';
import { parseSaveJson, loadGameFromParsed, buildSaveData } from '../src/game/saveLoad';
import { createInitialView } from '../src/game/viewState';

const friendKey = (id: number) => `friend_${id}`;

function settlers(world: WorldState, size: number): Entity[] {
  const people = Array.from({ length: size }, (_, i) =>
    createEntity(EntityType.Human, 1000 + i * 6, 1000, 100 + i, 300));
  for (const person of people) {
    person.alive = true;
    person.workerBuildingId = 1;
  }
  world.entities = people;
  return people;
}

function allCloseFriends(people: Entity[], score: number): void {
  for (const person of people) {
    person.friendships = {};
    for (const other of people) {
      if (other.id !== person.id) person.friendships[friendKey(other.id)] = score;
    }
  }
}

describe('close-friend cap', () => {
  it('clamps a settler carrying more than the cap to the six strongest mutual bonds', () => {
    const world = initGame({ skipTerrain: true, seed: 321 });
    const people = settlers(world, 12);
    allCloseFriends(people, 80);

    reconcileCloseFriendships(people);

    for (const person of people) {
      expect(friendCount(person)).toBeLessThanOrEqual(MAX_CLOSE_FRIENDS_PER_SETTLER);
    }
  });

  it('clamps an over-cap legacy save during load', () => {
    const world = initGame({ skipTerrain: true, seed: 322 });
    const people = settlers(world, 10);
    allCloseFriends(people, 90);
    const json = JSON.stringify(buildSaveData(world, createInitialView(world.width, world.height)));
    const parsed = parseSaveJson(json);
    if (!parsed.valid) throw new Error('fixture save was refused');
    const loaded = loadGameFromParsed(parsed.parsed);
    if (!loaded) throw new Error('fixture load failed');

    const humans = loaded.world.entities.filter((entity) => entity.type === EntityType.Human);
    for (const human of humans) {
      expect(friendCount(human)).toBeLessThanOrEqual(MAX_CLOSE_FRIENDS_PER_SETTLER);
    }
  });

  it('never grows past the cap over a long social run', () => {
    setSimSeed(7);
    const world = initGame({ skipTerrain: true, seed: 323 });
    const people = settlers(world, 16);
    for (let day = 0; day < 400; day++) advanceSocialRelationships(world, world.entities);

    for (const person of people) {
      expect(friendCount(person)).toBeLessThanOrEqual(MAX_CLOSE_FRIENDS_PER_SETTLER);
    }
  });
});
