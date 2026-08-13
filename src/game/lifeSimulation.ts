import type { WorldState, Entity, Building } from './gameTypes';
import {
  EntityType,
  BuildingType,
  JobType,
  Season,
  TerrainType,
  TERRAIN_TILE_SIZE,
  WEREWOLF_ATTACK_LINES,
  WEREWOLF_HOWL_LINES,
  BUILDING_CONFIGS,
} from './gameTypes';
import { isBarracksGuard } from './defenseStructures';
import { SPECIES_CONFIG } from './speciesConfig';
import {
  OFFSCREEN_HUMAN_THROTTLE,
  OFFSCREEN_WILDLIFE_THROTTLE,
  WILDLIFE_LAYER_INTERVAL,
  isInFocus,
  type SimulationFocus,
} from './simFocus';
import {
  addBigNews,
  addFloatingText,
  addNotification,
  createDeathParticles,
  impulseScreenShake,
} from './simEffects';
import {
  getChurchStrength,
  findHumanWorkplace,
  buildConstructionCrewIndex,
  countWorkersAtBuilding,
} from './workforce';
import { addResource } from './economy';
import {
  GRAZE_BITE_ENERGY,
  GRASS_GRAZE_MIN_ENERGY,
  GRASS_GROWTH_PER_TICK,
} from './grassEcology';
import { isPlayerHuman } from './playerHuman';
import { isSettlerRelationshipEntity } from './moonHowler';
import { getElectionGatherTarget } from './villageLeadership';
import {
  getValleyIllnessChanceBonus,
  getValleyHuntYieldMultiplier,
  valleyStageIndex,
} from './ecologyStage';
import {
  HUMAN_ADULT_MIN_AGE,
  HUMAN_ADULT_MAX_AGE,
  tryGraduateHumanChild,
  HUMAN_CHILDHOOD_DAYS,
  HUMAN_MAX_LIFESPAN_YEARS,
  getColonyDay,
  setHumanBirthFromAge,
  syncHumanAgeFromCalendar,
  PER_TICK_RATE_SCALE,
  TICKS_PER_HOUR,
  HUMAN_DAILY_ILLNESS_CHANCE,
  HUMAN_DAILY_PREGNANCY_CHANCE_HOME,
  HUMAN_DAILY_PREGNANCY_CHANCE_NEAR,
  HUMAN_DAILY_AFFAIR_PREGNANCY_CHANCE,
  PREGNANCY_TICKS,
  REPRODUCTION_COOLDOWN_TICKS,
  allowSocialLife,
  hasResidenceAssignment,
  hasWorkAssignment,
  isWorkHour,
  isOnWorkShift,
  isOnInnkeeperShift,
  isOnMoonHowlerNightShift,
  isWeekend,
  prefersHomeTonight,
  personDayRoll,
  getAbsoluteCalendarDay,
  isNearResidence,
  isResidenceBuilding,
  pickResidenceForHuman,
  pickResidenceForHumanExcluding,
  syncResidenceOccupants,
  killHuman,
  isKillableSettlerEntity,
  rebuildChildrenIds,
  getChildCustodian,
  shareResidence,
  shouldBeAtHome,
  syncPartnerResidence,
  isNewCalendarDayTick,
  TICKS_PER_DAY,
  WORK_START,
  EVENING_START,
  TAVERN_SHIFT_START,
  isProductionTick,
  isStartOfClockHour,
  getFemaleFertility,
  getOldAgeDeathChance,
  EVENT_INTERVAL,
  ticksForDays,
} from './dayCycle';
import {
  chatHintsFromWorld,
  maybeDialogueChat,
  sayHumanChatPhrase,
  tickHumanChat,
  tryAmbientRandomDialogue,
  type HumanChatContext,
} from './humanChat';
import { advanceHumanWalkAnim, pickHumanVariant } from './humanSprites';
import { appendDeathAge, formatCitizenName, formatDeathLog } from './citizenId';
import {
  dissolveMarriage,
  formatCaughtCheaterDivorceDetail,
  getRandomName,
  resolveChildSurname,
  syncMarriageSurnames,
} from './nameLoader';
import { isRenffrGossipActive } from './renffrStar';
import {
  getHumanHuntRange,
  getHumanFleeSpeedMultiplier,
  getHuntFoodMultiplier,
  rollPredatorBlock,
  rollCounterAttack,
} from './combat';
import { isActiveMoonHowler } from './moonHowler';
import { isEntityOnBuilding } from './buildingRotation';
import { createEntity } from './entityFactory';
import { logEvent } from './eventLog';
import {
  applyEducationGraduation,
  creditChildSchoolDay,
  findSchoolForChild,
  getSchoolAgeMultiplier,
  recordChildSchoolTick,
} from './education';
import { dampScandalReputationLoss } from './townHall';
import { getPlayerCampCenter, isRaidMarchingForRival } from './frontierCombat';
import { getCaravanMoveTarget, tryAdvanceCaravanLeg } from './tradeCaravans';
import { tickFactionCampWander } from './factionWander';
import {
  pickSocialImpulse,
  tryNeighborGreeting,
  tryWorkplaceBanter,
} from './socialLife';
import { doctorTreatNearby, isDoctorAtHospital, needsMedicalCare, treatPatientAtHospital } from './hospitalCare';
import {
  isOfficialAtHall,
  officialHandlePetitioners,
  resolveCivicPetition,
  wantsCivicAudience,
} from './townHall';
import {
  hotelierGreetGuests,
  isHotelierAtHotel,
  steerVisitorToHotel,
} from './hotelStay';
import { setCurrentPathMap, steerWithPath } from './pathfinding';
import { recordFoodConsumed } from './economyLedger';
import type { EntitySpatialGrid, RoadAvoidanceIndex } from './spatialGrid';
import {
  MOBILE_CELL_SIZE,
  buildRoadAvoidanceIndex,
  syncSpatialGridEntity,
} from './spatialGrid';
import {
  buildGrassPopulationSnapshot,
  buildResidenceOccupantIndex,
  buildWildlifePopulationSnapshot,
  findClosestEntityInRadius,
  findClosestInEntityGrid,
  forEachInEntityGrid,
  getHousemates,
  queryIsNearRoad,
  queryRoadAvoidance,
  getLivingEntity,
  grassPopulationTotal,
  recordGrassBirth,
  recordGrassDeath,
  recordWildlifeBirth,
  wildlifeTypePopulation,
  type GrassPopulationSnapshot,
  type WildlifePopulationSnapshot,
} from './simQueries';
import type { ScentGrid } from './scentGrid';
import {
  USE_SCENT_GRID,
  RABBIT_SCENT_SENSITIVITY,
  DEER_SCENT_SENSITIVITY,
  WILDKIN_SCENT_SENSITIVITY,
} from './scentGrid';
import { addHuntVisual } from './huntvisuals';
import { inheritSettlerTraits, traitMultiplier } from './settlerTraits';

export interface TickContext {
  width: number;
  height: number;
  hourOfDay: number;
  season: Season;
  grassMult: number;
  reproMult: number;
  winterPenalty: number;
  canHeat: boolean;
  byType: Record<EntityType, Entity[]>;
  /** Alive entities at tick start — avoids re-filtering state.entities in each layer. */
  aliveEntities: Entity[];
  newEntities: Entity[];
  updatedBuildings: Building[];
  roadBuildings: Building[];
  playerHumans: Entity[];
  entityById: Map<number, Entity>;
  buildingById: Map<number, Building>;
  predators: Entity[];
  grassGrid?: EntitySpatialGrid;
  mobileGrid?: EntitySpatialGrid;
  residenceOccupants?: Map<number, Entity[]>;
  grassPopulation?: GrassPopulationSnapshot;
  roadAvoidance?: RoadAvoidanceIndex;
  huntTargetByPreyId?: Map<number, Set<number>>;
  wildlifePopulation?: WildlifePopulationSnapshot;
  scentGrid?: ScentGrid;
  focus?: SimulationFocus;
  /** Newborn wildlife id → parent id (same-tick population cap excludes self-spawns). */
  wildlifeSpawnParent?: Map<number, number>;
  hasWell?: boolean;
  hasHospital?: boolean;
  grassCap?: number;
}

/** Spouse proximity that blocks starting or pursuing an affair. */
const AFFAIR_SPOUSE_BLOCK_RADIUS = 22;
/** Building / marital-home proximity for affair tryst validation. */
const AFFAIR_BUILDING_NEAR_RADIUS = 55;
/** Off-screen daily affair encounter tryst distance. */
const AFFAIR_DAILY_TRYST_RADIUS = 95;
/** Live on-screen intimate tryst distance. */
const AFFAIR_INTIMATE_RADIUS = 22;
/** Medium map reference area for grass population cap scaling. */
const GRASS_CAP_REFERENCE_AREA = 1200 * 900;
const GRASS_CAP_BASE = 500;

/** Mobile fauna only — grass is daily; trees are never sim-ticked. */
const WILDLIFE_TICK_TYPES: EntityType[] = [
  EntityType.Rabbit,
  EntityType.Deer,
  EntityType.Wolf,
  EntityType.Fox,
  EntityType.Werewolf,
  EntityType.Wildkin,
];

function pushNewEntity(state: WorldState, ctx: TickContext, entity: Entity): void {
  if (
    entity.type !== EntityType.Human
    && entity.type !== EntityType.Tree
    && entity.type !== EntityType.Grass
  ) {
    entity.birthYear = state.year;
  }
  ctx.newEntities.push(entity);
  ctx.entityById.set(entity.id, entity);
  if (ctx.wildlifePopulation) {
    recordWildlifeBirth(
      ctx.wildlifePopulation,
      entity.type,
      ctx.wildlifeSpawnParent?.get(entity.id),
      entity.id,
    );
  }
  if (entity.type === EntityType.Grass && ctx.grassPopulation) {
    recordGrassBirth(ctx.grassPopulation, entity.id);
  }
  syncSpatialGridEntity(entity, ctx.grassGrid, ctx.mobileGrid);
}

function markGrassDead(ctx: TickContext, grass: Entity): void {
  if (grass.type !== EntityType.Grass || !grass.alive) return;
  grass.alive = false;
  ctx.entityById.delete(grass.id);
  if (ctx.grassPopulation) recordGrassDeath(ctx.grassPopulation);
}

/** Wildlife tick death — cursed settlers in werewolf form use human widow/building cleanup. */
function markWildlifeDead(
  ctx: TickContext,
  entity: Entity,
  wildlifeDeathsThisTick?: Set<number>,
  tick?: number,
): void {
  if (!entity.alive) return;
  if (isKillableSettlerEntity(entity)) {
    killHuman(entity, ctx.updatedBuildings, ctx.entityById, tick);
  } else {
    entity.alive = false;
    ctx.entityById.delete(entity.id);
    wildlifeDeathsThisTick?.add(entity.id);
  }
  // Drop from byType immediately so same-tick hunters / AI fallbacks skip corpse.
  const bucket = ctx.byType[entity.type];
  if (bucket) {
    const idx = bucket.indexOf(entity);
    if (idx >= 0) bucket.splice(idx, 1);
  }
}

function syncEntityGrids(ctx: TickContext, entity: Entity): void {
  syncSpatialGridEntity(entity, ctx.grassGrid, ctx.mobileGrid);
}



/** Living player humans — includes same-tick newborns from newEntities and entityById. */
export function allLivingHumans(
  state: WorldState,
  newEntities: Entity[],
  entityById?: ReadonlyMap<number, Entity>,
): Entity[] {
  const byId = new Map<number, Entity>();
  if (entityById) {
    for (const e of entityById.values()) {
      if (e.type === EntityType.Human && e.alive) byId.set(e.id, e);
    }
  }
  for (const e of state.entities) {
    if (e.type === EntityType.Human && e.alive) byId.set(e.id, e);
  }
  for (const e of newEntities) {
    if (e.type === EntityType.Human && e.alive) byId.set(e.id, e);
  }
  return [...byId.values()];
}

function shouldLeadAffairPair(a: Entity, b: Entity): boolean {
  return a.id < b.id;
}

export function affairPairLead(a: Entity, b: Entity): { lead: Entity; other: Entity } {
  return a.id < b.id ? { lead: a, other: b } : { lead: b, other: a };
}

export function buildHuntTargetByPreyIndex(byType: Record<EntityType, Entity[]>): Map<number, Set<number>> {
  const index = new Map<number, Set<number>>();
  const hunterTypes = [
    EntityType.Wolf,
    EntityType.Fox,
    EntityType.Werewolf,
    EntityType.Human,
  ] as const;
  for (const type of hunterTypes) {
    for (const hunter of byType[type]) {
      if (!hunter.alive || hunter.huntTargetId == null) continue;
      const preyId = hunter.huntTargetId;
      let hunters = index.get(preyId);
      if (!hunters) {
        hunters = new Set();
        index.set(preyId, hunters);
      }
      hunters.add(hunter.id);
    }
  }
  return index;
}

function clearHuntersTargetingPrey(
  preyId: number,
  entityById: ReadonlyMap<number, Entity>,
  huntTargetByPreyId?: Map<number, Set<number>>,
): void {
  const index = huntTargetByPreyId;
  const hunters = index?.get(preyId);
  if (hunters && index) {
    for (const hunterId of hunters) {
      const hunter = entityById.get(hunterId);
      if (hunter) hunter.huntTargetId = undefined;
    }
    index.delete(preyId);
    return;
  }
  for (const hunter of entityById.values()) {
    if (hunter.huntTargetId === preyId) hunter.huntTargetId = undefined;
  }
}

export function getGrassPopulationCap(mapWidth: number, mapHeight: number): number {
  const area = mapWidth * mapHeight;
  return Math.max(200, Math.round(GRASS_CAP_BASE * (area / GRASS_CAP_REFERENCE_AREA)));
}

function isMealWindow(hourOfDay: number): boolean {
  return (hourOfDay >= 8 && hourOfDay <= 10) || (hourOfDay >= 18 && hourOfDay <= 20);
}

function fract(value: number): number {
  return value - Math.floor(value);
}

function isWildlifePredator(entity: Entity): boolean {
  return (
    entity.alive
    && (
      entity.type === EntityType.Wolf
      || entity.type === EntityType.Fox
      || entity.type === EntityType.Werewolf
      || (entity.type === EntityType.Human
        && !entity.isJuvenile
        && (isPlayerHuman(entity) || entity.faction === 'rival'))
    )
  );
}

function isValidHuntPrey(
  prey: Entity,
  preyType: EntityType,
  hunterId: number,
): boolean {
  if (!prey.alive || prey.id === hunterId) return false;
  // Tamed animals are colony stock — wildlife and free hunters leave them alone
  if (prey.tamedBy != null) return false;
  if (preyType === EntityType.Human) {
    if (prey.moonHowlerCursed) return false;
    if (prey.faction === 'visitor' || prey.faction === 'rival') return false;
  }
  return true;
}

/** Food from a free-roam kill — deer is a proper carcass, rabbit a snack. */
function freeHuntFoodGain(preyType: EntityType, state: WorldState): number {
  const base = preyType === EntityType.Deer ? 52 : preyType === EntityType.Rabbit ? 22 : 18;
  return Math.max(
    1,
    Math.round(base * getHuntFoodMultiplier(state) * getValleyHuntYieldMultiplier(state)),
  );
}

// ============ HUMAN RELATIONSHIP HELPERS ============
function humanDisplayName(entity: Entity): string {
  return entity.name
    ? `${entity.name}${entity.surname ? ` ${entity.surname}` : ''}${entity.title ? ` ${entity.title}` : ''}`
    : 'A settler';
}

/** Drop one-sided or dead-lover affair links so off-screen throttling can resume. */
export function reconcileAffairPartner(entity: Entity, entityById: Map<number, Entity>): void {
  if (!entity.alive) {
    entity.affairPartnerId = undefined;
    entity.affairProgress = 0;
    entity.lastAffairSiteDay = undefined;
    entity.lastAffairSiteX = undefined;
    entity.lastAffairSiteY = undefined;
    return;
  }
  if (entity.affairPartnerId == null) return;
  const lover = getLivingEntity(entity.affairPartnerId, entityById);
  if (
    !lover
    || lover.affairPartnerId !== entity.id
    || lover.prisonBuildingId != null
    || entity.prisonBuildingId != null
  ) {
    entity.affairPartnerId = undefined;
    entity.affairProgress = 0;
    entity.lastAffairSiteDay = undefined;
    entity.lastAffairSiteX = undefined;
    entity.lastAffairSiteY = undefined;
  }
}

export function hasAffairPartner(entity: Entity, entityById: Map<number, Entity>): boolean {
  if (entity.affairPartnerId == null) return false;
  const lover = getLivingEntity(entity.affairPartnerId, entityById);
  return lover != null && lover.affairPartnerId === entity.id;
}

export function findAffairLover(
  entity: Entity,
  entityById: Map<number, Entity>,
  tick: number,
  mobileGrid?: EntitySpatialGrid,
  nearbyHumans?: readonly Entity[],
): Entity | undefined {
  if (entity.affairPartnerId != null) {
    const lover = getLivingEntity(entity.affairPartnerId, entityById);
    if (lover && lover.affairPartnerId === entity.id && isValidAffairTarget(entity, lover, tick)) {
      return lover;
    }
    return undefined;
  }
  let best: Entity | undefined;
  let bestMutual = 0;
  const entityProgress = entity.affairProgress ?? 0;
  if (entityProgress < 45) return undefined;

  const consider = (candidate: Entity) => {
    if (!isValidAffairTarget(entity, candidate, tick)) return;
    const theirProgress = candidate.affairProgress ?? 0;
    if (theirProgress < 45) return;
    const mutual = Math.min(entityProgress, theirProgress);
    if (mutual > bestMutual) {
      bestMutual = mutual;
      best = candidate;
    }
  };

  if (mobileGrid || nearbyHumans) {
    forEachInEntityGrid(
      mobileGrid,
      entity.x,
      entity.y,
      150,
      (human) => {
        if (human.type !== EntityType.Human) return;
        consider(human);
      },
      'social',
      nearbyHumans,
    );
  }
  return best;
}

function isSpouseNearby(entity: Entity, entityById: Map<number, Entity>, range = 52): boolean {
  const spouse = getLivingEntity(entity.partnerId, entityById);
  if (!spouse) return false;
  return Math.hypot(spouse.x - entity.x, spouse.y - entity.y) < range;
}

/** Married settler standing at the home they share with their spouse. */
function isAtMaritalHome(
  entity: Entity,
  entityById: Map<number, Entity>,
  buildingById: Map<number, Building>,
): boolean {
  if (entity.partnerId == null || !hasResidenceAssignment(entity)) return false;
  const residence = buildingById.get(entity.residenceBuildingId!);
  if (!residence?.completed || !isResidenceBuilding(residence)) return false;
  if (!isNearBuilding(entity, residence, 55)) return false;
  const spouse = getLivingEntity(entity.partnerId, entityById);
  return spouse != null && shareResidence(entity, spouse);
}

/** Spouse is at (or stepping into) the shared marital residence. */
function isSpouseAtSharedHome(
  entity: Entity,
  entityById: Map<number, Entity>,
  buildingById: Map<number, Building>,
  maxDist = 55,
): boolean {
  const spouse = getLivingEntity(entity.partnerId, entityById);
  if (!spouse || !shareResidence(entity, spouse)) return false;
  if (!hasResidenceAssignment(entity)) return false;
  const residence = entity.residenceBuildingId != null
    ? buildingById.get(entity.residenceBuildingId)
    : undefined;
  if (!residence || !isResidenceBuilding(residence)) return false;
  return isNearBuilding(spouse, residence, maxDist);
}

/**
 * Walk-in at the marital home — shared work schedules send everyone home evenings,
 * so an affair there while the spouse is around (or due home) is essentially always caught.
 */
function wouldWalkInOnMaritalAffair(
  cheater: Entity,
  entityById: Map<number, Entity>,
  buildingById: Map<number, Building>,
  hourOfDay: number,
): boolean {
  if (!isAtMaritalHome(cheater, entityById, buildingById)) return false;
  if (isSpouseNearby(cheater, entityById, 55) || isSpouseAtSharedHome(cheater, entityById, buildingById, 55)) {
    return true;
  }
  // Same village clock: evening/night/morning hours mean spouses head home together.
  return shouldBeAtHome(hourOfDay) && cheater.partnerId != null;
}

function isSingleParamour(paramour: Entity): boolean {
  return paramour.relationshipStatus === 'single' && paramour.partnerId == null;
}

function getAffairTrystBuilding(
  _cheater: Entity,
  paramour: Entity,
  buildingById: Map<number, Building>,
): Building | undefined {
  if (!isSingleParamour(paramour) || !hasResidenceAssignment(paramour)) return undefined;
  const residence = paramour.residenceBuildingId != null
    ? buildingById.get(paramour.residenceBuildingId)
    : undefined;
  if (!residence?.completed || !isResidenceBuilding(residence)) return undefined;
  return residence;
}

function getBuildingCenter(building: Building): { x: number; y: number } {
  return { x: building.x + building.width / 2, y: building.y + building.height / 2 };
}

function isNearBuilding(human: Entity, building: Building, maxDist = 55): boolean {
  const center = getBuildingCenter(building);
  return Math.hypot(human.x - center.x, human.y - center.y) <= maxDist;
}

/**
 * Logical tryst site — not the cheater's marital home (spouse lives there);
 * single paramours host at their own place; two married lovers meet elsewhere.
 */
export function isValidAffairTrystSite(
  cheater: Entity,
  paramour: Entity,
  entityById: Map<number, Entity>,
  buildingById: Map<number, Building>,
  intimateDist = AFFAIR_BUILDING_NEAR_RADIUS,
  hourOfDay?: number,
): boolean {
  if (!cheater.alive || !paramour.alive) return false;
  if (isAtMaritalHome(cheater, entityById, buildingById)) return false;

  const trystBuilding = getAffairTrystBuilding(cheater, paramour, buildingById);
  if (trystBuilding) {
    return isNearBuilding(cheater, trystBuilding, intimateDist)
      && isNearBuilding(paramour, trystBuilding, intimateDist);
  }

  if (paramour.partnerId != null && isAtMaritalHome(paramour, entityById, buildingById)) {
    if (isSpouseAtSharedHome(paramour, entityById, buildingById, intimateDist)) return false;
    if (hourOfDay != null && shouldBeAtHome(hourOfDay) && isSpouseNearby(paramour, entityById, intimateDist)) {
      return false;
    }
    const residence = paramour.residenceBuildingId != null
      ? buildingById.get(paramour.residenceBuildingId)
      : undefined;
    if (!residence?.completed || !isResidenceBuilding(residence)) return false;
    return isNearBuilding(cheater, residence, intimateDist)
      && isNearBuilding(paramour, residence, intimateDist);
  }
  return Math.hypot(paramour.x - cheater.x, paramour.y - cheater.y) < intimateDist;
}

/** Daily conception — physical tryst only; no clock-hour gate. */
function isValidAffairConceptionSite(
  cheater: Entity,
  paramour: Entity,
  entityById: Map<number, Entity>,
  buildingById: Map<number, Building>,
  intimateDist = 55,
): boolean {
  return isValidAffairTrystSite(cheater, paramour, entityById, buildingById, intimateDist);
}

function getAffairTrystTarget(
  cheater: Entity,
  paramour: Entity,
  buildingById: Map<number, Building>,
): { x: number; y: number } {
  const trystBuilding = getAffairTrystBuilding(cheater, paramour, buildingById);
  if (trystBuilding) return getBuildingCenter(trystBuilding);
  return { x: paramour.x, y: paramour.y };
}

/** Affairs can run off-duty or during work when spouses are at separate job sites. */
function canPursueSecretAffair(
  entity: Entity,
  hourOfDay: number,
  workplace: Building | undefined,
  buildings: Building[],
  entityById: Map<number, Entity>,
  tick: number,
): boolean {
  if (onScandalCooldown(entity, tick)) return false;
  // Tight radius — a whole compact village fits inside 52 units, which blocked all affairs.
  if (isSpouseNearby(entity, entityById, AFFAIR_SPOUSE_BLOCK_RADIUS)) return false;
  if (allowSocialLife(hourOfDay, workplace != null)) return true;
  if (!isWorkHour(hourOfDay) || entity.partnerId == null) return false;

  const spouse = getLivingEntity(entity.partnerId, entityById);
  if (!spouse) return true;
  if (!hasWorkAssignment(spouse)) return true;

  // Affairs path is rare — linear building scan is fine here.
  const spouseJob = findHumanWorkplace(spouse, buildings);
  if (!spouseJob) return true;
  if (workplace && spouseJob.id !== workplace.id) return true;
  return Math.hypot(spouse.x - entity.x, spouse.y - entity.y) > 58;
}

function recordAffairTrystSite(
  entity: Entity,
  paramour: Entity,
  state: WorldState,
  buildingById?: Map<number, Building>,
): void {
  if (!shouldLeadAffairPair(entity, paramour)) return;
  const siteDay = getColonyDay(state);
  const trystBuilding = buildingById
    ? getAffairTrystBuilding(entity, paramour, buildingById)
    : undefined;
  const siteX = trystBuilding ? getBuildingCenter(trystBuilding).x : (entity.x + paramour.x) / 2;
  const siteY = trystBuilding ? getBuildingCenter(trystBuilding).y : (entity.y + paramour.y) / 2;
  for (const partner of [entity, paramour]) {
    partner.lastAffairSiteDay = siteDay;
    partner.lastAffairSiteX = siteX;
    partner.lastAffairSiteY = siteY;
  }
}

/** Once-per-day affair drift — runs even when settlers are off-screen (no movement sim). */
function tryDailyAffairEncounter(
  state: WorldState,
  entity: Entity,
  entityById: Map<number, Entity>,
  buildings: Building[],
  buildingById: Map<number, Building>,
  churchStrength: number,
  hourOfDay: number,
  mobileGrid?: EntitySpatialGrid,
  playerHumans?: readonly Entity[],
): void {
  const config = SPECIES_CONFIG[EntityType.Human];
  if (!isPlayerHuman(entity)) return;
  if (entity.prisonBuildingId != null) return;
  if (entity.relationshipStatus !== 'married' || entity.pregnant || entity.isJuvenile) return;
  if (!entity.gender || entity.age < HUMAN_ADULT_MIN_AGE || entity.age >= HUMAN_ADULT_MAX_AGE) return;
  if (entity.energy <= config.reproductionEnergyThreshold * 0.5) return;
  if (onScandalCooldown(entity, state.tick)) return;
  const workplace = findHumanWorkplace(entity, buildings, { buildingById });
  if (!canPursueSecretAffair(entity, hourOfDay, workplace, buildings, entityById, state.tick)) return;

  if (isAtMaritalHome(entity, entityById, buildingById)) return;

  if (entity.affairPartnerId != null) {
    const established = getLivingEntity(entity.affairPartnerId, entityById);
    if (
      established
      && established.affairPartnerId === entity.id
      && shouldLeadAffairPair(entity, established)
      && isValidAffairTrystSite(entity, established, entityById, buildingById, AFFAIR_DAILY_TRYST_RADIUS)
    ) {
      recordAffairTrystSite(entity, established, state, buildingById);
    }
  }

  let paramour: Entity | undefined;
  let bestDistSq = 120 * 120;
  const considerParamour = (candidate: Entity, distSq: number) => {
    if (!isValidAffairTarget(entity, candidate, state.tick)) return;
    if (distSq >= bestDistSq) return;
    if (isSpouseNearby(candidate, entityById, AFFAIR_SPOUSE_BLOCK_RADIUS)) return;
    bestDistSq = distSq;
    paramour = candidate;
  };
  forEachInEntityGrid(
    mobileGrid,
    entity.x,
    entity.y,
    120,
    (human, distSq) => {
      if (human.type !== EntityType.Human || !isPlayerHuman(human)) return;
      considerParamour(human, distSq);
    },
    'social',
    playerHumans,
  );
  if (!paramour) return;
  if (!isValidAffairTrystSite(entity, paramour, entityById, buildingById, AFFAIR_DAILY_TRYST_RADIUS)) return;
  if (!shouldLeadAffairPair(entity, paramour)) return;

  const churchPenalty = churchStrength > 0 ? 0.72 + (1 - churchStrength) * 0.28 : 1;
  const hasPerformers = state.visitorGroups.some((g) => g.kind === 'performers' && g.daysLeft > 0);
  const festivalMult = state.festival?.active ? 1.4 : 1;
  const performerMult = hasPerformers ? 1.35 : 1;
  const trystBuilding = getAffairTrystBuilding(entity, paramour, buildingById);
  const atParamourHome = trystBuilding != null
    && isNearBuilding(entity, trystBuilding, AFFAIR_BUILDING_NEAR_RADIUS)
    && isNearBuilding(paramour, trystBuilding, AFFAIR_BUILDING_NEAR_RADIUS);
  const cohabitMult = atParamourHome ? 1.55 : 1;
  const socialMult = festivalMult * performerMult * cohabitMult;
  const dailyChance = (churchStrength > 0 ? 0.14 : 0.2) * churchPenalty * socialMult;
  if (Math.random() >= dailyChance) return;

  const bump = Math.round((16 + Math.floor(Math.random() * 12)) * socialMult);
  entity.affairProgress = Math.min(100, (entity.affairProgress || 0) + bump);
  paramour.affairProgress = Math.min(100, (paramour.affairProgress || 0) + bump);
  recordAffairTrystSite(entity, paramour, state, buildingById);

  if ((entity.affairProgress ?? 0) >= 100 && (paramour.affairProgress ?? 0) >= 100) {
    entity.affairPartnerId = paramour.id;
    paramour.affairPartnerId = entity.id;
    entity.affairProgress = 100;
    paramour.affairProgress = 100;
  }
}

export function tryDailyAffairGossip(
  state: WorldState,
  entity: Entity,
  entityById: Map<number, Entity>,
  buildings: Building[],
  buildingById: Map<number, Building>,
  churchStrength: number,
  playerHumans: readonly Entity[],
  mobileGrid?: EntitySpatialGrid,
): void {
  const lover = findAffairLover(entity, entityById, state.tick, mobileGrid, playerHumans);
  if (!lover) return;
  if (!shouldLeadAffairPair(entity, lover)) return;
  if (onScandalCooldown(entity, state.tick) || onScandalCooldown(lover, state.tick)) return;

  // Let secret pregnancies play out — gossip after the birth notifications.
  if (
    (entity.pregnant && entity.pregnantById === lover.id)
    || (lover.pregnant && lover.pregnantById === entity.id)
  ) {
    return;
  }

  if (churchStrength <= 0) {
    if ((entity.affairProgress ?? 0) < 85 && (lover.affairProgress ?? 0) < 85) return;
    if (Math.random() < 0.04) {
      if (isValidAffairTrystSite(entity, lover, entityById, buildingById, AFFAIR_DAILY_TRYST_RADIUS)) {
        recordAffairTrystSite(entity, lover, state, buildingById);
      }
      const reason = pickAffairExposureReason(state, entity, lover, playerHumans);
      exposeAffair(state, entity, lover, reason, entityById, buildings, playerHumans);
    }
    return;
  }

  if (
    entity.affairPartnerId == null
    && ((entity.affairProgress ?? 0) < 45 || (lover.affairProgress ?? 0) < 45)
  ) {
    return;
  }

  const chance = churchStrength >= 1 ? 0.16 : 0.08;
  if (Math.random() < chance) {
    if (isValidAffairTrystSite(entity, lover, entityById, buildingById, AFFAIR_DAILY_TRYST_RADIUS)) {
      recordAffairTrystSite(entity, lover, state, buildingById);
    }
    const reason = pickAffairExposureReason(state, entity, lover, playerHumans);
    exposeAffair(state, entity, lover, reason, entityById, buildings, playerHumans);
  }
}

/**
 * Schoolyard gossip — kids let family secrets slip at school. A child enrolled
 * in a staffed school whose parent carries an established affair may blurt it
 * out, exposing the affair as a rumor (church gossip, but from the sandbox).
 * One slip per child per day.
 */
export function trySchoolyardGossip(
  state: WorldState,
  child: Entity,
  entityById: Map<number, Entity>,
  buildings: Building[],
  playerHumans: readonly Entity[],
  rng: () => number = Math.random,
): void {
  if (!child.isJuvenile || !isPlayerHuman(child)) return;
  const parentIds = [child.fatherId, child.motherId, child.adoptiveFatherId, child.adoptiveMotherId]
    .filter((id): id is number => id != null);
  if (parentIds.length === 0) return;

  for (const pid of parentIds) {
    const parent = entityById.get(pid);
    if (!parent?.alive) continue;
    const lover = parent.affairPartnerId != null ? entityById.get(parent.affairPartnerId) : undefined;
    if (!lover?.alive) continue;
    if (!shouldLeadAffairPair(parent, lover)) continue;
    if (onScandalCooldown(parent, state.tick) || onScandalCooldown(lover, state.tick)) continue;
    // Established affairs only — a schoolyard blab needs something to blab about.
    if ((parent.affairProgress ?? 0) < 45 && (lover.affairProgress ?? 0) < 45) continue;
    const day = getAbsoluteCalendarDay(state.tick);
    if (child.schoolGossipDay === day) continue;
    child.schoolGossipDay = day;

    if (rng() < 0.35) {
      exposeAffair(state, parent, lover, 'rumor', entityById, buildings, playerHumans);
      const parentName = formatCitizenName(parent);
      addFloatingText(state, child.x, child.y - 22, '🤫 whispered…', '#fbbf24', 'brief');
      logEvent(state, 'event', `The children at school are whispering that ${parentName} sneaks out at night…`, child.name);
    }
  }
}

/** Every N school days a child befriends a classmate — bonds that nudge adult courtship. */
const SCHOOLYARD_BOND_EVERY_DAYS = 5;
const SCHOOLYARD_BOND_MAX_FRIENDS = 3;

/**
 * Schoolyard bonds — kids at school befriend classmates. Those childhood bonds
 * follow them into adulthood and nudge who they court (see findCourtshipPartner —
 * a friend counts as half the distance). Mutual, capped, one formation per
 * school-day milestone.
 */
export function tryFormSchoolyardBond(
  state: WorldState,
  child: Entity,
  rng: () => number = Math.random,
): void {
  if (!child.isJuvenile || !isPlayerHuman(child)) return;
  const day = getAbsoluteCalendarDay(state.tick);
  if (child.schoolBondDay === day) return;
  const schoolDays = child.schoolDays ?? 0;
  if (schoolDays === 0 || schoolDays % SCHOOLYARD_BOND_EVERY_DAYS !== 0) return;
  child.schoolBondDay = day;

  const friends = child.childhoodFriendsIds ?? [];
  if (friends.length >= SCHOOLYARD_BOND_MAX_FRIENDS) return;

  const classmates = state.entities.filter(
    (e) =>
      e.alive
      && e.type === EntityType.Human
      && e.isJuvenile
      && isPlayerHuman(e)
      && e.id !== child.id
      && !friends.includes(e.id),
  );
  if (classmates.length === 0) return;

  const friend = classmates[Math.floor(rng() * classmates.length)];
  if (!friend) return;
  child.childhoodFriendsIds = [...friends, friend.id].slice(0, SCHOOLYARD_BOND_MAX_FRIENDS);
  friend.childhoodFriendsIds = [...(friend.childhoodFriendsIds ?? []), child.id].slice(0, SCHOOLYARD_BOND_MAX_FRIENDS);
  addFloatingText(state, child.x, child.y - 22, '👫 friends', '#fbbf24', 'brief');
  logEvent(
    state,
    'event',
    `${formatCitizenName(child)} and ${formatCitizenName(friend)} became friends at school`,
    child.name,
  );
}

function isValidAffairTarget(entity: Entity, target: Entity, tick: number): boolean {
  if (!isPlayerHuman(target) || !target.alive || !target.gender) return false;
  if (entity.prisonBuildingId != null || target.prisonBuildingId != null) return false;
  if (!entity.gender || target.gender === entity.gender || target.id === entity.id) return false;
  if (target.id === entity.partnerId || entity.id === target.partnerId) return false;
  if (target.age < HUMAN_ADULT_MIN_AGE || target.age >= HUMAN_ADULT_MAX_AGE) return false;
  if (entity.affairPartnerId != null && target.id !== entity.affairPartnerId) return false;
  if (target.affairPartnerId != null && target.affairPartnerId !== entity.id) return false;
  if (onScandalCooldown(entity, tick) || onScandalCooldown(target, tick)) return false;
  return true;
}

function clearAffairPair(a: Entity, b: Entity): void {
  a.affairPartnerId = undefined;
  a.affairProgress = 0;
  b.affairPartnerId = undefined;
  b.affairProgress = 0;
}

/** Old age + random illness — once per colony day, not per tick. */
function startMarriedPregnancy(state: WorldState, entity: Entity, partner: Entity): void {
  entity.pregnant = true;
  entity.pregnantById = undefined;
  entity.pregnancyProgress = 0;
  entity.relationshipStatus = 'expecting';
  if (partner.relationshipStatus === 'married' || partner.partnerId === entity.id) {
    partner.relationshipStatus = 'expecting';
  }
  entity.flash = 15;
  partner.flash = 15;
  createDeathParticles(state, entity.x, entity.y - 8, '#ffb6c1', 10, 'heart');
  addFloatingText(state, entity.x, entity.y - 20, 'Expecting!', '#ff69b4');
  addNotification(state, 'Expecting', `${entity.name || 'A settler'} is expecting a child`, 'success');
}

function startAffairPregnancy(state: WorldState, entity: Entity, lover: Entity): void {
  entity.pregnant = true;
  entity.pregnantById = lover.id;
  entity.pregnancyProgress = 0;
  entity.relationshipStatus = entity.partnerId != null ? 'married' : 'expecting';
  entity.flash = 14;
  lover.flash = 14;
  createDeathParticles(state, entity.x, entity.y - 8, '#f472b6', 8, 'heart');
  addFloatingText(state, entity.x, entity.y - 18, 'Secret…', '#c084fc', 'brief');
}

/** Once-per-day conception — player settlers only; residence sharing, not clock hour. */
export function tryDailyConception(
  state: WorldState,
  ctx: TickContext,
  entity: Entity,
): boolean {
  const config = SPECIES_CONFIG[EntityType.Human];
  if (!isPlayerHuman(entity)) return false;
  if (entity.gender !== 'female' || entity.pregnant || entity.reproductionCooldown > 0) return false;

  if (
    entity.relationshipStatus === 'married'
    && entity.partnerId
    && entity.energy > config.reproductionEnergyThreshold * 0.75
  ) {
    const partner = getLivingEntity(entity.partnerId, ctx.entityById);
    if (partner) {
      const dist = Math.hypot(partner.x - entity.x, partner.y - entity.y);
      const sharesHome = shareResidence(entity, partner);
      const bothAtSharedHome = sharesHome
        && isNearResidence(entity, ctx.buildingById)
        && isNearResidence(partner, ctx.buildingById);
      const together = dist < 22 || bothAtSharedHome;
      const fertility = getFemaleFertility(entity.age);
      if (together && fertility > 0) {
        const baseChance = bothAtSharedHome
          ? HUMAN_DAILY_PREGNANCY_CHANCE_HOME
          : HUMAN_DAILY_PREGNANCY_CHANCE_NEAR;
        // Lucky settlers have a bit better luck conceiving.
        if (Math.random() < baseChance * fertility * traitMultiplier(entity, 'lucky', 1.15)) {
          startMarriedPregnancy(state, entity, partner);
          return true;
        }
      }
    }
  }

  if (
    hasAffairPartner(entity, ctx.entityById)
    && entity.energy > config.reproductionEnergyThreshold * 0.65
    && !isSpouseNearby(entity, ctx.entityById, AFFAIR_SPOUSE_BLOCK_RADIUS)
  ) {
    const lover = getLivingEntity(entity.affairPartnerId, ctx.entityById);
    if (!lover || !isPlayerHuman(lover) || lover.affairPartnerId !== entity.id) return false;
    const tryst = isValidAffairConceptionSite(
      entity,
      lover,
      ctx.entityById,
      ctx.buildingById,
      AFFAIR_BUILDING_NEAR_RADIUS,
    );
    const fertility = getFemaleFertility(entity.age);
    if (tryst && fertility > 0 && Math.random() < HUMAN_DAILY_AFFAIR_PREGNANCY_CHANCE * fertility) {
      startAffairPregnancy(state, entity, lover);
      return true;
    }
  }
  return false;
}

export function tryDailyHumanMortality(
  state: WorldState,
  entity: Entity,
  buildings: Building[],
  entityById?: ReadonlyMap<number, Entity>,
): boolean {
  const oldAgeChance = getOldAgeDeathChance(entity.age);
  if (oldAgeChance > 0 && (entity.age >= HUMAN_MAX_LIFESPAN_YEARS || Math.random() < oldAgeChance)) {
    killHuman(entity, buildings, entityById, state.tick);
    createDeathParticles(state, entity.x, entity.y, '#aaaaaa', 5, 'smoke');
    const cause = entity.age >= HUMAN_MAX_LIFESPAN_YEARS ? 'old age' : 'an age-related illness';
    logEvent(state, 'death', formatDeathLog(entity, `died of ${cause}`), formatCitizenName(entity));
    return true;
  }
  {
    const illnessChance = HUMAN_DAILY_ILLNESS_CHANCE + getValleyIllnessChanceBonus(state);
    if (entity.age >= HUMAN_ADULT_MIN_AGE && Math.random() < illnessChance) {
      killHuman(entity, buildings, entityById, state.tick);
      createDeathParticles(state, entity.x, entity.y, '#aaaaaa', 5, 'smoke');
      logEvent(state, 'death', formatDeathLog(entity, 'died of a sudden illness'), formatCitizenName(entity));
      return true;
    }
  }
  return false;
}

/** Either spouse may divorce after catching the other cheating — chance applies to gossip only. */
const DIVORCE_ON_CAUGHT_CHANCE = 0.55;
/** Game-days before the same settler can headline another scandal. */
function getScandalCooldownTicks(): number {
  return TICKS_PER_DAY * 21;
}

function onScandalCooldown(entity: Entity, tick: number): boolean {
  return entity.scandalCooldownUntilTick != null && tick < entity.scandalCooldownUntilTick;
}

function setScandalCooldown(entity: Entity, tick: number): void {
  entity.scandalCooldownUntilTick = tick + getScandalCooldownTicks();
}

function reassignDivorcedResidences(
  a: Entity,
  b: Entity,
  buildings: Building[],
  villagers: Entity[],
): void {
  const residences = buildings.filter(isResidenceBuilding);
  const formerHomes = new Set<number>();
  for (const resident of [a, b]) {
    if (resident.residenceBuildingId != null) {
      formerHomes.add(resident.residenceBuildingId);
      const oldHome = buildings.find((building) => building.id === resident.residenceBuildingId);
      if (oldHome) {
        oldHome.occupants = oldHome.occupants.filter((id) => id !== resident.id);
      }
    }
  }

  if (residences.length === 0) {
    a.residenceBuildingId = undefined;
    b.residenceBuildingId = undefined;
    return;
  }

  a.residenceBuildingId = pickResidenceForHuman(a, villagers, residences);
  if (b.prisonBuildingId == null) {
    const excludeHomes = new Set(formerHomes);
    if (a.residenceBuildingId != null) excludeHomes.add(a.residenceBuildingId);
    b.residenceBuildingId = pickResidenceForHumanExcluding(b, villagers, residences, excludeHomes);
  } else {
    b.residenceBuildingId = undefined;
  }
  syncResidenceOccupants(villagers, buildings);
}

function tryDivorceOnCaughtCheater(
  state: WorldState,
  cheater: Entity,
  paramour: Entity,
  entityById: Map<number, Entity>,
  buildings: Building[],
  playerHumans: readonly Entity[],
  caughtInAct = false,
): void {
  if (cheater.relationshipStatus !== 'married' || cheater.partnerId == null) return;
  // arrestForScandal teleports the cheater to prison — spouse is no longer in range.
  if (!caughtInAct && !isSpouseNearby(cheater, entityById, 40)) return;

  const spouse = getLivingEntity(cheater.partnerId, entityById);
  if (!spouse) return;
  const divorceChance = caughtInAct ? 1 : DIVORCE_ON_CAUGHT_CHANCE;
  if (Math.random() >= divorceChance) return;

  dissolveMarriage(spouse, cheater);

  const spouseName = humanDisplayName(spouse);
  const cheaterName = humanDisplayName(cheater);
  const otherName = humanDisplayName(paramour);
  logEvent(
    state,
    'marriage',
    `${spouseName} divorced ${cheaterName} after catching them with ${otherName}`,
    spouseName,
  );
  addNotification(state, 'Divorce', formatCaughtCheaterDivorceDetail(spouse, cheater), 'warning');
  addFloatingText(state, (spouse.x + cheater.x) / 2, (spouse.y + cheater.y) / 2 - 22, 'Divorced!', '#f97316');

  const villagers = playerHumans.filter(isPlayerHuman);
  reassignDivorcedResidences(spouse, cheater, buildings, villagers);

  if (paramour.relationshipStatus === 'married' && paramour.partnerId != null) {
    const paramourSpouse = getLivingEntity(paramour.partnerId, entityById);
    const paramourSpousePresent = caughtInAct || isSpouseNearby(paramour, entityById, 40);
    const paramourDivorceChance = caughtInAct ? 1 : DIVORCE_ON_CAUGHT_CHANCE;
    if (paramourSpouse && paramourSpousePresent && Math.random() < paramourDivorceChance) {
      dissolveMarriage(paramourSpouse, paramour);
      logEvent(
        state,
        'marriage',
        `${humanDisplayName(paramourSpouse)} divorced ${humanDisplayName(paramour)} after catching them with ${humanDisplayName(cheater)}`,
        humanDisplayName(paramourSpouse),
      );
      addNotification(
        state,
        'Divorce',
        formatCaughtCheaterDivorceDetail(paramourSpouse, paramour),
        'warning',
      );
      reassignDivorcedResidences(paramourSpouse, paramour, buildings, villagers);
    }
  }
}

function countGuardsAtPrison(humans: Entity[], prison: Building): number {
  const byAssignment = countWorkersAtBuilding(humans, prison.id);
  if (byAssignment > 0) return byAssignment;
  return prison.occupants.filter((id) => {
    const worker = humans.find((h) => h.id === id && h.alive && !h.faction);
    return worker != null && worker.prisonBuildingId == null;
  }).length;
}

function hasStaffedPrison(state: WorldState): boolean {
  const humans = state.entities.filter(isPlayerHuman);
  return state.buildings.some(
    (b) => b.completed && b.type === BuildingType.Prison && countGuardsAtPrison(humans, b) > 0,
  );
}

/** Gossip vs caught — affairs happen anywhere in the village; a staffed prison enables formal busts. */
export function pickAffairExposureReason(
  state: WorldState,
  _cheater: Entity,
  _lover: Entity,
  _humans: readonly Entity[],
): 'caught' | 'rumor' {
  if (hasStaffedPrison(state) && Math.random() < 0.22) {
    return 'caught';
  }
  return 'rumor';
}

function caughtAffairRollChance(churchStrength: number, establishedAffair: boolean): number {
  const base = churchStrength >= 1 ? 0.14 : churchStrength > 0 ? 0.10 : 0.08;
  return establishedAffair ? Math.min(0.32, base * 1.6) : base;
}

/** Spouse or guard catches lovers in the act — only one partner rolls per pair (lower id). */
function tryExposeCaughtAffair(
  state: WorldState,
  cheater: Entity,
  paramour: Entity,
  entityById: Map<number, Entity>,
  buildingById: Map<number, Building>,
  buildings: Building[],
  playerHumans: readonly Entity[],
  churchStrength: number,
  establishedAffair: boolean,
  intimate: boolean,
  hourOfDay: number,
): void {
  if (!shouldLeadAffairPair(cheater, paramour)) return;
  if (onScandalCooldown(cheater, state.tick) || onScandalCooldown(paramour, state.tick)) return;

  if (!intimate) return;
  const walkInAtHome = wouldWalkInOnMaritalAffair(cheater, entityById, buildingById, hourOfDay);
  const spousePresent =
    isSpouseNearby(cheater, entityById, AFFAIR_SPOUSE_BLOCK_RADIUS)
    || isSpouseNearby(paramour, entityById, AFFAIR_SPOUSE_BLOCK_RADIUS)
    || walkInAtHome;
  if (!spousePresent) return;

  let chance = caughtAffairRollChance(churchStrength, establishedAffair);
  if (walkInAtHome) chance = 1;
  if (Math.random() < chance) {
    exposeAffair(state, cheater, paramour, 'caught', entityById, buildings, playerHumans);
  }
}

/** Run caught-in-the-act roll from either partner's tick — always routes through lower id (T-M41). */
export function tryExposeCaughtAffairForPair(
  state: WorldState,
  a: Entity,
  b: Entity,
  entityById: Map<number, Entity>,
  buildingById: Map<number, Building>,
  buildings: Building[],
  playerHumans: readonly Entity[],
  churchStrength: number,
  establishedAffair: boolean,
  intimate: boolean,
  hourOfDay: number,
): void {
  const { lead, other } = affairPairLead(a, b);
  tryExposeCaughtAffair(
    state,
    lead,
    other,
    entityById,
    buildingById,
    buildings,
    playerHumans,
    churchStrength,
    establishedAffair,
    intimate,
    hourOfDay,
  );
}

export function exposeAffair(
  state: WorldState,
  cheater: Entity,
  paramour: Entity,
  reason: 'caught' | 'rumor',
  entityById: Map<number, Entity>,
  buildings: Building[],
  playerHumans: readonly Entity[],
): void {
  const who = humanDisplayName(cheater);
  const other = humanDisplayName(paramour);
  clearAffairPair(cheater, paramour);
  setScandalCooldown(cheater, state.tick);
  setScandalCooldown(paramour, state.tick);
  cheater.flash = 12;
  paramour.flash = 12;
  const scandalLoss = dampScandalReputationLoss(
    reason === 'caught' ? -8 : -4,
    buildings,
  );
  state.villageReputation = Math.max(0, state.villageReputation + scandalLoss);
  const midX = (cheater.x + paramour.x) / 2;
  const midY = (cheater.y + paramour.y) / 2;
  addFloatingText(state, midX, midY - 18, reason === 'caught' ? 'Caught!' : 'Scandal!', '#ef4444');
  logEvent(
    state,
    'scandal',
    reason === 'caught'
      ? `${who} was caught with ${other}`
      : `Whispers spread about ${who} and ${other}`,
    who,
  );
  addNotification(state, 'Scandal', `${who} & ${other} — the village is talking`, 'warning');

  if (reason === 'caught') {
    // Arrest before divorce — grantDivorce clears relationshipStatus/partnerId.
    arrestForScandal(state, cheater);
    arrestForScandal(state, paramour);
    tryDivorceOnCaughtCheater(state, cheater, paramour, entityById, buildings, playerHumans, true);
  }
}

function countPrisonersAt(state: WorldState, prisonId: number): number {
  return state.entities.filter(
    (e) => e.alive && e.type === EntityType.Human && e.prisonBuildingId === prisonId,
  ).length;
}

/** Prison sentences apply to married settlers who broke their vows — not single paramours. */
function isMarriedScandalOffender(entity: Entity): boolean {
  return entity.relationshipStatus === 'married' && entity.partnerId != null;
}

function arrestForScandal(state: WorldState, offender: Entity): void {
  if (!offender.alive || offender.type !== EntityType.Human) return;
  if (!isMarriedScandalOffender(offender)) return;
  const humans = state.entities.filter(isPlayerHuman);
  const prisons = state.buildings.filter(
    (b) => b.completed && b.type === BuildingType.Prison && countGuardsAtPrison(humans, b) > 0,
  );
  if (prisons.length === 0) return;
  const arrestChance = Math.min(0.85, 0.6 + prisons.length * 0.08);
  if (Math.random() >= arrestChance) return;
  const prisonerCap = Math.max(1, BUILDING_CONFIGS[BuildingType.Prison].maxOccupants - 1);
  const prison = prisons.find((b) => countPrisonersAt(state, b.id) < prisonerCap) ?? prisons[0];
  if (countPrisonersAt(state, prison.id) >= prisonerCap && offender.prisonBuildingId == null) return;
  // ~2.5–6 days at current TICKS_PER_DAY (not a hard-coded tick count)
  const sentenceTicks = ticksForDays(2.5 + Math.random() * 3.5);
  const newReleaseTick = state.tick + sentenceTicks;

  if (offender.prisonBuildingId != null) {
    // T-M14: already serving a non-scandal sentence — leave term unchanged (Batch P test).
    if (offender.prisonSentenceCrime === 'scandal') {
      offender.prisonerUntilTick = Math.max(offender.prisonerUntilTick ?? 0, newReleaseTick);
    }
    return;
  }

  if (offender.homeBuildingId != null) {
    const jobBuilding = state.buildings.find((b) => b.id === offender.homeBuildingId);
    if (jobBuilding) {
      jobBuilding.occupants = jobBuilding.occupants.filter((id) => id !== offender.id);
    }
    offender.homeBuildingId = undefined;
    offender.occupation = 'settler';
    offender.job = JobType.Settler;
  }
  if (offender.residenceBuildingId != null) {
    const residence = state.buildings.find((b) => b.id === offender.residenceBuildingId);
    if (residence) {
      residence.occupants = residence.occupants.filter((id) => id !== offender.id);
    }
  }
  offender.residenceBuildingId = undefined;
  offender.prisonBuildingId = prison.id;
  offender.prisonSentenceCrime = 'scandal';
  offender.prisonerUntilTick = newReleaseTick;
  offender.x = prison.x + (Math.random() - 0.5) * 12;
  offender.y = prison.y + (Math.random() - 0.5) * 8;
  offender.vx = 0;
  offender.vy = 0;
  prison.occupants.push(offender.id);
  const name = humanDisplayName(offender);
  logEvent(state, 'event', `${name} was imprisoned for scandal`, name);
  addNotification(state, 'Imprisoned', `${name} sentenced for scandal`, 'warning');
  addFloatingText(state, prison.x, prison.y - 20, 'Imprisoned', '#94a3b8');
}

// ============ COMMUTE HELPERS ============
function homeStandPosition(building: Building, entityId: number): { x: number; y: number } {
  const cx = building.x + building.width / 2;
  const cy = building.y + building.height / 2;
  const seed = entityId * 17 + building.id * 31;
  const angle = (seed * 2.399963) % (Math.PI * 2);
  const ring = (seed % 5) + 1;
  const radius = 10 + ring * 7;
  return {
    x: cx + Math.cos(angle) * radius,
    y: cy + Math.sin(angle) * radius * 0.6,
  };
}

/** Beyond this distance, settlers snap to home/work at shift change (7am / 7pm). */
const COMMUTE_SNAP_DISTANCE = 130;

function humanBuildingTarget(
  building: Building,
  entityId: number,
  arrivingHome: boolean,
): { x: number; y: number } {
  if (arrivingHome) return homeStandPosition(building, entityId);
  const seed = entityId * 13 + building.id * 29;
  const offset = ((seed % 7) - 3) * 6;
  return {
    x: building.x + building.width / 2 + offset,
    // Workers stand in front of the building (south) so sprites aren't buried in the art.
    y: building.y + building.height * 0.92,
  };
}

function commuteDistanceToBuilding(
  entity: Entity,
  building: Building,
  arrivingHome: boolean,
): number {
  const target = humanBuildingTarget(building, entity.id, arrivingHome);
  return Math.hypot(target.x - entity.x, target.y - entity.y);
}

function snapHumanToBuilding(entity: Entity, building: Building, arrivingHome: boolean): void {
  const target = humanBuildingTarget(building, entity.id, arrivingHome);
  entity.x = target.x;
  entity.y = target.y;
  entity.vx = 0;
  entity.vy = 0;
}

function commuteHumanToBuilding(
  entity: Entity,
  building: Building,
  speed: number,
  arrivingHome: boolean,
  rush = 1,
): boolean {
  const target = humanBuildingTarget(building, entity.id, arrivingHome);
  const dx = target.x - entity.x;
  const dy = target.y - entity.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  // Stronger long-range rush so village-scale walks finish in a work morning
  const distRush = Math.min(12, 1 + dist / 40);
  const moveSpeed = speed * rush * distRush;
  if (dist > 22) {
    // Long commute: route around water/mountains when the straight line is blocked.
    const handled = steerWithPath(
      entity,
      target.x,
      target.y,
      moveSpeed * 0.72,
      `c_${building.id}_${arrivingHome ? 'h' : 'w'}`,
    );
    if (handled === 'path') return false;
    if (handled === 'arrived') return true;
    entity.vx = (dx / dist) * moveSpeed * 0.72;
    entity.vy = (dy / dist) * moveSpeed * 0.72;
    entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
    return false;
  }
  if (dist <= 8) {
    entity.vx = 0;
    entity.vy = 0;
    return true;
  }
  entity.vx = (dx / dist) * moveSpeed * (arrivingHome ? 0.12 : 0.18);
  entity.vy = (dy / dist) * moveSpeed * (arrivingHome ? 0.12 : 0.18);
  entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
  return false;
}

/** Eligible to court / remarry — singles only (divorced people become single; pregnant stay expecting). */
function isEligibleToCourt(entity: Entity): boolean {
  return (
    isPlayerHuman(entity)
    && entity.alive
    && !entity.isJuvenile
    && !entity.pregnant
    && entity.prisonBuildingId == null
    && entity.partnerId == null
    && entity.relationshipStatus === 'single'
    && entity.age >= HUMAN_ADULT_MIN_AGE
    && entity.age < HUMAN_ADULT_MAX_AGE
  );
}

function isCourtshipCandidate(entity: Entity, candidate: Entity): boolean {
  return (
    isEligibleToCourt(candidate)
    && !!candidate.gender
    && !!entity.gender
    && candidate.gender !== entity.gender
    && candidate.id !== entity.id
  );
}

/** Nearest eligible single — spatial query plus cohabiting housemates when at home. */
export function findCourtshipPartner(
  entity: Entity,
  atHome: boolean,
  courtRange: number,
  mobileGrid: EntitySpatialGrid | undefined,
  residenceOccupants: Map<number, Entity[]>,
  fallbackHumans?: readonly Entity[],
): Entity | undefined {
  let closest: Entity | undefined;
  let closestDistSq = courtRange * courtRange;

  const consider = (candidate: Entity, distSq: number) => {
    if (!isCourtshipCandidate(entity, candidate)) return;
    if (distSq >= closestDistSq) return;
    closestDistSq = distSq;
    closest = candidate;
  };

  // Childhood sweethearts get a head start — a schoolyard bond makes a friend feel closer.
  for (const friendId of entity.childhoodFriendsIds ?? []) {
    const friend = fallbackHumans?.find((h) => h.id === friendId);
    if (!friend || !friend.alive) continue;
    if (!isCourtshipCandidate(entity, friend)) continue;
    const dx = friend.x - entity.x;
    const dy = friend.y - entity.y;
    consider(friend, (dx * dx + dy * dy) * 0.25); // a friend counts as half the distance
  }

  if (atHome && hasResidenceAssignment(entity)) {
    for (const housemate of getHousemates(entity, residenceOccupants)) {
      if (!shareResidence(entity, housemate)) continue;
      const dx = housemate.x - entity.x;
      const dy = housemate.y - entity.y;
      consider(housemate, dx * dx + dy * dy);
    }
  }

  const nearby = findClosestEntityInRadius(
    mobileGrid,
    entity.x,
    entity.y,
    courtRange,
    (candidate) => isCourtshipCandidate(entity, candidate),
    'social',
    fallbackHumans,
  );
  if (nearby) {
    const dx = nearby.x - entity.x;
    const dy = nearby.y - entity.y;
    consider(nearby, dx * dx + dy * dy);
  }
  return closest;
}

// ============ TICK HUMANS ============

/** Nearest alive cursed Moon Howler (werewolf form) to an entity — for the priest hunt. */
function nearestActiveMoonHowler(e: Entity, werewolves: Entity[] | undefined): Entity | undefined {
  let best: Entity | undefined;
  let bestD = Infinity;
  for (const w of werewolves ?? []) {
    if (!w.alive || !isActiveMoonHowler(w)) continue;
    const dx = w.x - e.x;
    const dy = w.y - e.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = w;
    }
  }
  return best;
}

export function tickHumans(state: WorldState, ctx: TickContext): void {
  const {
    width, height, hourOfDay, season, canHeat,
    byType, newEntities, updatedBuildings, roadBuildings, playerHumans, focus,
    entityById, buildingById, mobileGrid,
  } = ctx;

  // Current terrain for pathfinding (routing around water/mountains).
  setCurrentPathMap(state.worldMap);

  const config = SPECIES_CONFIG[EntityType.Human];
  const isWinter = season === Season.Winter;

  // Clock buckets (not per-person yet — refined per human below).
  const goWorkTime = isOnWorkShift(state.tick, hourOfDay);
  const weekend = isWeekend(state.tick);
  const isNewCalendarDay = isNewCalendarDayTick(state);
  const humanFleeMult = getHumanFleeSpeedMultiplier(state);
  const isTick8 = hourOfDay === 8 && isStartOfClockHour(state.tick);
  // One pass: construction crew lookup O(1) per human instead of O(buildings) each.
  const constructionByWorkerId = buildConstructionCrewIndex(updatedBuildings);
  const workplaceOpts = { buildingById, constructionByWorkerId };
  const allHumans: Entity[] = [];
  const humanIds = new Set<number>();
  for (const h of byType[EntityType.Human]) {
    if (!h.alive) continue;
    allHumans.push(h);
    humanIds.add(h.id);
  }
  for (const born of newEntities) {
    if (born.alive && born.type === EntityType.Human && !humanIds.has(born.id)) {
      allHumans.push(born);
      humanIds.add(born.id);
    }
  }
  // One workplace index per tick — shift-mates / coworker lookups below stay O(1)
  // instead of an O(H) filter per human (O(H²) per tick at 200+ pop).
  const workersByWorkplace = new Map<number, Entity[]>();
  for (const h of allHumans) {
    if (!h.alive || !isPlayerHuman(h) || h.isJuvenile) continue;
    const siteId = h.homeBuildingId;
    if (siteId == null) continue;
    const bucket = workersByWorkplace.get(siteId);
    if (bucket) bucket.push(h);
    else workersByWorkplace.set(siteId, [h]);
  }
  // Nurturing settlers boost every child's maturation this tick.
  const nurturingSettlerCount = allHumans.filter(
    (h) => h.alive && !h.isJuvenile && h.traits?.includes('nurturing'),
  ).length;
  const livingHumanAt = (id: number | null | undefined): Entity | undefined => {
    if (id == null) return undefined;
    const h = entityById.get(id);
    return isSettlerRelationshipEntity(h) ? h : undefined;
  };
  const residenceOccupants = ctx.residenceOccupants ?? buildResidenceOccupantIndex(playerHumans);
  ctx.residenceOccupants = residenceOccupants;
  if (!ctx.roadAvoidance) {
    ctx.roadAvoidance = buildRoadAvoidanceIndex(width, height, roadBuildings);
  }
  const roadAvoidance = ctx.roadAvoidance;
  const churchStrength = getChurchStrength(updatedBuildings, playerHumans);
  if (ctx.hasWell === undefined) {
    ctx.hasWell = updatedBuildings.some((b) => b.type === BuildingType.Well && b.completed);
  }
  if (ctx.hasHospital === undefined) {
    ctx.hasHospital = updatedBuildings.some((b) => b.type === BuildingType.Hospital && b.completed);
  }
  const hasWell = ctx.hasWell;
  const hasHospital = ctx.hasHospital;
  // Staffed civic sites once per tick — avoid O(buildings) find per human for hospital/hall.
  const staffedHospitals: Building[] = [];
  const staffedTownHalls: Building[] = [];
  for (const b of updatedBuildings) {
    if (!b.completed || b.faction === 'rival' || b.occupants.length === 0) continue;
    if (b.type === BuildingType.Hospital) staffedHospitals.push(b);
    else if (b.type === BuildingType.TownHall) staffedTownHalls.push(b);
  }
  // Local neighborhood only — full map diagonal scanned every idle human per tick (perf cliff @ 100+ pop).
  const socialScanRadius = MOBILE_CELL_SIZE * 4;
  const chatHints = chatHintsFromWorld({
    season,
    weather: state.weather,
    festivalActive: state.festival?.active,
    food: state.resources.food,
  });
  const resolveChatPartner = (id: number): Entity | null => {
    const partner = entityById.get(id);
    return isSettlerRelationshipEntity(partner) ? partner : null;
  };
  const settlerChat = (
    entity: Entity,
    context: HumanChatContext,
    chance: number,
    partner: Entity | null = null,
  ) => maybeDialogueChat(entity, partner, context, state.tick, chance, chatHints);
  const settlerPairChat = (
    entityA: Entity,
    entityB: Entity,
    context: HumanChatContext,
    chance: number,
  ) => {
    if (entityA.id < entityB.id) settlerChat(entityA, context, chance, entityB);
  };

  /** Nearby humans for random pair banter — prefer partner, kids, coworkers (small village). */
  const ambientChatNeighbors = (self: Entity): Entity[] => {
    const out: Entity[] = [];
    const prefer: Entity[] = [];
    forEachInEntityGrid(
      mobileGrid,
      self.x,
      self.y,
      socialScanRadius,
      (other) => {
        if (
          other.id !== self.id
          && other.alive
          && other.type === EntityType.Human
          && isPlayerHuman(other)
          && (other.chatTicks ?? 0) <= 0
        ) {
          const isPartner = self.partnerId === other.id || other.partnerId === self.id;
          const isKid = (self.childrenIds ?? []).includes(other.id)
            || (other.childrenIds ?? []).includes(self.id);
          const isCoworker = self.homeBuildingId != null
            && other.homeBuildingId === self.homeBuildingId;
          if (isPartner || isKid || isCoworker) prefer.push(other);
          else out.push(other);
        }
      },
      'social',
      allHumans,
    );
    // Bonds first so dialogue trees fire between people who share a life.
    return prefer.length > 0 ? [...prefer, ...out] : out;
  };

  // School enrollment is capped per school (SCHOOL_MAX_CHILDREN) — reserve seats
  // as children pick schools this pass so the first 10 get in.
  const schoolReserved = new Map<number, number>();

  for (const entity of allHumans) {
    if (!entity.alive) continue;
    reconcileAffairPartner(entity, entityById);

    // Common updates
    if (isNewCalendarDay) {
      if (entity.isJuvenile && isPlayerHuman(entity)) {
        creditChildSchoolDay(entity);
      }
      const schoolMult = entity.isJuvenile && isPlayerHuman(entity)
        ? getSchoolAgeMultiplier(entity, updatedBuildings, nurturingSettlerCount)
        : 1;
      syncHumanAgeFromCalendar(entity, state, {
        schoolAgeMultiplier: schoolMult > 1 ? schoolMult : undefined,
      });
    }
    entity.flash = Math.max(0, entity.flash - 1);
    if (entity.combatTicks && entity.combatTicks > 0) {
      entity.combatTicks--;
      if (entity.combatTicks <= 0) entity.combatTicks = 0;
    }
    if (entity.huntTargetId) {
      const prey = entityById.get(entity.huntTargetId);
      if (!prey?.alive) entity.huntTargetId = undefined;
    }

    if (isNewCalendarDay && tryDailyHumanMortality(state, entity, updatedBuildings, entityById)) {
      syncEntityGrids(ctx, entity);
      continue;
    }

    const isPrisoner = entity.prisonBuildingId != null;
    const atHome = shouldBeAtHome(hourOfDay) && isNearResidence(entity, buildingById);

    entity.reproductionCooldown = Math.max(0, entity.reproductionCooldown - 1);
    if (entity.gender && entity.relationshipStatus === undefined) {
      entity.relationshipStatus = 'single';
      entity.attraction = 50 + Math.random() * 50;
    }

    let conceivedToday = false;
    if (isNewCalendarDay && !isPrisoner && isPlayerHuman(entity)) {
      conceivedToday = tryDailyConception(state, ctx, entity);
      tryDailyAffairEncounter(
        state,
        entity,
        entityById,
        updatedBuildings,
        buildingById,
        churchStrength,
        hourOfDay,
        mobileGrid,
        playerHumans,
      );
      tryDailyAffairGossip(
        state,
        entity,
        entityById,
        updatedBuildings,
        buildingById,
        churchStrength,
        playerHumans,
        mobileGrid,
      );
    }

    tryGraduateHumanChild(entity, config.size, config.speed, (e) => {
      if (isPlayerHuman(e)) applyEducationGraduation(state, e);
    });
    const schoolTarget = entity.isJuvenile && isPlayerHuman(entity)
      ? findSchoolForChild(entity, updatedBuildings, schoolReserved)
      : undefined;
    if (schoolTarget) {
      schoolReserved.set(schoolTarget.id, (schoolReserved.get(schoolTarget.id) ?? 0) + 1);
      // Kids let family secrets slip at school — once per day, while enrolled.
      if (isNewCalendarDay) {
        trySchoolyardGossip(state, entity, entityById, updatedBuildings, playerHumans);
        tryFormSchoolyardBond(state, entity);
      }
    }
    const inFocus = !focus || isInFocus(entity, focus);
    const active = !isPrisoner && (
      inFocus
      || entity.pregnant
      || hasAffairPartner(entity, entityById)
      || (entity.affairProgress ?? 0) >= 20
      || (state.tick + entity.id) % OFFSCREEN_HUMAN_THROTTLE === 0
    );

    const inElectionCeremony = state.electionCeremony != null && isPlayerHuman(entity);

    if (isPrisoner) {
      entity.vx = 0;
      entity.vy = 0;
      const prison = buildingById.get(entity.prisonBuildingId!);
      if (prison) {
        const dx = prison.x - entity.x;
        const dy = prison.y - entity.y;
        const dist = Math.hypot(dx, dy) || 1;
        if (dist > 14) {
          entity.x += (dx / dist) * Math.min(dist, 1.2);
          entity.y += (dy / dist) * Math.min(dist, 1.2);
        }
      }
      syncEntityGrids(ctx, entity);
      continue;
    }

    // Always advance speech/dialogue timers — even off-screen — so bubbles don't
    // freeze until the camera pans back (cheap: only decrements chatTicks).
    tickHumanChat(entity, resolveChatPartner);

    // Ambient random dialogue (any time) — not gated to work/evening/arrival.
    // ~1.2% per clock-hour tick (legacy 24-tick day); scale so longer days stay chatty, not spammy.
    if (
      active
      && isPlayerHuman(entity)
      && !entity.faction
      && (entity.chatTicks ?? 0) <= 0
    ) {
      tryAmbientRandomDialogue(
        entity,
        ambientChatNeighbors(entity),
        state.tick,
        0.012 * PER_TICK_RATE_SCALE,
        chatHints,
        {
          pregnant: !!entity.pregnant,
          renffr: isRenffrGossipActive(state),
          workHour: goWorkTime,
          night: prefersHomeTonight(entity.id, state.tick, hourOfDay),
        },
      );
    }

    if (!active) {
      let minimalEnergyLoss = hasWell ? config.energyLossPerTick * 0.8 : config.energyLossPerTick;
      if (hasHospital) minimalEnergyLoss *= 0.9;
      if (isWinter && !canHeat) minimalEnergyLoss *= 1.5;
      // Hardy settlers burn energy slower.
      minimalEnergyLoss *= traitMultiplier(entity, 'hardy', 0.85);
      entity.energy -= minimalEnergyLoss;
      // Colony larder meals are player settlers only (visitors/rivals must not drain food)
      if (
        isPlayerHuman(entity)
        && isMealWindow(hourOfDay)
        && isStartOfClockHour(state.tick)
        && state.resources.food >= 1
        && entity.energy < entity.maxEnergy * 0.9
      ) {
        state.resources.food -= 1;
        recordFoodConsumed(state, 'meals', 1);
        entity.energy = Math.min(entity.maxEnergy, entity.energy + 65);
      }
      if (isPlayerHuman(entity) && entity.energy <= 0) {
        killHuman(entity, updatedBuildings, entityById, state.tick);
        createDeathParticles(state, entity.x, entity.y, '#8B0000', 8);
        logEvent(state, 'death', formatDeathLog(entity, 'succumbed to exhaustion'), formatCitizenName(entity));
      }
      syncEntityGrids(ctx, entity);
      continue;
    }

    // Trade-route merchants — walk export leg to partner, return with imports
    if (entity.faction === 'trade_caravan') {
      const target = getCaravanMoveTarget(state, entity);
      if (target) {
        const dx = target.x - entity.x;
        const dy = target.y - entity.y;
        const dist = Math.hypot(dx, dy) || 1;
        entity.vx = (dx / dist) * config.speed * target.speedMult;
        entity.vy = (dy / dist) * config.speed * target.speedMult;
        entity.x += entity.vx;
        entity.y += entity.vy;
        entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
        tryAdvanceCaravanLeg(state, entity);
      }
      syncEntityGrids(ctx, entity);
      continue;
    }

    // Visitors & rival settlers — visitors tour village POIs; rivals camp / raid march
    if (entity.faction === 'visitor' || entity.faction === 'rival') {
      const camp = entity.faction === 'visitor'
        ? state.visitorGroups.find((g) => g.id === entity.groupId)
        : state.rivalSettlements.find((r) => r.id === entity.groupId);
      if (camp) {
        const marching = entity.faction === 'rival' && entity.groupId && isRaidMarchingForRival(state, entity.groupId);
        const playerCenter = marching ? getPlayerCampCenter(state, updatedBuildings) : null;
        const cx = marching && playerCenter ? playerCenter.x : ('campX' in camp ? camp.campX : 0);
        const cy = marching && playerCenter ? playerCenter.y : ('campY' in camp ? camp.campY : 0);
        // Visitors walk purposefully into town; rivals linger slower at camp
        let speedMult = entity.faction === 'visitor' ? 0.62 : 0.4;
        if (marching) {
          const raidEvt = state.pendingRaidEvents?.find((r) => r.rivalId === entity.groupId);
          const marchTiles = raidEvt?.marchDistanceTiles ?? 30;
          speedMult = Math.max(0.38, 0.92 - marchTiles / 130);
        }
        if (marching) {
          const dx = cx - entity.x;
          const dy = cy - entity.y;
          const dist = Math.hypot(dx, dy) || 1;
          entity.vx = (dx / dist) * config.speed * speedMult;
          entity.vy = (dy / dist) * config.speed * speedMult;
          entity.x += entity.vx;
          entity.y += entity.vy;
          entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
        } else if (
          entity.faction === 'visitor'
          && steerVisitorToHotel(entity, updatedBuildings, config.speed * speedMult)
        ) {
          // Sleeping at the hotel tonight — skip camp wander
        } else {
          tickFactionCampWander(
            state,
            entity,
            cx,
            cy,
            updatedBuildings,
            config.speed * speedMult,
          );
        }
        const dist = Math.hypot(cx - entity.x, cy - entity.y);
        if (marching && dist < 90) entity.combatTicks = Math.max(entity.combatTicks ?? 0, 8);
        // Visitors chat more when near the village center (looks "busy")
        const village = getPlayerCampCenter(state, updatedBuildings);
        const nearVillage = Math.hypot(entity.x - village.x, entity.y - village.y) < 110;
        const chatChance = (entity.faction === 'visitor'
          ? (nearVillage ? 0.055 : 0.03)
          : 0.025) * PER_TICK_RATE_SCALE;
        settlerChat(entity, entity.faction === 'visitor' ? 'visitor' : 'rival', chatChance);
      }
      syncEntityGrids(ctx, entity);
      continue;
    }

    let energyLoss = hasWell ? config.energyLossPerTick * 0.8 : config.energyLossPerTick;
    if (isWinter && !canHeat) {
      // Greenthumb settlers shrug off the winter cold.
      energyLoss *= 1.5 * traitMultiplier(entity, 'greenthumb', 0.7);
      if (isTick8) entity.flash = 5;
    }

    // Resting near home (evening/night or quiet day) costs less energy.
    if (
      hasResidenceAssignment(entity)
      && prefersHomeTonight(entity.id, state.tick, hourOfDay)
    ) {
      const residence = buildingById.get(entity.residenceBuildingId!);
      if (residence?.completed) {
        const hdx = residence.x + residence.width / 2 - entity.x;
        const hdy = residence.y + residence.height / 2 - entity.y;
        if (Math.hypot(hdx, hdy) < 14) energyLoss *= 0.5;
      }
    }
    
    // Hospital reduces energy loss
    if (hasHospital) energyLoss *= 0.9;
    // Hardy settlers burn energy slower; fierce ones push through the shift.
    energyLoss *= traitMultiplier(entity, 'hardy', 0.85);
    energyLoss *= traitMultiplier(entity, 'fierce', 0.9);
    
    entity.energy -= energyLoss;

    let ateMeal = false;

    // Meals twice per day (8–10am & 6–8pm) — once per clock hour, 1 food ≈ 65 energy
    if (
      isMealWindow(hourOfDay)
      && isStartOfClockHour(state.tick)
      && state.resources.food >= 1
      && entity.energy < entity.maxEnergy * 0.9
    ) {
      state.resources.food -= 1;
      recordFoodConsumed(state, 'meals', 1);
      entity.energy = Math.min(entity.maxEnergy, entity.energy + 65);
      ateMeal = true;
    }

    let suppressIdle = false;
    let onSchedule = false;
    const workplace = findHumanWorkplace(entity, updatedBuildings, workplaceOpts);
    const isInnkeeper = entity.job === JobType.Innkeeper
      && workplace?.type === BuildingType.Tavern
      && workplace.completed;

    // Innkeepers work evenings (every day); everyone else uses the daytime Mon–Fri shift.
    const onDayJobShift = goWorkTime && !isInnkeeper && (
      workplace != null
      || schoolTarget != null
      || (entity.job === JobType.Guard && isBarracksGuard(entity.id, entity.homeBuildingId, updatedBuildings))
    );
    const onTavernShift = isInnkeeper && isOnInnkeeperShift(state.tick, hourOfDay);
    // Priests work the exorcism shift on full-moon nights — they leave home to hunt the Moon Howler.
    const onMoonPriestShift = entity.job === JobType.Priest
      && workplace?.type === BuildingType.Church
      && workplace.completed
      && isOnMoonHowlerNightShift(state.tick, hourOfDay);
    const onJobShift = onDayJobShift || onTavernShift || onMoonPriestShift;

    // Per-person daily mood: some evenings out, some nights in; weekends lazy or busy.
    // Innkeepers on duty ignore "stay in" — the pub needs them.
    const stayIn = !onTavernShift && !onMoonPriestShift && prefersHomeTonight(entity.id, state.tick, hourOfDay);
    // Free roam when not on the job and not choosing a quiet home stretch.
    const allowFreeRoam = !onJobShift && !stayIn;
    // Day-job holders aren't "free" during work hours; innkeepers only lock evenings.
    const socialBlockedByJob = isInnkeeper
      ? onTavernShift
      : (workplace != null && !isInnkeeper && isWorkHour(hourOfDay) && isOnWorkShift(state.tick, hourOfDay));
    const socialTime = (!socialBlockedByJob && allowSocialLife(hourOfDay, false, state.tick))
      || (allowFreeRoam && isPlayerHuman(entity));

    // Flee from dangerous Moon Howlers on full-moon nights
    const huntingWere = findClosestEntityInRadius(
      mobileGrid,
      entity.x,
      entity.y,
      110,
      (w) => w.type === EntityType.Werewolf && w.alive && isActiveMoonHowler(w),
      'human_hunt',
      byType[EntityType.Werewolf],
    );
    // Priests on the exorcism shift: come out and actively hunt the Moon Howler —
    // or retreat to the Church if a comrade just fell.
    if (onMoonPriestShift) {
      suppressIdle = true;
      onSchedule = true;
      const scared = state.tick < (state.moonHowlerPriestsFleeUntil ?? -1);
      const targetWere = nearestActiveMoonHowler(entity, byType[EntityType.Werewolf]);
      if (targetWere) {
        const hdx = targetWere.x - entity.x;
        const hdy = targetWere.y - entity.y;
        const hdist = Math.hypot(hdx, hdy) || 1;
        const dir = scared ? -1 : 1; // scared → away from the howler
        const mult = scared ? 1.35 : 1.1;
        entity.vx = (hdx / hdist) * config.speed * mult * dir;
        entity.vy = (hdy / hdist) * config.speed * mult * dir;
        entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
      } else if (workplace) {
        // No howler abroad — hold the night shift at the Church.
        commuteHumanToBuilding(entity, workplace, config.speed, false, 3.2);
      }
    } else if (huntingWere) {
      const fdx = entity.x - huntingWere.x;
      const fdy = entity.y - huntingWere.y;
      const fdist = Math.sqrt(fdx * fdx + fdy * fdy) || 1;
      const fleeMult = humanFleeMult * traitMultiplier(entity, 'timid', 1.35);
      entity.vx = (fdx / fdist) * config.speed * 1.6 * fleeMult;
      entity.vy = (fdy / fdist) * config.speed * 1.6 * fleeMult;
      entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
      suppressIdle = true;
      onSchedule = true;
      settlerChat(entity, 'fear', 0.14 * PER_TICK_RATE_SCALE);
    } else if (inElectionCeremony && state.electionCeremony) {
      const target = getElectionGatherTarget(state, entity.id);
      const dx = target.x - entity.x;
      const dy = target.y - entity.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist > 10) {
        entity.vx = (dx / dist) * config.speed * 1.15;
        entity.vy = (dy / dist) * config.speed * 1.15;
        entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
      } else {
        entity.vx = 0;
        entity.vy = 0;
      }
      suppressIdle = true;
      onSchedule = true;
    }

    // Long commutes: snap at shift start so workers aren't walking all day
    if (
      !huntingWere
      && !inElectionCeremony
      && workplace
      && isStartOfClockHour(state.tick)
      && (
        // Day jobs + construction at 7am
        (hourOfDay === WORK_START && !isInnkeeper && (hasWorkAssignment(entity) || !workplace.completed))
        // Innkeeper opens the tavern at 5pm
        || (hourOfDay === TAVERN_SHIFT_START && isInnkeeper)
      )
    ) {
      if (commuteDistanceToBuilding(entity, workplace, false) > COMMUTE_SNAP_DISTANCE) {
        snapHumanToBuilding(entity, workplace, false);
      }
    } else if (
      !huntingWere
      && !inElectionCeremony
      && hourOfDay === EVENING_START
      && isStartOfClockHour(state.tick)
      && stayIn
      && hasResidenceAssignment(entity)
    ) {
      // Only snap home if this person is staying in tonight (not going out).
      const eveningHome = buildingById.get(entity.residenceBuildingId!);
      if (
        eveningHome?.completed
        && commuteDistanceToBuilding(entity, eveningHome, true) > COMMUTE_SNAP_DISTANCE
      ) {
        snapHumanToBuilding(entity, eveningHome, true);
      }
    }

    // Home when they choose a quiet stretch (varies by person/day); work still overrides below.
    if (
      !huntingWere
      && !inElectionCeremony
      && !onJobShift
      && stayIn
      && hasResidenceAssignment(entity)
    ) {
      const residence = buildingById.get(entity.residenceBuildingId!);
      if (residence?.completed) {
        commuteHumanToBuilding(entity, residence, config.speed, true, 2.5);
        onSchedule = true;
        suppressIdle = true;
      }
    } else if (
      !huntingWere
      && !inElectionCeremony
      && goWorkTime
      && workplace
      && entity.job === JobType.Guard
      && isBarracksGuard(entity.id, entity.homeBuildingId, updatedBuildings)
    ) {
      const anchor = getPlayerCampCenter(state, updatedBuildings);
      if (anchor) {
        const radius = 95 + (entity.id % 6) * 10;
        // Legacy 0.028 rad/tick assumed 1 tick = 1 hour; scale so patrol speed is calendar-stable.
        const angle = state.tick * 0.028 * PER_TICK_RATE_SCALE + entity.id * 2.1;
        const tx = anchor.x + Math.cos(angle) * radius;
        const ty = anchor.y + Math.sin(angle) * radius * 0.55;
        const pdx = tx - entity.x;
        const pdy = ty - entity.y;
        const pdist = Math.hypot(pdx, pdy) || 1;
        entity.vx = (pdx / pdist) * config.speed * 0.65;
        entity.vy = (pdy / pdist) * config.speed * 0.65;
        entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
        onSchedule = true;
        suppressIdle = true;
      } else if (workplace) {
        commuteHumanToBuilding(
          entity,
          workplace,
          config.speed,
          workplace.completed && isResidenceBuilding(workplace),
          3.5,
        );
        onSchedule = true;
        suppressIdle = true;
      }
    } else if (!huntingWere && !inElectionCeremony && goWorkTime && !isInnkeeper && schoolTarget) {
      commuteHumanToBuilding(entity, schoolTarget, config.speed, false, 3.2);
      onSchedule = true;
      suppressIdle = true;
      recordChildSchoolTick(entity, schoolTarget, hourOfDay, state.tick);
    } else if (!huntingWere && !inElectionCeremony && onTavernShift && workplace) {
      // Innkeeper tends the bar evenings (weekdays + weekends)
      commuteHumanToBuilding(entity, workplace, config.speed, false, 3.2);
      onSchedule = true;
      suppressIdle = true;
      if (Math.random() < 0.04 * PER_TICK_RATE_SCALE) settlerChat(entity, 'work', 0.12);
    } else if (!huntingWere && !inElectionCeremony && goWorkTime && !isInnkeeper && workplace) {
      commuteHumanToBuilding(
        entity,
        workplace,
        config.speed,
        workplace.completed && isResidenceBuilding(workplace),
        3.5,
      );
      onSchedule = true;
      suppressIdle = true;
    }

    if (!allowFreeRoam && onSchedule && !huntingWere) {
      entity.vx *= 0.85;
      entity.vy *= 0.85;
    }

    // Free-roam hunting — player settlers only (visitors/rivals do not farm the valley).
    // Hunters chase game when moderately hungry; other jobs only when starving.
    const isJobHunter = entity.job === JobType.Hunter;
    const freeHuntHungry = isJobHunter
      ? entity.energy < entity.maxEnergy * 0.85
      : entity.energy < entity.maxEnergy * 0.38;
    if (
      allowFreeRoam
      && isPlayerHuman(entity)
      && !ateMeal
      && !entity.isJuvenile
      && freeHuntHungry
    ) {
      const preyTypes = new Set<EntityType>([EntityType.Deer, EntityType.Rabbit]);
      // Assigned hunters range farther; everyone else is opportunistic
      const huntRange = getHumanHuntRange(
        state,
        config.huntRange * (isJobHunter ? 1.2 : 0.75) * traitMultiplier(entity, 'brave', 1.25),
      );
      let closestPrey: Entity | null = null;
      let closestDist = Infinity;

      const preyFallback = [
        ...byType[EntityType.Deer],
        ...byType[EntityType.Rabbit],
      ];
      const huntHit = findClosestInEntityGrid(
        mobileGrid,
        entity.x,
        entity.y,
        huntRange,
        (prey) => preyTypes.has(prey.type) && isValidHuntPrey(prey, prey.type, entity.id),
        'hunt',
        preyFallback,
      );
      if (huntHit) {
        closestPrey = huntHit.entity;
        closestDist = Math.sqrt(huntHit.distSq);
      }

      if (closestPrey?.alive && closestDist < config.size + closestPrey.size) {
        const preyId = closestPrey.id;
        markWildlifeDead(ctx, closestPrey);
        clearHuntersTargetingPrey(preyId, entityById, ctx.huntTargetByPreyId);
        createDeathParticles(state, closestPrey.x, closestPrey.y, '#8a2a2a', 10);
        syncEntityGrids(ctx, closestPrey);
        // Arrow flight for free-roam hunting too (same FX as Hunting Spots)
        addHuntVisual(state, {
          hunterId: entity.id,
          preyType: closestPrey.type,
          fromX: entity.x,
          fromY: entity.y,
          toX: closestPrey.x,
          toY: closestPrey.y,
          startedAtTick: state.tick,
          startedAtMs: Date.now(),
          success: true,
          foughtBack: false,
        });
        const energyBite = config.energyGain[closestPrey.type] ?? (closestPrey.type === EntityType.Deer ? 350 : 150);
        entity.energy = Math.min(entity.maxEnergy, entity.energy + energyBite);
        entity.flash = 10;
        entity.combatTicks = 16;
        entity.huntTargetId = undefined;
        const foodGain = freeHuntFoodGain(closestPrey.type, state);
        addResource(state, 'food', foodGain);
        const preyLabel = closestPrey.type === EntityType.Deer ? 'Deer' : 'Rabbit';
        addFloatingText(state, closestPrey.x, closestPrey.y - 14, `Hunted ${preyLabel}! +${foodGain}`, '#f97316');
        entity.vx = 0;
        entity.vy = 0;
        impulseScreenShake(state, 2);
      } else if (closestPrey?.alive) {
        entity.huntTargetId = closestPrey.id;
        const dx = closestPrey.x - entity.x;
        const dy = closestPrey.y - entity.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        // Hunters pursue faster; casual foragers jog; brave settlers push harder
        const chaseMult = (isJobHunter ? 0.72 : 0.5) * traitMultiplier(entity, 'brave', 1.2);
        entity.vx = (dx / dist) * config.speed * chaseMult;
        entity.vy = (dy / dist) * config.speed * chaseMult;
        entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
        suppressIdle = true;
        // Strained+ valley: rare chatter so yield dips don't read as pure RNG
        if (
          valleyStageIndex(state.valleyStage ?? 'stable') >= 1
          && isJobHunter
          && personDayRoll(entity.id, state.tick, 811) < 0.012
        ) {
          sayHumanChatPhrase(entity, "Game's getting scarce…", 48);
        }
      } else {
        entity.huntTargetId = undefined;
        if (
          valleyStageIndex(state.valleyStage ?? 'stable') >= 1
          && isJobHunter
          && personDayRoll(entity.id, state.tick, 812) < 0.02
        ) {
          sayHumanChatPhrase(entity, 'Thin trails today…', 40);
        }
      }
    } else if (
      !allowFreeRoam
      || ateMeal
      || !isPlayerHuman(entity)
      || entity.isJuvenile
      || !freeHuntHungry
    ) {
      entity.huntTargetId = undefined;
    }

    if (
      isPlayerHuman(entity)
      && entity.gender === 'female'
      && entity.pregnant
      && !conceivedToday
      && entity.pregnancyProgress !== undefined
    ) {
      entity.pregnancyProgress++;
      if (entity.pregnancyProgress >= PREGNANCY_TICKS) {
        const angle = Math.random() * Math.PI * 2;
        const nx = Math.min(width, Math.max(0, entity.x + Math.cos(angle) * 10));
        const ny = Math.min(height, Math.max(0, entity.y + Math.sin(angle) * 10));
        const nearDeer = byType[EntityType.Deer].some(
          (d) => d.alive && Math.hypot(d.x - entity.x, d.y - entity.y) < 80,
        );
        const wildkinBirth = nearDeer && Math.random() < 0.03;
        const biologicalFatherIdAtBirth = entity.pregnantById ?? entity.partnerId;

        // Soft birth cost — was flat -50 and could kill low-energy mothers as "childbirth"
        entity.energy = Math.max(entity.maxEnergy * 0.18, entity.energy - 45);
        entity.pregnant = false;
        entity.pregnancyProgress = 0;
        entity.pregnantById = undefined;
        entity.relationshipStatus = entity.partnerId != null ? 'married' : 'single';
        entity.reproductionCooldown = REPRODUCTION_COOLDOWN_TICKS;

        if (wildkinBirth) {
          const wildkin = createEntity(EntityType.Wildkin, nx, ny, state.nextEntityId++, 250);
          pushNewEntity(state, ctx, wildkin);
          addBigNews(
            state,
            '🦌 Wildkin Born!',
            `${entity.name || 'A settler'} gave birth to a gentle Wildkin — a rare gift of the forest.`,
            'neutral',
          );
          addFloatingText(state, entity.x, entity.y - 20, 'Wildkin born!', '#a3a35a');
          logEvent(state, 'birth', `${entity.name || 'A settler'} gave birth to a Wildkin`, entity.name);
        } else {
          const biologicalFatherId = biologicalFatherIdAtBirth;
          const husband = entity.partnerId != null
            ? livingHumanAt(entity.partnerId)
            : undefined;
          const biologicalFather = biologicalFatherId != null
            ? livingHumanAt(biologicalFatherId)
            : undefined;
          const { surname: babySurname, isBastard } = resolveChildSurname(
            entity,
            entity.partnerId,
            biologicalFatherId,
            husband,
            biologicalFather,
          );
          const babyGen = (entity.generation ?? 0) + 1;
          const childGender = Math.random() > 0.5 ? 'male' : 'female';
          // DNA-like inheritance: each parent trait has a chance to pass down;
          // any slot left unfilled is rolled fresh by createEntity.
          const inheritedTraits = inheritSettlerTraits(entity, biologicalFather);
          const child = createEntity(EntityType.Human, nx, ny, state.nextEntityId++, 80, true, {
            gender: childGender,
            fatherId: biologicalFatherId,
            motherId: entity.id,
            generation: babyGen,
            surname: babySurname,
            isBastard,
            spriteVariant: entity.spriteVariant ?? pickHumanVariant(entity.id, childGender),
            inheritedTraits,
          });
          child.name = getRandomName(child.gender === 'male' ? 'male' : 'female');
          child.residenceBuildingId = entity.residenceBuildingId;
          setHumanBirthFromAge(child, 0, getColonyDay(state));
          pushNewEntity(state, ctx, child);
          entity.childrenIds ??= [];
          entity.childrenIds.push(child.id);
          if (biologicalFather?.alive) {
            biologicalFather.flash = 10;
            biologicalFather.childrenIds ??= [];
            biologicalFather.childrenIds.push(child.id);
            if (biologicalFather.relationshipStatus === 'expecting') {
              biologicalFather.relationshipStatus = biologicalFather.partnerId != null ? 'married' : 'single';
            }
          }
          if (husband?.alive && !isBastard) {
            husband.flash = 10;
            husband.childrenIds ??= [];
            if (!husband.childrenIds.includes(child.id)) husband.childrenIds.push(child.id);
            if (husband.relationshipStatus === 'expecting') husband.relationshipStatus = 'married';
          }
          rebuildChildrenIds(allLivingHumans(state, newEntities, entityById));
          createDeathParticles(state, entity.x, entity.y - 10, isBastard ? '#a855f7' : '#ffb6c1', 12, 'heart');
          const childLabel = `${child.name}${babySurname ? ` ${babySurname}` : ''}`;
          if (isBastard) {
            addFloatingText(state, entity.x, entity.y - 20, `${childLabel} born (bastard)`, '#c084fc');
            const fatherName = biologicalFather ? humanDisplayName(biologicalFather) : 'an unknown father';
            const bastardDetail = husband && biologicalFather && husband.id !== biologicalFather.id
              ? `${childLabel} — ${humanDisplayName(husband)} is not the father (${fatherName})`
              : `${childLabel} — born outside wedlock (father: ${fatherName})`;
            addBigNews(state, '⚜ Bastard Born', bastardDetail, 'negative');
            addNotification(state, 'Bastard Born', bastardDetail, 'warning');
            logEvent(state, 'birth', `${childLabel} was born a bastard`, child.name);
            if (husband && biologicalFather && husband.id !== biologicalFather.id) {
              state.villageReputation = Math.max(
                0,
                state.villageReputation + dampScandalReputationLoss(-3, updatedBuildings),
              );
              logEvent(
                state,
                'scandal',
                `Village gossip — ${childLabel} may not be ${humanDisplayName(husband)}'s child`,
                child.name,
              );
            }
          } else {
            addFloatingText(state, entity.x, entity.y - 20, `${childLabel} born!`, '#ff69b4');
            addNotification(state, 'New Birth', `${childLabel} was born to ${entity.name || 'mother'}!`, 'success');
            logEvent(state, 'birth', `${childLabel} was born`, child.name);
          }
        }
      }
      // EK-F1: apply movement before continue so pregnancy does not freeze settlers
      // (velocity still set earlier in the loop for work/home paths).
      {
        const nearRoad = queryIsNearRoad(
          roadAvoidance,
          entity.x,
          entity.y,
          roadBuildings,
          (x, y, road) => isEntityOnBuilding(x, y, road, 12),
        );
        const roadMult = nearRoad ? 1.5 : 1.0;
        entity.x += entity.vx * roadMult;
        entity.y += entity.vy * roadMult;
        if (entity.x < 0) entity.x = 0;
        if (entity.x > width) entity.x = width;
        if (entity.y < 0) entity.y = 0;
        if (entity.y > height) entity.y = height;

        // Footstep dust — a puff of trail dust when a settler walks the frontier.
        if (
          Math.hypot(entity.vx, entity.vy) > 0.8
          && Math.random() < 0.012
          && isPlayerHuman(entity)
          && !entity.isJuvenile
        ) {
          state.deathParticles.push({
            x: entity.x + (Math.random() - 0.5) * 6,
            y: entity.y + 4,
            vx: -entity.vx * 0.08 + (Math.random() - 0.5) * 0.3,
            vy: -0.25 - Math.random() * 0.3,
            life: 14 + Math.random() * 8,
            maxLife: 22,
            color: Math.random() < 0.5 ? '#9a8b74' : '#8a7c66',
            size: 1.5 + Math.random() * 1.2,
            type: 'smoke',
          });
        }
        advanceHumanWalkAnim(entity);
      }
      if (entity.energy <= 0) {
        // Still pregnant + energy gone = exhaustion; post-birth floor should prevent false "childbirth"
        killHuman(entity, updatedBuildings, entityById, state.tick);
        createDeathParticles(state, entity.x, entity.y, '#8B0000', 8);
        logEvent(
          state,
          'death',
          formatDeathLog(entity, 'succumbed to exhaustion while pregnant'),
          formatCitizenName(entity),
        );
        syncEntityGrids(ctx, entity);
        continue;
      }

      // BUGFIX: pregnancy used to `continue` before hospital care — mothers never got treated
      if (
        staffedHospitals.length > 0
        && isPlayerHuman(entity)
      ) {
        const hospital = staffedHospitals.find(
          (b) => Math.hypot(entity.x - (b.x + b.width / 2), entity.y - (b.y + b.height / 2)) < 40,
        );
        if (hospital && personDayRoll(entity.id, state.tick, 840) < 0.28) {
          treatPatientAtHospital(state, entity, hospital);
        } else if (
          // Needy settlers (pregnant / low energy) may take a hospital visit
          // during work hours — a staffed ward should actually be used, not
          // only help those who happen to wander past in free time.
          (needsMedicalCare(entity) || !onJobShift)
          && !huntingWere
          && !inElectionCeremony
          && staffedHospitals.length > 0
          && personDayRoll(entity.id, state.tick, 842) < 0.12
        ) {
          // Walk toward nearest staffed hospital when free
          let best: Building | undefined;
          let bestD = Infinity;
          for (const h of staffedHospitals) {
            const d = Math.hypot(entity.x - (h.x + h.width / 2), entity.y - (h.y + h.height / 2));
            if (d < bestD) {
              bestD = d;
              best = h;
            }
          }
          if (best && bestD > 28) {
            const dx = best.x + best.width / 2 - entity.x;
            const dy = best.y + best.height / 2 - entity.y;
            const dist = Math.hypot(dx, dy) || 1;
            entity.vx = (dx / dist) * config.speed * 0.55;
            entity.vy = (dy / dist) * config.speed * 0.55;
            entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
            entity.x += entity.vx;
            entity.y += entity.vy;
          }
        }
      }

      syncEntityGrids(ctx, entity);
      continue;
    }

    // Evening out — some singles (incl. divorced), some nights.
    if (
      socialTime
      && allowFreeRoam
      && isEligibleToCourt(entity)
      && hourOfDay >= EVENING_START
      && hourOfDay <= 22
      && !suppressIdle
      && personDayRoll(entity.id, state.tick, 301) > 0.35
    ) {
      const nearbySingle = findClosestEntityInRadius(
        mobileGrid,
        entity.x,
        entity.y,
        90,
        (h) =>
          isEligibleToCourt(h)
          && h.id !== entity.id
          && !!h.gender
          && !!entity.gender
          && h.gender !== entity.gender,
        'social',
        allHumans,
      ) != null;
      if (!nearbySingle) {
        const tx = width * 0.5 + ((entity.id % 5) - 2) * 35;
        const ty = height * 0.5 + ((entity.id % 7) - 3) * 28;
        const edx = tx - entity.x;
        const edy = ty - entity.y;
        const edist = Math.hypot(edx, edy) || 1;
        if (edist > 12) {
          entity.vx = (edx / edist) * config.speed * 0.45;
          entity.vy = (edy / edist) * config.speed * 0.45;
          entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
          suppressIdle = true;
        }
      }
    }

    // Courtship / remarriage — singles (incl. divorced) when free to socialize
    if (
      socialTime
      && isEligibleToCourt(entity)
      && entity.gender
      && entity.energy > config.reproductionEnergyThreshold * 0.6
    ) {
      const courtRange = atHome ? 120 : 80;
      const closest = findCourtshipPartner(
        entity,
        atHome,
        courtRange,
        mobileGrid,
        residenceOccupants,
        allHumans,
      );

      if (closest) {
          const dx = closest.x - entity.x;
          const dy = closest.y - entity.y;
          const dist = Math.hypot(dx, dy) || 1;
          const livingTogether = atHome && shareResidence(entity, closest);
          const closeEnough = dist <= 10 || livingTogether;

          if (!closeEnough) {
            const chaseSpeed = atHome ? 0.35 : 0.45;
            entity.vx = (dx / dist) * config.speed * chaseSpeed;
            entity.vy = (dy / dist) * config.speed * chaseSpeed;
            entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
            suppressIdle = true;
          } else {
            entity.vx *= 0.6;
            entity.vy *= 0.6;
            suppressIdle = true;
            if (Math.random() < 0.4 * PER_TICK_RATE_SCALE) {
              settlerPairChat(entity, closest, 'courtship', 0.85);
            } else if (Math.random() < 0.5 * PER_TICK_RATE_SCALE) {
              settlerPairChat(entity, closest, 'courtship', 0.1);
            }
            // Only the lower-id partner applies progress (avoids 2× when both tick)
            if (entity.id < closest.id) {
              const hasPerformers = state.visitorGroups.some((g) => g.kind === 'performers' && g.daysLeft > 0);
              const courtRate = (4 + churchStrength * 2)
                * (state.festival?.active ? 2 : 1)
                * (hasPerformers ? 1.35 : 1)
                * (livingTogether ? 1.5 : 1)
                // Gregarious settlers court faster; timid ones hold back.
                * traitMultiplier(entity, 'gregarious', 1.4)
                * traitMultiplier(entity, 'timid', 0.7)
                // Graceful settlers charm a little faster too.
                * traitMultiplier(entity, 'graceful', 1.2)
                * PER_TICK_RATE_SCALE;
              entity.courtshipProgress = Math.min(100, (entity.courtshipProgress || 0) + courtRate);
              closest.courtshipProgress = Math.min(100, (closest.courtshipProgress || 0) + courtRate);
            }

            if (Math.random() < 0.08 * PER_TICK_RATE_SCALE) {
              state.deathParticles.push({
                x: entity.x + (Math.random() - 0.5) * 15,
                y: entity.y - 8,
                vx: (Math.random() - 0.5) * 0.3,
                vy: -0.8 - Math.random() * 0.5,
                life: 25,
                maxLife: 25,
                color: '#ff69b4',
                size: 2 + Math.random() * 1.5,
                type: 'heart',
              });
            }

            if (
              entity.id < closest.id
              && entity.gender
              && closest.gender
              && entity.gender !== closest.gender
              && (entity.courtshipProgress ?? 0) >= 100
              && (closest.courtshipProgress ?? 0) >= 100
              && isEligibleToCourt(entity)
              && isEligibleToCourt(closest)
            ) {
              entity.relationshipStatus = 'married';
              entity.partnerId = closest.id;
              entity.courtshipProgress = 0;
              entity.affairPartnerId = undefined;
              entity.affairProgress = 0;
              closest.relationshipStatus = 'married';
              closest.partnerId = entity.id;
              closest.courtshipProgress = 0;
              closest.affairPartnerId = undefined;
              closest.affairProgress = 0;
              createDeathParticles(
                state,
                (entity.x + closest.x) / 2,
                (entity.y + closest.y) / 2 - 15,
                '#ffd700',
                15,
                'heart',
              );
              addFloatingText(
                state,
                (entity.x + closest.x) / 2,
                (entity.y + closest.y) / 2 - 25,
                'Married!',
                '#ffd700',
              );
              syncMarriageSurnames(entity, closest);
              const married1 = humanDisplayName(entity);
              const married2 = humanDisplayName(closest);
              logEvent(state, 'marriage', `${married1} and ${married2} got married`, married1);
              addNotification(state, 'Marriage', `${married1} & ${married2} are now married`, 'success');
              sayHumanChatPhrase(entity, 'Yes!', 120);
              sayHumanChatPhrase(closest, 'Yes!', 120);
              syncPartnerResidence(
                entity,
                closest,
                updatedBuildings.filter(isResidenceBuilding),
                playerHumans,
              );
            }
          }
      }
    }

    // Married couples — nudge toward partner when daily conception window missed (off-screen / apart)
    if (
      socialTime
      && isPlayerHuman(entity)
      && entity.gender === 'female'
      && entity.relationshipStatus === 'married'
      && !entity.pregnant
      && entity.partnerId
      && entity.reproductionCooldown <= 0
    ) {
      const partner = livingHumanAt(entity.partnerId);
      if (partner?.alive) {
        const dx = partner.x - entity.x;
        const dy = partner.y - entity.y;
        const dist = Math.hypot(dx, dy) || 1;
        const together = dist < 22 || (atHome && shareResidence(entity, partner));
        if (!together && dist > 15) {
          entity.vx = (dx / dist) * config.speed * 0.3;
          entity.vy = (dy / dist) * config.speed * 0.3;
          entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
          suppressIdle = true;
        }
      }
    }

    // Secret affairs — when the spouse isn't watching (including separate workplaces by day)
    if (
      canPursueSecretAffair(entity, hourOfDay, workplace, updatedBuildings, entityById, state.tick)
      && isPlayerHuman(entity)
      && !entity.isJuvenile
      && !entity.pregnant
      && entity.gender
      && entity.age >= HUMAN_ADULT_MIN_AGE
      && entity.age < HUMAN_ADULT_MAX_AGE
      && entity.energy > config.reproductionEnergyThreshold * 0.5
      && entity.relationshipStatus === 'married'
      && !isAtMaritalHome(entity, entityById, buildingById)
    ) {
      const affairRange = 75;
      const paramour = findClosestEntityInRadius(
        mobileGrid,
        entity.x,
        entity.y,
        affairRange,
        (h) => isValidAffairTarget(entity, h, state.tick) && !isSpouseNearby(h, entityById, AFFAIR_SPOUSE_BLOCK_RADIUS),
        'social',
        playerHumans,
      );

      if (paramour) {
          const trystTarget = getAffairTrystTarget(entity, paramour, buildingById);
          const dx = trystTarget.x - entity.x;
          const dy = trystTarget.y - entity.y;
          const dist = Math.hypot(dx, dy) || 1;
          const intimate = isValidAffairTrystSite(entity, paramour, entityById, buildingById, AFFAIR_INTIMATE_RADIUS);

          if (!intimate) {
            entity.vx = (dx / dist) * config.speed * 0.38;
            entity.vy = (dy / dist) * config.speed * 0.38;
            entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
            suppressIdle = true;
          } else {
            entity.vx *= 0.55;
            entity.vy *= 0.55;
            suppressIdle = true;

            if (shouldLeadAffairPair(entity, paramour)) {
              settlerPairChat(entity, paramour, 'affair', 0.18);

              const churchPenalty = churchStrength > 0 ? 0.72 + (1 - churchStrength) * 0.28 : 1;
              const affairRate = (churchStrength > 0 ? 4 : 6)
                * (state.festival?.active ? 1.4 : 1)
                * churchPenalty
                * PER_TICK_RATE_SCALE;
              entity.affairProgress = Math.min(100, (entity.affairProgress || 0) + affairRate);
              paramour.affairProgress = Math.min(100, (paramour.affairProgress || 0) + affairRate);

              if (Math.random() < 0.06 * PER_TICK_RATE_SCALE) {
                state.deathParticles.push({
                  x: entity.x + (Math.random() - 0.5) * 10,
                  y: entity.y - 6,
                  vx: (Math.random() - 0.5) * 0.2,
                  vy: -0.5,
                  life: 18,
                  maxLife: 18,
                  color: '#f472b6',
                  size: 2,
                  type: 'heart',
                });
              }

              if (entity.affairProgress >= 100 && paramour.affairProgress >= 100) {
                entity.affairPartnerId = paramour.id;
                paramour.affairPartnerId = entity.id;
                entity.affairProgress = 100;
                paramour.affairProgress = 100;
              }
            }

            if (
              (entity.affairProgress ?? 0) >= 45
              && (paramour.affairProgress ?? 0) >= 45
            ) {
              tryExposeCaughtAffairForPair(
                state,
                entity,
                paramour,
                entityById,
                buildingById,
                updatedBuildings,
                playerHumans,
                churchStrength,
                false,
                true,
                hourOfDay,
              );
            }
          }
      }
    }

    // Affair lovers — move toward tryst when apart; spouse can catch them in the act
    if (
      canPursueSecretAffair(entity, hourOfDay, workplace, updatedBuildings, entityById, state.tick)
      && isPlayerHuman(entity)
      && !entity.isJuvenile
      && !entity.pregnant
      && hasAffairPartner(entity, entityById)
      && !isAtMaritalHome(entity, entityById, buildingById)
    ) {
      const lover = livingHumanAt(entity.affairPartnerId);
      if (lover?.alive) {
        const trystTarget = getAffairTrystTarget(entity, lover, buildingById);
        const dx = trystTarget.x - entity.x;
        const dy = trystTarget.y - entity.y;
        const dist = Math.hypot(dx, dy) || 1;
        const tryst = isValidAffairTrystSite(entity, lover, entityById, buildingById, AFFAIR_INTIMATE_RADIUS);
        if (!tryst && dist > 14) {
          entity.vx = (dx / dist) * config.speed * 0.32;
          entity.vy = (dy / dist) * config.speed * 0.32;
          entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
          suppressIdle = true;
        } else if (tryst) {
          tryExposeCaughtAffairForPair(
            state,
            entity,
            lover,
            entityById,
            buildingById,
            updatedBuildings,
            playerHumans,
            churchStrength,
            true,
            true,
            hourOfDay,
          );
        }
      }
    }

    // Midday coworker banter while on a day job (not innkeepers)
    if (
      onDayJobShift
      && workplace
      && isPlayerHuman(entity)
      && !entity.isJuvenile
      && entity.job !== JobType.Innkeeper
    ) {
      const shiftMates = (workersByWorkplace.get(entity.homeBuildingId ?? -1) ?? [])
        .filter((h) => h.id !== entity.id);
      tryWorkplaceBanter(entity, shiftMates, state.tick, hourOfDay, true);
    }

    // Doctor on duty — treat sick / pregnant settlers near the hospital
    if (onDayJobShift && isPlayerHuman(entity) && entity.job === JobType.Doctor) {
      const ward = isDoctorAtHospital(entity, updatedBuildings);
      if (ward) {
        doctorTreatNearby(state, entity, ward, allHumans);
      }
    }

    // Official on duty — hear petitioners at the town hall
    if (onDayJobShift && isPlayerHuman(entity) && entity.job === JobType.Official) {
      const hall = isOfficialAtHall(entity, updatedBuildings);
      if (hall) {
        officialHandlePetitioners(state, entity, hall, allHumans);
      }
    }

    // Hotelier on duty — greet guests / tend front desk
    if (onDayJobShift && isPlayerHuman(entity) && entity.job === JobType.Hotelier) {
      const hotel = isHotelierAtHotel(entity, buildingById);
      if (hotel) {
        hotelierGreetGuests(state, entity, hotel);
      }
    }

    // Patient arrived at hospital — free time, or a needy settler who took a
    // work-hours clinic visit (matched by the walk-to-hospital gate above).
    if (
      (needsMedicalCare(entity) || !onJobShift)
      && isPlayerHuman(entity)
      && (entity.energy < entity.maxEnergy * 0.5 || entity.pregnant)
      && staffedHospitals.length > 0
    ) {
      const hospital = staffedHospitals.find(
        (b) => Math.hypot(entity.x - (b.x + b.width / 2), entity.y - (b.y + b.height / 2)) < 36,
      );
      if (hospital && personDayRoll(entity.id, state.tick, 840) < 0.2) {
        treatPatientAtHospital(state, entity, hospital);
      }
    }

    // Settler petitioning at town hall (free time near hall)
    if (
      allowFreeRoam
      && isPlayerHuman(entity)
      && !entity.isJuvenile
      && wantsCivicAudience(entity, state)
      && staffedTownHalls.length > 0
    ) {
      const hall = staffedTownHalls.find(
        (b) => Math.hypot(entity.x - (b.x + b.width / 2), entity.y - (b.y + b.height / 2)) < 40,
      );
      if (hall && personDayRoll(entity.id, state.tick, 841) < 0.18) {
        resolveCivicPetition(state, entity, hall);
      }
    }

    // Morning greetings when free settlers pass near each other
    if (
      allowFreeRoam
      && isPlayerHuman(entity)
      && !entity.isJuvenile
      && hourOfDay >= 6
      && hourOfDay <= 9
    ) {
      const passer = findClosestEntityInRadius(
        mobileGrid,
        entity.x,
        entity.y,
        30,
        (h) =>
          h.id !== entity.id
          && h.alive
          && isPlayerHuman(h)
          && !h.isJuvenile,
        'social',
        allHumans,
      );
      tryNeighborGreeting(entity, passer, state.tick, hourOfDay);
    }

    // === FREE-TIME / LEISURE — small-world bonds (family, coworkers) ===
    // Affairs/courtship above already set suppressIdle when active — we never override those.
    // Cheating stays intact: secret trysts run first; this is open-village life around them.
    if (!onSchedule && entity.isJuvenile && isPlayerHuman(entity)) {
      // Kids: play with other kids first, then free parent, then home.
      const playmates = allHumans.filter(
        (h) => h.alive && h.isJuvenile && h.id !== entity.id && isPlayerHuman(h),
      );
      const kidImpulse = pickSocialImpulse(entity, state, updatedBuildings, [], playmates);
      if (kidImpulse.motive === 'kid_play' && kidImpulse.company?.alive) {
        const play = kidImpulse.company;
        const pdx = play.x - entity.x;
        const pdy = play.y - entity.y;
        const pdist = Math.hypot(pdx, pdy) || 1;
        if (pdist > 16) {
          entity.vx = (pdx / pdist) * config.speed * 0.7;
          entity.vy = (pdy / pdist) * config.speed * 0.7;
        } else {
          // Circle / tag weave
          entity.vx = Math.sin(state.tick * 0.2 + entity.id) * config.speed * 0.45;
          entity.vy = Math.cos(state.tick * 0.18 + play.id) * config.speed * 0.45;
          if (kidImpulse.bubble && Math.random() < 0.06 * PER_TICK_RATE_SCALE) {
            sayHumanChatPhrase(entity, kidImpulse.bubble, 40);
          }
        }
        entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
        suppressIdle = true;
      } else {
        const mother = entity.motherId != null ? livingHumanAt(entity.motherId) : undefined;
        const father = entity.fatherId != null ? livingHumanAt(entity.fatherId) : undefined;
        const freeParent = [mother, father].find(
          (p) => p?.alive && isPlayerHuman(p) && !prefersHomeTonight(p.id, state.tick, hourOfDay)
            && !isOnWorkShift(state.tick, hourOfDay),
        ) ?? [mother, father].find((p) => p?.alive);
        const follow = freeParent ?? getChildCustodian(entity, allHumans);
        if (follow?.alive && personDayRoll(entity.id, state.tick, 601) > 0.22) {
          const pdx = follow.x - entity.x;
          const pdy = follow.y - entity.y;
          const pdist = Math.hypot(pdx, pdy) || 1;
          if (pdist > 22) {
            entity.vx = (pdx / pdist) * config.speed * 0.55;
            entity.vy = (pdy / pdist) * config.speed * 0.55;
            entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
          } else if (pdist > 8) {
            entity.vx = (pdx / pdist) * config.speed * 0.18;
            entity.vy = (pdy / pdist) * config.speed * 0.18;
          }
          suppressIdle = true;
        } else if (hasResidenceAssignment(entity)) {
          const residence = buildingById.get(entity.residenceBuildingId!);
          if (residence?.completed) {
            commuteHumanToBuilding(entity, residence, config.speed, true);
            suppressIdle = true;
          }
        }
      }
    } else if (allowFreeRoam && !suppressIdle && isPlayerHuman(entity) && !entity.isJuvenile) {
      const tick = state.tick;
      const absDay = getAbsoluteCalendarDay(tick);
      // Legacy slot was 80 ticks (~3.3 days at 24 tpd); scale with day length.
      const leisureSlotPeriod = 80 * TICKS_PER_HOUR;
      const leisureSlot = Math.floor(tick / leisureSlotPeriod + entity.id * 3);
      const daySpice = Math.floor(personDayRoll(entity.id, tick, 401 + leisureSlot) * 12);
      const quietBias = personDayRoll(entity.id, tick, 202) < 0.35;
      let leisureKind = (leisureSlot * 17 + entity.id * 31 + absDay * 13 + daySpice) % 12;
      if (quietBias && personDayRoll(entity.id, tick, 403 + leisureSlot) < 0.45) {
        leisureKind = leisureKind < 6 ? 10 + (leisureKind % 2) : leisureKind;
      }
      if (weekend && personDayRoll(entity.id, tick, 201) > 0.55 && leisureKind >= 8) {
        leisureKind = (entity.id + leisureSlot + absDay) % 7;
      }
      const phase = entity.id * 0x9e3779b9 + leisureSlot * 0x85ebca6b + absDay;
      let idleVx = 0;
      let idleVy = 0;

      const steerTo = (tx: number, ty: number, speedMult: number, arrive = 14): boolean => {
        const dx = tx - entity.x;
        const dy = ty - entity.y;
        const dist = Math.hypot(dx, dy) || 1;
        if (dist <= arrive) {
          idleVx = Math.sin(tick * 0.04 + entity.id) * config.speed * 0.08;
          idleVy = Math.cos(tick * 0.035 + entity.id) * config.speed * 0.08;
          return true;
        }
        idleVx = (dx / dist) * config.speed * speedMult;
        idleVy = (dy / dist) * config.speed * speedMult;
        return false;
      };

      const pickCompleted = (types: BuildingType[]): Building | undefined => {
        const pool = updatedBuildings.filter(
          (b) => b.completed && b.faction !== 'rival' && types.includes(b.type),
        );
        if (pool.length === 0) return undefined;
        return pool[(entity.id + leisureSlot) % pool.length];
      };

      // --- Human motives (sick, grief, weather, Sunday, errands, care…) ---
      // Grid query instead of an O(H) distance filter per free-roaming human.
      const nearbyAdults: Entity[] = [];
      forEachInEntityGrid(
        mobileGrid,
        entity.x,
        entity.y,
        socialScanRadius * 1.5,
        (h) => {
          if (h.alive && isPlayerHuman(h) && !h.isJuvenile) nearbyAdults.push(h);
        },
        'social',
        allHumans,
      );
      // Ensure spouse is considered even if slightly farther
      const spouseEarly = entity.partnerId != null ? livingHumanAt(entity.partnerId) : undefined;
      if (spouseEarly?.alive && !nearbyAdults.some((h) => h.id === spouseEarly.id)) {
        nearbyAdults.push(spouseEarly);
      }
      const impulse = pickSocialImpulse(
        entity,
        state,
        updatedBuildings,
        nearbyAdults,
        [],
      );
      if (impulse.motive !== 'none') {
        if (impulse.bubble && Math.random() < 0.08 * PER_TICK_RATE_SCALE) {
          sayHumanChatPhrase(entity, impulse.bubble, 55);
        }
        if (impulse.stayHome && hasResidenceAssignment(entity)) {
          const home = buildingById.get(entity.residenceBuildingId!);
          if (home?.completed) {
            commuteHumanToBuilding(entity, home, config.speed * (impulse.motive === 'sick_day' ? 0.7 : 0.9), true, 2.2);
            if (impulse.motive === 'sick_day') {
              entity.energy = Math.min(entity.maxEnergy, entity.energy + 0.25 * PER_TICK_RATE_SCALE);
            }
            suppressIdle = true;
          }
        } else if (impulse.company?.alive && impulse.building) {
          const b = impulse.building;
          const cx = b.x + b.width / 2;
          const cy = b.y + b.height * 0.92;
          // Walk with company toward a place of care
          const midX = (impulse.company.x + cx) / 2;
          const midY = (impulse.company.y + cy) / 2;
          const dx = midX - entity.x;
          const dy = midY - entity.y;
          const dist = Math.hypot(dx, dy) || 1;
          if (dist > 16) {
            entity.vx = (dx / dist) * config.speed * 0.48;
            entity.vy = (dy / dist) * config.speed * 0.48;
            entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
          } else {
            settlerPairChat(entity, impulse.company, 'home', 0.1);
          }
          suppressIdle = true;
        } else if (impulse.company?.alive) {
          const c = impulse.company;
          const dx = c.x - entity.x;
          const dy = c.y - entity.y;
          const dist = Math.hypot(dx, dy) || 1;
          if (dist > 16) {
            entity.vx = (dx / dist) * config.speed * 0.5;
            entity.vy = (dy / dist) * config.speed * 0.5;
            entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
          } else if (impulse.motive === 'comfort_neighbor') {
            settlerPairChat(entity, c, 'social', 0.12);
            c.energy = Math.min(c.maxEnergy, c.energy + 0.15 * PER_TICK_RATE_SCALE);
          } else if (impulse.motive === 'care_pregnant') {
            settlerPairChat(entity, c, 'home', 0.12);
          }
          suppressIdle = true;
        } else if (impulse.building) {
          const b = impulse.building;
          const arrived = Math.hypot(
            entity.x - (b.x + b.width / 2),
            entity.y - (b.y + b.height * 0.92),
          ) < 20;
          if (!arrived) {
            commuteHumanToBuilding(entity, b, config.speed * 0.5, false, 2.8);
          } else if (impulse.motive === 'sunday_service' || impulse.motive === 'grief') {
            entity.vx *= 0.2;
            entity.vy *= 0.2;
            if (Math.random() < 0.05 * PER_TICK_RATE_SCALE) settlerChat(entity, 'social', 0.1);
          } else if (impulse.motive === 'market_errand' || impulse.motive === 'birthday') {
            entity.energy = Math.min(entity.maxEnergy, entity.energy + 0.2 * PER_TICK_RATE_SCALE);
            settlerChat(entity, 'social', 0.1);
          }
          suppressIdle = true;
        }
      }

      if (!suppressIdle) {
      // --- Bonds: partner, kids, coworkers (same workplace) ---
      const spouse = spouseEarly ?? (entity.partnerId != null ? livingHumanAt(entity.partnerId) : undefined);
      const kids = (entity.childrenIds ?? [])
        .map((id) => livingHumanAt(id))
        .filter((k): k is Entity => !!k?.alive && !!k.isJuvenile);
      const coworkers = entity.homeBuildingId != null
        ? (workersByWorkplace.get(entity.homeBuildingId) ?? []).filter((h) => h.id !== entity.id)
        : [];
      // Active affair lover is NOT open free-time company — tryst AI owns that.
      const sneaking =
        hasAffairPartner(entity, entityById)
        && canPursueSecretAffair(
          entity,
          hourOfDay,
          workplace,
          updatedBuildings,
          entityById,
          state.tick,
        )
        && !isAtMaritalHome(entity, entityById, buildingById);

      const bondRoll = personDayRoll(entity.id, tick, 510 + leisureSlot);
      let company: Entity | null = null;
      let companyKind: 'partner' | 'kid' | 'coworker' | null = null;
      if (!sneaking) {
        if (spouse?.alive && bondRoll < 0.40) {
          company = spouse;
          companyKind = 'partner';
        } else if (kids.length > 0 && bondRoll < 0.62) {
          company = kids[(entity.id + leisureSlot) % kids.length]!;
          companyKind = 'kid';
        } else if (coworkers.length > 0 && bondRoll < 0.82) {
          company = coworkers[(leisureSlot + entity.id) % coworkers.length]!;
          companyKind = 'coworker';
        }
      }

      // Walk with company — couples, parents with kids, workmates off the clock.
      const hangWithCompany = company != null
        && personDayRoll(entity.id, tick, 520 + leisureSlot) < 0.78;
      if (hangWithCompany && company) {
        const sdx = company.x - entity.x;
        const sdy = company.y - entity.y;
        const sdist = Math.hypot(sdx, sdy) || 1;
        const arrive = companyKind === 'kid' ? 14 : 18;
        if (sdist > arrive) {
          idleVx = (sdx / sdist) * config.speed * 0.48;
          idleVy = (sdy / sdist) * config.speed * 0.48;
        } else if (sdist < 8) {
          idleVx = -(sdx / sdist) * config.speed * 0.1;
          idleVy = -(sdy / sdist) * config.speed * 0.1;
        } else {
          // Drift together toward a shared village spot (tavern is a favorite).
          const shared = (Math.min(entity.id, company.id) * 31 + leisureSlot * 17 + absDay) % 6;
          if (shared <= 1) {
            const tavern = pickCompleted([BuildingType.Tavern]);
            if (tavern) {
              steerTo(tavern.x + tavern.width / 2, tavern.y + tavern.height * 0.92, 0.45, 20);
            } else {
              const shop = pickCompleted([BuildingType.Market, BuildingType.Store]);
              if (shop) steerTo(shop.x + shop.width / 2, shop.y + shop.height * 0.92, 0.42, 20);
              else idleVx = Math.sin(tick * 0.03 + entity.id) * config.speed * 0.1;
            }
          } else if (shared === 2) {
            const shop = pickCompleted([BuildingType.Market, BuildingType.Store]);
            if (shop) steerTo(shop.x + shop.width / 2, shop.y + shop.height * 0.92, 0.42, 20);
            else idleVx = Math.sin(tick * 0.03 + entity.id) * config.speed * 0.1;
          } else if (shared === 3) {
            const well = pickCompleted([BuildingType.Well]);
            if (well) steerTo(well.x + well.width / 2, well.y + well.height / 2, 0.4, 16);
          } else if (shared === 4) {
            const hall = pickCompleted([BuildingType.TownHall]);
            if (hall) {
              steerTo(hall.x + hall.width / 2, hall.y + hall.height + 8, 0.42, 22);
            }
          } else {
            idleVx = Math.sin(tick * 0.025 + entity.id) * config.speed * 0.12;
            idleVy = Math.cos(tick * 0.02 + company.id) * config.speed * 0.12;
          }
          if (companyKind === 'partner') {
            settlerPairChat(entity, company, 'home', 0.08);
          } else if (companyKind === 'kid') {
            settlerChat(entity, 'child', 0.06, company);
          } else if (companyKind === 'coworker') {
            settlerPairChat(entity, company, 'social', 0.07);
          }
        }
        entity.vx = entity.vx * 0.45 + idleVx * 0.55;
        entity.vy = entity.vy * 0.45 + idleVy * 0.55;
        if (idleVx !== 0 || idleVy !== 0) {
          entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
        }
        suppressIdle = true;
      } else if (leisureKind <= 2) {
        // 0–2  Tavern first (beer & banter), else market
        const tavern = pickCompleted([BuildingType.Tavern]);
        if (tavern) {
          const arrived = steerTo(
            tavern.x + tavern.width / 2 + ((entity.id % 5) - 2) * 6,
            tavern.y + tavern.height * 0.92,
            0.5,
            18,
          );
          if (arrived) {
            entity.energy = Math.min(entity.maxEnergy, entity.energy + 0.45 * PER_TICK_RATE_SCALE);
            settlerChat(entity, 'social', 0.14 * PER_TICK_RATE_SCALE);
            if (Math.random() < 0.04 * PER_TICK_RATE_SCALE) {
              addFloatingText(state, entity.x, entity.y - 14, '🍺', '#fbbf24');
            }
          }
        } else {
          const shop = pickCompleted([BuildingType.Market, BuildingType.Store]);
          if (shop) {
            steerTo(shop.x + shop.width / 2, shop.y + shop.height * 0.92, 0.48, 16);
          } else {
            steerTo(width * 0.5, height * 0.55, 0.4);
          }
        }
      } else if (leisureKind === 3) {
        const well = pickCompleted([BuildingType.Well]);
        if (well) {
          const arrived = steerTo(well.x + well.width / 2, well.y + well.height / 2, 0.45, 12);
          if (arrived) {
            entity.energy = Math.min(entity.maxEnergy, entity.energy + 0.35 * PER_TICK_RATE_SCALE);
          }
        } else {
          steerTo(
            (fract(phase * 0.41) * width * 0.5) + width * 0.25,
            (fract(phase * 0.73) * height * 0.5) + height * 0.25,
            0.4,
          );
        }
      } else if (leisureKind === 4) {
        const church = pickCompleted([BuildingType.Church]);
        if (church) {
          steerTo(
            church.x + church.width / 2,
            church.y + church.height * 0.95,
            0.42,
            18,
          );
        } else {
          steerTo(width * 0.45, height * 0.45, 0.38);
        }
      } else if (leisureKind === 5) {
        const hall = pickCompleted([BuildingType.TownHall]);
        if (hall) {
          steerTo(
            hall.x + hall.width / 2 + ((entity.id % 5) - 2) * 8,
            hall.y + hall.height + 6,
            0.44,
            20,
          );
        } else {
          steerTo(width * 0.5, height * 0.5, 0.4);
        }
      } else if (leisureKind === 6) {
        // Visit bond first (partner / coworker / friend), not a random stranger.
        let friend: Entity | null = spouse?.alive ? spouse : null;
        if (!friend && coworkers.length > 0 && personDayRoll(entity.id, tick, 530) < 0.55) {
          friend = coworkers[(entity.id + leisureSlot) % coworkers.length]!;
        }
        if (!friend) {
          friend = findClosestEntityInRadius(
            mobileGrid,
            entity.x,
            entity.y,
            socialScanRadius * 1.4,
            (h) =>
              h.id !== entity.id
              && h.alive
              && isPlayerHuman(h)
              && !h.isJuvenile
              && h.id !== entity.affairPartnerId,
            'social',
            allHumans,
          ) ?? null;
        }
        if (friend) {
          const sdx = friend.x - entity.x;
          const sdy = friend.y - entity.y;
          const sdist = Math.hypot(sdx, sdy) || 1;
          if (sdist > 22) {
            idleVx = (sdx / sdist) * config.speed * 0.42;
            idleVy = (sdy / sdist) * config.speed * 0.42;
          } else if (sdist < 9) {
            idleVx = -(sdx / sdist) * config.speed * 0.12;
            idleVy = -(sdy / sdist) * config.speed * 0.12;
            if (friend.id === entity.partnerId) settlerPairChat(entity, friend, 'home', 0.1);
            else settlerPairChat(entity, friend, 'social', 0.08);
          } else {
            idleVx = Math.sin(tick * 0.03 + entity.id) * config.speed * 0.1;
            idleVy = Math.cos(tick * 0.025 + entity.id) * config.speed * 0.1;
          }
        } else {
          steerTo(
            width * 0.5 + ((entity.id % 5) - 2) * 40,
            height * 0.5 + ((entity.id % 7) - 3) * 30,
            0.4,
          );
        }
      } else if (leisureKind === 7) {
        // Festival / village green
        let gx = width * 0.5;
        let gy = height * 0.5;
        if (state.festival?.active) {
          const hall = pickCompleted([BuildingType.TownHall]);
          if (hall) {
            gx = hall.x + hall.width / 2;
            gy = hall.y + hall.height + 20;
          }
        }
        const performers = state.visitorGroups.find((g) => g.kind === 'performers' && g.daysLeft > 0);
        if (performers) {
          gx = performers.campX;
          gy = performers.campY;
        }
        steerTo(
          gx + ((entity.id % 6) - 2.5) * 12,
          gy + ((entity.id % 5) - 2) * 10,
          0.5,
          22,
        );
      } else if (leisureKind === 8) {
        const tree = findClosestEntityInRadius(
          undefined,
          entity.x,
          entity.y,
          socialScanRadius * 1.2,
          (t) => t.type === EntityType.Tree && t.alive,
          'social',
          byType[EntityType.Tree],
        );
        if (tree) {
          steerTo(tree.x, tree.y + 8, 0.38, 16);
        } else {
          steerTo(
            (fract(phase * 0.27) * width * 0.55) + width * 0.2,
            (fract(phase * 0.53) * height * 0.55) + height * 0.2,
            0.35,
          );
        }
      } else if (leisureKind === 9) {
        // Edge of settlement — watch wildlife / scenery
        const edge = (entity.id + leisureSlot) % 4;
        const tx = edge === 0 ? width * 0.12 : edge === 1 ? width * 0.88 : width * (0.3 + fract(phase) * 0.4);
        const ty = edge === 2 ? height * 0.12 : edge === 3 ? height * 0.88 : height * (0.3 + fract(phase * 1.3) * 0.4);
        steerTo(tx, ty, 0.4, 20);
      } else if (leisureKind === 10) {
        // Long wander between two map landmarks
        const a = fract(phase * 0.6180339887);
        const b = fract(phase * 0.3819660113);
        const targetX = a * width * 0.7 + width * 0.15;
        const targetY = b * height * 0.7 + height * 0.15;
        steerTo(targetX, targetY, 0.46, 18);
      } else {
        // Rest near home porch
        if (hasResidenceAssignment(entity)) {
          const home = buildingById.get(entity.residenceBuildingId!);
          if (home?.completed) {
            steerTo(
              home.x + home.width / 2 + ((entity.id % 5) - 2) * 6,
              home.y + home.height * 0.95,
              0.4,
              12,
            );
          }
        } else {
          steerTo(width * 0.5, height * 0.5, 0.38);
        }
      }

      if (idleVx !== 0 || idleVy !== 0) {
        entity.vx = entity.vx * 0.5 + idleVx * 0.5;
        entity.vy = entity.vy * 0.5 + idleVy * 0.5;
        entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
        suppressIdle = true;
      }
      } // end generic leisure (!suppressIdle after social motive)
    }

    if (!suppressIdle) {
      entity.vx *= 0.9;
      entity.vy *= 0.9;
      if (Math.hypot(entity.vx, entity.vy) < 0.08) {
        entity.vx = 0;
        entity.vy = 0;
      }
    }

    const nearRoad = queryIsNearRoad(
      roadAvoidance,
      entity.x,
      entity.y,
      roadBuildings,
      (x, y, road) => isEntityOnBuilding(x, y, road, 12),
    );
    const roadMult = nearRoad ? 1.5 : 1.0;

    entity.x += entity.vx * roadMult;
    entity.y += entity.vy * roadMult;

    if (entity.x < 0) entity.x = 0;
    if (entity.x > width) entity.x = width;
    if (entity.y < 0) entity.y = 0;
    if (entity.y > height) entity.y = height;

    advanceHumanWalkAnim(entity);

    if (entity.energy <= 0) {
      killHuman(entity, updatedBuildings, entityById, state.tick);
      createDeathParticles(state, entity.x, entity.y, '#8B0000', 8);
      logEvent(state, 'death', formatDeathLog(entity, 'succumbed to exhaustion'), formatCitizenName(entity));
    }
    syncEntityGrids(ctx, entity);
  }
}


// ============ TICK GRASS (once per day) ============
/**
 * Grass growth + spread once per colony day. Trees are static map props — never tick them.
 * Grazers still bite grass mid-day from `tickWildlife` / human hunt paths.
 * When `allAlive` is provided (daily host), new patches are appended so they persist.
 */
export function tickGrassDaily(
  state: WorldState,
  ctx: TickContext,
  allAlive?: Entity[],
): void {
  const { width, height, byType, grassMult, reproMult, newEntities } = ctx;

  if (!ctx.grassPopulation) {
    ctx.grassPopulation = buildGrassPopulationSnapshot(byType, newEntities);
  }
  if (ctx.grassCap === undefined) {
    ctx.grassCap = getGrassPopulationCap(width, height);
  }

  const grassConfig = SPECIES_CONFIG[EntityType.Grass];
  const growth = GRASS_GROWTH_PER_TICK * grassMult * TICKS_PER_DAY;
  // Approximate former per-tick spawn chance over a full day.
  const dailyReproChance = Math.min(
    1,
    1 - Math.pow(1 - grassConfig.reproductionChance, TICKS_PER_DAY),
  );

  const grassList = byType[EntityType.Grass] ?? [];
  for (const grass of grassList) {
    if (!grass.alive) continue;

    grass.age++;
    if (grass.age >= grass.maxAge) {
      markGrassDead(ctx, grass);
      syncEntityGrids(ctx, grass);
      continue;
    }

    grass.energy = Math.min(grass.maxEnergy, grass.energy + growth);
    grass.flash = Math.max(0, (grass.flash ?? 0) - 1);

    const total = grassPopulationTotal(ctx.grassPopulation);
    if (
      total < ctx.grassCap
      && grass.energy >= grassConfig.reproductionEnergyThreshold
      && Math.random() < dailyReproChance * reproMult
    ) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 8 + Math.random() * grassConfig.wanderRadius;
      const nx = Math.min(width, Math.max(0, grass.x + Math.cos(angle) * dist));
      const ny = Math.min(height, Math.max(0, grass.y + Math.sin(angle) * dist));
      const patch = createEntity(
        EntityType.Grass,
        nx,
        ny,
        state.nextEntityId++,
        grassConfig.spawnEnergy,
      );
      pushNewEntity(state, ctx, patch);
      allAlive?.push(patch);
    }

    syncEntityGrids(ctx, grass);
  }
}

// ============ TICK WILDLIFE (systems layer — not every tick) ============
/**
 * Mobile fauna AI. Host should call from systems layer every
 * `WILDLIFE_LAYER_INTERVAL` ticks. Grass is `tickGrassDaily`; trees have no tick.
 */
export function tickWildlife(state: WorldState, ctx: TickContext): void {
  const {
    width, height, reproMult, winterPenalty,
    byType, newEntities, updatedBuildings, roadBuildings, focus, entityById, predators,
    grassGrid, mobileGrid, scentGrid,
  } = ctx;

  /** Energy / cooldowns are per-tick rates; scale to systems cadence. */
  const step = WILDLIFE_LAYER_INTERVAL;

  const roadAvoidance = ctx.roadAvoidance ?? buildRoadAvoidanceIndex(width, height, roadBuildings);
  ctx.roadAvoidance = roadAvoidance;
  if (!ctx.wildlifePopulation) {
    ctx.wildlifePopulation = buildWildlifePopulationSnapshot(
      byType,
      newEntities,
      ctx.wildlifeSpawnParent,
    );
  }
  const wildlifePopulation = ctx.wildlifePopulation;
  // Grass snapshot only for graze death accounting mid-wildlife-pass.
  if (!ctx.grassPopulation) {
    ctx.grassPopulation = buildGrassPopulationSnapshot(byType, newEntities);
  }
  if (ctx.grassCap === undefined) {
    ctx.grassCap = getGrassPopulationCap(width, height);
  }
  const preyFallback = (byType[EntityType.Rabbit] ?? []).concat(byType[EntityType.Deer] ?? []);

  const isNewCalendarDay = isNewCalendarDayTick(state);
  const wildlifeDeathsThisTick = new Set<number>();

  for (const entityType of WILDLIFE_TICK_TYPES) {
    // Iterate a copy — markWildlifeDead splices the bucket while we walk it,
    // which otherwise skips the entity after each in-tick death.
    for (const entity of [...(byType[entityType] ?? [])]) {
      if (!entity.alive) continue;

    // Common updates
    if (isNewCalendarDay) {
      entity.age++;
    }
    entity.flash = Math.max(0, entity.flash - step);
    if (entity.combatTicks && entity.combatTicks > 0) {
      entity.combatTicks = Math.max(0, entity.combatTicks - step);
    }
    if (entity.huntTargetId) {
      const prey = entityById.get(entity.huntTargetId);
      if (!prey?.alive) entity.huntTargetId = undefined;
    }
    entity.animFrame = (entity.animFrame ?? 0) + 0.1 * step;

    // Death by old age
    if (entity.age >= entity.maxAge) {
      markWildlifeDead(ctx, entity, wildlifeDeathsThisTick, state.tick);
      createDeathParticles(state, entity.x, entity.y, '#aaaaaa', 5, 'smoke');
      syncEntityGrids(ctx, entity);
      continue;
    }

    // Grow up
    if (entity.isJuvenile && entity.age >= HUMAN_CHILDHOOD_DAYS) {
      entity.isJuvenile = false;
      entity.size = SPECIES_CONFIG[entity.type].size;
      entity.speed = SPECIES_CONFIG[entity.type].speed;
    }

    const config = SPECIES_CONFIG[entity.type];

    // Energy loss scaled to systems cadence (including off-screen fauna).
    // Grazers run slightly cheaper metabolism so passive play doesn't empty the map by summer.
    const grazerEase =
      entity.type === EntityType.Rabbit || entity.type === EntityType.Deer || entity.type === EntityType.Wildkin
        ? 0.82
        : 1;
    entity.energy -= (config.energyLossPerTick * grazerEase + winterPenalty) * step;

    if (entity.energy <= 0) {
      markWildlifeDead(ctx, entity, wildlifeDeathsThisTick, state.tick);
      createDeathParticles(state, entity.x, entity.y, '#8a2a2a', 8);
      syncEntityGrids(ctx, entity);
      continue;
    }

    const wildlifeInFocus = !focus || isInFocus(entity, focus);
    const wildlifeActive = wildlifeInFocus || (state.tick + entity.id) % OFFSCREEN_WILDLIFE_THROTTLE === 0;
    if (!wildlifeActive) {
      entity.reproductionCooldown = Math.max(0, entity.reproductionCooldown - step);
      syncEntityGrids(ctx, entity);
      continue;
    }

    let targetVx = 0;
    let targetVy = 0;

    // Flee from predators — every systems pulse for all prey (do NOT use tick+id % 2:
    // wildlife only runs on even ticks → odd ids never fled).
    if (entity.type === EntityType.Rabbit || entity.type === EntityType.Deer || entity.type === EntityType.Wildkin) {
      let closestPredator: Entity | null = null;

      closestPredator = findClosestEntityInRadius(
        mobileGrid,
        entity.x,
        entity.y,
        config.fleeRange,
        (pred) => isWildlifePredator(pred),
        'flee',
        predators,
      ) ?? null;

      if (closestPredator) {
        const dx = entity.x - closestPredator.x;
        const dy = entity.y - closestPredator.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        targetVx = (dx / dist) * config.speed * 1.5;
        targetVy = (dy / dist) * config.speed * 1.5;
      } else if (USE_SCENT_GRID && scentGrid) {
        const sensitivity = entity.type === EntityType.Rabbit
          ? RABBIT_SCENT_SENSITIVITY
          : entity.type === EntityType.Deer
            ? DEER_SCENT_SENSITIVITY
            : WILDKIN_SCENT_SENSITIVITY;
        const sample = scentGrid.sampleFleeGradient(entity.x, entity.y, sensitivity);
        if (sample.strength > 0) {
          targetVx = sample.awayX * config.speed * 1.25;
          targetVy = sample.awayY * config.speed * 1.25;
        }
      }
    }

    // Hunt prey — only when hungry (energy below 70% max)
    const isHungry = entity.energy < entity.maxEnergy * 0.7;
    if (isHungry && (entity.type === EntityType.Wolf || entity.type === EntityType.Fox || entity.type === EntityType.Werewolf)) {
      const moonHowlerHunter = entity.type === EntityType.Werewolf && isActiveMoonHowler(entity);
      const preyTypes = entity.type === EntityType.Fox
        ? [EntityType.Rabbit]
        : moonHowlerHunter
          ? [EntityType.Human, EntityType.Deer, EntityType.Rabbit]
          : [EntityType.Deer, EntityType.Rabbit];

      // Pack bonus for wolves: nearby wolves extend hunt range and share kills
      let nearbyPack = 0;
      let huntRange = config.huntRange;
      if (entity.type === EntityType.Wolf) {
        forEachInEntityGrid(
          mobileGrid,
          entity.x,
          entity.y,
          120,
          (other) => {
            if (
              other.type === EntityType.Wolf
              && other.id !== entity.id
              && other.alive
              && !wildlifeDeathsThisTick.has(other.id)
            ) nearbyPack++;
          },
          'wolf_pack',
          byType[EntityType.Wolf],
        );
        huntRange *= 1 + Math.min(3, nearbyPack) * 0.25;
      } else if (moonHowlerHunter) {
        huntRange *= 1.15;
      }

      const huntPick = { prey: null as Entity | null, dist: Infinity };
      const preyTypeSet = new Set<EntityType>(preyTypes);

      const huntPreyFallback = preyTypes.flatMap((type) => byType[type]);
      forEachInEntityGrid(
        mobileGrid,
        entity.x,
        entity.y,
        huntRange,
        (prey, dSq) => {
          if (!preyTypeSet.has(prey.type)) return;
          if (!isValidHuntPrey(prey, prey.type, entity.id)) return;
          const dist = Math.sqrt(dSq);
          const humanBias = prey.type === EntityType.Human ? 0.82 : 1;
          const biased = dist * humanBias;
          if (biased < huntPick.dist) {
            huntPick.dist = biased;
            huntPick.prey = prey;
          }
        },
        'hunt',
        huntPreyFallback,
      );

      if (huntPick.prey) {
        const caughtPrey = huntPick.prey;
        entity.huntTargetId = caughtPrey.id;
        const dx = caughtPrey.x - entity.x;
        const dy = caughtPrey.y - entity.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const packSpeed = entity.type === EntityType.Wolf && nearbyPack > 0 ? 1.2 : 1;
        const wereSpeed = moonHowlerHunter ? 1.25 : 1;
        targetVx = (dx / dist) * config.speed * packSpeed * wereSpeed;
        targetVy = (dy / dist) * config.speed * packSpeed * wereSpeed;

        if (dist < config.size + caughtPrey.size) {
          const isHumanPrey = caughtPrey.type === EntityType.Human;

          if (isHumanPrey && rollCounterAttack(
            state, caughtPrey.id, entity.id, state.tick, caughtPrey.combatRollSeed ?? 0,
          )) {
            const victimId = caughtPrey.id;
            // Full death path — cursed howlers need killHuman via markWildlifeDead
            markWildlifeDead(ctx, entity, wildlifeDeathsThisTick, state.tick);
            syncEntityGrids(ctx, entity);
            clearHuntersTargetingPrey(victimId, entityById, ctx.huntTargetByPreyId);
            // Slaying a Moon Howler earns the defender a title.
            if (entity.type === EntityType.Werewolf && entity.moonHowlerCursed && !caughtPrey.title) {
              caughtPrey.title = 'Moonslayer';
              addFloatingText(state, caughtPrey.x, caughtPrey.y - 28, 'Moonslayer!', '#fbbf24');
              logEvent(state, 'combat', `${humanDisplayName(caughtPrey)} slew the Moon Howler and earned the title Moonslayer`, caughtPrey.name);
            }
            caughtPrey.combatTicks = 18;
            caughtPrey.flash = 12;
            createDeathParticles(state, entity.x, entity.y, '#8a2a2a', 10);
            addFloatingText(state, caughtPrey.x, caughtPrey.y - 14, 'Defended!', '#38bdf8');
            impulseScreenShake(state, 3);
            targetVx = 0;
            targetVy = 0;
          } else if (isHumanPrey && rollPredatorBlock(
            state, caughtPrey.id, state.tick, caughtPrey.combatRollSeed ?? 0,
          )) {
            caughtPrey.combatTicks = 14;
            caughtPrey.flash = 10;
            entity.flash = 6;
            entity.huntTargetId = undefined;
            addFloatingText(state, caughtPrey.x, caughtPrey.y - 14, 'Blocked!', '#38bdf8');
            impulseScreenShake(state, 2);
            targetVx = -(dx / dist) * config.speed * 1.4;
            targetVy = -(dy / dist) * config.speed * 1.4;
          } else {
            const victimId = caughtPrey.id;
            if (isHumanPrey) {
              killHuman(caughtPrey, updatedBuildings, entityById, state.tick);
              const humanBucket = byType[caughtPrey.type];
              if (humanBucket) {
                const hIdx = humanBucket.indexOf(caughtPrey);
                if (hIdx >= 0) humanBucket.splice(hIdx, 1);
              }
            } else {
              markWildlifeDead(ctx, caughtPrey, wildlifeDeathsThisTick, state.tick);
            }
            clearHuntersTargetingPrey(victimId, entityById, ctx.huntTargetByPreyId);
            syncEntityGrids(ctx, caughtPrey);
            entity.huntTargetId = undefined;
            createDeathParticles(state, caughtPrey.x, caughtPrey.y, '#8a2a2a', 10);
            const packEnergyBonus = entity.type === EntityType.Wolf ? 1 + nearbyPack * 0.15 : 1;
            const energyGain = isHumanPrey
              ? 220
              : (config.energyGain[caughtPrey.type] || 50) * packEnergyBonus;
            entity.energy = Math.min(entity.maxEnergy, entity.energy + energyGain);
            entity.flash = 10;
            entity.combatTicks = 14;

            if (isHumanPrey) {
              const wolfName = entity.name ? `${entity.name}${entity.surname ? ` ${entity.surname}` : ''}` : 'A Moon Howler';
              const victimName = caughtPrey.name ? `${caughtPrey.name}${caughtPrey.surname ? ` ${caughtPrey.surname}` : ''}` : 'A settler';
              const line = WEREWOLF_ATTACK_LINES[Math.floor(Math.random() * WEREWOLF_ATTACK_LINES.length)](wolfName, victimName);
              addBigNews(state, '🌝 Moon Howler Attack!', line, 'negative');
              addFloatingText(state, caughtPrey.x, caughtPrey.y - 12, 'Slain!', '#ef4444');
              logEvent(state, 'death', appendDeathAge(line, caughtPrey), victimName);
              impulseScreenShake(state, 5);
            } else {
              const preyLabel = caughtPrey.type === EntityType.Deer ? 'Deer' : 'Rabbit';
              const predatorLabel = entity.type === EntityType.Fox ? 'Fox' : entity.type === EntityType.Wolf ? 'Wolf' : 'Moon Howler';
              addFloatingText(state, caughtPrey.x, caughtPrey.y - 12, `${predatorLabel} caught ${preyLabel}!`, '#a8a29e');
              if (entity.type === EntityType.Werewolf) {
                addFloatingText(state, caughtPrey.x, caughtPrey.y - 24, 'Torn apart!', '#c4b5fd');
              }
            }
          }
        }
      } else {
        entity.huntTargetId = undefined;
      }
    }

    // Systems layer only runs every WILDLIFE_LAYER_INTERVAL ticks — stagger by pulse, not raw tick,
    // so every id can howl. ~2 clock hours between howls for a given entity.
    if (entity.type === EntityType.Werewolf && isActiveMoonHowler(entity)) {
      const pulse = Math.floor(state.tick / WILDLIFE_LAYER_INTERVAL);
      const pulsePeriod = Math.max(1, Math.round((2 * TICKS_PER_HOUR) / WILDLIFE_LAYER_INTERVAL));
      if (pulse % pulsePeriod === entity.id % pulsePeriod) {
        const line = WEREWOLF_HOWL_LINES[Math.floor(Math.random() * WEREWOLF_HOWL_LINES.length)];
        addFloatingText(state, entity.x, entity.y - 18, line, '#c4b5fd');
      }
    }

    // Graze earlier / farther so herds recover before starving out
    const needsFood = entity.energy < entity.maxEnergy * 0.78;
    if (needsFood && (entity.type === EntityType.Rabbit || entity.type === EntityType.Deer || entity.type === EntityType.Wildkin) && targetVx === 0 && targetVy === 0) {
      const grazeRange = 70;
      let closestGrass: Entity | null = null;
      let closestGrassDist = Infinity;

      const grazeHit = findClosestInEntityGrid(
        grassGrid,
        entity.x,
        entity.y,
        grazeRange,
        (grass) => grass.alive && grass.energy >= GRASS_GRAZE_MIN_ENERGY,
        'graze',
        byType[EntityType.Grass],
      );
      if (grazeHit) {
        closestGrass = grazeHit.entity;
        closestGrassDist = Math.sqrt(grazeHit.distSq);
      }

      if (closestGrass) {
        const dx = closestGrass.x - entity.x;
        const dy = closestGrass.y - entity.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        targetVx = (dx / dist) * config.speed * 0.6;
        targetVy = (dy / dist) * config.speed * 0.6;

        if (closestGrassDist < config.size + closestGrass.size) {
          const bite = Math.min(closestGrass.energy, GRAZE_BITE_ENERGY);
          closestGrass.energy -= bite;
          entity.energy = Math.min(entity.maxEnergy, entity.energy + config.energyGain['grass']);
          if (closestGrass.energy <= 0) {
            markGrassDead(ctx, closestGrass);
            syncEntityGrids(ctx, closestGrass);
          }
        }
      }
    }

    // Wander — systems layer runs every WILDLIFE_LAYER_INTERVAL ticks; scale chance so
    // daily wander attempts stay ~like a per-tick 5% rate at 24 TPD.
    if (targetVx === 0 && targetVy === 0) {
      if (Math.random() < 1 - (1 - 0.05) ** step) {
        const angle = Math.random() * Math.PI * 2;
        entity.vx = Math.cos(angle) * config.speed * 0.4;
        entity.vy = Math.sin(angle) * config.speed * 0.4;
      }
      targetVx = entity.vx;
      targetVy = entity.vy;
    }

    entity.vx = targetVx;
    entity.vy = targetVy;
    if (entity.vx !== 0 || entity.vy !== 0) {
      entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
    }

    // Road avoidance
    queryRoadAvoidance(roadAvoidance, entity);

    // Tamed animals follow their owner (velocity only — unified movement below)
    if (entity.tamedBy) {
      const owner = entityById.get(entity.tamedBy);
      if (owner?.alive) {
        const dx = owner.x - entity.x;
        const dy = owner.y - entity.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        if (dist > 35) {
          entity.vx = (dx / dist) * config.speed * 0.6;
          entity.vy = (dy / dist) * config.speed * 0.6;
          entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
        }
      }
    }

    // Wildlife wade shallow water but stop at rivers and deep water — slide
    // along the bank by cancelling the blocked axis instead of wading across.
    const worldMap = state.worldMap;
    if (worldMap) {
      const nextX = entity.x + entity.vx;
      const nextY = entity.y + entity.vy;
      const tileAt = (px: number, py: number): TerrainType | undefined =>
        worldMap.tiles[Math.floor(py / TERRAIN_TILE_SIZE)]?.[Math.floor(px / TERRAIN_TILE_SIZE)]?.type;
      const deep = (t: TerrainType | undefined) => t === TerrainType.River || t === TerrainType.DeepWater;
      if (deep(tileAt(nextX, nextY))) {
        const xBlocked = deep(tileAt(nextX, entity.y));
        const yBlocked = deep(tileAt(entity.x, nextY));
        if (xBlocked && !yBlocked) entity.vx = 0;
        else if (yBlocked && !xBlocked) entity.vy = 0;
        else { entity.vx = 0; entity.vy = 0; }
      }
    }

    entity.x += entity.vx;
    entity.y += entity.vy;

    // Tamed predators assist owner by hunting nearby prey
    if (entity.tamedBy) {
      const owner = entityById.get(entity.tamedBy);
      if (owner?.alive) {
        const dist = Math.hypot(owner.x - entity.x, owner.y - entity.y);
        if (
          (entity.type === EntityType.Wolf || entity.type === EntityType.Fox
            || (entity.type === EntityType.Werewolf && !isActiveMoonHowler(entity)))
          && dist < 80
          && isProductionTick(state.tick, EVENT_INTERVAL.tamedHuntAssist)
        ) {
          const assistPrey = findClosestEntityInRadius(
            mobileGrid,
            entity.x,
            entity.y,
            config.huntRange,
            (p) =>
              (p.type === EntityType.Rabbit || p.type === EntityType.Deer)
              && isValidHuntPrey(p, p.type, entity.id),
            'tamed_hunt',
            preyFallback,
          );
          if (assistPrey?.alive) {
            const preyId = assistPrey.id;
            markWildlifeDead(ctx, assistPrey, wildlifeDeathsThisTick, state.tick);
            clearHuntersTargetingPrey(preyId, entityById, ctx.huntTargetByPreyId);
            syncEntityGrids(ctx, assistPrey);
            createDeathParticles(state, assistPrey.x, assistPrey.y, '#8a2a2a', 6);
            entity.energy = Math.min(entity.maxEnergy, entity.energy + (config.energyGain[assistPrey.type] || 50) * 0.5);
            entity.flash = 6;
            const huntMsg = entity.type === EntityType.Werewolf ? 'Snack run!' : 'Hunted!';
            addFloatingText(state, assistPrey.x, assistPrey.y - 10, huntMsg, '#a8a29e');
          }
        }
      }
    }

    if (entity.x < 0) entity.x = 0;
    if (entity.x > width) entity.x = width;
    if (entity.y < 0) entity.y = 0;
    if (entity.y > height) entity.y = height;

    // Reproduction — cursed humans in werewolf form must not spawn wildlife offspring
    entity.reproductionCooldown = Math.max(0, entity.reproductionCooldown - step);

    if (entity.type !== EntityType.Werewolf) {
    const sameTypeCount = wildlifeTypePopulation(wildlifePopulation, entity.type, entity.id);
    const maxPop = entity.type === EntityType.Rabbit ? 120 : entity.type === EntityType.Deer ? 60 : entity.type === EntityType.Wolf ? 25 : 35;
    const capacityFactor = Math.max(0, 1 - (sameTypeCount / maxPop));
    // Bounce back when scarce (passive valleys were going empty by ~half year)
    const scarcityBoost = sameTypeCount < maxPop * 0.25 ? 1.55 : sameTypeCount < maxPop * 0.45 ? 1.25 : 1;

    if (entity.reproductionCooldown <= 0 && entity.energy > config.reproductionEnergyThreshold && Math.random() < config.reproductionChance * reproMult * capacityFactor * scarcityBoost) {
      const mate = findClosestEntityInRadius(
        mobileGrid,
        entity.x,
        entity.y,
        80,
        (m) =>
          m.type === entity.type
          && m.id !== entity.id
          && m.energy > config.reproductionEnergyThreshold * 0.3,
        'mate',
        byType[entity.type],
      );
      if (mate) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 15;
        const nx = Math.min(width, Math.max(0, entity.x + Math.cos(angle) * dist));
        const ny = Math.min(height, Math.max(0, entity.y + Math.sin(angle) * dist));
        const offspring = createEntity(entity.type, nx, ny, state.nextEntityId++, config.spawnEnergy);
        if (!ctx.wildlifeSpawnParent) ctx.wildlifeSpawnParent = new Map();
        ctx.wildlifeSpawnParent.set(offspring.id, entity.id);
        pushNewEntity(state, ctx, offspring);
        entity.energy -= entity.maxEnergy * 0.2;
        entity.reproductionCooldown = config.reproductionCooldown;
      }
    }
    }
    syncEntityGrids(ctx, entity);
    }
  }
}
