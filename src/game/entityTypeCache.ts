import type { Entity, EntityByType, WorldState } from './gameTypes';
import { buildEntityByType } from './simFocus';

/**
 * Identity-stable entity buckets for unchanged local ticks. The cache is keyed
 * by WorldState so it can be explicitly invalidated when a worker delta swaps
 * the entity array beneath an existing world object.
 */
const stableByTypeByWorld = new WeakMap<WorldState, EntityByType>();

export function getCachedEntityByType(state: WorldState, aliveEntities: readonly Entity[]): EntityByType {
  return stableByTypeByWorld.get(state) ?? buildEntityByType(aliveEntities);
}

export function cacheEntityByType(state: WorldState, byType: EntityByType): void {
  stableByTypeByWorld.set(state, byType);
}

export function invalidateCachedEntityByType(state: WorldState): void {
  stableByTypeByWorld.delete(state);
  state.entityByType = undefined;
}
