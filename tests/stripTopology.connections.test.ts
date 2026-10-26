import { describe, expect, it } from 'vitest';
import { BuildingType } from '../src/game/gameTypes';
import type { Building, WorldState } from '../src/game/gameTypes';
import { getBuildingFootprintForType } from '../src/game/buildingRotation';
import { buildStripPlanFromDrag, buildStripPlanFromStroke, collectStripDemolitionIds, resolveRoadStripPlan, resolveWallStripPlan } from '../src/game/stripTopology';

function strip(type: typeof BuildingType.Road | typeof BuildingType.Wall, rotation: 0 | 90): Building {
  const { width, height } = getBuildingFootprintForType(type, rotation);
  return {
    id: 10, type, x: 0, y: 0, width, height, rotation,
    occupants: [], level: 1, constructionProgress: 100, completed: true,
    health: 100, maxHealth: 100, spriteScale: 1, buildAnimTimer: 0,
  } as Building;
}

const stateWith = (building: Building): WorldState => ({ buildings: [building] }) as WorldState;
const origin = [{ x: 0, y: 0 }];

describe('connected strip planning', () => {
  it('does not place a duplicate road when the player retraces an existing piece', () => {
    expect(resolveRoadStripPlan(stateWith(strip(BuildingType.Road, 0)), origin, 0)).toEqual([]);
  });

  it('keeps the perpendicular road at an existing road junction', () => {
    const pieces = resolveRoadStripPlan(stateWith(strip(BuildingType.Road, 0)), origin, 90);
    expect(pieces).toHaveLength(1);
    expect(pieces[0]).toMatchObject({ type: BuildingType.Road, x: 0, y: 0, rotation: 90 });
  });

  it('keeps a perpendicular wall at a corner or crossing', () => {
    const pieces = resolveWallStripPlan(stateWith(strip(BuildingType.Wall, 0)), BuildingType.Wall, origin, 90);
    expect(pieces).toHaveLength(1);
    expect(pieces[0]).toMatchObject({ type: BuildingType.Wall, x: 0, y: 0, rotation: 90 });
  });

  it('aligns replacement gates with older off-grid wall coordinates', () => {
    const wall = strip(BuildingType.Wall, 0);
    wall.x = 14;
    const pieces = resolveWallStripPlan(stateWith(wall), BuildingType.WallGate, origin, 0);
    expect(pieces).toHaveLength(1);
    expect(pieces[0]).toMatchObject({ x: 14, y: 0, rotation: 0, replacesBuildingId: 10 });
  });

  it('builds an L-shaped path with both horizontal and vertical pieces', () => {
    const empty = { buildings: [], width: 800, height: 800 } as unknown as WorldState;
    const { plan } = buildStripPlanFromDrag(empty, BuildingType.Road, 100, 100, 300, 300, 0);
    expect(plan.some((piece) => piece.rotation === 0)).toBe(true);
    expect(plan.some((piece) => piece.rotation === 90)).toBe(true);
    expect(plan.length).toBeGreaterThan(3);
  });

  it('preserves successive freehand turns in one road placement stroke', () => {
    const state = { buildings: [], width: 900, height: 900 } as unknown as WorldState;
    const points = [
      { x: 120, y: 120 }, { x: 200, y: 120 },
      { x: 280, y: 120 }, { x: 280, y: 220 },
      { x: 280, y: 340 }, { x: 400, y: 340 },
    ];
    const result = buildStripPlanFromStroke(state, BuildingType.Road, points);
    expect(result.plan.some((segment) => segment.rotation === 0)).toBe(true);
    expect(result.plan.some((segment) => segment.rotation === 90)).toBe(true);
    expect(result.plan.filter((segment) => segment.rotation === 0).length).toBeGreaterThan(2);
    expect(result.plan.length).toBeGreaterThan(5);
    const distinct = new Set(result.plan.map((segment) => `${segment.x}:${segment.y}:${segment.rotation}`));
    expect(distinct.size).toBe(result.plan.length);
  });

  it('keeps freehand placement bounded for large mouse traces', () => {
    const state = { buildings: [], width: 2500, height: 2500 } as unknown as WorldState;
    const points = Array.from({ length: 200 }, (_, index) => ({
      x: 120 + index * 12, y: 120 + (index % 20) * 12,
    }));
    expect(buildStripPlanFromStroke(state, BuildingType.Road, points).plan.length).toBeLessThanOrEqual(72);
  });

  it('selects only player roads touched by a demolition drag', () => {
    const road = strip(BuildingType.Road, 0);
    const wall = { ...strip(BuildingType.Wall, 0), id: 11 };
    const rivalRoad = { ...road, id: 12, faction: 'rival' as const };
    expect(collectStripDemolitionIds([road, wall, rivalRoad], BuildingType.Road, -2, -2, 2, 2))
      .toEqual([10]);
  });

  it('preserves the existing wall-to-gate replacement behavior', () => {
    const pieces = resolveWallStripPlan(stateWith(strip(BuildingType.Wall, 0)), BuildingType.WallGate, origin, 0);
    expect(pieces).toHaveLength(1);
    expect(pieces[0].replacesBuildingId).toBe(10);
  });
});
