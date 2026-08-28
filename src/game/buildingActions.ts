import type { WorldState, Entity, Building } from './gameTypes';
import {
  BuildingType, EntityType,
  getWorkshopRecipe,
  WEREWOLF_CURSE_LINES,
} from './gameTypes';
import { getWorkerSkillMultiplier } from './skills';
import {
  addFloatingText,
  addBigNews,
  createDeathParticles,
  impulseScreenShake,
} from './simEffects';
import { getMultiplier } from './simHelpers';
import { assignMissingWorkers } from './workforce';
import {
  assignIdleWorkerToBuilding as assignStaffingWorkerToBuilding,
  removeWorkerFromBuilding as removeStaffingWorkerFromBuilding,
} from './buildingStaffingActions';
import {
  assignResidentToBuilding as assignResidentToResidence,
  removeResidentFromBuilding as removeResidentFromResidence,
} from './buildingResidencyActions';
import { ensureAdjacencyIndex, getAdjacencyMultiplierFromIndex } from './adjacencyIndex';
import { getTerrainEfficiencyMultiplier } from './terrainSystems';
import { indexLivingEntity } from './entityIndex';
import { isPlayerHuman, playerHumanCount } from './playerHuman';
import {
  assignMissingResidences,
  isResidenceBuilding,
  isResidenceBuildingType,
} from './residency';
import {
  HUMAN_ADULT_MIN_AGE,
  getAbsoluteCalendarDay,
  getColonyDay,
  getHourOfDay,
  setHumanBirthFromAge,
} from './dayCycle';
import {
  canMoonHowlerCurse,
  curseMoonHowler,
  isMoonHowlerTransformTick,
  transformToWerewolfForm,
} from './moonHowler';
import { createEntity } from './entityFactory';
import { getRandomSurname } from './nameLoader';
import { logEvent } from './eventLog';

/** Living player humans — one filter pass when actions need the settler list repeatedly. */
function listPlayerHumans(state: WorldState): Entity[] {
  return state.entities.filter(isPlayerHuman);
}

export {
  UNBUILDABLE_TERRAIN,
  buildStripPreview,
  canPlaceBuilding,
  getPlaceBuildingFailureReason,
  isFootprintOnBuildableTerrain,
  isFootprintWithinMapBounds,
  placeStripChain,
  startBuilding,
} from './buildingPlacementActions';

export {
  assignBuilderToBuilding,
  autoStaffAllWorkers,
  canAssignWorkerToBuilding,
  fillBuildingWorkers,
  isOnConstructionCrew,
  listAssignableWorkersForBuilding,
  pickAdultSettler,
} from './buildingStaffingActions';

/**
 * Preserve the legacy generic command: housing continues through its dedicated
 * residency action, while construction and jobs delegate to staffing actions.
 */
export function assignIdleWorkerToBuilding(
  originalState: WorldState,
  buildingId: number,
  preferredHumanId?: number,
): WorldState {
  const building = originalState.buildings.find((candidate) => candidate.id === buildingId);
  if (building?.completed && isResidenceBuildingType(building.type)) {
    return assignResidentToResidence(originalState, buildingId);
  }
  return assignStaffingWorkerToBuilding(originalState, buildingId, preferredHumanId);
}

/** Preserve the legacy generic removal command while keeping residence removal separate. */
export function removeWorkerFromBuilding(
  originalState: WorldState,
  buildingId: number,
  humanId: number,
): WorldState {
  const building = originalState.buildings.find((candidate) => candidate.id === buildingId);
  if (building?.completed && isResidenceBuilding(building)) {
    return removeResidentFromResidence(originalState, buildingId, humanId);
  }
  return removeStaffingWorkerFromBuilding(originalState, buildingId, humanId);
}

export {
  assignResidentToBuilding,
  moveOutOfFamilyHome,
  removeResidentFromBuilding,
} from './buildingResidencyActions';

export {
  demolishBuilding,
  getBuildingUpgradeCost,
  repairBuilding,
  upgradeBuilding,
} from './buildingMaintenanceActions';

export {
  setBuildingStaffingMode,
  setHuntingSpotPrey,
  setMineMode,
  setWorkshopRecipe,
} from './buildingConfigurationActions';

export function recruitSettler(originalState: WorldState): WorldState {
  const state = structuredClone(originalState);
  const costFood = 30;
  const costGold = 20;

  if (playerHumanCount(state.entities) >= state.maxHumanPopulation) {
    addFloatingText(state, state.width / 2, state.height / 2, 'At max population!', '#ef4444');
    return state;
  }

  if (state.resources.food < costFood || state.resources.gold < costGold) {
    addFloatingText(state, state.width / 2, state.height / 2, `Need ${costFood}f ${costGold}g`, '#ef4444');
    return state;
  }

  state.resources.food -= costFood;
  state.resources.gold -= costGold;

  // Spawn beside a completed player building (house preferred) so recruits never
  // appear on water/mountains — buildings only ever stand on valid land.
  const spawnAnchor =
    state.buildings.find((b) => b.type === BuildingType.House && b.completed && b.faction !== 'rival')
    ?? state.buildings.find((b) => b.completed && b.faction !== 'rival');
  let spawnX = state.width / 2, spawnY = state.height / 2;
  if (spawnAnchor) { spawnX = spawnAnchor.x + spawnAnchor.width / 2; spawnY = spawnAnchor.y + spawnAnchor.height / 2; }

  const recruitAge = HUMAN_ADULT_MIN_AGE + Math.floor(Math.random() * 20);
  const settler = createEntity(
    EntityType.Human,
    spawnX + (Math.random() - 0.5) * 40,
    spawnY + (Math.random() - 0.5) * 40,
    state.nextEntityId++,
    undefined,
    false,
    { ageYears: recruitAge, colonyDay: getColonyDay(state), surname: getRandomSurname() },
  );
  settler.relationshipStatus = 'single';
  settler.partnerId = undefined;
  settler.courtshipProgress = 0;
  state.entities.push(settler);
  indexLivingEntity(state, settler);
  const recruited = listPlayerHumans(state);
  assignMissingResidences(recruited, state.buildings, state.entities);
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
  const adjacencyMult = getAdjacencyMultiplierFromIndex(ensureAdjacencyIndex(state), building);
  const skillMult = getWorkerSkillMultiplier(state, building);
  const festivalMult = state.festival?.active ? 1.5 : 1;
  const goldMult = getMultiplier(state, 'gold_production');
  const globalEff = getMultiplier(state, 'global_efficiency');
  const outputMult = (1 + workers * 0.5) * levelMult * terrainMult * adjacencyMult * festivalMult * skillMult * goldMult * globalEff;
  return Math.max(1, Math.floor(recipe.baseGold * outputMult));
}

/** Debug/testing: curse a random adult settler as a Moon Howler. */
export function spawnMoonHowlerDebug(originalState: WorldState): WorldState {
  const state = structuredClone(originalState);
  const candidates = state.entities.filter((e) => e.alive && canMoonHowlerCurse(e));
  const pick = candidates[Math.floor(Math.random() * candidates.length)];

  if (pick) {
    const who = pick.name ? `${pick.name}${pick.surname ? ` ${pick.surname}` : ''}` : 'A settler';
    curseMoonHowler(pick);
    const colonyDay = getAbsoluteCalendarDay(state.tick);
    const hourOfDay = getHourOfDay(state.tick);
    if (isMoonHowlerTransformTick(colonyDay, hourOfDay)) {
      transformToWerewolfForm(pick);
    }
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
  indexLivingEntity(state, settler);
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
  const state = structuredClone(originalState);
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
    addFloatingText(state, entity.x, entity.y - 10, 'Staff a Church — cures roll on full-moon nights (20:00–06:00)', '#ef4444');
    return state;
  }

  const hasPost = state.buildings.some((b) => b.completed && b.type === BuildingType.TamingPost
    && Math.hypot(b.x + b.width / 2 - entity.x, b.y + b.height / 2 - entity.y) < 140);
  if (!hasPost) {
    addFloatingText(state, entity.x, entity.y - 10, 'Need a Taming Post nearby', '#ef4444');
    return state;
  }

  const cost = getTameFoodCost(entity.type);
  if (cost === null) {
    addFloatingText(state, entity.x, entity.y - 10, 'Cannot tame this creature', '#ef4444');
    return state;
  }
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

