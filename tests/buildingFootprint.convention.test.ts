/**
 * The `building.x/y` convention, pinned where the player can see it.
 *
 * The decisive question (`LIVE-FINDINGS-STATUS.md`, "Other" — the two-families row) is whether the
 * stored point is the footprint's **centre** or its **top-left corner**. The player-visible family
 * answers "centre" and all of its seams agree: the pad and sprite are drawn from `x - w/2`
 * (`spriteDrawing.drawBuildingPad` / `drawBuildingSprite` → `drawSpriteFrame(anchorX = 0.5)`), every
 * strip is filled from `translate(sx, sy)` into `[-w/2, +w/2]` (`stripRender.beginRotatedStripFrame`),
 * the placement ghost's footprint rectangle is stroked around the ghost point
 * (`renderer/buildPreview.ts`), and the bounds / terrain / overlap checks all validate `x ± w/2`
 * (`isFootprintWithinMapBounds`, `isFootprintOnBuildableTerrain`, `overlapsAnyBuilding`).
 *
 * `clearTreesUnderFootprint` was the one seam that read the *corner* — it cleared
 * `x … x + width` / `y … y + height` — so the ground it cleared was a rectangle moved half a
 * footprint to the south-east of the pad that is drawn: a tree standing inside the pad survived
 * (inside the building), while a tree beside the building was felled for no reason. This test places
 * a real building at a known point through `startBuilding` and asserts the cleared ground is exactly
 * the drawn pad.
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

/** The rectangle `clearTreesUnderFootprint` read before the fix: corner-anchored. */
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

    // Probes, chosen so the two candidate rectangles disagree about them:
    //   insideOffset  ∈ drawn pad (|−20| < w/2 = 26.5), OUTSIDE the old corner rect (west of x)
    //   outsideOffset ∈ outside the drawn pad (40 > 26.5), INSIDE the old corner rect (40 < 53)
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

    // Pre-fix, the cleared rectangle was the corner rect: it could not have covered `treeInside`
    // and it did cover `treeOutside`. Pinning both keeps this test discriminating.
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
 * X-6 / PARKED-1 — `isEntityOnBuilding` was the last reader on the corner convention.
 *
 * It tested `x - margin … x + width + margin`, which for a Farm at `(X, Y)` accepted
 * `[X−12, X+65] × [Y−12, Y+58]` while the pad the player sees is `[X−26.5, X+26.5] × [Y−23, Y+23]`:
 * it believed ground up to 13.5 px *outside* the pad was inside it and missed the whole west/north
 * half. That is how a settler could be spawned inside a house (`isValidHumanSpawnPosition` →
 * `isInsideCompletedBuilding` → here). The function now reads `placementUtils.getBuildingFootprintRect`,
 * the owner of the convention, padded outwards by `margin`.
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
    // 20 px west of the stored point is inside the pad (|−20| < 26.5) and outside the corner rect —
    // the probe that was false before the fix.
    expect(isEntityOnBuilding(X - 20, Y, farm)).toBe(true);
  });

  it('rejects ground south-east of the pad that the corner rect wrongly accepted', () => {
    // 40 px south-east of the centre: outside the pad (40 > 26.5), inside the old corner rect.
    expect(isEntityOnBuilding(X + 40, Y + 40, farm)).toBe(false);
  });

  it('treats the margin as an outward pad around the true footprint', () => {
    // 11 px beyond the west/north footprint edge is still inside the default 12 px pad.
    expect(isEntityOnBuilding(X - halfWidth - 11, Y - halfHeight - 11, farm)).toBe(true);
    // 13 px beyond it is not.
    expect(isEntityOnBuilding(X - halfWidth - 13, Y - halfHeight - 13, farm)).toBe(false);
    // The padded edge stays inclusive, exactly as the corner form's `>=`/`<=` were.
    expect(isEntityOnBuilding(rect.right + 12, Y, farm)).toBe(true);
    expect(isEntityOnBuilding(rect.right + 12.5, Y, farm)).toBe(false);
    // A caller-supplied margin is still an outward pad, not a replacement footprint.
    expect(isEntityOnBuilding(X + halfWidth + 3, Y, farm, 4)).toBe(true);
    expect(isEntityOnBuilding(X + halfWidth + 3, Y, farm, 2)).toBe(false);
  });
});

/**
 * N-1 — `clearHuntersTargetingPrey` used to sweep *every* living entity per kill (grass and trees
 * included). It now sweeps the four hunter-capable buckets the caller hands it. The guarantee that
 * motivated the sweep must survive: the index is built once at tick start, so a hunter that acquires
 * this prey **later in the same tick** is absent from it and would otherwise keep a `huntTargetId`
 * pointing at a removed entity.
 *
 * It lives in this file because this lane owns it; the hunting-suite files belong to other lanes.
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
