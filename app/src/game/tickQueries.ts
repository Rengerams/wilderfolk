import type { Entity } from './gameTypes';
import { EntityType } from './gameTypes';
import type { EntitySpatialGrid } from './spatialGrid';

/** O(1) alive lookup by entity id (rebuilt once per tick). */
export function getLivingEntity(
  id: number | null | undefined,
  entityById: Map<number, Entity>,
): Entity | undefined {
  if (id == null) return undefined;
  const entity = entityById.get(id);
  return entity?.alive ? entity : undefined;
}

/** Residence id → occupants (player humans only; built once per tickHumans). */
export function buildResidenceOccupantIndex(
  playerHumans: readonly Entity[],
): Map<number, Entity[]> {
  const index = new Map<number, Entity[]>();
  for (const human of playerHumans) {
    if (!human.alive) continue;
    const residenceId = human.residenceBuildingId;
    if (residenceId == null) continue;
    let bucket = index.get(residenceId);
    if (!bucket) {
      bucket = [];
      index.set(residenceId, bucket);
    }
    bucket.push(human);
  }
  return index;
}

export function getHousemates(
  entity: Entity,
  residenceOccupants: Map<number, Entity[]>,
): Entity[] {
  const residenceId = entity.residenceBuildingId;
  if (residenceId == null) return [];
  const bucket = residenceOccupants.get(residenceId);
  if (!bucket) return [];
  const out: Entity[] = [];
  for (const human of bucket) {
    if (human.alive && human.id !== entity.id) out.push(human);
  }
  return out;
}

export function findClosestEntityInRadius(
  mobileGrid: EntitySpatialGrid | undefined,
  x: number,
  y: number,
  radius: number,
  predicate: (entity: Entity, distSq: number) => boolean,
  fallback?: readonly Entity[],
): Entity | undefined {
  if (mobileGrid) {
    const hit = mobileGrid.findClosestInRadius(x, y, radius, predicate);
    return hit?.entity;
  }
  if (!fallback) return undefined;
  const radiusSq = radius * radius;
  let best: Entity | undefined;
  let bestDistSq = radiusSq;
  for (const entity of fallback) {
    if (!entity.alive) continue;
    const dx = entity.x - x;
    const dy = entity.y - y;
    const distSq = dx * dx + dy * dy;
    if (distSq <= bestDistSq && predicate(entity, distSq)) {
      bestDistSq = distSq;
      best = entity;
    }
  }
  return best;
}

export function forEachEntityInRadius(
  mobileGrid: EntitySpatialGrid | undefined,
  x: number,
  y: number,
  radius: number,
  fn: (entity: Entity, distSq: number) => void,
  fallback?: readonly Entity[],
): void {
  if (mobileGrid) {
    mobileGrid.forEachInRadius(x, y, radius, fn);
    return;
  }
  if (!fallback) return;
  const radiusSq = radius * radius;
  for (const entity of fallback) {
    if (!entity.alive) continue;
    const dx = entity.x - x;
    const dy = entity.y - y;
    const distSq = dx * dx + dy * dy;
    if (distSq <= radiusSq) fn(entity, distSq);
  }
}

/** Wildlife population for capacity checks — computed once per type per tickWildlife. */
export interface WildlifePopulationSnapshot {
  aliveByType: Map<EntityType, number>;
  newByType: Map<EntityType, number>;
  newSpawnedByParent: Map<number, number>;
}

const REPRO_WILDLIFE_TYPES: EntityType[] = [
  EntityType.Rabbit,
  EntityType.Deer,
  EntityType.Wolf,
  EntityType.Fox,
];

export function buildWildlifePopulationSnapshot(
  byType: Record<EntityType, Entity[]>,
  newEntities: readonly Entity[],
  spawnParents?: Map<number, number>,
): WildlifePopulationSnapshot {
  const aliveByType = new Map<EntityType, number>();
  const newByType = new Map<EntityType, number>();
  const newSpawnedByParent = new Map<number, number>();

  for (const type of REPRO_WILDLIFE_TYPES) {
    let alive = 0;
    for (const entity of byType[type]) {
      if (entity.alive) alive++;
    }
    aliveByType.set(type, alive);
  }

  for (const entity of newEntities) {
    if (!entity.alive || !REPRO_WILDLIFE_TYPES.includes(entity.type)) continue;
    newByType.set(entity.type, (newByType.get(entity.type) ?? 0) + 1);
    const parentId = spawnParents?.get(entity.id);
    if (parentId != null) {
      newSpawnedByParent.set(parentId, (newSpawnedByParent.get(parentId) ?? 0) + 1);
    }
  }

  return { aliveByType, newByType, newSpawnedByParent };
}

export function wildlifeTypePopulation(
  snapshot: WildlifePopulationSnapshot,
  type: EntityType,
  parentEntityId: number,
): number {
  return (snapshot.aliveByType.get(type) ?? 0)
    + (snapshot.newByType.get(type) ?? 0)
    - (snapshot.newSpawnedByParent.get(parentEntityId) ?? 0);
}

/** Alive grass count for reproduction cap — built once per tickWildlife. */
export interface GrassPopulationSnapshot {
  alive: number;
}

export function buildGrassPopulationSnapshot(
  byType: Record<EntityType, Entity[]>,
  newEntities: readonly Entity[],
): GrassPopulationSnapshot {
  let alive = 0;
  for (const grass of byType[EntityType.Grass]) {
    if (grass.alive) alive++;
  }
  for (const entity of newEntities) {
    if (entity.alive && entity.type === EntityType.Grass) alive++;
  }
  return { alive };
}

export function recordGrassBirth(snapshot: GrassPopulationSnapshot): void {
  snapshot.alive++;
}

export function recordGrassDeath(snapshot: GrassPopulationSnapshot): void {
  if (snapshot.alive > 0) snapshot.alive--;
}

/** Increment wildlife birth counters when offspring spawn mid-tick. */
export function recordWildlifeBirth(
  snapshot: WildlifePopulationSnapshot,
  type: EntityType,
  parentId?: number,
): void {
  if (!REPRO_WILDLIFE_TYPES.includes(type)) return;
  snapshot.newByType.set(type, (snapshot.newByType.get(type) ?? 0) + 1);
  if (parentId != null) {
    snapshot.newSpawnedByParent.set(
      parentId,
      (snapshot.newSpawnedByParent.get(parentId) ?? 0) + 1,
    );
  }
}