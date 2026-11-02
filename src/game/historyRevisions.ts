import type { WorldState } from './gameTypes';

/** History families that cross the worker boundary only when they were written. */
export const HISTORY_FAMILIES = [
  'graveRecords',
  'populationHistory',
  'yearlyStats',
  'chronicleChapters',
  'villageRequestHistory',
  'genealogyRegistry',
] as const;

export type HistoryFamily = (typeof HISTORY_FAMILIES)[number];
export type HistoryRevisions = Readonly<Record<HistoryFamily, number>>;

const NO_REVISIONS: HistoryRevisions = Object.freeze({
  graveRecords: 0,
  populationHistory: 0,
  yearlyStats: 0,
  chronicleChapters: 0,
  villageRequestHistory: 0,
  genealogyRegistry: 0,
});

const revisionsByWorld = new WeakMap<WorldState, Record<HistoryFamily, number>>();

/** Record a written history family; only bumped by the owner of that history. */
export function bumpHistoryRevision(world: WorldState, family: HistoryFamily): void {
  let revisions = revisionsByWorld.get(world);
  if (!revisions) {
    revisions = { ...NO_REVISIONS };
    revisionsByWorld.set(world, revisions);
  }
  revisions[family] += 1;
}

/** A stable snapshot for the worker's "already shipped" baseline. */
export function snapshotHistoryRevisions(world: WorldState): HistoryRevisions {
  const revisions = revisionsByWorld.get(world);
  return revisions ? { ...revisions } : NO_REVISIONS;
}

/** Test seam: forget a world's counters, as a fresh load does. */
export function resetHistoryRevisions(world: WorldState): void {
  revisionsByWorld.delete(world);
}
