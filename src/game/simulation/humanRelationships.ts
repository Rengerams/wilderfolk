
import type { WorldState, Entity, Building } from '../gameTypes';
import { EntityType, BuildingType, JobType, BUILDING_CONFIGS, LEADER_OCCUPATION } from '../gameTypes';
import type { TickContext } from './simulationTypes';
import type { EntitySpatialGrid } from '../spatialGrid';
import { SPECIES_CONFIG } from '../speciesConfig';
import { addFloatingText, addNotification, createDeathParticles } from '../simEffects';
import { getValleyIllnessChanceBonus } from '../ecologyStage';
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

export const AFFAIR_SPOUSE_BLOCK_RADIUS = 22;
export const AFFAIR_BUILDING_NEAR_RADIUS = 55;
export const AFFAIR_DAILY_TRYST_RADIUS = 95;

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
  const residence = paramour.residenceBuildingId != null ? buildingById.get(paramour.residenceBuildingId) : undefined;
  if (!residence?.completed || !isResidenceBuilding(residence)) return undefined;
  return residence;
}

export function getBuildingCenter(building: Building): { x: number; y: number } {
  return { x: building.x + building.width / 2, y: building.y + building.height / 2 };
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
  if (isAtMaritalHome(cheater, entityById, buildingById)) return false;

  const trystBuilding = getAffairTrystBuilding(cheater, paramour, buildingById);
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
): void {
  if (!shouldLeadAffairPair(entity, paramour)) return;
  const siteDay = getColonyDay(state);
  const trystBuilding = buildingById ? getAffairTrystBuilding(entity, paramour, buildingById) : undefined;
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
  playerHumans: readonly Entity[],
  humanSocialGrid?: EntitySpatialGrid,
  width?: number,
  height?: number,
): void {
  recordRelationshipDiagnostic('gossipChecks');
  const lover = findAffairLover(entity, entityById, state.tick, humanSocialGrid, playerHumans, width, height);
  if (!lover) return;
  if (!shouldLeadAffairPair(entity, lover)) return;
  if (onScandalCooldown(entity, state.tick) || onScandalCooldown(lover, state.tick)) return;

  if (
    (entity.pregnant && entity.pregnantById === lover.id) ||
    (lover.pregnant && lover.pregnantById === entity.id)
  ) {
    return;
  }

  if (churchStrength <= 0) {
    if ((entity.affairProgress ?? 0) < 85 && (lover.affairProgress ?? 0) < 85) return;
    if (personDayRoll(entity.id, state.tick, 601) < 0.06) {
      if (isValidAffairTrystSite(entity, lover, entityById, buildingById, AFFAIR_DAILY_TRYST_RADIUS)) {
        recordAffairTrystSite(entity, lover, state, buildingById);
      }
      // Daily gossip can only produce a *rumour*. "Caught in the act" is a spatial event,
      // owned by `tryExposeCaughtAffair`, which requires the spouse (or a walk-in at the
      // marital home) to be physically present. This path used to mint a 'caught' verdict
      // from a flat roll, so an unwitnessed tryst was reported as caught — which arrests
      // both partners and forces a divorce.
      exposeAffair(state, entity, lover, 'rumor', entityById, buildings, playerHumans);
      recordRelationshipDiagnostic('scandalExposures');
    }
    return;
  }

  if (entity.affairPartnerId == null && ((entity.affairProgress ?? 0) < 45 || (lover.affairProgress ?? 0) < 45)) {
    return;
  }

  const chance = churchStrength >= 1 ? 0.22 : 0.12;
  if (personDayRoll(entity.id, state.tick, 602) < chance) {
    if (isValidAffairTrystSite(entity, lover, entityById, buildingById, AFFAIR_DAILY_TRYST_RADIUS)) {
      recordAffairTrystSite(entity, lover, state, buildingById);
    }
    // Rumour only — see the note in the no-church branch above.
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
  rng: () => number = Math.random,
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

export function tryFormSchoolyardBond(state: WorldState, child: Entity, rng: () => number = Math.random): void {
  if (!child.isJuvenile || !isPlayerHuman(child)) return;
  const day = getAbsoluteCalendarDay(state.tick);
  if (child.schoolBondDay === day) return;
  const schoolDays = child.schoolDays ?? 0;
  if (schoolDays === 0 || schoolDays % RELATIONSHIP_CONFIG.SCHOOLYARD_BOND_EVERY_DAYS !== 0) return;
  child.schoolBondDay = day;

  const friends = child.childhoodFriendsIds ?? [];
  if (friends.length >= RELATIONSHIP_CONFIG.SCHOOLYARD_BOND_MAX_FRIENDS) return;

  // Classmates must be alive, juveniles, not self, not already friends, and have room for a new friend
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

  // Safe symmetric push with absolute deduplication
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

export const YOUTH_LOVE_MIN_AGE = 12;
export const YOUTH_LOVE_MAX_AGE_EXCLUSIVE = HUMAN_MOVE_OUT_MIN_AGE;
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
    Math.abs(entity.age - partner.age) > YOUTH_LOVE_MAX_AGE_GAP ||
    Math.max(entity.age, partner.age) > HUMAN_MOVE_OUT_MIN_AGE
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
  rng: () => number = Math.random,
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
    logEvent(
      state,
      'event',
      `${formatCitizenName(entity)} and ${formatCitizenName(candidate)} became sweethearts`,
      entity.name,
    );
  }
}

// ============ REPRODUCTION CONCEPTION & DEATH TICKS ============

export function isValidAffairTarget(entity: Entity, target: Entity, tick: number): boolean {
  if (!isPlayerHuman(target) || !target.alive || !target.gender) return false;
  if (entity.prisonBuildingId != null || target.prisonBuildingId != null) return false;
  if (!entity.gender || target.gender === entity.gender || target.id === entity.id) return false;
  if (target.id === entity.partnerId || entity.id === target.partnerId) return false;
  // Affairs are adult-only on BOTH sides (Relationship.AFFAIR_MIN_AGE): ages 12–17
  // belong to the youth-love phase, whose mutual gate is the only conception route.
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

function startMarriedPregnancy(state: WorldState, entity: Entity, partner: Entity): void {
  entity.pregnant = true;
  entity.pregnantById = undefined;
  entity.pregnancyProgress = 0;
  entity.pregnancyDueProgress = Math.round(PREGNANCY_TICKS * (0.85 + seededRandomForRun(`pregnancy-due:${entity.id}:${state.tick}`) * 0.3));
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
  entity.pregnancyDueProgress = Math.round(PREGNANCY_TICKS * (0.85 + seededRandomForRun(`pregnancy-due:${entity.id}:${state.tick}`) * 0.3));
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
  entity.pregnancyDueProgress = Math.round(PREGNANCY_TICKS * (0.85 + seededRandomForRun(`pregnancy-due:${entity.id}:${state.tick}`) * 0.3));
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
    entity.relationshipStatus === 'married' &&
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
  } else if (entity.relationshipStatus === 'married' && entity.partnerId) {
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
  rng: () => number = Math.random,
): void {
  if (!isPlayerHuman(entity) || !entity.alive) return;
  if (entity.relationshipStatus !== 'married' || entity.partnerId == null) return;
  if (entity.prisonBuildingId != null) return;
  const spouse = getLivingEntity(entity.partnerId, entityById);
  if (!spouse || !isPlayerHuman(spouse) || !spouse.alive || spouse.prisonBuildingId != null) return;
  if (entity.pregnant || spouse.pregnant) return;
  if (!shouldLeadAffairPair(entity, spouse)) return;
  if (rng() >= MARRIAGE_DAILY_AMICABLE_DIVORCE_CHANCE) return;

  dissolveMarriage(entity, spouse);
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

  // An imprisoned settler holds no residence and cannot take custody — the
  // residency owner clears the residence when a settler is jailed, so re-housing
  // the prisoner here (or moving minors into that home) would resurrect it.
  const custodianImprisoned = isImprisoned(custodian);
  if (custodianImprisoned) {
    custodian.residenceBuildingId = undefined;
  } else {
    // Ensure custodian holds a valid completed home
    const custodianHome = custodian.residenceBuildingId != null ? buildings.find((building) => building.id === custodian.residenceBuildingId) : undefined;
    if (!custodianHome || !isResidenceBuilding(custodianHome) || !custodianHome.completed) {
      custodian.residenceBuildingId = pickResidenceForHuman(custodian, villagers, residences);
    }
  }

  // Relocate leaver (never back into former home or custodian's home)
  if (!isImprisoned(leaver)) {
    const excludeHomes = new Set(formerHomes);
    if (custodian.residenceBuildingId != null) {
      excludeHomes.add(custodian.residenceBuildingId);
    }
    leaver.residenceBuildingId = pickResidenceForHumanExcluding(leaver, villagers, residences, excludeHomes);
  } else {
    leaver.residenceBuildingId = undefined;
  }

  // Assign minors to custody-holding parent (custodian, checking both mother and father links)
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

  // Safe rebuild of all residence occupants lists
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
  if (!caughtInAct && !isSpouseNearby(cheater, entityById, 40)) return;

  const spouse = getLivingEntity(cheater.partnerId, entityById);
  if (!spouse) return;
  const divorceChance = caughtInAct ? 1 : RELATIONSHIP_CONFIG.DIVORCE_CAUGHT_CHANCE;
  if (personDayRoll(cheater.id, state.tick, 608) >= divorceChance) return;

  dissolveMarriage(spouse, cheater);
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

  if (paramour.relationshipStatus === 'married' && paramour.partnerId != null) {
    const paramourSpouse = getLivingEntity(paramour.partnerId, entityById);
    const paramourSpousePresent = caughtInAct || isSpouseNearby(paramour, entityById, 40);
    const paramourDivorceChance = caughtInAct ? 1 : RELATIONSHIP_CONFIG.DIVORCE_CAUGHT_CHANCE;
    if (paramourSpouse && paramourSpousePresent && personDayRoll(paramour.id, state.tick, 609) < paramourDivorceChance) {
      dissolveMarriage(paramourSpouse, paramour);
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

/**
 * `hasStaffedPrison` and `pickAffairExposureReason` were removed with the daily gossip
 * fix: the reason is no longer rolled, because the daily path may only produce a rumour
 * and the caught-in-the-act verdict belongs to `tryExposeCaughtAffair`, which already
 * requires the spouse (or a walk-in) to be physically present.
 */

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
  hourOfDay: number,
): void {
  if (!shouldLeadAffairPair(cheater, paramour)) return;
  if (onScandalCooldown(cheater, state.tick) || onScandalCooldown(paramour, state.tick)) return;

  if (!intimate) return;
  const walkInAtHome = wouldWalkInOnMaritalAffair(cheater, entityById, buildingById, hourOfDay);
  const spousePresent =
    isSpouseNearby(cheater, entityById, AFFAIR_SPOUSE_BLOCK_RADIUS) ||
    isSpouseNearby(paramour, entityById, AFFAIR_SPOUSE_BLOCK_RADIUS) ||
    walkInAtHome;
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
  const scandalLoss = dampScandalReputationLoss(reason === 'caught' ? -8 : -4, buildings);
  state.villageReputation = Math.max(0, state.villageReputation + scandalLoss);
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
  }
}

function countPrisonersAt(state: WorldState, prisonId: number): number {
  return state.entities.filter((e) => e.alive && e.type === EntityType.Human && e.prisonBuildingId === prisonId).length;
}

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
  logEvent(state, 'event', `${name} was imprisoned for scandal`, name);
  addNotification(state, 'Imprisoned', `${name} sentenced for scandal`, 'warning');
  addFloatingText(state, prison.x, prison.y - 20, 'Imprisoned', '#94a3b8');
}

// ============ SOCIAL COURTSHIP ============

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
    entity.age >= HUMAN_ADULT_MIN_AGE &&
    entity.age < HUMAN_MAX_LIFESPAN_YEARS
  );
}

function isCourtshipCandidate(entity: Entity, candidate: Entity): boolean {
  return (
    isEligibleToCourt(candidate) &&
    !!candidate.gender &&
    !!entity.gender &&
    candidate.gender !== entity.gender &&
    candidate.id !== entity.id
  );
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
  if (entity.relationshipStatus !== 'married' || entity.pregnant || entity.isJuvenile) return;
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
  const trystBuilding = getAffairTrystBuilding(entity, paramour, buildingById);
  const atParamourHome = trystBuilding != null
    && isNearBuilding(entity, trystBuilding, AFFAIR_BUILDING_NEAR_RADIUS)
    && isNearBuilding(paramour, trystBuilding, AFFAIR_BUILDING_NEAR_RADIUS);
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
    const line = `${who} began a secret affair with ${other}`;
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
  // 8 ticks (~2.5 in-game hours) celebration prevents blocking character dialogue for 40 hours
  sayHumanChatPhrase(entity, 'Yes!', 8);
  sayHumanChatPhrase(partner, 'Yes!', 8);
  syncPartnerResidence(entity, partner, residences, playerHumans);
  return true;
}
