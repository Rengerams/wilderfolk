import type { ElectionCeremonyPhase, ElectionCeremonyState, Entity, WorldState } from './gameTypes';
import { BuildingType, EntityType } from './gameTypes';
import { HUMAN_ADULT_MIN_AGE, isImprisoned, TICKS_PER_DAY } from './dayCycle';
import { getAgeInYears } from './worldGen';
import { logEvent } from './eventLog';
import { isPlayerHuman } from './groupEvents';
import { sayHumanChatPhrase } from './humanChat';
import { ensureEntitySkills } from './skills';

export const ELECTION_INTERVAL_YEARS = 10;
export const VACANCY_ELECTION_DELAY_YEARS = 2;
export const ELECTION_PARTY_DAYS = 3;
export const ELECTION_PARTY_NAME = 'Election Revelry';

const PHASE_TICKS = {
  gathering: 12,
  gossip: TICKS_PER_DAY,
  tension: 12,
} as const;

export type LeadershipElectionReason = 'founding' | 'decennial' | 'succession';
export type { ElectionCeremonyPhase, ElectionCeremonyState } from './gameTypes';

export interface LeadershipScoreBreakdown {
  entityId: number;
  name: string;
  totalScore: number;
  skillPoints: number;
  experiencePoints: number;
  servicePoints: number;
  communityPoints: number;
  /** Incumbent-only election bonuses/penalties from economy, scandals, and village health. */
  recordPoints: number;
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

/** Modest incumbent edge — personal merit remains primary; challengers can still win. */
const RECORD_ECONOMY_GOOD = 4;
const RECORD_ECONOMY_POOR = -5;
const RECORD_SCANDAL_CLEAN = 3;
const RECORD_SCANDAL_EACH = -5;
const RECORD_VILLAGE_GOOD = 3;
const RECORD_VILLAGE_POOR = -6;
/** Cap positive record so a high-merit challenger can beat a popular sitting head. */
const RECORD_POSITIVE_CAP = 8;

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

export function formatSettlerName(entity: Entity): string {
  const base = entity.name || 'Unknown';
  return entity.surname ? `${base} ${entity.surname}` : base;
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
  const leaderName = formatSettlerName(leader);
  const baseName = leader.name || '';
  return e.entityName === leaderName || (baseName.length > 0 && e.entityName === baseName);
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

/** Incumbent election record — economy, scandal history, and village health since taking office. */
export function getIncumbentRecordAssessment(
  state: WorldState,
  leader: Entity,
): IncumbentRecordAssessment {
  const economyStatus = assessVillageEconomy(state);
  const villageStatus = assessVillageHealth(state);
  const scandalCount = countLeaderScandalsDuringTerm(state, leader);

  const economyPoints = economyStatus === 'good'
    ? RECORD_ECONOMY_GOOD
    : economyStatus === 'poor'
      ? RECORD_ECONOMY_POOR
      : 0;
  const villageHealthPoints = villageStatus === 'good'
    ? RECORD_VILLAGE_GOOD
    : villageStatus === 'poor'
      ? RECORD_VILLAGE_POOR
      : 0;
  const scandalPoints = scandalCount === 0
    ? RECORD_SCANDAL_CLEAN
    : scandalCount * RECORD_SCANDAL_EACH;

  const rawTotal = economyPoints + scandalPoints + villageHealthPoints;
  const totalPoints = rawTotal > 0
    ? Math.min(rawTotal, RECORD_POSITIVE_CAP)
    : rawTotal;

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

/** Merit elections — adult player settlers only; no gender preference (founding leader is separate). */
export function isEligibleForLeadership(entity: Entity, state?: Pick<WorldState, 'year' | 'dayInYear' | 'tick'>): boolean {
  const ageYears = state ? leadershipAgeYears(entity, state) : entity.age;
  return (
    entity.alive
    && entity.type === EntityType.Human
    && isPlayerHuman(entity)
    && !entity.isJuvenile
    && ageYears >= HUMAN_ADULT_MIN_AGE
    && !isImprisoned(entity)
  );
}

/** Merit score — highest wins each election; no term limit (re-election unlimited if merit stays highest). */
export function getLeadershipScoreBreakdown(state: WorldState, entity: Entity): LeadershipScoreBreakdown {
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
  const recordPoints = getIncumbentRecordPoints(state, entity);
  const baseScore = skillPoints + experiencePoints + servicePoints + communityPoints;

  return {
    entityId: entity.id,
    name: formatSettlerName(entity),
    skillPoints,
    experiencePoints,
    servicePoints,
    communityPoints,
    recordPoints,
    totalScore: baseScore + recordPoints,
  };
}

export function rankLeadershipCandidates(state: WorldState): LeadershipScoreBreakdown[] {
  const ageById = new Map<number, number>();
  const candidates: LeadershipScoreBreakdown[] = [];
  for (const entity of state.entities) {
    if (!isEligibleForLeadership(entity, state)) continue;
    ageById.set(entity.id, leadershipAgeYears(entity, state));
    candidates.push(getLeadershipScoreBreakdown(state, entity));
  }

  candidates.sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    const ageA = ageById.get(a.entityId) ?? 0;
    const ageB = ageById.get(b.entityId) ?? 0;
    if (ageB !== ageA) return ageB - ageA;
    return a.entityId - b.entityId;
  });

  return candidates;
}

/** Merit-ranked race lineup for gossip and UI — sitting head always listed when still eligible. */
export function getElectionRaceCandidates(
  state: WorldState,
  displayLimit = 4,
): LeadershipScoreBreakdown[] {
  const ranked = rankLeadershipCandidates(state);
  if (ranked.length === 0) return [];

  const leader = getVillageLeader(state);
  if (!leader) return ranked.slice(0, displayLimit);

  const leaderIdx = ranked.findIndex((b) => b.entityId === leader.id);
  const leaderBreakdown = leaderIdx >= 0
    ? ranked[leaderIdx]
    : getLeadershipScoreBreakdown(state, leader);

  const top = ranked.slice(0, displayLimit);
  if (top.some((b) => b.entityId === leader.id)) return top;

  const challengers = ranked
    .filter((b) => b.entityId !== leader.id)
    .slice(0, displayLimit - 1);
  const race = [...challengers, leaderBreakdown];
  const ageById = new Map(
    state.entities
      .filter((entity) => isEligibleForLeadership(entity, state))
      .map((entity) => [entity.id, leadershipAgeYears(entity, state)] as const),
  );
  race.sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    const ageA = ageById.get(a.entityId) ?? 0;
    const ageB = ageById.get(b.entityId) ?? 0;
    if (ageB !== ageA) return ageB - ageA;
    return a.entityId - b.entityId;
  });
  return race;
}

export function getVillageLeader(state: WorldState): Entity | null {
  if (state.villageLeaderId == null) return null;
  const leader = state.entities.find((e) => e.id === state.villageLeaderId);
  if (!leader?.alive || !isEligibleForLeadership(leader, state)) return null;
  return leader;
}

export function isVillageLeader(state: WorldState, entityId: number): boolean {
  return state.villageLeaderId === entityId && getVillageLeader(state) != null;
}

export function getYearsUntilElection(state: WorldState): number {
  if (state.pendingElectionYear != null) {
    return Math.max(0, state.pendingElectionYear - state.year);
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
  const parts = [
    `skills ${b.skillPoints}`,
    `experience ${b.experiencePoints}`,
  ];
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
  const attendees = state.entities
    .filter((entity) => isEligibleForLeadership(entity, state))
    .sort((a, b) => a.id - b.id);
  const slot = attendees.findIndex((entity) => entity.id === entityId);
  if (slot < 0) {
    const outerRing = Math.ceil(attendees.length / GATHER_SLOTS_PER_RING);
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

/** First male pioneer leads at founding — no merit vote until Year 10. */
export function appointFoundingLeader(state: WorldState, entity: Entity): void {
  state.villageLeaderId = entity.id;
  state.leaderSinceYear = state.year;
  state.lastElectionYear = 0;
  state.pendingElectionYear = null;
  const name = formatSettlerName(entity);
  logEvent(
    state,
    'event',
    `${name} leads the founding colony until the first merit election (Year ${ELECTION_INTERVAL_YEARS})`,
    name,
  );
}

export function getElectionCeremonyStatus(state: WorldState): string | null {
  if (state.pendingElectionYear != null && !state.electionCeremony) {
    const until = state.pendingElectionYear - state.year;
    if (until > 0) {
      return `No village head — merit election in ${until} year${until === 1 ? '' : 's'} (Year ${state.pendingElectionYear}).`;
    }
    return 'Leadership election imminent — settlers will gather soon.';
  }
  if (state.electionCeremony) {
    const labels: Record<ElectionCeremonyPhase, string> = {
      gathering: 'Election day — settlers are gathering at the Town Hall.',
      gossip: 'Election day — villagers gossip about who should lead.',
      tension: 'Election day — the crowd waits for the result…',
      reveal: 'Election day — announcing the village head!',
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
  const challengers = leader
    ? race.filter((b) => b.entityId !== leader.id)
    : race;
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
        `${a} challenges ${leaderName} for the crown.`,
        `Can ${leaderName} hold off ${a}?`,
        `${leaderName} is defending — ${a} has the merit, I think.`,
        `Ten years — time for a change from ${leaderName}?`,
        `${b} deserves a chance against ${leaderName}.`,
        ...recordBuildup,
      ]
    : [
        `Who will it be — ${a} or ${b}?`,
        `${a} has the merit, I think.`,
        `The Hall favors ${b}…`,
        `Ten years — time for a change?`,
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

/** Random settler gossip — buildup year, election year, or ceremony phases. */
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
    } else if (state.electionCeremony!.phase === 'gossip' || state.electionCeremony!.phase === 'gathering') {
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

  if (Math.random() > chance) return;

  const eligible = state.entities.filter((entity) => isEligibleForLeadership(entity, state));
  const speaker = eligible[Math.floor(Math.random() * eligible.length)];
  if (!speaker) return;

  sayHumanChatPhrase(speaker, pickElectionGossipPhrase(state, tone), 110);
}

export function startElectionCeremony(
  state: WorldState,
  year: number,
  reason: 'founding' | 'decennial' | 'succession',
): boolean {
  const ranked = rankLeadershipCandidates(state);
  if (ranked.length === 0) {
    logEvent(
      state,
      'event',
      `Leadership election postponed (Year ${year}) — no eligible candidates`,
    );
    return false;
  }

  const winner = ranked[0];
  const site = getElectionGatherSite(state);
  state.electionCeremony = {
    phase: 'gathering',
    phaseTicksLeft: PHASE_TICKS.gathering,
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

/** Year-start / buildup notifications — call on calendar day 0. */
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
  const winner = ranked[0];
  ceremony.pendingLeaderId = winner.entityId;
  ceremony.pendingLeaderName = winner.name;
  ceremony.pendingChanged = state.villageLeaderId !== winner.entityId;
}

function advanceCeremonyPhase(state: WorldState, ceremony: ElectionCeremonyState): void {
  if (ceremony.phase === 'gathering') {
    ceremony.phase = 'gossip';
    ceremony.phaseTicksLeft = PHASE_TICKS.gossip;
  } else if (ceremony.phase === 'gossip') {
    ceremony.phase = 'tension';
    ceremony.phaseTicksLeft = PHASE_TICKS.tension;
  } else if (ceremony.phase === 'tension') {
    ceremony.phase = 'reveal';
    ceremony.phaseTicksLeft = 1;
  }
  refreshCeremonyPendingLeader(state, ceremony);
}

/** Advance ceremony each tick; returns announcement when the winner is revealed. */
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
): { leaderId: number | null; changed: boolean; leaderName: string; breakdown: LeadershipScoreBreakdown | null } {
  const ranked = rankLeadershipCandidates(state);
  if (ranked.length === 0) {
    const changed = state.villageLeaderId != null;
    state.villageLeaderId = null;
    return { leaderId: null, changed, leaderName: '', breakdown: null };
  }

  const winner = ranked[0];
  const prevId = state.villageLeaderId;
  const changed = prevId !== winner.entityId;

  state.villageLeaderId = winner.entityId;
  state.leaderSinceYear = year;
  if (reason === 'decennial' || reason === 'founding') {
    state.lastElectionYear = year;
  }

  if (reason === 'founding') {
    logEvent(
      state,
      'event',
      `${winner.name} elected founding village head — ${scoreSummary(winner)}`,
      winner.name,
    );
  } else if (reason === 'decennial') {
    logEvent(
      state,
      'event',
      changed
        ? `${winner.name} elected village head (Year ${year}) — ${scoreSummary(winner)}`
        : `${winner.name} re-elected village head (Year ${year}) — ${scoreSummary(winner)}`,
      winner.name,
    );
  } else {
    logEvent(
      state,
      'event',
      `${winner.name} succeeded as village head — ${scoreSummary(winner)}`,
      winner.name,
    );
  }

  return { leaderId: winner.entityId, changed, leaderName: winner.name, breakdown: winner };
}

/** @deprecated Use appointFoundingLeader on the first male pioneer */
export function runFoundingElection(state: WorldState): void {
  const founder = findFoundingColonyLeader(state);
  if (founder) appointFoundingLeader(state, founder);
}

function buildAnnouncement(
  result: ReturnType<typeof runVillageElection>,
  reason: LeadershipElectionReason,
  year: number,
): ElectionAnnouncement | null {
  if (!result.leaderName) return null;
  const title = reason === 'decennial'
    ? (result.changed ? '🗳️ New village head' : '🗳️ Head re-elected')
    : '👑 New village head';
  const verb = reason === 'decennial' && !result.changed ? 're-elected' : 'is now village head';
  const merit = result.breakdown ? scoreSummary(result.breakdown) : '';
  return {
    title,
    message: `${result.leaderName} ${verb} (Year ${year}). Elected by merit — ${merit}.`,
    leaderName: result.leaderName,
    changed: result.changed,
    reason,
  };
}

/** Leader died or became ineligible — schedule merit election in two years. */
export function tickLeaderVacancy(state: WorldState): ElectionBuildupNotice | null {
  if (state.pendingElectionYear != null) return null;

  const leaderId = state.villageLeaderId;
  if (leaderId == null) return null;

  const leader = state.entities.find((e) => e.id === leaderId);
  if (leader?.alive && isEligibleForLeadership(leader, state)) return null;

  if (!state.entities.some((entity) => isEligibleForLeadership(entity, state))) {
    state.villageLeaderId = null;
    return null;
  }

  const electionYear = state.year + VACANCY_ELECTION_DELAY_YEARS;
  state.pendingElectionYear = electionYear;
  state.villageLeaderId = null;

  const name = leader ? formatSettlerName(leader) : 'The village head';
  logEvent(
    state,
    'event',
    `${name} can no longer lead — merit election scheduled for Year ${electionYear}`,
    name,
  );

  return {
    title: '👑 Leadership vacancy',
    message: `${name} can no longer lead. A merit election will be held in ${VACANCY_ELECTION_DELAY_YEARS} years (Year ${electionYear}).`,
  };
}

/** Vacancy election — call on calendar day 0 when pending year is reached. */
export function tryStartVacancyElectionCeremony(
  state: WorldState,
  year: number,
  dayInYear: number,
): boolean {
  if (
    dayInYear !== 0
    || state.pendingElectionYear == null
    || year < state.pendingElectionYear
    || state.electionCeremony
  ) {
    return false;
  }

  const reason: LeadershipElectionReason =
    year > 0 && year % ELECTION_INTERVAL_YEARS === 0 ? 'decennial' : 'succession';

  const started = startElectionCeremony(state, year, reason);
  if (started) {
    state.pendingElectionYear = null;
  }
  return started;
}

/** Decennial election — starts multi-phase ceremony on calendar day 0. */
export function tryStartDecennialElectionCeremony(
  state: WorldState,
  year: number,
  dayInYear: number,
): boolean {
  if (
    dayInYear !== 0
    || year <= 0
    || year % ELECTION_INTERVAL_YEARS !== 0
    || state.lastElectionYear === year
    || state.electionCeremony
    || state.pendingElectionYear != null
  ) {
    return false;
  }
  return startElectionCeremony(state, year, 'decennial');
}

/** @deprecated Use tryStartDecennialElectionCeremony + tickElectionCeremony */
export function tickDecennialElection(
  state: WorldState,
  year: number,
  dayInYear: number,
): ElectionAnnouncement | null {
  if (tryStartDecennialElectionCeremony(state, year, dayInYear)) return null;
  return null;
}

function isValidElectionCeremony(value: unknown): value is ElectionCeremonyState {
  if (!value || typeof value !== 'object') return false;
  const ceremony = value as Partial<ElectionCeremonyState>;
  const phases: ElectionCeremonyPhase[] = ['gathering', 'gossip', 'tension', 'reveal'];
  return (
    typeof ceremony.phase === 'string'
    && phases.includes(ceremony.phase as ElectionCeremonyPhase)
    && typeof ceremony.phaseTicksLeft === 'number'
    && Number.isFinite(ceremony.phaseTicksLeft)
    && typeof ceremony.gatherX === 'number'
    && typeof ceremony.gatherY === 'number'
    && typeof ceremony.reason === 'string'
    && typeof ceremony.pendingLeaderId === 'number'
    && typeof ceremony.pendingLeaderName === 'string'
    && typeof ceremony.pendingChanged === 'boolean'
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
  const leader = getVillageLeader(state);
  if (leader) return;
  if (state.pendingElectionYear != null) return;
  if (state.lastElectionYear === 0) {
    const founder = findFoundingColonyLeader(state);
    if (founder) appointFoundingLeader(state, founder);
  }
}