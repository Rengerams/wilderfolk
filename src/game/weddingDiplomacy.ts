/**
 * S3 — Wedding Diplomacy (roadmap v0.6.3).
 * One-time seeded story: a rival chief invites the village to a wedding; the
 * player's response shifts the rival relationship.
 */
import type { WorldState, StoryEvent } from './gameTypes';
import { BuildingType } from './gameTypes';
import { TICKS_PER_DAY, getColonyDay } from './dayCycle';
import { addBigNews, addNotification } from './simEffects';
import { logEvent } from './eventLog';
import { storyFlag, setStoryFlags, bumpVillageReputation } from './storyHelpers';

export const STORY_KEY = 'wedding_diplomacy';
const FLAG_OFFERED = 'wedding_diplomacy_offered';
const FLAG_RESOLVED = 'wedding_diplomacy_resolved';
const FLAG_RESPONSE = 'wedding_diplomacy_response';
const FLAG_CAMPAIGN_RESOLVED = 'wedding_diplomacy_resolved';
export const AUTHORED_STORY_COOLDOWN_FLAG = 'authored_story_cd_until';
export const AUTHORED_STORY_COOLDOWN_DAYS = 28;

const MIN_DAY = 60;
const WINDOW_DAYS = 90;
const CARD_DURATION_DAYS = 5;

type WeddingResponse = 'alliance' | 'uneasy_respect' | 'insult' | 'cancelled';

const RESPONSE_CODES: Record<WeddingResponse, number> = {
  alliance: 1,
  uneasy_respect: 2,
  insult: 3,
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

export function weddingDiplomacyEligibleDay(mapSeed: number | undefined): number {
  const seed = (mapSeed ?? 1) >>> 0;
  return MIN_DAY + Math.floor(seededRoll(seed, hashSalt(STORY_KEY)) * WINDOW_DAYS);
}

function hasCompletedResidenceAndStaffedProduction(state: WorldState): boolean {
  const hasResidence = state.buildings.some(
    (b) => b.completed && (b.type === BuildingType.House || b.type === BuildingType.Mansion),
  );
  const hasStaffedProduction = state.buildings.some(
    (b) => b.completed && b.occupants.length > 0 && b.type === BuildingType.Farm,
  );
  return hasResidence && hasStaffedProduction;
}

export function maybeOfferWeddingDiplomacy(state: WorldState): void {
  if (storyFlag(state, FLAG_OFFERED) > 0) return;
  const colonyDay = getColonyDay(state);
  if (colonyDay < weddingDiplomacyEligibleDay(state.worldMap?.seed)) return;
  if (storyFlag(state, AUTHORED_STORY_COOLDOWN_FLAG) > colonyDay) return;
  if ((state.pendingStoryEvents ?? []).length > 0) return;
  if (!hasCompletedResidenceAndStaffedProduction(state)) return;

  setStoryFlags(state, {
    [FLAG_OFFERED]: state.tick,
    [AUTHORED_STORY_COOLDOWN_FLAG]: colonyDay + AUTHORED_STORY_COOLDOWN_DAYS,
  });

  const event: StoryEvent = {
    id: `wedding_diplomacy_${state.tick}`,
    emoji: '💒',
    storyKey: STORY_KEY,
    title: 'Wedding Diplomacy',
    description:
      'A rival chief invites the village to their heir’s wedding. Attendance is a statement — absence is a statement too.',
    choices: [
      { id: 'alliance', label: 'Bring a generous gift', detail: 'Relations warm; the valley gains a friend.' },
      { id: 'uneasy_respect', label: 'Attend with a small escort', detail: 'Polite but guarded.' },
      { id: 'insult', label: 'Refuse loudly', detail: 'A sharp break — but memorable.' },
      { id: 'cancelled', label: 'Send regrets', detail: 'Quiet neutrality.' },
    ],
    createdAtTick: state.tick,
    expiresAtTick: state.tick + TICKS_PER_DAY * CARD_DURATION_DAYS,
  };
  state.pendingStoryEvents ??= [];
  if (!state.pendingStoryEvents.some((e) => e.id === event.id)) {
    state.pendingStoryEvents.push(event);
  }
  addNotification(state, '💒 Wedding invitation', 'A rival chief invites the village to a wedding.', 'info');
}

function shiftRelationship(state: WorldState, steps: number): void {
  const order: string[] = ['tense', 'competitive', 'neutral', 'friendly'];
  const rival = state.rivalSettlements[0];
  if (!rival) return;
  const idx = order.indexOf(rival.relationship);
  const next = Math.max(0, Math.min(order.length - 1, (idx < 0 ? 1 : idx) + steps));
  rival.relationship = order[next] as typeof rival.relationship;
}

export function resolveWeddingDiplomacy(state: WorldState, choiceId: string): boolean {
  if (storyFlag(state, FLAG_RESOLVED) > 0) return true;
  const colonyDay = getColonyDay(state);
  const baseFlags: Record<string, number> = {
    [FLAG_RESOLVED]: state.tick,
    [FLAG_RESPONSE]: RESPONSE_CODES[choiceId as WeddingResponse] ?? RESPONSE_CODES.cancelled,
    [AUTHORED_STORY_COOLDOWN_FLAG]: colonyDay + AUTHORED_STORY_COOLDOWN_DAYS,
    [FLAG_CAMPAIGN_RESOLVED]: state.tick,
  };

  switch (choiceId as WeddingResponse) {
    case 'alliance':
      shiftRelationship(state, 2);
      bumpVillageReputation(state, 2);
      addBigNews(state, '💒 An alliance is toasted', 'The wedding seals a warm new bond between the valleys.', 'positive');
      break;
    case 'uneasy_respect':
      shiftRelationship(state, 1);
      addBigNews(state, '💒 A guarded visit', 'The village is welcome — and watched.', 'neutral');
      break;
    case 'insult':
      shiftRelationship(state, -2);
      bumpVillageReputation(state, -1);
      addBigNews(state, '💒 The invitation is refused loudly', 'The rival chief will not forget the snub.', 'negative');
      break;
    default:
      addBigNews(state, '💒 Regrets only', 'The wedding proceeds without the village.', 'neutral');
  }
  setStoryFlags(state, baseFlags);
  logEvent(state, 'event', `Wedding Diplomacy resolved (${choiceId}).`, undefined);
  return true;
}
