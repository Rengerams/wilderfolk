import type { WorldState, Entity, Building } from './gameTypes';
import {
  BuildingType, EntityType,
  BUILDING_CONFIGS, BUILDING_JOB_TYPES,
  WORKSHOP_RECIPES, getWorkshopRecipe,
  HUNTING_SPOT_PREY_OPTIONS,
  WEREWOLF_CURSE_LINES,
} from './gameTypes';
import type { HuntingSpotPrey, StaffingMode } from './gameTypes';
import type { MineMode } from './buildings';
import { getWorkerSkillMultiplier } from './skills';
import { addResource } from './economy';
import {
  addFloatingText,
  addNotification,
  addBigNews,
  createDeathParticles,
  impulseScreenShake,
} from './simEffects';
import { getMultiplier } from './simHelpers';
import { assignMissingWorkers, removeWorkerTransition } from './workforce';
import {
  assignIdleWorkerToBuilding as assignStaffingWorkerToBuilding,
  removeWorkerFromBuilding as removeStaffingWorkerFromBuilding,
} from './buildingStaffingActions';
import { unindexAdjacency, ensureAdjacencyIndex, getAdjacencyMultiplierFromIndex } from './adjacencyIndex';
import { getTerrainEfficiencyMultiplier } from './terrainSystems';
import { indexLivingEntity } from './entityIndex';
import { isPlayerHuman, playerHumanCount } from './playerHuman';
import {
  assignMissingResidences,
  collectOwnHousehold,
  isAdultChildAtHome,
  isResidenceBuilding,
  isResidenceBuildingType,
  getResidenceCapacity,
  syncResidenceOccupants,
  tryMoveOutOfFamilyHome,
  HUMAN_ADULT_MIN_AGE,
  HUMAN_MOVE_OUT_MIN_AGE,
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
    return applyResidentAssignment(structuredClone(originalState), buildingId);
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
    return removeResidentFromBuilding(originalState, buildingId, humanId);
  }
  return removeStaffingWorkerFromBuilding(originalState, buildingId, humanId);
}

/** Mutates state — re-run automatic housing assignment for a residence. */
function applyResidentAssignment(state: WorldState, buildingId: number): WorldState {
  const building = state.buildings.find((b) => b.id === buildingId);
  if (!building || building.faction === 'rival' || !isResidenceBuilding(building)) return state;

  assignMissingResidences(
    listPlayerHumans(state),
    state.buildings,
    state.entities,
  );
  assignMissingWorkers(listPlayerHumans(state), state.buildings);
  return state;
}

/** Re-run automatic housing assignment (settlers pick homes by themselves). */
export function assignResidentToBuilding(
  originalState: WorldState,
  buildingId: number,
): WorldState {
  return applyResidentAssignment(structuredClone(originalState), buildingId);
}

/** Move an adult child (18+) and their own household into a free house. */
export function moveOutOfFamilyHome(originalState: WorldState, humanId: number): WorldState {
  const state = structuredClone(originalState);
  const human = state.entities.find((e) => e.id === humanId);
  if (!human || !isPlayerHuman(human)) return state;

  const humans = listPlayerHumans(state);
  const residences = state.buildings.filter(isResidenceBuilding);
  if (!tryMoveOutOfFamilyHome(human, humans, residences)) {
    const reason = !isAdultChildAtHome(human, humans)
      ? `Must be ${HUMAN_MOVE_OUT_MIN_AGE}+ and living with parents`
      : 'No empty house available';
    addFloatingText(state, human.x, human.y - 12, reason, '#ef4444');
    return state;
  }

  syncResidenceOccupants(state.entities, state.buildings);
  assignMissingResidences(humans, state.buildings, state.entities);

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
  const state = structuredClone(originalState);
  const building = state.buildings.find((b) => b.id === buildingId);
  const human = state.entities.find((e) => e.id === humanId);
  if (!building || !human || human.residenceBuildingId !== buildingId) return state;

  human.residenceBuildingId = undefined;
  syncResidenceOccupants(state.entities, state.buildings);
  assignMissingResidences(
    listPlayerHumans(state),
    state.buildings,
    state.entities,
  );
  assignMissingWorkers(listPlayerHumans(state), state.buildings);
  return state;
}



export function repairBuilding(originalState: WorldState, buildingId: number): WorldState {
  const state = structuredClone(originalState);
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
  const state = structuredClone(originalState);
  const building = state.buildings.find(b => b.id === buildingId);
  if (!building || !building.completed) return state;
  if (building.level >= 3) return state;
  // The Leader's House comes with the office fully built — no upgrades.
  if (building.type === BuildingType.LeaderHouse) return state;

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
    assignMissingResidences(
      listPlayerHumans(state),
      state.buildings,
      state.entities,
    );
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

export function setWorkshopRecipe(originalState: WorldState, buildingId: number, recipeId: string): WorldState {
  if (!WORKSHOP_RECIPES.some((r) => r.id === recipeId)) return originalState;
  const state = structuredClone(originalState);
  const building = state.buildings.find((b) => b.id === buildingId);
  if (!building || building.type !== BuildingType.Workshop || building.faction === 'rival') return originalState;
  building.workshopRecipeId = recipeId;
  return state;
}

export function setBuildingStaffingMode(originalState: WorldState, buildingId: number, mode: StaffingMode): WorldState {
  const state = structuredClone(originalState);
  const building = state.buildings.find((b) => b.id === buildingId);
  if (!building || building.faction === 'rival' || !BUILDING_JOB_TYPES[building.type]) return originalState;
  building.staffingMode = mode;
  return state;
}

export function setMineMode(originalState: WorldState, buildingId: number, mode: MineMode): WorldState {
  const state = structuredClone(originalState);
  const building = state.buildings.find((b) => b.id === buildingId);
  if (!building || building.type !== BuildingType.Mine) return state;
  building.mineMode = mode;
  return state;
}

export function setHuntingSpotPrey(originalState: WorldState, buildingId: number, prey: HuntingSpotPrey): WorldState {
  if (!HUNTING_SPOT_PREY_OPTIONS.some((o) => o.id === prey)) return originalState;
  const state = structuredClone(originalState);
  const building = state.buildings.find((b) => b.id === buildingId);
  if (!building || building.type !== BuildingType.HuntingSpot || building.faction === 'rival') return originalState;
  building.huntingSpotPrey = prey;
  return state;
}

export function demolishBuilding(originalState: WorldState, buildingId: number): WorldState {
  const state = structuredClone(originalState);
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
    // Workforce cleanup through the owner's removal transition — keeps
    // homeBuildingId / occupation / job consistent (§3 single-writer law).
    if (e.homeBuildingId === buildingId) {
      removeWorkerTransition(e, state.buildings);
    }
    if (e.residenceBuildingId === buildingId) {
      e.residenceBuildingId = undefined;
    }
    if (e.prisonBuildingId === buildingId) {
      e.prisonBuildingId = undefined;
      e.prisonerUntilTick = undefined;
      e.prisonSentenceCrime = undefined;
    }
    return e;
  });

  createDeathParticles(state, building.x + building.width / 2, building.y + building.height / 2, '#71717a', 25, 'smoke');
  addFloatingText(state, building.x, building.y - 10, `Refunded: ${refundWood}w ${refundStone}s`, '#eab308');
  impulseScreenShake(state, 4);

  unindexAdjacency(state, buildingId);
  state.adjacency = undefined;
  if (building.type === BuildingType.Road) {
    state.roadAvoidance = undefined;
    state.roadAvoidanceStamp = undefined;
  }
  state.buildings = state.buildings.filter(b => b.id !== buildingId);
  // Keep the denormalized completed-building counter consistent with the
  // load-time recompute (saveLoad counts CURRENT completed buildings): a
  // completed player building being demolished must decrement it.
  if (building.completed && building.faction !== 'rival') {
    state.totalBuildingsCompleted = Math.max(0, state.totalBuildingsCompleted - 1);
  }
  const humans = listPlayerHumans(state);
  assignMissingResidences(humans, state.buildings, state.entities);
  assignMissingWorkers(humans, state.buildings);
  return state;
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

