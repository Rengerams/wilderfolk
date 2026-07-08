import type { Building, Entity } from './gameTypes';
import { EntityType } from './gameTypes';
import { isPlayerHuman } from './groupEvents';
import type { EntitySpatialGrid, RoadAvoidanceIndex } from './spatialGrid';
import type { SpatialQueryCategory } from './spatialQueryMetrics';
import {
  isSpatialQueryMetricsEnabled,
  recordSpatialCandidate,
  withSpatialQuery,
} from './spatialQueryMetrics';

// ---------------------------------------------------------------------------
// Spatial query gateway — sim hot paths call only these helpers so metrics
// (queries / candidates / cells) stay consistent across grid and naive modes.
// ---------------------------------------------------------------------------

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
    if (!human.alive || human.type !== EntityType.Human || !isPlayerHuman(human)) continue;
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
  if (entity.type !== EntityType.Human || !isPlayerHuman(entity)) return [];
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

function naiveFindClosestInRadius(
  entities: readonly Entity[],
  x: number,
  y: number,
  radius: number,
  predicate: (entity: Entity, distSq: number) => boolean,
  metricCategory: SpatialQueryCategory,
): { entity: Entity; distSq: number } | null {
  const radiusSq = radius * radius;
  let best: { entity: Entity; distSq: number } | null = null;
  for (const entity of entities) {
    if (!entity.alive) continue;
    const dx = entity.x - x;
    const dy = entity.y - y;
    const distSq = dx * dx + dy * dy;
    if (distSq > radiusSq || !predicate(entity, distSq)) continue;
    if (isSpatialQueryMetricsEnabled()) recordSpatialCandidate(metricCategory);
    if (!best || distSq < best.distSq) best = { entity, distSq };
  }
  return best;
}

function naiveForEachInRadius(
  entities: readonly Entity[],
  x: number,
  y: number,
  radius: number,
  fn: (entity: Entity, distSq: number) => void,
  metricCategory: SpatialQueryCategory,
): void {
  const radiusSq = radius * radius;
  for (const entity of entities) {
    if (!entity.alive) continue;
    const dx = entity.x - x;
    const dy = entity.y - y;
    const distSq = dx * dx + dy * dy;
    if (distSq > radiusSq) continue;
    if (isSpatialQueryMetricsEnabled()) recordSpatialCandidate(metricCategory);
    fn(entity, distSq);
  }
}

export function findClosestInEntityGrid(
  grid: EntitySpatialGrid | undefined,
  x: number,
  y: number,
  radius: number,
  predicate: (entity: Entity, distSq: number) => boolean,
  metricCategory: SpatialQueryCategory,
  fallback?: readonly Entity[],
): { entity: Entity; distSq: number } | null {
  if (grid) {
    return withSpatialQuery(metricCategory, () =>
      grid.findClosestInRadius(x, y, radius, predicate),
    );
  }
  if (!fallback) return null;
  return withSpatialQuery(metricCategory, () =>
    naiveFindClosestInRadius(fallback, x, y, radius, predicate, metricCategory),
  );
}

export function findClosestEntityInRadius(
  grid: EntitySpatialGrid | undefined,
  x: number,
  y: number,
  radius: number,
  predicate: (entity: Entity, distSq: number) => boolean,
  metricCategory: SpatialQueryCategory,
  fallback?: readonly Entity[],
): Entity | undefined {
  return findClosestInEntityGrid(grid, x, y, radius, predicate, metricCategory, fallback)?.entity;
}

export function forEachInEntityGrid(
  grid: EntitySpatialGrid | undefined,
  x: number,
  y: number,
  radius: number,
  fn: (entity: Entity, distSq: number) => void,
  metricCategory: SpatialQueryCategory,
  fallback?: readonly Entity[],
): void {
  if (grid) {
    withSpatialQuery(metricCategory, () => grid.forEachInRadius(x, y, radius, fn));
    return;
  }
  if (!fallback) return;
  withSpatialQuery(metricCategory, () =>
    naiveForEachInRadius(fallback, x, y, radius, fn, metricCategory),
  );
}

/** @deprecated Use forEachInEntityGrid */
export const forEachEntityInRadius = forEachInEntityGrid;

export function queryIsNearRoad(
  roadAvoidance: RoadAvoidanceIndex | undefined,
  x: number,
  y: number,
  fallbackRoads: readonly Building[],
  fallbackOnRoad: (x: number, y: number, road: Building) => boolean,
): boolean {
  return withSpatialQuery('road_near', () => {
    if (roadAvoidance) return roadAvoidance.isNearRoad(x, y);
    for (const road of fallbackRoads) {
      if (isSpatialQueryMetricsEnabled()) recordSpatialCandidate('road_near');
      if (fallbackOnRoad(x, y, road)) return true;
    }
    return false;
  });
}

export function queryRoadAvoidance(
  roadAvoidance: RoadAvoidanceIndex | undefined,
  entity: Entity,
): void {
  if (!roadAvoidance) return;
  withSpatialQuery('road_avoid', () => roadAvoidance.applyAvoidance(entity));
}

/** Wildlife population for capacity checks — computed once per type per tickWildlife. */
export interface WildlifePopulationSnapshot {
  aliveByType: Map<EntityType, number>;
  newByType: Map<EntityType, number>;
  newSpawnedByParent: Map<number, number>;
  /** Entity ids folded into aliveByType from newEntities at snapshot build. */
  absorbedEntityIds: Set<number>;
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
  /** Mid-tick births only — incremented by recordWildlifeBirth; not folded into aliveByType. */
  const newByType = new Map<EntityType, number>();
  const newSpawnedByParent = new Map<number, number>();
  const absorbedEntityIds = new Set<number>();

  for (const type of REPRO_WILDLIFE_TYPES) {
    let alive = 0;
    for (const entity of byType[type]) {
      if (entity.alive) alive++;
    }
    aliveByType.set(type, alive);
    newByType.set(type, 0);
  }

  for (const entity of newEntities) {
    if (!entity.alive || !REPRO_WILDLIFE_TYPES.includes(entity.type)) continue;
    aliveByType.set(entity.type, (aliveByType.get(entity.type) ?? 0) + 1);
    absorbedEntityIds.add(entity.id);
    const parentId = spawnParents?.get(entity.id);
    if (parentId != null) {
      newSpawnedByParent.set(parentId, (newSpawnedByParent.get(parentId) ?? 0) + 1);
    }
  }

  return { aliveByType, newByType, newSpawnedByParent, absorbedEntityIds };
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
  /** Grass alive when the snapshot is taken (byType + tickHumans newEntities). */
  baselineAlive: number;
  /** Grass spawned after the snapshot within the same tickWildlife pass. */
  bornAfterSnapshot: number;
  /** Entity ids folded into baselineAlive from newEntities at snapshot build. */
  absorbedEntityIds: Set<number>;
}

export function grassPopulationTotal(snapshot: GrassPopulationSnapshot): number {
  return snapshot.baselineAlive + snapshot.bornAfterSnapshot;
}

export function buildGrassPopulationSnapshot(
  byType: Record<EntityType, Entity[]>,
  newEntities: readonly Entity[],
): GrassPopulationSnapshot {
  let baselineAlive = 0;
  const absorbedEntityIds = new Set<number>();
  for (const grass of byType[EntityType.Grass]) {
    if (grass.alive) baselineAlive++;
  }
  for (const entity of newEntities) {
    if (entity.alive && entity.type === EntityType.Grass) {
      baselineAlive++;
      absorbedEntityIds.add(entity.id);
    }
  }
  return { baselineAlive, bornAfterSnapshot: 0, absorbedEntityIds };
}

export function recordGrassBirth(snapshot: GrassPopulationSnapshot, entityId?: number): void {
  if (entityId != null && snapshot.absorbedEntityIds.has(entityId)) return;
  snapshot.bornAfterSnapshot++;
}

export function recordGrassDeath(snapshot: GrassPopulationSnapshot): void {
  if (snapshot.bornAfterSnapshot > 0) snapshot.bornAfterSnapshot--;
  else if (snapshot.baselineAlive > 0) snapshot.baselineAlive--;
}

/** Increment wildlife birth counters when offspring spawn mid-tick. */
export function recordWildlifeBirth(
  snapshot: WildlifePopulationSnapshot,
  type: EntityType,
  parentId?: number,
  entityId?: number,
): void {
  if (!REPRO_WILDLIFE_TYPES.includes(type)) return;
  if (entityId != null && snapshot.absorbedEntityIds.has(entityId)) return;
  snapshot.newByType.set(type, (snapshot.newByType.get(type) ?? 0) + 1);
  if (parentId != null) {
    snapshot.newSpawnedByParent.set(
      parentId,
      (snapshot.newSpawnedByParent.get(parentId) ?? 0) + 1,
    );
  }
}