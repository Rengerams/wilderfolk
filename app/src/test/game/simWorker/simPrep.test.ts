import { describe, expect, it } from 'vitest';
import { freshState } from '@/test/fixtures/gameFixtures';
import { applySimPrep, extractSimPrep } from '@/game/simWorker/simPrep';

describe('simPrep', () => {
  it('clones electionCeremony so worker and main do not share a reference', () => {
    const state = freshState();
    state.electionCeremony = {
      phase: 'gathering',
      phaseTicksLeft: 12,
      gatherX: 100,
      gatherY: 200,
      reason: 'decennial',
      pendingLeaderId: 5,
      pendingLeaderName: 'Aldric',
      pendingChanged: true,
    };

    const prep = extractSimPrep(state);
    expect(prep.electionCeremony).not.toBe(state.electionCeremony);
    prep.electionCeremony!.phaseTicksLeft = 0;

    expect(state.electionCeremony.phaseTicksLeft).toBe(12);

    applySimPrep(state, prep);
    expect(state.electionCeremony).toBe(prep.electionCeremony);
    expect(state.electionCeremony?.phaseTicksLeft).toBe(0);
  });
});