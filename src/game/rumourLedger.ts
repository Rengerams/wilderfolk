/**
 * S5 — The Rumour Ledger (roadmap v0.6.3).
 * One-time seeded story: a scribe at the Town Hall keeps a ledger of village
 * rumours; the player decides how to respond to a truth-check.
 */
import type { WorldState, StoryEvent } from './gameTypes';
import { BuildingType } from './gameTypes';
import { TICKS_PER_DAY, getColonyDay } from './dayCycle';
import { addBigNews, addNotification } from './simEffects';
import { logEvent } from './eventLog';
import { storyFlag, setStoryFlags, bumpVillageReputation } from './storyHelpers';

export const STORY_KEY = 'rumour_ledger';
const FLAG_OFFERED = 'rumour_ledger_offered';
const FLAG_RESOLVED = 'rumour_ledger_resolved';
const FLAG_RESPONSE = 'rumour_ledger_response';
const FLAG_CAMPAIGN_RESOLVED = 'rumour_ledger_resolved';
export const AUTHORED_STORY_COOLDOWN_FLAG = 'authored_story_cd_until';
export const AUTHORED_STORY_COOLDOWN_DAYS = 21;

const MIN_DAY = 70;
const WINDOW_DAYS = 80;
const CARD_DURATION_DAYS = 4;

type LedgerResponse = 'correct' | 'encourage' | 'ignore' | 'investigate';

const RESPONSE_CODES: Record<LedgerResponse, number> = {
  correct: 1,
  encourage: 2,
  ignore: 3,
  investigate: 4,
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

export function rumourLedgerEligibleDay(mapSeed: number | undefined): number {
  const seed = (mapSeed ?? 1) >>> 0;
  return MIN_DAY + Math.floor(seededRoll(seed, hashSalt(STORY_KEY)) * WINDOW_DAYS);
}

function hasTownHall(state: WorldState): boolean {
  return state.buildings.some((b) => b.completed && b.type === BuildingType.TownHall);
}

export function maybeOfferRumourLedger(state: WorldState): void {
  if (storyFlag(state, FLAG_OFFERED) > 0) return;
  const colonyDay = getColonyDay(state);
  if (colonyDay < rumourLedgerEligibleDay(state.worldMap?.seed)) return;
  if (storyFlag(state, AUTHORED_STORY_COOLDOWN_FLAG) > colonyDay) return;
  if ((state.pendingStoryEvents ?? []).length > 0) return;
  if (!hasTownHall(state)) return;

  setStoryFlags(state, {
    [FLAG_OFFERED]: state.tick,
    [AUTHORED_STORY_COOLDOWN_FLAG]: colonyDay + AUTHORED_STORY_COOLDOWN_DAYS,
  });

  const event: StoryEvent = {
    id: `rumour_ledger_${state.tick}`,
    emoji: '📜',
    storyKey: STORY_KEY,
    title: 'The Rumour Ledger',
    description:
      'The Town Hall scribe has compiled every rumour whispered this season. One entry is almost certainly false — and almost certainly believed.',
    choices: [
      { id: 'correct', label: 'Publish a correction', detail: 'Reputation +2 · truth wins.' },
      { id: 'encourage', label: 'Let the rumour stand', detail: 'More chatter, for good or ill.' },
      { id: 'ignore', label: 'Burn the ledger', detail: 'Quiet, but the rumour spreads anyway.' },
      { id: 'investigate', label: 'Investigate the source', detail: 'Find who started it.' },
    ],
    createdAtTick: state.tick,
    expiresAtTick: state.tick + TICKS_PER_DAY * CARD_DURATION_DAYS,
  };
  state.pendingStoryEvents ??= [];
  if (!state.pendingStoryEvents.some((e) => e.id === event.id)) {
    state.pendingStoryEvents.push(event);
  }
  addNotification(state, '📜 The Rumour Ledger', 'The scribe needs a decision about a dangerous rumour.', 'info');
}

export function resolveRumourLedger(state: WorldState, choiceId: string): boolean {
  if (storyFlag(state, FLAG_RESOLVED) > 0) return true;
  const colonyDay = getColonyDay(state);
  const baseFlags: Record<string, number> = {
    [FLAG_RESOLVED]: state.tick,
    [FLAG_RESPONSE]: RESPONSE_CODES[choiceId as LedgerResponse] ?? RESPONSE_CODES.ignore,
    [AUTHORED_STORY_COOLDOWN_FLAG]: colonyDay + AUTHORED_STORY_COOLDOWN_DAYS,
    [FLAG_CAMPAIGN_RESOLVED]: state.tick,
  };

  switch (choiceId as LedgerResponse) {
    case 'correct':
      bumpVillageReputation(state, 2);
      addBigNews(state, '📜 A correction is published', 'The false entry is struck through. The valley nods.', 'positive');
      break;
    case 'encourage':
      addBigNews(state, '📜 The rumour stands', 'The rumour grows feathers and flies.', 'neutral');
      break;
    case 'ignore':
      addBigNews(state, '📜 The ledger is burned', 'The scribe sighs. The rumour outlives the book.', 'neutral');
      break;
    default:
      bumpVillageReputation(state, 1);
      addBigNews(state, '📜 The source is found', 'A prankster is unmasked — the valley laughs.', 'positive');
  }
  setStoryFlags(state, baseFlags);
  logEvent(state, 'event', `The Rumour Ledger resolved (${choiceId}).`, undefined);
  return true;
}
