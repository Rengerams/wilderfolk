import { HUMAN_ADULT_MIN_AGE } from './daycycleconstants';
import type { ElectionCeremonyPhase, ElectionCeremonyState, Entity, WorldState } from './gameTypes';
import { maybeOfferValleyDebate } from './storyEvents';
import { recordElectionPromises } from './electionPromises';
import { BuildingType, EntityType } from './gameTypes';
import { DAYS_PER_YEAR, getAgeInYears, TICKS_PER_HOUR } from './dayCycle';
import { isImprisoned } from './housingModel';
import { displayYear } from './dayCycleClock';
import { logEvent } from './eventLog';
import { addNotification } from './simEffects';
import { isPlayerHuman } from './playerHuman';
import { requestDialogue, dialogueHoursFromNominalTicks } from './dialogueTrees';
import { ensureEntitySkills } from './skills';
import { simulateElectionVotes } from './electionVotes';
import { applyLeaderOccupation, syncLeaderHouseResidency } from './leaderHouse';
import { findPlayerTownHall } from './playerTownHall';
import { seededRandomForRun } from './simRng';
import { humanDisplayName } from './citizenId';
import { friendCount, isMarriedOrExpecting, MAX_CLOSE_FRIENDS_PER_SETTLER, startFeud } from './relationships';
import { getEcosystemHealth } from './dailyEcology';
import { computeDynasties } from './familyLegacy';

/**
 * Years between scheduled (end-of-term) elections. 2 keeps a play session within a few terms, so a
 * campaign contains several elections.
 */
export const ELECTION_INTERVAL_YEARS = 2;
/** 1/6 year = two in-game months between a vacancy and the succession election. */
export const VACANCY_ELECTION_DELAY_YEARS = 1 / 6;
export const ELECTION_PARTY_DAYS: number = 1;
export const ELECTION_PARTY_NAME = 'Election Revelry';

/** Feud score the strongest loser opens against the winner — at most one per election. */
const ELECTION_LOSS_FEUD_SCORE = 30;

// Months are a display division of the canonical year (`gameConstants.Time.DAYS_PER_YEAR`), not a
// second calendar.
const MONTHS_PER_YEAR = 12;

/**
 * A ceremony is one in-game day: `humanTick` holds every eligible adult at its ring slot for as long
 * as the ceremony is live, so a longer one would stop the village working and eating.
 */
const CEREMONY_GATHERING_HOURS = 8;
const CEREMONY_GOSSIP_HOURS = 10;
const CEREMONY_TENSION_HOURS = 6;

function getPhaseTicks(phase: 'gathering' | 'gossip' | 'tension'): number {
  switch (phase) {
    case 'gathering':
      return CEREMONY_GATHERING_HOURS * TICKS_PER_HOUR;
    case 'gossip':
      return CEREMONY_GOSSIP_HOURS * TICKS_PER_HOUR;
    case 'tension':
      return CEREMONY_TENSION_HOURS * TICKS_PER_HOUR;
  }
}

/**
 * Why a leadership election is being held: `term` is the scheduled end of a normal term, every
 * `ELECTION_INTERVAL_YEARS` years.
 */
export type LeadershipElectionReason = 'founding' | 'term' | 'succession';
export type { ElectionCeremonyPhase, ElectionCeremonyState } from './gameTypes';

export interface LeadershipScoreBreakdown {
  entityId: number;
  name: string;
  totalScore: number;
  skillPoints: number;
  experiencePoints: number;
  battlePoints: number;
  familyPoints: number;
  promisePoints: number;
  communityPoints: number;
  recordPoints: number;
  titlePoints: number;
}

export interface IncumbentRecordAssessment {
  economyPoints: number;
  scandalPoints: number;
  villageHealthPoints: number;
  totalPoints: number;
  scandalCount: number;
  economyStatus: 'good' | 'fair' | 'poor';
  villageStatus: 'good' | 'fair' | 'poor';
  scandalStatus: 'clean' | 'tainted';
}

const RECORD_ECONOMY_GOOD = 6;
const RECORD_ECONOMY_POOR = -6;
const RECORD_SCANDAL_CLEAN = 3;
const RECORD_SCANDAL_EACH = -2;
const RECORD_VILLAGE_GOOD = 4;
const RECORD_VILLAGE_POOR = -6;
const RECORD_POSITIVE_CAP = 12;
const RECORD_NEGATIVE_CAP = -12;
const TITLE_MERIT_BONUS = 30;

/**
 * Merit per year served past adulthood, at the top of the witnessed age range.
 */
const EXPERIENCE_MERIT_PER_YEAR = 0.5;
/** One capped trade is worth 50 merit; expertise across trades is capped at 100. */
const SKILL_MERIT_PER_POINT = 0.5;
const SKILL_MERIT_CAP = 60;
/** Merit per close friendship (`relationships.friendCount`, the ≥60 bond the owner calls a friend). */
const COMMUNITY_MERIT_PER_FRIEND = 2;
/** Merit for being married, the household half of standing. */
const COMMUNITY_MERIT_MARRIED = 8;

export interface ElectionAnnouncement {
  title: string;
  message: string;
  leaderName: string;
  changed: boolean;
  reason: LeadershipElectionReason;
}

export interface ElectionBuildupNotice {
  title: string;
  message: string;
}

/**
 * A leader's or candidate's display name for notices, delegating to `citizenId.humanDisplayName`,
 * the owner of this format.
 */
export function formatSettlerName(entity: Entity): string {
  return humanDisplayName(entity);
}

function leadershipAgeYears(
  entity: Entity,
  state: Pick<WorldState, 'year' | 'dayInYear' | 'tick'>,
): number {
  return Math.max(entity.age, getAgeInYears(entity, state));
}

function assessVillageEconomy(state: WorldState): 'good' | 'fair' | 'poor' {
  const humans = Math.max(1, state.humanPopulation);
  const foodPerCapita = state.resources.food / humans;
  const foodFill = state.storageMax.food > 0 ? state.resources.food / state.storageMax.food : 0;
  const activeTrades = state.tradeRoutes.filter((r) => r.active).length;

  let score = 0;
  if (state.villageReputation >= 50) score += 2;
  else if (state.villageReputation >= 25) score += 1;
  else if (state.villageReputation < 15) score -= 2;

  if (foodPerCapita >= 15) score += 2;
  else if (foodPerCapita < 5) score -= 2;

  if (foodFill >= 0.35) score += 1;
  if (state.resources.gold >= 50) score += 1;
  if (activeTrades >= 2) score += 1;
  else if (activeTrades === 0 && state.year > 5) score -= 1;

  if (score >= 3) return 'good';
  if (score <= -2) return 'poor';
  return 'fair';
}

function assessVillageHealth(state: WorldState): 'good' | 'fair' | 'poor' {
  const humans = Math.max(1, state.humanPopulation);
  const recentDeaths = state.eventLog.filter(
    (e) => e.type === 'death' && e.year >= state.year - 2,
  ).length;

  let score = 0;
  const ecoHealth = getEcosystemHealth(state);
  if (ecoHealth >= 60) score += 1;
  else if (ecoHealth < 30) score -= 2;

  if (state.villageReputation >= 40) score += 1;
  else if (state.villageReputation < 20) score -= 2;

  if (recentDeaths > humans * 0.15) score -= 2;
  if (state.disasters.length > 0) score -= 1;
  if (state.resources.food <= 0 && humans > 3) score -= 2;

  if (score >= 2) return 'good';
  if (score <= -2) return 'poor';
  return 'fair';
}

function scandalEventTargetsLeader(e: { entityName?: string }, leader: Entity): boolean {
  if (!e.entityName) return false;
  const base = leader.name || '';
  const full = leader.surname ? `${base} ${leader.surname}` : base;
  const titled = leader.title ? `${full} ${leader.title}` : full;
  return e.entityName === base || e.entityName === full || e.entityName === titled;
}

function countLeaderScandalsDuringTerm(state: WorldState, leader: Entity): number {
  const sinceYear = state.leaderSinceYear;

  return state.eventLog.filter((e) => {
    if (e.year < sinceYear) return false;
    if (e.type === 'scandal') return scandalEventTargetsLeader(e, leader);
    if (e.type === 'event' && e.message?.includes('imprisoned for scandal')) {
      return scandalEventTargetsLeader(e, leader);
    }
    return false;
  }).length;
}

export function getIncumbentRecordAssessment(
  state: WorldState,
  leader: Entity,
): IncumbentRecordAssessment {
  const economyStatus = assessVillageEconomy(state);
  const villageStatus = assessVillageHealth(state);
  const scandalCount = countLeaderScandalsDuringTerm(state, leader);

  const economyPoints =
    economyStatus === 'good'
      ? RECORD_ECONOMY_GOOD
      : economyStatus === 'poor'
        ? RECORD_ECONOMY_POOR
        : 0;

  const villageHealthPoints =
    villageStatus === 'good'
      ? RECORD_VILLAGE_GOOD
      : villageStatus === 'poor'
        ? RECORD_VILLAGE_POOR
        : 0;

  const scandalPoints =
    scandalCount === 0 ? RECORD_SCANDAL_CLEAN : scandalCount * RECORD_SCANDAL_EACH;

  const rawTotal = economyPoints + scandalPoints + villageHealthPoints;
  const totalPoints = rawTotal > 0
    ? Math.min(rawTotal, RECORD_POSITIVE_CAP)
    : Math.max(rawTotal, RECORD_NEGATIVE_CAP);

  return {
    economyPoints,
    scandalPoints,
    villageHealthPoints,
    totalPoints,
    scandalCount,
    economyStatus,
    villageStatus,
    scandalStatus: scandalCount === 0 ? 'clean' : 'tainted',
  };
}

function getIncumbentRecordPoints(state: WorldState, entity: Entity): number {
  if (state.villageLeaderId !== entity.id) return 0;
  const leader = state.entities.find((e) => e.id === entity.id);
  if (!leader?.alive || !isEligibleForLeadership(leader, state)) return 0;
  return getIncumbentRecordAssessment(state, leader).totalPoints;
}

export function isEligibleForLeadership(
  entity: Entity,
  state?: Pick<WorldState, 'year' | 'dayInYear' | 'tick'>,
): boolean {
  const ageYears = state ? leadershipAgeYears(entity, state) : entity.age;
  return (
    entity.alive &&
    entity.type === EntityType.Human &&
    isPlayerHuman(entity) &&
    !entity.isJuvenile &&
    ageYears >= HUMAN_ADULT_MIN_AGE &&
    !isImprisoned(entity)
  );
}

function familyPrestigeBySurname(state: WorldState): Map<string, number> {
  const prestige = new Map<string, number>();
  for (const family of computeDynasties(state)) {
    const points = Math.min(25, Math.max(0, family.generationsAlive - 1) * 8 + Math.min(9, Math.max(0, family.members - 1)));
    prestige.set(family.surname, points);
  }
  return prestige;
}

export function getLeadershipScoreBreakdown(
  state: WorldState,
  entity: Entity,
  familyPrestige?: ReadonlyMap<string, number>,
): LeadershipScoreBreakdown {
  const skills = ensureEntitySkills(entity);
  const skillSum = Object.values(skills).reduce((sum, value) => sum + (value ?? 0), 0);
  const skillPoints = Math.min(SKILL_MERIT_CAP, Math.round(skillSum * SKILL_MERIT_PER_POINT));
  const ageYears = leadershipAgeYears(entity, state);
  const experiencePoints = Math.round(
    Math.min(Math.max(0, ageYears - HUMAN_ADULT_MIN_AGE), 100) * EXPERIENCE_MERIT_PER_YEAR,
  );

  const communityPoints =
    Math.min(friendCount(entity), MAX_CLOSE_FRIENDS_PER_SETTLER) * COMMUNITY_MERIT_PER_FRIEND +
    (isMarriedOrExpecting(entity) ? COMMUNITY_MERIT_MARRIED : 0);
  const titlePoints = entity.title ? TITLE_MERIT_BONUS : 0;
  const recordPoints = getIncumbentRecordPoints(state, entity);
  const battlePoints = Math.min(100, Math.max(-100, entity.battleLeadershipMerit ?? 0));
  const familyPoints = (familyPrestige ?? familyPrestigeBySurname(state)).get(entity.surname?.trim() ?? '') ?? 0;
  const promisePoints = Math.max(-60, Math.min(60, entity.promiseLeadershipMerit ?? 0));
  const baseScore = skillPoints + experiencePoints + battlePoints + familyPoints + promisePoints + communityPoints + titlePoints;

  return {
    entityId: entity.id,
    name: formatSettlerName(entity),
    skillPoints,
    experiencePoints,
    battlePoints,
    familyPoints,
    promisePoints,
    communityPoints,
    recordPoints,
    titlePoints,
    totalScore: baseScore + recordPoints,
  };
}

/**
 * Shared candidate comparator: ranks by totalScore DESC, age DESC, entityId ASC.
 */
function sortCandidateBreakdowns(
  candidates: LeadershipScoreBreakdown[],
  ageById: Map<number, number>,
): void {
  candidates.sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    const ageA = ageById.get(a.entityId) ?? 0;
    const ageB = ageById.get(b.entityId) ?? 0;
    if (ageB !== ageA) return ageB - ageA;
    return a.entityId - b.entityId;
  });
}

export function rankLeadershipCandidates(state: WorldState): LeadershipScoreBreakdown[] {
  const ageById = new Map<number, number>();
  const familyPrestige = familyPrestigeBySurname(state);
  const candidates: LeadershipScoreBreakdown[] = [];

  for (let i = 0; i < state.entities.length; i++) {
    const entity = state.entities[i];
    if (!isEligibleForLeadership(entity, state)) continue;
    ageById.set(entity.id, leadershipAgeYears(entity, state));
    candidates.push(getLeadershipScoreBreakdown(state, entity, familyPrestige));
  }

  sortCandidateBreakdowns(candidates, ageById);
  return candidates;
}

export function getElectionRaceCandidates(
  state: WorldState,
  displayLimit = 4,
): LeadershipScoreBreakdown[] {
  const ranked = rankLeadershipCandidates(state);
  if (ranked.length === 0) return [];

  const leader = getVillageLeader(state);
  if (!leader) return ranked.slice(0, displayLimit);

  const leaderIdx = ranked.findIndex((b) => b.entityId === leader.id);
  const leaderBreakdown =
    leaderIdx >= 0 ? ranked[leaderIdx] : getLeadershipScoreBreakdown(state, leader);

  const top = ranked.slice(0, displayLimit);
  if (top.some((b) => b.entityId === leader.id)) return top;

  const challengers = ranked.filter((b) => b.entityId !== leader.id).slice(0, displayLimit - 1);
  const race = [...challengers, leaderBreakdown];
  const ageById = new Map(
    state.entities
      .filter((entity) => isEligibleForLeadership(entity, state))
      .map((entity) => [entity.id, leadershipAgeYears(entity, state)] as const),
  );

  sortCandidateBreakdowns(race, ageById);
  return race;
}

/** Determines if an entity currently holds the village head office (vacancy / UI). */
export function isActingVillageHead(
  entity: Entity | null | undefined,
  state?: Pick<WorldState, 'year' | 'dayInYear' | 'tick'>,
): boolean {
  // Imprisonment must not clear the office: a jailed leader keeps villageLeaderId and the
  // occupation for the term, while elections exclude jailed candidates.
  if (!entity || !entity.alive || entity.faction || entity.isJuvenile) {
    return false;
  }

  // Werewolf form check: cursed leader stays acting head while transformed (EJ-10)
  if (entity.type === EntityType.Werewolf && entity.moonHowlerCursed) {
    return true;
  }

  if (isImprisoned(entity)) {
    return entity.type === EntityType.Human && isPlayerHuman(entity);
  }

  // Standard human eligibility check
  return isEligibleForLeadership(entity, state);
}

export function getVillageLeader(state: WorldState): Entity | null {
  if (state.villageLeaderId == null) return null;
  const leader = state.entities.find((e) => e.id === state.villageLeaderId);
  if (!leader || !isActingVillageHead(leader, state)) return null;
  return leader;
}

export function isVillageLeader(state: WorldState, entityId: number): boolean {
  if (state.villageLeaderId !== entityId) return false;
  const leader = state.entities.find((e) => e.id === entityId);
  return leader != null && isActingVillageHead(leader, state);
}

export function getYearsUntilElection(state: WorldState): number {
  if (state.pendingElectionYear != null) {
    const currentFraction = state.year + (state.dayInYear ?? 0) / DAYS_PER_YEAR;
    return Math.max(0, state.pendingElectionYear - currentFraction);
  }
  return getYearsUntilElectionForYear(state.year, state.lastElectionYear);
}

function getYearsUntilElectionForYear(year: number, lastElectionYear: number): number {
  if (year <= 0) return ELECTION_INTERVAL_YEARS;
  const mod = year % ELECTION_INTERVAL_YEARS;
  if (mod === 0 && lastElectionYear === year) return ELECTION_INTERVAL_YEARS;
  return mod === 0 ? 0 : ELECTION_INTERVAL_YEARS - mod;
}

function scoreSummary(b: LeadershipScoreBreakdown): string {
  const parts = [`skills ${b.skillPoints}`, `experience ${b.experiencePoints}`];
  if (b.battlePoints > 0) parts.push(`defense & raids +${b.battlePoints}`);
  if (b.familyPoints > 0) parts.push(`family name +${b.familyPoints}`);
  if (b.promisePoints !== 0) parts.push(`promises ${b.promisePoints > 0 ? '+' : ''}${b.promisePoints}`);
  if (b.titlePoints > 0) parts.push(`title +${b.titlePoints}`);
  if (b.communityPoints > 0) parts.push(`family +${b.communityPoints}`);
  if (b.recordPoints > 0) parts.push(`record +${b.recordPoints}`);
  if (b.recordPoints < 0) parts.push(`record ${b.recordPoints}`);
  return `merit ${b.totalScore} (${parts.join(', ')})`;
}

export function getElectionGatherSite(state: WorldState): { x: number; y: number } {
  const square = state.buildings.find((building) =>
    building.type === 'square' && building.completed && building.faction !== 'rival'
  );
  if (square) return { x: square.x + square.width / 2, y: square.y + square.height / 2 };
  const hall = findPlayerTownHall(state.buildings);
  if (hall) {
    return { x: hall.x + hall.width / 2, y: hall.y + hall.height / 2 };
  }
  return { x: state.width / 2, y: state.height / 2 };
}

export function isElectionCeremonyActive(state: WorldState): boolean {
  return state.electionCeremony != null;
}

const GATHER_SLOTS_PER_RING = 12;

/**
 * How far out the gathering may reach, in rings — beyond this, extra attendees share the rim, so the
 * crowd stays beside the hall and can arrive within the ceremony.
 */
const MAX_GATHER_RING = 4;

/**
 * How many settlers a ceremony actually gathers: two rings' worth, the people the vote is about;
 * everyone else has a day's work to do.
 */
export const CEREMONY_ATTENDEE_LIMIT = GATHER_SLOTS_PER_RING * 2;

/**
 * Whether this settler is one of the ceremony's attendees, using the same id-sorted index as
 * `getElectionGatherTarget` so position and slot can never disagree.
 */
/** Live single pass used only without a per-tick seat index; the slot and crowd both saturate. */
function rankCeremonyAttendees(
  state: WorldState,
  entityId: number,
): CeremonyRank {
  let slot = 0;
  let attendeeCount = 0;
  let isAttendee = false;
  for (let i = 0; i < state.entities.length; i++) {
    const entity = state.entities[i];
    if (!isEligibleForLeadership(entity, state)) continue;
    if (attendeeCount < ATTENDEE_COUNT_CAP) attendeeCount++;
    if (entity.id === entityId) isAttendee = slot < CEREMONY_ATTENDEE_LIMIT;
    else if (entity.id < entityId && slot < CEREMONY_ATTENDEE_LIMIT) slot++;
    if (slot >= CEREMONY_ATTENDEE_LIMIT && attendeeCount >= ATTENDEE_COUNT_CAP) break;
  }
  return { slot, attendeeCount, isAttendee };
}

export function isCeremonyAttendee(
  state: WorldState,
  entityId: number,
  seats?: CeremonySeatIndex,
): boolean {
  if (!state.electionCeremony) return false;
  if (seats) return seats.finalistIds.has(entityId) || seats.slots.has(entityId);
  if (state.electionCeremony.finalistIds?.includes(entityId)) return true;
  return rankCeremonyAttendees(state, entityId).isAttendee;
}

/** Radius of the outermost ring, in px. Overflow attendees share it; non-attendees stand just outside. */
const MAX_GATHER_RADIUS_PX = 22 + MAX_GATHER_RING * 14;

/** The outer ring radius stops changing past this crowd size, so counting beyond it is wasted work. */
const ATTENDEE_COUNT_CAP = 32;

/** The id-sorted attendee ranks a ceremony needs, built once per tick instead of per settler. */
export interface CeremonySeatIndex {
  readonly slots: ReadonlyMap<number, number>;
  readonly finalistIds: ReadonlySet<number>;
  readonly attendeeCount: number;
}

/** Where one participant stands during a ceremony. */
export interface CeremonyGatherTarget {
  x: number;
  y: number;
}

interface CeremonyRank {
  slot: number;
  attendeeCount: number;
  isAttendee: boolean;
}

/** One pass over the live entities; `slots` holds the attendee rank below the ceremony limit. */
export function buildCeremonySeatIndex(state: WorldState): CeremonySeatIndex {
  const finalistIds = new Set(state.electionCeremony?.finalistIds ?? []);
  const eligibleIds: number[] = [];
  for (const entity of state.entities) {
    if (isEligibleForLeadership(entity, state)) eligibleIds.push(entity.id);
  }
  eligibleIds.sort((a, b) => a - b);
  const slots = new Map<number, number>();
  const slotCount = Math.min(eligibleIds.length, CEREMONY_ATTENDEE_LIMIT);
  for (let i = 0; i < slotCount; i++) slots.set(eligibleIds[i], i);
  return {
    slots,
    finalistIds,
    attendeeCount: Math.min(eligibleIds.length, ATTENDEE_COUNT_CAP),
  };
}

export function getElectionGatherTarget(
  state: WorldState,
  entityId: number,
  seats?: CeremonySeatIndex,
): CeremonyGatherTarget {
  const c = state.electionCeremony;
  if (!c) return getElectionGatherSite(state);
  const finalistPosition = c.finalistIds?.indexOf(entityId) ?? -1;
  if (finalistPosition >= 0) {
    // Finalists stand in a line at the square's centre, not in the audience rings.
    return { x: c.gatherX + (finalistPosition - 1) * 15, y: c.gatherY - 10 };
  }

  let slot = 0;
  let attendeeCount = 0;
  let isAttendee = false;
  if (seats) {
    slot = seats.slots.get(entityId) ?? 0;
    attendeeCount = seats.attendeeCount;
    isAttendee = seats.slots.has(entityId);
  } else {
    ({ slot, attendeeCount, isAttendee } = rankCeremonyAttendees(state, entityId));
  }

  if (!isAttendee) {
    // Non-attendees (children, prisoners, other factions) ring the outside one step beyond the
    // crowd, also capped to the hall's frontage.
    const angle = ((entityId * 17) % 360) * (Math.PI / 180);
    const ringRadius = Math.min(22 + Math.ceil(attendeeCount / GATHER_SLOTS_PER_RING) * 14 + 28, MAX_GATHER_RADIUS_PX + 12);
    return {
      x: c.gatherX + Math.cos(angle) * ringRadius,
      y: c.gatherY + Math.sin(angle) * ringRadius,
    };
  }

  // Keep the audience out of the finalists' central platform.
  const ring = Math.floor(slot / GATHER_SLOTS_PER_RING);
  if (ring > MAX_GATHER_RING) {
    // Overflow shares the outermost ring, each on its own stable angle so nobody stacks on a neighbour
    // — the crowd grows denser instead of the circle growing wider.
    const angle = ((entityId * 17) % 360) * (Math.PI / 180);
    return {
      x: c.gatherX + Math.cos(angle) * MAX_GATHER_RADIUS_PX,
      y: c.gatherY + Math.sin(angle) * MAX_GATHER_RADIUS_PX,
    };
  }

  const angleSlot = slot % GATHER_SLOTS_PER_RING;
  const angle = (angleSlot / GATHER_SLOTS_PER_RING) * Math.PI * 2;
  const ringRadius = 22 + ring * 14;

  return {
    x: c.gatherX + Math.cos(angle) * ringRadius,
    y: c.gatherY + Math.sin(angle) * ringRadius,
  };
}

export function findFoundingColonyLeader(state: WorldState): Entity | null {
  const pioneers = state.entities
    .filter((e) => e.alive && isPlayerHuman(e) && !e.isJuvenile)
    .sort((a, b) => a.id - b.id);
  return pioneers.find((e) => e.gender === 'male') ?? pioneers[0] ?? null;
}

export function appointFoundingLeader(state: WorldState, entity: Entity): void {
  const prevLeaderId = state.villageLeaderId;
  state.villageLeaderId = entity.id;
  state.leaderSinceYear = state.year;
  state.lastElectionYear = 0;
  state.pendingElectionYear = null;
  applyLeaderOccupation(state, prevLeaderId);
  syncLeaderHouseResidency(state);

  const name = formatSettlerName(entity);
  logEvent(
    state,
    'election',
    `${name} leads the founding colony until the first merit election (Year ${displayYear(ELECTION_INTERVAL_YEARS)})`,
    name,
  );
}

export function getElectionCeremonyStatus(state: WorldState): string | null {
  // A pending date is a vacancy only while nobody is acting as head; a stale date left by a filled
  // election must never be announced as "No village head".
  if (state.pendingElectionYear != null && !state.electionCeremony && !getVillageLeader(state)) {
    const currentFraction = state.year + (state.dayInYear ?? 0) / DAYS_PER_YEAR;
    const until = Math.max(0, state.pendingElectionYear - currentFraction);
    if (until > 0) {
      return `No village head — merit election in ${formatElectionDelay(until)} (Year ${displayYear(Math.floor(state.pendingElectionYear))}).`;
    }
    return 'Leadership election imminent — settlers will gather soon.';
  }

  if (state.electionCeremony) {
    const labels: Record<ElectionCeremonyPhase, string> = {
      gathering: 'The election season begins — settlers gather at the Town Hall.',
      gossip: 'The village debates who should lead, between their own work.',
      tension: 'Voting day — the crowd waits for the result…',
      reveal: 'Announcing the village head!',
    };
    return labels[state.electionCeremony.phase];
  }

  const until = getYearsUntilElection(state);
  if (until === 1) return 'Leadership election next year — settlers are already whispering.';
  if (until === 0) return 'Election this year — ceremony begins on the new year.';
  return null;
}

function pickTopCandidates(state: WorldState, count: number): LeadershipScoreBreakdown[] {
  return getElectionRaceCandidates(state, count);
}

/** Select exactly the former seeded gossip slot, now referencing JSON IDs instead of TS speech. */
function selectElectionGossip(
  state: WorldState,
  tone: 'buildup' | 'ceremony' | 'tension',
): { treeId: string; variables: Record<string, string> } {
  const race = pickTopCandidates(state, 4);
  const leader = getVillageLeader(state);
  const leaderName = leader ? formatSettlerName(leader) : 'our head';
  const challengers = leader ? race.filter((b) => b.entityId !== leader.id) : race;
  const candidateA = challengers[0]?.name ?? race[0]?.name ?? 'someone';
  const candidateB = challengers[1]?.name ?? race[1]?.name ?? 'another';
  const candidateC = challengers[2]?.name ?? race[2]?.name ?? 'a dark horse';
  const record = leader ? getIncumbentRecordAssessment(state, leader) : null;

  const recordIds: string[] = [];
  if (record && tone !== 'tension') {
    const prefix = tone + '_record_';
    if (record.economyStatus === 'good') recordIds.push(prefix + 'economy_good');
    else if (record.economyStatus === 'poor') recordIds.push(prefix + 'economy_poor');
    recordIds.push(prefix + (record.scandalStatus === 'clean' ? 'scandal_clean' : 'scandal_bad'));
    if (record.villageStatus === 'good') recordIds.push(prefix + 'village_good');
    else if (record.villageStatus === 'poor') recordIds.push(prefix + 'village_poor');
  }

  const pool = tone === 'tension'
    ? ['tension_quiet', 'tension_heart', 'tension_merit', 'tension_result']
    : tone === 'buildup'
      ? ['buildup_next_year', 'buildup_a_support', 'buildup_b_watching',
        leader ? 'buildup_buzz_leader' : 'buildup_buzz_no_leader',
        'buildup_after_leader', 'buildup_c_surprise', ...recordIds]
      : leader
        ? ['ceremony_leader_who', 'ceremony_leader_reputation', 'ceremony_leader_challenge',
          'ceremony_leader_hold', 'ceremony_leader_merit', 'ceremony_leader_change',
          'ceremony_leader_b_chance', ...recordIds]
        : ['ceremony_open_who', 'ceremony_open_merit', 'ceremony_open_hall',
          'ceremony_open_change', 'ceremony_open_vote', 'ceremony_open_b_chance'];
  const index = (state.tick * 17 + pool.length * 3) % pool.length;
  return {
    treeId: 'evt_election_' + pool[index],
    variables: { leader: leaderName, candidateA, candidateB, candidateC },
  };
}

export function tickElectionGossip(state: WorldState): void {
  const until = getYearsUntilElection(state);
  const inCeremony = state.electionCeremony != null;
  const vacancyPending = state.pendingElectionYear != null && !getVillageLeader(state);
  if (until > 1 && !inCeremony && !vacancyPending) return;
  if (!state.entities.some((entity) => isEligibleForLeadership(entity, state))) return;

  let chance = 0;
  let tone: 'buildup' | 'ceremony' | 'tension' = 'buildup';

  if (inCeremony) {
    if (state.electionCeremony!.phase === 'tension') {
      chance = 0.35;
      tone = 'tension';
    } else if (
      state.electionCeremony!.phase === 'gossip' ||
      state.electionCeremony!.phase === 'gathering'
    ) {
      chance = 0.28;
      tone = 'ceremony';
    } else {
      return;
    }
  } else if (until === 1) {
    chance = 0.12;
    tone = 'buildup';
  } else if (until === 0 || vacancyPending) {
    chance = vacancyPending ? 0.14 : 0.2;
    tone = 'buildup';
  }

  // Seeded per tick and tone: gossip is part of the chronicle, so the same seed gossips the
  // same way instead of depending on how many other rolls happened first.
  const gossipKey = `election-gossip:${state.tick}:${tone}`;
  if (seededRandomForRun(gossipKey) > chance) return;

  const eligible = state.entities.filter((entity) => isEligibleForLeadership(entity, state));
  const speaker = eligible[Math.floor(seededRandomForRun(`${gossipKey}:speaker`) * eligible.length)];
  if (!speaker) return;

  const gossip = selectElectionGossip(state, tone);
  requestDialogue({
    eventKey: `election.${tone}`, treeId: gossip.treeId, speaker,
    tick: state.tick, priority: 'scripted', variables: gossip.variables,
    durationHours: dialogueHoursFromNominalTicks(110),
  });
}

export function startElectionCeremony(
  state: WorldState,
  year: number,
  reason: LeadershipElectionReason,
): boolean {
  const ranked = rankLeadershipCandidates(state);
  maybeOfferValleyDebate(state, ranked.map((c) => c.name));

  if (ranked.length === 0) {
    logEvent(
      state,
      'election',
      `Leadership election postponed (Year ${displayYear(year)}) — no eligible candidates`,
    );
    return false;
  }

  const electionId = state.nextElectionId ?? 1;
  state.nextElectionId = electionId + 1;
  const nominated = ranked.slice(0, 12);
  const incumbentId = getVillageLeader(state)?.id;
  if (incumbentId != null && !nominated.some((candidate) => candidate.entityId === incumbentId)) {
    const incumbent = ranked.find((candidate) => candidate.entityId === incumbentId);
    if (incumbent) nominated[nominated.length - 1] = incumbent;
  }
  const vote = simulateElectionVotes(state, nominated, electionId);
  const winner = ranked.find((b) => b.entityId === vote.winnerId) ?? ranked[0];
  const site = getElectionGatherSite(state);

  state.electionCeremony = {
    electionId,
    ballotTally: Object.fromEntries(vote.tally),
    ballotTotal: vote.totalVotes,
    ballotWinnerVotes: vote.winnerVotes,
    ballotCast: true,
    phase: 'gathering',
    phaseTicksLeft: getPhaseTicks('gathering'),
    gatherX: site.x,
    gatherY: site.y,
    reason,
    pendingLeaderId: winner.entityId,
    pendingLeaderName: winner.name,
    pendingChanged: state.villageLeaderId !== winner.entityId,
    finalistIds: [...nominated].sort((a, b) => (vote.tally.get(b.entityId) ?? 0) - (vote.tally.get(a.entityId) ?? 0) || b.totalScore - a.totalScore).slice(0, 3).map((candidate) => candidate.entityId),
  };

  const place = state.buildings.some((building) => building.type === 'square' && building.completed && building.faction !== 'rival')
    ? 'the Village Square' : findPlayerTownHall(state.buildings) ? 'the Town Hall' : 'the village center';

  logEvent(
    state,
    'election',
    `Leadership election ceremony began at ${place} (Year ${displayYear(year)})`,
    winner.name,
  );

  /**
   * Tell the player, and let the message take them there: `addNotification`'s focus makes the entry
   * clickable onto the gathering site.
   */
  addNotification(
    state,
    '🗳️ Election ceremony begins',
    `The village gathers at ${place} to choose its head — a ceremony with gathering, gossip and a vote reveal (Year ${displayYear(year)}).`,
    'event',
    { x: site.x, y: site.y },
  );
  return true;
}

export function tickElectionBuildup(
  state: WorldState,
  electionYear: number,
  yearRollover: boolean,
): ElectionBuildupNotice | null {
  if (!yearRollover || electionYear <= 0) return null;

  const until = getYearsUntilElectionForYear(electionYear, state.lastElectionYear);

  if (until === 1 && state.electionBuildupNotifiedYear !== electionYear) {
    state.electionBuildupNotifiedYear = electionYear;
    return {
      title: '🗳️ Election next year',
      message: `Year ${displayYear(electionYear)} — leadership election next year. Settlers are already whispering about who should lead ${state.villageName}.`,
    };
  }

  return null;
}

function refreshCeremonyPendingLeader(state: WorldState, ceremony: ElectionCeremonyState): void {
  const nominee = state.entities.find((candidate) => candidate.id === ceremony.pendingLeaderId);
  if (nominee && isEligibleForLeadership(nominee, state)) return;
  const eligible = (ceremony.finalistIds ?? []).map((id) => state.entities.find((candidate) => candidate.id === id))
    .filter((candidate): candidate is Entity => !!candidate && isEligibleForLeadership(candidate, state));
  eligible.sort((a, b) => (ceremony.ballotTally?.[String(b.id)] ?? 0) - (ceremony.ballotTally?.[String(a.id)] ?? 0));
  const successor = eligible[0];
  if (!successor) return;
  ceremony.pendingLeaderId = successor.id;
  ceremony.pendingLeaderName = formatSettlerName(successor);
  ceremony.pendingChanged = state.villageLeaderId !== successor.id;
}

function advanceCeremonyPhase(state: WorldState, ceremony: ElectionCeremonyState): void {
  if (ceremony.phase === 'gathering') {
    logEvent(state, 'election', 'Election gathering complete — candidates address the crowd and villagers begin discussing the vote.');
    ceremony.phase = 'gossip';
    ceremony.phaseTicksLeft = getPhaseTicks('gossip');
  } else if (ceremony.phase === 'gossip') {
    logEvent(state, 'election', 'Election discussions conclude — the village awaits the final decision.');
    ceremony.phase = 'tension';
    ceremony.phaseTicksLeft = getPhaseTicks('tension');
  } else if (ceremony.phase === 'tension') {
    logEvent(state, 'election', 'Election ceremony reaches the result announcement.');
    ceremony.phase = 'reveal';
    ceremony.phaseTicksLeft = 1;
  }
  refreshCeremonyPendingLeader(state, ceremony);
}

export function tickElectionCeremony(state: WorldState, year: number): ElectionAnnouncement | null {
  const ceremony = state.electionCeremony;
  if (!ceremony) return null;

  if (ceremony.phase === 'reveal') {
    try {
      refreshCeremonyPendingLeader(state, ceremony);
      const result = runVillageElection(state, year, ceremony.reason);
      const announcement = buildAnnouncement(result, ceremony.reason, year);
      const winner = state.entities.find((e) => e.id === result.leaderId);
      if (winner) {
        winner.flash = 14;
        requestDialogue({
          eventKey: 'election.winner', speaker: winner, tick: state.tick,
          priority: 'scripted',
          durationHours: dialogueHoursFromNominalTicks(140),
        });
      }

      if (announcement) {
        state.festival = {
          active: true,
          name: ELECTION_PARTY_NAME,
          daysLeft: ELECTION_PARTY_DAYS,
        };
        logEvent(
          state,
          'election',
          `Election revelry began — ${ELECTION_PARTY_DAYS} day${ELECTION_PARTY_DAYS === 1 ? '' : 's'} of celebration`,
          result.leaderName,
        );
        // The party is a real festival — production, courtship and immigration are boosted — and it is
        // short, so a Chronicle line alone lets its effects arrive with no word about them.
        addNotification(
          state,
          '🎉 Election revelry!',
          `${ELECTION_PARTY_DAYS === 1 ? 'A day' : `${ELECTION_PARTY_DAYS} days`} of celebration — production, courtship and immigration are boosted while it lasts.`,
          'success',
        );
      }

      // Record v0.6.3 E1 campaign promises now that the leader has officially taken office
      if (result.leaderId != null) {
        recordElectionPromises(state, year);
      }

      return announcement;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error('[villageLeadership] Election reveal failed:', err);
      logEvent(
        state,
        'election',
        `Leadership election failed (Year ${displayYear(year)}) — ${detail}`,
        ceremony.pendingLeaderName,
      );
      return null;
    } finally {
      state.electionCeremony = null;
    }
  }

  ceremony.phaseTicksLeft--;
  if (ceremony.phaseTicksLeft <= 0) {
    advanceCeremonyPhase(state, ceremony);
    // Tension lasts an hour: its gossip rolls once, on the phase change, not on a clock residue.
    if (ceremony.phase === 'tension') {
      tickElectionGossip(state);
    }
  }

  if (ceremony.phase === 'gossip' && state.tick % 18 === 0) {
    tickElectionGossip(state);
  }

  return null;
}

export function runVillageElection(
  state: WorldState,
  year: number,
  reason: LeadershipElectionReason,
): {
  leaderId: number | null;
  changed: boolean;
  leaderName: string;
  breakdown: LeadershipScoreBreakdown | null;
  votes: { won: number; total: number };
} {
  const ranked = rankLeadershipCandidates(state);
  if (ranked.length === 0) {
    const prevId = state.villageLeaderId;
    const changed = prevId != null;
    state.villageLeaderId = null;
    if (changed) {
      // The reveal deposed the incumbent — step the office down so the stale
      // "leader" label does not outlive the term.
      applyLeaderOccupation(state, prevId);
    }
    // A reveal with no eligible candidate must still schedule the successor election: settlers who
    // come of age or leave prison re-open the race.
    if (state.pendingElectionYear == null) {
      const electionYear =
        state.year + (state.dayInYear ?? 0) / DAYS_PER_YEAR + VACANCY_ELECTION_DELAY_YEARS;
      state.pendingElectionYear = electionYear;
      logEvent(
        state,
        'election',
        `Leadership election found no eligible candidate — merit election scheduled for Year ${displayYear(Math.floor(electionYear))}`,
      );
    }
    return {
      leaderId: null,
      changed,
      leaderName: '',
      breakdown: null,
      votes: { won: 0, total: 0 },
    };
  }

  const ceremony = state.electionCeremony;
  const vote = ceremony?.ballotCast && ceremony.ballotTally
    ? { winnerId: ceremony.pendingLeaderId, winnerVotes: ceremony.ballotTally[String(ceremony.pendingLeaderId)] ?? 0, totalVotes: ceremony.ballotTotal ?? 0, tally: new Map(Object.entries(ceremony.ballotTally).map(([id, count]) => [Number(id), count])) }
    : simulateElectionVotes(state, ranked, state.nextElectionId ?? 0);
  const winner = ranked.find((b) => b.entityId === vote.winnerId) ?? ranked[0];
  const prevId = state.villageLeaderId;
  const changed = prevId !== winner.entityId;

  state.lastElectionResult = {
    electionId: ceremony?.electionId ?? state.nextElectionId ?? 0,
    winnerId: winner.entityId,
    ballots: vote.totalVotes,
    tally: Object.fromEntries(vote.tally),
    eligibleVoters: state.entities.filter((person) => person.alive && isPlayerHuman(person) && !person.isJuvenile).length,
    turnout: vote.totalVotes,
  };
  state.villageLeaderId = winner.entityId;
  state.leaderSinceYear = year;
  applyLeaderOccupation(state, prevId);
  syncLeaderHouseResidency(state);

  // Electing a head settles whatever vacancy was pending: a stale date left armed would announce a
  // vacancy nobody has and run a second ceremony for the filled seat.
  state.pendingElectionYear = null;

  if (reason === 'term' || reason === 'founding') {
    state.lastElectionYear = year;
  }

  // The wrong: the strongest settler who lost the race now resents the one who beat them.
  const runnerUp = ranked.find((candidate) => candidate.entityId !== winner.entityId);
  if (runnerUp) {
    const runnerUpEntity = state.entities.find((e) => e.id === runnerUp.entityId);
    const winnerEntity = state.entities.find((e) => e.id === winner.entityId);
    if (runnerUpEntity && winnerEntity) {
      startFeud(state, runnerUpEntity, winnerEntity, ELECTION_LOSS_FEUD_SCORE);
    }
  }

  const ballot = `${vote.winnerVotes} of ${vote.totalVotes} ballots`;
  if (reason === 'founding') {
    logEvent(
      state,
      'election',
      `${winner.name} elected founding village head — ${ballot} · ${scoreSummary(winner)}`,
      winner.name,
    );
  } else if (reason === 'term') {
    logEvent(
      state,
      'election',
      changed
        ? `${winner.name} elected village head (Year ${displayYear(year)}) — ${ballot} · ${scoreSummary(winner)}`
        : `${winner.name} re-elected village head (Year ${displayYear(year)}) — ${ballot} · ${scoreSummary(winner)}`,
      winner.name,
    );
  } else {
    logEvent(
      state,
      'election',
      `${winner.name} succeeded as village head — ${ballot} · ${scoreSummary(winner)}`,
      winner.name,
    );
  }

  return {
    leaderId: winner.entityId,
    changed,
    leaderName: winner.name,
    breakdown: winner,
    votes: { won: vote.winnerVotes, total: vote.totalVotes },
  };
}

function buildAnnouncement(
  result: ReturnType<typeof runVillageElection>,
  reason: LeadershipElectionReason,
  year: number,
): ElectionAnnouncement | null {
  if (!result.leaderName) return null;
  const title =
    reason === 'term'
      ? result.changed
        ? '🗳️ New village head'
        : '🗳️ Head re-elected'
      : '👑 New village head';
  const verb = reason === 'term' && !result.changed ? 're-elected' : 'is now village head';
  const merit = result.breakdown ? scoreSummary(result.breakdown) : '';
  const ballots =
    result.votes.total > 0 ? `${result.votes.won} of ${result.votes.total} ballots · ` : '';

  return {
    title,
    message: `${result.leaderName} ${verb} (Year ${displayYear(year)}). Elected by ballot — ${ballots}${merit}.`,
    leaderName: result.leaderName,
    changed: result.changed,
    reason,
  };
}

/**
 * The one formatter for an election countdown: `getYearsUntilElection` returns a fractional year
 * while a vacancy is pending, so no surface may interpolate the raw number.
 */
export function formatElectionDelay(years: number): string {
  if (years >= 1) {
    const y = Math.floor(years);
    return y === 1 ? '1 year' : `${y} years`;
  }
  const months = Math.max(1, Math.round(years * MONTHS_PER_YEAR));
  return months === 1 ? '1 month' : `${months} months`;
}

export function tickLeaderVacancy(state: WorldState): ElectionBuildupNotice | null {
  if (state.villageLeaderId != null) {
    const holder = state.entities.find((entity) => entity.id === state.villageLeaderId);
    if (!holder || !holder.alive) state.villageLeaderId = null;
  }
  if (state.pendingElectionYear != null) return null;

  const currentFraction = state.year + (state.dayInYear ?? 0) / DAYS_PER_YEAR;
  const electionYear = currentFraction + VACANCY_ELECTION_DELAY_YEARS;

  const leaderId = state.villageLeaderId;
  if (leaderId == null) {
    // A death handler or old save may already have cleared the office holder.
    // Do not schedule over an active ceremony; its winner will fill this vacancy.
    if (state.electionCeremony) return null;
    state.pendingElectionYear = electionYear;
    const delayText = formatElectionDelay(VACANCY_ELECTION_DELAY_YEARS);
    const message = `The village head seat is vacant. A succession election will take place in ${delayText}.`;
    logEvent(state, 'election', message, 'The village head');
    return { title: '👑 Leadership vacancy', message };
  }

  const leader = state.entities.find((e) => e.id === leaderId);
  if (leader && isActingVillageHead(leader, state)) return null;

  // A death and a non-fatal deposition use the same succession schedule; announce it even if no
  // candidate is eligible now. Snapshot the manor residents whose entitlement must outlive the leader.
  const manor = state.buildings.find((building) =>
    building.type === BuildingType.LeaderHouse && building.completed && building.faction !== 'rival');
  state.pendingLeaderHouseResidentIds = manor
    ? state.entities.filter((person) => person.alive && !person.faction
      && person.residenceBuildingId === manor.id).map((person) => person.id)
    : [];
  state.pendingElectionYear = electionYear;
  state.villageLeaderId = null;

  const name = leader ? formatSettlerName(leader) : 'The village head';
  const died = leader != null && !leader.alive;
  const delayText = formatElectionDelay(VACANCY_ELECTION_DELAY_YEARS);
  const message = died
    ? `Village leader ${name} has died. A succession election will take place in ${delayText}. The family may remain in the Leader's House until a successor is elected.`
    : `${name} can no longer lead. A succession election will take place in ${delayText}.`;
  logEvent(state, 'election', message, name);
  return {
    title: died ? '👑 Village leader has died' : '👑 Leadership vacancy',
    message,
  };
}

export function tryStartVacancyElectionCeremony(
  state: WorldState,
  year: number,
  dayInYear: number,
): boolean {
  if (state.pendingElectionYear == null || state.electionCeremony) {
    return false;
  }

  const currentFraction = year + dayInYear / DAYS_PER_YEAR;
  if (currentFraction < state.pendingElectionYear) {
    return false;
  }

  // This is the vacancy scheduler: `pendingElectionYear` was armed by a death, deposition or
  // postponed term, so its outcome is a succession even in a term year.
  const started = startElectionCeremony(state, Math.floor(year), 'succession');
  if (started) {
    state.pendingElectionYear = null;
  } else {
    // `startElectionCeremony` fails only on its zero-candidate guard; re-arm the vacancy delay so
    // the office is re-contested on that rhythm instead of retried every day.
    state.pendingElectionYear = currentFraction + VACANCY_ELECTION_DELAY_YEARS;
  }
  return started;
}

/** Starts the scheduled end-of-term election when a term year (Year 2, 4, 6, …) begins. */
export function tryStartTermElectionCeremony(
  state: WorldState,
  year: number,
  dayInYear: number,
): boolean {
  if (
    dayInYear !== 0 ||
    year <= 0 ||
    year % ELECTION_INTERVAL_YEARS !== 0 ||
    state.lastElectionYear === year ||
    state.electionCeremony ||
    state.pendingElectionYear != null
  ) {
    return false;
  }
  const started = startElectionCeremony(state, year, 'term');
  if (!started) {
    // `startElectionCeremony` fails only on its zero-candidate guard; without this re-arm a colony
    // with no eligible adult stays headless until the next term year. The retry is a succession.
    state.pendingElectionYear = year + dayInYear / DAYS_PER_YEAR + VACANCY_ELECTION_DELAY_YEARS;
  }
  return started;
}

function isValidElectionCeremony(value: unknown): value is ElectionCeremonyState {
  if (!value || typeof value !== 'object') return false;
  const ceremony = value as Partial<ElectionCeremonyState>;
  const pendingLeaderId: unknown = ceremony.pendingLeaderId;
  const phases: ElectionCeremonyPhase[] = ['gathering', 'gossip', 'tension', 'reveal'];
  return (
    typeof ceremony.phase === 'string' &&
    phases.includes(ceremony.phase as ElectionCeremonyPhase) &&
    typeof ceremony.phaseTicksLeft === 'number' &&
    Number.isFinite(ceremony.phaseTicksLeft) &&
    typeof ceremony.gatherX === 'number' &&
    Number.isFinite(ceremony.gatherX) &&
    typeof ceremony.gatherY === 'number' &&
    Number.isFinite(ceremony.gatherY) &&
    typeof ceremony.reason === 'string' &&
    (pendingLeaderId === null ||
      (typeof pendingLeaderId === 'number' && Number.isFinite(pendingLeaderId))) &&
    typeof ceremony.pendingLeaderName === 'string' &&
    typeof ceremony.pendingChanged === 'boolean'
  );
}

export function validateVillageLeaderOnLoad(state: WorldState): void {
  if (state.electionBuildupNotifiedYear === undefined) {
    state.electionBuildupNotifiedYear = null;
  }
  if (state.electionCeremony === undefined) {
    state.electionCeremony = null;
  } else if (state.electionCeremony != null && !isValidElectionCeremony(state.electionCeremony)) {
    console.warn('[villageLeadership] Corrupted electionCeremony in save — clearing ceremony state');
    state.electionCeremony = null;
  }
  if (state.pendingElectionYear === undefined) {
    state.pendingElectionYear = null;
  }

  // Older saves stored the scheduled election under the name 'decennial'; the token is now 'term'.
  if (state.electionCeremony != null && (state.electionCeremony.reason as string) === 'decennial') {
    state.electionCeremony.reason = 'term';
  }

  const leader = getVillageLeader(state);
  if (leader) {
    applyLeaderOccupation(state, null);
    syncLeaderHouseResidency(state);
    // With an acting head the pending date is stale by definition; clearing it lets the vacancy
    // notice and the next `tickLeaderVacancy` schedule work.
    state.pendingElectionYear = null;
    return;
  }

  // The office is vacant (an imprisoned leader is still acting, so never reaches this branch): drop
  // the dangling id; the scheduling below still runs.
  state.villageLeaderId = null;

  if (state.pendingElectionYear != null) return;

  // A negative year means no election ever decided the office, so restore the founding appointment;
  // year 0 is a real stamp and takes the by-election below.
  if (state.lastElectionYear < 0) {
    const founder = findFoundingColonyLeader(state);
    if (founder) appointFoundingLeader(state, founder);
    else {
      const currentFraction = state.year + (state.dayInYear ?? 0) / DAYS_PER_YEAR;
      state.pendingElectionYear = currentFraction + VACANCY_ELECTION_DELAY_YEARS;
    }
  } else {
    const currentFraction = state.year + (state.dayInYear ?? 0) / DAYS_PER_YEAR;
    state.pendingElectionYear = currentFraction + VACANCY_ELECTION_DELAY_YEARS;
  }
}

/**
 * Backward-compatible hook: delegates to electionPromises.ts.
 */
export function setNewLeaderPromise(state: WorldState): void {
  recordElectionPromises(state, state.year);
}

