/**
 * Legacy visitor quest delivery — retain compatibility with existing saved quests.
 */
import type { WorldState, VisitorQuest } from './gameTypes';
import { addCappedResource } from './resourceUtils';
import { addReputation } from './simHelpers';

/** Try to deliver the quest goods. Returns true when the quest completed. */
export function deliverVisitorQuest(state: WorldState): boolean {
  const q = state.visitorQuest;
  if (!q || q.status !== 'active' || q.goalType !== 'deliver') return false;
  const have = state.resources[q.goalResource] ?? 0;
  if (have < q.goalAmount) return false;
  state.resources[q.goalResource] = (have - q.goalAmount) as never;
  q.progress = q.goalAmount;
  q.status = 'completed';
  // Reward through the resource owner: `Math.min(storageMax, gold + reward)` would *lower* a purse
  // already over the cap, deleting the surplus while the card announced a gain.
  addCappedResource(state, 'gold', q.rewardGold);
  addReputation(state, q.rewardReputation);
  return true;
}

export function getVisitorQuest(state: WorldState): VisitorQuest | null {
  const q = state.visitorQuest;
  if (!q || q.status !== 'active') return null;
  return q;
}
