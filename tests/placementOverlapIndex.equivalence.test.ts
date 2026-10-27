/**
 * R-7 of the 2026-09-21 audit — the build-grid overlap index.
 *
 * `canPlaceBuildingSnapshot` runs once per candidate cell on the build lattice, and each call used to
 * scan every building (`overlapsAnyBuilding`) — O(cells × buildings) per repaint while panning in build
 * mode. It now checks overlap against a cached spatial index. That is only safe if the index is
 * exactly equivalent to the linear scan, so this file asserts the two agree across a lattice of
 * candidate placements around a densely populated village, including placements that touch building
 * edges and cell boundaries.
 */
import { describe, expect, it } from 'vitest';
import {
  BUILDING_CONFIGS,
  BuildingType,
  type Building,
  type WorldState,
} from '../src/game/gameTypes';
import { initGame } from '../src/game/worldGen';
import { buildRenderSnapshot } from '../src/game/renderSnapshot';
import { createInitialView } from '../src/game/viewState';
import {
  canPlaceBuildingSnapshot,
  isBuildingTechUnlocked,
  isFootprintOnBuildableTerrain,
  isFootprintWithinMapBounds,
  overlapsAnyBuilding,
} from '../src/game/placementUtils';
import { getBuildingFootprintForType } from '../src/game/buildingRotation';
import type { RenderSnapshot } from '../src/game/renderSnapshot';
import { finishedBuilding } from '../src/test/factories';

/** A deterministic reference for `canPlaceBuildingSnapshot` with the overlap check done linearly. */
function canPlaceReference(
  snapshot: RenderSnapshot,
  type: BuildingType,
  x: number,
  y: number,
  rotation: 0 | 90 | 180 | 270 = 0,
): boolean {
  const config = BUILDING_CONFIGS[type];
  const { width, height } = getBuildingFootprintForType(type, rotation);
  if (!isFootprintWithinMapBounds(width, height, x, y, snapshot.width, snapshot.height)) return false;
  if (
    config.unlockRequirement
    && !isBuildingTechUnlocked(config.unlockRequirement, snapshot.unlockedTechs, snapshot.researchNodes)
  ) {
    return false;
  }
  if (config.unique && snapshot.buildings.some((b) => b.type === type)) return false;
  if (!isFootprintOnBuildableTerrain(snapshot, width, height, x, y, type)) return false;
  if (overlapsAnyBuilding(snapshot.buildings, width, height, x, y)) return false;
  return true;
}

/** A village with buildings scattered densely enough to exercise multi-building cells. */
function snapshotWithBuildings(buildings: Building[]): RenderSnapshot {
  const world = initGame({ villageName: 'Index', seed: 20261001 }) as WorldState;
  world.buildings = buildings;
  return buildRenderSnapshot(world, createInitialView(world.width, world.height));
}

describe('the build-grid overlap index agrees with the linear scan (R-7)', () => {
  it('matches across a lattice around a dense village', () => {
    // A 9×9 grid of small buildings (40 wu apart) puts several in a 64 wu occupancy cell, and leaves
    // clear lanes plus tight gaps between them.
    const buildings: Building[] = [];
    let id = 1;
    for (let gx = 0; gx < 9; gx++) {
      for (let gy = 0; gy < 9; gy++) {
        buildings.push(
          finishedBuilding(id++, BuildingType.House, {
            x: 200 + gx * 40,
            y: 200 + gy * 40,
            width: 16,
            height: 16,
          }),
        );
      }
    }
    const snapshot = snapshotWithBuildings(buildings);

    // Sweep candidates at a step that is deliberately not a divisor of the occupancy cell (64), so the
    // query rectangles hit cell interiors and boundaries.
    let comparisons = 0;
    for (let x = 150; x < 620; x += 7) {
      for (let y = 150; y < 620; y += 7) {
        const indexed = canPlaceBuildingSnapshot(snapshot, BuildingType.Farm, x, y, 0);
        const reference = canPlaceReference(snapshot, BuildingType.Farm, x, y, 0);
        expect(indexed, `index mismatch at (${x}, ${y})`).toBe(reference);
        comparisons++;
      }
    }
    expect(comparisons).toBeGreaterThan(1000);
  });

  it('matches edge-touching placements exactly (strict inequality preserved)', () => {
    const house = finishedBuilding(1, BuildingType.House, { x: 300, y: 300, width: 20, height: 20 });
    const snapshot = snapshotWithBuildings([house]);
    const farm = getBuildingFootprintForType(BuildingType.Farm, 0);

    // A farm whose left edge exactly meets the house's right edge does NOT overlap.
    const touchingX = house.x + house.width / 2 + farm.width / 2;
    expect(canPlaceBuildingSnapshot(snapshot, BuildingType.Farm, touchingX, house.y, 0)).toBe(
      canPlaceReference(snapshot, BuildingType.Farm, touchingX, house.y, 0),
    );
    // A hair inside does.
    expect(canPlaceBuildingSnapshot(snapshot, BuildingType.Farm, touchingX - 0.5, house.y, 0)).toBe(
      canPlaceReference(snapshot, BuildingType.Farm, touchingX - 0.5, house.y, 0),
    );
  });

  it('matches for a rotated footprint', () => {
    const buildings = [finishedBuilding(1, BuildingType.Store, { x: 400, y: 400, width: 24, height: 24 })];
    const snapshot = snapshotWithBuildings(buildings);
    for (let x = 340; x < 460; x += 5) {
      for (let y = 340; y < 460; y += 5) {
        // Placement rotation is only 0/90 (`buildingRotation.BuildingRotation`); 180/270 are the
        // strip-corner orientation in `buildings.ts`, a different axis.
        for (const rot of [0, 90] as const) {
          expect(canPlaceBuildingSnapshot(snapshot, BuildingType.Workshop, x, y, rot)).toBe(
            canPlaceReference(snapshot, BuildingType.Workshop, x, y, rot),
          );
        }
      }
    }
  });
});
