import type { WorldState, Entity, Building } from '../gameTypes';
import {
  EntityType,
  BuildingType,
  JobType,
  BUILDING_CONFIGS,
} from '../gameTypes';
import type { TickContext } from './simulationTypes';
import type { EntitySpatialGrid } from '../spatialGrid';
import { SPECIES_CONFIG } from '../speciesConfig';
import { addFloatingText, addNotification, createDeathParticles } from '../simEffects';
import { countWorkersAtBuilding } from '../workforce';
import { getValleyIllnessChanceBonus } from '../ecologyStage';
import {
  HUMAN_ADULT_MIN_AGE,
  HUMAN_ADULT_MAX_AGE,
  HUMAN_MAX_LIFESPAN_YEARS,
  getColonyDay,
  TICKS_PER_DAY,
  HUMAN_DAILY_ILLNESS_CHANCE,
  HUMAN_DAILY_PREGNANCY_CHANCE_HOME,
  HUMAN_DAILY_PREGNANCY_CHANCE_NEAR,
  HUMAN_DAILY_AFFAIR_PREGNANCY_CHANCE,
  hasResidenceAssignment,
  getAbsoluteCalendarDay,
  isNearResidence,
  isResidenceBuilding,
  pickResidenceForHuman,
  pickResidenceForHumanExcluding,
  syncResidenceOccupants,
  killHuman,
  shareResidence,
  shouldBeAtHome,
  getFemaleFertility,
  getOldAgeDeathChance,
  ticksForDays,
} from '../dayCycle';
import { formatCitizenName, formatDeathLog, humanDisplayName } from '../citizenId';
import { dissolveMarriage, formatCaughtCheaterDivorceDetail } from '../nameLoader';
import { dampScandalReputationLoss } from '../townHall';
import { getLivingEntity, getHousemates } from '../simQueries';
import { forEachAdaptiveInRadius, findClosestAdaptiveInRadius, socialAdaptiveOptions } from '../adaptiveSpatialQuery';
import { startFeud } from '../relationships';
import { logEvent } from '../eventLog';
import { isPlayerHuman } from '../playerHuman';
import { traitMultiplier } from '../settlerTraits';

// ============ HUMAN RELATIONSHIP HELPERS ============
export const AFFAIR_SPOUSE_BLOCK_RADIUS = 22;
/** Building / marital-home proximity for affair tryst validation. */
export const AFFAIR_BUILDING_NEAR_RADIUS = 55;
/** Off-screen daily affair encounter tryst distance. */
export const AFFAIR_DAILY_TRYST_RADIUS = 95;


export function shouldLeadAffairPair(a: Entity, b: Entity): boolean {
  return a.id < b.id;
}

export function affairPairLead(a: Entity, b: Entity): { lead: Entity; other: Entity } {
  return a.id < b.id ? { lead: a, other: b } : { lead: b, other: a };
}


// ============ HUMAN RELATIONSHIP HELPERS ============
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
  humanSocialGrid?: EntitySpatialGrid,
  nearbyHumans?: readonly Entity[],
  width?: number,
  height?: number,
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

  if (humanSocialGrid || (nearbyHumans && nearbyHumans.length > 0)) {
    forEachAdaptiveInRadius(
      humanSocialGrid,
      nearbyHumans ?? [],
      entity.x,
      entity.y,
      150,
      (human) => {
        if (human.type !== EntityType.Human) return;
        consider(human);
      },
      socialAdaptiveOptions('social', nearbyHumans?.length ?? 0, width ?? 0, height ?? 0),
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
  humanSocialGrid?: EntitySpatialGrid,
  width?: number,
  height?: number,
): void {
  const lover = findAffairLover(entity, entityById, state.tick, humanSocialGrid, playerHumans, width, height);
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
  humanSocialGrid: EntitySpatialGrid | undefined,
  residenceOccupants: Map<number, Entity[]>,
  fallbackHumans?: readonly Entity[],
  width?: number,
  height?: number,
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

  const nearby = findClosestAdaptiveInRadius(
    humanSocialGrid,
    fallbackHumans ?? [],
    entity.x,
    entity.y,
    courtRange,
    (candidate) => isCourtshipCandidate(entity, candidate),
    socialAdaptiveOptions('social', fallbackHumans?.length ?? 0, width ?? 0, height ?? 0),
  );
  if (nearby) {
    const dx = nearby.x - entity.x;
    const dy = nearby.y - entity.y;
    consider(nearby, dx * dx + dy * dy);
  }
  return closest;
}