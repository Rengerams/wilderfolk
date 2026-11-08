/**
 * PERF5 decision: keep the building fingerprint until every mutable writer is revision-covered.
 * Measured at ~0.9 ms/tick for 1,059 buildings, so this pins the diff behaviour instead.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/gameEngine';
import { BuildingType } from '../src/game/gameTypes';
import type { Building } from '../src/game/gameTypes';
import { extractSimTickDelta, type BuildingFingerprint } from '../src/game/simBuffers/simDelta';

function worldWithBuildings(): { world: ReturnType<typeof initGame>; buildings: Building[] } {
  const world = initGame({ seed: 515 });
  const make = (id: number, x: number): Building => ({
    id,
    type: BuildingType.House,
    x,
    y: 600,
    width: 40,
    height: 40,
    rotation: 0,
    completed: true,
    faction: 'player',
    occupants: [],
    progress: 0,
    storage: { wood: 0, stone: 0, food: 0, gold: 0, iron: 0 },
  } as unknown as Building);
  const buildings = [make(9001, 100), make(9002, 200), make(9003, 300)];
  world.buildings = buildings;
  return { world, buildings };
}

describe('building delta fingerprint', () => {
  it('ships the full set once, nothing when unchanged, and only the changed rows after', () => {
    const { world, buildings } = worldWithBuildings();
    const alive = world.entities.filter((e) => e.alive);

    const first = extractSimTickDelta(world, alive, { cloneMode: 'transfer' });
    expect(first.buildings).toHaveLength(buildings.length);

    const prev = new Map<number, BuildingFingerprint>();
    const initial = extractSimTickDelta(world, alive, {
      cloneMode: 'transfer',
      prevBuildings: new Map(),
      nextBuildings: prev,
    });
    expect(initial.changedBuildings).toHaveLength(buildings.length);

    const stable = extractSimTickDelta(world, alive, {
      cloneMode: 'transfer',
      prevBuildings: prev,
      nextBuildings: new Map(prev),
    });
    expect(stable.changedBuildings).toEqual([]);
    expect(stable.buildings).toBeUndefined();

    buildings[1].occupants = [42];
    const changed = extractSimTickDelta(world, alive, {
      cloneMode: 'transfer',
      prevBuildings: prev,
      nextBuildings: new Map(prev),
    });
    expect(changed.changedBuildings?.map((building) => building.id)).toEqual([buildings[1].id]);

    world.buildings = [buildings[0], buildings[2]];
    const removed = extractSimTickDelta(world, alive, {
      cloneMode: 'transfer',
      prevBuildings: prev,
      nextBuildings: new Map(prev),
    });
    expect(removed.removedBuildingIds).toContain(buildings[1].id);
  });
});
