import { describe, expect, it } from 'vitest';
import { EntityType } from '@/game/gameTypes';
import { createEntity } from '@/game/worldGen';
import { EntityCatalog, resolveAliveHumans } from '@/game/entityCatalog';
import { buildEntityByType } from '@/game/gameEngine';
import type { WorldState } from '@/game/gameTypes';
import { isPlayerHuman } from '@/game/groupEvents';

describe('EntityCatalog', () => {
  it('indexes alive entities by id', () => {
    const catalog = new EntityCatalog();
    const human = createEntity(EntityType.Human, 0, 0, 1, 250);
    const deer = createEntity(EntityType.Deer, 10, 10, 2, 200);
    catalog.rebuild([human, deer]);
    expect(catalog.get(1)?.type).toBe(EntityType.Human);
    expect(catalog.getPlayerHumans()).toHaveLength(1);
    expect(catalog.getAliveByType(EntityType.Deer)).toHaveLength(1);
  });

  it('reuses a single alive index for getAlive and getAliveByType', () => {
    const catalog = new EntityCatalog();
    const human = createEntity(EntityType.Human, 0, 0, 1, 250);
    const deer = createEntity(EntityType.Deer, 10, 10, 2, 200);
    const wolf = createEntity(EntityType.Wolf, 20, 20, 3, 200);
    catalog.rebuild([human, deer, wolf]);

    expect(catalog.getAlive()).toHaveLength(3);
    expect(catalog.getAliveByType(EntityType.Deer)).toHaveLength(1);
    expect(catalog.getEntityByType()[EntityType.Wolf]).toHaveLength(1);
    expect(catalog.getAliveByType(EntityType.Human)[0].id).toBe(1);
  });

  it('applies tick delta births and deaths', () => {
    const catalog = new EntityCatalog();
    const human = createEntity(EntityType.Human, 0, 0, 1, 250);
    catalog.rebuild([human]);

    const child = createEntity(EntityType.Human, 1, 1, 2, 250);
    child.isJuvenile = true;
    catalog.applyTickDelta({
      diedIds: [],
      newEntities: [child],
      catalogEntities: [human, child],
    });
    expect(catalog.get(2)?.isJuvenile).toBe(true);

    catalog.applyTickDelta({ diedIds: [1], newEntities: [], catalogEntities: [child] });
    expect(catalog.get(1)).toBeUndefined();
    expect(catalog.getPlayerHumans().every(isPlayerHuman)).toBe(true);
  });
});

describe('resolveAliveHumans', () => {
  it('prefers world.entityByType over scanning entities', () => {
    const human = createEntity(EntityType.Human, 0, 0, 1, 250);
    const deer = createEntity(EntityType.Deer, 0, 0, 2, 200);
    const world = {
      entities: [human, deer],
      entityByType: buildEntityByType([human, deer]),
    } as WorldState;

    expect(resolveAliveHumans(world)).toEqual([human]);
  });
});