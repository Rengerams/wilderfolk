/**
 * S2 — The Traveling Theatre (roadmap v0.6.3).
 * One-time seeded story: a traveling performer troupe offers a legendary play.
 */
import type { WorldState, StoryEvent } from './gameTypes';
import { TICKS_PER_DAY, getColonyDay } from './dayCycle';
import { addBigNews, addNotification } from './simEffects';
import { logEvent } from './eventLog';
import { storyFlag, setStoryFlags, bumpVillageReputation } from './storyHelpers';

export const STORY_KEY = 'traveling_theatre';
const FLAG_OFFERED = 'traveling_theatre_company_offered';
const FLAG_RESOLVED = 'traveling_theatre_company_resolved';
const FLAG_RESPONSE = 'traveling_theatre_company_response';
const FLAG_CAMPAIGN_RESOLVED = 'theatre_story_resolved';
export const AUTHORED_STORY_COOLDOWN_FLAG = 'authored_story_cd_until';
export const AUTHORED_STORY_COOLDOWN_DAYS = 21;

const MIN_DAY = 40;
const WINDOW_DAYS = 60;
const CARD_DURATION_DAYS = 4;

type TheatreResponse = 'honest_history' | 'legend' | 'embarrassment' | 'cancelled';

const RESPONSE_CODES: Record<TheatreResponse, number> = {
  honest_history: 1,
  legend: 2,
  embarrassment: 3,
  cancelled: 4,
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

export function travelingTheatreEligibleDay(mapSeed: number | undefined): number {
  const seed = (mapSeed ?? 1) >>> 0;
  return MIN_DAY + Math.floor(seededRoll(seed, hashSalt(STORY_KEY)) * WINDOW_DAYS);
}

function hasPerformerGroup(state: WorldState): boolean {
  return state.visitorGroups.some((g) => g.kind === 'performers' && (g.daysLeft ?? 0) > 0);
}

export function maybeOfferTravelingTheatre(state: WorldState): void {
  if (storyFlag(state, FLAG_OFFERED) > 0) return;
  const colonyDay = getColonyDay(state);
  if (colonyDay < travelingTheatreEligibleDay(state.worldMap?.seed)) return;
  if (storyFlag(state, AUTHORED_STORY_COOLDOWN_FLAG) > colonyDay) return;
  if ((state.pendingStoryEvents ?? []).length > 0) return;
  if (!hasPerformerGroup(state)) return;

  setStoryFlags(state, {
    [FLAG_OFFERED]: state.tick,
    [AUTHORED_STORY_COOLDOWN_FLAG]: colonyDay + AUTHORED_STORY_COOLDOWN_DAYS,
  });

  const event: StoryEvent = {
    id: `traveling_theatre_${state.tick}`,
    emoji: '🎭',
    storyKey: STORY_KEY,
    title: 'The Traveling Theatre',
    description:
      'A performer troupe has pitched canvas by the square. Their lead actor claims to know the true founding story of the valley — and offers to stage it, for better or worse.',
    choices: [
      {
        id: 'honest_history',
        label: 'Commission an honest history',
        detail: 'Reputation +2 · the valley hears its real, flawed story.',
      },
      {
        id: 'legend',
        label: 'Fund a heroic legend',
        detail: 'Reputation +4 · but the tale drifts from the truth.',
      },
      {
        id: 'embarrassment',
        label: 'Let them improvise',
        detail: 'A gamble — the troupe may mock the village.',
      },
      {
        id: 'cancelled',
        label: 'Send them away',
        detail: 'No spectacle, no risk.',
      },
    ],
    createdAtTick: state.tick,
    expiresAtTick: state.tick + TICKS_PER_DAY * CARD_DURATION_DAYS,
  };
  offerStoryEvent(state, event);
  addNotification(state, '🎭 The Traveling Theatre', 'A troupe offers to stage the valley’s story.', 'info');
}

function offerStoryEvent(state: WorldState, event: StoryEvent): void {
  state.pendingStoryEvents ??= [];
  if (!state.pendingStoryEvents.some((e) => e.id === event.id)) {
    state.pendingStoryEvents.push(event);
  }
}

export function resolveTravelingTheatre(state: WorldState, choiceId: string): boolean {
  if (storyFlag(state, FLAG_RESOLVED) > 0) return true;
  const colonyDay = getColonyDay(state);
  const baseFlags: Record<string, number> = {
    [FLAG_RESOLVED]: state.tick,
    [FLAG_RESPONSE]: RESPONSE_CODES[choiceId as TheatreResponse] ?? RESPONSE_CODES.cancelled,
    [AUTHORED_STORY_COOLDOWN_FLAG]: colonyDay + AUTHORED_STORY_COOLDOWN_DAYS,
    [FLAG_CAMPAIGN_RESOLVED]: state.tick,
  };

  switch (choiceId as TheatreResponse) {
    case 'honest_history':
      bumpVillageReputation(state, 2);
      addBigNews(state, '🎭 The true story is staged', 'The play is honest, awkward, and moving. The village talks about it for weeks.', 'positive');
      break;
    case 'legend':
      bumpVillageReputation(state, 4);
      addBigNews(state, '🎭 A legend is born', 'The troupe turns the valley’s past into a heroic saga. Few remember it differently now.', 'positive');
      break;
    case 'embarrassment':
      bumpVillageReputation(state, -1);
      addBigNews(state, '🎭 The troupe improvises', 'The comedy lands unevenly — a few elders walk out mid-act.', 'negative');
      break;
    default:
      addBigNews(state, '🎭 The theatre moves on', 'The troupe folds its canvas and departs without a performance.', 'neutral');
  }
  setStoryFlags(state, baseFlags);
  logEvent(state, 'event', `The Traveling Theatre resolved (${choiceId}).`, undefined);
  return true;
}

export function tickTravelingTheatre(_state: WorldState): void {
  // Resolution happens through the story card; no daily follow-up needed for S2.
}
