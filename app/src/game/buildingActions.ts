import type { WorldState, Entity, Building } from './gameTypes';
import {
  BuildingType, EntityType, TerrainType,
  BUILDING_CONFIGS, BUILDING_JOB_TYPES, JobType,
  WORKSHOP_RECIPES, getWorkshopRecipe,
  WEREWOLF_CURSE_LINES,
} from './gameTypes';
import {
  getOccupationForBuilding, readSkill, ensureEntitySkills, getWorkerSkillMultiplier,
} from './skills';
import { addResource } from './economy';
import {
  addFloatingText,
  addNotification,
  addBigNews,
  createDeathParticles,
  impulseScreenShake,
  getTerrainEfficiencyMultiplier,
  buildAdjacencyIndex,
  getAdjacencyMultiplierFromIndex,
  getMultiplier,
  assignMissingWorkers,
} from './gameEngine';
import { isPlayerHuman } from './groupEvents';
import {
  assignMissingResidences,
  collectOwnHousehold,
  hasWorkAssignment,
  isAdultChildAtHome,
  isImprisoned,
  isResidenceBuilding,
  isResidenceBuildingType,
  getResidenceCapacity,
  syncResidenceOccupants,
  tryMoveOutOfFamilyHome,
  HUMAN_ADULT_MIN_AGE,
  HUMAN_MOVE_OUT_MIN_AGE,
  getColonyDay,
  setHumanBirthFromAge,
} from './dayCycle';
import { canMoonHowlerCurse, curseMoonHowler } from './moonHowler';
import { notifyBuildingLocked } from './research';
import { type BuildingRotation, getBuildingFootprintForType } from './buildingRotation';
import {
  isStripBuildType,
  type StripBuildPreview,
  type StripSegment,
} from './stripBuild';
import { buildStripPlanFromDrag } from './stripTopology';
import {
  normalizeBuildingRotation,
  normalizeCornerRotation,
  type CornerRotation,
} from './buildingRotation';
import { createEntity, createBuilding } from './worldGen';
import { logEvent } from './eventLog';
import {
  isBuildingTechUnlocked,
  isFootprintOnBuildableTerrain,
  isFootprintWithinMapBounds,
  overlapsPlayerBuilding,
} from './placementUtils';

// ============ BUILDING ACTIONS ============
export const UNBUILDABLE_TERRAIN = new Set<TerrainType>([
  TerrainType.DeepWater,
  TerrainType.ShallowWater,
  TerrainType.River,
  TerrainType.RiverBank,
  TerrainType.Mountains,
  TerrainType.Snow,
]);

export { isFootprintOnBuildableTerrain, isFootprintWithinMapBounds } from './placementUtils';

export function canPlaceBuilding(
  state: WorldState,
  type: BuildingType,
  x: number,
  y: number,
  rotation: BuildingRotation = 0,
): boolean {
  const config = BUILDING_CONFIGS[type];
  const { width, height } = getBuildingFootprintForType(type, rotation);
  if (!isFootprintWithinMapBounds(width, height, x, y, state.width, state.height)) return false;
  if (
    config.unlockRequirement
    && !isBuildingTechUnlocked(config.unlockRequirement, state.unlockedTechs, state.researchNodes)
  ) {
    return false;
  }
  if (!isFootprintOnBuildableTerrain(state, width, height, x, y)) return false;
  return !overlapsPlayerBuilding(state.buildings, width, height, x, y);
}

export function getPlaceBuildingFailureReason(
  state: WorldState,
  type: BuildingType,
  x: number,
  y: number,
  rotation: BuildingRotation = 0,
): 'terrain' | 'blocked' | 'research' | null {
  const config = BUILDING_CONFIGS[type];
  const { width, height } = getBuildingFootprintForType(type, rotation);
  if (!isFootprintWithinMapBounds(width, height, x, y, state.width, state.height)) return 'blocked';
  if (
    config.unlockRequirement
    && !isBuildingTechUnlocked(config.unlockRequirement, state.unlockedTechs, state.researchNodes)
  ) {
    return 'research';
  }
  if (!isFootprintOnBuildableTerrain(state, width, height, x, y)) return 'terrain';
  if (overlapsPlayerBuilding(state.buildings, width, height, x, y)) return 'blocked';
  return null;
}

export function startBuilding(
  originalState: WorldState,
  type: BuildingType,
  x: number,
  y: number,
  rotation: BuildingRotation = 0,
): WorldState {
  const state = structuredClone(originalState) as WorldState;
  const config = BUILDING_CONFIGS[type];

  const placeFailure = getPlaceBuildingFailureReason(state, type, x, y, rotation);
  if (placeFailure) {
    if (placeFailure === 'research') {
      return notifyBuildingLocked(state, type);
    }
    addFloatingText(
      state,
      x,
      y,
      placeFailure === 'terrain' ? 'Cannot build on water/terrain' : 'Cannot build here',
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
  
  createDeathParticles(state, x, y, '#ffd700', 8, 'star');
  addFloatingText(state, x, y - 10, `🔨 ${config.label}`, '#22c55e', 'brief');
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
  placeType: BuildingType,
  rotation: BuildingRotation | CornerRotation,
): BuildingRotation {
  if (placeType === BuildingType.WallCorner) {
    const c = normalizeCornerRotation(rotation);
    return c === 90 || c === 270 ? 90 : 0;
  }
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
  const { plan, enclosedAreas } = buildStripPlanFromDrag(
    state, type, startX, startY, endX, endY, rotation,
  );
  return {
    rotation,
    enclosedAreas,
    segments: plan.map((piece) => {
      const segRot = segmentRotationForPlacement(piece.type, piece.rotation);
      const replacing = piece.replacesBuildingId !== undefined
        ? state.buildings.find((b) => b.id === piece.replacesBuildingId)
        : undefined;
      let valid = canPlaceBuilding(state, piece.type, piece.x, piece.y, segRot);
      if (replacing !== undefined) {
        const withoutReplace: WorldState = {
          ...state,
          buildings: state.buildings.filter((b) => b.id !== replacing.id),
        };
        valid = getPlaceBuildingFailureReason(withoutReplace, piece.type, piece.x, piece.y, segRot) == null;
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
  segments: StripSegment[],
  rotation: BuildingRotation,
): WorldState {
  if (!isStripBuildType(type) || segments.length === 0) return originalState;

  const state = structuredClone(originalState) as WorldState;
  const baseConfig = BUILDING_CONFIGS[type];

  if (
    baseConfig.unlockRequirement
    && !isBuildingTechUnlocked(baseConfig.unlockRequirement, state.unlockedTechs, state.researchNodes)
  ) {
    return notifyBuildingLocked(state, type);
  }

  let placed = 0;
  let firstX = 0;
  let firstY = 0;
  const replaced = new Set<number>();

  for (const seg of segments) {
    if (!seg.valid) continue;
    const placeType = seg.placeType ?? type;
    const placeRot = seg.rotation ?? rotation;
    const segRot = segmentRotationForPlacement(placeType, placeRot);
    const config = BUILDING_CONFIGS[placeType];

    if (
      state.resources.wood < config.cost.wood
      || state.resources.stone < config.cost.stone
      || state.resources.gold < config.cost.gold
    ) {
      break;
    }

    const replaceId = seg.replacesBuildingId;
    let placementChecked = false;
    if (replaceId !== undefined && !replaced.has(replaceId)) {
      const existing = state.buildings.find((b) => b.id === replaceId);
      if (existing) {
        state.buildings = state.buildings.filter((b) => b.id !== replaceId);
        const failure = getPlaceBuildingFailureReason(state, placeType, seg.x, seg.y, segRot);
        if (failure) {
          state.buildings.push(existing);
          continue;
        }
        refundHalfBuildingCost(state, existing.type);
        replaced.add(replaceId);
        placementChecked = true;
      }
    }

    if (!placementChecked) {
      const failure = getPlaceBuildingFailureReason(state, placeType, seg.x, seg.y, segRot);
      if (failure) continue;
    }

    state.resources.wood -= config.cost.wood;
    state.resources.stone -= config.cost.stone;
    state.resources.gold -= config.cost.gold;

    const cornerRot = placeType === BuildingType.WallCorner
      ? normalizeCornerRotation(placeRot)
      : normalizeBuildingRotation(placeRot);
    const building = createBuilding(
      placeType,
      seg.x,
      seg.y,
      state.nextBuildingId++,
      cornerRot,
    );
    building.spriteScale = 0;
    state.buildings.push(building);
    if (placed === 0) {
      firstX = seg.x;
      firstY = seg.y;
    }
    placed++;
  }

  if (placed === 0) {
    const sample = segments.find((s) => s.valid) ?? segments[0];
    addFloatingText(state, sample.x, sample.y, 'Cannot build strip here', '#ef4444');
    return state;
  }

  createDeathParticles(state, firstX, firstY, '#ffd700', Math.min(12, 4 + placed), 'star');
  const label = placed === 1 ? BUILDING_CONFIGS[segments[0].placeType ?? type].label : `${placed} segments`;
  addFloatingText(state, firstX, firstY - 10, `🔨 ${label}`, '#22c55e', 'brief');
  impulseScreenShake(state, placed > 3 ? 3 : 2);
  return state;
}

export function isOnConstructionCrew(state: WorldState, humanId: number, exceptBuildingId?: number): boolean {
  return state.buildings.some(
    (b) => !b.completed && b.id !== exceptBuildingId && b.occupants.includes(humanId),
  );
}

export function pickAdultSettler(
  state: WorldState,
  preferredHumanId: number | undefined,
  filter: (e: Entity) => boolean,
): Entity | undefined {
  if (preferredHumanId !== undefined) {
    const preferred = state.entities.find((e) => e.id === preferredHumanId && filter(e));
    if (preferred) return preferred;
  }
  return state.entities.find(filter);
}

/** Mutates state — assign a settler to help build an unfinished structure. */
function applyBuilderAssignment(
  state: WorldState,
  buildingId: number,
  preferredHumanId?: number,
): WorldState {
  const building = state.buildings.find((b) => b.id === buildingId);
  if (!building || building.faction === 'rival' || building.completed) return state;

  const config = BUILDING_CONFIGS[building.type];
  if (building.occupants.length >= config.maxOccupants) return state;

  const builder = pickAdultSettler(
    state,
    preferredHumanId,
    (e) =>
      isPlayerHuman(e) &&
      !e.isJuvenile &&
      !hasWorkAssignment(e) &&
      !isImprisoned(e) &&
      !building.occupants.includes(e.id) &&
      !isOnConstructionCrew(state, e.id, buildingId),
  );

  if (!builder) {
    addFloatingText(state, building.x + building.width / 2, building.y, 'No idle settlers!', '#eab308');
    return state;
  }

  building.occupants.push(builder.id);
  addFloatingText(state, building.x, building.y - 10, '✓ Builder', '#22c55e', 'brief');
  addNotification(
    state,
    'Builder Assigned',
    `${builder.name || 'Settler'} is helping build ${config.label}`,
    'info',
  );
  return state;
}

/** Assign a settler to help build an unfinished structure (including houses). */
export function assignBuilderToBuilding(
  originalState: WorldState,
  buildingId: number,
  preferredHumanId?: number,
): WorldState {
  return applyBuilderAssignment(structuredClone(originalState) as WorldState, buildingId, preferredHumanId);
}

/** Mutates state — re-run automatic housing assignment for a residence. */
function applyResidentAssignment(state: WorldState, buildingId: number): WorldState {
  const building = state.buildings.find((b) => b.id === buildingId);
  if (!building || building.faction === 'rival' || !isResidenceBuilding(building)) return state;

  assignMissingResidences(state.entities.filter(isPlayerHuman), state.buildings);
  assignMissingWorkers(state.entities.filter(isPlayerHuman), state.buildings);
  return state;
}

/** Re-run automatic housing assignment (settlers pick homes by themselves). */
export function assignResidentToBuilding(
  originalState: WorldState,
  buildingId: number,
): WorldState {
  return applyResidentAssignment(structuredClone(originalState) as WorldState, buildingId);
}

/** Move an adult child (18+) and their own household into a free house. */
export function moveOutOfFamilyHome(originalState: WorldState, humanId: number): WorldState {
  const state = structuredClone(originalState) as WorldState;
  const human = state.entities.find((e) => e.id === humanId);
  if (!human || !isPlayerHuman(human)) return state;

  const humans = state.entities.filter(isPlayerHuman);
  const residences = state.buildings.filter(isResidenceBuilding);
  if (!tryMoveOutOfFamilyHome(human, humans, residences)) {
    const reason = !isAdultChildAtHome(human, humans)
      ? `Must be ${HUMAN_MOVE_OUT_MIN_AGE}+ and living with parents`
      : 'No empty house available';
    addFloatingText(state, human.x, human.y - 12, reason, '#ef4444');
    return state;
  }

  syncResidenceOccupants(state.entities, state.buildings);
  assignMissingResidences(humans, state.buildings);

  const household = collectOwnHousehold(human, humans);
  const who = human.name
    ? `${human.name}${human.surname ? ` ${human.surname}` : ''}`
    : 'Settler';
  const extra = household.length > 1 ? ` (+${household.length - 1} family)` : '';
  addFloatingText(state, human.x, human.y - 12, `${who} moved to own home${extra}`, '#3b82f6');
  addNotification(
    state,
    'New household',
    `${who}${extra} moved into their own home.`,
    'success',
  );
  return state;
}

export function removeResidentFromBuilding(
  originalState: WorldState,
  buildingId: number,
  humanId: number,
): WorldState {
  const state = structuredClone(originalState) as WorldState;
  const building = state.buildings.find((b) => b.id === buildingId);
  const human = state.entities.find((e) => e.id === humanId);
  if (!building || !human || human.residenceBuildingId !== buildingId) return state;

  human.residenceBuildingId = undefined;
  syncResidenceOccupants(state.entities, state.buildings);
  assignMissingResidences(
    state.entities.filter(isPlayerHuman),
    state.buildings,
  );
  assignMissingWorkers(state.entities.filter(isPlayerHuman), state.buildings);
  return state;
}

export function assignIdleWorkerToBuilding(originalState: WorldState, buildingId: number, preferredHumanId?: number): WorldState {
  const state = structuredClone(originalState) as WorldState;
  const building = state.buildings.find(b => b.id === buildingId);
  if (!building || building.faction === 'rival') return state;

  if (!building.completed) {
    return applyBuilderAssignment(state, buildingId, preferredHumanId);
  }

  if (isResidenceBuildingType(building.type)) {
    return applyResidentAssignment(state, buildingId);
  }

  const config = BUILDING_CONFIGS[building.type];
  if (building.occupants.length >= config.maxOccupants) return state;

  const job = BUILDING_JOB_TYPES[building.type];
  if (!job) return state;

  let idleHuman = pickAdultSettler(
    state,
    preferredHumanId,
    (e) => isPlayerHuman(e) && !e.isJuvenile && !hasWorkAssignment(e) && !isImprisoned(e),
  );

  if (!idleHuman && preferredHumanId === undefined) {
    const candidates = state.entities.filter(
      (e) => isPlayerHuman(e) && !e.isJuvenile && !hasWorkAssignment(e) && !isImprisoned(e),
    );
    candidates.sort((a, b) => readSkill(b, job) - readSkill(a, job));
    idleHuman = candidates[0];
  }

  let reassignedFrom: Building | undefined;
  if (!idleHuman) {
    const humans = state.entities.filter(isPlayerHuman);
    const jobBuildings = completedJobBuildings(state.buildings);
    const donor = findOverstaffedDonorBuilding(jobBuildings, humans, building.id);
    const transfer = donor ? pickWorkerToTransfer(humans, donor, building) : undefined;
    if (transfer && donor) {
      transferWorkerBetweenBuildings(transfer, donor, building);
      idleHuman = transfer;
      reassignedFrom = donor;
    }
  } else {
    building.occupants.push(idleHuman.id);
    idleHuman.homeBuildingId = building.id;
    idleHuman.occupation = getOccupationForBuilding(building.type);
    idleHuman.job = job;
    ensureEntitySkills(idleHuman)[job] = readSkill(idleHuman, job);
  }

  if (!idleHuman) {
    addFloatingText(state, building.x + building.width / 2, building.y, 'No idle workers!', '#eab308');
    return state;
  }

  const fromLabel = reassignedFrom ? BUILDING_CONFIGS[reassignedFrom.type].label : undefined;
  addFloatingText(
    state,
    building.x,
    building.y - 10,
    reassignedFrom ? '✓ Reassigned' : '✓ Worker',
    '#22c55e',
    'brief',
  );
  addNotification(
    state,
    reassignedFrom ? 'Worker Reassigned' : 'Worker Assigned',
    reassignedFrom
      ? `${idleHuman.name || 'Settler'}: ${fromLabel} → ${BUILDING_CONFIGS[building.type].label}`
      : `${idleHuman.name || 'Settler'} → ${BUILDING_CONFIGS[building.type].label}`,
    'info',
  );

  return state;
}

export function removeWorkerFromBuilding(originalState: WorldState, buildingId: number, humanId: number): WorldState {
  const state = structuredClone(originalState) as WorldState;
  const building = state.buildings.find(b => b.id === buildingId);
  const human = state.entities.find(e => e.id === humanId);
  if (!building || !human) return state;

  if (!building.completed) {
    building.occupants = building.occupants.filter((id) => id !== humanId);
    if (human.homeBuildingId === buildingId) {
      human.homeBuildingId = undefined;
      human.occupation = 'settler';
      human.job = JobType.Settler;
    }
    assignMissingWorkers(state.entities.filter(isPlayerHuman), state.buildings);
    return state;
  }

  if (isResidenceBuilding(building)) {
    return removeResidentFromBuilding(state, buildingId, humanId);
  }

  building.occupants = building.occupants.filter(id => id !== humanId);
  human.homeBuildingId = undefined;
  human.occupation = 'settler';
  human.job = JobType.Settler;
  assignMissingWorkers(state.entities.filter(isPlayerHuman), state.buildings);
  return state;
}

/** Idle settlers who can be picked for a job building (sorted by job skill). */
export function listAssignableWorkersForBuilding(
  state: WorldState,
  buildingId: number,
  limit = 12,
): Entity[] {
  const building = state.buildings.find((b) => b.id === buildingId);
  if (!building || !building.completed || building.faction === 'rival') return [];

  const job = BUILDING_JOB_TYPES[building.type];
  if (!job) return [];

  const cap = BUILDING_CONFIGS[building.type].maxOccupants;
  if (building.occupants.length >= cap) return [];

  const idle = state.entities.filter(
    (e) =>
      isPlayerHuman(e)
      && e.alive
      && !e.isJuvenile
      && !e.pregnant
      && !hasWorkAssignment(e)
      && !isImprisoned(e),
  );
  idle.sort((a, b) => readSkill(b, job) - readSkill(a, job));
  return idle.slice(0, limit);
}

export function canAssignWorkerToBuilding(state: WorldState, buildingId: number): boolean {
  const building = state.buildings.find((b) => b.id === buildingId);
  if (!building || building.faction === 'rival') return false;

  if (!building.completed) {
    const cap = BUILDING_CONFIGS[building.type].maxOccupants;
    if (building.occupants.length >= cap) return false;
    return state.entities.some(
      (e) =>
        isPlayerHuman(e)
        && e.alive
        && !e.isJuvenile
        && !e.pregnant
        && !building.occupants.includes(e.id)
        && !state.buildings.some((b) => !b.completed && b.id !== building.id && b.occupants.includes(e.id)),
    );
  }

  if (isResidenceBuildingType(building.type)) return false;

  const job = BUILDING_JOB_TYPES[building.type];
  if (!job) return false;

  const cap = BUILDING_CONFIGS[building.type].maxOccupants;
  if (building.occupants.length >= cap) return false;

  const humans = state.entities.filter(isPlayerHuman);
  if (
    humans.some(
      (h) => h.alive && !h.isJuvenile && !h.pregnant && !hasWorkAssignment(h) && !isImprisoned(h),
    )
  ) {
    return true;
  }

  return findOverstaffedDonorBuilding(completedJobBuildings(state.buildings), humans, building.id) !== undefined;
}

export function repairBuilding(originalState: WorldState, buildingId: number): WorldState {
  const state = structuredClone(originalState) as WorldState;
  const building = state.buildings.find(b => b.id === buildingId);
  if (!building || !building.completed || building.health >= building.maxHealth) return state;

  const costWood = 10;
  const costStone = 5;

  if (state.resources.wood < costWood || state.resources.stone < costStone) {
    addFloatingText(state, building.x + building.width / 2, building.y, `Need ${costWood}w ${costStone}s`, '#ef4444');
    return state;
  }

  state.resources.wood -= costWood;
  state.resources.stone -= costStone;
  building.health = building.maxHealth;
  createDeathParticles(state, building.x + building.width / 2, building.y, '#22c55e', 10, 'sparkle');
  addFloatingText(state, building.x, building.y - 10, 'Repaired!', '#22c55e');
  return state;
}

export function getBuildingUpgradeCost(building: Building): { wood: number; stone: number; gold: number } {
  return {
    wood: 50 * building.level,
    stone: 25 * building.level,
    gold: 50 * building.level,
  };
}

export function upgradeBuilding(originalState: WorldState, buildingId: number): WorldState {
  const state = structuredClone(originalState) as WorldState;
  const building = state.buildings.find(b => b.id === buildingId);
  if (!building || !building.completed) return state;
  if (building.level >= 3) return state;

  const { wood: costWood, stone: costStone, gold: costGold } = getBuildingUpgradeCost(building);

  if (state.resources.wood < costWood || state.resources.stone < costStone || state.resources.gold < costGold) {
    addFloatingText(state, building.x + building.width / 2, building.y, `Need ${costWood}w ${costStone}s ${costGold}g`, '#ef4444');
    return state;
  }

  state.resources.wood -= costWood;
  state.resources.stone -= costStone;
  state.resources.gold -= costGold;
  building.level += 1;

  const isHousing = isResidenceBuildingType(building.type);
  if (isHousing) {
    const cap = getResidenceCapacity(building);
    assignMissingResidences(state.entities.filter(isPlayerHuman), state.buildings);
    addFloatingText(state, building.x, building.y - 15, `Expanded! Fits ${cap} residents`, '#3b82f6');
    addNotification(
      state,
      'Home expanded',
      `${BUILDING_CONFIGS[building.type].label} now holds ${cap} family members.`,
      'success',
    );
  } else {
    addFloatingText(state, building.x, building.y - 15, `Upgraded to Lv.${building.level}!`, '#3b82f6');
  }

  createDeathParticles(state, building.x + building.width / 2, building.y, '#3b82f6', 15, 'star');
  impulseScreenShake(state, 3);
  return state;
}

export function recruitSettler(originalState: WorldState): WorldState {
  const state = structuredClone(originalState) as WorldState;
  const costFood = 30;
  const costGold = 20;

  if (state.humanPopulation >= state.maxHumanPopulation) {
    addFloatingText(state, state.width / 2, state.height / 2, 'At max population!', '#ef4444');
    return state;
  }

  if (state.resources.food < costFood || state.resources.gold < costGold) {
    addFloatingText(state, state.width / 2, state.height / 2, `Need ${costFood}f ${costGold}g`, '#ef4444');
    return state;
  }

  state.resources.food -= costFood;
  state.resources.gold -= costGold;

  let spawnX = state.width / 2, spawnY = state.height / 2;
  const home = state.buildings.find(b => b.type === BuildingType.House && b.completed);
  if (home) { spawnX = home.x + home.width / 2; spawnY = home.y + home.height / 2; }

  const settler = createEntity(EntityType.Human, spawnX + (Math.random() - 0.5) * 40, spawnY + (Math.random() - 0.5) * 40, state.nextEntityId++, 250);
  const recruitAge = HUMAN_ADULT_MIN_AGE + Math.floor(Math.random() * 20);
  setHumanBirthFromAge(settler, recruitAge, getColonyDay(state));
  settler.relationshipStatus = 'single';
  settler.partnerId = undefined;
  settler.courtshipProgress = 0;
  state.entities.push(settler);
  const recruited = state.entities.filter(isPlayerHuman);
  assignMissingResidences(recruited, state.buildings);
  assignMissingWorkers(recruited, state.buildings);

  createDeathParticles(state, settler.x, settler.y, '#fcd34d', 12, 'star');
  addFloatingText(state, settler.x, settler.y - 15, '+1 Settler!', '#22c55e');
  impulseScreenShake(state, 2);
  return state;
}

export function estimateWorkshopGold(state: WorldState, building: Building): number {
  const recipe = getWorkshopRecipe(building.workshopRecipeId);
  const workers = building.occupants.length;
  if (workers === 0) return recipe.baseGold;
  const levelMult = building.level || 1;
  const terrainMult = getTerrainEfficiencyMultiplier(state, building);
  const adjacencyMult = getAdjacencyMultiplierFromIndex(buildAdjacencyIndex(state.buildings), building);
  const skillMult = getWorkerSkillMultiplier(state, building);
  const festivalMult = state.festival?.active ? 1.5 : 1;
  const goldMult = getMultiplier(state, 'gold_production');
  const globalEff = getMultiplier(state, 'global_efficiency');
  const outputMult = (1 + workers * 0.5) * levelMult * terrainMult * adjacencyMult * festivalMult * skillMult * goldMult * globalEff;
  return Math.max(1, Math.floor(recipe.baseGold * outputMult));
}

export function setWorkshopRecipe(originalState: WorldState, buildingId: number, recipeId: string): WorldState {
  if (!WORKSHOP_RECIPES.some((r) => r.id === recipeId)) return originalState;
  const state = structuredClone(originalState) as WorldState;
  const building = state.buildings.find((b) => b.id === buildingId);
  if (!building || building.type !== BuildingType.Workshop || building.faction === 'rival') return originalState;
  building.workshopRecipeId = recipeId;
  return state;
}

export function demolishBuilding(originalState: WorldState, buildingId: number): WorldState {
  const state = structuredClone(originalState) as WorldState;
  const building = state.buildings.find(b => b.id === buildingId);
  if (!building) return state;

  const config = BUILDING_CONFIGS[building.type];
  const refundWood = Math.floor(config.cost.wood * 0.5);
  const refundStone = Math.floor(config.cost.stone * 0.5);
  const refundGold = Math.floor(config.cost.gold * 0.5);

  addResource(state, 'wood', refundWood);
  addResource(state, 'stone', refundStone);
  addResource(state, 'gold', refundGold);

  state.entities = state.entities.map(e => {
    const cleared: Partial<Entity> = {};
    if (e.homeBuildingId === buildingId) {
      cleared.homeBuildingId = undefined;
      cleared.occupation = 'settler';
      cleared.job = JobType.Settler;
    }
    if (e.residenceBuildingId === buildingId) {
      cleared.residenceBuildingId = undefined;
    }
    if (e.prisonBuildingId === buildingId) {
      cleared.prisonBuildingId = undefined;
      cleared.prisonerUntilTick = undefined;
      cleared.prisonSentenceCrime = undefined;
    }
    if (Object.keys(cleared).length > 0) return { ...e, ...cleared };
    return e;
  });

  createDeathParticles(state, building.x + building.width / 2, building.y + building.height / 2, '#71717a', 25, 'smoke');
  addFloatingText(state, building.x, building.y - 10, `Refunded: ${refundWood}w ${refundStone}s`, '#eab308');
  impulseScreenShake(state, 4);

  state.buildings = state.buildings.filter(b => b.id !== buildingId);
  const humans = state.entities.filter(isPlayerHuman);
  assignMissingResidences(humans, state.buildings);
  assignMissingWorkers(humans, state.buildings);
  return state;
}

/** Debug/testing: curse a random adult settler as a Moon Howler. */
export function spawnMoonHowlerDebug(originalState: WorldState): WorldState {
  const state = structuredClone(originalState) as WorldState;
  const candidates = state.entities.filter((e) => e.alive && canMoonHowlerCurse(e));
  const pick = candidates[Math.floor(Math.random() * candidates.length)];

  if (pick) {
    const who = pick.name ? `${pick.name}${pick.surname ? ` ${pick.surname}` : ''}` : 'A settler';
    curseMoonHowler(pick);
    const line = WEREWOLF_CURSE_LINES[Math.floor(Math.random() * WEREWOLF_CURSE_LINES.length)](who);
    addBigNews(state, '🌝 Debug Moon Howler!', `(Test) ${line}`, 'negative');
    addFloatingText(state, pick.x, pick.y - 20, 'Cursed…', '#c4b5fd');
    logEvent(state, 'event', `(Debug) ${who} was cursed as a Moon Howler`, who);
    return state;
  }

  const settler = createEntity(EntityType.Human, state.width / 2, state.height / 2, state.nextEntityId++, 400);
  const debugAge = HUMAN_ADULT_MIN_AGE + Math.floor(Math.random() * 20);
  settler.generation = 1;
  setHumanBirthFromAge(settler, debugAge, getColonyDay(state));
  curseMoonHowler(settler);
  state.entities.push(settler);
  addBigNews(state, '🌝 Debug Moon Howler!', '(Test) A cursed wanderer arrived from the woods.', 'negative');
  addFloatingText(state, settler.x, settler.y - 20, 'Cursed…', '#c4b5fd');
  logEvent(state, 'event', '(Debug) Cursed Moon Howler spawned at map center', settler.name);
  return state;
}

export function getTameFoodCost(type: EntityType): number | null {
  switch (type) {
    case EntityType.Wolf: return 40;
    case EntityType.Fox: return 25;
    case EntityType.Deer: return 30;
    case EntityType.Rabbit: return 10;
    default: return null;
  }
}

export function tameEntity(originalState: WorldState, entityId: number, humanId: number): WorldState {
  const state = structuredClone(originalState) as WorldState;
  const entity = state.entities.find(e => e.id === entityId);
  const human = state.entities.find(e => e.id === humanId && e.type === EntityType.Human);
  if (!entity || !human || !isPlayerHuman(human) || entity.tamedBy) return state;

  const interactableWildlife: EntityType[] = [
    EntityType.Wolf, EntityType.Fox, EntityType.Deer, EntityType.Rabbit, EntityType.Werewolf,
  ];
  if (!interactableWildlife.includes(entity.type)) {
    addFloatingText(state, entity.x, entity.y - 10, 'Cannot tame this creature', '#ef4444');
    return state;
  }

  if (entity.type === EntityType.Werewolf) {
    addFloatingText(state, entity.x, entity.y - 10, 'Build a Church to break the curse', '#ef4444');
    return state;
  }

  const hasPost = state.buildings.some(b => b.completed && b.type === BuildingType.TamingPost &&
    Math.hypot(b.x - entity.x, b.y - entity.y) < 140);
  if (!hasPost) {
    addFloatingText(state, entity.x, entity.y - 10, 'Need a Taming Post nearby', '#ef4444');
    return state;
  }

  const cost = getTameFoodCost(entity.type);
  if (cost === null) return state;
  if (state.resources.food < cost) {
    addFloatingText(state, entity.x, entity.y - 10, `Need ${cost} food`, '#ef4444');
    return state;
  }

  state.resources.food -= cost;
  entity.tamedBy = human.id;
  const humanName = human.name || 'A settler';
  addFloatingText(state, entity.x, entity.y - 15, 'Tamed!', '#22c55e');
  logEvent(state, 'migration', `${humanName} tamed a ${entity.type}`);
  return state;
}

// Job-building helpers shared between assignment actions.
const AUTO_JOB_BUILDING_PRIORITY: BuildingType[] = [
  BuildingType.Farm,
  BuildingType.Greenhouse,
  BuildingType.LumberMill,
  BuildingType.Quarry,
  BuildingType.Mine,
  BuildingType.Blacksmith,
  BuildingType.Workshop,
  BuildingType.Store,
  BuildingType.Market,
  BuildingType.School,
  BuildingType.Hospital,
  BuildingType.TownHall,
  BuildingType.Church,
];

function jobBuildingPriority(type: BuildingType): number {
  const idx = AUTO_JOB_BUILDING_PRIORITY.indexOf(type);
  return idx === -1 ? AUTO_JOB_BUILDING_PRIORITY.length : idx;
}

function countWorkersAtBuilding(humans: Entity[], buildingId: number): number {
  return humans.filter((h) => h.alive && !h.faction && h.homeBuildingId === buildingId).length;
}

function completedJobBuildings(buildings: Building[]): Building[] {
  return buildings
    .filter((b) => {
      if (!b.completed || b.faction === 'rival' || !BUILDING_JOB_TYPES[b.type]) return false;
      return BUILDING_CONFIGS[b.type].maxOccupants > 0;
    })
    .sort((a, b) => {
      const prio = jobBuildingPriority(a.type) - jobBuildingPriority(b.type);
      if (prio !== 0) return prio;
      return a.id - b.id;
    });
}

function findOverstaffedDonorBuilding(
  jobBuildings: Building[],
  humans: Entity[],
  excludeBuildingId: number,
): Building | undefined {
  return jobBuildings
    .filter((b) => b.id !== excludeBuildingId && countWorkersAtBuilding(humans, b.id) >= 2)
    .sort((a, b) => countWorkersAtBuilding(humans, a.id) - countWorkersAtBuilding(humans, b.id))[0];
}

function pickWorkerToTransfer(
  humans: Entity[],
  fromBuilding: Building,
  toBuilding: Building,
): Entity | undefined {
  const toJob = BUILDING_JOB_TYPES[toBuilding.type];
  const fromJob = BUILDING_JOB_TYPES[fromBuilding.type];
  if (!toJob || !fromJob) return undefined;

  const workers = humans.filter(
    (h) =>
      isPlayerHuman(h)
      && h.alive
      && !h.isJuvenile
      && !h.pregnant
      && h.homeBuildingId === fromBuilding.id,
  );
  if (workers.length === 0) return undefined;

  workers.sort((a, b) => {
    const aFit = readSkill(a, toJob) - readSkill(a, fromJob);
    const bFit = readSkill(b, toJob) - readSkill(b, fromJob);
    return bFit - aFit;
  });
  return workers[0];
}

function transferWorkerBetweenBuildings(
  worker: Entity,
  fromBuilding: Building,
  toBuilding: Building,
): void {
  const job = BUILDING_JOB_TYPES[toBuilding.type];
  if (!job) return;

  fromBuilding.occupants = fromBuilding.occupants.filter((id) => id !== worker.id);
  if (!toBuilding.occupants.includes(worker.id)) toBuilding.occupants.push(worker.id);

  worker.homeBuildingId = toBuilding.id;
  worker.occupation = getOccupationForBuilding(toBuilding.type);
  worker.job = job;
  ensureEntitySkills(worker)[job] = readSkill(worker, job);
}
