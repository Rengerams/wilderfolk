import type { WorldState } from './gameTypes';
import { EntityType } from './gameTypes';
import { friendshipScore, feudScore } from './relationships';

/**
 * Election vote-support (Phase 7) — every adult settler casts a ballot.
 * Merit is the strongest force: a candidate ahead by more than BOND_INFLUENCE_CAP
 * points wins every ballot. Friendships and feuds only tip races that are close —
 * a friend's support is worth a little, a feud can cancel a vote entirely.
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

export function simulateElectionVotes(
  state: WorldState,
  candidates: VoteCandidate[],
): ElectionVoteResult {
  const tally = new Map<number, number>();
  for (const c of candidates) tally.set(c.entityId, 0);

  const voters = state.entities.filter(
    (e) => e.alive && e.type === EntityType.Human && !e.faction && !e.isJuvenile,
  );
  let totalVotes = 0;

  for (const voter of voters) {
    let bestId: number | null = null;
    let bestSupport = -Infinity;
    let bestMerit = -Infinity;
    for (const c of candidates) {
      const bond = Math.max(
        -BOND_INFLUENCE_CAP,
        Math.min(
          BOND_INFLUENCE_CAP,
          friendshipScore(voter, c.entityId) * FRIEND_WEIGHT - feudScore(voter, c.entityId) * FEUD_WEIGHT,
        ),
      );
      const support = c.totalScore + bond;
      if (support > bestSupport || (support === bestSupport && c.totalScore > bestMerit)) {
        bestSupport = support;
        bestMerit = c.totalScore;
        bestId = c.entityId;
      }
    }
    if (bestId != null) {
      tally.set(bestId, (tally.get(bestId) ?? 0) + 1);
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
