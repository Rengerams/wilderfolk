import type { WorldState } from './gameTypes';
import { JobType } from './gameTypes';
import { friendshipScore, feudScore } from './relationships';
import { isPlayerHuman } from './playerHuman';
import { seededRandomForRun } from './simRng';

/**
 * Election vote-support (Phase 7) — every adult settler casts a ballot.
 * A bounded election-wide swing moves expected merit support; personal bonds then
 * weight each ballot without making every voter choose the same candidate.
 */

/** A structurally-minimal candidate — villageLeadership's score breakdown fits this. */
export interface VoteCandidate {
  entityId: number;
  name: string;
  totalScore: number;
}

export interface ElectionVoteResult {
  /** candidateId → ballots cast */
  tally: Map<number, number>;
  totalVotes: number;
  winnerId: number | null;
  winnerName: string;
  winnerVotes: number;
  /** Closest rival's ballot count (for close-race notes), or -1. */
  runnerUpVotes: number;
}

/** Friendships/feuds shift a voter's support by at most this many points. */
export const BOND_INFLUENCE_CAP = 15;

/** How much a friendship point is worth to a voter's support. */
const FRIEND_WEIGHT = 0.3;
/** How much a feud point costs (feuds hurt far more than friends help). */
const FEUD_WEIGHT = 0.5;
/** One shared election swing changes each candidate's expected merit by at most 20%. */
const ELECTION_SUPPORT_SWING_CAP = 0.2;
const VOTE_SUPPORT_TEMPERATURE = 20;

export function simulateElectionVotes(
  state: WorldState,
  candidates: VoteCandidate[],
  electionId = 0,
): ElectionVoteResult {
  const tally = new Map<number, number>();
  for (const c of candidates) tally.set(c.entityId, 0);

  const voters = state.entities.filter(
    (e) => e.alive && isPlayerHuman(e) && !e.isJuvenile,
  );
  const electionCandidates = candidates.map((candidate) => {
    const swing =
      (seededRandomForRun(
        `election-support-swing:${electionId}:${state.year}:${candidate.entityId}`,
      ) *
        2 -
        1) *
      ELECTION_SUPPORT_SWING_CAP;
    return { ...candidate, supportFactor: 1 + swing };
  });
  let totalVotes = 0;

  for (const voter of voters) {
    const supports: Array<{ entityId: number; support: number }> = [];
    let maxSupport = -Infinity;
    for (const c of electionCandidates) {
      const bond = Math.max(
        -BOND_INFLUENCE_CAP,
        Math.min(
          BOND_INFLUENCE_CAP,
          friendshipScore(voter, c.entityId) * FRIEND_WEIGHT - feudScore(voter, c.entityId) * FEUD_WEIGHT,
        ),
      );
      const foodNeed = state.resources.food / Math.max(1, state.humanPopulation) < 10;
      const securityNeed = (state.pendingRaidEvents?.length ?? 0) > 0;
      const occupationAffinity = voter.job != null && voter.job !== JobType.Settler && voter.job === state.entities.find((person) => person.id === c.entityId)?.job ? 8 : 0;
      const foodPreference = foodNeed && state.entities.find((person) => person.id === c.entityId)?.skills?.[JobType.Farmer] ? 4 : 0;
      const defensePreference = securityNeed ? Math.min(12, (state.entities.find((person) => person.id === c.entityId)?.battleLeadershipMerit ?? 0) / 5) : 0;
      const support = c.totalScore * c.supportFactor + bond + occupationAffinity + foodPreference + defensePreference;
      supports.push({ entityId: c.entityId, support });
      if (support > maxSupport) maxSupport = support;
    }

    if (supports.length > 0) {
      const weights = supports.map((candidate) =>
        Math.exp((candidate.support - maxSupport) / VOTE_SUPPORT_TEMPERATURE),
      );
      const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
      let roll = seededRandomForRun(`election-vote:${electionId}:${state.year}:${voter.id}`) * totalWeight;
      let chosenIndex = weights.length - 1;
      for (let i = 0; i < weights.length; i++) {
        roll -= weights[i];
        if (roll < 0) {
          chosenIndex = i;
          break;
        }
      }
      const chosenId = supports[chosenIndex].entityId;
      tally.set(chosenId, (tally.get(chosenId) ?? 0) + 1);
      totalVotes++;
    }
  }

  let winnerId: number | null = null;
  let winnerVotes = -1;
  let winnerMerit = -Infinity;
  let runnerUpVotes = -1;
  for (const c of candidates) {
    const votes = tally.get(c.entityId) ?? 0;
    if (votes > winnerVotes || (votes === winnerVotes && c.totalScore > winnerMerit)) {
      if (winnerId != null) runnerUpVotes = winnerVotes;
      winnerVotes = votes;
      winnerMerit = c.totalScore;
      winnerId = c.entityId;
    } else if (votes > runnerUpVotes) {
      runnerUpVotes = votes;
    }
  }
  const winner = candidates.find((c) => c.entityId === winnerId) ?? null;

  return {
    tally,
    totalVotes,
    winnerId,
    winnerName: winner?.name ?? '',
    winnerVotes,
    runnerUpVotes,
  };
}