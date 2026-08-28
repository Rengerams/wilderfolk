import type { WorldState } from './gameTypes';

import type { TickContext } from './simulation/simulationTypes';
import { addResource } from './economy';
import { isChallengeComplete } from './challenges';
import { addFloatingText, addNotification, impulseScreenShake } from './simEffects';
import { recordFoodProduced } from './economyLedger';

export function tickDailyChallenges(
  state: WorldState,
  ctx: TickContext,
  counts: { humans: number },
): void {
  const challengeHumanCount = counts.humans;
  const challengeState: WorldState = { ...state, ecoHealthYearsAbove80: state.ecoHealthYearsAbove80 };
  state.challenges = state.challenges.map((c) => {
    if (c.completed) return c;
    const completed = isChallengeComplete(c, challengeState, challengeHumanCount, ctx.updatedBuildings);

    if (completed && c.reward) {
      addResource(state, 'wood', c.reward.wood || 0);
      addResource(state, 'stone', c.reward.stone || 0);
      recordFoodProduced(state, 'challenges', c.reward.food || 0);
      addResource(state, 'food', c.reward.food || 0);
      addResource(state, 'gold', c.reward.gold || 0);
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
