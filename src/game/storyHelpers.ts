import type { WorldState } from './gameTypes';

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
