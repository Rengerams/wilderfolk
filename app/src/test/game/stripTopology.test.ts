import { describe, expect, it } from 'vitest';
import { initGame } from '@/game/gameEngine';
import { canPlaceBuilding, placeStripChain } from '@/game/buildingActions';
import { snapBuildingCenter } from '@/game/buildingRotation';
import { BUILDING_CONFIGS, BuildingType } from '@/game/gameTypes';
import { createBuilding } from '@/game/worldGen';
import {
  buildStripPlanFromDrag,
  resolveRoadStripPlan,
  resolveWallStripPlan,
  snapStripDragEndpoints,
} from '@/game/stripTopology';

describe('stripTopology', () => {
  it('snaps drag endpoints to nearby strip endpoints', () => {
    const state = initGame();
    const road = createBuilding(BuildingType.Road, 120, 200, 50, 0);
    road.completed = true;
    state.buildings.push(road);

    const snapped = snapStripDragEndpoints(state.buildings, BuildingType.Road, 125, 200, 300, 200);
    expect(Math.abs(snapped.startX - 150)).toBeLessThan(45);
  });

  it('places a corner when a new vertical strip crosses a horizontal wall', () => {
    const state = initGame();
    const wall = createBuilding(BuildingType.Wall, 120, 192, 1, 0);
    wall.completed = true;
    state.buildings.push(wall);

    const plan = resolveWallStripPlan(
      state,
      BuildingType.Wall,
      [{ x: 120, y: 192 }],
      90,
    );
    expect(plan.some((p) => p.type === BuildingType.WallCorner)).toBe(true);
  });

  it('buildStripPlanFromDrag resolves corners on perpendicular wall drags', () => {
    const state = initGame();
    const wall = createBuilding(BuildingType.Wall, 180, 192, 1, 0);
    wall.completed = true;
    state.buildings.push(wall);

    const { plan } = buildStripPlanFromDrag(
      state,
      BuildingType.Wall,
      180,
      132,
      180,
      252,
      90,
    );
    expect(plan.some((p) => p.type === BuildingType.WallCorner)).toBe(true);
  });

  it('tags road tee junctions when a vertical strip crosses a horizontal road', () => {
    const state = initGame();
    const road = createBuilding(BuildingType.Road, 120, 200, 1, 0);
    road.completed = true;
    state.buildings.push(road);

    const plan = resolveRoadStripPlan(
      state,
      [{ x: 120, y: 200 }],
      90,
    );
    const junction = plan.find((p) => p.junctionInfo?.kind === 'tee' || p.junctionInfo?.kind === 'elbow');
    expect(junction).toBeDefined();
  });

  it('upgrades an elbow corner to a tee when a third arm is added', () => {
    const state = initGame();
    state.unlockedTechs.push('defense_1');
    const wallWest = createBuilding(BuildingType.Wall, 60, 192, 1, 0);
    wallWest.completed = true;
    const wallEast = createBuilding(BuildingType.Wall, 180, 192, 2, 0);
    wallEast.completed = true;
    const corner = createBuilding(BuildingType.WallCorner, 120, 192, 3, 0);
    corner.completed = true;
    state.buildings.push(wallWest, wallEast, corner);

    const plan = resolveWallStripPlan(
      state,
      BuildingType.Wall,
      [{ x: 120, y: 192 }, { x: 120, y: 232 }],
      90,
    );
    const piece = plan.find((p) => p.type === BuildingType.WallCorner && p.replacesBuildingId === corner.id);
    expect(piece?.junctionInfo?.kind).toBe('tee');
  });

  it('refunds half the wall cost when a corner replaces a straight segment', () => {
    const state = initGame();
    state.unlockedTechs.push('defense_1');
    const defense1 = state.researchNodes.find((n) => n.id === 'defense_1');
    if (defense1) {
      defense1.unlocked = true;
      defense1.researched = true;
    }
    state.resources.wood = 500;
    state.resources.stone = 500;
    let cx = 0;
    let cy = 0;
    let found = false;
    const step = 40;
    for (let y = step; y < state.height - step && !found; y += step) {
      for (let x = step; x < state.width - step; x += step) {
        if (
          canPlaceBuilding(state, BuildingType.Wall, x, y, 0)
          && canPlaceBuilding(state, BuildingType.WallCorner, x, y, 0)
        ) {
          cx = x;
          cy = y;
          found = true;
          break;
        }
      }
    }
    expect(found).toBe(true);
    const cornerSnap = snapBuildingCenter(BuildingType.WallCorner, cx, cy, 0);
    const wall = createBuilding(BuildingType.Wall, cornerSnap.x, cornerSnap.y, 1, 0);
    wall.completed = true;
    state.buildings.push(wall);

    const woodBefore = state.resources.wood;
    const segments = [{
      x: cornerSnap.x,
      y: cornerSnap.y,
      placeType: BuildingType.WallCorner,
      rotation: 0 as const,
      replacesBuildingId: wall.id,
      valid: true,
    }];
    const after = placeStripChain(state, BuildingType.Wall, segments, 90);
    const refund = Math.floor(BUILDING_CONFIGS[BuildingType.Wall].cost.wood * 0.5);
    const cornerCost = BUILDING_CONFIGS[BuildingType.WallCorner].cost.wood;
    expect(after.resources.wood).toBe(woodBefore - cornerCost + refund);
  });
});