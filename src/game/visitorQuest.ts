/**
 * Visitor quest chain — one small deliverable quest at a time.
 *
 * v0.5.2: the traveling smith arrives with a trader camp and asks for 20 wood
 * in exchange for gold + reputation. A quest card shows the goal; the player
 * delivers from the card (deducts from storage). Quests expire after a few
 * days if ignored, and never stack (one active quest at a time).
 */
import type { WorldState, VisitorQuest } from './gameTypes';
import { getAbsoluteCalendarDay } from './dayCycle';
import { addBigNews } from './simEffects';

export const QUEST_EXPIRE_DAYS = 4;

/** Chance a trader group starts the smith quest when they arrive. */
const QUEST_START_CHANCE = 0.5;

const SMITH_QUEST = {
  id: 'smith_wood',
  emoji: '⚒️',
  title: 'The traveling smith',
  description: 'A smith at the trader camp needs 20 wood to finish a masterwork. He will pay handsomely.',
  goalType: 'deliver',
  goalResource: 'wood',
  goalAmount: 20,
  rewardGold: 30,
  rewardReputation: 4,
} as const;

export function maybeStartVisitorQuest(state: WorldState): void {
  const existing = state.visitorQuest;
  if (existing && existing.status === 'active') return;
  if (Math.random() > QUEST_START_CHANCE) return;
  state.visitorQuest = {
    ...SMITH_QUEST,
    progress: 0,
    status: 'active',
    expiresDay: getAbsoluteCalendarDay(state.tick) + QUEST_EXPIRE_DAYS,
  };
}

/** Day-boundary tick: fail/clear quests the smith gave up on. */
export function tickVisitorQuest(state: WorldState): void {
  const q = state.visitorQuest;
  if (!q || q.status !== 'active') return;
  if (getAbsoluteCalendarDay(state.tick) > q.expiresDay) {
    state.visitorQuest = undefined;
    addBigNews(state, 'The smith moved on', `${q.title} left without their goods.`, 'neutral');
  }
}

/** Try to deliver the quest goods. Returns true when the quest completed. */
export function deliverVisitorQuest(state: WorldState): boolean {
  const q = state.visitorQuest;
  if (!q || q.status !== 'active' || q.goalType !== 'deliver') return false;
  const have = state.resources[q.goalResource] ?? 0;
  if (have < q.goalAmount) return false;
  state.resources[q.goalResource] = (have - q.goalAmount) as never;
  q.progress = q.goalAmount;
  q.status = 'completed';
  state.resources.gold = Math.min(state.storageMax.gold, state.resources.gold + q.rewardGold);
  state.villageReputation = Math.min(100, state.villageReputation + q.rewardReputation);
  return true;
}

export function getVisitorQuest(state: WorldState): VisitorQuest | null {
  const q = state.visitorQuest;
  if (!q || q.status !== 'active') return null;
  return q;
}
