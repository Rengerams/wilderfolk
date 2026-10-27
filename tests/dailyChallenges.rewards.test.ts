/**
 * A challenge reward grants every resource it declares.
 *
 * Regression for audit M3 (`docs/private/audits/2026-09-16/sim-economy-leadership-combat.md`,
 * tracked in `LIVE-FINDINGS-STATUS.md`): `tickDailyChallenges` hand-wrote four `addResource` calls —
 * wood, stone, food, gold — so `iron` was never credited even though `challenges.ts` declares it in
 * five of the eight reward objects and `ChallengesPanel.tsx:50-52` renders the promise
 * (`century`: "`+500 all resources + 500 iron!`"). The reward is granted once (the `completed` latch
 * is persisted), so this was a permanently broken promise for the resource that gates the forge chain.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { INITIAL_CHALLENGES } from '../src/game/challenges';
import { tickDailyChallenges } from '../src/game/dailyChallenges';
import type { TickContext } from '../src/game/simulation/simulationTypes';
import type { Resources, WorldState } from '../src/game/gameTypes';

const FIXTURE_SEED = 20_260_917;

function world(): WorldState {
  const state = initGame({ villageName: 'Rewards', size: 'medium', seed: FIXTURE_SEED });
  state.challenges = INITIAL_CHALLENGES.map((c) => ({ ...c, completed: false }));
  // Reward grants clamp to `storageMax`; raise the caps so a capped grant cannot be mistaken for a
  // missing one. This test is about the grant list, not about storage.
  state.storageMax = { wood: 10_000, stone: 10_000, food: 10_000, gold: 10_000, iron: 10_000 };
  return state;
}

/** `tickDailyChallenges` reads only `ctx.updatedBuildings`; the audit repro uses the same shape. */
function ctxOf(state: WorldState): TickContext {
  return { updatedBuildings: state.buildings } as unknown as TickContext;
}

function grant(state: WorldState): void {
  tickDailyChallenges(state, ctxOf(state), { humans: 10 });
}

describe('challenge reward grants', () => {
  it('credits every field of the reward bundle', () => {
    const state = world();
    const reward: Resources = { wood: 10, stone: 20, food: 30, gold: 40, iron: 50 };
    // `id` is not one of `isChallengeComplete`'s switch cases, so it falls to the generic target branch
    // and `targetPopulation: 0` completes it.
    state.challenges = [{
      id: 'probe', title: 'Probe', description: '', completed: false, targetPopulation: 0, reward,
    }];
    const before = { ...state.resources };

    grant(state);

    expect(state.challenges[0].completed).toBe(true);
    for (const [type, amount] of Object.entries(reward)) {
      expect(state.resources[type as keyof Resources] - before[type as keyof Resources], type)
        .toBe(amount);
    }
  });

  it('grants the iron that the reward text promises', () => {
    const state = world();
    // `century` completes on `state.year >= 100` and promises "+500 all resources + 500 iron!".
    state.year = 100;
    const before = { ...state.resources };

    grant(state);

    const century = state.challenges.find((c) => c.id === 'century');
    expect(century?.completed).toBe(true);
    expect(state.resources.iron - before.iron).toBe(century?.reward?.iron);
    expect(state.resources.iron - before.iron).toBe(500);
  });

  it('never promises iron that the reward object does not carry', () => {
    // The promise is the text the panel renders; a text promising `iron` with `iron: 0` would fail the
    // same way M3 did, with the grant list now complete and the data wrong instead.
    const promising = INITIAL_CHALLENGES.filter((c) => c.rewardText?.includes('iron'));
    expect(promising.length).toBeGreaterThan(0);
    for (const challenge of promising) {
      expect(challenge.reward?.iron ?? 0, challenge.id).toBeGreaterThan(0);
    }
  });
});
