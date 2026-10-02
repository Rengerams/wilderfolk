/**
 * F5 — the placement ghost names **why** a spot is refused
 * (`docs/private/audits/2026-09-16/playability-gamefeel.md`, tracked in `LIVE-FINDINGS-STATUS.md`).
 *
 * The reason was always decided by the owner (`getPlaceBuildingFailureReason`), but the view stored
 * only the owner's boolean (`ViewState.buildGhost.valid`) and the renderer printed one fixed
 * `'✗ Blocked'` for every refusal. That reads as "the game will not let me build here" for the two
 * buildings whose rule is about the **whole footprint** — a Bridge must span actual river water and a
 * Fishing Spot must cover a water tile (`placementUtils.isFootprintOnBuildableTerrain`), so dragging
 * them along a dry bank gave no hint that water inside the footprint is the requirement.
 *
 * The split under test: the ghost carries the owner's *reason*, and the game layer turns a reason
 * into player-facing wording (`buildingPlacementLabels`). The canvas (`renderer/buildPreview.ts`) only
 * draws that string; vitest runs `environment: 'node'`, so the last test pins the three seams by
 * source instead of rendering them.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initGame } from '../src/game/worldGen';
import { getPlaceBuildingFailureReason, startBuilding } from '../src/game/buildingPlacementActions';
import { getBuildingFootprintForType } from '../src/game/buildingRotation';
import { createBuildGhost, createInitialView } from '../src/game/viewState';
import {
  PLACEMENT_FAILURE_LABELS,
  getPlaceBuildingFailureLabel,
  type PlaceBuildingFailureReason,
} from '../src/game/buildingPlacementLabels';
import { buildRenderSnapshot } from '../src/game/renderSnapshot';
import { rebakeTerrainGrids, setTileOverride, tileAt, worldToTile } from '../src/game/terrain/terrainGrid';
import {
  BUILDING_CONFIGS,
  BuildingType,
  PATH_CELL,
  TerrainType,
  type WorldState,
} from '../src/game/gameTypes';

const REASONS = Object.keys(PLACEMENT_FAILURE_LABELS) as PlaceBuildingFailureReason[];

/** Grass the tiles in a square, so the fixture has no terrain surprises. */
function flatten(world: WorldState, cx: number, cy: number, radius: number): void {
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
}

/** First flat, building-free placement point that the game's own rule accepts. */
function findSpot(world: WorldState, type: BuildingType): { x: number; y: number } {
  for (let gy = 200; gy < world.height - 200; gy += PATH_CELL * 4) {
    for (let gx = 200; gx < world.width - 200; gx += PATH_CELL * 4) {
      const x = Math.round(gx / PATH_CELL) * PATH_CELL;
      const y = Math.round(gy / PATH_CELL) * PATH_CELL;
      if (world.buildings.some((b) => Math.hypot(b.x - x, b.y - y) < 250)) continue;
      flatten(world, x, y, 120);
      if (getPlaceBuildingFailureReason(world, type, x, y, 0) === null) return { x, y };
    }
  }
  throw new Error('fixture: no legal placement point found');
}

/** Force the terrain type of the tile under a world pixel, through the override layer. */
function forceTileType(world: WorldState, px: number, py: number, type: TerrainType): void {
  expect(world.worldMap).toBeTruthy();
  const map = world.worldMap!;
  const { tx, ty } = worldToTile(px, py);
  const tile = tileAt(map, tx, ty);
  if (!tile) throw new Error('fixture: the probed tile is off the map');
  setTileOverride(map, tx, ty, { ...tile, type });
  rebakeTerrainGrids(map, { startTx: tx, endTx: tx, startTy: ty, endTy: ty });
}

/** Grant a building's tech the way a finished research does, so its terrain rule is reachable. */
function unlock(world: WorldState, type: BuildingType): void {
  const requirement = BUILDING_CONFIGS[type].unlockRequirement;
  if (!requirement) return;
  if (!world.unlockedTechs.includes(requirement)) world.unlockedTechs.push(requirement);
  for (const node of world.researchNodes) {
    if (node.id === requirement) node.researched = true;
  }
}

describe('F5 — the ghost carries the owner reason', () => {
  it('stores the reason beside `valid`, including a blocker away from the cursor tile', () => {
    const world = initGame();
    const spot = findSpot(world, BuildingType.Farm);
    expect(getPlaceBuildingFailureReason(world, BuildingType.Farm, spot.x, spot.y, 0)).toBeNull();

    // Water on the far edge of the footprint, not under the cursor: the rule that refuses this is a
    // whole-footprint rule, which is exactly what the old boolean could not say.
    const footprint = getBuildingFootprintForType(BuildingType.Farm, 0);
    const waterTileX = Math.ceil((spot.x + footprint.width / 2) / PATH_CELL) - 1;
    const waterTileY = Math.floor(spot.y / PATH_CELL);
    expect(waterTileX, 'the water tile must be a different tile from the cursor tile')
      .not.toBe(Math.floor(spot.x / PATH_CELL));
    forceTileType(world, waterTileX * PATH_CELL + 1, waterTileY * PATH_CELL + 1, TerrainType.DeepWater);

    const reason = getPlaceBuildingFailureReason(world, BuildingType.Farm, spot.x, spot.y, 0);
    expect(reason).toBe('terrain');

    const refused = createBuildGhost(spot.x, spot.y, reason);
    expect(refused.reason).toBe('terrain');
    expect(refused.valid).toBe(false);

    const accepted = createBuildGhost(spot.x, spot.y, null);
    expect(accepted.reason).toBeNull();
    expect(accepted.valid).toBe(true);
  });

  it('reports overlapping ground and the map edge as the same `blocked` reason', () => {
    const world = initGame();
    world.resources.wood = 500;
    const spot = findSpot(world, BuildingType.Farm);

    const placed = startBuilding(world, BuildingType.Farm, spot.x, spot.y, 0);
    expect(placed.buildings.some((b) => b.type === BuildingType.Farm)).toBe(true);

    // The owner returns `blocked` for both causes, so one label has to be true of both — a wording
    // that blamed a structure ("something is in the way") would be a lie at the map edge.
    const overlapReason = getPlaceBuildingFailureReason(placed, BuildingType.Farm, spot.x, spot.y, 0);
    const edgeReason = getPlaceBuildingFailureReason(world, BuildingType.Farm, 2, 2, 0);
    expect(overlapReason).toBe('blocked');
    expect(edgeReason).toBe('blocked');
    expect(getPlaceBuildingFailureLabel(BuildingType.Farm, overlapReason!))
      .toBe(getPlaceBuildingFailureLabel(BuildingType.Farm, edgeReason!));
    expect(createBuildGhost(spot.x, spot.y, overlapReason).reason).toBe('blocked');
  });

  it('survives the snapshot the canvas reads', () => {
    const world = initGame();
    const view = {
      ...createInitialView(world.width, world.height),
      buildMode: BuildingType.Farm,
      buildGhost: createBuildGhost(400, 400, 'terrain'),
    };
    const snapshot = buildRenderSnapshot(world, view);
    expect(snapshot.buildGhost?.reason).toBe('terrain');
    expect(snapshot.buildGhost?.valid).toBe(false);
  });
});

describe('F5 — the game layer words each reason', () => {
  it('maps every reason to a distinct, non-empty label', () => {
    const world = initGame();
    const labels = REASONS.map((reason) =>
      getPlaceBuildingFailureLabel(BuildingType.Farm, reason, world.researchNodes),
    );
    for (const [index, label] of labels.entries()) {
      expect(label, `${REASONS[index]} has a label`).toBeTruthy();
      expect(label.length, `${REASONS[index]} label is not blank`).toBeGreaterThan(0);
    }
    expect(new Set(labels).size, 'every reason reads differently').toBe(REASONS.length);
  });

  it('names the water rule inside the footprint for Bridge and Fishing Spot', () => {
    const world = initGame();
    // One flat spot refuses both water buildings, and for the same reason — the footprint holds no
    // water — which is precisely the refusal the old fixed string could not explain.
    const spot = findSpot(world, BuildingType.Farm);

    const fishingReason = getPlaceBuildingFailureReason(world, BuildingType.FishingSpot, spot.x, spot.y, 0);
    expect(fishingReason, 'dry ground must refuse a dock').toBe('terrain');
    const fishingLabel = getPlaceBuildingFailureLabel(BuildingType.FishingSpot, fishingReason!);

    unlock(world, BuildingType.Bridge);
    const bridgeReason = getPlaceBuildingFailureReason(world, BuildingType.Bridge, spot.x, spot.y, 0);
    expect(bridgeReason, 'dry ground must refuse a bridge').toBe('terrain');
    const bridgeLabel = getPlaceBuildingFailureLabel(BuildingType.Bridge, bridgeReason!);

    // The two water buildings must not read like ordinary unbuildable ground.
    const genericLabel = getPlaceBuildingFailureLabel(BuildingType.Farm, 'terrain');
    expect(bridgeLabel).toMatch(/river/i);
    expect(fishingLabel).toMatch(/water/i);
    expect(bridgeLabel).not.toBe(genericLabel);
    expect(fishingLabel).not.toBe(genericLabel);
    expect(bridgeLabel).not.toBe(fishingLabel);
  });

  it('names the tech a research refusal is waiting on', () => {
    const world = initGame();
    const requirement = BUILDING_CONFIGS[BuildingType.Bridge].unlockRequirement!;
    // A fresh colony has not researched the bridge tech, so this is the reason the ghost carries.
    expect(world.unlockedTechs).not.toContain(requirement);
    const reason = getPlaceBuildingFailureReason(world, BuildingType.Bridge, 400, 400, 0);
    expect(reason).toBe('research');

    const node = world.researchNodes.find((candidate) => candidate.id === requirement);
    expect(node, 'the fixture must know the tech the bridge waits on').toBeDefined();
    expect(getPlaceBuildingFailureLabel(BuildingType.Bridge, reason!, world.researchNodes))
      .toContain(node!.name);
  });
});

describe('F5 — the wiring', () => {
  it('derives the ghost from the owner and renders the label instead of a fixed string', () => {
    const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

    const canvas = read('src/hooks/useCanvasInteractions.ts');
    expect(canvas, 'the hover ghost must ask the owner for the reason')
      .toContain('getPlaceBuildingFailureReason');
    expect(canvas, 'the hover ghost must be built by the one constructor')
      .toContain('createBuildGhost(');

    const app = read('src/App.tsx');
    expect(app, 'rotating the ghost must re-derive the reason')
      .toContain('getPlaceBuildingFailureReason');

    const preview = read('src/game/renderer/buildPreview.ts');
    expect(preview, 'the renderer must ask the game layer for the label')
      .toContain('getPlaceBuildingFailureLabel(');
    expect(preview, 'the fixed refusal string must be gone').not.toContain('✗ Blocked');
  });
});
