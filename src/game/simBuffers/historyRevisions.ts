import type { WorldState } from '../gameTypes';

export const HISTORY_REVISION_KEYS = [
  'graveRecords',
  'populationHistory',
  'yearlyStats',
  'chronicleChapters',
  'villageRequestHistory',
] as const;

export type HistoryRevisionKey = (typeof HISTORY_REVISION_KEYS)[number];
const revisions = new WeakMap<WorldState, Map<HistoryRevisionKey, number>>();

export function initializeHistoryRevisions(world: WorldState): void {
  revisions.set(world, new Map(HISTORY_REVISION_KEYS.map((key) => [key, 0])));
}

export function markHistoryChanged(world: WorldState, key: HistoryRevisionKey): void {
  const state = revisions.get(world);
  if (!state) return;
  state.set(key, (state.get(key) ?? 0) + 1);
}

export function historyRevision(world: WorldState, key: string): number | undefined {
  return revisions.get(world)?.get(key as HistoryRevisionKey);
}
