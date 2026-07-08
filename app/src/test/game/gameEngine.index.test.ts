import { describe, expect, it } from 'vitest';
import { buildEntityByType, buildEntityDrawBuckets } from '@/game/gameEngine';
import { createEntity } from '@/game/worldGen';
import { EntityType, getRenderEntityLayer } from '@/game/gameTypes';

describe('getRenderEntityLayer', () => {
  it('maps entity types to canvas draw layers', () => {
    expect(getRenderEntityLayer(EntityType.Grass)).toBe('grass');
    expect(getRenderEntityLayer(EntityType.Tree)).toBe('tree');
    expect(getRenderEntityLayer(EntityType.Human)).toBe('human');
    expect(getRenderEntityLayer(EntityType.Wolf)).toBe('animal');
    expect(getRenderEntityLayer(EntityType.Werewolf)).toBe('animal');
  });
});

describe('buildEntityByType', () => {
  it('buckets only alive entities by type', () => {
    const alive = createEntity(EntityType.Deer, 0, 0, 1, 250);
    const dead = createEntity(EntityType.Rabbit, 0, 0, 2, 250);
    dead.alive = false;
    const byType = buildEntityByType([alive, dead]);
    expect(byType[EntityType.Deer]).toHaveLength(1);
    expect(byType[EntityType.Rabbit]).toHaveLength(0);
  });

  it('separates humans and werewolves after type change', () => {
    const human = createEntity(EntityType.Human, 0, 0, 1, 250);
    const wolf = createEntity(EntityType.Wolf, 0, 0, 2, 250);
    human.type = EntityType.Werewolf;
    const byType = buildEntityByType([human, wolf]);
    expect(byType[EntityType.Werewolf]).toHaveLength(1);
    expect(byType[EntityType.Human]).toHaveLength(0);
    expect(byType[EntityType.Wolf]).toHaveLength(1);
  });
});

describe('buildEntityDrawBuckets', () => {
  it('builds y-sorted draw lists from type buckets without scanning unrelated types', () => {
    const Y_GRASS = 5;
    const Y_TREE_NEAR = 10;
    const Y_HUMAN = 20;
    const Y_RABBIT = 30;
    const Y_TREE_FAR = 40;
    const TEST_SPAWN_ENERGY = 250;

    const treeFar = createEntity(EntityType.Tree, 0, Y_TREE_FAR, 1, TEST_SPAWN_ENERGY);
    const treeNear = createEntity(EntityType.Tree, 0, Y_TREE_NEAR, 2, TEST_SPAWN_ENERGY);
    const rabbit = createEntity(EntityType.Rabbit, 0, Y_RABBIT, 3, TEST_SPAWN_ENERGY);
    const human = createEntity(EntityType.Human, 0, Y_HUMAN, 4, TEST_SPAWN_ENERGY);
    const grass = createEntity(EntityType.Grass, 0, Y_GRASS, 5, TEST_SPAWN_ENERGY);
    const byType = buildEntityByType([treeFar, treeNear, rabbit, human, grass]);
    const buckets = buildEntityDrawBuckets(byType);

    expect(buckets.trees.map((e) => e.id)).toEqual([2, 1]);
    expect(buckets.humans.map((e) => e.id)).toEqual([4]);
    expect(buckets.animals.map((e) => e.id)).toEqual([3]);
    expect(buckets.trees).not.toContain(grass);
  });
});