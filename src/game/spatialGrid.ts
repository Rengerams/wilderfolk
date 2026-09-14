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

/**
 * Uniform 2D Spatial Hash Grid.
 * Optimized for zero heap-allocation on update, reconcile, and radial walks.
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

  /** Scratch buffers reused during reconcile() to prevent GC churn every tick. */
  private readonly scratchSeen = new Set<number>();
  private readonly scratchStaleIds: number[] = [];

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

  /**
   * Synchronizes grid state against an active entity collection with zero object allocations.
   */
  reconcile(entities: Iterable<Entity>, filter?: (entity: Entity) => boolean): void {
    const seen = this.scratchSeen;
    seen.clear();

    for (const entity of entities) {
      if (!entity.alive || (filter && !filter(entity))) continue;
      seen.add(entity.id);
      this.update(entity);
    }

    const stale = this.scratchStaleIds;
    stale.length = 0;
    for (const id of this.entityCell.keys()) {
      if (!seen.has(id)) {
        stale.push(id);
      }
    }

    for (let i = 0; i < stale.length; i++) {
      this.removeById(stale[i]);
    }
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

    if (minCol > maxCol || minRow > maxRow) return;

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
   * Derives bounds directly to prevent boundary edge distortion and wasteful walks.
   */
  forEachInRadius(
    x: number,
    y: number,
    radius: number,
    fn: (entity: Entity, distSq: number) => void,
    recordCandidates = true,
  ): void {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius) || radius < 0) return;

    const minCol = Math.max(0, Math.floor((x - radius) / this.cellSize));
    const maxCol = Math.min(this.cols - 1, Math.floor((x + radius) / this.cellSize));
    const minRow = Math.max(0, Math.floor((y - radius) / this.cellSize));
    const maxRow = Math.min(this.rows - 1, Math.floor((y + radius) / this.cellSize));

    if (minCol > maxCol || minRow > maxRow) return;

    const radiusSq = radius * radius;
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
  } else {
    // A reused grid must track the entities it indexes: grass spawns and deaths happen
    // mid-run (`dailyGrassEcology`, `nature_boom`), so a rebuild-only-on-new-instance
    // path froze the index at the first sync and left ghost/depleted grass in it.
    grid.reconcile(grassEntities, isGrassGridEntity);
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
  } else {
    // Trees are static scenery, but not frozen: `nature_boom` adds them and
    // `clearTreesUnderFootprint` removes them, both after the grid was first built.
    grid.reconcile(treeEntities, isTreeGridEntity);
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

/**
 * Gathers grass entities in the viewport.
 * Uses the spatial grid when available; falls back to an allocation-free linear AABB walk
 * rather than rebuilding a fresh spatial grid each render frame.
 */
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

  // Zero-grid-allocation linear fallback to protect 60fps render loops
  for (let i = 0; i < grassEntities.length; i++) {
    const grass = grassEntities[i];
    if (
      grass.alive &&
      grass.x >= vp.minX &&
      grass.x <= vp.maxX &&
      grass.y >= vp.minY &&
      grass.y <= vp.maxY
    ) {
      visible.push(grass);
    }
  }
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
  id: number;
  cx: number;
  cy: number;
  x: number;
  y: number;
  width: number;
  height: number;
  lastAvoidQueryId: number;
}

export class RoadAvoidanceIndex {
  readonly mapWidth: number;
  readonly mapHeight: number;
  readonly cellSize: number;
  private readonly cells: RoadCellEntry[][];
  private readonly cols: number;
  private readonly rows: number;
  private avoidQueryId = 0;

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

      const entry: RoadCellEntry = {
        id: road.id,
        cx: road.x + road.width / 2,
        cy: road.y + road.height / 2,
        x: road.x,
        y: road.y,
        width: road.width,
        height: road.height,
        lastAvoidQueryId: -1,
      };

      // Place road into all cells overlapped by its bounding box
      const minCol = Math.max(0, Math.floor(road.x / this.cellSize));
      const maxCol = Math.min(this.cols - 1, Math.floor((road.x + road.width) / this.cellSize));
      const minRow = Math.max(0, Math.floor(road.y / this.cellSize));
      const maxRow = Math.min(this.rows - 1, Math.floor((road.y + road.height) / this.cellSize));

      for (let r = minRow; r <= maxRow; r++) {
        const rowOffset = r * this.cols;
        for (let c = minCol; c <= maxCol; c++) {
          this.cells[rowOffset + c].push(entry);
        }
      }
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
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;

    const col = Math.floor(x / this.cellSize);
    const row = Math.floor(y / this.cellSize);

    for (let dr = -1; dr <= 1; dr++) {
      const r = row + dr;
      if (r < 0 || r >= this.rows) continue;
      const rowOffset = r * this.cols;

      for (let dc = -1; dc <= 1; dc++) {
        const c = col + dc;
        if (c < 0 || c >= this.cols) continue;

        const bucket = this.cells[rowOffset + c];
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
    if (!Number.isFinite(entity.x) || !Number.isFinite(entity.y) || radius <= 0) return;

    // Zero-allocation query deduplication
    this.avoidQueryId = (this.avoidQueryId + 1) | 0;
    const currentQueryId = this.avoidQueryId;

    const minCol = Math.max(0, Math.floor((entity.x - radius) / this.cellSize));
    const maxCol = Math.min(this.cols - 1, Math.floor((entity.x + radius) / this.cellSize));
    const minRow = Math.max(0, Math.floor((entity.y - radius) / this.cellSize));
    const maxRow = Math.min(this.rows - 1, Math.floor((entity.y + radius) / this.cellSize));

    if (minCol > maxCol || minRow > maxRow) return;

    const radiusSq = radius * radius;

    for (let r = minRow; r <= maxRow; r++) {
      const rowOffset = r * this.cols;
      for (let c = minCol; c <= maxCol; c++) {
        const bucket = this.cells[rowOffset + c];
        for (let i = 0; i < bucket.length; i++) {
          const road = bucket[i];

          // Skip if already processed in another overlapping cell this query
          if (road.lastAvoidQueryId === currentQueryId) continue;
          road.lastAvoidQueryId = currentQueryId;

          // Find closest point on road rectangle for accurate edge repulsion
          const closestX = Math.max(road.x, Math.min(road.x + road.width, entity.x));
          const closestY = Math.max(road.y, Math.min(road.y + road.height, entity.y));
          let dx = entity.x - closestX;
          let dy = entity.y - closestY;
          let distSq = dx * dx + dy * dy;

          // If entity is directly inside the road, push away from the road center
          if (distSq < 0.01) {
            dx = entity.x - road.cx;
            dy = entity.y - road.cy;
            distSq = dx * dx + dy * dy;
            if (distSq < 0.01) {
              dx = 1;
              dy = 0;
              distSq = 1;
            }
          }

          if (distSq >= radiusSq) continue;

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