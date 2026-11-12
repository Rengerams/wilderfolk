import type { Building, WorldState } from './gameTypes';
import { leaderHouseBuildings } from './leaderHouseExpansion';
import {
  BuildingType,
  BUILDING_CONFIGS,
  EntityType,
  TerrainType,
  PATH_CELL,
} from './gameTypes';
import { addFloatingText, createDeathParticles, impulseScreenShake } from './simEffects';
import { bumpTerrainRevision } from './terrain/terrainGrid';
import { assignMissingWorkers } from './workforce';
import { getBuildingConfig } from './buildingConfig';
import { refundBuildingCost, removeBuildingFromState } from './buildingMaintenanceActions';
import { assignMissingResidences } from './housingPipeline';
import { allPlayerHumans } from './playerHuman';
import { notifyBuildingLocked } from './research';
import { placementRotationFor, type BuildingRotation } from './buildingRotation';
import { isStripBuildType, type StripBuildPreview, type StripSegment } from './stripBuild';
import { getPlaceBuildingFailureLabel } from './buildingPlacementLabels';
import { buildStripPlanFromDrag, buildStripPlanFromStroke } from './stripTopology';
import { createBuilding } from './worldGen';
import {
  getBuildingFootprintRect,
  getPlaceBuildingFailureReason,
  isBuildingTechUnlocked,
  isUniqueBuildingAlreadyBuilt,
} from './placementUtils';
import { patchTile, rebakeTerrainGrids, tileAt } from './terrain/terrainGrid';
import { logEvent } from './eventLog';

export { getPlaceBuildingFailureReason, isUniqueBuildingAlreadyBuilt };

// The unbuildable-terrain rule has one owner: `terrain/terrainTraits.isUnbuildableTerrainType`, a
// leaf module so `terrainGrid` can read it without importing `placementUtils` back. Do not restate it.

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

function clearTreesUnderFootprint(
  state: WorldState,
  building: Pick<Building, 'x' | 'y' | 'width' | 'height'>,
): void {
  // The cleared rectangle is the rect the player sees: `getBuildingFootprintRect` owns
  // "the ground this building stands on" and treats `x/y` as the centre.
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
    // A mutated tile needs the revision bump, or the terrain caches keep the old fill and canopy.
    bumpTerrainRevision({
      left: startTx * PATH_CELL,
      top: startTy * PATH_CELL,
      right: endTx * PATH_CELL,
      bottom: endTy * PATH_CELL,
    });
  }
}

export function startBuilding(
  originalState: WorldState,
  type: BuildingType,
  x: number,
  y: number,
  rotation: BuildingRotation = 0,
  /**
   * Debug/testing only: skip the research gate and the resource cost.
   * Placement validity (terrain, overlap, the one-per-village rule) is still enforced.
   */
  free = false,
): WorldState {
  const state = structuredClone(originalState);
  const config = getBuildingConfig(type);

  const placeFailure = getPlaceBuildingFailureReason(state, type, x, y, rotation);
  if (placeFailure && !(free && placeFailure === 'research')) {
    if (placeFailure === 'research') return notifyBuildingLocked(state, type);
    addFloatingText(
      state,
      x,
      y,
      getPlaceBuildingFailureLabel(type, placeFailure, state.researchNodes),
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
      bumpTerrainRevision({
        left: startTx * PATH_CELL,
        top: startTy * PATH_CELL,
        right: endTx * PATH_CELL,
        bottom: endTy * PATH_CELL,
      });
      addFloatingText(state, x, y, `Ground reinforced · ${changed} tiles`, '#22c55e', 'brief');
      logEvent(state, 'building', `Ground reinforced (${changed} tiles)`);
    }
    return state;
  }

  const building = createBuilding(type, x, y, state.nextBuildingId++, rotation);
  building.siteTerrain = state.worldMap
    ? tileAt(state.worldMap, Math.floor(x / PATH_CELL), Math.floor(y / PATH_CELL))?.type
    : undefined;
  if (type === BuildingType.LeaderHouse) {
    const main = leaderHouseBuildings(state.buildings)[0];
    if (main) {
      building.groupId = `leader-house:${main.id}`;
    } else {
      // Replacement main: preserve the surviving annex and its occupied beds.
      for (const annex of state.buildings) {
        if (annex.type !== BuildingType.LeaderHouse || annex.faction === 'rival') continue;
        if (!annex.groupId?.startsWith('leader-house:')) continue;
        const formerId = Number(annex.groupId.slice('leader-house:'.length));
        if (state.buildings.some((candidate) => candidate.id === formerId)) continue;
        annex.groupId = `leader-house:${building.id}`;
      }
    }
  }
  building.spriteScale = 0;
  state.buildings.push(building);

  if (type === BuildingType.LeaderHouse) {
    assignMissingResidences(allPlayerHumans(state.entities), state.buildings, state.entities);
  }

  clearTreesUnderFootprint(state, building);
  // Pass `state` too: without it the auto-staff pass falls back to
  // `DEFAULT_WORKFORCE_POLICY` and the default tavern window.
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
  stroke?: readonly { x: number; y: number }[],
): StripBuildPreview {
  const { plan, enclosedAreas } = stroke && stroke.length > 1
    ? buildStripPlanFromStroke(state, type, stroke)
    : buildStripPlanFromDrag(state, type, startX, startY, endX, endY, rotation);
  const budgetState: WorldState = {
    ...state,
    buildings: [...state.buildings],
    resources: { ...state.resources },
    lifetimeStats: {
      ...state.lifetimeStats,
      totalResourcesGathered: { ...state.lifetimeStats.totalResourcesGathered },
    },
  };
  let ranOutOfResources = false;
  const segments = plan.map((piece): StripSegment => {
      // The raw plan rotation is what the renderer reads for junction topology; validity is always
      // asked with the normalised form, which is the only one the footprint owner accepts.
      const segmentRotation = piece.rotation;
      const placementRotation = placementRotationFor(segmentRotation);
      const replacing = piece.replacesBuildingId !== undefined
        ? budgetState.buildings.find((building) => building.id === piece.replacesBuildingId)
        : undefined;
      const placementState = replacing
        ? { ...budgetState, buildings: budgetState.buildings.filter((building) => building.id !== replacing.id) }
        : budgetState;
      const reason = getPlaceBuildingFailureReason(
        placementState,
        piece.type,
        piece.x,
        piece.y,
        placementRotation,
      );
      const refusal = !reason && !isStripSegmentTechUnlocked(type, piece.type, state) ? 'research' : reason;
      const cost = BUILDING_CONFIGS[piece.type].cost;
      const shortage = !refusal && (ranOutOfResources
        || budgetState.resources.wood < cost.wood
        || budgetState.resources.stone < cost.stone
        || budgetState.resources.gold < cost.gold);
      if (shortage) ranOutOfResources = true;
      if (!refusal && !shortage) {
        // Carry accepted footprints into the next segment's authoritative overlap check.
        if (replacing) {
          budgetState.buildings = placementState.buildings;
          refundBuildingCost(budgetState, replacing.type);
        }
        budgetState.resources.wood -= cost.wood;
        budgetState.resources.stone -= cost.stone;
        budgetState.resources.gold -= cost.gold;
        budgetState.buildings.push(createBuilding(piece.type, piece.x, piece.y, budgetState.nextBuildingId++, placementRotation));
      }
      return {
        x: piece.x,
        y: piece.y,
        placeType: piece.type,
        rotation: segmentRotation,
        junctionInfo: piece.junctionInfo,
        replacesBuildingId: piece.replacesBuildingId,
        valid: refusal == null && !shortage,
        reason: refusal ?? undefined,
        resourceShortage: shortage,
      };
    });
  return {
    rotation,
    // An incomplete stroke must never advertise a sealed wall enclosure.
    enclosedAreas: segments.every((piece) => piece.valid) ? enclosedAreas : [],
    segments,
    cost: {
      wood: state.resources.wood - budgetState.resources.wood,
      stone: state.resources.stone - budgetState.resources.stone,
      gold: state.resources.gold - budgetState.resources.gold,
    },
    available: {
      wood: state.resources.wood,
      stone: state.resources.stone,
      gold: state.resources.gold,
    },
  };
}

/**
 * The one reason a whole stroke was refused, chosen from the per-segment verdicts.
 * `research` outranks terrain because a locked piece is refused on any ground.
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
        // Feasibility is checked against a copy that omits the replaced building, as
        // `buildStripPreview` does, so a refused replacement leaves state untouched.
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
