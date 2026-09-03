import type { Entity } from './gameTypes';
import type { EntitySpatialGrid } from './spatialGrid';
import { SOCIAL_CELL_SIZE } from './spatialGrid';
import type { SpatialQueryCategory } from './spatialQueryMetrics';
import {
  isSpatialQueryMetricsEnabled,
  recordSpatialCandidate,
  withSpatialQuery,
} from './spatialQueryMetrics';

export interface AdaptiveRadiusOptions {
  /** Used for per-category tuning and profiling. */
  category: SpatialQueryCategory;
  /** Number of eligible entities in the fallback array. */
  population: number;
  /** Active simulation bounds in pixels. */
  worldWidth: number;
  worldHeight: number;
  /** Must match the grid's cell size. */
  cellSize: number;
  /** Use naive scanning when estimated grid work reaches this fraction of array work. */
  gridWorkThreshold?: number;
  /** Safety factor for non-uniform population clustering. */
  densityFactor?: number;
  /** Optional instrumentation profiling callback. */
  onDecision?: (data: AdaptiveQueryDecision) => void;
}

export interface AdaptiveQueryDecision {
  category: SpatialQueryCategory;
  mode: 'grid' | 'naive';
  radius: number;
  population: number;
  estimatedCandidates: number;
  estimatedCells: number;
  estimatedGridWork: number;
}

function squaredDistance(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

/**
 * Fast, allocation-free radial scan over a contiguous entity array.
 */
export function forEachInArrayRadius(
  entities: readonly Entity[],
  x: number,
  y: number,
  radius: number,
  callback: (entity: Entity, distSq: number) => void,
  predicate?: (entity: Entity) => boolean,
): void {
  const radiusSq = radius * radius;
  const metrics = isSpatialQueryMetricsEnabled();

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    if (!entity.alive) continue;
    if (predicate && !predicate(entity)) continue;

    const dx = entity.x - x;
    const dy = entity.y - y;
    const dSq = dx * dx + dy * dy;

    if (dSq > radiusSq) continue;
    if (metrics) recordSpatialCandidate();

    callback(entity, dSq);
  }
}

/**
 * Calculates operational cost estimate for a grid query vs a linear scan.
 */
function shouldQueryViaGrid(
  grid: EntitySpatialGrid | undefined,
  radius: number,
  options: AdaptiveRadiusOptions,
): boolean {
  if (!grid || options.population <= 0) return false;

  const cols = Math.max(1, Math.ceil(options.worldWidth / options.cellSize));
  const rows = Math.max(1, Math.ceil(options.worldHeight / options.cellSize));
  const totalCells = cols * rows;

  const cellDiameter = Math.ceil(radius / options.cellSize) * 2 + 1;
  const estimatedCells = Math.min(totalCells, cellDiameter * cellDiameter);

  const densityFactor = options.densityFactor ?? 1.0;
  const perCellDensity = options.population / totalCells;
  const estimatedCandidates = Math.ceil(estimatedCells * perCellDensity * densityFactor);

  // Grid work ≈ per-cell iteration overhead (0.6x) + candidate distance tests (1.0x)
  const estimatedGridWork = estimatedCells * 0.6 + estimatedCandidates;
  const threshold = options.gridWorkThreshold ?? 0.7;
  const useGrid = estimatedGridWork < options.population * threshold;

  if (options.onDecision) {
    options.onDecision({
      category: options.category,
      mode: useGrid ? 'grid' : 'naive',
      radius,
      population: options.population,
      estimatedCandidates,
      estimatedCells,
      estimatedGridWork,
    });
  }

  return useGrid;
}

/**
 * Adaptive forEach — routes to the grid or linear array based on cost estimation.
 */
export function forEachAdaptiveInRadius(
  grid: EntitySpatialGrid | undefined,
  fallbackEntities: readonly Entity[],
  x: number,
  y: number,
  radius: number,
  callback: (entity: Entity, distSq: number) => void,
  options: AdaptiveRadiusOptions,
  predicate?: (entity: Entity) => boolean,
): 'grid' | 'naive' {
  if (shouldQueryViaGrid(grid, radius, options)) {
    withSpatialQuery(options.category, () =>
      grid!.forEachInRadius(x, y, radius, (entity, distSq) => {
        if (predicate && !predicate(entity)) return;
        callback(entity, distSq);
      }),
    );
    return 'grid';
  }

  withSpatialQuery(options.category, () =>
    forEachInArrayRadius(fallbackEntities, x, y, radius, callback, predicate),
  );
  return 'naive';
}

/**
 * Linear nearest-neighbor scan without intermediate allocations.
 */
function naiveFindClosestInArray(
  entities: readonly Entity[],
  x: number,
  y: number,
  radius: number,
  predicate: (entity: Entity, distSq: number) => boolean,
): Entity | undefined {
  const radiusSq = radius * radius;
  const metrics = isSpatialQueryMetricsEnabled();

  let bestEntity: Entity | undefined;
  let bestDistSq = Number.POSITIVE_INFINITY;

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    if (!entity.alive) continue;

    const dx = entity.x - x;
    const dy = entity.y - y;
    const dSq = dx * dx + dy * dy;

    if (dSq > radiusSq || dSq >= bestDistSq || !predicate(entity, dSq)) continue;

    if (metrics) recordSpatialCandidate();
    bestEntity = entity;
    bestDistSq = dSq;
  }

  return bestEntity;
}

/**
 * Adaptive find-closest — selects nearest entity via cost-modeled routing.
 */
export function findClosestAdaptiveInRadius(
  grid: EntitySpatialGrid | undefined,
  fallbackEntities: readonly Entity[],
  x: number,
  y: number,
  radius: number,
  predicate: (entity: Entity, distSq: number) => boolean,
  options: AdaptiveRadiusOptions,
): Entity | undefined {
  if (shouldQueryViaGrid(grid, radius, options)) {
    return withSpatialQuery(options.category, () =>
      grid!.findClosestInRadius(x, y, radius, predicate),
    )?.entity;
  }

  return withSpatialQuery(options.category, () =>
    naiveFindClosestInArray(fallbackEntities, x, y, radius, predicate),
  );
}

// ============ TUNING CONSTANTS & CONFIGURATIONS ============

export const ADAPTIVE_QUERY_CONFIG = {
  social: { gridWorkThreshold: 0.7, densityFactor: 1.35 },
  flee: { gridWorkThreshold: 0.9, densityFactor: 1.1 },
  hunt: { gridWorkThreshold: 0.85, densityFactor: 1.1 },
} as const;

/** Ambient social scans run on a deterministic per-human bucket (1 in N ticks). */
export const SOCIAL_STAGGER = 6;

/** Domain-specific social radii. */
export const SOCIAL_GREETING_RADIUS = 48;
export const SOCIAL_BANTER_RADIUS = 72;
export const SOCIAL_FRIENDSHIP_RADIUS = 96;
export const SOCIAL_COURTSHIP_RADIUS = 90;
export const SOCIAL_AFFAIR_RADIUS = 120;

/** Standard options builder for human social queries. */
export function socialAdaptiveOptions(
  category: SpatialQueryCategory,
  population: number,
  worldWidth: number,
  worldHeight: number,
  onDecision?: (data: AdaptiveQueryDecision) => void,
): AdaptiveRadiusOptions {
  return {
    category,
    population,
    worldWidth,
    worldHeight,
    cellSize: SOCIAL_CELL_SIZE,
    gridWorkThreshold: ADAPTIVE_QUERY_CONFIG.social.gridWorkThreshold,
    densityFactor: ADAPTIVE_QUERY_CONFIG.social.densityFactor,
    onDecision,
  };
}
