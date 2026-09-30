
import type { WorldState, Entity, Building } from '../gameTypes';
import { EntityType, BuildingType, JobType, BUILDING_CONFIGS, LEADER_OCCUPATION } from '../gameTypes';
import type { TickContext } from './simulationTypes';
import type { EntitySpatialGrid } from '../spatialGrid';
import { SPECIES_CONFIG } from '../speciesConfig';
import { addFloatingText, addNotification, createDeathParticles } from '../simEffects';
import { getValleyIllnessChanceBonus } from '../ecologyStage';
// One owner for "where the building is": `placementUtils.getBuildingCenter` reads `x/y` as the
// footprint **centre**, which is what the pad and sprite are drawn around. This module used to
// export a *second* `getBuildingCenter` that added half a footprint, so every proximity test here
// (`isNearBuilding`, the affair tryst radius and the tryst rendezvous point) measured from a spot
// half a building to the south-east of the building on screen. Importing the owner is the fix; the
// duplicate was deleted rather than corrected so the two can never disagree again.
import { getBuildingCenter } from '../placementUtils';
import {
  HUMAN_ADULT_MIN_AGE,
  HUMAN_MAX_LIFESPAN_YEARS,
  HUMAN_MOVE_OUT_MIN_AGE,
  getColonyDay,
  TICKS_PER_DAY,
  DAYS_PER_YEAR,
  HUMAN_DAILY_ILLNESS_CHANCE,
  HUMAN_DAILY_PREGNANCY_CHANCE_HOME,
  HUMAN_DAILY_PREGNANCY_CHANCE_NEAR,
  HUMAN_DAILY_AFFAIR_PREGNANCY_CHANCE,
  HUMAN_FERTILITY_START,
  NIGHT_END,
  NIGHT_START,
  HUMAN_YOUTH_FERTILITY_END,
  getYouthConceptionMultiplier,
  allowSocialLife,
  hasResidenceAssignment,
  hasWorkAssignment,
  getAbsoluteCalendarDay,
  isNearResidence,
  isResidenceBuilding,
  pickResidenceForHuman,
  pickResidenceForHumanExcluding,
  syncResidenceOccupants,
  syncPartnerResidence,
  killHuman,
  shareResidence,
  shouldBeAtHome,
  getFemaleFertility,
  getOldAgeDeathChance,
  ticksForDays,
  PREGNANCY_TICKS,
} from '../dayCycle';
import { formatCitizenName, formatDeathLog, humanDisplayName } from '../citizenId';
import { dissolveMarriage, formatCaughtCheaterDivorceDetail, syncMarriageSurnames } from '../nameLoader';
import { dampScandalReputationLoss } from '../townHall';
import { getLivingEntity, getHousemates } from '../simQueries';
import { forEachAdaptiveInRadius, findClosestAdaptiveInRadius, socialAdaptiveOptions, SOCIAL_AFFAIR_RADIUS } from '../adaptiveSpatialQuery';
import { isImprisoned } from '../residencyOccupancy';
import { startFeud } from '../relationships';
import { logDeath, logEvent } from '../eventLog';
import { isPlayerHuman } from '../playerHuman';
import { traitMultiplier } from '../settlerTraits';
import { SCHOOL_GRADUATION_DAYS } from '../education';
import { recordRelationshipDiagnostic } from '../relationshipDiagnostics';
import { findHumanWorkplace } from '../workforce';
import { getWorkSchedule, isWorkScheduleHour, type WorkSchedule } from '../workSchedule';
import { sayHumanChatPhrase } from '../humanChat';
import { Relationship } from '../gameConstants';
import { getSimRng, seededRandomForRun } from '../simRng';
import { personDayRoll } from '../dayCycle';
import { addReputation } from '../simHelpers';

export const AFFAIR_SPOUSE_BLOCK_RADIUS = 22;
export const AFFAIR_BUILDING_NEAR_RADIUS = 55;
export const AFFAIR_DAILY_TRYST_RADIUS = 95;

/**
 * The phrase in the affair-establishment chronicle line — the only record that an affair became
 * *real* rather than merely suspicious.
 *
 * It is a constant because it has a reader as well as a writer: `citizenOverview` counts a year's
 * establishments from the event log to report the People screen's "affairs this year". A live affair
 * is short-lived (measured on the engine gate: the instantaneous count averages 0.2 per day and is
 * non-zero on only 35 of 360 days in a year with 93 establishments), so a snapshot alone reads zero
 * almost always and the feature looked absent. Written and read through this one string so the two
 * cannot drift.
 */
export const AFFAIR_ESTABLISHED_LOG_PHRASE = 'began a secret affair';

const RELATIONSHIP_CONFIG = {
  DIVORCE_CAUGHT_CHANCE: 0.7,
  SCANDAL_COOLDOWN_TICKS: TICKS_PER_DAY * 21,
  SCHOOLYARD_BOND_EVERY_DAYS: 5,
  SCHOOLYARD_BOND_MAX_FRIENDS: 3,
} as const;

export function shouldLeadAffairPair(a: Entity, b: Entity): boolean {
  return a.id < b.id;
}

export function affairPairLead(a: Entity, b: Entity): { lead: Entity; other: Entity } {
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
 * The lover this settler is in an **established** mutual affair with, or nothing.
 *
 * Exposure is an established-affair outcome (see `tryDailyAffairGossip`). This used to also
 * return a partner whose progress had merely passed 45, which is what let a rumour fire on a
 * pair that had not established yet.
 */
export function findAffairLover(
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
 * True when the settler is at their marital home *and the spouse is there too*.
 *
 * An empty marital home is a legitimate tryst site — that is exactly how a walk-in
 * becomes possible. Only the occupied home is off limits. The married-paramour branch of
 * `isValidAffairTrystSite` has always worked this way; the cheater's own home was the outlier,
 * which made the walk-in route unreachable.
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
 * True when a spouse physically walks in on the pair.
 *
 * Deliberately **not limited to the marital home** (or to any relationship status beyond "is this
 * settler's spouse on them"): a walk-in is the spouse arriving on the couple wherever the tryst is —
 * the cheater's own home, the paramour's residence, or an outdoor spot. Gating this on the cheater
 * being at their own home was why the caught-in-the-act route stayed unreachable even after the site
 * itself became legal; both sides are checked, so a married paramour's spouse can walk in too.
 */
export function wouldWalkInOnAffair(
  cheater: Entity,
  paramour: Entity,
  entityById: Map<number, Entity>,
  buildingById: Map<number, Building>,
): boolean {
  return spouseIsOn(cheater, entityById, buildingById) || spouseIsOn(paramour, entityById, buildingById);
}

export function isSingleParamour(paramour: Entity): boolean {
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
 * The building an affair pair actually uses: the cheater's own home while it is **empty**, otherwise
 * the paramour's residence.
 *
 * The cheater's home comes first because that is where a couple sneaks off to and where a walk-in can
 * happen (`wouldWalkInOnAffair`); sending every pair to the paramour's residence was why the
 * caught-in-the-act route never fired in practice. An occupied marital home is refused here exactly as
 * `isValidAffairTrystSite` refuses it, and the paramour's place is then the fallback.
 */
export function getAffairTrystBuilding(
  cheater: Entity,
  paramour: Entity,
  entityById: Map<number, Entity>,
  buildingById: Map<number, Building>,
): Building | undefined {
  const maritalHome = cheater.residenceBuildingId != null
    ? buildingById.get(cheater.residenceBuildingId)
    : undefined;
  // "Empty" means the spouse is not *at* the home — the cheater being elsewhere is the normal case, so
  // the test is the spouse's position (`isSpouseAtSharedHome`), not `isMaritalHomeOccupiedBySpouse`
  // (which also requires the cheater to be standing there and would never let them use their own house).
  if (
    maritalHome?.completed
    && isResidenceBuilding(maritalHome)
    && !isSpouseAtSharedHome(cheater, entityById, buildingById)
  ) {
    return maritalHome;
  }
  return getParamourResidence(paramour, buildingById);
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
  hourOfDay?: number,
): boolean {
  if (!cheater.alive || !paramour.alive) return false;

  // An empty marital home is a valid tryst site (the pair uses it while the spouse is
  // out, which is what a walk-in then interrupts). While the spouse is there — or right
  // beside it — the home is refused, exactly like the married-paramour branch below.
  if (isAtMaritalHome(cheater, entityById, buildingById)) {
    if (
      isSpouseNearby(cheater, entityById, intimateDist)
      || isSpouseAtSharedHome(cheater, entityById, buildingById, intimateDist)
    ) {
      return false;
    }
    const maritalHome = buildingById.get(cheater.residenceBuildingId!);
    if (!maritalHome?.completed || !isResidenceBuilding(maritalHome)) return false;
    return isNearBuilding(cheater, maritalHome, intimateDist)
      && isNearBuilding(paramour, maritalHome, intimateDist);
  }

  const trystBuilding = getAffairTrystBuilding(cheater, paramour, entityById, buildingById);
  if (trystBuilding) {
    return isNearBuilding(cheater, trystBuilding, intimateDist) && isNearBuilding(paramour, trystBuilding, intimateDist);
  }

  if (paramour.partnerId != null && isAtMaritalHome(paramour, entityById, buildingById)) {
    if (isSpouseAtSharedHome(paramour, entityById, buildingById, intimateDist)) return false;
    if (hourOfDay != null && shouldBeAtHome(hourOfDay) && isSpouseNearby(paramour, entityById, intimateDist)) {
      return false;
    }
    const residence = paramour.residenceBuildingId != null ? buildingById.get(paramour.residenceBuildingId) : undefined;
    if (!residence?.completed || !isResidenceBuilding(residence)) return false;
    return isNearBuilding(cheater, residence, intimateDist) && isNearBuilding(paramour, residence, intimateDist);
  }

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
  const siteX = trystBuilding ? getBuildingCenter(trystBuilding).x : (entity.x + paramour.x) / 2;
  const siteY = trystBuilding ? getBuildingCenter(trystBuilding).y : (entity.y + paramour.y) / 2;
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
  // Exposure requires an **established** affair. A pair that is still building progress has no
  // affair to expose yet, and `exposeAffair` calls `clearAffairPair`, which resets BOTH partners
  // to 0 — so a rumour rolled on an unestablished pair did not merely embarrass them, it undid
  // the whole climb. The exposure floors used to sit at 45 (church) and 85 (no church), far below
  // the `AFFAIR_PROGRESS_MAX` of 100 that establishment needs, so exposure almost always won:
  // the owner's New Frontier save logged 145 "Whispers spread" and 0 establishments across Y0
  // D198–D279, and the downstream chain (caught-in-the-act, arrest, imprisonment for scandal,
  // the forced divorce, `startFeud`) was therefore unreachable — every one of those gates keys
  // off `hasAffairPartner`, which only establishment sets.
  if (!hasAffairPartner(entity, entityById)) return;
  const lover = findAffairLover(entity, entityById, state.tick);
  if (!lover) return;
  if (!shouldLeadAffairPair(entity, lover)) return;
  if (onScandalCooldown(entity, state.tick) || onScandalCooldown(lover, state.tick)) return;

  // A church does not stop an affair being founded — `AFFAIR_CHURCH_FLOOR_FACTOR` already scales the
  // daily tryst chance down. What it does is make the village talk far sooner, so the church's lever
  // here is how long an established affair survives, not whether it can ever exist.
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
  if (!child.isJuvenile || !isPlayerHuman(child)) return;
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
      const parentName = formatCitizenName(parent);
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
  if (!child.isJuvenile || !isPlayerHuman(child)) return;
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
      e.isJuvenile &&
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

  const friendFriends = friend.childhoodFriendsIds ?? [];
  const nextFriendFriends = [...friendFriends];
  if (!nextFriendFriends.includes(child.id)) {
    nextFriendFriends.push(child.id);
  }
  friend.childhoodFriendsIds = nextFriendFriends.slice(0, RELATIONSHIP_CONFIG.SCHOOLYARD_BOND_MAX_FRIENDS);

  addFloatingText(state, child.x, child.y - 22, '👫 friends', '#fbbf24', 'brief');
  logEvent(
    state,
    'event',
    `${formatCitizenName(child)} and ${formatCitizenName(friend)} became friends at school`,
    child.name,
  );
}

// ============ YOUTHFUL FIRST LOVE LIFECYCLE ============

/**
 * Youngest age a youth-love link may start at.
 *
 * Owner ruling (2026-09-13, re-confirmed 2026-09-16): **12**, not the originally documented 14. The
 * 14–17 band is too narrow for the game's pace, so the feature was a nice one that never happened in
 * play; widening it to 12–17 is what makes it fire. The documents were corrected to 12 — a 2026-09-13
 * audit filed the constant itself as the defect and the finding was withdrawn as intended behaviour
 * (`BUG_REPORTS/2026-09-13-youth-love-min-age-12-lets-12-13-year-olds-enter-youth-lov.md`). Fertility
 * starts at the same age through the mutual youth-love gate, and every adult system stays 18+.
 */
export const YOUTH_LOVE_MIN_AGE = 12;
export const YOUTH_LOVE_MAX_AGE_EXCLUSIVE = HUMAN_MOVE_OUT_MIN_AGE;
/**
 * Largest age difference a youth-love pair may have when it forms — and therefore also how long an
 * existing link may wait past the older partner's 18th birthday for the younger one to come of age
 * (see `reconcileYouthLove`).
 *
 * Owner ruling (2026-09-16): **4**, as the code has always been. The feature document's original
 * "no more than 2 years" made youth love effectively never form in play — the same reasoning as
 * `YOUTH_LOVE_MIN_AGE` above — so the document was the stale artifact and has been corrected; do not
 * "fix" this back to 2.
 */
export const YOUTH_LOVE_MAX_AGE_GAP = 4;
export const YOUTH_LOVE_DAILY_START_CHANCE = 0.0015;
export const YOUTH_LOVE_DAILY_SCHOOL_BONUS = 0.2;
export const YOUTH_LOVE_DAILY_BREAKUP_CHANCE = 0.0004;

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

export function isEligibleForYouthLove(entity: Entity): boolean {
  return (
    isPlayerHuman(entity) &&
    entity.alive &&
    entity.age >= YOUTH_LOVE_MIN_AGE &&
    entity.age < YOUTH_LOVE_MAX_AGE_EXCLUSIVE &&
    entity.prisonBuildingId == null &&
    !entity.pregnant &&
    entity.partnerId == null &&
    entity.relationshipStatus === 'single' &&
    entity.youthLovePartnerId == null &&
    !!entity.gender
  );
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
 * Clear a youth-love link that can no longer be valid — except for the one case where it is the
 * *pending* path to a handoff: an existing pair may outlive the older partner's 18th birthday while
 * the younger one is still 12–17 (`docs/archive/YOUTH_LOVE_FEATURE.md`, "One is 18 and one is 17 →
 * Keep the valid youth link temporarily … Both reach 18 → Hand off to adult courtship"). `advanceYouthLove`
 * promotes the pair on the first pass where both are adults, so the wait ends by itself; it is bounded
 * here by the same age gap that let the pair form, because the younger partner is then at most
 * `YOUTH_LOVE_MAX_AGE_GAP` years from the adult floor.
 *
 * Audit F3: the previous `Math.max(age) > HUMAN_MOVE_OUT_MIN_AGE` clause cleared the link as soon as
 * the older partner turned 19 — the very day a pair one year apart became (19, 18) — so
 * `promoteYouthLoveToCourtship` was unreachable for every pair whose birthdays fall in different
 * years and those pairs were dropped silently instead of "growing up together".
 */
export function reconcileYouthLove(entity: Entity, entityById: Map<number, Entity>): void {
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
    Math.abs(entity.age - partner.age) > YOUTH_LOVE_MAX_AGE_GAP
  ) {
    clearYouthLovePair(entity, partner);
  }
}

function promoteYouthLoveToCourtship(state: WorldState, a: Entity, b: Entity): void {
  const carriedProgress = Math.min(
    70,
    Math.max(25, Math.round(Math.min(a.youthLoveProgress ?? 0, b.youthLoveProgress ?? 0) * 0.7)),
  );
  clearYouthLovePair(a, b);
  a.courtshipPartnerId = b.id;
  b.courtshipPartnerId = a.id;
  a.courtshipProgress = carriedProgress;
  b.courtshipProgress = carriedProgress;
  createDeathParticles(state, (a.x + b.x) / 2, (a.y + b.y) / 2 - 12, '#f9a8d4', 9, 'heart');
  logEvent(
    state,
    'event',
    `${formatCitizenName(a)} and ${formatCitizenName(b)} are growing up together`,
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

  for (const entity of playerHumans) {
    reconcileYouthLove(entity, entityById);
  }

  for (const entity of playerHumans) {
    const partner = entity.youthLovePartnerId != null ? getLivingEntity(entity.youthLovePartnerId, entityById) : undefined;
    if (partner) {
      if (!shouldLeadAffairPair(entity, partner)) continue;
      // Both adults → the documented handoff. A pair retained by `reconcileYouthLove` (one adult, one
      // 12–17) waits here until the younger partner comes of age.
      if (entity.age >= HUMAN_MOVE_OUT_MIN_AGE && partner.age >= HUMAN_MOVE_OUT_MIN_AGE) {
        promoteYouthLoveToCourtship(state, entity, partner);
        continue;
      }
      if (entity.age < YOUTH_LOVE_MIN_AGE || partner.age < YOUTH_LOVE_MIN_AGE) {
        clearYouthLovePair(entity, partner);
        continue;
      }

      const affinity = schoolAffinity(entity, partner);
      const breakupChance = YOUTH_LOVE_DAILY_BREAKUP_CHANCE * (1.45 - affinity * 0.6);
      if (rng() < breakupChance) {
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
          `${formatCitizenName(entity)} and ${formatCitizenName(partner)} grew apart`,
          entity.name,
        );
        continue;
      }

      const progress = 0.55 + affinity * 0.75;
      entity.youthLoveProgress = Math.min(100, (entity.youthLoveProgress ?? 0) + progress);
      partner.youthLoveProgress = Math.min(100, (partner.youthLoveProgress ?? 0) + progress);
      continue;
    }

    if (!isEligibleForYouthLove(entity)) continue;
    const candidate = findClosestAdaptiveInRadius(
      humanSocialGrid,
      playerHumans,
      entity.x,
      entity.y,
      150,
      (other) => isValidYouthLoveTarget(entity, other),
      socialAdaptiveOptions('social', playerHumans.length, width, height),
    );
    if (!candidate || !shouldLeadAffairPair(entity, candidate)) continue;

    const affinity = schoolAffinity(entity, candidate);
    if (rng() >= YOUTH_LOVE_DAILY_START_CHANCE + affinity * YOUTH_LOVE_DAILY_SCHOOL_BONUS) continue;
    entity.youthLovePartnerId = candidate.id;
    candidate.youthLovePartnerId = entity.id;
    entity.youthLoveProgress = 1;
    candidate.youthLoveProgress = 1;
    entity.youthLoveStartedDay = day;
    candidate.youthLoveStartedDay = day;
    createDeathParticles(state, (entity.x + candidate.x) / 2, (entity.y + candidate.y) / 2 - 12, '#f9a8d4', 7, 'heart');
    const sweetheartLine = `${formatCitizenName(entity)} and ${formatCitizenName(candidate)} became sweethearts`;
    logEvent(state, 'event', sweetheartLine, entity.name);
    // Affairs raise a notification card from `exposeAffair`; a new sweetheart pair raised none, so
    // its only trace was one line inside the Chronicle's generic "Events" bucket — 1 531 of the
    // owner's 2 000 entries — which is why it read as "youth love i dont get a message or can see
    // who it are". The pair is named here the same way the affair card names its pair.
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
  if (entity.age < Relationship.AFFAIR_MIN_AGE || target.age < Relationship.AFFAIR_MIN_AGE) return false;
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

/**
 * When this pregnancy is due: `PREGNANCY_TICKS` jittered by ±15 %, drawn from the `humanRelationships`
 * RNG stream on a key of the settler and the tick.
 *
 * One definition for all three conception paths (married, youth love, affair) — the formula used to be
 * restated at each site, so a change to the jitter only ever reached whichever one was edited
 * (`duplicationA.remaining`, A22).
 */
function rollPregnancyDueProgress(entity: Entity, tick: number): number {
  return Math.round(PREGNANCY_TICKS * (0.85 + seededRandomForRun(`pregnancy-due:${entity.id}:${tick}`) * 0.3));
}

function startMarriedPregnancy(state: WorldState, entity: Entity, partner: Entity): void {
  entity.pregnant = true;
  entity.pregnantById = undefined;
  entity.pregnancyProgress = 0;
  entity.pregnancyDueProgress = rollPregnancyDueProgress(entity, state.tick);
  entity.relationshipStatus = 'expecting';
  if (partner.relationshipStatus === 'married' || partner.partnerId === entity.id) {
    partner.relationshipStatus = 'expecting';
  }
  entity.flash = 15;
  partner.flash = 15;
  createDeathParticles(state, entity.x, entity.y - 8, '#ffb6c1', 10, 'heart');
  addFloatingText(state, entity.x, entity.y - 20, 'Expecting!', '#ff69b4');
  const mother = humanDisplayName(entity);
  const father = humanDisplayName(partner);
  const line = `${mother} and ${father} are expecting a child`;
  logEvent(state, 'conception', line, mother);
  addNotification(state, 'Expecting', line, 'success', { x: entity.x, y: entity.y });
}

function startYouthPregnancy(state: WorldState, entity: Entity, partner: Entity): void {
  entity.pregnant = true;
  entity.pregnantById = partner.id;
  entity.pregnancyProgress = 0;
  entity.pregnancyDueProgress = rollPregnancyDueProgress(entity, state.tick);
  entity.flash = 12;
  partner.flash = 12;
  createDeathParticles(state, entity.x, entity.y - 8, '#f9a8d4', 7, 'heart');
  addFloatingText(state, entity.x, entity.y - 20, 'Expecting!', '#ff69b4');
  const mother = humanDisplayName(entity);
  const father = humanDisplayName(partner);
  const line = `${mother} and ${father} are expecting a child`;
  logEvent(state, 'conception', line, mother);
  addNotification(state, 'Expecting', line, 'success', { x: entity.x, y: entity.y });
}

function startAffairPregnancy(state: WorldState, entity: Entity, lover: Entity): void {
  entity.pregnant = true;
  entity.pregnantById = lover.id;
  entity.pregnancyProgress = 0;
  entity.pregnancyDueProgress = rollPregnancyDueProgress(entity, state.tick);
  entity.relationshipStatus = entity.partnerId != null ? 'married' : 'expecting';
  entity.flash = 14;
  lover.flash = 14;
  createDeathParticles(state, entity.x, entity.y - 8, '#f472b6', 8, 'heart');
  addFloatingText(state, entity.x, entity.y - 18, 'Secret…', '#c084fc', 'brief');
  const mother = humanDisplayName(entity);
  const line = `${mother} is secretly expecting a child`;
  logEvent(state, 'scandal', line, mother);
  addNotification(state, 'Secret pregnancy', line, 'warning', { x: entity.x, y: entity.y });
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

  if (!isPlayerHuman(entity)) {
    recordConceptionGate('eligibility');
    return false;
  }
  if (entity.gender !== 'female' || entity.pregnant || entity.reproductionCooldown > 0) {
    recordConceptionGate('eligibility');
    return false;
  }

  if (
    (entity.relationshipStatus === 'married' || entity.relationshipStatus === 'expecting') &&
    entity.partnerId &&
    entity.energy > config.reproductionEnergyThreshold * 0.75
  ) {
    const partner = getLivingEntity(entity.partnerId, ctx.entityById);
    if (partner) {
      const dist = Math.hypot(partner.x - entity.x, partner.y - entity.y);
      const sharesHome = shareResidence(entity, partner);
      const bothAtSharedHome =
        sharesHome && isNearResidence(entity, ctx.buildingById) && isNearResidence(partner, ctx.buildingById);
      const together = dist < 22 || bothAtSharedHome;
      const fertility = getFemaleFertility(entity.age);
      if (together && fertility > 0) {
        const baseChance = bothAtSharedHome ? HUMAN_DAILY_PREGNANCY_CHANCE_HOME : HUMAN_DAILY_PREGNANCY_CHANCE_NEAR;
        if (personDayRoll(entity.id, state.tick, 603) < baseChance * fertility * traitMultiplier(entity, 'lucky', 1.15)) {
          startMarriedPregnancy(state, entity, partner);
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
  } else if ((entity.relationshipStatus === 'married' || entity.relationshipStatus === 'expecting') && entity.partnerId) {
    outcome ??= 'energy';
  }

  const youthPartner = entity.youthLovePartnerId == null ? undefined : getLivingEntity(entity.youthLovePartnerId, ctx.entityById);
  if (
    entity.age >= HUMAN_FERTILITY_START &&
    entity.age < HUMAN_YOUTH_FERTILITY_END &&
    youthPartner &&
    isPlayerHuman(youthPartner) &&
    youthPartner.gender === 'male' &&
    youthPartner.age >= HUMAN_FERTILITY_START &&
    youthPartner.youthLovePartnerId === entity.id &&
    !youthPartner.pregnant
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
        const chance =
          HUMAN_DAILY_PREGNANCY_CHANCE_NEAR * youthMultiplier * fertility * traitMultiplier(entity, 'lucky', 1.15);
        if (personDayRoll(entity.id, state.tick, 604) < chance) {
          startYouthPregnancy(state, entity, youthPartner);
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
    if (lover && isPlayerHuman(lover) && lover.affairPartnerId === entity.id) {
      const tryst = isValidAffairConceptionSite(entity, lover, ctx.entityById, ctx.buildingById, AFFAIR_BUILDING_NEAR_RADIUS);
      const fertility = getFemaleFertility(entity.age);
      if (tryst && fertility > 0) {
        if (personDayRoll(entity.id, state.tick, 605) < HUMAN_DAILY_AFFAIR_PREGNANCY_CHANCE * fertility) {
          startAffairPregnancy(state, entity, lover);
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
    killHuman(entity, buildings, entityById, state.tick);
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
      killHuman(entity, buildings, entityById, state.tick);
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
  const isMarriedOrExpecting =
    (entity.relationshipStatus === 'married' || entity.relationshipStatus === 'expecting') &&
    entity.partnerId != null;
  if (!isMarriedOrExpecting) return;
  if (entity.prisonBuildingId != null) return;
  const spouse = getLivingEntity(entity.partnerId!, entityById);
  if (!spouse || !isPlayerHuman(spouse) || !spouse.alive || spouse.prisonBuildingId != null) return;
  if (!shouldLeadAffairPair(entity, spouse)) return;
  if (rng() >= MARRIAGE_DAILY_AMICABLE_DIVORCE_CHANCE) return;

  dissolveMarriage(entity, spouse);
  startCourtshipCooldown(entity);
  startCourtshipCooldown(spouse);
  if (entity.pregnant) entity.relationshipStatus = 'expecting';
  if (spouse.pregnant) spouse.relationshipStatus = 'expecting';

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

  const wife = a.gender === 'female' ? a : b.gender === 'female' ? b : null;
  const custodian = wife ?? a;
  const leaver = wife ? (a === wife ? b : a) : b;

  const formerHomes = new Set<number>();
  for (const resident of [custodian, leaver]) {
    if (resident.residenceBuildingId != null) {
      formerHomes.add(resident.residenceBuildingId);
    }
  }

  // Evict leaver from the shared home
  if (leaver.residenceBuildingId != null) {
    const oldHome = buildings.find((building) => building.id === leaver.residenceBuildingId);
    if (oldHome) {
      oldHome.occupants = oldHome.occupants.filter((id) => id !== leaver.id);
    }
  }

  if (residences.length === 0) {
    custodian.residenceBuildingId = undefined;
    leaver.residenceBuildingId = undefined;
    return;
  }

  const custodianImprisoned = isImprisoned(custodian);
  if (custodianImprisoned) {
    custodian.residenceBuildingId = undefined;
  } else {
    const custodianHome = custodian.residenceBuildingId != null ? buildings.find((building) => building.id === custodian.residenceBuildingId) : undefined;
    if (!custodianHome || !isResidenceBuilding(custodianHome) || !custodianHome.completed) {
      custodian.residenceBuildingId = pickResidenceForHuman(custodian, villagers, residences);
    }
  }

  if (!isImprisoned(leaver)) {
    const excludeHomes = new Set(formerHomes);
    if (custodian.residenceBuildingId != null) {
      excludeHomes.add(custodian.residenceBuildingId);
    }
    leaver.residenceBuildingId = pickResidenceForHumanExcluding(leaver, villagers, residences, excludeHomes);
  } else {
    leaver.residenceBuildingId = undefined;
  }

  if (!custodianImprisoned && custodian.residenceBuildingId != null) {
    const children = villagers.filter(
      (child) =>
        child.alive &&
        child.isJuvenile &&
        (child.motherId === custodian.id ||
          child.adoptiveMotherId === custodian.id ||
          child.fatherId === custodian.id ||
          child.adoptiveFatherId === custodian.id),
    );
    for (const child of children) {
      child.residenceBuildingId = custodian.residenceBuildingId;
    }
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
  const isCheaterMarried =
    (cheater.relationshipStatus === 'married' || cheater.relationshipStatus === 'expecting') &&
    cheater.partnerId != null;
  if (!isCheaterMarried) return;
  if (!caughtInAct && !isSpouseNearby(cheater, entityById, 40)) return;

  const spouse = getLivingEntity(cheater.partnerId!, entityById);
  if (!spouse) return;
  const divorceChance = caughtInAct ? 1 : RELATIONSHIP_CONFIG.DIVORCE_CAUGHT_CHANCE;
  if (personDayRoll(cheater.id, state.tick, 608) >= divorceChance) return;

  dissolveMarriage(spouse, cheater);
  startCourtshipCooldown(spouse);
  startCourtshipCooldown(cheater);
  if (cheater.pregnant) cheater.relationshipStatus = 'expecting';
  if (spouse.pregnant) spouse.relationshipStatus = 'expecting';
  startFeud(state, spouse, paramour, 35);

  const spouseName = humanDisplayName(spouse);
  const cheaterName = humanDisplayName(cheater);
  const otherName = humanDisplayName(paramour);
  logEvent(
    state,
    'divorce',
    `${spouseName} divorced ${cheaterName} after catching them with ${otherName}`,
    spouseName,
  );
  addNotification(state, 'Divorce', formatCaughtCheaterDivorceDetail(spouse, cheater), 'warning');
  addFloatingText(state, (spouse.x + cheater.x) / 2, (spouse.y + cheater.y) / 2 - 22, 'Divorced!', '#f97316');

  const villagers = playerHumans.filter(isPlayerHuman);
  reassignDivorcedResidences(spouse, cheater, buildings, villagers);

  const isParamourMarried =
    (paramour.relationshipStatus === 'married' || paramour.relationshipStatus === 'expecting') &&
    paramour.partnerId != null;
  if (isParamourMarried) {
    const paramourSpouse = getLivingEntity(paramour.partnerId!, entityById);
    const paramourSpousePresent = caughtInAct || isSpouseNearby(paramour, entityById, 40);
    const paramourDivorceChance = caughtInAct ? 1 : RELATIONSHIP_CONFIG.DIVORCE_CAUGHT_CHANCE;
    if (paramourSpouse && paramourSpousePresent && personDayRoll(paramour.id, state.tick, 609) < paramourDivorceChance) {
      dissolveMarriage(paramourSpouse, paramour);
      if (paramour.pregnant) paramour.relationshipStatus = 'expecting';
      if (paramourSpouse.pregnant) paramourSpouse.relationshipStatus = 'expecting';
      logEvent(
        state,
        'divorce',
        `${humanDisplayName(paramourSpouse)} divorced ${humanDisplayName(paramour)} after catching them with ${humanDisplayName(cheater)}`,
        humanDisplayName(paramourSpouse),
      );
      addNotification(state, 'Divorce', formatCaughtCheaterDivorceDetail(paramourSpouse, paramour), 'warning');
      reassignDivorcedResidences(paramourSpouse, paramour, buildings, villagers);
    }
  }
}

function countGuardsAtPrison(humans: Entity[], prison: Building): number {
  return humans.filter(
    (human) =>
      human.alive &&
      !human.faction &&
      human.job === JobType.PrisonGuard &&
      human.homeBuildingId === prison.id &&
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
  if (getSimRng('humanRelationships')() < chance) {
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
    arrestForScandal(state, cheater);
    arrestForScandal(state, paramour);
    tryDivorceOnCaughtCheater(state, cheater, paramour, entityById, buildings, playerHumans, true);
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
    (entity.relationshipStatus === 'married' || entity.relationshipStatus === 'expecting') &&
    entity.partnerId != null
  );
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
  if (getSimRng('humanRelationships')() >= arrestChance) return;
  const prisonerCap = Math.max(1, BUILDING_CONFIGS[BuildingType.Prison].maxOccupants - 1);
  const prison = prisons.find((b) => countPrisonersAt(state, b.id) < prisonerCap) ?? prisons[0];
  if (countPrisonersAt(state, prison.id) >= prisonerCap && offender.prisonBuildingId == null) return;
  const sentenceTicks = ticksForDays(2.5 + getSimRng('humanRelationships')() * 3.5);
  const newReleaseTick = state.tick + sentenceTicks;

  if (offender.prisonBuildingId != null) {
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
    offender.occupation = offender.occupation === LEADER_OCCUPATION ? LEADER_OCCUPATION : 'settler';
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
  offender.x = prison.x + (getSimRng('humanRelationships')() - 0.5) * 12;
  offender.y = prison.y + (getSimRng('humanRelationships')() - 0.5) * 8;
  offender.vx = 0;
  offender.vy = 0;
  if (!prison.occupants.includes(offender.id)) {
    prison.occupants.push(offender.id);
  }
  const name = humanDisplayName(offender);
  // A real `'prison'` type, not `'event'` (which buried it in the generic Events bucket and left the
  // owner unable to find it) and not `'scandal'` (which would inflate the scandal count and pull
  // imprisonments into the rumour ledger, whose `SOURCE_KINDS` reads that type).
  logEvent(state, 'prison', `${name} was imprisoned for scandal`, name);
  addNotification(state, 'Imprisoned', `${name} sentenced for scandal`, 'warning');
  addFloatingText(state, prison.x, prison.y - 20, 'Imprisoned', '#94a3b8');
}

// ============ SOCIAL COURTSHIP ============

/** Per-hour courtship pace: full rate in social life, heavily cut on a work shift. */
export function courtshipRatePerHour(socialTime: boolean): number {
  return Relationship.COURTSHIP_BASE_RATE_PER_HOUR
    * (socialTime ? 1 : Relationship.COURTSHIP_WORK_RATE_FACTOR);
}

export function isEligibleToCourt(entity: Entity): boolean {
  return (
    isPlayerHuman(entity) &&
    entity.alive &&
    !entity.isJuvenile &&
    !entity.pregnant &&
    entity.prisonBuildingId == null &&
    entity.partnerId == null &&
    entity.youthLovePartnerId == null &&
    entity.relationshipStatus === 'single' &&
    (entity.courtshipCooldownDays ?? 0) <= 0 &&
    entity.age >= HUMAN_ADULT_MIN_AGE &&
    entity.age < HUMAN_MAX_LIFESPAN_YEARS
  );
}

/** Put a settler out of the courting pool for `COURTSHIP_COOLDOWN_DAYS`, counted down daily. */
export function startCourtshipCooldown(entity: Entity): void {
  entity.courtshipCooldownDays = Relationship.COURTSHIP_COOLDOWN_DAYS;
}

/**
 * A courtship is a mutual pair bond, so a settler who is already courting someone else is not a
 * candidate — except for the caller's own current partner, which the mutuality branch in
 * `findCourtshipPartner` re-selects every tick. Audit F5: without the exclusivity test a third
 * settler could take an already-courting partner, orphaning the previous link and its progress.
 */
function isCourtshipCandidate(entity: Entity, candidate: Entity): boolean {
  return (
    isEligibleToCourt(candidate) &&
    (candidate.courtshipPartnerId == null || candidate.courtshipPartnerId === entity.id) &&
    !!candidate.gender &&
    !!entity.gender &&
    candidate.gender !== entity.gender &&
    candidate.id !== entity.id
  );
}

/**
 * Bind a courtship pair (or keep the current one). A **new** partner always starts the shared
 * progress at zero — audit F5: the progress used to carry over from whoever the settler courted
 * before, so a fresh pair could begin at 60 % while an abandoned pair kept its own value.
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
 * Dissolve a courtship that can no longer complete — the mirror of `reconcileYouthLove` for the adult
 * pair bond, and the guard that makes courtship exclusivity safe. A link is valid only while both
 * settlers could still court each other (alive, single, unpartnered, adult, not imprisoned or
 * pregnant) and both sides name each other; anything else clears the link **and its progress** on
 * both sides, so no settler is locked out of courting by a partner who moved on and no heart badge
 * survives a courtship that does not exist. Runs daily from `tickLayerDaily`.
 */
export function reconcileCourtships(
  ctx: Pick<TickContext, 'entityById' | 'playerHumans'>,
): void {
  for (const entity of ctx.playerHumans) {
    // Count the post-courtship cooldown down once per colony day.
    if ((entity.courtshipCooldownDays ?? 0) > 0) {
      entity.courtshipCooldownDays = (entity.courtshipCooldownDays ?? 0) - 1;
    }
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
  humanSocialGrid: EntitySpatialGrid | undefined,
  residenceOccupants: Map<number, Entity[]>,
  fallbackHumans?: readonly Entity[],
  width?: number,
  height?: number,
): Entity | undefined {
  const currentCourtship =
    entity.courtshipPartnerId != null
      ? fallbackHumans?.find((candidate) => candidate.id === entity.courtshipPartnerId)
      : undefined;
  if (
    currentCourtship &&
    currentCourtship.courtshipPartnerId === entity.id &&
    isCourtshipCandidate(entity, currentCourtship)
  ) {
    return currentCourtship;
  }

  let closest: Entity | undefined;
  let closestDistSq = courtRange * courtRange;

  const consider = (candidate: Entity, distSq: number) => {
    if (!isCourtshipCandidate(entity, candidate)) return;
    if (distSq >= closestDistSq) return;
    closestDistSq = distSq;
    closest = candidate;
  };

  for (const friendId of entity.childhoodFriendsIds ?? []) {
    const friend = fallbackHumans?.find((h) => h.id === friendId);
    if (!friend || !friend.alive) continue;
    if (!isCourtshipCandidate(entity, friend)) continue;
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

/** Affairs can run off-duty or during work when spouses are at separate job sites. */
export function canPursueSecretAffair(
  entity: Entity,
  hourOfDay: number,
  workplace: Building | undefined,
  buildings: Building[],
  entityById: Map<number, Entity>,
  tick: number,
  workSchedule: WorkSchedule = getWorkSchedule({ workSchedule: undefined }),
): boolean {
  if (onScandalCooldown(entity, tick)) return false;
  if (isSpouseNearby(entity, entityById, AFFAIR_SPOUSE_BLOCK_RADIUS)) return false;
  if (allowSocialLife(hourOfDay, workplace != null)) return true;
  if (!isWorkScheduleHour(workSchedule, hourOfDay) || entity.partnerId == null) return false;

  const spouse = getLivingEntity(entity.partnerId, entityById);
  if (!spouse) return true;
  if (!hasWorkAssignment(spouse)) return true;

  const spouseJob = findHumanWorkplace(spouse, buildings);
  if (!spouseJob) return true;
  if (workplace && spouseJob.id !== workplace.id) return true;
  return Math.hypot(spouse.x - entity.x, spouse.y - entity.y) > 58;
}

/**
 * The in-game hour a settler's once-per-day affair encounter is evaluated at, spread across the
 * settlement by id over the **waking day** (06:00–19:00, derived from the owner's own `NIGHT_END` /
 * `NIGHT_START`; settlers sleep 23:00–06:00, so midnight is inside the sleep window).
 *
 * The encounter used to run on the global `isNewCalendarDayTick` gate — tick-of-day 0, i.e.
 * **midnight for everyone, at once** — and at midnight it could not pass its own gates.
 * `canPursueSecretAffair` returns false on `isSpouseNearby` (22 px), which is true for a housed
 * couple asleep in the same room, and `isAtMaritalHome` is true besides. Establishment is written
 * nowhere else (`tests/affair.cadence.test.ts`: "the daily owner is the sole establisher"), so in a
 * well-housed village no affair could ever complete: New Frontier — 453 settlers, a church — logged
 * **145 "Whispers spread" and 0 "began a secret affair"** across Y0 D198–D279.
 *
 * Staggering costs nothing in probability, which is why it is the whole fix: `personDayRoll` hashes
 * `(entity, colony day, salt)` and **not** the tick-of-day, so a settler evaluated once per day at
 * their own waking hour still gets exactly one roll at exactly the same chance. Only the hour the
 * conditions are sampled at changes. `decisionRegistry` already declares this cadence as
 * "staggered/daily"; the implementation was the part that was not staggered.
 */
const AFFAIR_ENCOUNTER_FIRST_HOUR = NIGHT_END; // 06:00 — the waking boundary the code already owns
const AFFAIR_ENCOUNTER_LAST_HOUR = NIGHT_START - 1; // 19:00 — last hour before `isNightHour` begins
const AFFAIR_ENCOUNTER_HOUR_COUNT = AFFAIR_ENCOUNTER_LAST_HOUR - AFFAIR_ENCOUNTER_FIRST_HOUR + 1;

export function affairEncounterHourOfDay(entityId: number): number {
  return AFFAIR_ENCOUNTER_FIRST_HOUR + (Math.abs(entityId) % AFFAIR_ENCOUNTER_HOUR_COUNT);
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
  humanSocialGrid?: EntitySpatialGrid,
  playerHumans?: readonly Entity[],
  width?: number,
  height?: number,
): void {
  const config = SPECIES_CONFIG[EntityType.Human];
  recordRelationshipDiagnostic('affairChecks');
  if (!isPlayerHuman(entity)) return;
  if (entity.prisonBuildingId != null) return;
  if ((entity.relationshipStatus !== 'married' && entity.relationshipStatus !== 'expecting') || entity.isJuvenile) return;
  if (!entity.gender || entity.age < Relationship.AFFAIR_MIN_AGE || entity.age >= HUMAN_MAX_LIFESPAN_YEARS) return;
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
  recordAffairTrystSite(entity, paramour, state, buildingById);

  if (
    (entity.affairProgress ?? 0) >= R.AFFAIR_PROGRESS_MAX
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
export function tryCompleteCourtshipMarriage(
  state: WorldState,
  entity: Entity,
  partner: Entity,
  residences: Building[],
  playerHumans: Entity[],
): boolean {
  if (entity.id >= partner.id) return false;
  if (!entity.gender || !partner.gender || entity.gender === partner.gender) return false;
  if ((entity.courtshipProgress ?? 0) < 100 || (partner.courtshipProgress ?? 0) < 100) return false;
  if (entity.age < HUMAN_MOVE_OUT_MIN_AGE || partner.age < HUMAN_MOVE_OUT_MIN_AGE) return false;
  if (!isEligibleToCourt(entity) || !isEligibleToCourt(partner)) return false;

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
  logEvent(state, 'marriage', `${married1} and ${married2} got married`, married1);
  addNotification(state, 'Marriage', `${married1} & ${married2} are now married`, 'success');
  sayHumanChatPhrase(entity, 'Yes!', 8);
  sayHumanChatPhrase(partner, 'Yes!', 8);
  syncPartnerResidence(entity, partner, residences, playerHumans);
  return true;
}
