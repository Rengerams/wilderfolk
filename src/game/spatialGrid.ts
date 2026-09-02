import type { Entity, Building } from './gameTypes';
import { EntityType } from './gameTypes';
import {
  isSpatialQueryMetricsEnabled,
  recordSpatialCandidate,
  recordSpatialCells,
} from './spatialQueryMetrics';

/** Grass patches — updated on birth/death; queried for grazing and viewport culling. */
export const GRASS_CELL_SIZE = 56;

/** Humans + wildlife — updated each tick for flee/hunt/pack queries. */
export const MOBILE_CELL_SIZE = 80;

/** Trees — static scenery; indexed for leisure visits. */
export const TREE_CELL_SIZE = 80;

/** Living humans only — smaller cells so broad social radii stay selective. */
export const SOCIAL_CELL_SIZE = 64;

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

export function isHumanSocialGridEntity(entity: Entity): boolean {
  return entity.type === EntityType.Human && entity.alive;
}

export function isMobileGridEntity(entity: Entity): boolean {
  return entity.alive && MOBILE_ENTITY_TYPES.has(entity.type);
}

export function isGrassGridEntity(entity: Entity): boolean {
  return entity.alive && entity.type === EntityType.Grass;
}

export function isTreeGridEntity(entity: Entity): boolean {
  return entity.alive && entity.type === EntityType.Tree;
}

function distSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

/**
 * Uniform 2D Spatial Hash Grid.
 * Optimized for zero heap-allocation on update and fast bounding-box cell walks.
 */
export class EntitySpatialGrid {
  readonly mapWidth: number;
  readonly mapHeight: number;
  readonly cellSize: number;
  private readonly cells: Entity[][];
  private readonly cols: number;
  private readonly rows: number;

  /**
   * entity id → 1D cellIndex.
   * Storing primitive integers eliminates heap object allocations on every move.
   */
  private readonly entityCell = new Map<number, number>();

  constructor(mapWidth: number, mapHeight: number, cellSize: number) {
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
    return (
      this.mapWidth === mapWidth &&
      this.mapHeight === mapHeight &&
      this.cellSize === cellSize
    );
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
    for (let i = 0; i < this.cells.length; i++) {
      this.cells[i].length = 0;
    }
    this.entityCell.clear();
  }

  /** Remove an entity from its current cell bucket (no-op if absent). */
  remove(entity: Entity): void {
    this.removeById(entity.id);
  }

  private removeFromBucket(cellIdx: number, id: number): void {
    const bucket = this.cells[cellIdx];
    const pos = bucket.findIndex((e) => e.id === id);
    if (pos >= 0) {
      const last = bucket.pop()!;
      if (pos < bucket.length) {
        bucket[pos] = last;
      }
    }
  }

  private removeById(id: number): void {
    const cellIdx = this.entityCell.get(id);
    if (cellIdx === undefined) return;
    this.removeFromBucket(cellIdx, id);
    this.entityCell.delete(id);
  }

  private insert(entity: Entity): void {
    if (!entity.alive || !Number.isFinite(entity.x) || !Number.isFinite(entity.y)) return;

    const col = Math.min(this.cols - 1, Math.max(0, Math.floor(entity.x / this.cellSize)));
    const row = Math.min(this.rows - 1, Math.max(0, Math.floor(entity.y / this.cellSize)));
    const newIdx = row * this.cols + col;

    const existingIdx = this.entityCell.get(entity.id);
    if (existingIdx === newIdx) {
      return;
    }

    if (existingIdx !== undefined) {
      this.removeFromBucket(existingIdx, entity.id);
    }

    this.cells[newIdx].push(entity);
    this.entityCell.set(entity.id, newIdx);
  }

  /**
   * Incremental move — fast bucket transfer without object allocations.
   */
  update(entity: Entity): void {
    if (!entity.alive) {
      this.removeById(entity.id);
      return;
    }
    this.insert(entity);
  }

  ensurePresent(entity: Entity): void {
    if (!entity.alive) {
      this.removeById(entity.id);
      return;
    }
    if (!this.entityCell.has(entity.id)) {
      this.insert(entity);
    }
  }

  reconcile(entities: Iterable<Entity>, filter?: (entity: Entity) => boolean): void {
    const seen = new Set<number>();
    for (const entity of entities) {
      if (!entity.alive || (filter && !filter(entity))) continue;
      seen.add(entity.id);
      this.update(entity);
    }

    for (const id of this.entityCell.keys()) {
      if (!seen.has(id)) {
        this.removeById(id);
      }
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

  /** Broad-phase rectangle query. */
  forEachInRect(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    fn: (entity: Entity) => void,
  ): void {
    if (
      !Number.isFinite(minX) ||
      !Number.isFinite(minY) ||
      !Number.isFinite(maxX) ||
      !Number.isFinite(maxY)
    ) {
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

    const cols = this.cols;
    const cells = this.cells;

    for (let row = minRow; row <= maxRow; row++) {
      const rowOffset = row * cols;
      for (let col = minCol; col <= maxCol; col++) {
        const bucket = cells[rowOffset + col];
        for (let i = 0; i < bucket.length; i++) {
          const entity = bucket[i];
          if (!entity.alive) continue;
          if (entity.x < loX || entity.x > hiX || entity.y < loY || entity.y > hiY) continue;
          fn(entity);
        }
      }
    }
  }

  /**
   * Broad-phase radial search with narrow-phase distance-squared filtering.
   * Completely allocation-free in the hot path.
   */
  forEachInRadius(
    x: number,
    y: number,
    radius: number,
    fn: (entity: Entity, distSq: number) => void,
    recordCandidates = true,
  ): void {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius) || radius < 0) return;

    const rawCol = Math.floor(x / this.cellSize);
    const rawRow = Math.floor(y / this.cellSize);
    const cx = rawCol < 0 ? 0 : rawCol >= this.cols ? this.cols - 1 : rawCol;
    const cy = rawRow < 0 ? 0 : rawRow >= this.rows ? this.rows - 1 : rawRow;

    const radiusSq = radius * radius;
    const cellRadius = Math.ceil(radius / this.cellSize);
    const minCol = Math.max(0, cx - cellRadius);
    const maxCol = Math.min(this.cols - 1, cx + cellRadius);
    const minRow = Math.max(0, cy - cellRadius);
    const maxRow = Math.min(this.rows - 1, cy + cellRadius);
    const metrics = isSpatialQueryMetricsEnabled();

    if (metrics) {
      recordSpatialCells(null, (maxCol - minCol + 1) * (maxRow - minRow + 1));
    }

    const cols = this.cols;
    const cells = this.cells;

    for (let row = minRow; row <= maxRow; row++) {
      const rowOffset = row * cols;
      for (let col = minCol; col <= maxCol; col++) {
        const bucket = cells[rowOffset + col];
        for (let i = 0; i < bucket.length; i++) {
          const entity = bucket[i];
          if (!entity.alive) continue;

          const dx = entity.x - x;
          const dy = entity.y - y;
          const dSq = dx * dx + dy * dy;

          if (dSq > radiusSq) continue;
          if (recordCandidates && metrics) recordSpatialCandidate();

          fn(entity, dSq);
        }
      }
    }
  }

  /**
   * Iterates through the 3×3 neighbor cell neighborhood around (x, y).
   */
  forEachNeighborCell(
    x: number,
    y: number,
    fn: (col: number, row: number, cellIdx: number, bucket: Entity[]) => boolean | void,
  ): boolean {
    const col = Math.floor(x / this.cellSize);
    const row = Math.floor(y / this.cellSize);
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return false;

    const minRow = Math.max(0, row - 1);
    const maxRow = Math.min(this.rows - 1, row + 1);
    const minCol = Math.max(0, col - 1);
    const maxCol = Math.min(this.cols - 1, col + 1);

    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const idx = this.cellIndex(c, r);
        if (fn(c, r, idx, this.cells[idx]) === false) {
          return true;
        }
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
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius) || radius < 0) return null;

    const metrics = isSpatialQueryMetricsEnabled();
    let bestEntity: Entity | undefined;
    let bestDistSq = Number.POSITIVE_INFINITY;

    this.forEachInRadius(
      x,
      y,
      radius,
      (entity, dSq) => {
        if (dSq >= bestDistSq || !predicate(entity, dSq)) return;
        if (metrics) recordSpatialCandidate();
        bestEntity = entity;
        bestDistSq = dSq;
      },
      false,
    );

    return bestEntity ? { entity: bestEntity, distSq: bestDistSq } : null;
  }

  validateInvariant(entities: Iterable<Entity>, filter: (entity: Entity) => boolean): string[] {
    const errors: string[] = [];
    const expected = new Set<number>();

    for (const entity of entities) {
      if (!entity.alive || !filter(entity)) continue;
      expected.add(entity.id);
      const cellIdx = this.entityCell.get(entity.id);
      if (cellIdx === undefined) {
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

// ============ REUSABLE INSTANTIATION & SYNC HELPERS ============

function isReusableSpatialGrid(
  grid: unknown,
  mapWidth: number,
  mapHeight: number,
  cellSize: number,
): grid is EntitySpatialGrid {
  return (
    grid instanceof EntitySpatialGrid &&
    typeof grid.rebuild === 'function' &&
    grid.matchesLayout(mapWidth, mapHeight, cellSize)
  );
}

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

export function syncTreeGrid(
  existing: EntitySpatialGrid | undefined,
  mapWidth: number,
  mapHeight: number,
  treeEntities: Iterable<Entity>,
): EntitySpatialGrid | undefined {
  if (!USE_SPATIAL_GRID) return undefined;
  const grid = resolveSpatialGrid(existing, mapWidth, mapHeight, TREE_CELL_SIZE);
  if (grid !== existing) {
    grid.rebuild(treeEntities, isTreeGridEntity);
  }
  return grid;
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
    grassGrid &&
    typeof grassGrid.matchesLayout === 'function' &&
    grassGrid.matchesLayout(mapWidth, mapHeight, GRASS_CELL_SIZE)
  ) {
    grassGrid.forEachInRect(vp.minX, vp.minY, vp.maxX, vp.maxY, (grass) => visible.push(grass));
    return visible;
  }

  if (grassEntities.length === 0) return [];
  const grid = buildGrassGrid(mapWidth, mapHeight, grassEntities);
  grid.forEachInRect(vp.minX, vp.minY, vp.maxX, vp.maxY, (grass) => visible.push(grass));
  return visible;
}

export function syncSpatialGridEntity(
  entity: Entity,
  grassGrid?: EntitySpatialGrid,
  mobileGrid?: EntitySpatialGrid,
): void {
  if (!USE_SPATIAL_GRID) return;
  if (grassGrid && isGrassGridEntity(entity)) grassGrid.update(entity);
  if (mobileGrid && isMobileGridEntity(entity)) mobileGrid.update(entity);
}

// ============ ROAD SPATIAL INDEX ============

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

    for (let i = 0; i < roads.length; i++) {
      const road = roads[i];
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
    return (
      this.mapWidth === mapWidth &&
      this.mapHeight === mapHeight &&
      this.cellSize === ROAD_AVOID_CELL
    );
  }

  isNearRoad(x: number, y: number, margin = 12): boolean {
    const col = Math.floor(x / this.cellSize);
    const row = Math.floor(y / this.cellSize);

    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const c = col + dc;
        const r = row + dr;
        if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) continue;

        const bucket = this.cells[r * this.cols + c];
        for (let i = 0; i < bucket.length; i++) {
          const road = bucket[i];
          if (
            x >= road.x - margin &&
            x <= road.x + road.width + margin &&
            y >= road.y - margin &&
            y <= road.y + road.height + margin
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
        for (let i = 0; i < bucket.length; i++) {
          const road = bucket[i];
          const dx = entity.x - road.cx;
          const dy = entity.y - road.cy;
          const distSq = dx * dx + dy * dy;

          // Safe division guard: avoid impulses when distSq is near zero
          if (distSq >= radiusSq || distSq < 0.01) continue;

          if (isSpatialQueryMetricsEnabled()) recordSpatialCandidate('road_avoid');
          const dist = Math.sqrt(distSq);
          entity.vx += (dx / dist) * 0.5;
          entity.vy += (dy / dist) * 0.5;
        }
      }
    }
  }
}

export function computeRoadLayoutStamp(roads: readonly Building[]): number {
  let h = roads.length;
  for (let i = 0; i < roads.length; i++) {
    const road = roads[i];
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

export function syncMobileSimGrid(
  existing: EntitySpatialGrid | undefined,
  mapWidth: number,
  mapHeight: number,
  entities: Iterable<Entity>,
): EntitySpatialGrid | undefined {
  if (!USE_SPATIAL_GRID) return undefined;
  const grid = resolveSpatialGrid(existing, mapWidth, mapHeight, MOBILE_CELL_SIZE);
  if (grid !== existing) grid.rebuild(entities, isMobileGridEntity);
  else grid.reconcile(entities, isMobileGridEntity);
  return grid;
}

export function syncHumanSocialGrid(
  existing: EntitySpatialGrid | undefined,
  mapWidth: number,
  mapHeight: number,
  entities: Iterable<Entity>,
): EntitySpatialGrid | undefined {
  if (!USE_SPATIAL_GRID) return undefined;
  const grid = resolveSpatialGrid(existing, mapWidth, mapHeight, SOCIAL_CELL_SIZE);
  if (grid !== existing) grid.rebuild(entities, isHumanSocialGridEntity);
  else grid.reconcile(entities, isHumanSocialGridEntity);
  return grid;
}

function buildMobileGrid(
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

export const SPATIAL_GRID_INVARIANT_CHECK = isSpatialInvariantCheckEnabled();

export function assertSpatialGridInvariants(
  grassGrid: EntitySpatialGrid | undefined,
  mobileGrid: EntitySpatialGrid | undefined,
  entities: Iterable<Entity>,
): void {
  if (!SPATIAL_GRID_INVARIANT_CHECK || !grassGrid || !mobileGrid) return;

  const list = [...entities].filter((e) => e.alive);
  const grassErrors = grassGrid.validateInvariant(list, isGrassGridEntity).map((msg) => `[grass] ${msg}`);
  const mobileErrors = mobileGrid.validateInvariant(list, isMobileGridEntity).map((msg) => `[mobile] ${msg}`);
  const errors = [...grassErrors, ...mobileErrors];

  if (errors.length > 0) {
    throw new Error(`Spatial grid invariant failed:\n${errors.slice(0, 8).join('\n')}`);
  }
}