/**
 * PERF2: the delta owns the geometry signal. Occupancy/staffing/progress edits change the building
 * fingerprint but not geometry, so the host can keep road-avoidance, adjacency and beauty caches.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/gameEngine';
import { BuildingType } from '../src/game/gameTypes';
import type { Building } from '../src/game/gameTypes';
import { extractSimTickDelta, type BuildingFingerprint } from '../src/game/simBuffers/simDelta';

function fixture(): { world: ReturnType<typeof initGame>; buildings: Building[] } {
  const world = initGame({ seed: 616 });
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
  } as unknown as Building);
  const buildings = [make(9101, 100), make(9102, 200)];
  world.buildings = buildings;
  return { world, buildings };
}

describe('building geometry signal', () => {
  it('separates geometry edits from occupancy edits for cache retention', () => {
    const { world, buildings } = fixture();
    const alive = world.entities.filter((e) => e.alive);
    const prevBuildings = new Map<number, BuildingFingerprint>();
    const prevGeometry = new Map<number, string>();

    const first = extractSimTickDelta(world, alive, {
      cloneMode: 'transfer',
      prevBuildings: new Map(),
      nextBuildings: prevBuildings,
      prevBuildingGeometry: new Map(),
      nextBuildingGeometry: prevGeometry,
    });
    expect(first.buildingGeometryChanged).toBe(true);

    const stable = extractSimTickDelta(world, alive, {
      cloneMode: 'transfer',
      prevBuildings,
      nextBuildings: new Map(prevBuildings),
      prevBuildingGeometry: prevGeometry,
      nextBuildingGeometry: new Map(prevGeometry),
    });
    expect(stable.buildingGeometryChanged).toBe(false);

    buildings[0].occupants = [7];
    const occupied = extractSimTickDelta(world, alive, {
      cloneMode: 'transfer',
      prevBuildings,
      nextBuildings: new Map(prevBuildings),
      prevBuildingGeometry: prevGeometry,
      nextBuildingGeometry: new Map(prevGeometry),
    });
    expect(occupied.changedBuildings?.map((building) => building.id)).toEqual([buildings[0].id]);
    expect(occupied.buildingGeometryChanged).toBe(false);

    buildings[0].x += 10;
    const moved = extractSimTickDelta(world, alive, {
      cloneMode: 'transfer',
      prevBuildings,
      nextBuildings: new Map(prevBuildings),
      prevBuildingGeometry: prevGeometry,
      nextBuildingGeometry: new Map(prevGeometry),
    });
    expect(moved.buildingGeometryChanged).toBe(true);

    world.buildings = [buildings[0]];
    const removed = extractSimTickDelta(world, alive, {
      cloneMode: 'transfer',
      prevBuildings,
      nextBuildings: new Map(prevBuildings),
      prevBuildingGeometry: prevGeometry,
      nextBuildingGeometry: new Map(prevGeometry),
    });
    expect(removed.removedBuildingIds).toContain(buildings[1].id);
    expect(removed.buildingGeometryChanged).toBe(true);
  });
});
