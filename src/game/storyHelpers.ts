import type { StoryEvent, WorldState } from './gameTypes';
import { hashSalt, mulberry32Advance, mulberry32Draw } from './simRng';
import { addReputation } from './simHelpers';

export { hashSalt } from './simRng';

/**
 * One shared cooldown slot for all authored (one-time) stories: when any
 * authored story fires it stamps this flag with its expiry colony day, and no
 * other authored story may start before then. Single owner of the flag key.
 */
export const AUTHORED_STORY_COOLDOWN_FLAG = 'authored_story_cd_until';

/** Shared story-flag helpers used by the one-time authored story modules. */
export function storyFlag(state: WorldState, key: string): number {
  return state.storyFlags?.[key] ?? 0;
}

export function setStoryFlags(state: WorldState, patch: Record<string, number>): void {
  state.storyFlags = { ...state.storyFlags, ...patch };
}

/**
 * Story-side reputation gain.
 *
 * Delegates to the reputation owner so the 0..100 clamp has **one** definition. This used to re-state
 * the rule with only the floor (`Math.max(0, …)`), so a story reward could push reputation past 100 —
 * the owner clamps both ends (`simHelpers.addReputation`), which is the documented contract
 * (`LIVE-FINDINGS-STATUS.md`, L5).
 */
export function bumpVillageReputation(state: WorldState, amount: number): void {
  addReputation(state, amount);
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
  return mulberry32Draw(mulberry32Advance((seed ^ salt) >>> 0));
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
