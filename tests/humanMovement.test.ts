import { describe, expect, it } from 'vitest';
import { commutePathCacheKey, homeStandPosition, nearestActiveMoonHowler } from '../src/game/simulation/humanMovement';
import { commutePathCacheKey as legacyCommutePathCacheKey } from '../src/game/humanMovement';
import { EntityType } from '../src/game/gameTypes';
import { isActiveMoonHowler } from '../src/game/moonHowler';
import type { Building, Entity } from '../src/game/gameTypes';

const building = {
  id: 7,
  x: 100,
  y: 80,
  width: 40,
  height: 30,
} as Building;

function werewolf(id: number, x: number, y: number, active: boolean): Entity {
  return {
    id,
    type: EntityType.Werewolf,
    x,
    y,
    alive: true,
    moonHowlerCursed: active,
  } as Entity;
}

describe('human movement helpers', () => {
  it('keeps commute cache keys stable within a terrain tile', () => {
    const first = commutePathCacheKey(building.id, false, 101, 81);
    const sameTile = commutePathCacheKey(building.id, false, 109, 89);
    const nextTile = commutePathCacheKey(building.id, false, 111, 81);

    expect(first).toBe(sameTile);
    expect(nextTile).not.toBe(first);
    expect(commutePathCacheKey(building.id, true, 101, 81)).not.toBe(first);
  });

  it('keeps the legacy movement import path delegated to the authoritative owner', () => {
    expect(legacyCommutePathCacheKey(building.id, false, 101, 81)).toBe(
      commutePathCacheKey(building.id, false, 101, 81),
    );
  });

  it('keeps home stand positions deterministic per resident and building', () => {
    expect(homeStandPosition(building, 3)).toEqual(homeStandPosition(building, 3));
    expect(homeStandPosition(building, 3)).not.toEqual(homeStandPosition(building, 4));
  });

  it('returns only the nearest active living Moon Howler', () => {
    const target = { id: 1, type: EntityType.Human, x: 0, y: 0, alive: true } as Entity;
    const inactive = werewolf(2, 10, 0, false);
    const activeFar = werewolf(3, 30, 0, true);
    const activeNear = werewolf(4, 5, 0, true);
    const deadNear = { ...werewolf(5, 2, 0, true), alive: false } as Entity;

    expect(isActiveMoonHowler(activeNear)).toBe(true);
    expect(nearestActiveMoonHowler(target, [inactive, activeFar, activeNear, deadNear])?.id).toBe(4);
  });
});
