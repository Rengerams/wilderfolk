import type { StoryEvent, WorldState } from './gameTypes';

/** Shared story-flag helpers used by the one-time authored story modules. */
export function storyFlag(state: WorldState, key: string): number {
  return state.storyFlags?.[key] ?? 0;
}

export function setStoryFlags(state: WorldState, patch: Record<string, number>): void {
  state.storyFlags = { ...state.storyFlags, ...patch };
}

export function bumpVillageReputation(state: WorldState, amount: number): void {
  state.villageReputation = Math.max(0, state.villageReputation + amount);
}

/** Push a story card once; shared by all authored stories. */
export function pushStoryCard(state: WorldState, event: StoryEvent): void {
  state.pendingStoryEvents ??= [];
  if (!state.pendingStoryEvents.some((e) => e.id === event.id)) {
    state.pendingStoryEvents.push(event);
  }
}

/** Deterministic seeded roll shared by all authored stories (mulberry32 variant). */
export function seededRoll(seed: number, salt: number): number {
  let s = (seed ^ salt) >>> 0;
  s = (s + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** FNV-1a string hash used to salt seeded rolls with story/module names. */
export function hashSalt(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Shared one-time story start-day calculation: minDay + seeded window roll. */
export function eligibleDayForStory(
  mapSeed: number | undefined,
  storyKey: string,
  minDay: number,
  windowDays: number,
): number {
  const seed = (mapSeed ?? 1) >>> 0;
  return minDay + Math.floor(seededRoll(seed, hashSalt(storyKey)) * windowDays);
}
