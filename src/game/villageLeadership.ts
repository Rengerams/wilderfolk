import type { ElectionCeremonyPhase, ElectionCeremonyState, Entity, WorldState } from './gameTypes';
import { maybeOfferValleyDebate } from './storyEvents';
import { recordElectionPromises, tickElectionPromises } from './electionPromises';
import { BuildingType, EntityType } from './gameTypes';
import { DAYS_PER_YEAR, getAgeInYears, HUMAN_ADULT_MIN_AGE, isImprisoned, TICKS_PER_DAY } from './dayCycle';
import { logEvent } from './eventLog';
import { isPlayerHuman } from './playerHuman';
import { sayHumanChatPhrase } from './humanChat';
import { ensureEntitySkills } from './skills';
import { simulateElectionVotes } from './electionVotes';
import { applyLeaderOccupation, syncLeaderHouseResidency } from './leaderHouse';
import { seededRandomForRun } from './simRng';
import { humanDisplayName } from './citizenId';

/**
 * Years between scheduled (end-of-term) elections.
 *
 * 2 = a session-length decision from playtesting, not a lore figure (developer,
 * 2026-09-08: a 10-year term "is like maybe 100 hours real life", and ordinary
 * sessions are not five hours long). Arithmetic behind that: an in-game day is 72
 * real seconds at 1× (`gameLoop.BASE_TICKS_PER_SECOND = 1`, `TICKS_PER_DAY = 72`),
 * so a year is ~7.2 h at 1× and ~2.4 h at a nominal 3× (`SPEED_OPTIONS` in
 * `App.tsx`). Treat the higher multipliers as nominal only: the loop can request at
 * most `MAX_PIPELINE_DEPTH` (4) worker ticks per round-trip, so the achievable rate
 * falls short of the selected one as the colony grows. A 10-year term therefore
 * spans many sittings at any speed a player actually sustains, so most colonies
 * never reached a second election; the term was shortened 10 → 5 → 2 during play so
 * a campaign contains several.
 */
export const ELECTION_INTERVAL_YEARS = 2;
/** 0.25 year = the 3-month campaign a vacancy allows before the successor election. */
export const VACANCY_ELECTION_DELAY_YEARS = 0.25;
export const ELECTION_PARTY_DAYS = 1;
export const ELECTION_PARTY_NAME = 'Election Revelry';

// Months are a display division of the one canonical year (`dayCycle`/`dayCycleClock` →
// `gameConstants.Time.DAYS_PER_YEAR`), not a second calendar: the audit flagged the old local
// `DAYS_PER_YEAR = 30 * 12` as a second definition that would drift silently if the year changed.
const MONTHS_PER_YEAR = 12;
const DAYS_PER_MONTH = DAYS_PER_YEAR / MONTHS_PER_YEAR;

/** Gossip lasts 2 months before the vote. */
const GOSSIP_MONTHS = 2;

function getPhaseTicks(phase: 'gathering' | 'gossip' | 'tension'): number {
  switch (phase) {
    case 'gathering':
      return 12;
    case 'gossip':
      return GOSSIP_MONTHS * DAYS_PER_MONTH * TICKS_PER_DAY;
    case 'tension':
      return 12;
  }
}

/**
 * Why a leadership election is being held.
 *
 * `term` is the scheduled election that ends a normal term: every
 * ELECTION_INTERVAL_YEARS (2) years, at Years 2, 4, 6, … The token was named
 * `decennial` under the original 10-year term and stopped matching once terms
 * were shortened (5 years, now 2), so it is `term`; `validateVillageLeaderOnLoad`
 * migrates saves that still carry the old token.
 */
export type LeadershipElectionReason = 'founding' | 'term' | 'succession';
export type { ElectionCeremonyPhase, ElectionCeremonyState } from './gameTypes';

export interface LeadershipScoreBreakdown {
  entityId: number;
  name: string;
  totalScore: number;
  skillPoints: number;
  experiencePoints: number;
  servicePoints: number;
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

const RECORD_ECONOMY_GOOD = 4;
const RECORD_ECONOMY_POOR = -5;
const RECORD_SCANDAL_CLEAN = 3;
const RECORD_SCANDAL_EACH = -5;
const RECORD_VILLAGE_GOOD = 3;
const RECORD_VILLAGE_POOR = -6;
const RECORD_POSITIVE_CAP = 8;
const TITLE_MERIT_BONUS = 8;

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
 * A leader's or candidate's display name for notices.
 *
 * Delegates to `citizenId.humanDisplayName`, the owner of this format. This was a private copy whose
 * fallback was `'Unknown'`, while `workforce` carried a second copy falling back to `'Settler'` and
 * the owner says `'A settler'` — so one nameless settler had three names depending on which log line
 * mentioned them (`tests/settlerNameFallback.singleOwner.test.ts`).
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
  if (state.ecosystemHealth >= 60) score += 1;
  else if (state.ecosystemHealth < 30) score -= 2;

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
    if (e.type === 'event' && e.message.includes('imprisoned for scandal')) {
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
  const totalPoints = rawTotal > 0 ? Math.min(rawTotal, RECORD_POSITIVE_CAP) : rawTotal;

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

export function getLeadershipScoreBreakdown(
  state: WorldState,
  entity: Entity,
): LeadershipScoreBreakdown {
  const skills = ensureEntitySkills(entity);
  const skillSum = Object.values(skills).reduce((sum, value) => sum + (value ?? 0), 0);
  const skillPoints = Math.round(skillSum * 2);
  const ageYears = leadershipAgeYears(entity, state);
  const experiencePoints = Math.round(
    Math.min(Math.max(0, ageYears - HUMAN_ADULT_MIN_AGE), 200) * 0.25,
  );

  const townHall = state.buildings.find(
    (b) => b.completed && b.type === BuildingType.TownHall && b.faction !== 'rival',
  );
  const servicePoints = townHall?.occupants.includes(entity.id) ? 15 : 0;
  const communityPoints = entity.relationshipStatus === 'married' ? 5 : 0;
  const titlePoints = entity.title ? TITLE_MERIT_BONUS : 0;
  const recordPoints = getIncumbentRecordPoints(state, entity);
  const baseScore = skillPoints + experiencePoints + servicePoints + communityPoints + titlePoints;

  return {
    entityId: entity.id,
    name: formatSettlerName(entity),
    skillPoints,
    experiencePoints,
    servicePoints,
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
  const candidates: LeadershipScoreBreakdown[] = [];

  for (let i = 0; i < state.entities.length; i++) {
    const entity = state.entities[i];
    if (!isEligibleForLeadership(entity, state)) continue;
    ageById.set(entity.id, leadershipAgeYears(entity, state));
    candidates.push(getLeadershipScoreBreakdown(state, entity));
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
  // Imprisonment must not clear the office — scandal sentences keep villageLeaderId
  // and the leader occupation for the whole term (N14). Elections still exclude
  // jailed candidates via isEligibleForLeadership.
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
  if (b.titlePoints > 0) parts.push(`title +${b.titlePoints}`);
  if (b.servicePoints > 0) parts.push(`Town Hall +${b.servicePoints}`);
  if (b.communityPoints > 0) parts.push(`family +${b.communityPoints}`);
  if (b.recordPoints > 0) parts.push(`record +${b.recordPoints}`);
  if (b.recordPoints < 0) parts.push(`record ${b.recordPoints}`);
  return `merit ${b.totalScore} (${parts.join(', ')})`;
}

export function getElectionGatherSite(state: WorldState): { x: number; y: number } {
  const hall = state.buildings.find(
    (b) => b.completed && b.type === BuildingType.TownHall && b.faction !== 'rival',
  );
  if (hall) {
    return { x: hall.x + hall.width / 2, y: hall.y + hall.height / 2 };
  }
  return { x: state.width / 2, y: state.height / 2 };
}

export function isElectionCeremonyActive(state: WorldState): boolean {
  return state.electionCeremony != null;
}

const GATHER_SLOTS_PER_RING = 12;

export function getElectionGatherTarget(state: WorldState, entityId: number): { x: number; y: number } {
  const c = state.electionCeremony;
  if (!c) return getElectionGatherSite(state);

  // This runs once per settler while a ceremony is active, and it used to rebuild and sort the whole
  // attendee list every time. That list cannot be hoisted for the tick: it is the *live* set, and
  // `isEligibleForLeadership` reads `alive` and `isJuvenile`, both of which this same human loop
  // changes between two calls — it kills settlers on the exhaustion and daily-mortality paths, and
  // `tryGraduateHumanChild` clears `isJuvenile` (N-5). So take the one number the caller needs
  // instead: its index in the id-sorted attendee list. Ids are unique, so that index is exactly the
  // number of eligible entities holding a smaller id — one pass, no array, no sort.
  let slot = 0;
  let attendeeCount = 0;
  let isAttendee = false;
  for (let i = 0; i < state.entities.length; i++) {
    const entity = state.entities[i];
    if (!isEligibleForLeadership(entity, state)) continue;
    attendeeCount++;
    if (entity.id === entityId) isAttendee = true;
    else if (entity.id < entityId) slot++;
  }

  if (!isAttendee) {
    const outerRing = Math.ceil(attendeeCount / GATHER_SLOTS_PER_RING);
    const angle = ((entityId * 17) % 360) * (Math.PI / 180);
    const ringRadius = 22 + outerRing * 14 + 28;
    return {
      x: c.gatherX + Math.cos(angle) * ringRadius,
      y: c.gatherY + Math.sin(angle) * ringRadius,
    };
  }

  const ring = Math.floor(slot / GATHER_SLOTS_PER_RING);
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
    'event',
    `${name} leads the founding colony until the first merit election (Year ${ELECTION_INTERVAL_YEARS})`,
    name,
  );
}

export function getElectionCeremonyStatus(state: WorldState): string | null {
  // A pending date is a vacancy only while nobody is *acting* as head: a stale date left behind by
  // an election that already filled the office must never be announced as "No village head". The
  // gossip/buildup path already pairs the two this way.
  if (state.pendingElectionYear != null && !state.electionCeremony && !getVillageLeader(state)) {
    const currentFraction = state.year + (state.dayInYear ?? 0) / DAYS_PER_YEAR;
    const until = Math.max(0, state.pendingElectionYear - currentFraction);
    if (until > 0) {
      return `No village head — merit election in ${formatElectionDelay(until)} (Year ${Math.floor(state.pendingElectionYear)}).`;
    }
    return 'Leadership election imminent — settlers will gather soon.';
  }

  if (state.electionCeremony) {
    const labels: Record<ElectionCeremonyPhase, string> = {
      gathering: 'The election season begins — settlers gather at the Town Hall.',
      gossip: 'Months of gossip — the village debates who should lead.',
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

function pickElectionGossipPhrase(
  state: WorldState,
  tone: 'buildup' | 'ceremony' | 'tension',
): string {
  const race = pickTopCandidates(state, 4);
  const leader = getVillageLeader(state);
  const leaderName = leader ? formatSettlerName(leader) : 'our head';
  const challengers = leader ? race.filter((b) => b.entityId !== leader.id) : race;
  const a = challengers[0]?.name ?? race[0]?.name ?? 'someone';
  const b = challengers[1]?.name ?? race[1]?.name ?? 'another';
  const c = challengers[2]?.name ?? race[2]?.name ?? 'a dark horse';
  const record = leader ? getIncumbentRecordAssessment(state, leader) : null;

  const recordBuildup = record
    ? [
        record.economyStatus === 'good'
          ? `Prosperity favors ${leaderName} — the stores are full.`
          : record.economyStatus === 'poor'
            ? `Hard times hurt ${leaderName} at the polls.`
            : null,
        record.scandalStatus === 'clean'
          ? `${leaderName} kept a clean name — that helps.`
          : `Those scandals still haunt ${leaderName}…`,
        record.villageStatus === 'good'
          ? `The village is thriving under ${leaderName}.`
          : record.villageStatus === 'poor'
            ? `Folks blame ${leaderName} for how bad things are.`
            : null,
      ].filter((line): line is string => line != null)
    : [];

  const buildup = [
    `Election next year — will ${leaderName} keep the crown?`,
    `I hear ${a} is gaining support…`,
    `${b} served well — worth watching.`,
    leader
      ? `The village buzzes about ${leaderName}, ${a}, and ${b}.`
      : `The village buzzes about ${a} and ${b}.`,
    `Who will lead us after ${leaderName}?`,
    `${c} might surprise us next election.`,
    ...recordBuildup,
  ];

  const ceremony = leader
    ? [
        `Who will it be — ${leaderName} or ${a}?`,
        `Well, I know one thing — ${leaderName} has quite the reputation in town!`,
        `${a} challenges ${leaderName} for the crown.`,
        `Can ${leaderName} hold off ${a}?`,
        `${leaderName} is defending — ${a} has the merit, I think.`,
        `Time for a change from ${leaderName}?`,
        `${b} deserves a chance against ${leaderName}.`,
        ...recordBuildup,
      ]
    : [
        `Who will it be — ${a} or ${b}?`,
        `${a} has the merit, I think.`,
        `The Hall favors ${b}…`,
        `Time for a fresh village head?`,
        `I’m voting ${a} in my heart.`,
        `${b} deserves a chance.`,
      ];

  const tension = [
    'Quiet… they’re about to announce…',
    'My heart is pounding…',
    'Who did the merit favor?',
    'Shh — here comes the result…',
  ];

  const pool = tone === 'buildup' ? buildup : tone === 'tension' ? tension : ceremony;
  const idx = (state.tick * 17 + pool.length * 3) % pool.length;
  return pool[idx];
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

  sayHumanChatPhrase(speaker, pickElectionGossipPhrase(state, tone), 110);
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
      'event',
      `Leadership election postponed (Year ${year}) — no eligible candidates`,
    );
    return false;
  }

  const vote = simulateElectionVotes(state, ranked);
  const winner = ranked.find((b) => b.entityId === vote.winnerId) ?? ranked[0];
  const site = getElectionGatherSite(state);

  state.electionCeremony = {
    phase: 'gathering',
    phaseTicksLeft: getPhaseTicks('gathering'),
    gatherX: site.x,
    gatherY: site.y,
    reason,
    pendingLeaderId: winner.entityId,
    pendingLeaderName: winner.name,
    pendingChanged: state.villageLeaderId !== winner.entityId,
  };

  const place = state.buildings.some(
    (b) => b.completed && b.type === BuildingType.TownHall && b.faction !== 'rival',
  )
    ? 'the Town Hall'
    : 'the village center';

  logEvent(
    state,
    'event',
    `Leadership election ceremony began at ${place} (Year ${year})`,
    winner.name,
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
      message: `Year ${electionYear} — leadership election next year. Settlers are already whispering about who should lead ${state.villageName}.`,
    };
  }

  return null;
}

function refreshCeremonyPendingLeader(state: WorldState, ceremony: ElectionCeremonyState): void {
  const ranked = rankLeadershipCandidates(state);
  if (ranked.length === 0) return;
  const vote = simulateElectionVotes(state, ranked);
  const winner = ranked.find((b) => b.entityId === vote.winnerId) ?? ranked[0];
  ceremony.pendingLeaderId = winner.entityId;
  ceremony.pendingLeaderName = winner.name;
  ceremony.pendingChanged = state.villageLeaderId !== winner.entityId;
}

function advanceCeremonyPhase(state: WorldState, ceremony: ElectionCeremonyState): void {
  if (ceremony.phase === 'gathering') {
    ceremony.phase = 'gossip';
    ceremony.phaseTicksLeft = getPhaseTicks('gossip');
  } else if (ceremony.phase === 'gossip') {
    ceremony.phase = 'tension';
    ceremony.phaseTicksLeft = getPhaseTicks('tension');
  } else if (ceremony.phase === 'tension') {
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
        sayHumanChatPhrase(winner, 'I will serve the village!', 140);
      }

      if (announcement) {
        state.festival = {
          active: true,
          name: ELECTION_PARTY_NAME,
          daysLeft: ELECTION_PARTY_DAYS,
        };
        logEvent(
          state,
          'event',
          `Election revelry began — ${ELECTION_PARTY_DAYS} days of celebration`,
          result.leaderName,
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
        'event',
        `Leadership election failed (Year ${year}) — ${detail}`,
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
  }

  if (ceremony.phase === 'gossip' && state.tick % 18 === 0) {
    tickElectionGossip(state);
  }
  if (ceremony.phase === 'tension' && state.tick % 24 === 0) {
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
    // A reveal with no eligible candidate must still schedule the successor
    // election: settlers who come of age or leave prison re-open the race, and
    // the colony must never be left with no path back to a village head.
    if (state.pendingElectionYear == null) {
      const electionYear =
        state.year + (state.dayInYear ?? 0) / DAYS_PER_YEAR + VACANCY_ELECTION_DELAY_YEARS;
      state.pendingElectionYear = electionYear;
      logEvent(
        state,
        'event',
        `Leadership election found no eligible candidate — merit election scheduled for Year ${Math.floor(electionYear)}`,
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

  const vote = simulateElectionVotes(state, ranked);
  const winner = ranked.find((b) => b.entityId === vote.winnerId) ?? ranked[0];
  const prevId = state.villageLeaderId;
  const changed = prevId !== winner.entityId;

  state.villageLeaderId = winner.entityId;
  state.leaderSinceYear = year;
  applyLeaderOccupation(state, prevId);
  syncLeaderHouseResidency(state);

  // Electing a head settles whatever vacancy was pending, so the schedule is cleared here.
  // Without this, a leader who dies or is imprisoned while a ceremony is running leaves the
  // successor date that `tickLeaderVacancy` set for them: the running ceremony then fills the
  // office with that date still armed, `getElectionCeremonyStatus` announces a vacancy nobody has,
  // and `tryStartVacancyElectionCeremony` runs a *second* full ceremony for the filled seat. While
  // the stale date sits there `tickLeaderVacancy` also early-returns, so the next real vacancy would
  // never be scheduled either (docs/private/audits/2026-09-16/LIVE-FINDINGS-STATUS.md, H2).
  state.pendingElectionYear = null;

  if (reason === 'term' || reason === 'founding') {
    state.lastElectionYear = year;
  }

  const ballot = `${vote.winnerVotes} of ${vote.totalVotes} ballots`;
  if (reason === 'founding') {
    logEvent(
      state,
      'event',
      `${winner.name} elected founding village head — ${ballot} · ${scoreSummary(winner)}`,
      winner.name,
    );
  } else if (reason === 'term') {
    logEvent(
      state,
      'event',
      changed
        ? `${winner.name} elected village head (Year ${year}) — ${ballot} · ${scoreSummary(winner)}`
        : `${winner.name} re-elected village head (Year ${year}) — ${ballot} · ${scoreSummary(winner)}`,
      winner.name,
    );
  } else {
    logEvent(
      state,
      'event',
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
    message: `${result.leaderName} ${verb} (Year ${year}). Elected by ballot — ${ballots}${merit}.`,
    leaderName: result.leaderName,
    changed: result.changed,
    reason,
  };
}

/**
 * The one formatter for an election countdown. `getYearsUntilElection` returns a
 * fractional year while a vacancy is pending (`pendingElectionYear` is
 * `currentFraction + VACANCY_ELECTION_DELAY_YEARS`), so no surface may interpolate the
 * raw number — it printed `0.08333333333333333 years`
 * (BUG_REPORTS/2026-09-17-election-countdown-prints-a-fraction.md).
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
  if (state.pendingElectionYear != null) return null;

  const leaderId = state.villageLeaderId;
  if (leaderId == null) return null;

  const leader = state.entities.find((e) => e.id === leaderId);
  if (leader && isActingVillageHead(leader, state)) return null;

  if (!state.entities.some((entity) => isEligibleForLeadership(entity, state))) {
    // Nobody can stand yet, but the office must not be left with no successor
    // election scheduled: the vacancy notice and the race itself resume as soon
    // as a settler comes of age or is released.
    state.villageLeaderId = null;
    state.pendingElectionYear =
      state.year + (state.dayInYear ?? 0) / DAYS_PER_YEAR + VACANCY_ELECTION_DELAY_YEARS;
    return null;
  }

  const currentFraction = state.year + (state.dayInYear ?? 0) / DAYS_PER_YEAR;
  const electionYear = currentFraction + VACANCY_ELECTION_DELAY_YEARS;
  state.pendingElectionYear = electionYear;
  state.villageLeaderId = null;

  const name = leader ? formatSettlerName(leader) : 'The village head';
  logEvent(
    state,
    'event',
    `${name} can no longer lead — merit election scheduled for Year ${Math.floor(electionYear)}`,
    name,
  );

  const delayText = formatElectionDelay(VACANCY_ELECTION_DELAY_YEARS);
  return {
    title: '👑 Leadership vacancy',
    message: `${name} can no longer lead. A merit election will be held in ${delayText} (Year ${Math.floor(electionYear)}).`,
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

  // This is the *vacancy* scheduler: it runs only because `pendingElectionYear` was armed by a death,
  // a deposition or a postponed term election, so its outcome is a succession even when it lands in a
  // term year (Year 2, 4, 6 …). Deriving the label from the year instead made such a handover announce
  // itself as "elected/re-elected village head" and stamp `lastElectionYear` — the year's term slot —
  // for a mid-term change of head (`LIVE-FINDINGS-STATUS.md`, L11).
  const started = startElectionCeremony(state, Math.floor(year), 'succession');
  if (started) {
    state.pendingElectionYear = null;
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
    // `startElectionCeremony` returns false for exactly one reason — its zero-candidate guard — and
    // this gate only opens on `dayInYear === 0`, so without a retry a colony whose adults are all
    // imprisoned or ineligible stays headless until the next term year, two years away. Arm the same
    // delay the death path uses; the retry is then run by `tryStartVacancyElectionCeremony`
    // (`LIVE-FINDINGS-STATUS.md`, L3). The eventual ceremony is labelled a succession, which is what a
    // merit election held to fill an office nobody could contest is.
    state.pendingElectionYear = year + dayInYear / DAYS_PER_YEAR + VACANCY_ELECTION_DELAY_YEARS;
  }
  return started;
}

function isValidElectionCeremony(value: unknown): value is ElectionCeremonyState {
  if (!value || typeof value !== 'object') return false;
  const ceremony = value as Partial<ElectionCeremonyState>;
  const phases: ElectionCeremonyPhase[] = ['gathering', 'gossip', 'tension', 'reveal'];
  return (
    typeof ceremony.phase === 'string' &&
    phases.includes(ceremony.phase as ElectionCeremonyPhase) &&
    typeof ceremony.phaseTicksLeft === 'number' &&
    Number.isFinite(ceremony.phaseTicksLeft) &&
    typeof ceremony.gatherX === 'number' &&
    typeof ceremony.gatherY === 'number' &&
    typeof ceremony.reason === 'string' &&
    typeof ceremony.pendingLeaderId === 'number' &&
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

  // Saves from the 10-year era (and the 5-year era that followed) stored the
  // scheduled election under the name 'decennial'. Terms are ELECTION_INTERVAL_YEARS
  // (2) years and the token is now 'term'; rewrite the old value so ceremony text
  // and re-election wording stay correct for imported saves.
  if (state.electionCeremony != null && (state.electionCeremony.reason as string) === 'decennial') {
    state.electionCeremony.reason = 'term';
  }

  const leader = getVillageLeader(state);
  if (leader) {
    applyLeaderOccupation(state, null);
    syncLeaderHouseResidency(state);
    // Heal a save written while the seat was contested: with an acting head the pending date is
    // stale by definition, and leaving it would suppress both the vacancy notice and every future
    // `tickLeaderVacancy` schedule (LIVE-FINDINGS-STATUS.md, H2).
    state.pendingElectionYear = null;
    return;
  }

  // The office is vacant — the id points at a dead, deposed, or ineligible settler
  // (an imprisoned leader is still acting, so it never reaches this branch). Drop
  // the dangling id so no stale "village head" reference outlives its term; the
  // election scheduling below still runs.
  state.villageLeaderId = null;

  if (state.pendingElectionYear != null) return;

  if (state.lastElectionYear === 0) {
    const founder = findFoundingColonyLeader(state);
    if (founder) appointFoundingLeader(state, founder);
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

/**
 * Advances evaluation for campaign promises from electionPromises.ts.
 */
export function tickLeaderPromise(state: WorldState): void {
  tickElectionPromises(state);
}