/**
 * Trees and grass are static decor: the per-tick delta ships them once (or when the roster changes)
 * and the replica keeps them, so a large colony stops paying for hundreds of unchanged prop rows.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/gameEngine';
import { EntityType } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import { createEntity } from '../src/game/worldGen';
import { applySimTickDelta, extractSimTickDelta, splitStaticProps } from '../src/game/simBuffers/simDelta';

function worldWithProps(): { world: WorldState; humans: Entity[]; props: Entity[] } {
  const world = initGame({ seed: 4242 });
  const humans = Array.from({ length: 3 }, (_, i) =>
    createEntity(EntityType.Human, 1000 + i * 8, 1000, 100 + i, 300));
  const props = [
    ...Array.from({ length: 30 }, (_, i) => createEntity(EntityType.Grass, 1000 + i * 5, 900, 200 + i, 100)),
    ...Array.from({ length: 10 }, (_, i) => createEntity(EntityType.Tree, 1100 + i * 5, 900, 300 + i, 250)),
  ];
  for (const entity of [...humans, ...props]) entity.alive = true;
  world.entities = [...props, ...humans];
  return { world, humans, props };
}

describe('static prop delta', () => {
  it('ships props once, keeps them on the replica, and reports roster changes', () => {
    const { world, props } = worldWithProps();
    const replica = structuredClone(world);
    const sent = new Set<number>();

    const first = extractSimTickDelta(world, world.entities.filter((e) => e.alive));
    splitStaticProps(first, sent);
    expect(first.aliveEntities).toHaveLength(3);
    expect(first.staticEntities).toHaveLength(props.length);
    applySimTickDelta(replica, first);
    expect(replica.entities.filter((e) => e.type === EntityType.Tree).length).toBe(10);

    const second = extractSimTickDelta(world, world.entities.filter((e) => e.alive));
    splitStaticProps(second, sent);
    expect(second.staticEntities).toBeUndefined();
    expect(second.removedStaticEntityIds).toBeUndefined();
    applySimTickDelta(replica, second);
    expect(replica.entities.filter((e) => e.type === EntityType.Tree).length).toBe(10);
    expect(replica.entities.filter((e) => e.type === EntityType.Grass).length).toBe(30);

    const felled = props.find((entity) => entity.type === EntityType.Tree)!;
    felled.alive = false;
    const third = extractSimTickDelta(world, world.entities.filter((e) => e.alive));
    splitStaticProps(third, sent);
    expect(third.removedStaticEntityIds).toEqual([felled.id]);
    applySimTickDelta(replica, third);
    expect(replica.entities.some((entity) => entity.id === felled.id)).toBe(false);

    const sapling = createEntity(EntityType.Grass, 1300, 900, 400, 100);
    sapling.alive = true;
    world.entities.push(sapling);
    const fourth = extractSimTickDelta(world, world.entities.filter((e) => e.alive));
    splitStaticProps(fourth, sent);
    expect(fourth.staticEntities?.map((entity) => entity.id)).toEqual([sapling.id]);
    applySimTickDelta(replica, fourth);
    expect(replica.entities.some((entity) => entity.id === sapling.id)).toBe(true);
  });

  it('ships no static prop rows once the replica is in step', () => {
    const { world, props } = worldWithProps();
    const sent = new Set<number>();
    const first = extractSimTickDelta(world, world.entities.filter((e) => e.alive));
    splitStaticProps(first, sent);
    expect(first.staticEntities).toHaveLength(props.length);

    const second = extractSimTickDelta(world, world.entities.filter((e) => e.alive));
    splitStaticProps(second, sent);
    expect(second.staticEntities).toBeUndefined();
    expect(second.removedStaticEntityIds).toBeUndefined();
    expect(second.aliveEntities.every((entity) =>
      entity.type !== EntityType.Tree && entity.type !== EntityType.Grass)).toBe(true);
  });
});
