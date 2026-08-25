/**
 * S4 — The Invention Fair (roadmap v0.6.3).
 * One-time seeded story: an apprentice inventor wants to demonstrate a
 * workshop gadget at the village fair.
 */
import type { WorldState, StoryEvent } from './gameTypes';
import { BuildingType } from './gameTypes';
import { TICKS_PER_DAY, getColonyDay } from './dayCycle';
import { addBigNews, addNotification } from './simEffects';
import { logEvent } from './eventLog';
import { storyFlag, setStoryFlags, bumpVillageReputation } from './storyHelpers';

export const STORY_KEY = 'invention_fair';
const FLAG_OFFERED = 'invention_fair_offered';
const FLAG_RESOLVED = 'invention_fair_resolved';
const FLAG_RESPONSE = 'invention_fair_response';
const FLAG_CAMPAIGN_RESOLVED = 'invention_fair_resolved';
export const AUTHORED_STORY_COOLDOWN_FLAG = 'authored_story_cd_until';
export const AUTHORED_STORY_COOLDOWN_DAYS = 21;

const MIN_DAY = 50;
const WINDOW_DAYS = 70;
const CARD_DURATION_DAYS = 4;
const DEMO_WOOD_COST = 12;

type FairResponse = 'keep' | 'improve' | 'dismantle' | 'skip';

const RESPONSE_CODES: Record<FairResponse, number> = {
  keep: 1,
  improve: 2,
  dismantle: 3,
  skip: 4,
};

function seededRoll(seed: number, salt: number): number {
  let s = (seed ^ salt) >>> 0;
  s = (s + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function hashSalt(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function inventionFairEligibleDay(mapSeed: number | undefined): number {
  const seed = (mapSeed ?? 1) >>> 0;
  return MIN_DAY + Math.floor(seededRoll(seed, hashSalt(STORY_KEY)) * WINDOW_DAYS);
}

function hasWorkshop(state: WorldState): boolean {
  return state.buildings.some(
    (b) =>
      b.completed &&
      (b.type === BuildingType.Workshop || b.type === BuildingType.Blacksmith),
  );
}

export function maybeOfferInventionFair(state: WorldState): void {
  if (storyFlag(state, FLAG_OFFERED) > 0) return;
  const colonyDay = getColonyDay(state);
  if (colonyDay < inventionFairEligibleDay(state.worldMap?.seed)) return;
  if (storyFlag(state, AUTHORED_STORY_COOLDOWN_FLAG) > colonyDay) return;
  if ((state.pendingStoryEvents ?? []).length > 0) return;
  if (!hasWorkshop(state)) return;

  setStoryFlags(state, {
    [FLAG_OFFERED]: state.tick,
    [AUTHORED_STORY_COOLDOWN_FLAG]: colonyDay + AUTHORED_STORY_COOLDOWN_DAYS,
  });

  const event: StoryEvent = {
    id: `invention_fair_${state.tick}`,
    emoji: '⚙️',
    storyKey: STORY_KEY,
    title: 'The Invention Fair',
    description:
      'An apprentice has built a contraption that may — or may not — revolutionize the workshop. The fair is in three days.',
    choices: [
      { id: 'keep', label: 'Let them show it as-is', detail: 'No cost; the crowd decides.' },
      { id: 'improve', label: `Fund better materials (${DEMO_WOOD_COST} wood)`, detail: 'Better odds the gadget works.' },
      { id: 'dismantle', label: 'Take it apart quietly', detail: 'Avoid embarrassment.' },
      { id: 'skip', label: 'Skip the fair', detail: 'The apprentice is disappointed.' },
    ],
    createdAtTick: state.tick,
    expiresAtTick: state.tick + TICKS_PER_DAY * CARD_DURATION_DAYS,
  };
  state.pendingStoryEvents ??= [];
  if (!state.pendingStoryEvents.some((e) => e.id === event.id)) {
    state.pendingStoryEvents.push(event);
  }
  addNotification(state, '⚙️ Invention Fair', 'An apprentice wants to demo a workshop gadget.', 'info');
}

export function resolveInventionFair(state: WorldState, choiceId: string): boolean {
  if (storyFlag(state, FLAG_RESOLVED) > 0) return true;
  const colonyDay = getColonyDay(state);
  const baseFlags: Record<string, number> = {
    [FLAG_RESOLVED]: state.tick,
    [FLAG_RESPONSE]: RESPONSE_CODES[choiceId as FairResponse] ?? RESPONSE_CODES.skip,
    [AUTHORED_STORY_COOLDOWN_FLAG]: colonyDay + AUTHORED_STORY_COOLDOWN_DAYS,
    [FLAG_CAMPAIGN_RESOLVED]: state.tick,
  };

  switch (choiceId as FairResponse) {
    case 'improve': {
      if (state.resources.wood < DEMO_WOOD_COST) {
        addNotification(state, 'Not enough wood', `Improving the gadget needs ${DEMO_WOOD_COST} wood.`, 'warning');
        return false;
      }
      state.resources.wood -= DEMO_WOOD_COST;
      bumpVillageReputation(state, 2);
      addBigNews(state, '⚙️ The gadget works', 'The fair is a success — the apprentice beams.', 'positive');
      break;
    }
    case 'keep': {
      const success = seededRoll(state.worldMap?.seed ?? 1, hashSalt('invention-demo')) > 0.4;
      if (success) {
        bumpVillageReputation(state, 1);
        addBigNews(state, '⚙️ A surprise success', 'The contraption works just well enough to amuse the valley.', 'positive');
      } else {
        addBigNews(state, '⚙️ A puff of smoke', 'The demo ends in a puff of smoke. The apprentice blushes.', 'neutral');
      }
      break;
    }
    case 'dismantle':
      addBigNews(state, '⚙️ Quietly dismantled', 'No spectacle — and no disaster.', 'neutral');
      break;
    default:
      addBigNews(state, '⚙️ The fair passes', 'The invention stays in the workshop.', 'neutral');
  }
  setStoryFlags(state, baseFlags);
  logEvent(state, 'event', `The Invention Fair resolved (${choiceId}).`, undefined);
  return true;
}
