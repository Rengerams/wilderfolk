import type { Entity, WorldState } from './gameTypes';
import {
  BuildingType,
  BUILDING_CONFIGS,
  EntityType,
  TerrainType,
  TERRAIN_TILE_SIZE,
} from './gameTypes';
import { addFloatingText, createDeathParticles, impulseScreenShake } from './simEffects';
import { assignMissingWorkers } from './workforce';
import { assignMissingResidences } from './dayCycle';
import { isPlayerHuman } from './playerHuman';
import { notifyBuildingLocked } from './research';
import { getBuildingFootprintForType, normalizeBuildingRotation, type BuildingRotation, type CornerRotation } from './buildingRotation';
import { isStripBuildType, type StripBuildPreview, type StripSegment } from './stripBuild';
import { buildStripPlanFromDrag } from './stripTopology';
import { createBuilding } from './worldGen';
import {
  isBuildingTechUnlocked,
  isFootprintOnBuildableTerrain,
  isFootprintWithinMapBounds,
  overlapsAnyBuilding,
} from './placementUtils';

export const UNBUILDABLE_TERRAIN = new Set<TerrainType>([
  TerrainType.DeepWater,
  TerrainType.ShallowWater,
  TerrainType.River,
  TerrainType.RiverBank,
  TerrainType.Mountains,
  TerrainType.Snow,
]);

export { isFootprintOnBuildableTerrain, isFootprintWithinMapBounds } from './placementUtils';

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
  if (config.unique && state.buildings.some((building) => building.type === type)) return 'unique';
  if (!isFootprintOnBuildableTerrain(state, width, height, x, y, type)) return 'terrain';
  if (overlapsAnyBuilding(state.buildings, width, height, x, y)) return 'blocked';
  return null;
}

function clearTreesUnderFootprint(
  state: WorldState,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  for (const entity of state.entities) {
    if (!entity.alive || entity.type !== EntityType.Tree) continue;
    if (entity.x >= x && entity.x < x + width && entity.y >= y && entity.y < y + height) entity.alive = false;
  }

  const tiles = state.worldMap?.tiles;
  if (!tiles?.length) return;
  const startTx = Math.max(0, Math.floor(x / TERRAIN_TILE_SIZE));
  const endTx = Math.min(tiles[0]?.length ?? 0, Math.ceil((x + width) / TERRAIN_TILE_SIZE));
  const startTy = Math.max(0, Math.floor(y / TERRAIN_TILE_SIZE));
  const endTy = Math.min(tiles.length, Math.ceil((y + height) / TERRAIN_TILE_SIZE));
  for (let tileY = startTy; tileY < endTy; tileY++) {
    for (let tileX = startTx; tileX < endTx; tileX++) {
      const tile = tiles[tileY]?.[tileX];
      if (!tile) continue;
      if (tile.type === TerrainType.Forest || tile.type === TerrainType.DarkForest) {
        tile.type = TerrainType.Grassland;
      }
    }
  }
}

export function startBuilding(
  originalState: WorldState,
  type: BuildingType,
  x: number,
  y: number,
  rotation: BuildingRotation = 0,
): WorldState {
  const state = structuredClone(originalState);
  const config = BUILDING_CONFIGS[type];

  const placeFailure = getPlaceBuildingFailureReason(state, type, x, y, rotation);
  if (placeFailure) {
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

  if (state.resources.wood < config.cost.wood || state.resources.stone < config.cost.stone || state.resources.gold < config.cost.gold) {
    addFloatingText(state, x, y, `Need ${config.cost.wood}w ${config.cost.stone}s ${config.cost.gold}g`, '#ef4444');
    return state;
  }

  state.resources.wood -= config.cost.wood;
  state.resources.stone -= config.cost.stone;
  state.resources.gold -= config.cost.gold;

  const building = createBuilding(type, x, y, state.nextBuildingId++, rotation);
  building.spriteScale = 0;
  state.buildings.push(building);

  if (type === BuildingType.LeaderHouse) {
    assignMissingResidences(listPlayerHumans(state), state.buildings, state.entities);
  }

  const footprint = getBuildingFootprintForType(type, rotation);
  clearTreesUnderFootprint(state, x, y, footprint.width, footprint.height);
  assignMissingWorkers(listPlayerHumans(state), state.buildings);

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

function refundHalfBuildingCost(state: WorldState, type: BuildingType): void {
  const config = BUILDING_CONFIGS[type];
  state.resources.wood += Math.floor(config.cost.wood * 0.5);
  state.resources.stone += Math.floor(config.cost.stone * 0.5);
  state.resources.gold += Math.floor(config.cost.gold * 0.5);
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
        state.buildings = state.buildings.filter((building) => building.id !== replacementId);
        const failure = getPlaceBuildingFailureReason(state, placeType, segment.x, segment.y, segmentRotation);
        if (failure) {
          state.buildings.push(existing);
          continue;
        }
        refundHalfBuildingCost(state, existing.type);
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
    const footprint = getBuildingFootprintForType(placeType, cornerRotation);
    clearTreesUnderFootprint(state, segment.x, segment.y, footprint.width, footprint.height);
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
  assignMissingWorkers(listPlayerHumans(state), state.buildings);
  return state;
}
