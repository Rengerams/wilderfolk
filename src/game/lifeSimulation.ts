import type { WorldState, Entity, Building } from './gameTypes';
import {
  EntityType,
  BuildingType,
  JobType,
  TerrainType,
  TERRAIN_TILE_SIZE,
  WEREWOLF_ATTACK_LINES,
  WEREWOLF_HOWL_LINES,
  BUILDING_CONFIGS,
} from './gameTypes';

import { SPECIES_CONFIG } from './speciesConfig';
import { OFFSCREEN_WILDLIFE_THROTTLE, WILDLIFE_LAYER_INTERVAL, isInFocus } from './simFocus';
import {
  addBigNews,
  addFloatingText,
  addNotification,
  createDeathParticles,
  impulseScreenShake,
} from './simEffects';

import { countWorkersAtBuilding } from './workforce';

import {
  GRAZE_BITE_ENERGY,
  GRASS_GRAZE_MIN_ENERGY,
  GRASS_GROWTH_PER_TICK,
} from './grassEcology';
import { isPlayerHuman } from './playerHuman';


import { getValleyIllnessChanceBonus } from './ecologyStage';
import { HUMAN_ADULT_MIN_AGE, HUMAN_ADULT_MAX_AGE, HUMAN_CHILDHOOD_DAYS, HUMAN_MAX_LIFESPAN_YEARS, getColonyDay, TICKS_PER_HOUR, HUMAN_DAILY_ILLNESS_CHANCE, HUMAN_DAILY_PREGNANCY_CHANCE_HOME, HUMAN_DAILY_PREGNANCY_CHANCE_NEAR, HUMAN_DAILY_AFFAIR_PREGNANCY_CHANCE, hasResidenceAssignment, getAbsoluteCalendarDay, isNearResidence, isResidenceBuilding, pickResidenceForHuman, pickResidenceForHumanExcluding, syncResidenceOccupants, killHuman, shareResidence, shouldBeAtHome, isNewCalendarDayTick, TICKS_PER_DAY, isProductionTick, getFemaleFertility, getOldAgeDeathChance, EVENT_INTERVAL, ticksForDays } from './dayCycle';


import { appendDeathAge, formatCitizenName, formatDeathLog } from './citizenId';
import { dissolveMarriage, formatCaughtCheaterDivorceDetail } from './nameLoader';

import { rollPredatorBlock, rollCounterAttack } from './combat';
import { isActiveMoonHowler } from './moonHowler';

import { createEntity } from './entityFactory';
import { logEvent } from './eventLog';
import { startFeud } from './relationships';

import { dampScandalReputationLoss } from './townHall';









import type { EntitySpatialGrid } from './spatialGrid';
import { buildRoadAvoidanceIndex } from './spatialGrid';
import { buildGrassPopulationSnapshot, buildWildlifePopulationSnapshot, findClosestEntityInRadius, findClosestInEntityGrid, forEachInEntityGrid, getHousemates, queryRoadAvoidance, getLivingEntity, grassPopulationTotal, recordGrassDeath, wildlifeTypePopulation } from './simQueries';

import {
  USE_SCENT_GRID,
  RABBIT_SCENT_SENSITIVITY,
  DEER_SCENT_SENSITIVITY,
  WILDKIN_SCENT_SENSITIVITY,
} from './scentGrid';

import { traitMultiplier } from './settlerTraits';

import type { TickContext } from './simulation/simulationTypes';
import { pushNewEntity, markWildlifeDead, syncEntityGrids, getGrassPopulationCap, clearHuntersTargetingPrey } from './simulation/simulationEntities';

/** Spouse proximity that blocks starting or pursuing an affair. */
export const AFFAIR_SPOUSE_BLOCK_RADIUS = 22;
/** Building / marital-home proximity for affair tryst validation. */
export const AFFAIR_BUILDING_NEAR_RADIUS = 55;
/** Off-screen daily affair encounter tryst distance. */
export const AFFAIR_DAILY_TRYST_RADIUS = 95;
/** Live on-screen intimate tryst distance. */
/** Mobile fauna only — grass is daily; trees are never sim-ticked. */
const WILDLIFE_TICK_TYPES: EntityType[] = [
  EntityType.Rabbit,
  EntityType.Deer,
  EntityType.Wolf,
  EntityType.Fox,
  EntityType.Werewolf,
  EntityType.Wildkin,
];

function markGrassDead(ctx: TickContext, grass: Entity): void {
  if (grass.type !== EntityType.Grass || !grass.alive) return;
  grass.alive = false;
  ctx.entityById.delete(grass.id);
  if (ctx.grassPopulation) recordGrassDeath(ctx.grassPopulation);
}



export function shouldLeadAffairPair(a: Entity, b: Entity): boolean {
  return a.id < b.id;
}

export function affairPairLead(a: Entity, b: Entity): { lead: Entity; other: Entity } {
  return a.id < b.id ? { lead: a, other: b } : { lead: b, other: a };
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

export function isValidHuntPrey(
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

// ============ HUMAN RELATIONSHIP HELPERS ============
export function humanDisplayName(entity: Entity): string {
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

export function isSpouseNearby(entity: Entity, entityById: Map<number, Entity>, range = 52): boolean {
  const spouse = getLivingEntity(entity.partnerId, entityById);
  if (!spouse) return false;
  return Math.hypot(spouse.x - entity.x, spouse.y - entity.y) < range;
}

/** Married settler standing at the home they share with their spouse. */
export function isAtMaritalHome(
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

export function isSingleParamour(paramour: Entity): boolean {
  return paramour.relationshipStatus === 'single' && paramour.partnerId == null;
}

export function getAffairTrystBuilding(
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

export function getBuildingCenter(building: Building): { x: number; y: number } {
  return { x: building.x + building.width / 2, y: building.y + building.height / 2 };
}

export function isNearBuilding(human: Entity, building: Building, maxDist = 55): boolean {
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


/** Affairs can run off-duty or during work when spouses are at separate job sites. */

export function recordAffairTrystSite(
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

export function isValidAffairTarget(entity: Entity, target: Entity, tick: number): boolean {
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

export function onScandalCooldown(entity: Entity, tick: number): boolean {
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
  // Phase 7 — the wronged spouse now feuds with the paramour.
  startFeud(state, spouse, paramour, 35);

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

/** Beyond this distance, settlers snap to home/work at shift change (7am / 7pm). */





/** Eligible to court / remarry — singles only (divorced people become single; pregnant stay expecting). */
export function isEligibleToCourt(entity: Entity): boolean {
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

