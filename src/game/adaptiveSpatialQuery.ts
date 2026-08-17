import type { Entity } from './gameTypes';
import type { EntitySpatialGrid } from './spatialGrid';
import { SOCIAL_CELL_SIZE } from './spatialGrid';
import type { SpatialQueryCategory } from './spatialQueryMetrics';
import {
  isSpatialQueryMetricsEnabled,
  recordSpatialCandidate,
  withSpatialQuery,
} from './spatialQueryMetrics';

/**
 * Adaptive spatial queries — estimate the work of a grid radius query against a
 * contiguous-array scan and pick the cheaper strategy per call. Social queries
 * are broad and numerous; when a radius covers most of the settlement the plain
 * array beats bucket traversal, so the grid should be a strategy, not a mandate.
 */

export interface AdaptiveRadiusOptions {
  /** Used for per-category tuning and profiling. */
  category: SpatialQueryCategory;
  /** Number of eligible entities in the fallback array. */
  population: number;
  /** Active simulation bounds, not necessarily the full map texture size. */
  worldWidth: number;
  worldHeight: number;
  /** Must match the grid's cell size. */
  cellSize: number;
  /** Use naive scanning when estimated grid work reaches this fraction of array work. */
  gridWorkThreshold?: number;
  /** Safety factor for non-uniform population density. */
  densityFactor?: number;
  /** Optional instrumentation callback. */
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
 * Scans a compact array without allocating a result array.
 * The callback receives only candidates that pass the radius and predicate.
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
    if (squaredDistance(x, y, entity.x, entity.y) > radiusSq) continue;
    if (metrics) recordSpatialCandidate();
    callback(entity, squaredDistance(x, y, entity.x, entity.y));
  }
}

/**
 * Work estimate for a radius query against the grid: the number of cells the
 * query touches and a uniform-density guess at the candidates inside them.
 * Assumes the query center is anywhere on the map; edge cases only reduce work.
 */
function estimateGridWork(
  radius: number,
  population: number,
  worldWidth: number,
  worldHeight: number,
  cellSize: number,
  densityFactor: number,
): { estimatedCandidates: number; estimatedCells: number; estimatedGridWork: number } {
  const cols = Math.max(1, Math.ceil(worldWidth / cellSize));
  const rows = Math.max(1, Math.ceil(worldHeight / cellSize));
  const cellRadius = Math.ceil(radius / cellSize);
  const minCol = Math.max(0, -cellRadius);
  const maxCol = Math.min(cols - 1, cellRadius);
  const minRow = Math.max(0, -cellRadius);
  const maxRow = Math.min(rows - 1, cellRadius);
  const estimatedCells = (maxCol - minCol + 1) * (maxRow - minRow + 1);
  const totalCells = cols * rows;
  const perCell = population / Math.max(1, totalCells);
  const estimatedCandidates = Math.ceil(estimatedCells * perCell * densityFactor);
  // Grid work ≈ per-cell iteration overhead + per-candidate distance checks;
  // array work ≈ population (one pass, no cell overhead).
  const estimatedGridWork = estimatedCells * 0.6 + estimatedCandidates;
  return { estimatedCandidates, estimatedCells, estimatedGridWork };
}

function buildDecision(
  category: SpatialQueryCategory,
  mode: 'grid' | 'naive',
  radius: number,
  population: number,
  est: { estimatedCandidates: number; estimatedCells: number; estimatedGridWork: number },
): AdaptiveQueryDecision {
  return {
    category,
    mode,
    radius,
    population,
    estimatedCandidates: est.estimatedCandidates,
    estimatedCells: est.estimatedCells,
    estimatedGridWork: est.estimatedGridWork,
  };
}

function decideAdaptiveMode(
  grid: EntitySpatialGrid | undefined,
  radius: number,
  options: AdaptiveRadiusOptions,
): { mode: 'grid' | 'naive'; est: { estimatedCandidates: number; estimatedCells: number; estimatedGridWork: number } } {
  const est = estimateGridWork(
    radius,
    options.population,
    options.worldWidth,
    options.worldHeight,
    options.cellSize,
    options.densityFactor ?? 1.0,
  );
  const threshold = options.gridWorkThreshold ?? 0.7;
  const mode: 'grid' | 'naive' = Boolean(grid) && est.estimatedGridWork < options.population * threshold ? 'grid' : 'naive';
  options.onDecision?.(buildDecision(options.category, mode, radius, options.population, est));
  return { mode, est };
}

/**
 * Adaptive forEach — routes to the grid or the contiguous array.
 * Returns the chosen mode for instrumentation.
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
  const { mode } = decideAdaptiveMode(grid, radius, options);

  if (mode === 'grid') {
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

function naiveFindClosestInArray(
  entities: readonly Entity[],
  x: number,
  y: number,
  radius: number,
  predicate: (entity: Entity, distSq: number) => boolean,
): { entity: Entity; distSq: number } | null {
  const radiusSq = radius * radius;
  let best: { entity: Entity; distSq: number } | null = null;
  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    if (!entity.alive) continue;
    const distSq = squaredDistance(x, y, entity.x, entity.y);
    if (distSq > radiusSq || !predicate(entity, distSq)) continue;
    if (isSpatialQueryMetricsEnabled()) recordSpatialCandidate();
    if (!best || distSq < best.distSq) best = { entity, distSq };
  }
  return best;
}

/**
 * Adaptive find-closest — same estimate, returns the nearest passing entity.
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
  const { mode } = decideAdaptiveMode(grid, radius, options);

  if (mode === 'grid') {
    return withSpatialQuery(options.category, () =>
      grid!.findClosestInRadius(x, y, radius, predicate),
    )?.entity;
  }
  return withSpatialQuery(options.category, () =>
    naiveFindClosestInArray(fallbackEntities, x, y, radius, predicate),
  )?.entity;
}

/** Per-category tuning — social queries switch to the array earlier. */
export const ADAPTIVE_QUERY_CONFIG = {
  social: { gridWorkThreshold: 0.7, densityFactor: 1.35 },
  flee: { gridWorkThreshold: 0.9, densityFactor: 1.1 },
  hunt: { gridWorkThreshold: 0.85, densityFactor: 1.1 },
} as const;

/** Ambient social scans run on a deterministic per-human bucket (1 in N ticks). */
export const SOCIAL_STAGGER = 6;

/** Behavior-specific social radii — greetings don't need courtship range. */
export const SOCIAL_GREETING_RADIUS = 48;
export const SOCIAL_BANTER_RADIUS = 72;
export const SOCIAL_FRIENDSHIP_RADIUS = 96;
export const SOCIAL_COURTSHIP_RADIUS = 90; // existing specialized courtship range
export const SOCIAL_AFFAIR_RADIUS = 120; // daily-tryst paramour scan

/** Standard social-query options (density vs the human-only social grid). */
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
