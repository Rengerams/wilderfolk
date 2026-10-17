/** Election ballots follow merit and bonds without turning a narrow lead into a sweep. */
import { describe, it, expect } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { createEntity } from '../src/game/entityFactory';
import { EntityType } from '../src/game/gameTypes';
import { simulateElectionVotes, BOND_INFLUENCE_CAP, type VoteCandidate } from '../src/game/electionVotes';
import type { WorldState } from '../src/game/gameTypes';

function makeWorld(): WorldState {
  const w = initGame({ villageName: 'Vote', size: 'medium' });
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
  it('a large merit lead survives even when every voter favors the rival', () => {
    const w = makeWorld();
    for (let id = 1; id <= 100; id++) addVoter(w, id);
    for (let v = 1; v <= 100; v++) friend(w, v, 20, 100);
    const result = simulateElectionVotes(w, candidates({ id: 10, score: 200 }, { id: 20, score: 80 }));
    expect(result.winnerId).toBe(10);
    expect(result.tally.get(10)).toBeGreaterThan(70);
    // Ballots are sampled: with a strong merit lead, a rival may legitimately receive zero.
    expect(result.totalVotes).toBe(100);
    expect((result.tally.get(10) ?? 0) + (result.tally.get(20) ?? 0)).toBe(result.totalVotes);
  });

  it('bonds tip a close race (gap within the influence cap)', () => {
    const w = makeWorld();
    for (let id = 1; id <= 200; id++) addVoter(w, id);
    for (let v = 1; v <= 200; v++) friend(w, v, 20, 100);
    const result = simulateElectionVotes(w, candidates({ id: 10, score: 100 }, { id: 20, score: 95 }));
    expect(result.winnerId).toBe(20);
    expect(result.tally.get(20)).toBeGreaterThan(result.tally.get(10) ?? 0);
    expect(result.tally.get(10)).toBeGreaterThan(0);
  });

  it('a feud cancels a vote even for a slightly stronger candidate', () => {
    const w = makeWorld();
    for (let id = 1; id <= 200; id++) addVoter(w, id);
    for (let v = 1; v <= 200; v++) feud(w, v, 10, 100);
    const result = simulateElectionVotes(w, candidates({ id: 10, score: 100 }, { id: 20, score: 90 }));
    expect(result.winnerId).toBe(20);
    expect(result.tally.get(20)).toBeGreaterThan(result.tally.get(10) ?? 0);
  });

  it('a very large merit gap keeps a broad lead despite a full feud', () => {
    const w = makeWorld();
    for (let id = 1; id <= 100; id++) addVoter(w, id);
    for (let v = 1; v <= 100; v++) feud(w, v, 10, 100);
    const result = simulateElectionVotes(w, candidates({ id: 10, score: 200 }, { id: 20, score: 80 }));
    expect(result.winnerId).toBe(10);
    expect(result.tally.get(10)).toBeGreaterThan(90);
    // A rare vote is possible, not guaranteed in every 100-voter sample.
    expect(result.totalVotes).toBe(100);
    expect((result.tally.get(10) ?? 0) + (result.tally.get(20) ?? 0)).toBe(result.totalVotes);
  });

  it('equal merit splits ballots deterministically', () => {
    const w = makeWorld();
    for (let id = 1; id <= 100; id++) addVoter(w, id);
    const candidatesForElection = candidates({ id: 10, score: 100 }, { id: 20, score: 100 });
    const firstResult = simulateElectionVotes(w, candidatesForElection);
    const secondResult = simulateElectionVotes(w, candidatesForElection);
    expect(secondResult.tally).toEqual(firstResult.tally);
    expect(firstResult.tally.get(10)).toBeGreaterThan(0);
    expect(firstResult.tally.get(20)).toBeGreaterThan(0);
    expect(firstResult.totalVotes).toBe(100);
  });

  it('lets either candidate win a 213-to-206 race with a bounded election-wide swing', () => {
    const w = makeWorld();
    for (let id = 1; id <= 1600; id++) addVoter(w, id);
    let meritLeaderWins = 0;
    let challengerWins = 0;
    const closeRace = candidates({ id: 10, score: 213 }, { id: 20, score: 206 });

    for (let year = 0; year < 32; year++) {
      w.year = year;
      const result = simulateElectionVotes(w, closeRace);
      const repeatedResult = simulateElectionVotes(w, closeRace);
      expect(repeatedResult.tally).toEqual(result.tally);
      expect(result.totalVotes).toBe(1600);
      if (result.winnerId === 10) meritLeaderWins++;
      if (result.winnerId === 20) challengerWins++;
    }

    expect(meritLeaderWins).toBeGreaterThanOrEqual(5);
    expect(challengerWins).toBeGreaterThanOrEqual(5);
  });

  it('the influence cap bounds friendship/feud power', () => {
    expect(BOND_INFLUENCE_CAP).toBe(15);
  });
});