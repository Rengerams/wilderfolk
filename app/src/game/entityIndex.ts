import type { Entity, WorldState } from './gameTypes';
import { syncTreeSpatialIndex } from './treeProximity';

/** Insert or refresh a living entity in the tick-persistent id map. */
export function indexEntity(map: Map<number, Entity>, entity: Entity): void {
  if (entity.alive) map.set(entity.id, entity);
}

/** Remove an entity id from the map on death or despawn. */
export function unindexEntity(map: Map<number, Entity> | undefined, id: number): void {
  map?.delete(id);
}

export function unindexEntityFromState(state: WorldState, id: number): void {
  unindexEntity(state.entityById, id);
}

/** Ensure `state.entityById` exists — rebuild once after load/init when missing. */
export function ensureEntityByIdMap(state: WorldState): Map<number, Entity> {
  const existing = state.entityById;
  if (existing instanceof Map) return existing;
  return rebuildEntityByIdMap(state);
}

/** Index a newly spawned entity on `state.entityById` (creates map if needed). */
export function indexLivingEntity(state: WorldState, entity: Entity): void {
  if (!entity.alive) return;
  indexEntity(ensureEntityByIdMap(state), entity);
  syncTreeSpatialIndex(state, entity);
}

/** Remove entity from id map and static tree grid on death/despawn. */
export function unindexLivingEntity(state: WorldState, entity: Entity): void {
  unindexEntity(state.entityById, entity.id);
  syncTreeSpatialIndex(state, entity);
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
  return map;
}