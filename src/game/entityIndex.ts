import type { Entity, WorldState } from './gameTypes';

/**
 * A Map remains a Map after `structuredClone`, but its values are detached
 * clones. This weak association marks the exact map built for a live
 * WorldState so cloned or delta-stale maps are rebuilt instead of trusted.
 */
const canonicalMapByWorld = new WeakMap<WorldState, Map<number, Entity>>();

/** Insert or refresh a living entity in the tick-persistent id map. */
export function indexEntity(map: Map<number, Entity>, entity: Entity): void {
  if (entity.alive) map.set(entity.id, entity);
}

/** Remove an entity id from the map on death or despawn. */
export function unindexEntity(map: Map<number, Entity> | undefined, id: number): void {
  map?.delete(id);
}

export function unindexEntityFromState(state: WorldState, id: number): void {
  unindexEntity(ensureEntityByIdMap(state), id);
}

/**
 * Ensure entity lookup entries belong to this WorldState's active entities.
 * A transferred Map is structurally valid but stores detached entity clones,
 * so only maps created for this specific world object may be reused.
 */
export function ensureEntityByIdMap(state: WorldState): Map<number, Entity> {
  const existing = state.entityById;
  if (existing instanceof Map && canonicalMapByWorld.get(state) === existing) return existing;
  return rebuildEntityByIdMap(state);
}

/** Forget a map before replacing `entities` through a transfer or delta. */
export function invalidateEntityByIdMap(state: WorldState): void {
  canonicalMapByWorld.delete(state);
  state.entityById = undefined;
}

/** Index a newly spawned entity on `state.entityById` (creates map if needed). */
export function indexLivingEntity(state: WorldState, entity: Entity): void {
  if (!entity.alive) return;
  indexEntity(ensureEntityByIdMap(state), entity);
}

/** Remove entity from id map on death/despawn. */
export function unindexLivingEntity(state: WorldState, entity: Entity): void {
  entity.alive = false;
  unindexEntity(ensureEntityByIdMap(state), entity.id);
}

/** Full rebuild from alive entities — load recovery, init, and tests only. */
export function rebuildEntityByIdMap(
  state: WorldState,
  entities: readonly Entity[] = state.entities,
): Map<number, Entity> {
  const map = new Map<number, Entity>();
  for (const entity of entities) {
    if (entity.alive) map.set(entity.id, entity);
  }
  state.entityById = map;
  canonicalMapByWorld.set(state, map);
  return map;
}
