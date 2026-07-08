import type { WorldState, Entity, Building, SimulationFocus } from './gameEngine';
import { EntityType, BuildingType, JobType, Season, WeatherType, TerrainType, WEREWOLF_ATTACK_LINES, WEREWOLF_HOWL_LINES, BUILDING_CONFIGS } from './gameTypes';
import { isBarracksGuard } from './defenseStructures';
import {
  addBigNews,
  addFloatingText,
  addNotification,
  createDeathParticles,
  impulseScreenShake,
  SPECIES_CONFIG,
  hasTech,
  getChurchStrength,
  findHumanWorkplace,
  countWorkersAtBuilding,
  OFFSCREEN_HUMAN_THROTTLE,
  OFFSCREEN_WILDLIFE_THROTTLE,
  OFFSCREEN_GRASS_THROTTLE,
  isInFocus,
} from './gameEngine';
import { addResource } from './economy';
import { GRAZE_BITE_ENERGY, GRASS_GRAZE_MIN_ENERGY, GRASS_GROWTH_PER_TICK } from './grassEcology';
import { isPlayerHuman } from './groupEvents';
import { isSettlerRelationshipEntity } from './moonHowler';
import { getElectionGatherTarget } from './villageLeadership';
import {
  HUMAN_ADULT_MIN_AGE,
  HUMAN_ADULT_MAX_AGE,
  tryGraduateHumanChild,
  HUMAN_CHILDHOOD_DAYS,
  HUMAN_MAX_LIFESPAN_YEARS,
  getColonyDay,
  setHumanBirthFromAge,
  syncHumanAgeFromCalendar,
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
  isProductionTick,
  getFemaleFertility,
  getOldAgeDeathChance,
  EVENT_INTERVAL,
} from './dayCycle';
import {
  chatHintsFromWorld,
  maybeDialogueChat,
  maybeHousemateChat,
  tickHumanChat,
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
import { createEntity } from './worldGen';
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
} from './tickQueries';
import type { ScentGrid } from './scentGrid';
import {
  USE_SCENT_GRID,
  RABBIT_SCENT_SENSITIVITY,
  DEER_SCENT_SENSITIVITY,
  WILDKIN_SCENT_SENSITIVITY,
} from './scentGrid';

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
  newEntities: Entity[];
  updatedBuildings: Building[];
  roadBuildings: Building[];
  playerHumans: Entity[];
  entityById: Map<number, Entity>;
  buildingById: Map<number, Building>;
  predators: Entity[];
  grassGrid?: EntitySpatialGrid;
  mobileGrid?: EntitySpatialGrid;
  treeGrid?: EntitySpatialGrid;
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

const WILDLIFE_TICK_TYPES: EntityType[] = [
  EntityType.Grass,
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
  syncSpatialGridEntity(entity, ctx.grassGrid, ctx.mobileGrid, ctx.treeGrid);
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
  wildlifeDeathsThisTick: Set<number>,
): void {
  if (isKillableSettlerEntity(entity)) {
    killHuman(entity, ctx.updatedBuildings, ctx.entityById);
  } else {
    entity.alive = false;
    ctx.entityById.delete(entity.id);
    wildlifeDeathsThisTick.add(entity.id);
  }
}

function syncEntityGrids(ctx: TickContext, entity: Entity): void {
  syncSpatialGridEntity(entity, ctx.grassGrid, ctx.mobileGrid, ctx.treeGrid);
}

const UNPASSABLE_GRASS_TERRAIN = new Set<TerrainType>([
  TerrainType.DeepWater,
  TerrainType.ShallowWater,
  TerrainType.River,
  TerrainType.RiverBank,
  TerrainType.Mountains,
  TerrainType.Snow,
]);

function isValidGrassTerrain(state: WorldState, x: number, y: number): boolean {
  if (!state.worldMap) return true;
  const tx = Math.floor(x / 10);
  const ty = Math.floor(y / 10);
  const tile = state.worldMap.tiles[ty]?.[tx];
  if (!tile) return false;
  return !UNPASSABLE_GRASS_TERRAIN.has(tile.type);
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
  if (preyType === EntityType.Human) {
    if (prey.moonHowlerCursed) return false;
    if (prey.faction === 'visitor' || prey.faction === 'rival') return false;
  }
  return true;
}

// ============ HUMAN RELATIONSHIP HELPERS ============
function humanDisplayName(entity: Entity): string {
  return entity.name ? `${entity.name}${entity.surname ? ` ${entity.surname}` : ''}` : 'A settler';
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

  const spouseWork = findHumanWorkplace(spouse, buildings);
  if (!spouseWork) return true;
  if (workplace && spouseWork.id !== workplace.id) return true;
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
  const workplace = findHumanWorkplace(entity, buildings);
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
        && isNearResidence(entity, ctx.updatedBuildings)
        && isNearResidence(partner, ctx.updatedBuildings);
      const together = dist < 22 || bothAtSharedHome;
      const fertility = getFemaleFertility(entity.age);
      if (together && fertility > 0) {
        const baseChance = bothAtSharedHome
          ? HUMAN_DAILY_PREGNANCY_CHANCE_HOME
          : HUMAN_DAILY_PREGNANCY_CHANCE_NEAR;
        if (Math.random() < baseChance * fertility) {
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
    killHuman(entity, buildings, entityById);
    createDeathParticles(state, entity.x, entity.y, '#aaaaaa', 5, 'smoke');
    const cause = entity.age >= HUMAN_MAX_LIFESPAN_YEARS ? 'old age' : 'an age-related illness';
    logEvent(state, 'death', formatDeathLog(entity, `died of ${cause}`), formatCitizenName(entity));
    return true;
  }
  if (entity.age >= HUMAN_ADULT_MIN_AGE && Math.random() < HUMAN_DAILY_ILLNESS_CHANCE) {
    killHuman(entity, buildings, entityById);
    createDeathParticles(state, entity.x, entity.y, '#aaaaaa', 5, 'smoke');
    logEvent(state, 'death', formatDeathLog(entity, 'died of a sudden illness'), formatCitizenName(entity));
    return true;
  }
  return false;
}

/** Either spouse may divorce after catching the other cheating — chance applies to gossip only. */
const DIVORCE_ON_CAUGHT_CHANCE = 0.55;
/** Game-days before the same settler can headline another scandal. */
const SCANDAL_COOLDOWN_TICKS = TICKS_PER_DAY * 21;

function onScandalCooldown(entity: Entity, tick: number): boolean {
  return entity.scandalCooldownUntilTick != null && tick < entity.scandalCooldownUntilTick;
}

function setScandalCooldown(entity: Entity, tick: number): void {
  entity.scandalCooldownUntilTick = tick + SCANDAL_COOLDOWN_TICKS;
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

  const residences = buildings.filter(isResidenceBuilding);
  const villagers = playerHumans.filter(isPlayerHuman);
  const formerSharedHomes = new Set<number>();
  for (const resident of [spouse, cheater]) {
    if (resident.residenceBuildingId != null) {
      formerSharedHomes.add(resident.residenceBuildingId);
      const oldHome = buildings.find((b) => b.id === resident.residenceBuildingId);
      if (oldHome) {
        oldHome.occupants = oldHome.occupants.filter((id) => id !== resident.id);
      }
    }
  }
  if (residences.length === 0) {
    spouse.residenceBuildingId = undefined;
    if (cheater.prisonBuildingId == null) cheater.residenceBuildingId = undefined;
  } else {
    spouse.residenceBuildingId = pickResidenceForHuman(spouse, villagers, residences);
    if (cheater.prisonBuildingId == null) {
      const excludeHomes = new Set(formerSharedHomes);
      if (spouse.residenceBuildingId != null) excludeHomes.add(spouse.residenceBuildingId);
      cheater.residenceBuildingId = pickResidenceForHumanExcluding(
        cheater,
        villagers,
        residences,
        excludeHomes,
      );
    } else {
      cheater.residenceBuildingId = undefined;
    }
    syncResidenceOccupants(villagers, buildings);
  }

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
      const formerParamourHomes = new Set<number>();
      for (const resident of [paramourSpouse, paramour]) {
        if (resident.residenceBuildingId != null) {
          formerParamourHomes.add(resident.residenceBuildingId);
          const oldHome = buildings.find((b) => b.id === resident.residenceBuildingId);
          if (oldHome) {
            oldHome.occupants = oldHome.occupants.filter((id) => id !== resident.id);
          }
        }
      }
      if (residences.length === 0) {
        paramourSpouse.residenceBuildingId = undefined;
        if (paramour.prisonBuildingId == null) paramour.residenceBuildingId = undefined;
      } else {
        paramourSpouse.residenceBuildingId = pickResidenceForHuman(paramourSpouse, villagers, residences);
        if (paramour.prisonBuildingId == null) {
          const excludeHomes = new Set(formerParamourHomes);
          if (paramourSpouse.residenceBuildingId != null) excludeHomes.add(paramourSpouse.residenceBuildingId);
          paramour.residenceBuildingId = pickResidenceForHumanExcluding(
            paramour,
            villagers,
            residences,
            excludeHomes,
          );
        } else {
          paramour.residenceBuildingId = undefined;
        }
        syncResidenceOccupants(villagers, buildings);
      }
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
  const sentenceTicks = 60 + Math.floor(Math.random() * 80); // ~2.5–6 days
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
  const distRush = Math.min(10, 1 + dist / 50);
  const moveSpeed = speed * rush * distRush;
  if (dist > 22) {
    entity.vx = (dx / dist) * moveSpeed * 0.58;
    entity.vy = (dy / dist) * moveSpeed * 0.58;
    entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
    return false;
  }
  if (dist <= 8) {
    entity.vx = 0;
    entity.vy = 0;
    return true;
  }
  entity.vx = (dx / dist) * moveSpeed * (arrivingHome ? 0.1 : 0.14);
  entity.vy = (dy / dist) * moveSpeed * (arrivingHome ? 0.1 : 0.14);
  entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
  return false;
}

function isCourtshipCandidate(entity: Entity, candidate: Entity): boolean {
  return (
    isPlayerHuman(candidate)
    && !!candidate.gender
    && candidate.gender !== entity.gender
    && candidate.alive
    && candidate.id !== entity.id
    && candidate.age >= HUMAN_ADULT_MIN_AGE
    && candidate.age < HUMAN_ADULT_MAX_AGE
    && candidate.relationshipStatus === 'single'
  );
}

/** Nearest eligible single — spatial query plus cohabiting housemates when at home. */
function findCourtshipPartner(
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
export function tickHumans(state: WorldState, ctx: TickContext): void {
  const {
    width, height, hourOfDay, season, canHeat,
    byType, newEntities, updatedBuildings, roadBuildings, playerHumans, focus,
    entityById, buildingById, mobileGrid, treeGrid,
  } = ctx;

  const config = SPECIES_CONFIG[EntityType.Human];
  const isWinter = season === Season.Winter;

  const goHomeTime = shouldBeAtHome(hourOfDay);
  const goWorkTime = isWorkHour(hourOfDay);
  const isNewCalendarDay = isNewCalendarDayTick(state);
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

  for (const entity of allHumans) {
    if (!entity.alive) continue;
    reconcileAffairPartner(entity, entityById);

    // Common updates
    if (isNewCalendarDay) {
      if (entity.isJuvenile && isPlayerHuman(entity)) {
        creditChildSchoolDay(entity);
      }
      const schoolMult = entity.isJuvenile && isPlayerHuman(entity)
        ? getSchoolAgeMultiplier(entity, updatedBuildings)
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
    const atHome = shouldBeAtHome(hourOfDay) && isNearResidence(entity, updatedBuildings);

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
      ? findSchoolForChild(entity, updatedBuildings)
      : undefined;
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

    if (!active) {
      let minimalEnergyLoss = hasWell ? config.energyLossPerTick * 0.8 : config.energyLossPerTick;
      if (hasHospital) minimalEnergyLoss *= 0.9;
      if (isWinter && !canHeat) minimalEnergyLoss *= 1.5;
      entity.energy -= minimalEnergyLoss;
      if (isMealWindow(hourOfDay) && state.resources.food >= 1 && entity.energy < entity.maxEnergy * 0.9) {
        state.resources.food -= 1;
        entity.energy = Math.min(entity.maxEnergy, entity.energy + 65);
      }
      if (entity.energy <= 0) {
        killHuman(entity, updatedBuildings, entityById);
        createDeathParticles(state, entity.x, entity.y, '#8B0000', 8);
        logEvent(state, 'death', formatDeathLog(entity, 'succumbed to exhaustion'), formatCitizenName(entity));
      }
      syncEntityGrids(ctx, entity);
      continue;
    }

    tickHumanChat(entity, resolveChatPartner);

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

    // Visitors & rival settlers — camp wandering / raid march, no village job systems
    if (entity.faction === 'visitor' || entity.faction === 'rival') {
      const camp = entity.faction === 'visitor'
        ? state.visitorGroups.find((g) => g.id === entity.groupId)
        : state.rivalSettlements.find((r) => r.id === entity.groupId);
      if (camp) {
        const marching = entity.faction === 'rival' && entity.groupId && isRaidMarchingForRival(state, entity.groupId);
        const playerCenter = marching ? getPlayerCampCenter(state, updatedBuildings) : null;
        const cx = marching && playerCenter ? playerCenter.x : ('campX' in camp ? camp.campX : 0);
        const cy = marching && playerCenter ? playerCenter.y : ('campY' in camp ? camp.campY : 0);
        let speedMult = 0.4;
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
        settlerChat(entity, entity.faction === 'visitor' ? 'visitor' : 'rival', 0.025);
      }
      syncEntityGrids(ctx, entity);
      continue;
    }

    let energyLoss = hasWell ? config.energyLossPerTick * 0.8 : config.energyLossPerTick;
    if (isWinter && !canHeat) {
      energyLoss *= 1.5;
      if (hourOfDay === 8 && state.tick % TICKS_PER_DAY === 8) entity.flash = 5;
    }

    if (goHomeTime && hasResidenceAssignment(entity)) {
      const residence = buildingById.get(entity.residenceBuildingId!);
      if (residence?.completed) {
        const hdx = residence.x + residence.width / 2 - entity.x;
        const hdy = residence.y + residence.height / 2 - entity.y;
        if (Math.hypot(hdx, hdy) < 14) energyLoss *= 0.5;
      }
    }
    
    // Hospital reduces energy loss
    if (hasHospital) energyLoss *= 0.9;
    
    entity.energy -= energyLoss;

    let ateMeal = false;

    // Meals twice per day (8–10am & 6–8pm) — 1 food restores ~65 energy
    if (isMealWindow(hourOfDay) && state.resources.food >= 1 && entity.energy < entity.maxEnergy * 0.9) {
      state.resources.food -= 1;
      entity.energy = Math.min(entity.maxEnergy, entity.energy + 65);
      ateMeal = true;
    }

    let suppressIdle = false;
    let onSchedule = false;
    const workplace = findHumanWorkplace(entity, updatedBuildings);
    const allowFreeRoam = !goHomeTime && !(goWorkTime && workplace);
    const socialTime = allowSocialLife(hourOfDay, workplace != null);

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
    if (huntingWere) {
      const fdx = entity.x - huntingWere.x;
      const fdy = entity.y - huntingWere.y;
      const fdist = Math.sqrt(fdx * fdx + fdy * fdy) || 1;
      const fleeMult = getHumanFleeSpeedMultiplier(state);
      entity.vx = (fdx / fdist) * config.speed * 1.6 * fleeMult;
      entity.vy = (fdy / fdist) * config.speed * 1.6 * fleeMult;
      entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
      suppressIdle = true;
      onSchedule = true;
      settlerChat(entity, 'fear', 0.12);
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

    // Long commutes: snap at shift change so workers aren't stuck walking all day
    if (!huntingWere && !inElectionCeremony && hourOfDay === WORK_START && workplace && hasWorkAssignment(entity)) {
      if (commuteDistanceToBuilding(entity, workplace, false) > COMMUTE_SNAP_DISTANCE) {
        snapHumanToBuilding(entity, workplace, false);
      }
    } else if (!huntingWere && !inElectionCeremony && hourOfDay === EVENING_START && hasResidenceAssignment(entity)) {
      const eveningHome = buildingById.get(entity.residenceBuildingId!);
      if (
        eveningHome?.completed
        && commuteDistanceToBuilding(entity, eveningHome, true) > COMMUTE_SNAP_DISTANCE
      ) {
        snapHumanToBuilding(entity, eveningHome, true);
      }
    }

    // Day/night schedule — home at night, workplace during work hours
    if (!huntingWere && !inElectionCeremony && goHomeTime && hasResidenceAssignment(entity)) {
      const residence = buildingById.get(entity.residenceBuildingId!);
      if (residence?.completed) {
        const arrived = commuteHumanToBuilding(entity, residence, config.speed, true, 2.5);
        onSchedule = true;
        suppressIdle = true;
        if (arrived) {
          const housemates = getHousemates(entity, residenceOccupants);
          const eveningPorch = hourOfDay >= EVENING_START && hourOfDay <= 22;
          maybeHousemateChat(
            entity,
            housemates,
            state.tick,
            eveningPorch ? 0.18 : 0.1,
            95,
            chatHints,
          );
          if (housemates.length === 0) {
            const soloHomeContext: HumanChatContext = chatHints.foodLow
              ? 'food'
              : entity.isJuvenile
                ? 'child'
                : eveningPorch
                  ? 'home'
                  : 'sleep';
            settlerChat(entity, soloHomeContext, 0.08);
          }
        }
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
        const angle = state.tick * 0.028 + entity.id * 2.1;
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
        if (pdist < 18) {
          settlerChat(entity, 'guard', 0.03);
        }
      } else if (workplace) {
        const arrived = commuteHumanToBuilding(
          entity,
          workplace,
          config.speed,
          workplace.completed && isResidenceBuilding(workplace),
          3.5,
        );
        onSchedule = true;
        suppressIdle = true;
        if (arrived) {
          settlerChat(entity, 'work', 0.07);
        }
      }
    } else if (!huntingWere && !inElectionCeremony && goWorkTime && schoolTarget) {
      const arrived = commuteHumanToBuilding(entity, schoolTarget, config.speed, false, 3.2);
      onSchedule = true;
      suppressIdle = true;
      recordChildSchoolTick(entity, schoolTarget, hourOfDay);
      if (arrived) {
        settlerChat(entity, 'school', 0.08);
      }
    } else if (!huntingWere && !inElectionCeremony && goWorkTime && workplace) {
      const arrived = commuteHumanToBuilding(
        entity,
        workplace,
        config.speed,
        workplace.completed && isResidenceBuilding(workplace),
        3.5,
      );
      onSchedule = true;
      suppressIdle = true;
      if (arrived) {
        settlerChat(entity, 'work', 0.07);
      }
    }

    if (!allowFreeRoam && onSchedule && !huntingWere) {
      entity.vx *= 0.85;
      entity.vy *= 0.85;
    }

    if (allowFreeRoam && !ateMeal && !entity.isJuvenile && entity.energy < entity.maxEnergy * 0.8) {
      const preyTypes = new Set<EntityType>([EntityType.Deer, EntityType.Rabbit]);
      const huntRange = getHumanHuntRange(state, config.huntRange);
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
        (prey) => preyTypes.has(prey.type) && prey.alive && !prey.tamedBy,
        'hunt',
        preyFallback,
      );
      if (huntHit) {
        closestPrey = huntHit.entity;
        closestDist = Math.sqrt(huntHit.distSq);
      }

      if (closestPrey?.alive && closestDist < config.size + closestPrey.size) {
        const preyId = closestPrey.id;
        closestPrey.alive = false;
        entityById.delete(preyId);
        clearHuntersTargetingPrey(preyId, entityById, ctx.huntTargetByPreyId);
        createDeathParticles(state, closestPrey.x, closestPrey.y, '#8a2a2a', 10);
        syncEntityGrids(ctx, closestPrey);
        entity.energy = Math.min(entity.maxEnergy, entity.energy + config.energyGain[closestPrey.type]);
        entity.flash = 10;
        entity.combatTicks = 16;
        entity.huntTargetId = undefined;
        const foodGain = Math.round(38 * getHuntFoodMultiplier(state));
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
        entity.vx = (dx / dist) * config.speed * 0.55;
        entity.vy = (dy / dist) * config.speed * 0.55;
        entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
        suppressIdle = true;
        settlerChat(entity, 'hunt', 0.05);
      } else {
        entity.huntTargetId = undefined;
      }
    } else if (!allowFreeRoam || ateMeal || entity.energy >= entity.maxEnergy * 0.8) {
      entity.huntTargetId = undefined;
    }

    if (
      isPlayerHuman(entity)
      && entity.gender === 'female'
      && entity.pregnant
      && !conceivedToday
      && entity.pregnancyProgress !== undefined
    ) {
      settlerChat(entity, 'pregnant', 0.008);
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

        entity.energy -= 50;
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
          const child = createEntity(EntityType.Human, nx, ny, state.nextEntityId++, 80, true, {
            gender: childGender,
            fatherId: biologicalFatherId,
            motherId: entity.id,
            generation: babyGen,
            surname: babySurname,
            isBastard,
            spriteVariant: entity.spriteVariant ?? pickHumanVariant(entity.id, childGender),
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
      if (entity.energy <= 0) {
        killHuman(entity, updatedBuildings, entityById);
        createDeathParticles(state, entity.x, entity.y, '#8B0000', 8);
        logEvent(state, 'death', formatDeathLog(entity, 'died in childbirth'), formatCitizenName(entity));
      }
      syncEntityGrids(ctx, entity);
      continue;
    }

    // Evening social — singles head to the village green to meet others
    if (
      socialTime
      && isPlayerHuman(entity)
      && entity.relationshipStatus === 'single'
      && !entity.isJuvenile
      && hourOfDay >= EVENING_START
      && hourOfDay <= 22
      && !suppressIdle
    ) {
      const nearbySingle = findClosestEntityInRadius(
        mobileGrid,
        entity.x,
        entity.y,
        90,
        (h) =>
          isPlayerHuman(h)
          && h.id !== entity.id
          && !!h.gender
          && h.gender !== entity.gender
          && h.relationshipStatus === 'single',
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
      } else {
        settlerChat(
          entity,
          entity.isJuvenile
            ? 'child'
            : chatHints.foodLow
              ? 'food'
              : state.festival?.active
                ? 'festival'
                : 'social',
          0.12,
        );
      }
    }

    // Courtship — evenings at home, social hour, or daytime when off work
    if (
      socialTime
      && isPlayerHuman(entity)
      && entity.gender
      && entity.relationshipStatus === 'single'
      && entity.age >= HUMAN_ADULT_MIN_AGE
      && entity.age < HUMAN_ADULT_MAX_AGE
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
            if (Math.random() < 0.4) {
              settlerPairChat(entity, closest, 'courtship', 0.85);
            } else {
              settlerPairChat(entity, closest, 'courtship', 0.1);
            }
            const hasPerformers = state.visitorGroups.some((g) => g.kind === 'performers' && g.daysLeft > 0);
            const courtRate = (4 + churchStrength * 2) * (state.festival?.active ? 2 : 1) * (hasPerformers ? 1.35 : 1) * (livingTogether ? 1.5 : 1);
            entity.courtshipProgress = Math.min(100, (entity.courtshipProgress || 0) + courtRate);
            closest.courtshipProgress = Math.min(100, (closest.courtshipProgress || 0) + courtRate);

            if (Math.random() < 0.08) {
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
              && entity.courtshipProgress >= 100
              && closest.courtshipProgress >= 100
              && entity.relationshipStatus === 'single'
              && closest.relationshipStatus === 'single'
              && !entity.partnerId
              && !closest.partnerId
            ) {
              entity.relationshipStatus = 'married';
              entity.partnerId = closest.id;
              entity.courtshipProgress = 0;
              closest.relationshipStatus = 'married';
              closest.partnerId = entity.id;
              closest.courtshipProgress = 0;
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
              entity.chatPhrase = 'Yes!';
              entity.chatTicks = 120;
              closest.chatPhrase = 'Yes!';
              closest.chatTicks = 120;
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
              const affairRate = (churchStrength > 0 ? 4 : 6) * (state.festival?.active ? 1.4 : 1) * churchPenalty;
              entity.affairProgress = Math.min(100, (entity.affairProgress || 0) + affairRate);
              paramour.affairProgress = Math.min(100, (paramour.affairProgress || 0) + affairRate);

              if (Math.random() < 0.06) {
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

    // === IDLE BEHAVIOR SYSTEM ===
    if (!onSchedule && entity.isJuvenile) {
      if (hasResidenceAssignment(entity)) {
        const residence = buildingById.get(entity.residenceBuildingId!);
        if (residence?.completed) {
          commuteHumanToBuilding(entity, residence, config.speed, true);
          suppressIdle = true;
        }
      } else {
        const livingHumans = allLivingHumans(state, newEntities, entityById);
        const custodian = getChildCustodian(entity, livingHumans);
        if (custodian) {
          const pdx = custodian.x - entity.x;
          const pdy = custodian.y - entity.y;
          const pdist = Math.hypot(pdx, pdy) || 1;
          if (pdist > 25) {
            entity.vx = (pdx / pdist) * config.speed * 0.5;
            entity.vy = (pdy / pdist) * config.speed * 0.5;
            entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
          } else if (pdist > 10) {
            entity.vx = (pdx / pdist) * config.speed * 0.15;
            entity.vy = (pdy / pdist) * config.speed * 0.15;
          }
          suppressIdle = true;
        }
      }
    } else if (allowFreeRoam && !suppressIdle && !workplace) {
      const tick = state.tick;
      const idleRoll = Math.floor(tick / 150 + entity.id) % 8;
      const wanderPhase = entity.id * 0x9e3779b9 + Math.floor(tick / 1200) * 0x85ebca6b;
      let idleVx = 0;
      let idleVy = 0;

      if (idleRoll < 2) {
        const targetX = (fract(wanderPhase * 0.6180339887) * (width * 0.6)) + width * 0.2;
        const targetY = (fract(wanderPhase * 0.3819660113) * (height * 0.6)) + height * 0.2;
        const edx = targetX - entity.x, edy = targetY - entity.y;
        const edist = Math.sqrt(edx * edx + edy * edy) || 1;
        idleVx = (edx / edist) * config.speed * 0.5;
        idleVy = (edy / edist) * config.speed * 0.5;
      } else if (idleRoll < 4) {
        const closestTree = findClosestEntityInRadius(
          treeGrid,
          entity.x,
          entity.y,
          socialScanRadius,
          (tree) => tree.type === EntityType.Tree && tree.alive,
          'social',
          byType[EntityType.Tree],
        );
        if (closestTree) {
          const tdx = closestTree.x - entity.x;
          const tdy = closestTree.y - entity.y;
          const tdist = Math.hypot(tdx, tdy) || 1;
          if (tdist > 15) {
            idleVx = (tdx / tdist) * config.speed * 0.4;
            idleVy = (tdy / tdist) * config.speed * 0.4;
          } else {
            idleVx = Math.sin(tick * 0.05 + entity.id) * config.speed * 0.15;
            idleVy = Math.cos(tick * 0.04 + entity.id) * config.speed * 0.15;
          }
        }
      } else if (idleRoll < 6) {
        const nearest = findClosestEntityInRadius(
          mobileGrid,
          entity.x,
          entity.y,
          socialScanRadius,
          (h) => h.id !== entity.id && !h.isJuvenile,
          'social',
          allHumans,
        );
        if (nearest) {
          const sdx = nearest.x - entity.x;
          const sdy = nearest.y - entity.y;
          const sdist = Math.sqrt(sdx * sdx + sdy * sdy) || 1;
          if (sdist > 20) {
            idleVx = (sdx / sdist) * config.speed * 0.35;
            idleVy = (sdy / sdist) * config.speed * 0.35;
          } else if (sdist < 8) {
            idleVx = -(sdx / sdist) * config.speed * 0.15;
            idleVy = -(sdy / sdist) * config.speed * 0.15;
          } else {
            idleVx = Math.sin(tick * 0.03 + entity.id) * config.speed * 0.12;
            idleVy = Math.cos(tick * 0.025 + entity.id) * config.speed * 0.12;
            if (isRenffrGossipActive(state)) {
              settlerPairChat(entity, nearest, 'renffr', 0.14);
            } else {
              settlerPairChat(
                entity,
                nearest,
                state.festival?.active ? 'festival' : 'social',
                0.1,
              );
            }
          }
        }
      } else {
        const time = tick * 0.02 + entity.id;
        idleVx = Math.sin(time) * config.speed * 0.3 + Math.cos(time * 0.7) * config.speed * 0.15;
        idleVy = Math.cos(time * 0.8) * config.speed * 0.3 + Math.sin(time * 1.3) * config.speed * 0.1;
      }

      if (idleVx !== 0 || idleVy !== 0) {
        entity.vx = entity.vx * 0.55 + idleVx * 0.45;
        entity.vy = entity.vy * 0.55 + idleVy * 0.45;
        entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
      }
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
      killHuman(entity, updatedBuildings, entityById);
      createDeathParticles(state, entity.x, entity.y, '#8B0000', 8);
      logEvent(state, 'death', formatDeathLog(entity, 'succumbed to exhaustion'), formatCitizenName(entity));
    }
    syncEntityGrids(ctx, entity);
  }
}


// ============ TICK WILDLIFE ============
export function tickWildlife(state: WorldState, ctx: TickContext): void {
  const {
    width, height, grassMult, reproMult, winterPenalty,
    byType, newEntities, updatedBuildings, roadBuildings, focus, entityById, predators,
    grassGrid, mobileGrid, scentGrid,
  } = ctx;

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
  if (!ctx.grassPopulation) {
    ctx.grassPopulation = buildGrassPopulationSnapshot(byType, newEntities);
  }
  const grassPopulation = ctx.grassPopulation;
  if (ctx.grassCap === undefined) {
    ctx.grassCap = getGrassPopulationCap(width, height);
  }
  const grassCap = ctx.grassCap;
  const preyFallback = (byType[EntityType.Rabbit] ?? []).concat(byType[EntityType.Deer] ?? []);

  const isNewCalendarDay = isNewCalendarDayTick(state);
  const wildlifeDeathsThisTick = new Set<number>();

  for (const entityType of WILDLIFE_TICK_TYPES) {
    for (const entity of byType[entityType]) {
      if (!entity.alive) continue;

    // Common updates
    if (isNewCalendarDay) {
      entity.age++;
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
    entity.animFrame = (entity.animFrame ?? 0) + 0.1;

    // Death by old age
    if (entity.age >= entity.maxAge) {
      markWildlifeDead(ctx, entity, wildlifeDeathsThisTick);
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

    // ---- GRASS ----
    if (entity.type === EntityType.Grass) {
      const grassInFocus = !focus || isInFocus(entity, focus);
      if (!grassInFocus && (state.tick + entity.id) % OFFSCREEN_GRASS_THROTTLE !== 0) {
        if (entity.energy <= 0) {
          markGrassDead(ctx, entity);
          createDeathParticles(state, entity.x, entity.y, '#4a7a4a', 3, 'smoke');
          syncEntityGrids(ctx, entity);
        }
        continue;
      }

      const growMult = hasTech(state, 'agriculture_3') && state.weather === WeatherType.Drought
        ? grassMult * 1.5 : grassMult;
      entity.energy = Math.min(entity.maxEnergy, entity.energy + GRASS_GROWTH_PER_TICK * growMult);

      if (entity.energy > config.reproductionEnergyThreshold && Math.random() < config.reproductionChance * grassMult) {
        if (grassPopulationTotal(grassPopulation) < grassCap) {
          const angle = Math.random() * Math.PI * 2;
          const dist = 15 + Math.random() * 25;
          const nx = entity.x + Math.cos(angle) * dist;
          const ny = entity.y + Math.sin(angle) * dist;
          if (nx >= 0 && nx <= width && ny >= 0 && ny <= height && isValidGrassTerrain(state, nx, ny)) {
            pushNewEntity(state, ctx, createEntity(EntityType.Grass, nx, ny, state.nextEntityId++, config.spawnEnergy));
            entity.energy -= 25;
          }
        }
      }
      if (entity.energy <= 0) {
        markGrassDead(ctx, entity);
        createDeathParticles(state, entity.x, entity.y, '#4a7a4a', 3, 'smoke');
        syncEntityGrids(ctx, entity);
        continue;
      }
      syncEntityGrids(ctx, entity);
      continue;
    }

    // ---- OTHER ANIMALS ----
    // Energy loss runs every tick — including off-screen wildlife — before the activity throttle.
    entity.energy -= config.energyLossPerTick + winterPenalty;

    if (entity.energy <= 0) {
      markWildlifeDead(ctx, entity, wildlifeDeathsThisTick);
      createDeathParticles(state, entity.x, entity.y, '#8a2a2a', 8);
      syncEntityGrids(ctx, entity);
      continue;
    }

    const wildlifeInFocus = !focus || isInFocus(entity, focus);
    const wildlifeActive = wildlifeInFocus || (state.tick + entity.id) % OFFSCREEN_WILDLIFE_THROTTLE === 0;
    if (!wildlifeActive) {
      entity.reproductionCooldown = Math.max(0, entity.reproductionCooldown - 1);
      syncEntityGrids(ctx, entity);
      continue;
    }

    let targetVx = 0;
    let targetVy = 0;

    // Flee from predators
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

    // Hunt prey
    if (entity.type === EntityType.Wolf || entity.type === EntityType.Fox || entity.type === EntityType.Werewolf) {
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
            entity.alive = false;
            entityById.delete(entity.id);
            wildlifeDeathsThisTick.add(entity.id);
            syncEntityGrids(ctx, entity);
            entity.huntTargetId = undefined;
            clearHuntersTargetingPrey(victimId, entityById, ctx.huntTargetByPreyId);
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
              killHuman(caughtPrey, updatedBuildings, entityById);
            } else {
              caughtPrey.alive = false;
              entityById.delete(victimId);
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

    if (entity.type === EntityType.Werewolf && isActiveMoonHowler(entity) && state.tick % 140 === entity.id % 140) {
      const line = WEREWOLF_HOWL_LINES[Math.floor(Math.random() * WEREWOLF_HOWL_LINES.length)];
      addFloatingText(state, entity.x, entity.y - 18, line, '#c4b5fd');
    }

    // Graze
    if ((entity.type === EntityType.Rabbit || entity.type === EntityType.Deer || entity.type === EntityType.Wildkin) && targetVx === 0 && targetVy === 0) {
      const grazeRange = 50;
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

    // Wander
    if (targetVx === 0 && targetVy === 0) {
      if (Math.random() < 0.05) {
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
            (p) => (p.type === EntityType.Rabbit || p.type === EntityType.Deer) && p.alive,
            'tamed_hunt',
            preyFallback,
          );
          if (assistPrey?.alive) {
            const preyId = assistPrey.id;
            assistPrey.alive = false;
            entityById.delete(preyId);
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
    entity.reproductionCooldown = Math.max(0, entity.reproductionCooldown - 1);

    if (entity.type !== EntityType.Werewolf) {
    const sameTypeCount = wildlifeTypePopulation(wildlifePopulation, entity.type, entity.id);
    const maxPop = entity.type === EntityType.Rabbit ? 120 : entity.type === EntityType.Deer ? 60 : entity.type === EntityType.Wolf ? 25 : 35;
    const capacityFactor = Math.max(0, 1 - (sameTypeCount / maxPop));

    if (entity.reproductionCooldown <= 0 && entity.energy > config.reproductionEnergyThreshold && Math.random() < config.reproductionChance * reproMult * capacityFactor) {
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
