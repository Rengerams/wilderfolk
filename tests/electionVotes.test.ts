/**
 * Election vote-support regression tests — merit stays the strongest force;
 * friendships/feuds only tip races that are close.
 */
import { describe, it, expect } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { createEntity } from '../src/game/entityFactory';
import { EntityType } from '../src/game/gameTypes';
import { simulateElectionVotes, BOND_INFLUENCE_CAP, type VoteCandidate } from '../src/game/electionVotes';
import type { WorldState } from '../src/game/gameTypes';

function makeWorld(): WorldState {
  const w = initGame({ villageName: 'Vote', size: 'small' });
  // Drop the map's founding settlers so only the test's voters cast ballots.
  // Drop every human (founders AND rivals) so only the test's voters cast ballots.
  w.entities = w.entities.filter((e) => e.type !== EntityType.Human);
  return w;
}

function addVoter(w: WorldState, id: number): void {
  const e = createEntity(EntityType.Human, 300, 300, id, 80, false, { name: `V${id}` });
  e.alive = true;
  w.entities.push(e);
}

function candidates(...spec: { id: number; score: number }[]): VoteCandidate[] {
  return spec.map((s) => ({ entityId: s.id, name: `C${s.id}`, totalScore: s.score }));
}

const friend = (w: WorldState, voterId: number, candidateId: number, score: number) => {
  const v = w.entities.find((e) => e.id === voterId && e.type === EntityType.Human)!;
  v.friendships = { ...(v.friendships ?? {}), [`friend_${candidateId}`]: score };
};
const feud = (w: WorldState, voterId: number, candidateId: number, score: number) => {
  const v = w.entities.find((e) => e.id === voterId && e.type === EntityType.Human)!;
  v.feuds = { ...(v.feuds ?? {}), [`feud_${candidateId}`]: score };
};

describe('election vote-support — merit is strongest', () => {
  it('a big merit gap wins every ballot regardless of bonds', () => {
    const w = makeWorld();
    addVoter(w, 1);
    addVoter(w, 2);
    addVoter(w, 3);
    for (const v of [1, 2, 3]) friend(w, v, 20, 100);
    const result = simulateElectionVotes(w, candidates({ id: 10, score: 200 }, { id: 20, score: 100 }));
    expect(result.winnerId).toBe(10);
    expect(result.tally.get(10)).toBe(3);
  });

  it('bonds tip a close race (gap within the influence cap)', () => {
    const w = makeWorld();
    addVoter(w, 1);
    addVoter(w, 2);
    addVoter(w, 3);
    for (const v of [1, 2, 3]) friend(w, v, 20, 100);
    const result = simulateElectionVotes(w, candidates({ id: 10, score: 100 }, { id: 20, score: 95 }));
    expect(result.winnerId).toBe(20);
    expect(result.tally.get(20)).toBe(3);
  });

  it('a feud cancels a vote even for a slightly stronger candidate', () => {
    const w = makeWorld();
    addVoter(w, 1);
    addVoter(w, 2);
    addVoter(w, 3);
    for (const v of [1, 2, 3]) feud(w, v, 10, 100);
    const result = simulateElectionVotes(w, candidates({ id: 10, score: 100 }, { id: 20, score: 90 }));
    expect(result.winnerId).toBe(20);
  });

  it('a large merit gap survives a full feud (feud cannot out-vote merit)', () => {
    const w = makeWorld();
    addVoter(w, 1);
    addVoter(w, 2);
    for (const v of [1, 2]) feud(w, v, 10, 100);
    const result = simulateElectionVotes(w, candidates({ id: 10, score: 200 }, { id: 20, score: 120 }));
    expect(result.winnerId).toBe(10);
  });

  it('equal merit resolves deterministically to the first-listed candidate', () => {
    const w = makeWorld();
    addVoter(w, 1);
    addVoter(w, 2);
    const result = simulateElectionVotes(w, candidates({ id: 10, score: 100 }, { id: 20, score: 100 }));
    expect(result.winnerId).toBe(10);
    expect(result.runnerUpVotes).toBe(0);
  });

  it('counts every ballot and reports runner-up', () => {
    const w = makeWorld();
    addVoter(w, 1);
    addVoter(w, 2);
    addVoter(w, 3);
    addVoter(w, 4);
    const result = simulateElectionVotes(w, candidates({ id: 10, score: 120 }, { id: 20, score: 110 }));
    expect(result.totalVotes).toBe(4);
    expect(result.winnerVotes).toBe(4);
    expect(result.runnerUpVotes).toBe(0);
  });

  it('the influence cap bounds friendship/feud power', () => {
    expect(BOND_INFLUENCE_CAP).toBe(15);
  });
});
