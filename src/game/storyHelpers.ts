import { seededRandom } from './simRng';
import type { StoryEvent, WorldState } from './gameTypes';

// Re-export for story modules that import from storyHelpers
export { hashSalt, seededRandom } from './simRng';

/**
 * Deterministic seeded roll alias delegating to simRng.
 * Supports both string salts and numeric IDs.
 */
export function seededRoll(seed: number, salt: string | number): number {
  return seededRandom(seed, typeof salt === 'string' ? salt : String(salt));
}

/** Shared story-flag helpers used by authored story modules. */
export function storyFlag(state: WorldState, key: string): number {
  return state.storyFlags?.[key] ?? 0;
}

export function setStoryFlags(state: WorldState, patch: Record<string, number>): void {
  state.storyFlags = { ...state.storyFlags, ...patch };
}

export function bumpVillageReputation(state: WorldState, amount: number): void {
  state.villageReputation = Math.max(0, (state.villageReputation ?? 0) + amount);
}

/** Push a story card once (idempotent); shared by all authored stories. */
export function pushStoryCard(state: WorldState, event: StoryEvent): void {
  state.pendingStoryEvents ??= [];
  if (!state.pendingStoryEvents.some((e) => e.id === event.id)) {
    state.pendingStoryEvents.push(event);
  }
}

/** Shared one-time story start-day calculation: minDay + seeded window roll. */
export function eligibleDayForStory(
  mapSeed: number | undefined,
  storyKey: string,
  minDay: number,
  windowDays: number,
): number {
  const seed = (mapSeed ?? 1) >>> 0;
  return minDay + Math.floor(seededRandom(seed, storyKey) * windowDays);
}