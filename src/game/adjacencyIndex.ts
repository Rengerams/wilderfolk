import type { Building } from './gameTypes';
import { BuildingType } from './gameTypes';

export const ADJACENCY_CELL = 80;

type AdjacencyBuckets = Map<string, Building[]>;
type AdjacencySourceKind = 'barn' | 'road' | 'market';

const ADJACENCY_SOURCE_TYPES = new Set<BuildingType>([
  BuildingType.Barn,
  BuildingType.Road,
  BuildingType.Market,
]);

/** Completed buildings whose production uses adjacency multipliers. */
export const ADJACENCY_CONSUMER_TYPES = new Set<BuildingType>([
  BuildingType.Farm,
  BuildingType.Greenhouse,
  BuildingType.Store,
  BuildingType.Workshop,
  BuildingType.LumberMill,
  BuildingType.Quarry,
  BuildingType.Mine,
  BuildingType.Market,
  BuildingType.Silo,
]);

function adjacencyCellKey(x: number, y: number): string {
  return `${Math.floor(x / ADJACENCY_CELL)},${Math.floor(y / ADJACENCY_CELL)}`;
}

function isAdjacencySource(building: Building): boolean {
  return (
    building.completed
    && building.faction !== 'rival'
    && ADJACENCY_SOURCE_TYPES.has(building.type)
  );
}

export function buildingUsesAdjacency(building: Building): boolean {
  if (!building.completed || building.faction === 'rival') return false;
  if (building.type === BuildingType.Road) return false;
  return ADJACENCY_CONSUMER_TYPES.has(building.type);
}

function hasAdjacencyNeighbor(
  map: AdjacencyBuckets,
  x: number,
  y: number,
  radius: number,
): boolean {
  const radiusSq = radius * radius;
  const cellRadius = Math.ceil(radius / ADJACENCY_CELL);
  const cx = Math.floor(x / ADJACENCY_CELL);
  const cy = Math.floor(y / ADJACENCY_CELL);
  for (let dx = -cellRadius; dx <= cellRadius; dx++) {
    for (let dy = -cellRadius; dy <= cellRadius; dy++) {
      const bucket = map.get(`${cx + dx},${cy + dy}`);
      if (!bucket) continue;
      for (const other of bucket) {
        const ddx = other.x - x;
        const ddy = other.y - y;
        if (ddx * ddx + ddy * ddy < radiusSq) return true;
      }
    }
  }
  return false;
}

/** Sparse cell index for barn/road/market adjacency bonuses — event-driven insert/remove. */
export class AdjacencyIndex {
  readonly barnMap: AdjacencyBuckets = new Map();
  readonly roadMap: AdjacencyBuckets = new Map();
  readonly marketMap: AdjacencyBuckets = new Map();
  private readonly indexedIds = new Set<number>();
  private readonly idToCell = new Map<number, { kind: AdjacencySourceKind; key: string }>();

  private mapForKind(kind: AdjacencySourceKind): AdjacencyBuckets {
    if (kind === 'barn') return this.barnMap;
    if (kind === 'road') return this.roadMap;
    return this.marketMap;
  }

  private kindForType(type: BuildingType): AdjacencySourceKind | null {
    if (type === BuildingType.Barn) return 'barn';
    if (type === BuildingType.Road) return 'road';
    if (type === BuildingType.Market) return 'market';
    return null;
  }

  private addToMap(map: AdjacencyBuckets, building: Building): void {
    const key = adjacencyCellKey(building.x, building.y);
    const bucket = map.get(key);
    if (bucket) bucket.push(building);
    else map.set(key, [building]);
  }

  insert(building: Building): void {
    if (!isAdjacencySource(building)) return;
    this.removeById(building.id);
    const kind = this.kindForType(building.type);
    if (!kind) return;
    const map = this.mapForKind(kind);
    const key = adjacencyCellKey(building.x, building.y);
    this.addToMap(map, building);
    this.indexedIds.add(building.id);
    this.idToCell.set(building.id, { kind, key });
  }

  removeById(buildingId: number): void {
    if (!this.indexedIds.has(buildingId)) return;
    const loc = this.idToCell.get(buildingId);
    if (loc) {
      const map = this.mapForKind(loc.kind);
      const cell = map.get(loc.key);
      if (cell) {
        const idx = cell.findIndex((b) => b.id === buildingId);
        if (idx >= 0) cell.splice(idx, 1);
        if (cell.length === 0) map.delete(loc.key);
      }
      this.idToCell.delete(buildingId);
    }
    this.indexedIds.delete(buildingId);
  }

  /** Rebuild from scratch — save load or structuredClone recovery. */
  rebuild(buildings: readonly Building[]): void {
    this.barnMap.clear();
    this.roadMap.clear();
    this.marketMap.clear();
    this.indexedIds.clear();
    this.idToCell.clear();
    for (const building of buildings) {
      this.insert(building);
    }
  }

  /** Toggle when a barn/road/market completes or is demolished mid-tick. */
  syncCompletion(building: Building, wasCompleted: boolean): void {
    if (building.completed && !wasCompleted) this.insert(building);
    else if (!building.completed && wasCompleted) this.removeById(building.id);
  }

  getMultiplier(building: Building): number {
    let mult = 1;
    if (building.type === BuildingType.Farm || building.type === BuildingType.Greenhouse) {
      if (hasAdjacencyNeighbor(this.barnMap, building.x, building.y, 120)) mult += 0.35;
    }
    if (building.type !== BuildingType.Road) {
      if (hasAdjacencyNeighbor(this.roadMap, building.x, building.y, 70)) mult += 0.15;
    }
    if (building.type === BuildingType.Store || building.type === BuildingType.Workshop) {
      if (hasAdjacencyNeighbor(this.marketMap, building.x, building.y, 160)) mult += 0.25;
    }
    return mult;
  }
}

export function ensureAdjacencyIndex(
  state: { buildings: Building[]; adjacency?: AdjacencyIndex },
): AdjacencyIndex {
  const existing = state.adjacency;
  if (existing instanceof AdjacencyIndex) return existing;
  const index = new AdjacencyIndex();
  index.rebuild(state.buildings);
  state.adjacency = index;
  return index;
}

export function syncAdjacency(
  state: { buildings: Building[]; adjacency?: AdjacencyIndex },
  building: Building,
  wasCompleted: boolean,
): void {
  if (!ADJACENCY_SOURCE_TYPES.has(building.type)) return;
  if (!building.completed && !wasCompleted) return;
  ensureAdjacencyIndex(state).syncCompletion(building, wasCompleted);
}

export function unindexAdjacency(
  state: { adjacency?: AdjacencyIndex },
  buildingId: number,
): void {
  state.adjacency?.removeById(buildingId);
}

/** Full rebuild helper — tests and one-off estimates. */
export function buildAdjacencyIndex(buildings: readonly Building[]): AdjacencyIndex {
  const index = new AdjacencyIndex();
  index.rebuild(buildings);
  return index;
}

export function getAdjacencyMultiplierFromIndex(index: AdjacencyIndex, building: Building): number {
  return index.getMultiplier(building);
}