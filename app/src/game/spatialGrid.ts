import type { Entity, Building } from './gameTypes';
import { EntityType } from './gameTypes';
import {
  isSpatialQueryMetricsEnabled,
  recordSpatialCandidate,
  recordSpatialCells,
} from './spatialQueryMetrics';

/** Grass patches — updated on birth/death; queried for graze. */
export const GRASS_CELL_SIZE = 56;

/** Humans + wildlife — updated each tick for flee/hunt/pack queries. */
export const MOBILE_CELL_SIZE = 80;

const MOBILE_ENTITY_TYPES = new Set<EntityType>([
  EntityType.Human,
  EntityType.Wolf,
  EntityType.Fox,
  EntityType.Deer,
  EntityType.Rabbit,
  EntityType.Wildkin,
  EntityType.Werewolf,
]);

export function envFlagDisabled(val: string | undefined): boolean {
  if (val == null || val === '') return false;
  return /^(0|false|no|off|disabled)$/i.test(val.trim());
}

function envFlagEnabled(val: string | undefined): boolean {
  if (val == null || val === '') return false;
  return /^(1|true|yes|on|enabled)$/i.test(val.trim());
}

function isSpatialGridDisabled(): boolean {
  if (typeof import.meta !== 'undefined' && envFlagDisabled(import.meta.env?.VITE_USE_SPATIAL_GRID)) {
    return true;
  }
  const runtime = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  return envFlagDisabled(runtime.process?.env?.USE_SPATIAL_GRID);
}

/** When false, hunt/graze/flee fall back to full-map entity scans (A/B perf comparison). */
export const USE_SPATIAL_GRID = !isSpatialGridDisabled();

export function isMobileGridEntity(entity: Entity): boolean {
  return MOBILE_ENTITY_TYPES.has(entity.type);
}

export function isGrassGridEntity(entity: Entity): boolean {
  return entity.type === EntityType.Grass;
}

export function isTreeGridEntity(entity: Entity): boolean {
  return entity.type === EntityType.Tree && entity.alive;
}

export function distSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

/** Uniform spatial hash — broad-phase filter; callers must still apply SPECIES_CONFIG radii. */
export class EntitySpatialGrid {
  readonly mapWidth: number;
  readonly mapHeight: number;
  readonly cellSize: number;
  private readonly cells: Entity[][];
  private readonly cols: number;
  private readonly rows: number;
  /** entity id → cell coords (invariant: alive filtered entities appear exactly once). */
  private readonly entityCell = new Map<number, { col: number; row: number }>();

  constructor(
    mapWidth: number,
    mapHeight: number,
    cellSize: number,
  ) {
    this.mapWidth = mapWidth;
    this.mapHeight = mapHeight;
    this.cellSize = cellSize;
    this.cols = Math.max(1, Math.ceil(mapWidth / cellSize));
    this.rows = Math.max(1, Math.ceil(mapHeight / cellSize));
    this.cells = Array.from({ length: this.cols * this.rows }, () => []);
  }

  get gridCols(): number {
    return this.cols;
  }

  get gridRows(): number {
    return this.rows;
  }

  matchesLayout(mapWidth: number, mapHeight: number, cellSize: number): boolean {
    return this.mapWidth === mapWidth
      && this.mapHeight === mapHeight
      && this.cellSize === cellSize;
  }

  private cellIndex(col: number, row: number): number {
    return row * this.cols + col;
  }

  cellCoords(x: number, y: number): { col: number; row: number } | null {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const col = Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.cellSize)));
    const row = Math.min(this.rows - 1, Math.max(0, Math.floor(y / this.cellSize)));
    return { col, row };
  }

  clear(): void {
    for (const bucket of this.cells) bucket.length = 0;
    this.entityCell.clear();
  }

  /** Remove an entity from its current cell (no-op if absent). */
  remove(entity: Entity): void {
    this.removeById(entity.id);
  }

  private removeById(id: number): void {
    const cell = this.entityCell.get(id);
    if (!cell) return;
    const bucket = this.cells[this.cellIndex(cell.col, cell.row)];
    const pos = bucket.findIndex((e) => e.id === id);
    if (pos >= 0) {
      const last = bucket.pop()!;
      if (pos < bucket.length) bucket[pos] = last;
    }
    this.entityCell.delete(id);
  }

  private insert(entity: Entity): void {
    if (!entity.alive) return;
    if (!Number.isFinite(entity.x) || !Number.isFinite(entity.y)) return;

    const coords = this.cellCoords(entity.x, entity.y);
    if (!coords) return;

    const existing = this.entityCell.get(entity.id);
    if (existing && existing.col === coords.col && existing.row === coords.row) {
      return;
    }

    this.removeById(entity.id);

    const { col, row } = coords;
    this.cells[this.cellIndex(col, row)].push(entity);
    this.entityCell.set(entity.id, { col, row });
  }

  /**
   * Incremental move — removes the entity from its old cell and inserts at the new coords.
   * Prefer this over `rebuild()` when only a few entities moved between ticks.
   */
  update(entity: Entity): void {
    if (!entity.alive) {
      this.remove(entity);
      return;
    }
    this.insert(entity);
  }

  /** Insert only when the entity is missing from the grid (cheap tick-start reconcile). */
  ensurePresent(entity: Entity): void {
    if (!entity.alive) {
      this.remove(entity);
      return;
    }
    if (!this.entityCell.has(entity.id)) {
      this.insert(entity);
    }
  }

  hasEntity(id: number): boolean {
    return this.entityCell.has(id);
  }

  rebuild(entities: Iterable<Entity>, filter?: (entity: Entity) => boolean): void {
    this.clear();
    for (const entity of entities) {
      if (!entity.alive) continue;
      if (filter && !filter(entity)) continue;
      this.insert(entity);
    }
  }

  /** Broad-phase: all entities in cells overlapping the axis-aligned rect. */
  forEachInRect(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    fn: (entity: Entity) => void,
  ): void {
    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
      return;
    }
    const loX = Math.min(minX, maxX);
    const hiX = Math.max(minX, maxX);
    const loY = Math.min(minY, maxY);
    const hiY = Math.max(minY, maxY);

    const minCol = Math.max(0, Math.floor(loX / this.cellSize));
    const maxCol = Math.min(this.cols - 1, Math.floor(hiX / this.cellSize));
    const minRow = Math.max(0, Math.floor(loY / this.cellSize));
    const maxRow = Math.min(this.rows - 1, Math.floor(hiY / this.cellSize));

    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const bucket = this.cells[this.cellIndex(col, row)];
        for (const entity of bucket) {
          if (!entity.alive) continue;
          if (entity.x < loX || entity.x > hiX || entity.y < loY || entity.y > hiY) continue;
          fn(entity);
        }
      }
    }
  }

  /**
   * Broad-phase: square of grid cells around (x, y), then narrow-phase `distSq <= radius²`.
   * Corner cells may extend past the circle — callers must filter on `distSq` (already applied here).
   */
  forEachInRadius(
    x: number,
    y: number,
    radius: number,
    fn: (entity: Entity, distSq: number) => void,
    recordCandidates = true,
  ): void {
    const coords = this.cellCoords(x, y);
    if (!coords) return;

    const radiusSq = radius * radius;
    const { col: cx, row: cy } = coords;
    const cellRadius = Math.ceil(radius / this.cellSize);
    const minCol = Math.max(0, cx - cellRadius);
    const maxCol = Math.min(this.cols - 1, cx + cellRadius);
    const minRow = Math.max(0, cy - cellRadius);
    const maxRow = Math.min(this.rows - 1, cy + cellRadius);
    if (isSpatialQueryMetricsEnabled()) {
      recordSpatialCells(null, (maxCol - minCol + 1) * (maxRow - minRow + 1));
    }

    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const bucket = this.cells[this.cellIndex(col, row)];
        for (const entity of bucket) {
          if (!entity.alive) continue;
          const dSq = distSq(x, y, entity.x, entity.y);
          if (dSq <= radiusSq) {
            if (recordCandidates && isSpatialQueryMetricsEnabled()) recordSpatialCandidate();
            fn(entity, dSq);
          }
        }
      }
    }
  }

  /**
   * 3×3 neighborhood (self + 8 neighbors) — for future scent gradient sampling.
   * Return `false` from the callback to stop iterating early.
   */
  forEachNeighborCell(
    x: number,
    y: number,
    fn: (col: number, row: number, cellIdx: number, bucket: Entity[]) => boolean | void,
  ): boolean {
    const coords = this.cellCoords(x, y);
    if (!coords) return false;

    const { col: cx, row: cy } = coords;
    for (let row = Math.max(0, cy - 1); row <= Math.min(this.rows - 1, cy + 1); row++) {
      for (let col = Math.max(0, cx - 1); col <= Math.min(this.cols - 1, cx + 1); col++) {
        const cellIdx = this.cellIndex(col, row);
        const bucket = this.cells[cellIdx];
        let aliveBucket: Entity[] | undefined;
        for (const entity of bucket) {
          if (!entity.alive) continue;
          if (!aliveBucket) aliveBucket = [];
          aliveBucket.push(entity);
        }
        if (fn(col, row, cellIdx, aliveBucket ?? []) === false) return true;
      }
    }
    return false;
  }

  findClosestInRadius(
    x: number,
    y: number,
    radius: number,
    predicate: (entity: Entity, distSq: number) => boolean,
  ): { entity: Entity; distSq: number } | null {
    let best: { entity: Entity; distSq: number } | null = null;
    this.forEachInRadius(x, y, radius, (entity, dSq) => {
      if (!entity.alive || !predicate(entity, dSq)) return;
      if (isSpatialQueryMetricsEnabled()) recordSpatialCandidate();
      if (!best || dSq < best.distSq) best = { entity, distSq: dSq };
    }, false);
    return best;
  }

  /** Returns entities missing from grid or duplicated / stale entries (single linear pass). */
  validateInvariant(
    entities: Iterable<Entity>,
    filter: (entity: Entity) => boolean,
  ): string[] {
    const errors: string[] = [];
    const expected = new Set<number>();

    for (const entity of entities) {
      if (!entity.alive || !filter(entity)) continue;
      expected.add(entity.id);
      const cell = this.entityCell.get(entity.id);
      if (!cell) {
        errors.push(`missing entity ${entity.id} (${entity.type})`);
      }
    }

    const seen = new Set<number>();
    for (const bucket of this.cells) {
      for (const entity of bucket) {
        if (seen.has(entity.id)) {
          errors.push(`duplicate entity ${entity.id} in grid`);
          continue;
        }
        seen.add(entity.id);
        if (!expected.has(entity.id)) {
          if (entity.alive) {
            errors.push(`orphan entity ${entity.id} in grid`);
          } else {
            errors.push(`stale dead entity ${entity.id} in grid`);
          }
        }
      }
    }

    for (const id of expected) {
      if (!seen.has(id)) errors.push(`ghost entity ${id} not in any cell`);
    }

    return errors;
  }
}

/** structuredClone strips class methods — stale plain objects must not be reused. */
function isReusableSpatialGrid(
  grid: unknown,
  mapWidth: number,
  mapHeight: number,
  cellSize: number,
): grid is EntitySpatialGrid {
  return grid instanceof EntitySpatialGrid
    && typeof grid.rebuild === 'function'
    && grid.matchesLayout(mapWidth, mapHeight, cellSize);
}

/** Allocate or reuse a spatial grid only when layout and class methods match. */
export function resolveSpatialGrid(
  existing: EntitySpatialGrid | undefined,
  mapWidth: number,
  mapHeight: number,
  cellSize: number,
): EntitySpatialGrid {
  if (isReusableSpatialGrid(existing, mapWidth, mapHeight, cellSize)) {
    return existing;
  }
  return new EntitySpatialGrid(mapWidth, mapHeight, cellSize);
}

export function buildGrassGrid(
  mapWidth: number,
  mapHeight: number,
  entities: Iterable<Entity>,
): EntitySpatialGrid {
  const grid = new EntitySpatialGrid(mapWidth, mapHeight, GRASS_CELL_SIZE);
  grid.rebuild(entities, isGrassGridEntity);
  return grid;
}

/** Allocate grass index; full rebuild only on first tick or after layout/clone recovery. */
export function syncGrassRenderGrid(
  existing: EntitySpatialGrid | undefined,
  mapWidth: number,
  mapHeight: number,
  grassEntities: Iterable<Entity>,
): EntitySpatialGrid | undefined {
  if (!USE_SPATIAL_GRID) return undefined;
  const grid = resolveSpatialGrid(existing, mapWidth, mapHeight, GRASS_CELL_SIZE);
  if (grid !== existing) {
    grid.rebuild(grassEntities, isGrassGridEntity);
  }
  return grid;
}

/** Viewport grass cull — prefers a tick-persistent grid; falls back to ephemeral build. */
export function collectGrassInViewport(
  grassGrid: EntitySpatialGrid | null | undefined,
  grassEntities: Entity[],
  mapWidth: number,
  mapHeight: number,
  camX: number,
  camY: number,
  zoom: number,
  canvasW: number,
  canvasH: number,
): Entity[] {
  const vp = viewportFromCamera(camX, camY, zoom, canvasW, canvasH);
  const visible: Entity[] = [];
  if (
    grassGrid
    && grassGrid.matchesLayout(mapWidth, mapHeight, GRASS_CELL_SIZE)
  ) {
    grassGrid.forEachInRect(vp.minX, vp.minY, vp.maxX, vp.maxY, (grass) => visible.push(grass));
    return visible;
  }
  if (grassEntities.length === 0) return [];
  const grid = buildGrassGrid(mapWidth, mapHeight, grassEntities);
  grid.forEachInRect(vp.minX, vp.minY, vp.maxX, vp.maxY, (grass) => visible.push(grass));
  return visible;
}

export interface WorldViewport {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function viewportFromCamera(
  camX: number,
  camY: number,
  zoom: number,
  canvasW: number,
  canvasH: number,
  padding = 48,
): WorldViewport {
  const z = Math.max(0.05, zoom);
  const pad = padding / z;
  const halfW = canvasW / (2 * z);
  const halfH = canvasH / (2 * z);
  return {
    minX: camX - halfW - pad,
    minY: camY - halfH - pad,
    maxX: camX + halfW + pad,
    maxY: camY + halfH + pad,
  };
}

/** Keep grass/mobile/tree grids aligned after mid-tick movement, birth, or death. */
export function syncSpatialGridEntity(
  entity: Entity,
  grassGrid?: EntitySpatialGrid,
  mobileGrid?: EntitySpatialGrid,
  treeGrid?: EntitySpatialGrid,
): void {
  if (!USE_SPATIAL_GRID) return;
  if (grassGrid && isGrassGridEntity(entity)) grassGrid.update(entity);
  if (mobileGrid && isMobileGridEntity(entity)) mobileGrid.update(entity);
  if (treeGrid && entity.type === EntityType.Tree) {
    if (entity.alive) treeGrid.update(entity);
    else treeGrid.remove(entity);
  }
}

const ROAD_AVOID_CELL = 128;
const ROAD_AVOID_RADIUS = 60;

interface RoadCellEntry {
  cx: number;
  cy: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Road centers indexed by cell — avoids scanning every road segment per entity. */
export class RoadAvoidanceIndex {
  readonly mapWidth: number;
  readonly mapHeight: number;
  readonly cellSize: number;
  private readonly cells: RoadCellEntry[][];
  private readonly cols: number;
  private readonly rows: number;

  constructor(mapWidth: number, mapHeight: number, roads: readonly Building[]) {
    this.mapWidth = mapWidth;
    this.mapHeight = mapHeight;
    this.cellSize = ROAD_AVOID_CELL;
    this.cols = Math.max(1, Math.ceil(mapWidth / this.cellSize));
    this.rows = Math.max(1, Math.ceil(mapHeight / this.cellSize));
    this.cells = Array.from({ length: this.cols * this.rows }, () => []);
    for (const road of roads) {
      if (!road.completed) continue;
      const cx = road.x + road.width / 2;
      const cy = road.y + road.height / 2;
      const col = Math.min(this.cols - 1, Math.max(0, Math.floor(cx / this.cellSize)));
      const row = Math.min(this.rows - 1, Math.max(0, Math.floor(cy / this.cellSize)));
      this.cells[row * this.cols + col].push({
        cx,
        cy,
        x: road.x,
        y: road.y,
        width: road.width,
        height: road.height,
      });
    }
  }

  matchesLayout(mapWidth: number, mapHeight: number): boolean {
    return this.mapWidth === mapWidth
      && this.mapHeight === mapHeight
      && this.cellSize === ROAD_AVOID_CELL;
  }

  /** Human road speed boost — same AABB test as legacy `roadBuildings.some`. */
  isNearRoad(x: number, y: number, margin = 12): boolean {
    const col = Math.floor(x / this.cellSize);
    const row = Math.floor(y / this.cellSize);
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const c = col + dc;
        const r = row + dr;
        if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) continue;
        for (const road of this.cells[r * this.cols + c]) {
          if (
            x >= road.x - margin
            && x <= road.x + road.width + margin
            && y >= road.y - margin
            && y <= road.y + road.height + margin
          ) {
            if (isSpatialQueryMetricsEnabled()) recordSpatialCandidate('road_near');
            return true;
          }
        }
      }
    }
    return false;
  }

  applyAvoidance(entity: Entity, radius = ROAD_AVOID_RADIUS): void {
    const col = Math.floor(entity.x / this.cellSize);
    const row = Math.floor(entity.y / this.cellSize);
    const cellRadius = Math.ceil(radius / this.cellSize);
    const radiusSq = radius * radius;

    for (let dr = -cellRadius; dr <= cellRadius; dr++) {
      for (let dc = -cellRadius; dc <= cellRadius; dc++) {
        const c = col + dc;
        const r = row + dr;
        if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) continue;
        const bucket = this.cells[r * this.cols + c];
        for (const road of bucket) {
          const dx = entity.x - road.cx;
          const dy = entity.y - road.cy;
          const distSq = dx * dx + dy * dy;
          if (distSq >= radiusSq || distSq <= 0) continue;
          if (isSpatialQueryMetricsEnabled()) recordSpatialCandidate('road_avoid');
          const dist = Math.sqrt(distSq);
          entity.vx += (dx / dist) * 0.5;
          entity.vy += (dy / dist) * 0.5;
        }
      }
    }
  }
}

/** Fingerprint completed road layout — count alone misses demolish+rebuild at same cardinality. */
export function computeRoadLayoutStamp(roads: readonly Building[]): number {
  let h = roads.length;
  for (const road of roads) {
    h = Math.imul(31, h) + road.id;
    h = Math.imul(31, h) + Math.floor(road.x);
    h = Math.imul(31, h) + Math.floor(road.y);
    h = Math.imul(31, h) + Math.floor(road.width);
    h = Math.imul(31, h) + Math.floor(road.height);
    h |= 0;
  }
  return h;
}

export function buildRoadAvoidanceIndex(
  mapWidth: number,
  mapHeight: number,
  roads: readonly Building[],
): RoadAvoidanceIndex | undefined {
  if (roads.length === 0) return undefined;
  return new RoadAvoidanceIndex(mapWidth, mapHeight, roads);
}

/** Static tree layer — event-driven updates; full rebuild only on layout/clone recovery. */
export function buildTreeGrid(
  mapWidth: number,
  mapHeight: number,
  trees: Iterable<Entity>,
): EntitySpatialGrid | undefined {
  if (!USE_SPATIAL_GRID) return undefined;
  const grid = new EntitySpatialGrid(mapWidth, mapHeight, MOBILE_CELL_SIZE);
  grid.rebuild(trees, isTreeGridEntity);
  return grid;
}

/** Allocate tree index; full rebuild only on first tick or after layout/clone recovery. */
export function syncTreeSimGrid(
  existing: EntitySpatialGrid | undefined,
  mapWidth: number,
  mapHeight: number,
  trees: Iterable<Entity>,
): EntitySpatialGrid | undefined {
  if (!USE_SPATIAL_GRID) return undefined;
  const grid = resolveSpatialGrid(existing, mapWidth, mapHeight, MOBILE_CELL_SIZE);
  if (grid !== existing) {
    grid.rebuild(trees, isTreeGridEntity);
  }
  return grid;
}

/** Rebuild (or allocate) the mobile layer once per sim tick. */
export function syncMobileSimGrid(
  existing: EntitySpatialGrid | undefined,
  mapWidth: number,
  mapHeight: number,
  entities: Iterable<Entity>,
): EntitySpatialGrid | undefined {
  if (!USE_SPATIAL_GRID) return undefined;
  const grid = resolveSpatialGrid(existing, mapWidth, mapHeight, MOBILE_CELL_SIZE);
  grid.rebuild(entities, isMobileGridEntity);
  return grid;
}

export function buildMobileGrid(
  mapWidth: number,
  mapHeight: number,
  entities: Iterable<Entity>,
): EntitySpatialGrid {
  const grid = new EntitySpatialGrid(mapWidth, mapHeight, MOBILE_CELL_SIZE);
  grid.rebuild(entities, isMobileGridEntity);
  return grid;
}

function isSpatialInvariantCheckEnabled(): boolean {
  if (typeof import.meta !== 'undefined') {
    if (envFlagDisabled(import.meta.env?.VITE_SPATIAL_GRID_INVARIANT)) return false;
    if (envFlagEnabled(import.meta.env?.VITE_SPATIAL_GRID_INVARIANT)) return true;
  }
  const runtime = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  if (envFlagDisabled(runtime.process?.env?.SPATIAL_GRID_INVARIANT)) return false;
  return envFlagEnabled(runtime.process?.env?.SPATIAL_GRID_INVARIANT);
}

/** Dev/CI — every alive filtered entity must appear in exactly one grid cell. */
export const SPATIAL_GRID_INVARIANT_CHECK = isSpatialInvariantCheckEnabled();

export function assertSpatialGridInvariants(
  grassGrid: EntitySpatialGrid | undefined,
  mobileGrid: EntitySpatialGrid | undefined,
  entities: Iterable<Entity>,
  treeGrid?: EntitySpatialGrid,
): void {
  if (!SPATIAL_GRID_INVARIANT_CHECK || !grassGrid || !mobileGrid) return;

  const list = [...entities].filter((e) => e.alive);
  const grassErrors = grassGrid.validateInvariant(list, isGrassGridEntity)
    .map((msg) => `[grass] ${msg}`);
  const mobileErrors = mobileGrid.validateInvariant(list, isMobileGridEntity)
    .map((msg) => `[mobile] ${msg}`);
  const treeErrors = treeGrid
    ? treeGrid.validateInvariant(list, isTreeGridEntity).map((msg) => `[tree] ${msg}`)
    : [];
  const errors = [...grassErrors, ...mobileErrors, ...treeErrors];
  if (errors.length > 0) {
    throw new Error(`Spatial grid invariant failed:\n${errors.slice(0, 8).join('\n')}`);
  }
}