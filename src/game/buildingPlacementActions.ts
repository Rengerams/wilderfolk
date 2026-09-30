import type { Building, Entity, WorldState } from './gameTypes';
import {
  BuildingType,
  BUILDING_CONFIGS,
  EntityType,
  TerrainType,
  TERRAIN_TILE_SIZE,
} from './gameTypes';
import { addFloatingText, createDeathParticles, impulseScreenShake } from './simEffects';
import { bumpTerrainRevision } from './terrainLayer';
import { assignMissingWorkers } from './workforce';
import { refundBuildingCost, removeBuildingFromState } from './buildingMaintenanceActions';
import { assignMissingResidences } from './dayCycle';
import { isPlayerHuman } from './playerHuman';
import { notifyBuildingLocked } from './research';
import { getBuildingFootprintForType, normalizeBuildingRotation, type BuildingRotation, type CornerRotation } from './buildingRotation';
import { isStripBuildType, type StripBuildPreview, type StripSegment } from './stripBuild';
import { buildStripPlanFromDrag } from './stripTopology';
import { createBuilding } from './worldGen';
import {
  getBuildingFootprintRect,
  isBuildingTechUnlocked,
  isFootprintOnBuildableTerrain,
  isFootprintWithinMapBounds,
  overlapsAnyBuilding,
} from './placementUtils';
import { patchTile, rebakeTerrainGrids, tileAt } from './terrain/terrainGrid';

// The unbuildable-terrain rule has one owner: `terrain/terrainTraits.isUnbuildableTerrainType`
// (it sits in a leaf module so `terrainGrid` can read it without importing `placementUtils` back).
// A second exported copy of the same set used to live here; nothing read it (two modules only
// re-exported it), so it was removed with the re-exports rather than restated.

export { isFootprintOnBuildableTerrain } from './placementUtils';

function listPlayerHumans(state: WorldState): Entity[] {
  return state.entities.filter(isPlayerHuman);
}

function isStripSegmentTechUnlocked(
  stripType: BuildingType,
  placeType: BuildingType,
  state: WorldState,
): boolean {
  const requirements = new Set<string>();
  const stripRequirement = BUILDING_CONFIGS[stripType].unlockRequirement;
  const pieceRequirement = BUILDING_CONFIGS[placeType].unlockRequirement;
  if (stripRequirement) requirements.add(stripRequirement);
  if (pieceRequirement) requirements.add(pieceRequirement);
  for (const requirement of requirements) {
    if (!isBuildingTechUnlocked(requirement, state.unlockedTechs, state.researchNodes)) return false;
  }
  return true;
}

export function canPlaceBuilding(
  state: WorldState,
  type: BuildingType,
  x: number,
  y: number,
  rotation: BuildingRotation = 0,
): boolean {
  return getPlaceBuildingFailureReason(state, type, x, y, rotation) == null;
}

/**
 * The `unique` gate's own statement: true when `type` is a one-per-village building and one already
 * stands.
 *
 * The build catalogue tested `config.unique && buildings.some(...)` itself and re-worded the refusal,
 * so the rule lived in a view as well as here (2026-09-20 audit, O-5). The wording the player reads is
 * `buildingPlacementLabels.PLACEMENT_FAILURE_LABELS.unique`.
 */
export function isUniqueBuildingAlreadyBuilt(state: WorldState, type: BuildingType): boolean {
  const config = BUILDING_CONFIGS[type];
  return !!config.unique && state.buildings.some((building) => building.type === type);
}

export function getPlaceBuildingFailureReason(
  state: WorldState,
  type: BuildingType,
  x: number,
  y: number,
  rotation: BuildingRotation = 0,
): 'terrain' | 'blocked' | 'research' | 'unique' | null {
  const config = BUILDING_CONFIGS[type];
  const { width, height } = getBuildingFootprintForType(type, rotation);
  if (!isFootprintWithinMapBounds(width, height, x, y, state.width, state.height)) return 'blocked';
  if (
    config.unlockRequirement
    && !isBuildingTechUnlocked(config.unlockRequirement, state.unlockedTechs, state.researchNodes)
  ) {
    return 'research';
  }
  if (isUniqueBuildingAlreadyBuilt(state, type)) return 'unique';
  if (!isFootprintOnBuildableTerrain(state, width, height, x, y, type)) return 'terrain';
  if (overlapsAnyBuilding(state.buildings, width, height, x, y)) return 'blocked';
  return null;
}

function clearTreesUnderFootprint(
  state: WorldState,
  building: Pick<Building, 'x' | 'y' | 'width' | 'height'>,
): void {
  // The cleared rectangle is the rect the player sees: `placementUtils.getBuildingFootprintRect`
  // is the single owner of "the ground this building stands on" (`x/y` is the centre). Reading
  // `x … x + width` here cleared a rectangle half a footprint to the south-east of the pad — trees
  // inside the drawn footprint survived, trees beside the building vanished (see the convention row
  // in `LIVE-FINDINGS-STATUS.md`).
  const { left, right, top, bottom } = getBuildingFootprintRect(building);

  for (const entity of state.entities) {
    if (!entity.alive || entity.type !== EntityType.Tree) continue;
    if (entity.x >= left && entity.x < right && entity.y >= top && entity.y < bottom) entity.alive = false;
  }

  const map = state.worldMap;
  if (!map) return;
  const startTx = Math.max(0, Math.floor(left / TERRAIN_TILE_SIZE));
  const endTx = Math.min(map.width, Math.ceil(right / TERRAIN_TILE_SIZE));
  const startTy = Math.max(0, Math.floor(top / TERRAIN_TILE_SIZE));
  const endTy = Math.min(map.height, Math.ceil(bottom / TERRAIN_TILE_SIZE));
  let tilesChanged = false;
  for (let tileY = startTy; tileY < endTy; tileY++) {
    for (let tileX = startTx; tileX < endTx; tileX++) {
      const tile = tileAt(map, tileX, tileY);
      if (!tile) continue;
      if (tile.type === TerrainType.Forest || tile.type === TerrainType.DarkForest) {
        patchTile(map, tileX, tileY, { type: TerrainType.Grassland });
        tilesChanged = true;
      }
    }
  }
  if (tilesChanged) {
    rebakeTerrainGrids(map, { startTx, endTx, startTy, endTy });
    // The terrain caches key on the map's immutable-looking fields, so a mutated tile needs the
    // revision bump or the cleared forest keeps its old fill and canopy for the life of the
    // cache entry (audit `visuals-looks.md` D4).
    bumpTerrainRevision();
  }
}

export function startBuilding(
  originalState: WorldState,
  type: BuildingType,
  x: number,
  y: number,
  rotation: BuildingRotation = 0,
  /**
   * Debug/testing only: skip the research gate and the resource cost, so a test run can raise every
   * building in the catalogue without first playing 200 days to afford it.
   *
   * Placement validity (terrain, overlap, the one-per-village rule) is **still enforced** even here:
   * two buildings in the same footprint would corrupt the spatial indices the renderer and the
   * adjacency graph read, which is a broken test world rather than a cheated one.
   *
   * This is the only cheat in the file and it is opt-in per call, so no shipping path can reach it.
   * The player-facing route is the dev-only auto-play "build everything" toggle (`virtualPlayer`).
   */
  free = false,
): WorldState {
  const state = structuredClone(originalState);
  const config = BUILDING_CONFIGS[type];

  const placeFailure = getPlaceBuildingFailureReason(state, type, x, y, rotation);
  if (placeFailure && !(free && placeFailure === 'research')) {
    if (placeFailure === 'research') return notifyBuildingLocked(state, type);
    addFloatingText(
      state,
      x,
      y,
      placeFailure === 'unique'
        ? `Only one ${config.label} per village`
        : placeFailure === 'terrain'
          ? 'Cannot build on water/terrain'
          : 'Cannot build here',
      '#ef4444',
    );
    return state;
  }

  if (!free && (state.resources.wood < config.cost.wood || state.resources.stone < config.cost.stone || state.resources.gold < config.cost.gold)) {
    addFloatingText(state, x, y, `Need ${config.cost.wood}w ${config.cost.stone}s ${config.cost.gold}g`, '#ef4444');
    return state;
  }

  if (!free) {
    state.resources.wood -= config.cost.wood;
    state.resources.stone -= config.cost.stone;
    state.resources.gold -= config.cost.gold;
  }

  const building = createBuilding(type, x, y, state.nextBuildingId++, rotation);
  building.spriteScale = 0;
  state.buildings.push(building);

  if (type === BuildingType.LeaderHouse) {
    assignMissingResidences(listPlayerHumans(state), state.buildings, state.entities);
  }

  clearTreesUnderFootprint(state, building);
  // The third argument is the `WorldState`: without it the auto-staff pass falls back to
  // `DEFAULT_WORKFORCE_POLICY` and the default tavern window, so a newly placed building could
  // push a staffed venue one worker past the player's own preset (audit B-2).
  assignMissingWorkers(listPlayerHumans(state), state.buildings, state);

  createDeathParticles(state, x, y, '#ffd700', 8, 'star');
  addFloatingText(
    state,
    x,
    y - 10,
    `🔨 ${config.label} · −${config.cost.wood}w −${config.cost.stone}s −${config.cost.gold}g · ${config.buildTime}d`,
    '#22c55e',
    'brief',
  );
  impulseScreenShake(state, 2);
  return state;
}

function segmentRotationForPlacement(
  _placeType: BuildingType,
  rotation: BuildingRotation | CornerRotation,
): BuildingRotation {
  return normalizeBuildingRotation(rotation);
}

export function buildStripPreview(
  state: WorldState,
  type: BuildingType,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  rotation: BuildingRotation,
): StripBuildPreview {
  const { plan, enclosedAreas } = buildStripPlanFromDrag(state, type, startX, startY, endX, endY, rotation);
  return {
    rotation,
    enclosedAreas,
    segments: plan.map((piece) => {
      const segmentRotation = segmentRotationForPlacement(piece.type, piece.rotation);
      const replacing = piece.replacesBuildingId !== undefined
        ? state.buildings.find((building) => building.id === piece.replacesBuildingId)
        : undefined;
      let valid = canPlaceBuilding(state, piece.type, piece.x, piece.y, segmentRotation);
      if (replacing !== undefined) {
        const withoutReplacement: WorldState = {
          ...state,
          buildings: state.buildings.filter((building) => building.id !== replacing.id),
        };
        valid = getPlaceBuildingFailureReason(
          withoutReplacement,
          piece.type,
          piece.x,
          piece.y,
          segmentRotation,
        ) == null;
      }
      return {
        x: piece.x,
        y: piece.y,
        placeType: piece.type,
        rotation: piece.rotation,
        junctionInfo: piece.junctionInfo,
        replacesBuildingId: piece.replacesBuildingId,
        valid,
      };
    }),
  };
}

export function placeStripChain(
  originalState: WorldState,
  type: BuildingType,
  segments: readonly StripSegment[],
  rotation: BuildingRotation,
): WorldState {
  if (!isStripBuildType(type) || segments.length === 0) return originalState;
  const state = structuredClone(originalState);

  let placed = 0;
  let firstX = 0;
  let firstY = 0;
  const replaced = new Set<number>();
  let lockedSkips = 0;

  for (const segment of segments) {
    if (!segment.valid) continue;
    const placeType = segment.placeType ?? type;
    const placeRotation = segment.rotation ?? rotation;
    const segmentRotation = segmentRotationForPlacement(placeType, placeRotation);
    const config = BUILDING_CONFIGS[placeType];

    if (!isStripSegmentTechUnlocked(type, placeType, state)) {
      lockedSkips++;
      continue;
    }
    if (
      state.resources.wood < config.cost.wood
      || state.resources.stone < config.cost.stone
      || state.resources.gold < config.cost.gold
    ) break;

    const replacementId = segment.replacesBuildingId;
    let placementChecked = false;
    if (replacementId !== undefined && !replaced.has(replacementId)) {
      const existing = state.buildings.find((building) => building.id === replacementId);
      if (existing) {
        // Feasibility is checked against a copy that omits the replaced building — the same shape
        // `buildStripPreview` uses — so a refused replacement leaves authoritative state untouched
        // and there is no removal bookkeeping to roll back.
        const withoutReplacement: WorldState = {
          ...state,
          buildings: state.buildings.filter((building) => building.id !== replacementId),
        };
        const failure = getPlaceBuildingFailureReason(
          withoutReplacement,
          placeType,
          segment.x,
          segment.y,
          segmentRotation,
        );
        if (failure) continue;
        // The replaced building leaves through the removal owner (counter, adjacency, road cache)
        // and is refunded through the capped refund owner — the plain demolition answers (B-1/E-5).
        removeBuildingFromState(state, existing);
        refundBuildingCost(state, existing.type);
        replaced.add(replacementId);
        placementChecked = true;
      }
    }

    if (!placementChecked) {
      const failure = getPlaceBuildingFailureReason(state, placeType, segment.x, segment.y, segmentRotation);
      if (failure) continue;
    }

    state.resources.wood -= config.cost.wood;
    state.resources.stone -= config.cost.stone;
    state.resources.gold -= config.cost.gold;

    const cornerRotation = normalizeBuildingRotation(placeRotation);
    const building = createBuilding(placeType, segment.x, segment.y, state.nextBuildingId++, cornerRotation);
    building.spriteScale = 0;
    state.buildings.push(building);
    clearTreesUnderFootprint(state, building);
    if (placed === 0) {
      firstX = segment.x;
      firstY = segment.y;
    }
    placed++;
  }

  if (placed === 0) {
    const sample = segments.find((segment) => segment.valid) ?? segments[0];
    if (lockedSkips > 0) return notifyBuildingLocked(state, sample.placeType ?? type);
    addFloatingText(state, sample.x, sample.y, 'Cannot build strip here', '#ef4444');
    return state;
  }

  createDeathParticles(state, firstX, firstY, '#ffd700', Math.min(12, 4 + placed), 'star');
  const label = placed === 1 ? BUILDING_CONFIGS[segments[0].placeType ?? type].label : `${placed} segments`;
  addFloatingText(state, firstX, firstY - 10, `🔨 ${label}`, '#22c55e', 'brief');
  impulseScreenShake(state, placed > 3 ? 3 : 2);
  assignMissingWorkers(listPlayerHumans(state), state.buildings, state);
  return state;
}
