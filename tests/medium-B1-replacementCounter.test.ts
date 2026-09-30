/**
 * Audit B-1 + E-5 — the Wall→Gate strip replacement must answer the same way a plain demolition does.
 *
 * B-1: `placeStripChain` removed the replaced Wall without touching `totalBuildingsCompleted`, so the
 * denormalized counter the Village tab, the Statistics panel and the population-snapshot cache key read
 * drifted one above the load-time recompute (`saveLoad.ts` line ~588) for the rest of the session.
 * E-5: the refund used a raw `+=`, so replacing a Wall while the wood store was full credited wood the
 * store could not hold and permanently desynchronised `storageMax`.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { BUILDING_CONFIGS, BuildingType, MapSize } from '../src/game/gameTypes';
import type { Building, WorldState } from '../src/game/gameTypes';
import { getBuildingFootprintForType } from '../src/game/buildingRotation';
import { getPlaceBuildingFailureReason, placeStripChain } from '../src/game/buildingPlacementActions';
import type { StripSegment } from '../src/game/stripBuild';

/** The load-time oracle for the counter (`saveLoad.ts`), restated here as the test's expectation. */
function completedPlayerBuildings(world: WorldState): number {
  return world.buildings.filter((b) => b.completed && b.faction !== 'rival').length;
}

/** A spot where a Wall and the Gate that replaces it both pass the placement owner's own checks. */
function findReplacementSpot(world: WorldState): { x: number; y: number } {
  for (let y = 40; y < world.height - 40; y += 20) {
    for (let x = 40; x < world.width - 40; x += 20) {
      if (getPlaceBuildingFailureReason(world, BuildingType.Wall, x, y, 0) != null) continue;
      if (getPlaceBuildingFailureReason(world, BuildingType.WallGate, x, y, 0) != null) continue;
      return { x, y };
    }
  }
  throw new Error('no buildable Wall→Gate spot in this world');
}

/** A real world holding one completed player Wall that a Gate run can land on. */
function worldWithCompletedWall(seed: number): { world: WorldState; wall: Building } {
  const world = initGame({ size: MapSize.Medium, seed });
  world.unlockedTechs = [...world.unlockedTechs, 'defense_1'];
  world.researchNodes = world.researchNodes.map((node) =>
    node.id === 'defense_1' ? { ...node, researched: true } : node,
  );

  const spot = findReplacementSpot(world);
  const footprint = getBuildingFootprintForType(BuildingType.Wall, 0);
  const wall: Building = {
    id: world.nextBuildingId++,
    type: BuildingType.Wall,
    x: spot.x,
    y: spot.y,
    width: footprint.width,
    height: footprint.height,
    occupants: [],
    level: 1,
    constructionProgress: 100,
    completed: true,
    health: 100,
    maxHealth: 100,
    spriteScale: 1,
    buildAnimTimer: 0,
  } as Building;

  world.buildings.push(wall);
  world.totalBuildingsCompleted = completedPlayerBuildings(world);
  return { world, wall };
}

function gateSegmentReplacing(wall: Building): StripSegment {
  return {
    x: wall.x,
    y: wall.y,
    valid: true,
    placeType: BuildingType.WallGate,
    rotation: 0,
    replacesBuildingId: wall.id,
  };
}

describe('Wall→Gate replacement bookkeeping (B-1)', () => {
  it('leaves totalBuildingsCompleted equal to the load-time recompute, not inflated by one', () => {
    const { world, wall } = worldWithCompletedWall(20260920);
    const before = completedPlayerBuildings(world);

    const next = placeStripChain(world, BuildingType.WallGate, [gateSegmentReplacing(wall)], 0);

    expect(next.buildings.some((b) => b.id === wall.id)).toBe(false);
    expect(next.buildings.some((b) => b.type === BuildingType.WallGate)).toBe(true);
    // One completed building left, one incomplete gate arrived.
    expect(next.totalBuildingsCompleted).toBe(before - 1);
    expect(next.totalBuildingsCompleted).toBe(completedPlayerBuildings(next));
  });
});

describe('replacement refund respects the storage cap (E-5)', () => {
  it('credits nothing when the wood store is already full', () => {
    const { world, wall } = worldWithCompletedWall(20260921);
    const cap = world.storageMax.wood;
    world.resources.wood = cap;

    const next = placeStripChain(world, BuildingType.WallGate, [gateSegmentReplacing(wall)], 0);

    expect(next.resources.wood).toBeLessThanOrEqual(cap);
    // No headroom at refund time, so the accepted refund is 0: only the gate's own cost is paid.
    expect(next.resources.wood).toBe(cap - BUILDING_CONFIGS[BuildingType.WallGate].cost.wood);
  });

  it('still credits the half refund when the store has room', () => {
    const { world, wall } = worldWithCompletedWall(20260922);
    world.resources.wood = 100;

    const next = placeStripChain(world, BuildingType.WallGate, [gateSegmentReplacing(wall)], 0);

    const refund = Math.floor(BUILDING_CONFIGS[BuildingType.Wall].cost.wood * 0.5);
    expect(next.resources.wood).toBe(100 + refund - BUILDING_CONFIGS[BuildingType.WallGate].cost.wood);
  });
});
