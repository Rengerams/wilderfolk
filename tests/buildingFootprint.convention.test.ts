/**
 * `building.x/y` is the footprint centre, and `clearTreesUnderFootprint` clears exactly
 * the drawn pad, not a corner-anchored rectangle.
 */
import { describe, it, expect } from 'vitest';
import { initGame } from '../src/game/worldGen';
import {
  getPlaceBuildingFailureReason,
  startBuilding,
} from '../src/game/buildingPlacementActions';
import {
  getBuildingFootprintForType,
  isEntityOnBuilding,
} from '../src/game/buildingRotation';
import { getBuildingCenter, getBuildingFootprintRect } from '../src/game/placementUtils';
import { createEntity } from '../src/game/entityFactory';
import { rebakeTerrainGrids, setTileOverride, tileAt, worldToTile } from '../src/game/terrain/terrainGrid';
import {
  buildHuntTargetByPreyIndex,
  clearHuntersTargetingPrey,
} from '../src/game/simulation/simulationEntities';
import {
  BuildingType,
  EntityType,
  TerrainType,
  PATH_CELL,
  type Building,
  type Entity,
  type WorldState,
} from '../src/game/gameTypes';

type Rect = { left: number; right: number; top: number; bottom: number };

const contains = (rect: Rect, px: number, py: number): boolean =>
  px >= rect.left && px < rect.right && py >= rect.top && py < rect.bottom;

/** Corner-anchored rectangle, kept only as the legacy comparison fixture. */
function cornerRect(x: number, y: number, width: number, height: number): Rect {
  return { left: x, right: x + width, top: y, bottom: y + height };
}

/** Grass the tiles and fell the trees in a square, so the fixture has no terrain surprises. */
function flatten(world: WorldState, cx: number, cy: number, radius: number): void {
  // The whole test is about placed ground, so the fixture must have generated a map.
  expect(world.worldMap).toBeTruthy();
  const map = world.worldMap!;
  const startTx = Math.max(0, Math.floor((cx - radius) / PATH_CELL));
  const endTx = Math.min(map.width, Math.ceil((cx + radius) / PATH_CELL));
  const startTy = Math.max(0, Math.floor((cy - radius) / PATH_CELL));
  const endTy = Math.min(map.height, Math.ceil((cy + radius) / PATH_CELL));
  for (let ty = startTy; ty < endTy; ty++) {
    for (let tx = startTx; tx < endTx; tx++) {
      const tile = tileAt(map, tx, ty);
      if (tile) setTileOverride(map, tx, ty, { ...tile, type: TerrainType.Grassland });
    }
  }
  rebakeTerrainGrids(map, { startTx, endTx, startTy, endTy });
  for (const entity of world.entities) {
    if (entity.type !== EntityType.Tree) continue;
    if (Math.abs(entity.x - cx) <= radius && Math.abs(entity.y - cy) <= radius) entity.alive = false;
  }
}

/** First flat, building-free placement point that the game's own rule accepts. */
function findSpot(world: WorldState): { x: number; y: number } {
  for (let gy = 200; gy < world.height - 200; gy += PATH_CELL * 4) {
    for (let gx = 200; gx < world.width - 200; gx += PATH_CELL * 4) {
      const x = Math.round(gx / PATH_CELL) * PATH_CELL;
      const y = Math.round(gy / PATH_CELL) * PATH_CELL;
      if (world.buildings.some((b) => Math.hypot(b.x - x, b.y - y) < 250)) continue;
      flatten(world, x, y, 120);
      if (getPlaceBuildingFailureReason(world, BuildingType.Farm, x, y, 0) === null) return { x, y };
    }
  }
  throw new Error('fixture: no legal placement point found');
}

describe('building.x/y is the footprint centre — the cleared ground is the drawn pad', () => {
  it('clears the trees and forest inside the pad, and leaves the ones beside the building', () => {
    const world = initGame();
    world.resources.wood = 500;
    const { x, y } = findSpot(world);
    const footprint = getBuildingFootprintForType(BuildingType.Farm, 0);

    // Probes where the pad and the corner rectangle disagree: −20 is pad-inside,
    // 40 is pad-outside but corner-rect-inside.
    const insideOffset = -20;
    const outsideOffset = 40;

    const forestAt = (px: number, py: number) => {
      const { tx, ty } = worldToTile(px, py);
      setTileOverride(world.worldMap!, tx, ty, {
        type: TerrainType.Forest, elevation: 30, moisture: 50, variation: 0,
      });
    };

    forestAt(x + insideOffset, y);
    forestAt(x + outsideOffset, y);

    const treeInside = createEntity(
      EntityType.Tree, x + insideOffset, y, world.nextEntityId++,
    );
    const treeOutside = createEntity(
      EntityType.Tree, x + outsideOffset, y, world.nextEntityId++,
    );
    const treeCentre = createEntity(EntityType.Tree, x, y, world.nextEntityId++);
    world.entities.push(treeInside, treeOutside, treeCentre);

    const placed = startBuilding(world, BuildingType.Farm, x, y, 0);
    const farm = placed.buildings.find((b) => b.type === BuildingType.Farm && b.x === x && b.y === y);
    expect(farm, 'the fixture spot must accept the Farm').toBeDefined();

    // `startBuilding` works on a clone, so the survivors must be read from the placed world.
    const after = (original: { id: number }) => placed.entities.find((e) => e.id === original.id)!;
    const placedTile = (px: number, py: number) => {
      expect(placed.worldMap).toBeTruthy();
      const map = placed.worldMap!;
      const { tx, ty } = worldToTile(px, py);
      return tileAt(map, tx, ty);
    };

    // The drawn pad is the owner's rect, and the owner's rect is centred on the stored point.
    const drawn = getBuildingFootprintRect(farm!);
    expect(getBuildingCenter(farm!)).toEqual({ x, y });
    expect(drawn).toEqual({
      left: x - footprint.width / 2,
      right: x + footprint.width / 2,
      top: y - footprint.height / 2,
      bottom: y + footprint.height / 2,
    });

    // The corner rect misses `treeInside` and covers `treeOutside`, so both assertions keep
    // this test discriminating.
    const legacy = cornerRect(x, y, footprint.width, footprint.height);
    expect(contains(legacy, treeInside.x, treeInside.y), 'old rect missed the tree in the pad').toBe(false);
    expect(contains(legacy, treeOutside.x, treeOutside.y), 'old rect covered the tree beside it').toBe(true);

    // The consequence the player sees.
    expect(contains(drawn, treeInside.x, treeInside.y)).toBe(true);
    expect(after(treeInside).alive, 'a tree inside the drawn pad must be felled').toBe(false);
    expect(after(treeCentre).alive, 'a tree at the centre must be felled').toBe(false);
    expect(after(treeOutside).alive, 'a tree beside the building must survive').toBe(true);

    expect(placedTile(x + insideOffset, y)!.type).toBe(TerrainType.Grassland);
    expect(placedTile(x + outsideOffset, y)!.type).toBe(TerrainType.Forest);
  });

  it('clears exactly up to the pad edge, not up to the corner rect edge', () => {
    const world = initGame();
    world.resources.wood = 500;
    const { x, y } = findSpot(world);
    const footprint = getBuildingFootprintForType(BuildingType.Farm, 0);
    const halfWidth = footprint.width / 2;

    const justInside = createEntity(EntityType.Tree, x - halfWidth + 1, y, world.nextEntityId++);
    const justOutside = createEntity(EntityType.Tree, x - halfWidth - 1, y, world.nextEntityId++);
    const farEast = createEntity(
      EntityType.Tree, x + halfWidth + 1, y, world.nextEntityId++,
    );
    world.entities.push(justInside, justOutside, farEast);

    const placed = startBuilding(world, BuildingType.Farm, x, y, 0);
    expect(placed.buildings.some((b) => b.type === BuildingType.Farm && b.x === x && b.y === y)).toBe(true);

    // `startBuilding` works on a clone — read the survivors from the placed world.
    const after = (original: { id: number }) => placed.entities.find((e) => e.id === original.id)!;
    expect(after(justInside).alive, '1 px inside the pad edge is still the pad').toBe(false);
    expect(after(justOutside).alive, '1 px outside the pad edge is not the pad').toBe(true);
    expect(after(farEast).alive, 'the pad ends half a footprint east of the stored point').toBe(true);
  });
});

/** A completed Farm at a known point — 53 × 46, so the pad's half extents are 26.5 × 23. */
function farmAt(x: number, y: number): Building {
  return {
    id: 1,
    type: BuildingType.Farm,
    x,
    y,
    ...getBuildingFootprintForType(BuildingType.Farm, 0),
    occupants: [],
    level: 1,
    constructionProgress: 100,
    completed: true,
    health: 100,
    maxHealth: 100,
    spriteScale: 1,
    buildAnimTimer: 0,
  };
}

/**
 * `isEntityOnBuilding` reads `placementUtils.getBuildingFootprintRect`, the owner of the
 * centre convention, padded outwards by `margin`.
 */
describe('X-6 — isEntityOnBuilding reads the footprint centre, not the corner', () => {
  const X = 400;
  const Y = 300;
  const farm = farmAt(X, Y);
  const rect = getBuildingFootprintRect(farm);
  const halfWidth = rect.right - farm.x;
  const halfHeight = rect.bottom - farm.y;

  it('accepts the stored point and the pad’s west half', () => {
    expect(farm.width, 'fixture: the Farm is the 53 × 46 case').toBe(53);
    expect(farm.height).toBe(46);
    expect(rect).toEqual({
      left: X - halfWidth,
      right: X + halfWidth,
      top: Y - halfHeight,
      bottom: Y + halfHeight,
    });
    expect(isEntityOnBuilding(X, Y, farm)).toBe(true);
    // 20 px west of the stored point is inside the pad (|−20| < 26.5) and outside the corner rect.
    expect(isEntityOnBuilding(X - 20, Y, farm)).toBe(true);
  });

  it('rejects ground south-east of the pad that the corner rect wrongly accepted', () => {
    // 40 px south-east of the centre: outside the pad (40 > 26.5), inside the corner rect.
    expect(isEntityOnBuilding(X + 40, Y + 40, farm)).toBe(false);
  });

  it('treats the margin as an outward pad around the true footprint', () => {
    // 11 px beyond the west/north footprint edge is still inside the default 12 px pad.
    expect(isEntityOnBuilding(X - halfWidth - 11, Y - halfHeight - 11, farm)).toBe(true);
    // 13 px beyond it is not.
    expect(isEntityOnBuilding(X - halfWidth - 13, Y - halfHeight - 13, farm)).toBe(false);
    // The padded edge stays inclusive.
    expect(isEntityOnBuilding(rect.right + 12, Y, farm)).toBe(true);
    expect(isEntityOnBuilding(rect.right + 12.5, Y, farm)).toBe(false);
    // A caller-supplied margin is still an outward pad, not a replacement footprint.
    expect(isEntityOnBuilding(X + halfWidth + 3, Y, farm, 4)).toBe(true);
    expect(isEntityOnBuilding(X + halfWidth + 3, Y, farm, 2)).toBe(false);
  });
});

/**
 * `clearHuntersTargetingPrey` sweeps the four hunter-capable buckets the caller passes, so
 * a hunter that acquires the prey mid-tick still drops its dangling target.
 */
describe('N-1 — a hunter that acquired the prey mid-pulse still drops a dangling target', () => {
  it('clears a hunter absent from the tick-start index but present in the tick buckets', () => {
    const preyId = 7;
    const indexed = createEntity(EntityType.Wolf, 100, 100, 1);
    const midPulse = createEntity(EntityType.Wolf, 120, 100, 2);
    indexed.huntTargetId = preyId;

    const byType: Partial<Record<EntityType, Entity[]>> = {
      [EntityType.Wolf]: [indexed, midPulse],
    };
    // The index `gameTick` builds once at tick start, before this pulse's acquisition.
    const index = buildHuntTargetByPreyIndex(byType);
    expect(index.get(preyId)).toEqual(new Set([indexed.id]));

    midPulse.huntTargetId = preyId; // acquired later in the same pulse

    const entityById = new Map<number, typeof indexed>([
      [indexed.id, indexed],
      [midPulse.id, midPulse],
    ]);
    clearHuntersTargetingPrey(preyId, entityById, index, byType);

    expect(indexed.huntTargetId).toBeUndefined();
    expect(midPulse.huntTargetId, 'a mid-pulse hunter must not keep a dangling target').toBeUndefined();
    expect(index.has(preyId), 'the spent index entry is dropped').toBe(false);
  });
});
