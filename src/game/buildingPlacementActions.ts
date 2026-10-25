import type { Building, WorldState } from './gameTypes';
import { canBuildLeaderHouse } from './leaderHouseExpansion';
import {
  BuildingType,
  BUILDING_CONFIGS,
  EntityType,
  TerrainType,
  PATH_CELL,
} from './gameTypes';
import { addFloatingText, createDeathParticles, impulseScreenShake } from './simEffects';
import { bumpTerrainRevision } from './terrainLayer';
import { assignMissingWorkers } from './workforce';
import { refundBuildingCost, removeBuildingFromState } from './buildingMaintenanceActions';
import { assignMissingResidences } from './dayCycle';
import { allPlayerHumans } from './playerHuman';
import { notifyBuildingLocked } from './research';
import {
  getBuildingFootprintForType,
  placementRotationFor,
  type BuildingRotation,
} from './buildingRotation';
import { isStripBuildType, type StripBuildPreview, type StripSegment } from './stripBuild';
import { getPlaceBuildingFailureLabel } from './buildingPlacementLabels';
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
import { logEvent } from './eventLog';

// The unbuildable-terrain rule has one owner: `terrain/terrainTraits.isUnbuildableTerrainType`, a
// leaf module so `terrainGrid` can read it without importing `placementUtils` back. Do not restate it.

export { isFootprintOnBuildableTerrain } from './placementUtils';

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
 * so the rule lived in a view as well as here. The wording the player reads is
 * `buildingPlacementLabels.PLACEMENT_FAILURE_LABELS.unique`.
 */
export function isUniqueBuildingAlreadyBuilt(state: WorldState, type: BuildingType): boolean {
  if (type === BuildingType.LeaderHouse) return !canBuildLeaderHouse(state.buildings);
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
  const startTx = Math.max(0, Math.floor(left / PATH_CELL));
  const endTx = Math.min(map.width, Math.ceil(right / PATH_CELL));
  const startTy = Math.max(0, Math.floor(top / PATH_CELL));
  const endTy = Math.min(map.height, Math.ceil(bottom / PATH_CELL));
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

  if (type === BuildingType.GroundReinforcement) {
    // This is a terrain operation, not a structure. The saved tile overrides
    // carry the result; nothing remains to obstruct a future building.
    const map = state.worldMap;
    if (!map) return state;
    const { startTx, endTx, startTy, endTy } = {
      startTx: Math.floor((x - config.width / 2) / PATH_CELL),
      endTx: Math.ceil((x + config.width / 2) / PATH_CELL),
      startTy: Math.floor((y - config.height / 2) / PATH_CELL),
      endTy: Math.ceil((y + config.height / 2) / PATH_CELL),
    };
    let changed = 0;
    for (let ty = startTy; ty < endTy; ty++) {
      for (let tx = startTx; tx < endTx; tx++) {
        const tile = tileAt(map, tx, ty);
        if (!tile) continue;
        if (tile.type === TerrainType.Mountains || tile.type === TerrainType.Snow ||
            tile.type === TerrainType.ShallowWater || tile.type === TerrainType.RiverBank) {
          patchTile(map, tx, ty, { type: TerrainType.Rocky, reinforced: true });
          changed++;
        }
      }
    }
    if (changed) {
      rebakeTerrainGrids(map, { startTx, endTx: endTx - 1, startTy, endTy: endTy - 1 });
      bumpTerrainRevision();
      addFloatingText(state, x, y, `Ground reinforced · ${changed} tiles`, '#22c55e', 'brief');
      logEvent(state, 'building', `Ground reinforced (${changed} tiles)`);
    }
    return state;
  }

  const building = createBuilding(type, x, y, state.nextBuildingId++, rotation);
  building.spriteScale = 0;
  state.buildings.push(building);

  if (type === BuildingType.LeaderHouse) {
    assignMissingResidences(allPlayerHumans(state.entities), state.buildings, state.entities);
  }

  clearTreesUnderFootprint(state, building);
  // The third argument is the `WorldState`: without it the auto-staff pass falls back to
  // `DEFAULT_WORKFORCE_POLICY` and the default tavern window, so a newly placed building could
  // push a staffed venue one worker past the player's own preset.
  assignMissingWorkers(allPlayerHumans(state.entities), state.buildings, state);

  createDeathParticles(state, x, y, '#ffd700', 8, 'star');
  addFloatingText(
    state,
    x,
    y - 10,
    `🔨 ${config.label} · −${config.cost.wood}w −${config.cost.stone}s −${config.cost.gold}g · ${config.buildTime}d`,
    '#22c55e',
    'brief',
  );
  logEvent(state, 'building', `${config.label} placed`);
  impulseScreenShake(state, 2);
  return state;
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
      // The raw plan rotation is what the renderer reads for junction topology; validity is always
      // asked with the normalised form, which is the only one the footprint owner accepts.
      const segmentRotation = piece.rotation;
      const placementRotation = placementRotationFor(segmentRotation);
      const replacing = piece.replacesBuildingId !== undefined
        ? state.buildings.find((building) => building.id === piece.replacesBuildingId)
        : undefined;
      let reason = getPlaceBuildingFailureReason(
        state,
        piece.type,
        piece.x,
        piece.y,
        placementRotation,
      );
      if (replacing !== undefined) {
        const withoutReplacement: WorldState = {
          ...state,
          buildings: state.buildings.filter((building) => building.id !== replacing.id),
        };
        reason = getPlaceBuildingFailureReason(
          withoutReplacement,
          piece.type,
          piece.x,
          piece.y,
          placementRotation,
        );
      }
      return {
        x: piece.x,
        y: piece.y,
        placeType: piece.type,
        rotation: segmentRotation,
        junctionInfo: piece.junctionInfo,
        replacesBuildingId: piece.replacesBuildingId,
        valid: reason == null,
        reason: reason ?? undefined,
      };
    }),
  };
}

/**
 * The one reason a whole stroke was refused, chosen from the per-segment verdicts the preview
 * already carries. `research` outranks terrain because a locked piece is refused whichever ground
 * it lands on, so naming the water would hide the real gate.
 */
const STRIP_REFUSAL_PRIORITY = ['research', 'terrain', 'unique', 'blocked'] as const;

function worstStripRefusal(
  segments: readonly StripSegment[],
): StripSegment['reason'] | null {
  for (const reason of STRIP_REFUSAL_PRIORITY) {
    if (segments.some((segment) => segment.reason === reason)) return reason;
  }
  return null;
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
  let lastX = 0;
  let lastY = 0;
  const replaced = new Set<number>();
  let lockedSkips = 0;
  // A stroke paves what it can and says what it skipped, rather than refusing the whole run for one
  // bad tile: the ground under a long drag is never uniform, and a silent no-op reads as a broken tool.
  const refused: StripSegment[] = [];
  let ranOut = false;

  for (const segment of segments) {
    if (!segment.valid) {
      refused.push(segment);
      continue;
    }
    const placeType = segment.placeType ?? type;
    const placeRotation = segment.rotation ?? rotation;
    const segmentRotation = placementRotationFor(placeRotation);
    const config = BUILDING_CONFIGS[placeType];

    if (!isStripSegmentTechUnlocked(type, placeType, state)) {
      lockedSkips++;
      refused.push(segment);
      continue;
    }
    if (
      state.resources.wood < config.cost.wood
      || state.resources.stone < config.cost.stone
      || state.resources.gold < config.cost.gold
    ) {
      ranOut = true;
      break;
    }

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
        if (failure) {
          refused.push({ ...segment, valid: false, reason: failure });
          continue;
        }
        // The replaced building leaves through the removal owner (counter, adjacency, road cache)
        // and is refunded through the capped refund owner — the plain demolition answers.
        removeBuildingFromState(state, existing);
        refundBuildingCost(state, existing.type);
        replaced.add(replacementId);
        placementChecked = true;
      }
    }

    if (!placementChecked) {
      const failure = getPlaceBuildingFailureReason(state, placeType, segment.x, segment.y, segmentRotation);
      if (failure) {
        refused.push({ ...segment, valid: false, reason: failure });
        continue;
      }
    }

    state.resources.wood -= config.cost.wood;
    state.resources.stone -= config.cost.stone;
    state.resources.gold -= config.cost.gold;

    const building = createBuilding(placeType, segment.x, segment.y, state.nextBuildingId++, placeRotation);
    building.spriteScale = 0;
    state.buildings.push(building);
    clearTreesUnderFootprint(state, building);
    if (placed === 0) {
      firstX = segment.x;
      firstY = segment.y;
    }
    lastX = segment.x;
    lastY = segment.y;
    placed++;
  }

  if (placed === 0) {
    const sample = segments.find((segment) => segment.valid) ?? segments[0];
    if (lockedSkips > 0) return notifyBuildingLocked(state, sample.placeType ?? type);
    const reason = worstStripRefusal(refused);
    addFloatingText(
      state,
      sample.x,
      sample.y,
      reason
        ? getPlaceBuildingFailureLabel(sample.placeType ?? type, reason, state.researchNodes)
        : 'Cannot build strip here',
      '#ef4444',
    );
    return state;
  }

  createDeathParticles(state, firstX, firstY, '#ffd700', Math.min(12, 4 + placed), 'star');
  const label = placed === 1 ? BUILDING_CONFIGS[segments[0].placeType ?? type].label : `${placed} segments`;
  addFloatingText(state, firstX, firstY - 10, `🔨 ${label}`, '#22c55e', 'brief');
  if (ranOut) {
    addFloatingText(state, lastX, lastY - 10, 'Out of wood/stone — stroke stopped', '#ef4444');
  } else if (refused.length > 0) {
    const reason = worstStripRefusal(refused);
    addFloatingText(
      state,
      lastX,
      lastY - 10,
      `${refused.length} skipped${reason ? ` — ${getPlaceBuildingFailureLabel(type, reason, state.researchNodes)}` : ''}`,
      '#f59e0b',
    );
  }
  impulseScreenShake(state, placed > 3 ? 3 : 2);
  assignMissingWorkers(allPlayerHumans(state.entities), state.buildings, state);
  return state;
}
