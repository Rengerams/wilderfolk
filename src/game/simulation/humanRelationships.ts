import { reassignDivorcedResidences, syncPartnerResidence } from '../housingPipeline';

import type { WorldState, Entity, Building } from '../gameTypes';
import { EntityType, BuildingType, JobType, BUILDING_CONFIGS } from '../gameTypes';
import type { TickContext } from './simulationTypes';
import type { EntitySpatialGrid } from '../spatialGrid';
import { SPECIES_CONFIG } from '../speciesConfig';
import { addBigNews, addFloatingText, addNotification, createDeathParticles } from '../simEffects';
import { getValleyIllnessChanceBonus } from '../ecologyStage';
// One owner for "where the building is": `placementUtils.getBuildingCenter` reads `x/y` as the
// footprint **centre**, which is what the pad and sprite are drawn around.
import { getBuildingCenter } from '../placementUtils';
import { PROFILE_REVISION, bumpRevision } from '../entityRevision';
import {
  HUMAN_MAX_LIFESPAN_YEARS,
  getColonyDay,
  TICKS_PER_DAY,
  DAYS_PER_YEAR,
  HUMAN_DAILY_ILLNESS_CHANCE,
  HUMAN_DAILY_PREGNANCY_CHANCE_HOME,
  HUMAN_DAILY_PREGNANCY_CHANCE_NEAR,
  HUMAN_DAILY_AFFAIR_PREGNANCY_CHANCE,
  HUMAN_FERTILITY_START,
  HUMAN_YOUTH_FERTILITY_END,
  getYouthConceptionMultiplier,
  getAbsoluteCalendarDay,
  isWeekend,
  killHuman,
  getFemaleFertility,
  getOldAgeDeathChance,
  ticksForDays,
  isStartOfClockHour,
} from '../dayCycle';
import { hasResidenceAssignment, isNearResidence, isResidenceBuilding, shareResidence } from '../housingModel';
import { HUMAN_ADULT_MIN_AGE } from '../daycycleconstants';
import { citizenFullName, formatCitizenName, formatDeathLog, humanDisplayName } from '../citizenId';
import { dissolveMarriage, formatCaughtCheaterDivorceDetail, syncMarriageSurnames } from '../nameLoader';
import { dampScandalReputationLoss } from '../townHall';
import { getLivingEntity, getHousemates } from '../simQueries';
import { forEachAdaptiveInRadius, socialAdaptiveOptions, SOCIAL_AFFAIR_RADIUS } from '../adaptiveSpatialQuery';
import { isMarriedOrExpecting, startFeud } from '../relationships';
import { logDeath, logEvent } from '../eventLog';
import { isPlayerHuman } from '../playerHuman';
import { evaluateAptitudeInfluence } from '../personality/traitEvaluation';

import { SCHOOL_GRADUATION_DAYS } from '../education';
import { recordRelationshipDiagnostic } from '../relationshipDiagnostics';
import { findHumanWorkplace } from '../workforce';
import { getWorkSchedule, type WorkSchedule } from '../workSchedule';
import { requestDialogue, dialogueHoursFromNominalTicks } from '../dialogueTrees';
import { Relationship } from '../gameConstants';
import { prisonPrisonerCapacity } from '../prisonShifts';
import { getSimRng, seededRandomForRun, personDayRoll } from '../simRng';
import { startPregnancy } from '../pregnancy';
import { recordMarriageEvent } from '../stats';

import { addReputation } from '../simHelpers';

import { allowSocialLifeFor } from '../humanSchedule';
export const AFFAIR_SPOUSE_BLOCK_RADIUS = 22;
const AFFAIR_BUILDING_NEAR_RADIUS = 55;
const AFFAIR_DAILY_TRYST_RADIUS = 95;

/**
 * The affair-establishment chronicle phrase, written and read through one string so the People
 * screen's yearly count cannot drift.
 */
export const AFFAIR_ESTABLISHED_LOG_PHRASE = 'began a secret affair';

const RELATIONSHIP_CONFIG = {
  SCANDAL_COOLDOWN_TICKS: TICKS_PER_DAY * 21,
  DIVORCE_COURTSHIP_COOLDOWN_DAYS: 21,
  SCHOOLYARD_BOND_EVERY_DAYS: 5,
  SCHOOLYARD_BOND_MAX_FRIENDS: 3,
} as const;

export function shouldLeadAffairPair(a: Entity, b: Entity): boolean {
  return a.id < b.id;
}

function affairPairLead(a: Entity, b: Entity): { lead: Entity; other: Entity } {
  return a.id < b.id ? { lead: a, other: b } : { lead: b, other: a };
}

// ============ SOCIAL / AFFAIR PAIR RECONCILIATION ============

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
    !lover ||
    lover.affairPartnerId !== entity.id ||
    lover.prisonBuildingId != null ||
    entity.prisonBuildingId != null
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

/**
 * The lover this settler is in an **established** mutual affair with, or nothing — exposure is an
 * established-affair outcome.
 */
function findAffairLover(
  entity: Entity,
  entityById: Map<number, Entity>,
  tick: number,
): Entity | undefined {
  if (entity.affairPartnerId == null) return undefined;
  const lover = getLivingEntity(entity.affairPartnerId, entityById);
  if (!lover || lover.affairPartnerId !== entity.id) return undefined;
  return isValidAffairTarget(entity, lover, tick) ? lover : undefined;
}

export function isSpouseNearby(entity: Entity, entityById: Map<number, Entity>, range = 52): boolean {
  const spouse = getLivingEntity(entity.partnerId, entityById);
  if (!spouse) return false;
  const dx = spouse.x - entity.x;
  const dy = spouse.y - entity.y;
  return dx * dx + dy * dy < range * range;
}

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

function isSpouseAtSharedHome(
  entity: Entity,
  entityById: Map<number, Entity>,
  buildingById: Map<number, Building>,
  maxDist = 55,
): boolean {
  const spouse = getLivingEntity(entity.partnerId, entityById);
  if (!spouse || !shareResidence(entity, spouse)) return false;
  if (!hasResidenceAssignment(entity)) return false;
  const residence = entity.residenceBuildingId != null ? buildingById.get(entity.residenceBuildingId) : undefined;
  if (!residence || !isResidenceBuilding(residence)) return false;
  return isNearBuilding(spouse, residence, maxDist);
}

/**
 * True when the settler is at their marital home *and the spouse is there too*; an empty marital
 * home is a legitimate tryst site, which is how a walk-in becomes possible.
 */
export function isMaritalHomeOccupiedBySpouse(
  entity: Entity,
  entityById: Map<number, Entity>,
  buildingById: Map<number, Building>,
  maxDist = 55,
): boolean {
  return isAtMaritalHome(entity, entityById, buildingById)
    && isSpouseAtSharedHome(entity, entityById, buildingById, maxDist);
}

/** Radius at which a spouse physically arriving on the pair counts as a walk-in. */
export const AFFAIR_WALK_IN_RADIUS = 55;

/**
 * True when the settler's spouse is physically on them — beside them, or at the shared home they are
 * at. "Due home" deliberately does not count: only a spouse who is actually there walks in.
 */
function spouseIsOn(entity: Entity, entityById: Map<number, Entity>, buildingById: Map<number, Building>): boolean {
  return isSpouseNearby(entity, entityById, AFFAIR_WALK_IN_RADIUS)
    || isSpouseAtSharedHome(entity, entityById, buildingById, AFFAIR_WALK_IN_RADIUS);
}

/**
 * True when a spouse physically walks in on the pair — wherever the tryst is, not only the marital
 * home; both sides are checked.
 */
export function wouldWalkInOnAffair(
  cheater: Entity,
  paramour: Entity,
  entityById: Map<number, Entity>,
  buildingById: Map<number, Building>,
): boolean {
  return spouseIsOn(cheater, entityById, buildingById) || spouseIsOn(paramour, entityById, buildingById);
}

function isSingleParamour(paramour: Entity): boolean {
  return paramour.relationshipStatus === 'single' && paramour.partnerId == null;
}

/** The paramour's own residence, when they have a usable one. */
function getParamourResidence(paramour: Entity, buildingById: Map<number, Building>): Building | undefined {
  if (!isSingleParamour(paramour) || !hasResidenceAssignment(paramour)) return undefined;
  const residence = paramour.residenceBuildingId != null ? buildingById.get(paramour.residenceBuildingId) : undefined;
  if (!residence?.completed || !isResidenceBuilding(residence)) return undefined;
  return residence;
}

/**
 * Only a real residence of one of the two lovers can be an indoor rendezvous.
 * When neither lover is near an eligible home, their meeting remains outdoors.
 */
export function getAffairTrystBuilding(
  cheater: Entity,
  paramour: Entity,
  entityById: Map<number, Entity>,
  buildingById: Map<number, Building>,
): Building | undefined {
  let chosen: Building | undefined;
  let bestDistanceSq = Infinity;
  for (const participant of [cheater, paramour]) {
    if (!hasResidenceAssignment(participant)) continue;
    const residence = buildingById.get(participant.residenceBuildingId!);
    if (!residence?.completed || !isResidenceBuilding(residence)) continue;
    if (participant.partnerId != null && isSpouseAtSharedHome(participant, entityById, buildingById)) continue;

    const center = getBuildingCenter(residence);
    const firstDistanceSq = (cheater.x - center.x) ** 2 + (cheater.y - center.y) ** 2;
    const secondDistanceSq = (paramour.x - center.x) ** 2 + (paramour.y - center.y) ** 2;
    if (Math.min(firstDistanceSq, secondDistanceSq) > AFFAIR_BUILDING_NEAR_RADIUS ** 2) continue;
    const distanceSq = Math.max(firstDistanceSq, secondDistanceSq);
    if (distanceSq < bestDistanceSq || (distanceSq === bestDistanceSq && residence.id < (chosen?.id ?? Infinity))) {
      chosen = residence;
      bestDistanceSq = distanceSq;
    }
  }
  return chosen;
}

export function isNearBuilding(human: Entity, building: Building, maxDist = 55): boolean {
  const center = getBuildingCenter(building);
  const dx = human.x - center.x;
  const dy = human.y - center.y;
  return dx * dx + dy * dy <= maxDist * maxDist;
}

export function isValidAffairTrystSite(
  cheater: Entity,
  paramour: Entity,
  entityById: Map<number, Entity>,
  buildingById: Map<number, Building>,
  intimateDist = AFFAIR_BUILDING_NEAR_RADIUS,
  _hourOfDay?: number,
): boolean {
  if (!cheater.alive || !paramour.alive) return false;

  // An arriving spouse blocks an occupied marital home; an encounter elsewhere stays legal.
  if (isAtMaritalHome(cheater, entityById, buildingById)
    && (isSpouseNearby(cheater, entityById, intimateDist)
      || isSpouseAtSharedHome(cheater, entityById, buildingById, intimateDist))) return false;
  if (isAtMaritalHome(paramour, entityById, buildingById)
    && (isSpouseNearby(paramour, entityById, intimateDist)
      || isSpouseAtSharedHome(paramour, entityById, buildingById, intimateDist))) return false;

  const trystBuilding = getAffairTrystBuilding(cheater, paramour, entityById, buildingById);
  if (trystBuilding && isNearBuilding(cheater, trystBuilding, intimateDist)
    && isNearBuilding(paramour, trystBuilding, intimateDist)) return true;

  // Proximity outside either partner's home is sufficient for an outdoor affair.
  const dx = paramour.x - cheater.x;
  const dy = paramour.y - cheater.y;
  return dx * dx + dy * dy < intimateDist * intimateDist;
}

function isValidAffairConceptionSite(
  cheater: Entity,
  paramour: Entity,
  entityById: Map<number, Entity>,
  buildingById: Map<number, Building>,
  intimateDist = 55,
): boolean {
  return isValidAffairTrystSite(cheater, paramour, entityById, buildingById, intimateDist);
}

export function recordAffairTrystSite(
  entity: Entity,
  paramour: Entity,
  state: WorldState,
  buildingById?: Map<number, Building>,
  entityById?: Map<number, Entity>,
): void {
  if (!shouldLeadAffairPair(entity, paramour)) return;
  const siteDay = getColonyDay(state);
  const trystBuilding = buildingById && entityById
    ? getAffairTrystBuilding(entity, paramour, entityById, buildingById)
    : undefined;
  const homeEncounter = trystBuilding != null
    && entity.indoorBuildingId === trystBuilding.id
    && paramour.indoorBuildingId === trystBuilding.id;
  const siteX = homeEncounter ? getBuildingCenter(trystBuilding!).x : (entity.x + paramour.x) / 2;
  const siteY = homeEncounter ? getBuildingCenter(trystBuilding!).y : (entity.y + paramour.y) / 2;
  for (const partner of [entity, paramour]) {
    partner.lastAffairSiteDay = siteDay;
    partner.lastAffairSiteX = siteX;
    partner.lastAffairSiteY = siteY;
  }
}

// ============ TICK LOGIC & GOSSIP SYSTEM ============

export function tryDailyAffairGossip(
  state: WorldState,
  entity: Entity,
  entityById: Map<number, Entity>,
  buildings: Building[],
  buildingById: Map<number, Building>,
  churchStrength: number,
  /** Forwarded to `exposeAffair`; only its `'caught'` path reads it. */
  playerHumans: readonly Entity[],
): void {
  recordRelationshipDiagnostic('gossipChecks');
  // Exposure requires an **established** affair: an unestablished pair has no affair to expose, and
  // exposing clears both partners' progress.
  if (!hasAffairPartner(entity, entityById)) return;
  const lover = findAffairLover(entity, entityById, state.tick);
  if (!lover) return;
  if (!shouldLeadAffairPair(entity, lover)) return;
  if (onScandalCooldown(entity, state.tick) || onScandalCooldown(lover, state.tick)) return;

  // A church does not stop an affair being founded — it scales the daily tryst chance down and makes
  // the village talk sooner, so its lever is how long an established affair survives.
  const chance = churchStrength >= 1 ? 0.22 : churchStrength > 0 ? 0.12 : 0.06;
  // Salts stay split by branch so seeding a run does not change which days already gossiped.
  const salt = churchStrength > 0 ? 602 : 601;
  if (personDayRoll(entity.id, state.tick, salt) < chance) {
    if (isValidAffairTrystSite(entity, lover, entityById, buildingById, AFFAIR_DAILY_TRYST_RADIUS)) {
      recordAffairTrystSite(entity, lover, state, buildingById, entityById);
    }
    exposeAffair(state, entity, lover, 'rumor', entityById, buildings, playerHumans);
    recordRelationshipDiagnostic('scandalExposures');
  }
}

export function trySchoolyardGossip(
  state: WorldState,
  child: Entity,
  entityById: Map<number, Entity>,
  buildings: Building[],
  playerHumans: readonly Entity[],
  rng: () => number = getSimRng('humanRelationships'),
): void {
  if (child.age >= HUMAN_ADULT_MIN_AGE || !isPlayerHuman(child)) return;
  const parentIds = [child.fatherId, child.motherId, child.adoptiveFatherId, child.adoptiveMotherId].filter(
    (id): id is number => id != null,
  );
  if (parentIds.length === 0) return;

  for (const pid of parentIds) {
    const parent = entityById.get(pid);
    if (!parent?.alive) continue;
    const lover = parent.affairPartnerId != null ? entityById.get(parent.affairPartnerId) : undefined;
    if (!lover?.alive) continue;
    if (!shouldLeadAffairPair(parent, lover)) continue;
    if (onScandalCooldown(parent, state.tick) || onScandalCooldown(lover, state.tick)) continue;
    if ((parent.affairProgress ?? 0) < 45 && (lover.affairProgress ?? 0) < 45) continue;
    const day = getAbsoluteCalendarDay(state.tick);
    if (child.schoolGossipDay === day) continue;
    child.schoolGossipDay = day;

    if (rng() < 0.35) {
      exposeAffair(state, parent, lover, 'rumor', entityById, buildings, playerHumans);
      recordRelationshipDiagnostic('scandalExposures');
      const parentName = citizenFullName(parent);
      addFloatingText(state, child.x, child.y - 22, '🤫 whispered…', '#fbbf24', 'brief');
      logEvent(
        state,
        'event',
        `The children at school are whispering that ${parentName} sneaks out at night…`,
        child.name,
      );
    }
  }
}

export function tryFormSchoolyardBond(state: WorldState, child: Entity, rng: () => number = getSimRng('humanRelationships')): void {
  if (child.age >= HUMAN_ADULT_MIN_AGE || !isPlayerHuman(child)) return;
  const day = getAbsoluteCalendarDay(state.tick);
  if (child.schoolBondDay === day) return;
  const schoolDays = child.schoolDays ?? 0;
  if (schoolDays === 0 || schoolDays % RELATIONSHIP_CONFIG.SCHOOLYARD_BOND_EVERY_DAYS !== 0) return;
  child.schoolBondDay = day;

  const friends = child.childhoodFriendsIds ?? [];
  if (friends.length >= RELATIONSHIP_CONFIG.SCHOOLYARD_BOND_MAX_FRIENDS) return;

  const classmates = state.entities.filter(
    (e) =>
      e.alive &&
      e.type === EntityType.Human &&
      e.age < HUMAN_ADULT_MIN_AGE &&
      isPlayerHuman(e) &&
      e.id !== child.id &&
      !friends.includes(e.id) &&
      (e.childhoodFriendsIds?.length ?? 0) < RELATIONSHIP_CONFIG.SCHOOLYARD_BOND_MAX_FRIENDS,
  );
  if (classmates.length === 0) return;

  const friend = classmates[Math.floor(rng() * classmates.length)];
  if (!friend) return;

  const nextChildFriends = [...friends];
  if (!nextChildFriends.includes(friend.id)) {
    nextChildFriends.push(friend.id);
  }
  child.childhoodFriendsIds = nextChildFriends.slice(0, RELATIONSHIP_CONFIG.SCHOOLYARD_BOND_MAX_FRIENDS);
  bumpRevision(child, PROFILE_REVISION);

  const friendFriends = friend.childhoodFriendsIds ?? [];
  const nextFriendFriends = [...friendFriends];
  if (!nextFriendFriends.includes(child.id)) {
    nextFriendFriends.push(child.id);
  }
  friend.childhoodFriendsIds = nextFriendFriends.slice(0, RELATIONSHIP_CONFIG.SCHOOLYARD_BOND_MAX_FRIENDS);
  bumpRevision(friend, PROFILE_REVISION);

  addFloatingText(state, child.x, child.y - 22, '👫 friends', '#fbbf24', 'brief');
  logEvent(
    state,
    'event',
    `${citizenFullName(child)} and ${citizenFullName(friend)} became friends at school`,
    child.name,
  );
}

// ============ YOUTHFUL FIRST LOVE LIFECYCLE ============

/**
 * Youngest age a youth-love link may start at — **12**, not the originally documented 14; every
 * adult system stays 18+.
 */
const YOUTH_LOVE_MIN_AGE = 12;

/**
 * Largest age difference a youth-love pair may have when it forms — and so how long an existing
 * link may wait past the older partner's 18th birthday for the younger one to come of age.
 */
export const YOUTH_LOVE_MAX_AGE_GAP = 4;
const YOUTH_LOVE_DAILY_START_CHANCE = 0.0015;
const YOUTH_LOVE_DAILY_SCHOOL_BONUS = 0.2;
const YOUTH_LOVE_DAILY_BREAKUP_CHANCE = 0.0004;

function hasSharedSchoolBond(a: Entity, b: Entity): boolean {
  return (a.childhoodFriendsIds ?? []).includes(b.id) || (b.childhoodFriendsIds ?? []).includes(a.id);
}

function schoolAffinity(a: Entity, b: Entity): number {
  const sharedDays = Math.min(a.schoolDays ?? 0, b.schoolDays ?? 0);
  const attendance = Math.min(1, sharedDays / SCHOOL_GRADUATION_DAYS);
  return hasSharedSchoolBond(a, b) ? Math.min(1, attendance + 0.35) : attendance;
}

function clearYouthLovePair(a: Entity, b?: Entity): void {
  a.youthLovePartnerId = undefined;
  a.youthLoveProgress = undefined;
  a.youthLoveStartedDay = undefined;
  if (b) {
    b.youthLovePartnerId = undefined;
    b.youthLoveProgress = undefined;
    b.youthLoveStartedDay = undefined;
  }
}

/** Shared single-settler eligibility; age and bond-specific rules stay with each lifecycle. */
function isAvailableForRomance(entity: Entity): boolean {
  return isPlayerHuman(entity) && entity.alive && !entity.pregnant
    && entity.prisonBuildingId == null && entity.partnerId == null
    && entity.relationshipStatus === 'single' && entity.youthLovePartnerId == null;
}

function isEligibleForYouthLove(entity: Entity): boolean {
  return isAvailableForRomance(entity)
    && entity.age >= YOUTH_LOVE_MIN_AGE && entity.age < HUMAN_ADULT_MIN_AGE
    && entity.courtshipPartnerId == null && !!entity.gender;
}

function isValidYouthLoveTarget(entity: Entity, candidate: Entity): boolean {
  return (
    isEligibleForYouthLove(candidate) &&
    candidate.id !== entity.id &&
    !!entity.gender &&
    candidate.gender !== entity.gender &&
    Math.abs(candidate.age - entity.age) <= YOUTH_LOVE_MAX_AGE_GAP
  );
}

/**
 * Clear a youth-love link that can no longer be valid — except the pending handoff where the older
 * partner has turned 18 while the younger one is still a minor, which `advanceYouthLove` promotes.
 */
function reconcileYouthLove(entity: Entity, entityById: Map<number, Entity>): void {
  const partnerId = entity.youthLovePartnerId;
  if (partnerId == null) return;
  const partner = getLivingEntity(partnerId, entityById);
  if (
    !partner ||
    partner.youthLovePartnerId !== entity.id ||
    entity.prisonBuildingId != null ||
    partner.prisonBuildingId != null ||
    entity.partnerId != null ||
    partner.partnerId != null ||
    entity.relationshipStatus !== 'single' ||
    partner.relationshipStatus !== 'single' ||
    entity.courtshipPartnerId != null ||
    partner.courtshipPartnerId != null ||
    entity.id === partner.id ||
    !entity.gender || !partner.gender || entity.gender === partner.gender ||
    Math.abs(entity.age - partner.age) > YOUTH_LOVE_MAX_AGE_GAP
  ) {
    // A stale outgoing link must not erase the other settler's valid relationship.
    clearYouthLovePair(entity, partner?.youthLovePartnerId === entity.id ? partner : undefined);
  }
}

function promoteYouthLoveToCourtship(state: WorldState, a: Entity, b: Entity): void {
  const carriedProgress = Math.min(
    70,
    Math.max(25, Math.round(Math.min(a.youthLoveProgress ?? 0, b.youthLoveProgress ?? 0) * 0.7)),
  );
  clearYouthLovePair(a, b);
  bindCourtship(a, b);
  a.courtshipProgress = carriedProgress;
  b.courtshipProgress = carriedProgress;
  createDeathParticles(state, (a.x + b.x) / 2, (a.y + b.y) / 2 - 12, '#f9a8d4', 9, 'heart');
  logEvent(
    state,
    'event',
    `${citizenFullName(a)} and ${citizenFullName(b)} are growing up together`,
    a.name,
  );
}

export function advanceYouthLove(
  state: WorldState,
  ctx: Pick<TickContext, 'entityById' | 'humanSocialGrid' | 'playerHumans' | 'width' | 'height'>,
  rng: () => number = getSimRng('humanRelationships'),
): void {
  const { entityById, humanSocialGrid, playerHumans, width, height } = ctx;
  const day = getAbsoluteCalendarDay(state.tick);
  const attempted = new Set<number>();

  // Snapshot before reconciliation can clear both participants' fields.
  for (const entity of playerHumans) {
    if (entity.youthLovePartnerId != null) attempted.add(entity.id);
  }
  for (const entity of playerHumans) {
    reconcileYouthLove(entity, entityById);
  }

  for (const entity of playerHumans) {
    const partner = entity.youthLovePartnerId != null ? getLivingEntity(entity.youthLovePartnerId, entityById) : undefined;
    if (partner) {
      // A partner mid-transform is frozen: promoting or breaking up writes only its live fields, and
      // `revertToHumanForm` then re-asserts the stale snapshot, leaving the link one-sided.
      if (!isPlayerHuman(partner)) continue;
      if (!shouldLeadAffairPair(entity, partner)) continue;
      // Both adults → the documented handoff. A pair retained by `reconcileYouthLove` (one adult, one
      // 12–17) waits here until the younger partner comes of age.
      if (entity.age >= HUMAN_ADULT_MIN_AGE && partner.age >= HUMAN_ADULT_MIN_AGE) {
        promoteYouthLoveToCourtship(state, entity, partner);
        continue;
      }
      if (entity.age < YOUTH_LOVE_MIN_AGE || partner.age < YOUTH_LOVE_MIN_AGE) {
        clearYouthLovePair(entity, partner);
        continue;
      }

      // Only progression and breakup are deferred on formation day; adult
      // handoff and age validation above must also work for imported saves.
      if (entity.youthLoveStartedDay === day || partner.youthLoveStartedDay === day) continue;
      const affinity = schoolAffinity(entity, partner);
      const breakupChance = YOUTH_LOVE_DAILY_BREAKUP_CHANCE * (1.45 - affinity * 0.6);
      if (rng() < breakupChance) {
        attempted.add(entity.id);
        attempted.add(partner.id);
        clearYouthLovePair(entity, partner);
        addFloatingText(
          state,
          (entity.x + partner.x) / 2,
          (entity.y + partner.y) / 2 - 16,
          'Moved on',
          '#94a3b8',
          'brief',
        );
        logEvent(
          state,
          'event',
          `${citizenFullName(entity)} and ${citizenFullName(partner)} grew apart`,
          entity.name,
        );
        continue;
      }

      const progress = 0.55 + affinity * 0.75;
      entity.youthLoveProgress = Math.min(100, (entity.youthLoveProgress ?? 0) + progress);
      partner.youthLoveProgress = Math.min(100, (partner.youthLoveProgress ?? 0) + progress);
      continue;
    }

  }

  // Resolve every existing bond before matching singles. Rotate a stable ID
  // order daily so neither array order nor permanently low IDs get priority.
  const singles = playerHumans.filter(entity => !attempted.has(entity.id) && isEligibleForYouthLove(entity))
    .sort((a, b) => a.id - b.id);
  const offset = singles.length ? day % singles.length : 0;
  for (let index = 0; index < singles.length; index++) {
    const entity = singles[(index + offset) % singles.length];
    if (attempted.has(entity.id) || !isEligibleForYouthLove(entity)) continue;
    let candidate: Entity | undefined;
    let bestScore = Infinity;
    forEachAdaptiveInRadius(
      humanSocialGrid,
      playerHumans,
      entity.x,
      entity.y,
      150,
      (other, distanceSq) => {
        if (attempted.has(other.id) || !isValidYouthLoveTarget(entity, other)) return;
        // Prefer an existing childhood friendship without expanding the local search radius.
        const score = distanceSq * (hasSharedSchoolBond(entity, other) ? 0.25 : 1);
        if (!candidate || score < bestScore || (score === bestScore && other.id < candidate.id)) {
          candidate = other;
          bestScore = score;
        }
      },
      socialAdaptiveOptions('social', playerHumans.length, width, height),
    );
    // Formation is not a pair update: either eligible single can initiate.
    // The reciprocal link immediately removes both from the candidate pool.
    if (!candidate) continue;
    attempted.add(entity.id);
    attempted.add(candidate.id);

    const affinity = schoolAffinity(entity, candidate);
    if (rng() >= YOUTH_LOVE_DAILY_START_CHANCE + affinity * YOUTH_LOVE_DAILY_SCHOOL_BONUS) continue;
    entity.youthLovePartnerId = candidate.id;
    candidate.youthLovePartnerId = entity.id;
    entity.youthLoveProgress = 1;
    candidate.youthLoveProgress = 1;
    entity.youthLoveStartedDay = day;
    candidate.youthLoveStartedDay = day;
    createDeathParticles(state, (entity.x + candidate.x) / 2, (entity.y + candidate.y) / 2 - 12, '#f9a8d4', 7, 'heart');
    const sweetheartLine = `${citizenFullName(entity)} and ${citizenFullName(candidate)} became sweethearts`;
    logEvent(state, 'event', sweetheartLine, entity.name);
    // Affairs raise a notification card from `exposeAffair`; a new sweetheart pair raises one here
    // too, naming the pair so the message says who they are.
    addNotification(state, 'Sweethearts', sweetheartLine, 'success', {
      x: (entity.x + candidate.x) / 2,
      y: (entity.y + candidate.y) / 2 - 12,
    });
  }
}

// ============ REPRODUCTION CONCEPTION & DEATH TICKS ============

export function isValidAffairTarget(entity: Entity, target: Entity, tick: number): boolean {
  if (!isPlayerHuman(target) || !target.alive || !target.gender) return false;
  if (entity.prisonBuildingId != null || target.prisonBuildingId != null) return false;
  if (!entity.gender || target.gender === entity.gender || target.id === entity.id) return false;
  if (target.id === entity.partnerId || entity.id === target.partnerId) return false;
  if (entity.age < HUMAN_ADULT_MIN_AGE || target.age < HUMAN_ADULT_MIN_AGE) return false;
  if (target.age >= HUMAN_MAX_LIFESPAN_YEARS) return false;
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

type ConceptionKind = 'married' | 'youth' | 'affair';

/** Per-kind presentation: pulse strength, colour and hearts. */
const CONCEPTION_LOOK: Readonly<Record<ConceptionKind, {
  readonly flash: number;
  readonly color: string;
  readonly count: number;
}>> = {
  married: { flash: 15, color: '#ffb6c1', count: 10 },
  youth: { flash: 12, color: '#f9a8d4', count: 7 },
  affair: { flash: 14, color: '#f472b6', count: 8 },
};

/**
 * Conception presentation and chronicle around `humanLifecycle.startPregnancy`, the one writer that
 * owns pregnancy state. The kind only changes the wording and the pulse.
 */
function resolveConception(
  state: WorldState,
  entity: Entity,
  partner: Entity,
  kind: ConceptionKind,
): void {
  const look = CONCEPTION_LOOK[kind];
  startPregnancy(entity, {
    origin: kind,
    fatherId: partner.id,
    partner,
    startDay: getColonyDay(state),
  });
  entity.flash = look.flash;
  partner.flash = look.flash;
  createDeathParticles(state, entity.x, entity.y - 8, look.color, look.count, 'heart');

  if (kind === 'affair') {
    addFloatingText(state, entity.x, entity.y - 18, 'Secret…', '#c084fc', 'brief');
  } else {
    addFloatingText(state, entity.x, entity.y - 20, 'Expecting!', '#ff69b4');
  }

  const mother = humanDisplayName(entity);
  if (kind === 'affair') {
    const line = `${mother} is secretly expecting a child`;
    logEvent(state, 'scandal', line, mother);
    addNotification(state, 'Secret pregnancy', line, 'warning', { x: entity.x, y: entity.y });
    return;
  }
  const father = humanDisplayName(partner);
  const line = `${mother} and ${father} are expecting a child`;
  logEvent(state, 'conception', line, mother);
  addNotification(state, 'Expecting', line, 'success', { x: entity.x, y: entity.y });
}

type ConceptionGateOutcome = 'eligibility' | 'energy' | 'proximity' | 'roll';

function recordConceptionGate(outcome: ConceptionGateOutcome): void {
  switch (outcome) {
    case 'eligibility':
      recordRelationshipDiagnostic('conceptionEligibilityRejected');
      break;
    case 'energy':
      recordRelationshipDiagnostic('conceptionEnergyBlocked');
      break;
    case 'proximity':
      recordRelationshipDiagnostic('conceptionProximityBlocked');
      break;
    case 'roll':
      recordRelationshipDiagnostic('conceptionRollFailed');
      break;
  }
}

export function tryDailyConception(state: WorldState, ctx: TickContext, entity: Entity): boolean {
  const config = SPECIES_CONFIG[EntityType.Human];
  recordRelationshipDiagnostic('conceptionCandidates');
  let outcome: ConceptionGateOutcome | null = null;

  // Deployed humans retain their village coordinates for bookkeeping, not proximity.
  if (!isPlayerHuman(entity) || entity.raidDeploymentId) {
    recordConceptionGate('eligibility');
    return false;
  }
  if (entity.gender !== 'female' || entity.pregnant || entity.reproductionCooldown > 0) {
    recordConceptionGate('eligibility');
    return false;
  }

  if (
    isMarriedOrExpecting(entity) &&
    entity.partnerId &&
    entity.energy > config.reproductionEnergyThreshold * 0.75
  ) {
    const partner = getLivingEntity(entity.partnerId, ctx.entityById);
    if (partner && !partner.raidDeploymentId) {
      const dist = Math.hypot(partner.x - entity.x, partner.y - entity.y);
      const sharesHome = shareResidence(entity, partner);
      const bothAtSharedHome =
        sharesHome && isNearResidence(entity, ctx.buildingById) && isNearResidence(partner, ctx.buildingById);
      const together = dist < 22 || bothAtSharedHome;
      const fertility = getFemaleFertility(entity.age);
      if (together && fertility > 0) {
        const baseChance = bothAtSharedHome ? HUMAN_DAILY_PREGNANCY_CHANCE_HOME : HUMAN_DAILY_PREGNANCY_CHANCE_NEAR;
        // Non-genetic: the conception activity carries only the acquired lucky mark.
        const conceptionFactor = evaluateAptitudeInfluence(entity, 'conception').factor;
        if (personDayRoll(entity.id, state.tick, 603) < baseChance * fertility * conceptionFactor) {
          resolveConception(state, entity, partner, 'married');
          recordRelationshipDiagnostic('pregnanciesStartedThisInterval');
          return true;
        }
        outcome ??= 'roll';
      } else {
        outcome ??= 'proximity';
      }
    } else {
      outcome ??= 'proximity';
    }
  } else if (isMarriedOrExpecting(entity) && entity.partnerId) {
    outcome ??= 'energy';
  }

  const youthPartner = entity.youthLovePartnerId == null ? undefined : getLivingEntity(entity.youthLovePartnerId, ctx.entityById);
  if (
    entity.age >= HUMAN_FERTILITY_START &&
    youthPartner &&
    isPlayerHuman(youthPartner) &&
    youthPartner.gender === 'male' &&
    youthPartner.age >= HUMAN_FERTILITY_START &&
    // The retained youth link keeps the youth route across the first 18th birthday: the older
    // partner may be 18 while the younger is still a minor; both 18 or 19+ closes it.
    Math.max(entity.age, youthPartner.age) <= HUMAN_YOUTH_FERTILITY_END &&
    (entity.age < HUMAN_ADULT_MIN_AGE || youthPartner.age < HUMAN_ADULT_MIN_AGE) &&
    youthPartner.youthLovePartnerId === entity.id &&
    !youthPartner.pregnant && !youthPartner.raidDeploymentId
  ) {
    if (
      entity.energy <= config.reproductionEnergyThreshold * 0.75 ||
      youthPartner.energy <= config.reproductionEnergyThreshold * 0.6
    ) {
      outcome ??= 'energy';
    } else {
      const dx = youthPartner.x - entity.x;
      const dy = youthPartner.y - entity.y;
      const nearYouthPartner = dx * dx + dy * dy < 22 * 22;
      const fertility = getFemaleFertility(entity.age);
      const youthMultiplier = getYouthConceptionMultiplier(entity.age);
      if (nearYouthPartner && fertility > 0 && youthMultiplier > 0) {
        const conceptionFactor = evaluateAptitudeInfluence(entity, 'conception').factor;
        const chance =
          HUMAN_DAILY_PREGNANCY_CHANCE_NEAR * youthMultiplier * fertility * conceptionFactor;
        if (personDayRoll(entity.id, state.tick, 604) < chance) {
          resolveConception(state, entity, youthPartner, 'youth');
          recordRelationshipDiagnostic('pregnanciesStartedThisInterval');
          return true;
        }
        outcome ??= 'roll';
      } else {
        outcome ??= 'proximity';
      }
    }
  }

  if (
    hasAffairPartner(entity, ctx.entityById) &&
    entity.energy > config.reproductionEnergyThreshold * 0.65 &&
    !isSpouseNearby(entity, ctx.entityById, AFFAIR_SPOUSE_BLOCK_RADIUS)
  ) {
    const lover = getLivingEntity(entity.affairPartnerId, ctx.entityById);
    if (lover && !lover.raidDeploymentId && isPlayerHuman(lover) && lover.affairPartnerId === entity.id) {
      const tryst = isValidAffairConceptionSite(entity, lover, ctx.entityById, ctx.buildingById, AFFAIR_BUILDING_NEAR_RADIUS);
      const fertility = getFemaleFertility(entity.age);
      if (tryst && fertility > 0) {
        const conceptionFactor = evaluateAptitudeInfluence(entity, 'conception').factor;
        if (personDayRoll(entity.id, state.tick, 605) < HUMAN_DAILY_AFFAIR_PREGNANCY_CHANCE * fertility * conceptionFactor) {
          resolveConception(state, entity, lover, 'affair');
          recordRelationshipDiagnostic('pregnanciesStartedThisInterval');
          return true;
        }
        outcome ??= 'roll';
      } else {
        outcome ??= 'proximity';
      }
    } else {
      return false;
    }
  } else if (hasAffairPartner(entity, ctx.entityById)) {
    outcome ??= entity.energy <= config.reproductionEnergyThreshold * 0.65 ? 'energy' : 'proximity';
  }

  recordConceptionGate(outcome ?? 'eligibility');
  return false;
}

export function tryDailyHumanMortality(
  state: WorldState,
  entity: Entity,
  buildings: Building[],
  entityById?: ReadonlyMap<number, Entity>,
): boolean {
  if (!entity.alive) return false;

  const oldAgeChance = getOldAgeDeathChance(entity.age);
  if (oldAgeChance > 0 && (entity.age >= HUMAN_MAX_LIFESPAN_YEARS || personDayRoll(entity.id, state.tick, 606) < oldAgeChance)) {
    killHuman(entity, buildings, entityById, state.tick, state);
    createDeathParticles(state, entity.x, entity.y, '#aaaaaa', 5, 'smoke');
    const cause = entity.age >= HUMAN_MAX_LIFESPAN_YEARS ? 'old age' : 'an age-related illness';
    logDeath(
      state,
      formatDeathLog(entity, `died of ${cause}`),
      formatCitizenName(entity),
      { x: entity.x, y: entity.y },
    );
    return true;
  }
  {
    const illnessChance = HUMAN_DAILY_ILLNESS_CHANCE + getValleyIllnessChanceBonus(state);
    if (entity.age >= HUMAN_ADULT_MIN_AGE && personDayRoll(entity.id, state.tick, 607) < illnessChance) {
      killHuman(entity, buildings, entityById, state.tick, state);
      createDeathParticles(state, entity.x, entity.y, '#aaaaaa', 5, 'smoke');
      logDeath(
        state,
        formatDeathLog(entity, 'died of a sudden illness'),
        formatCitizenName(entity),
        { x: entity.x, y: entity.y },
      );
      return true;
    }
  }
  return false;
}

// ============ DIVORCE & DOMESTIC DISPUTES ============

export const MARRIAGE_ANNUAL_AMICABLE_DIVORCE_RATE = 0.075;
export const MARRIAGE_DAILY_AMICABLE_DIVORCE_CHANCE = MARRIAGE_ANNUAL_AMICABLE_DIVORCE_RATE / DAYS_PER_YEAR;

export function tryDailyAmicableDivorce(
  state: WorldState,
  entity: Entity,
  entityById: Map<number, Entity>,
  buildings: Building[],
  playerHumans: readonly Entity[],
  rng: () => number = getSimRng('humanRelationships'),
): void {
  if (!isPlayerHuman(entity) || !entity.alive) return;
  const hasActiveMarriage =
    isMarriedOrExpecting(entity) &&
    entity.partnerId != null;
  if (!hasActiveMarriage) return;
  if (entity.prisonBuildingId != null) return;
  const spouse = getLivingEntity(entity.partnerId!, entityById);
  if (!spouse || !isPlayerHuman(spouse) || !spouse.alive || spouse.prisonBuildingId != null) return;
  if (!shouldLeadAffairPair(entity, spouse)) return;
  if (rng() >= MARRIAGE_DAILY_AMICABLE_DIVORCE_CHANCE) return;

  dissolveMarriage(entity, spouse, state.tick);
  startCourtshipCooldown(entity, RELATIONSHIP_CONFIG.DIVORCE_COURTSHIP_COOLDOWN_DAYS);
  startCourtshipCooldown(spouse, RELATIONSHIP_CONFIG.DIVORCE_COURTSHIP_COOLDOWN_DAYS);

  const villagers = playerHumans.filter(isPlayerHuman);
  reassignDivorcedResidences(entity, spouse, buildings, villagers);

  const aName = humanDisplayName(entity);
  const bName = humanDisplayName(spouse);
  logEvent(state, 'divorce', `${aName} and ${bName} divorced amicably`, aName);
  addNotification(state, 'Divorce', `${aName} and ${bName} went their separate ways`, 'info');
  addFloatingText(state, (entity.x + spouse.x) / 2, (entity.y + spouse.y) / 2 - 22, 'Divorced', '#94a3b8');
}

function getScandalCooldownTicks(): number {
  return RELATIONSHIP_CONFIG.SCANDAL_COOLDOWN_TICKS;
}

function onScandalCooldown(entity: Entity, tick: number): boolean {
  return entity.scandalCooldownUntilTick != null && tick < entity.scandalCooldownUntilTick;
}

function setScandalCooldown(entity: Entity, tick: number): void {
  entity.scandalCooldownUntilTick = tick + getScandalCooldownTicks();
}

function tryDivorceOnCaughtCheater(
  state: WorldState,
  cheater: Entity,
  paramour: Entity,
  entityById: Map<number, Entity>,
  buildings: Building[],
  playerHumans: readonly Entity[],
): void {
  // Evaluate each marriage independently, using witness locations before arrest relocates anyone.
  const villagers = playerHumans.filter(isPlayerHuman);
  const witnessed = [cheater, paramour].flatMap((offender) => {
    const spouse = getLivingEntity(offender.partnerId, entityById);
    if (!isMarriedOrExpecting(offender) || !spouse || spouse.partnerId !== offender.id
      || !isSpouseNearby(offender, entityById, AFFAIR_WALK_IN_RADIUS)) return [];
    return [{ offender, spouse, other: offender === cheater ? paramour : cheater }];
  });
  for (const { offender, spouse, other } of witnessed) {
    // Discovery already passed its probability gate; a witnessed caught event is definitive.
    const spouseName = humanDisplayName(spouse);
    const offenderName = humanDisplayName(offender);
    const otherName = humanDisplayName(other);
    dissolveMarriage(spouse, offender, state.tick);
    startCourtshipCooldown(spouse, RELATIONSHIP_CONFIG.DIVORCE_COURTSHIP_COOLDOWN_DAYS);
    startCourtshipCooldown(offender, RELATIONSHIP_CONFIG.DIVORCE_COURTSHIP_COOLDOWN_DAYS);
    startFeud(state, spouse, other, 35);
    logEvent(state, 'divorce', `${spouseName} divorced ${offenderName} after catching them with ${otherName}`, spouseName);
    addNotification(state, 'Divorce', formatCaughtCheaterDivorceDetail(spouse, offender), 'warning');
    addFloatingText(state, (spouse.x + offender.x) / 2, (spouse.y + offender.y) / 2 - 22, 'Divorced!', '#f97316');
    reassignDivorcedResidences(spouse, offender, buildings, villagers, spouse);
  }
}

function countGuardsAtPrison(humans: Entity[], prison: Building): number {
  return humans.filter(
    (human) =>
      human.alive &&
      !human.faction &&
      human.job === JobType.PrisonGuard &&
      human.workerBuildingId === prison.id &&
      human.prisonBuildingId == null,
  ).length;
}

function caughtAffairRollChance(churchStrength: number, establishedAffair: boolean): number {
  const base = churchStrength >= 1 ? 0.14 : churchStrength > 0 ? 0.10 : 0.08;
  return establishedAffair ? Math.min(0.32, base * 1.6) : base;
}

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
): void {
  if (!shouldLeadAffairPair(cheater, paramour)) return;
  if (onScandalCooldown(cheater, state.tick) || onScandalCooldown(paramour, state.tick)) return;

  if (!intimate) return;
  const walkInAtHome = wouldWalkInOnAffair(cheater, paramour, entityById, buildingById);
  const spousePresent =
    isSpouseNearby(cheater, entityById, AFFAIR_WALK_IN_RADIUS) ||
    isSpouseNearby(paramour, entityById, AFFAIR_WALK_IN_RADIUS);
  if (!spousePresent) return;

  let chance = caughtAffairRollChance(churchStrength, establishedAffair);
  if (walkInAtHome) chance = 1;
  if (personDayRoll(cheater.id, state.tick, 611) < chance) {
    exposeAffair(state, cheater, paramour, 'caught', entityById, buildings, playerHumans);
  }
}

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
  const scandalLoss = dampScandalReputationLoss(reason === 'caught' ? -8 : -4, buildings);
  addReputation(state, scandalLoss);
  const midX = (cheater.x + paramour.x) / 2;
  const midY = (cheater.y + paramour.y) / 2;
  addFloatingText(state, midX, midY - 18, reason === 'caught' ? 'Caught!' : 'Scandal!', '#ef4444');
  logEvent(
    state,
    'scandal',
    reason === 'caught' ? `${who} was caught with ${other}` : `Whispers spread about ${who} and ${other}`,
    who,
  );
  addNotification(state, 'Scandal', `${who} & ${other} — the village is talking`, 'warning');

  if (reason === 'caught') {
    const cheaterOffended = isMarriedScandalOffender(cheater);
    const paramourOffended = isMarriedScandalOffender(paramour);
    tryDivorceOnCaughtCheater(state, cheater, paramour, entityById, buildings, playerHumans);
    arrestForScandal(state, cheater, cheaterOffended);
    arrestForScandal(state, paramour, paramourOffended);
  } else {
    // A rumour reaches the cheated spouse too; they blame the paramour and stay married.
    const spouse = cheater.partnerId != null ? entityById.get(cheater.partnerId) : undefined;
    if (spouse?.alive && spouse.id !== paramour.id) {
      startFeud(state, spouse, paramour, Relationship.SCANDAL_RUMOR_FEUD_SCORE);
    }
  }
}

function countPrisonersAt(state: WorldState, prisonId: number): number {
  return state.entities.filter((e) => e.alive && e.type === EntityType.Human && e.prisonBuildingId === prisonId).length;
}

function isMarriedScandalOffender(entity: Entity): boolean {
  return (
    isMarriedOrExpecting(entity) &&
    entity.partnerId != null
  );
}

const UNGUARDED_PRISON_MESSAGE = 'A scandal went unpunished — the prison has no guard on duty';

/**
 * A caught scandal with nowhere to jail is a dead end the player cannot see: nothing happens, and
 * nothing says why. Report it the first time it matters, then stay quiet.
 */
function reportUnguardedPrison(state: WorldState): void {
  if (state.eventLog.some((event) => event.message === UNGUARDED_PRISON_MESSAGE)) return;
  logEvent(state, 'event', UNGUARDED_PRISON_MESSAGE);
  addNotification(
    state,
    'No prison guard',
    'Scandals cannot be punished until a guard is posted to the prison.',
    'warning',
  );
}

function arrestForScandal(state: WorldState, offender: Entity, marriedAtExposure: boolean): void {
  if (!offender.alive || offender.type !== EntityType.Human) return;
  if (!marriedAtExposure) return;
  // A serving guard keeps the post: three shifts need three guards, so jailing the crew leaves the
  // Prison unguarded — and an unguarded Prison leaks its prisoners. The sentence would undo the post.
  if (offender.job === JobType.PrisonGuard) return;
  const humans = state.entities.filter(isPlayerHuman);
  const prisons = state.buildings.filter(
    (b) => b.completed && b.type === BuildingType.Prison && countGuardsAtPrison(humans, b) > 0,
  );
  if (prisons.length === 0) {
    reportUnguardedPrison(state);
    return;
  }
  const arrestChance = Math.min(0.85, 0.6 + prisons.length * 0.08);
  if (getSimRng('humanRelationships')() >= arrestChance) return;
  // The prisoner slots are what is left after the crew that keeps the doors shut: a prison that cannot
  // seat its guards leaks, so the cap follows the roster's own crew size rather than a magic one.
  const prisonerCap = prisonPrisonerCapacity(BUILDING_CONFIGS[BuildingType.Prison].maxOccupants);
  const prison = prisons.find((b) => countPrisonersAt(state, b.id) < prisonerCap) ?? prisons[0];
  if (countPrisonersAt(state, prison.id) >= prisonerCap && offender.prisonBuildingId == null) return;
  const sentenceDays = 2.5 + getSimRng('humanRelationships')() * 3.5;
  const sentenceTicks = ticksForDays(sentenceDays);
  const newReleaseTick = state.tick + sentenceTicks;

  if (offender.prisonBuildingId != null) {
    if (offender.prisonSentenceCrime === 'scandal') {
      offender.prisonerUntilTick = Math.max(offender.prisonerUntilTick ?? 0, newReleaseTick);
    }
    return;
  }

  // Arrest vacates construction and active work rosters without losing a reserved post.
  for (const site of state.buildings) {
    if ((!site.completed || (site.id === offender.workerBuildingId && site.id !== prison.id))
      && site.occupants.includes(offender.id)) {
      site.occupants = site.occupants.filter((id) => id !== offender.id);
    }
  }
  // The sentence holds the settler's bed and post; only attendance stops while they are jailed.
  offender.prisonBuildingId = prison.id;
  offender.prisonSentenceCrime = 'scandal';
  offender.prisonerUntilTick = newReleaseTick;
  offender.x = prison.x + (getSimRng('humanRelationships')() - 0.5) * 12;
  offender.y = prison.y + (getSimRng('humanRelationships')() - 0.5) * 8;
  offender.vx = 0;
  offender.vy = 0;
  if (!prison.occupants.includes(offender.id)) {
    prison.occupants.push(offender.id);
  }
  const name = humanDisplayName(offender);
  // A real `'prison'` type — not `'event'`, which hides it, and not `'scandal'`, which would
  // inflate the rumour ledger.
  logEvent(state, 'prison', `${name} was imprisoned for scandal`, name);
  addNotification(state, 'Imprisoned', `${name} sentenced for scandal`, 'warning');
  // A jailing is rare (roughly one per eleven days in a mature colony), so a toast that is gone
  // four notifications later is not a notice the player can rely on. This is the card that waits.
  addBigNews(state, '⛓️ Jailed for scandal', `${name} was jailed for ${sentenceDays.toFixed(1)} days.`, 'negative');
  addFloatingText(state, prison.x, prison.y - 20, 'Imprisoned', '#94a3b8');
}

// ============ SOCIAL COURTSHIP ============

/** An observed courtship participant; shift presence is sampled by the human-tick owner. */
interface CourtshipPresence {
  sleeping: boolean;
  onDuty: boolean;
  workplaceId: number | undefined;
  atWorkplace: boolean;
}

/** Only an awake, physically close pair may advance; duty is allowed solely at a shared post. */
export function canAdvanceCourtship(
  first: CourtshipPresence,
  second: CourtshipPresence,
  distancePx: number,
  socialTime: boolean,
): boolean {
  if (first.sleeping || second.sleeping || !Number.isFinite(distancePx) || distancePx > 10) return false;
  if (first.onDuty || second.onDuty) {
    return first.onDuty && second.onDuty
      && first.workplaceId != null
      && first.workplaceId === second.workplaceId
      && first.atWorkplace && second.atWorkplace;
  }
  return socialTime;
}

/** Per-hour courtship pace: full rate in social life, heavily cut on a work shift. */
export function courtshipRatePerHour(socialTime: boolean): number {
  return Relationship.COURTSHIP_BASE_RATE_PER_HOUR
    * (socialTime ? 1 : Relationship.COURTSHIP_WORK_RATE_FACTOR);
}

export /**
 * Whether a settler may court at all — the per-settler half of the courtship gate; the pair half
 * is `isWithinRemarriageBar`, so a divorced pair cannot remarry within a year.
 */
function isEligibleToCourt(entity: Entity): boolean {
  return isAvailableForRomance(entity)
    && entity.age >= HUMAN_ADULT_MIN_AGE && entity.age < HUMAN_MAX_LIFESPAN_YEARS
    && (entity.courtshipCooldownDays ?? 0) <= 0;
}

/** Ticks a divorced pair must stay apart before they may court each other again: one year. */
export const REMARRIAGE_BAR_TICKS = TICKS_PER_DAY * DAYS_PER_YEAR;

/**
 * Whether `entity` is barred from courting `other` because their own marriage to them ended too
 * recently — one year from `pastPartnerTicks`, stamped by the divorce owner.
 */
export function isWithinRemarriageBar(entity: Entity, other: Entity, tick: number): boolean {
  const endedAt = entity.pastPartnerTicks?.[other.id];
  return endedAt != null && tick - endedAt < REMARRIAGE_BAR_TICKS;
}

/** Put a settler out of the courting pool for `COURTSHIP_COOLDOWN_DAYS`, counted down daily. */
function startCourtshipCooldown(entity: Entity, days: number = Relationship.COURTSHIP_COOLDOWN_DAYS): void {
  entity.courtshipCooldownDays = Math.max(entity.courtshipCooldownDays ?? 0, days);
}

/**
 * A courtship is a mutual pair bond, so a settler already courting someone else is not a candidate —
 * except the caller's own current partner, which the mutuality branch re-selects every tick.
 */
function isCourtshipCandidate(entity: Entity, candidate: Entity, tick: number): boolean {
  return (
    isEligibleToCourt(candidate) &&
    (candidate.courtshipPartnerId == null || candidate.courtshipPartnerId === entity.id) &&
    !!candidate.gender &&
    !!entity.gender &&
    candidate.gender !== entity.gender &&
    candidate.id !== entity.id &&
    // A pair who were married before may not court again for a year, on either side's record.
    !isWithinRemarriageBar(entity, candidate, tick) &&
    !isWithinRemarriageBar(candidate, entity, tick)
  );
}

/**
 * Bind a courtship pair (or keep the current one); a **new** partner always starts the shared
 * progress at zero.
 */
export function bindCourtship(entity: Entity, partner: Entity): void {
  if (entity.courtshipPartnerId !== partner.id) {
    entity.courtshipPartnerId = partner.id;
    entity.courtshipProgress = 0;
  }
  if (partner.courtshipPartnerId !== entity.id) {
    partner.courtshipPartnerId = entity.id;
    partner.courtshipProgress = 0;
  }
}

/**
 * Dissolve a courtship that can no longer complete — the mirror of `reconcileYouthLove` for the
 * adult pair bond, clearing the link **and its progress** on both sides.
 */
export function reconcileCourtships(
  ctx: Pick<TickContext, 'entityById' | 'playerHumans'>,
): void {
  // Age existing cooldowns before any pair repair starts a new one. Otherwise
  // the second member of a dissolved pair could lose a day immediately.
  for (const entity of ctx.playerHumans) {
    if ((entity.courtshipCooldownDays ?? 0) > 0) {
      entity.courtshipCooldownDays = (entity.courtshipCooldownDays ?? 0) - 1;
    }
  }
  for (const entity of ctx.playerHumans) {
    const partnerId = entity.courtshipPartnerId;
    if (partnerId == null) continue;
    const partner = getLivingEntity(partnerId, ctx.entityById);
    const partnerIsHowler =
      partner?.type === EntityType.Werewolf && !!partner.moonHowlerCursed;
    if (
      partner &&
      partner.courtshipPartnerId === entity.id &&
      isEligibleToCourt(entity) &&
      (isEligibleToCourt(partner) || partnerIsHowler)
    ) {
      continue;
    }
    entity.courtshipPartnerId = undefined;
    entity.courtshipProgress = 0;
    startCourtshipCooldown(entity);
    if (partner && partner.courtshipPartnerId === entity.id) {
      partner.courtshipPartnerId = undefined;
      partner.courtshipProgress = 0;
      startCourtshipCooldown(partner);
    }
  }
}

export function findCourtshipPartner(
  entity: Entity,
  atHome: boolean,
  courtRange: number,
  humanSocialGrid: EntitySpatialGrid<Entity> | undefined,
  residenceOccupants: Map<number, Entity[]> = new Map(),
  fallbackHumans?: readonly Entity[],
  width?: number,
  height?: number,
  // Defaulted to 0 so a caller that does not care about the divorce bar keeps its argument list; a
  // divorce is always stamped at a tick > 0, so from tick 0 every past marriage is inside the bar.
  tick = 0,
  entityById?: ReadonlyMap<number, Entity>,
  available: (candidate: Entity) => boolean = () => true,
): Entity | undefined {
  const currentCourtship =
    entity.courtshipPartnerId != null
      ? entityById?.get(entity.courtshipPartnerId) ?? fallbackHumans?.find((candidate) => candidate.id === entity.courtshipPartnerId)
      : undefined;
  if (currentCourtship && currentCourtship.courtshipPartnerId === entity.id) {
    // An existing reciprocal bond must be repaired by its owner before a new
    // partner can be selected, even if its current eligibility is invalid.
    return isCourtshipCandidate(entity, currentCourtship, tick) && available(currentCourtship)
      ? currentCourtship : undefined;
  }

  let closest: Entity | undefined;
  let closestDistSq = courtRange * courtRange;
  const considered = new Set<number>();

  const consider = (candidate: Entity, distSq: number) => {
    if (considered.has(candidate.id)) return;
    considered.add(candidate.id);
    if (!isCourtshipCandidate(entity, candidate, tick) || !available(candidate)) return;
    if (distSq > closestDistSq || (distSq === closestDistSq && (!closest || candidate.id >= closest.id))) return;
    closestDistSq = distSq;
    closest = candidate;
  };

  for (const friendId of entity.childhoodFriendsIds ?? []) {
    const friend = entityById?.get(friendId) ?? fallbackHumans?.find((h) => h.id === friendId);
    if (!friend || !friend.alive) continue;
    const dx = friend.x - entity.x;
    const dy = friend.y - entity.y;
    consider(friend, (dx * dx + dy * dy) * 0.25);
  }

  if (atHome && hasResidenceAssignment(entity)) {
    for (const housemate of getHousemates(entity, residenceOccupants)) {
      if (!shareResidence(entity, housemate)) continue;
      const dx = housemate.x - entity.x;
      const dy = housemate.y - entity.y;
      consider(housemate, dx * dx + dy * dy);
    }
  }

  // Rank every local candidate through the same comparator so equal-distance
  // results do not depend on spatial-grid traversal order.
  forEachAdaptiveInRadius(
    humanSocialGrid,
    fallbackHumans ?? [],
    entity.x,
    entity.y,
    courtRange,
    (candidate, distSq) => consider(candidate, distSq),
    socialAdaptiveOptions('social', fallbackHumans?.length ?? 0, width ?? 0, height ?? 0),
  );
  return closest;
}

/** Only free time may lead to an affair: a spouse's distant job never releases this worker. */
export function canPursueSecretAffair(
  entity: Entity,
  hourOfDay: number,
  workplace: Building | undefined,
  _buildings: Building[],
  entityById: Map<number, Entity>,
  tick: number,
  workSchedule: WorkSchedule = getWorkSchedule({ workSchedule: undefined }),
): boolean {
  if (onScandalCooldown(entity, tick)) return false;
  if (isSpouseNearby(entity, entityById, AFFAIR_SPOUSE_BLOCK_RADIUS)) return false;
  // The pre-shift hour belongs to the upcoming commute; the workday belongs to work.
  if (hourOfDay < workSchedule.startHour) return false;
  return allowSocialLifeFor(workSchedule, hourOfDay, workplace != null, tick);
}

/**
 * The in-game hour a settler's daily affair encounter is evaluated at, spread across the settlement
 * by id over the waking day. `personDayRoll` keys on the colony day, not the tick-of-day.
 */
// Deterministic once-daily encounter scheduling, weighted toward free time.
// Weekends include more daytime opportunities; workdays strongly favor evenings.
const WEEKDAY_AFFAIR_HOURS = [8, 12, 16, 17, 18, 18, 19, 19, 20, 20, 21, 22] as const;
const WEEKEND_AFFAIR_HOURS = [9, 10, 11, 12, 14, 16, 17, 18, 18, 19, 20, 21, 22] as const;

export function affairEncounterHourOfDay(entityId: number, tick = 0): number {
  const hours = isWeekend(tick) ? WEEKEND_AFFAIR_HOURS : WEEKDAY_AFFAIR_HOURS;
  const day = getAbsoluteCalendarDay(tick);
  return hours[Math.abs((entityId * 31 + day * 17) % hours.length)];
}

/** Once-per-day affair drift and establishment — owned by humanRelationships. */
export function tryDailyAffairEncounter(
  state: WorldState,
  entity: Entity,
  entityById: Map<number, Entity>,
  buildings: Building[],
  buildingById: Map<number, Building>,
  churchStrength: number,
  hourOfDay: number,
  humanSocialGrid?: EntitySpatialGrid<Entity>,
  playerHumans?: readonly Entity[],
  width?: number,
  height?: number,
): void {
  // The caller matches a whole encounter hour and three ticks share it. Acting only on the hour's
  // first tick keeps the encounter — and its one establishment line — once per settler per day.
  if (!isStartOfClockHour(state.tick)) return;
  const config = SPECIES_CONFIG[EntityType.Human];
  recordRelationshipDiagnostic('affairChecks');
  if (!isPlayerHuman(entity)) return;
  if (entity.prisonBuildingId != null) return;
  if (!isMarriedOrExpecting(entity) || entity.age < HUMAN_ADULT_MIN_AGE) return;
  if (!entity.gender || entity.age >= HUMAN_MAX_LIFESPAN_YEARS) return;
  if (entity.energy <= config.reproductionEnergyThreshold * 0.5) return;
  if (onScandalCooldown(entity, state.tick)) return;
  const workplace = findHumanWorkplace(entity, buildings, { buildingById });
  if (!canPursueSecretAffair(entity, hourOfDay, workplace, buildings, entityById, state.tick, getWorkSchedule(state))) return;

  if (isAtMaritalHome(entity, entityById, buildingById)) return;

  if (entity.affairPartnerId != null) {
    const established = getLivingEntity(entity.affairPartnerId, entityById);
    if (
      established
      && established.affairPartnerId === entity.id
      && shouldLeadAffairPair(entity, established)
      && isValidAffairTrystSite(entity, established, entityById, buildingById, AFFAIR_DAILY_TRYST_RADIUS)
    ) {
      recordAffairTrystSite(entity, established, state, buildingById, entityById);
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
  forEachAdaptiveInRadius(
    humanSocialGrid,
    playerHumans ?? [],
    entity.x,
    entity.y,
    SOCIAL_AFFAIR_RADIUS,
    (human, distSq) => {
      if (human.type !== EntityType.Human || !isPlayerHuman(human)) return;
      considerParamour(human, distSq);
    },
    socialAdaptiveOptions('social', playerHumans?.length ?? 0, width ?? 0, height ?? 0),
  );
  if (!paramour) return;
  if (!isValidAffairTrystSite(entity, paramour, entityById, buildingById, AFFAIR_DAILY_TRYST_RADIUS)) return;
  if (!shouldLeadAffairPair(entity, paramour)) return;

  const R = Relationship;
  const churchPenalty = churchStrength > 0
    ? R.AFFAIR_CHURCH_FLOOR_FACTOR + (1 - churchStrength) * (1 - R.AFFAIR_CHURCH_FLOOR_FACTOR)
    : 1;
  const hasPerformers = state.visitorGroups.some((g) => g.kind === 'performers' && g.daysLeft > 0);
  const festivalMult = state.festival?.active ? R.AFFAIR_FESTIVAL_MULTIPLIER : 1;
  const performerMult = hasPerformers ? R.AFFAIR_PERFORMERS_MULTIPLIER : 1;
  // The cohabitation bonus is about the pair being at the **paramour's** own place, so it reads that
  // residence directly rather than the chosen tryst site (which now prefers the cheater's home).
  const paramourResidence = getParamourResidence(paramour, buildingById);
  const atParamourHome = paramourResidence != null
    && isNearBuilding(entity, paramourResidence, AFFAIR_BUILDING_NEAR_RADIUS)
    && isNearBuilding(paramour, paramourResidence, AFFAIR_BUILDING_NEAR_RADIUS);
  const cohabitMult = atParamourHome ? R.AFFAIR_COHABIT_MULTIPLIER : 1;
  const socialMult = festivalMult * performerMult * cohabitMult;
  const baseChance = churchStrength > 0
    ? R.AFFAIR_DAILY_TRYST_CHANCE_WITH_CHURCH
    : R.AFFAIR_DAILY_TRYST_CHANCE_NO_CHURCH;
  const dailyChance = baseChance * churchPenalty * socialMult;
  if (personDayRoll(entity.id, state.tick, 610) >= dailyChance) return;

  const bump = Math.round(
    (R.AFFAIR_PROGRESS_BUMP_MIN + Math.floor(seededRandomForRun(`affair-bump:${entity.id}:${state.tick}`) * R.AFFAIR_PROGRESS_BUMP_SPAN)) * socialMult,
  );
  entity.affairProgress = Math.min(R.AFFAIR_PROGRESS_MAX, (entity.affairProgress || 0) + bump);
  paramour.affairProgress = Math.min(R.AFFAIR_PROGRESS_MAX, (paramour.affairProgress || 0) + bump);
  recordRelationshipDiagnostic('affairProgressGains');
  recordAffairTrystSite(entity, paramour, state, buildingById, entityById);

  // An established pair re-ran this block on every later successful roll, re-announcing the same
  // affair. Establishment is the transition, so only a pair that is not already each other's logs it.
  const alreadyEstablished =
    entity.affairPartnerId === paramour.id && paramour.affairPartnerId === entity.id;
  if (
    !alreadyEstablished
    && (entity.affairProgress ?? 0) >= R.AFFAIR_PROGRESS_MAX
    && (paramour.affairProgress ?? 0) >= R.AFFAIR_PROGRESS_MAX
  ) {
    entity.affairPartnerId = paramour.id;
    paramour.affairPartnerId = entity.id;
    entity.affairProgress = R.AFFAIR_PROGRESS_MAX;
    paramour.affairProgress = R.AFFAIR_PROGRESS_MAX;
    recordRelationshipDiagnostic('affairsEstablished');
    const who = humanDisplayName(entity);
    const other = humanDisplayName(paramour);
    const line = `${who} ${AFFAIR_ESTABLISHED_LOG_PHRASE} with ${other}`;
    logEvent(state, 'scandal', line, who);
    addNotification(state, 'Affair', line, 'warning', { x: entity.x, y: entity.y });
  }
}

/** Finalize mutual courtship into marriage — owned by humanRelationships. */
export function tryCompleteCourtshipMarriage(  state: WorldState,
  entity: Entity,
  partner: Entity,
  residences: Building[],
  playerHumans: Entity[],
): boolean {
  // Marriage is a mutual transition, not a lower-ID initiated action: courtship advances
  // when the second observed partner is processed, regardless of the couple's ID order.
  if (entity.courtshipPartnerId !== partner.id || partner.courtshipPartnerId !== entity.id) return false;
  if (!entity.gender || !partner.gender || entity.gender === partner.gender) return false;
  if ((entity.courtshipProgress ?? 0) < 100 || (partner.courtshipProgress ?? 0) < 100) return false;
  if (entity.age < HUMAN_ADULT_MIN_AGE || partner.age < HUMAN_ADULT_MIN_AGE) return false;
  if (!isEligibleToCourt(entity) || !isEligibleToCourt(partner)) return false;
  // A pair who were married before must stay apart a year before they can marry again. Checked on
  // both sides, because either partner may be the one whose courtship completes the pair.
  if (isWithinRemarriageBar(entity, partner, state.tick)) return false;
  if (isWithinRemarriageBar(partner, entity, state.tick)) return false;

  entity.relationshipStatus = 'married';
  entity.partnerId = partner.id;
  entity.courtshipPartnerId = undefined;
  entity.courtshipProgress = 0;
  entity.affairPartnerId = undefined;
  entity.affairProgress = 0;
  partner.relationshipStatus = 'married';
  partner.partnerId = entity.id;
  partner.courtshipPartnerId = undefined;
  partner.courtshipProgress = 0;
  partner.affairPartnerId = undefined;
  partner.affairProgress = 0;

  createDeathParticles(
    state,
    (entity.x + partner.x) / 2,
    (entity.y + partner.y) / 2 - 15,
    '#ffd700',
    15,
    'heart',
  );
  addFloatingText(
    state,
    (entity.x + partner.x) / 2,
    (entity.y + partner.y) / 2 - 25,
    'Married!',
    '#ffd700',
  );
  syncMarriageSurnames(entity, partner);
  const married1 = humanDisplayName(entity);
  const married2 = humanDisplayName(partner);
  recordMarriageEvent(state);
  logEvent(state, 'marriage', `${married1} and ${married2} got married`, married1);
  addNotification(state, 'Marriage', `${married1} & ${married2} are now married`, 'success');
  requestDialogue({ eventKey: 'marriage.accepted', speaker: entity, tick: state.tick, durationHours: dialogueHoursFromNominalTicks(8), priority: 'scripted' });
  requestDialogue({ eventKey: 'marriage.accepted', speaker: partner, tick: state.tick, durationHours: dialogueHoursFromNominalTicks(8), priority: 'scripted' });
  syncPartnerResidence(entity, partner, residences, playerHumans);
  return true;
}
