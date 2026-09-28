/**
 * S1 — The Deer Parliament (roadmap v0.6.3).
 * One-time seeded ecology story per docs/archive/story/STORY_DEER_PARLIAMENT.md.
 */
import type { WorldState, StoryEvent } from './gameTypes';
import { BuildingType, EntityType } from './gameTypes';
import { TICKS_PER_DAY, getColonyDay } from './dayCycle';
import { addBigNews, addNotification } from './simEffects';
import { logEvent } from './eventLog';
import { storyFlag, setStoryFlags, bumpVillageReputation, eligibleDayForStory, pushStoryCard, AUTHORED_STORY_COOLDOWN_FLAG } from './storyHelpers';
import { spendFood } from './economyLedger';
import { adjustEcosystemHealth, getEcosystemHealth } from './dailyEcology';

export const STORY_KEY = 'deer_parliament';
export const AUTHORED_STORY_COOLDOWN_DAYS = 21;

const FLAG_OFFERED = 'deer_parliament_offered';
const FLAG_RESOLVED = 'deer_parliament_resolved';
const FLAG_RESPONSE = 'deer_parliament_response';
const FLAG_FOLLOWUP_DAY = 'deer_parliament_followup_day';
const FLAG_FOLLOWUP_DONE = 'deer_parliament_followup_done';

const MIN_DAY = 45;
const WINDOW_DAYS = 60;
const FOLLOW_UP_DELAY_DAYS = 5;
const CARD_DURATION_DAYS = 4;

const MIN_DEER_FOR_PARLIAMENT = 6;
const ECO_PRESSURE_THRESHOLD = 75;
const PRESERVE_WOOD_COST = 40;
const TREATY_FOOD_COST = 20;

type DeerResponse = 'reduce_hunting' | 'preserve' | 'ignore' | 'symbolic_treaty';

const RESPONSE_CODES: Record<DeerResponse, number> = {
  reduce_hunting: 1,
  preserve: 2,
  ignore: 3,
  symbolic_treaty: 4,
};

export function deerParliamentEligibleDay(mapSeed: number | undefined): number {
  return eligibleDayForStory(mapSeed, STORY_KEY, MIN_DAY, WINDOW_DAYS);
}

function countAliveDeer(state: WorldState): number {
  let deer = 0;
  for (const e of state.entities) {
    if (e.alive && e.type === EntityType.Deer) deer++;
  }
  return deer;
}

function hasHuntingPressure(state: WorldState): boolean {
  const hasHuntingSpot = state.buildings.some(
    (b) => b.completed && b.faction !== 'rival' && b.type === BuildingType.HuntingSpot,
  );
  return hasHuntingSpot || getEcosystemHealth(state) < ECO_PRESSURE_THRESHOLD;
}

export function maybeOfferDeerParliament(state: WorldState): void {
  if (storyFlag(state, FLAG_OFFERED) > 0) return;
  const colonyDay = getColonyDay(state);
  if (colonyDay < deerParliamentEligibleDay(state.worldMap?.seed)) return;
  if (storyFlag(state, AUTHORED_STORY_COOLDOWN_FLAG) > colonyDay) return;
  if ((state.pendingStoryEvents ?? []).length > 0) return;
  if (countAliveDeer(state) < MIN_DEER_FOR_PARLIAMENT) return;
  if (!hasHuntingPressure(state)) return;

  setStoryFlags(state, {
    [FLAG_OFFERED]: state.tick,
    [AUTHORED_STORY_COOLDOWN_FLAG]: colonyDay + AUTHORED_STORY_COOLDOWN_DAYS,
  });

  const deer = countAliveDeer(state);
  const event: StoryEvent = {
    id: `deer_parliament_${state.tick}`,
    emoji: '🦌',
    storyKey: STORY_KEY,
    title: 'The Deer Parliament',
    description:
      `${deer} deer have gathered in suspiciously organized rows. An elder insists they are holding a parliament to negotiate hunting rights. ` +
      `(Deer: ${deer}, ecology: ${Math.round(getEcosystemHealth(state))}, season: ${state.season}.)`,
    choices: [
      { id: 'reduce_hunting', label: 'Reduce hunting', detail: 'Ecology +6 now; the herd recovers in a few days.' },
      { id: 'preserve', label: `Create a preserve (${PRESERVE_WOOD_COST} wood)`, detail: 'Ecology +8, reputation +2.' },
      { id: 'ignore', label: 'Ignore the delegation', detail: 'No cost now — the valley may answer.' },
      { id: 'symbolic_treaty', label: `Offer a symbolic treaty (${TREATY_FOOD_COST} food)`, detail: 'Reputation +3, no ecology change.' },
    ],
    createdAtTick: state.tick,
    expiresAtTick: state.tick + TICKS_PER_DAY * CARD_DURATION_DAYS,
  };
  pushStoryCard(state, event);
  addNotification(state, '🦌 The deer are gathering', 'The deer appear to be holding a parliament.', 'info');
}

/**
 * Whether `resolveDeerParliament` would accept this answer right now.
 *
 * Mirrors the two gated answers the resolver applies (`preserve`,
 * `symbolic_treaty`), so a consumer can tell an answer that lands from one that
 * is refused and leaves the card open. `reduce_hunting` and `ignore` are free.
 */
export function getDeerParliamentChoiceEligibility(
  state: WorldState,
  choiceId: string,
): { ok: boolean; blockReason?: string } {
  if (choiceId === 'preserve' && state.resources.wood < PRESERVE_WOOD_COST) {
    return { ok: false, blockReason: `Need ${PRESERVE_WOOD_COST}🪵` };
  }
  if (choiceId === 'symbolic_treaty' && state.resources.food < TREATY_FOOD_COST) {
    return { ok: false, blockReason: `Need ${TREATY_FOOD_COST}🍖` };
  }
  return { ok: true };
}

export function resolveDeerParliament(state: WorldState, choiceId: string): boolean {
  if (storyFlag(state, FLAG_RESOLVED) > 0) return true;
  const colonyDay = getColonyDay(state);
  const followUpDay = colonyDay + FOLLOW_UP_DELAY_DAYS;
  const baseFlags: Record<string, number> = {
    [FLAG_RESOLVED]: state.tick,
    [FLAG_RESPONSE]: RESPONSE_CODES[choiceId as DeerResponse] ?? RESPONSE_CODES.ignore,
    [FLAG_FOLLOWUP_DAY]: followUpDay,
    [AUTHORED_STORY_COOLDOWN_FLAG]: colonyDay + AUTHORED_STORY_COOLDOWN_DAYS,
  };

  switch (choiceId as DeerResponse) {
    case 'reduce_hunting':
      adjustEcosystemHealth(state, +6);
      addBigNews(state, '🦌 The hunters stand down', 'Ecology improves as the hunt eases.', 'positive');
      break;
    case 'preserve': {
      if (state.resources.wood < PRESERVE_WOOD_COST) {
        addNotification(state, 'Not enough wood', `A preserve needs ${PRESERVE_WOOD_COST} wood.`, 'warning');
        return false;
      }
      state.resources.wood -= PRESERVE_WOOD_COST;
      adjustEcosystemHealth(state, +8);
      bumpVillageReputation(state, 2);
      addBigNews(state, '🌲 A preserve is marked', 'The woodland edge is set aside. Ecology +8, reputation +2.', 'positive');
      break;
    }
    case 'symbolic_treaty': {
      if (state.resources.food < TREATY_FOOD_COST) {
        addNotification(state, 'Not enough food', `A treaty gift needs ${TREATY_FOOD_COST} food.`, 'warning');
        return false;
      }
      spendFood(state, 'treaty', TREATY_FOOD_COST);
      bumpVillageReputation(state, 3);
      addBigNews(state, '🤝 Treaty of the Woodland Edge', 'A basket of grain is left for the antlered speaker.', 'positive');
      break;
    }
    default:
      addBigNews(state, '🦌 The delegation is ignored', 'The deer disperse for now — but they took note.', 'neutral');
  }
  setStoryFlags(state, baseFlags);
  logEvent(state, 'event', `The Deer Parliament resolved (${choiceId}).`, undefined);
  return true;
}

export function tickDeerParliament(state: WorldState): void {
  const resolved = storyFlag(state, FLAG_RESOLVED);
  const followUpDay = storyFlag(state, FLAG_FOLLOWUP_DAY);
  if (resolved <= 0 || followUpDay <= 0) return;
  if (storyFlag(state, FLAG_FOLLOWUP_DONE) > 0) return;
  if (getColonyDay(state) < followUpDay) return;

  setStoryFlags(state, { [FLAG_FOLLOWUP_DONE]: state.tick });

  switch (storyFlag(state, FLAG_RESPONSE)) {
    case RESPONSE_CODES.reduce_hunting:
      adjustEcosystemHealth(state, +2);
      addNotification(state, '🦌 The herd recovers', 'With the hunt eased, deer graze calmly.', 'success');
      break;
    case RESPONSE_CODES.preserve:
      adjustEcosystemHealth(state, +2);
      addNotification(state, '🌲 The preserve takes hold', 'Wildflowers return inside the marked boundary.', 'success');
      break;
    case RESPONSE_CODES.ignore:
      adjustEcosystemHealth(state, -3);
      addNotification(state, '🦌 Deer at the farm edge', 'Deer press at the farm edge — a visible reminder.', 'warning');
      break;
    default:
      bumpVillageReputation(state, 1);
      addNotification(state, '🦌 Negotiations continue', 'A deer was seen near the treaty basket at dawn.', 'success');
  }
  logEvent(state, 'event', 'The Deer Parliament follow-up resolved.', undefined);
}
