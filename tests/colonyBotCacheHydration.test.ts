import { describe, expect, it } from 'vitest';
import { MapSize, EntityType } from '../src/game/gameTypes';
import { getCachedEntityByType } from '../src/game/entityTypeCache';
import { ensureEntityByIdMap } from '../src/game/entityIndex';
import { decideVirtualPlayerAction } from '../src/game/virtualPlayer';
import { prepareColonyWorld, applyColonyBotAction } from '../scripts/colonyHealth';

describe('seeded colony bot world adoption', () => {
  it('refreshes entity caches after a cloned worker command replaces the world', () => {
    const world = prepareColonyWorld({
      size: MapSize.Medium, seed: 12345, scenario: 'producers',
    }).world;
    const originalEntities = world.entities;
    const originalHuman = world.entities.find((entity) => entity.type === EntityType.Human && entity.alive)!;
    const firstBuckets = getCachedEntityByType(world, world.entities.filter((entity) => entity.alive));
    expect(firstBuckets[EntityType.Human]).toContain(originalHuman);
    const decision = decideVirtualPlayerAction(world);
    expect(decision?.command.op).toBe('startBuilding');

    expect(applyColonyBotAction(world)).toBe('startBuilding');
    expect(world.entities).not.toBe(originalEntities);

    const currentHuman = world.entities.find((entity) => entity.id === originalHuman.id)!;
    expect(currentHuman).not.toBe(originalHuman);
    const after = getCachedEntityByType(world, world.entities.filter((entity) => entity.alive));
    expect(after[EntityType.Human].find((entity) => entity.id === currentHuman.id)).toBe(currentHuman);
    expect(ensureEntityByIdMap(world).get(currentHuman.id)).toBe(currentHuman);
  });
});
