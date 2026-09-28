import type { WorldState } from './gameTypes';

import type { TickContext } from './simulation/simulationTypes';
import { addResource } from './economy';
import { buildChallengeBuildingFacts, isChallengeComplete } from './challenges';
import { addFloatingText, addNotification, impulseScreenShake } from './simEffects';
import { recordFoodProduced } from './economyLedger';

export function tickDailyChallenges(
  state: WorldState,
  ctx: TickContext,
  counts: { humans: number },
): void {
  const challengeHumanCount = counts.humans;
  // Both per-challenge building facts, in one pass for the whole board. The loop below used to
  // rebuild them per challenge (two full scans of `updatedBuildings` × up to eight challenges) for
  // values that depend on nothing but the array. `building.completed` is written only by
  // `tickBuildingProgress` earlier in the same daily pass and never inside this loop.
  const buildingFacts = buildChallengeBuildingFacts(ctx.updatedBuildings);
  // Built on the first *incomplete* challenge: the clone copies every own `WorldState` property, and
  // a board whose challenges are all complete has no consumer for it.
  let challengeState: WorldState | undefined;
  state.challenges = state.challenges.map((c) => {
    if (c.completed) return c;
    challengeState ??= { ...state, ecoHealthYearsAbove80: state.ecoHealthYearsAbove80 };
    const completed = isChallengeComplete(
      c,
      challengeState,
      challengeHumanCount,
      ctx.updatedBuildings,
      buildingFacts,
    );

    if (completed && c.reward) {
      addResource(state, 'wood', c.reward.wood || 0);
      addResource(state, 'stone', c.reward.stone || 0);
      // Record what storage actually accepted: `addResource` clamps to `storageMax` and returns
      // the amount added, and the ledger's contract is "food that actually entered storage".
      recordFoodProduced(state, 'challenges', addResource(state, 'food', c.reward.food || 0));
      addResource(state, 'gold', c.reward.gold || 0);
      // `challenges.ts` promises iron in five of the eight reward texts and `ChallengesPanel` renders
      // them, but the grant list above never credited it (LIVE-FINDINGS-STATUS.md, M3).
      addResource(state, 'iron', c.reward.iron || 0);
      addFloatingText(state, state.width / 2, state.height / 2 - 40, `Challenge: ${c.title}!`, '#fbbf24');
      if (c.rewardText) {
        addFloatingText(state, state.width / 2, state.height / 2 - 25, c.rewardText, '#22c55e');
      }
      addNotification(state, 'Challenge Complete!', `${c.title} - ${c.rewardText || 'Rewards granted!'}`, 'success');
      impulseScreenShake(state, 4);
    }

    return { ...c, completed: completed || c.completed };
  });
}