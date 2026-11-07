/**
 * F4 — Infrastructure and Logistics Overlay: the read-only projection behind the overlay.
 * The renderer draws; every threshold and classification lives here, pure over `WorldState`.
 */
import { BuildingType, EntityType, type Building, type Entity, type WorldState } from './gameTypes';
import { TICKS_PER_HOUR } from './dayCycle';
import { getBuildingCenter, getBuildingFootprintRect } from './placementUtils';
import { isPlayerHuman } from './playerHuman';
import { SPECIES_CONFIG } from './speciesConfig';
import { isStripBuildType } from './stripBuild';
import { isRoadStripType } from './stripTopology';
import { WORK_COMMUTE_LEAD_HOURS } from './workSchedule';
import { getReadOnlyPathGrid, lineCrossesBlocked, type PathGrid } from './pathfinding';
import { humanBuildingTarget } from './simulation/humanMovement';

// ============ TUNABLE THRESHOLDS ============

/**
 * Footprint gap (world units) between two road strips that still counts as one network.
 * A real junction has a zero gap; the tolerance covers one placement-grid step plus rounding.
 */
export const ROAD_CONNECT_GAP = 26;

/** At or under this distance from a road footprint edge, a building is well connected. */
export const GOOD_ROAD_ACCESS_DISTANCE = 40;

/**
 * Beyond this distance from any road footprint edge, a building has no road access at all.
 * Measured from the building's centre to the nearest point of the nearest road footprint.
 */
export const MAX_ROAD_ACCESS_DISTANCE = 120;

/**
 * Home↔work distance the overlay classifies as extreme, in world px.
 */
export const COMMUTE_EXTREME_DISTANCE = 200;

/**
 * Walk time an ordinary home↔work leg may take before it is over budget: the owner's
 * `WORK_COMMUTE_LEAD_HOURS` allowance converted to sim ticks.
 */
export const COMMUTE_WALK_BUDGET_TICKS = WORK_COMMUTE_LEAD_HOURS * TICKS_PER_HOUR;

/** Walking pace used when a settler has no usable `speed` — the species owner's human value. */
export const SETTLER_WALK_SPEED = SPECIES_CONFIG[EntityType.Human].speed;

// ============ PROJECTION TYPES ============

/** One road strip that carries the colony's traffic. */
export interface LogisticsRoadNode {
  readonly buildingId: number;
  readonly x: number;
  readonly y: number;
}

/** A maximal set of road strips that touch: one connectivity component of the road network. */
export interface LogisticsRoadComponent {
  readonly id: number;
  readonly nodes: readonly LogisticsRoadNode[];
  /** Mean of the member centres — a stable label anchor for the overlay. */
  readonly centerX: number;
  readonly centerY: number;
}

/**
 * Why a building is flagged: a discriminated union because "no roads exist" and "this
 * building is off the network" are different problems; only `poorly_connected` has a distance.
 */
export type LogisticsConnectionIssue = 'no_road_network' | 'no_road_access' | 'poorly_connected';

export interface LogisticsBuildingFlag {
  readonly buildingId: number;
  readonly buildingType: BuildingType;
  /** Placement anchor (building centre) in world units. */
  readonly x: number;
  readonly y: number;
  readonly issue: LogisticsConnectionIssue;
  /** Distance to the nearest road footprint edge; `Infinity` when none is within range. */
  readonly distanceToRoad: number;
}

/** A drawn supply link: a building and the nearest point of the road component serving it. */
export interface LogisticsSupplyLink {
  readonly buildingId: number;
  readonly componentId: number;
  readonly fromX: number;
  readonly fromY: number;
  readonly toX: number;
  readonly toY: number;
  readonly distance: number;
}

export type LogisticsCommuteSeverity = 'blocked' | 'over_budget' | 'extreme';

/** A settler's home↔work leg and the reason it counts as pressure. */
export interface LogisticsCommute {
  readonly entityId: number;
  readonly residenceBuildingId: number;
  readonly workBuildingId: number;
  readonly homeX: number;
  readonly homeY: number;
  readonly workX: number;
  readonly workY: number;
  readonly distance: number;
  /** Door-to-door walk time at the settler's own pace, in sim ticks. */
  readonly walkTicks: number;
  readonly severity: LogisticsCommuteSeverity;
}

export interface LogisticsOverlayTotals {
  readonly roadCount: number;
  readonly roadComponentCount: number;
  readonly poorlyConnectedCount: number;
  readonly noRoadAccessCount: number;
  readonly noRoadNetworkCount: number;
  readonly supplyLinkCount: number;
  readonly commutePressureCount: number;
  readonly extremeCommuteCount: number;
  /** Legs whose direct home↔work line crosses water/mountains, so the settler must detour. */
  readonly blockedCommuteCount: number;
}

/** Everything the overlay draws, already classified. Empty arrays mean "nothing to show". */
export interface LogisticsOverlayData {
  readonly roadComponents: readonly LogisticsRoadComponent[];
  readonly supplyLinks: readonly LogisticsSupplyLink[];
  readonly poorlyConnected: readonly LogisticsBuildingFlag[];
  readonly commutes: readonly LogisticsCommute[];
  readonly totals: LogisticsOverlayTotals;
}

// ============ GEOMETRY HELPERS ============

interface Rect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** Rect-to-rect gap (`0` when they touch or overlap) — the junction test for two road strips. */
function rectGap(a: Rect, b: Rect): number {
  const dx = Math.max(a.left - b.right, b.left - a.right, 0);
  const dy = Math.max(a.top - b.bottom, b.top - a.bottom, 0);
  return Math.hypot(dx, dy);
}

interface RectHit {
  readonly x: number;
  readonly y: number;
  readonly distance: number;
}

/** Nearest point of a rect to a point, and its distance. */
function nearestPointOnRect(rect: Rect, x: number, y: number): RectHit {
  const nx = Math.min(Math.max(x, rect.left), rect.right);
  const ny = Math.min(Math.max(y, rect.top), rect.bottom);
  return { x: nx, y: ny, distance: Math.hypot(nx - x, ny - y) };
}

/**
 * Uniform bucket index over road footprint centres, so the projection stays near-linear:
 * a naive buildings × roads scan is O(n²). Cell size exceeds the widest strip footprint.
 */
const ROAD_BUCKET_CELL = 128;

interface RoadEntry {
  readonly buildingId: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly rect: Rect;
}

class RoadBucketGrid {
  private readonly cells = new Map<string, RoadEntry[]>();

  insert(entry: RoadEntry): void {
    const key = `${Math.floor(entry.centerX / ROAD_BUCKET_CELL)},${Math.floor(entry.centerY / ROAD_BUCKET_CELL)}`;
    const bucket = this.cells.get(key);
    if (bucket) bucket.push(entry);
    else this.cells.set(key, [entry]);
  }

  /** Visits every entry whose centre lies in the cells covering the square around (x, y). */
  forEachNear(x: number, y: number, radius: number, visit: (entry: RoadEntry) => void): void {
    const minCol = Math.floor((x - radius) / ROAD_BUCKET_CELL);
    const maxCol = Math.floor((x + radius) / ROAD_BUCKET_CELL);
    const minRow = Math.floor((y - radius) / ROAD_BUCKET_CELL);
    const maxRow = Math.floor((y + radius) / ROAD_BUCKET_CELL);
    for (let col = minCol; col <= maxCol; col++) {
      for (let row = minRow; row <= maxRow; row++) {
        const bucket = this.cells.get(`${col},${row}`);
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) visit(bucket[i]);
      }
    }
  }
}

// ============ WORLD SELECTION ============

/**
 * Completed player roads — `stripTopology.isRoadStripType` owns that membership; not
 * `stripFamilyFor`, whose fallback routes a Fence into the 'road' family.
 */
function isNetworkRoad(b: Building): boolean {
  return b.completed && b.faction !== 'rival' && isRoadStripType(b.type);
}

/**
 * A building the network serves: completed, non-rival, and not a multi-tile strip type
 * (roads are the network; walls, gates and fences are barriers).
 */
function isServicedBuilding(b: Building): boolean {
  return b.completed && b.faction !== 'rival' && !isStripBuildType(b.type);
}

/** Building id → completed player building: the two lookups each settler's commute needs. */
function indexBuildings(buildings: readonly Building[]): Map<number, Building> {
  const byId = new Map<number, Building>();
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    if (b.completed && b.faction !== 'rival') byId.set(b.id, b);
  }
  return byId;
}

// ============ ROAD NETWORK ============

interface RoadGraph {
  readonly entries: readonly RoadEntry[];
  readonly components: readonly LogisticsRoadComponent[];
  readonly componentIdByBuilding: ReadonlyMap<number, number>;
  /** Largest member half-extent — the query padding a nearest-road search needs. */
  readonly maxHalfExtent: number;
}

/** Union-find components over the road family, joined by footprint proximity. */
function buildRoadGraph(roads: readonly Building[]): RoadGraph {
  const entries: RoadEntry[] = [];
  const indexByBuilding = new Map<number, number>();
  let maxHalfExtent = 0;
  for (let i = 0; i < roads.length; i++) {
    const road = roads[i];
    const center = getBuildingCenter(road);
    const halfExtent = Math.max(road.width, road.height) / 2;
    if (halfExtent > maxHalfExtent) maxHalfExtent = halfExtent;
    indexByBuilding.set(road.id, entries.length);
    entries.push({
      buildingId: road.id,
      centerX: center.x,
      centerY: center.y,
      rect: getBuildingFootprintRect(road),
    });
  }

  const parent: number[] = entries.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) {
      parent[root] = parent[parent[root]];
      root = parent[root];
    }
    return root;
  };

  const grid = new RoadBucketGrid();
  for (let i = 0; i < entries.length; i++) grid.insert(entries[i]);

  // A candidate's centre is at most `gap + both half-extents` from this entry's centre.
  const joinRadius = ROAD_CONNECT_GAP + maxHalfExtent * 2;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    grid.forEachNear(entry.centerX, entry.centerY, joinRadius, (other) => {
      if (other.buildingId === entry.buildingId) return;
      if (rectGap(entry.rect, other.rect) > ROAD_CONNECT_GAP) return;
      const otherIndex = indexByBuilding.get(other.buildingId);
      if (otherIndex === undefined) return;
      const rootA = find(i);
      const rootB = find(otherIndex);
      if (rootA !== rootB) parent[rootB] = rootA;
    });
  }

  // Group members by root, keeping first-appearance order so component ids are deterministic.
  const membersByRoot = new Map<number, RoadEntry[]>();
  const order: number[] = [];
  for (let i = 0; i < entries.length; i++) {
    const root = find(i);
    const members = membersByRoot.get(root);
    if (members) members.push(entries[i]);
    else {
      membersByRoot.set(root, [entries[i]]);
      order.push(root);
    }
  }

  const components: LogisticsRoadComponent[] = [];
  const componentIdByBuilding = new Map<number, number>();
  for (let i = 0; i < order.length; i++) {
    const members = membersByRoot.get(order[i]) ?? [];
    let sumX = 0;
    let sumY = 0;
    const nodes: LogisticsRoadNode[] = [];
    for (let m = 0; m < members.length; m++) {
      nodes.push({ buildingId: members[m].buildingId, x: members[m].centerX, y: members[m].centerY });
      componentIdByBuilding.set(members[m].buildingId, i);
      sumX += members[m].centerX;
      sumY += members[m].centerY;
    }
    components.push({
      id: i,
      nodes,
      centerX: members.length > 0 ? sumX / members.length : 0,
      centerY: members.length > 0 ? sumY / members.length : 0,
    });
  }

  return { entries, components, componentIdByBuilding, maxHalfExtent };
}

interface NearestRoad {
  readonly entry: RoadEntry;
  readonly hitX: number;
  readonly hitY: number;
  readonly distance: number;
}

/** Nearest road within `MAX_ROAD_ACCESS_DISTANCE`, ties broken by the lower building id. */
function findNearestRoad(
  grid: RoadBucketGrid,
  x: number,
  y: number,
  maxHalfExtent: number,
): NearestRoad | null {
  let bestEntry: RoadEntry | null = null;
  let bestHit: RectHit | null = null;

  grid.forEachNear(x, y, MAX_ROAD_ACCESS_DISTANCE + maxHalfExtent, (entry) => {
    const hit = nearestPointOnRect(entry.rect, x, y);
    if (hit.distance > MAX_ROAD_ACCESS_DISTANCE) return;
    if (bestHit === null || bestEntry === null) {
      bestEntry = entry;
      bestHit = hit;
      return;
    }
    if (hit.distance < bestHit.distance) {
      bestEntry = entry;
      bestHit = hit;
      return;
    }
    if (hit.distance === bestHit.distance && entry.buildingId < bestEntry.buildingId) {
      bestEntry = entry;
      bestHit = hit;
    }
  });

  if (bestEntry === null || bestHit === null) return null;
  const entry: RoadEntry = bestEntry;
  const hit: RectHit = bestHit;
  return { entry, hitX: hit.x, hitY: hit.y, distance: hit.distance };
}

// ============ PROJECTION ============

/**
 * Projects the overlay's read of the world. Pure and deterministic: the same world yields
 * the same result and nothing is cached; per-frame callers use the cached wrapper.
 */
export function computeLogisticsOverlay(world: WorldState): LogisticsOverlayData {
  const buildings = world.buildings ?? [];
  const roads: Building[] = [];
  const serviced: Building[] = [];
  for (let i = 0; i < buildings.length; i++) {
    if (isNetworkRoad(buildings[i])) roads.push(buildings[i]);
    else if (isServicedBuilding(buildings[i])) serviced.push(buildings[i]);
  }

  const graph = buildRoadGraph(roads);
  const roadGrid = new RoadBucketGrid();
  for (let i = 0; i < graph.entries.length; i++) roadGrid.insert(graph.entries[i]);

  const supplyLinks: LogisticsSupplyLink[] = [];
  const poorlyConnected: LogisticsBuildingFlag[] = [];
  let noRoadAccessCount = 0;
  let noRoadNetworkCount = 0;
  let poorlyConnectedCount = 0;

  for (let i = 0; i < serviced.length; i++) {
    const building = serviced[i];
    const center = getBuildingCenter(building);

    if (graph.entries.length === 0) {
      noRoadNetworkCount++;
      poorlyConnected.push({
        buildingId: building.id,
        buildingType: building.type,
        x: center.x,
        y: center.y,
        issue: 'no_road_network',
        distanceToRoad: Infinity,
      });
      continue;
    }

    const nearest = findNearestRoad(roadGrid, center.x, center.y, graph.maxHalfExtent);
    if (nearest === null) {
      noRoadAccessCount++;
      poorlyConnected.push({
        buildingId: building.id,
        buildingType: building.type,
        x: center.x,
        y: center.y,
        issue: 'no_road_access',
        distanceToRoad: Infinity,
      });
      continue;
    }

    supplyLinks.push({
      buildingId: building.id,
      componentId: graph.componentIdByBuilding.get(nearest.entry.buildingId) ?? 0,
      fromX: center.x,
      fromY: center.y,
      toX: nearest.hitX,
      toY: nearest.hitY,
      distance: nearest.distance,
    });

    if (nearest.distance > GOOD_ROAD_ACCESS_DISTANCE) {
      poorlyConnectedCount++;
      poorlyConnected.push({
        buildingId: building.id,
        buildingType: building.type,
        x: center.x,
        y: center.y,
        issue: 'poorly_connected',
        distanceToRoad: nearest.distance,
      });
    }
  }

  const byId = indexBuildings(buildings);
  const entities = world.entities ?? [];
  // Lazy: the passability grid is only built when something could actually have a commute.
  const grid = entities.length > 0 && world.worldMap
    ? getReadOnlyPathGrid(world.worldMap, buildings)
    : null;
  const commutes: LogisticsCommute[] = [];
  for (let i = 0; i < entities.length; i++) {
    const commute = classifyCommute(entities[i], byId, grid);
    if (commute) commutes.push(commute);
  }

  let extremeCommuteCount = 0;
  let blockedCommuteCount = 0;
  for (let i = 0; i < commutes.length; i++) {
    const severity = commutes[i].severity;
    if (severity === 'extreme') extremeCommuteCount++;
    else if (severity === 'blocked') blockedCommuteCount++;
  }

  return {
    roadComponents: graph.components,
    supplyLinks,
    poorlyConnected,
    commutes,
    totals: {
      roadCount: graph.entries.length,
      roadComponentCount: graph.components.length,
      poorlyConnectedCount,
      noRoadAccessCount,
      noRoadNetworkCount,
      supplyLinkCount: supplyLinks.length,
      commutePressureCount: commutes.length,
      extremeCommuteCount,
      blockedCommuteCount,
    },
  };
}

/**
 * Memoised front for {@link computeLogisticsOverlay}: the projection is expensive and the
 * snapshot cache is camera-keyed. Key is world identity plus tick; reset clears it.
 */
let cachedOverlayWorld: WorldState | null = null;
let cachedOverlayTick = -1;
let cachedOverlay: LogisticsOverlayData | null = null;

/** The overlay for this world, recomputed after a new world, a tick change or an explicit reset. */
export function computeLogisticsOverlayCached(world: WorldState): LogisticsOverlayData {
  if (cachedOverlay !== null && cachedOverlayWorld === world && cachedOverlayTick === world.tick) {
    return cachedOverlay;
  }
  cachedOverlay = computeLogisticsOverlay(world);
  cachedOverlayWorld = world;
  cachedOverlayTick = world.tick;
  return cachedOverlay;
}

/** Drop the memo. Called by the renderer reset and by tests that swap worlds. */
export function resetLogisticsOverlayCache(): void {
  cachedOverlayWorld = null;
  cachedOverlayTick = -1;
  cachedOverlay = null;
}

/**
 * A settler's home↔work leg, or `null` when none or inside budget and passable; severity is
 * `blocked` → `extreme` → `over_budget`, and a short blocked leg is still reported. Read-only grid, no A*.
 */
function classifyCommute(
  entity: Entity,
  byId: ReadonlyMap<number, Building>,
  grid: PathGrid | null,
): LogisticsCommute | null {
  if (!entity.alive || !isPlayerHuman(entity)) return null;
  if (entity.workerBuildingId == null || entity.residenceBuildingId == null) return null;

  const work = byId.get(entity.workerBuildingId);
  const home = byId.get(entity.residenceBuildingId);
  if (!work || !home) return null;

  const workCenter = getBuildingCenter(work);
  const homeCenter = getBuildingCenter(home);
  const distance = Math.hypot(workCenter.x - homeCenter.x, workCenter.y - homeCenter.y);

  const speed = Number.isFinite(entity.speed) && entity.speed > 0 ? entity.speed : SETTLER_WALK_SPEED;
  const walkTicks = distance / speed;

  // The centres are inside solid footprints; measure the walk between the home stand and work row.
  const homeDoor = humanBuildingTarget(home, entity.id, true);
  const workDoor = humanBuildingTarget(work, entity.id, false);
  const blocked = grid
    ? lineCrossesBlocked(grid, homeDoor.x, homeDoor.y, workDoor.x, workDoor.y)
    : false;
  const extreme = distance > COMMUTE_EXTREME_DISTANCE;
  if (!blocked && !extreme && walkTicks <= COMMUTE_WALK_BUDGET_TICKS) return null;

  return {
    entityId: entity.id,
    residenceBuildingId: home.id,
    workBuildingId: work.id,
    homeX: homeCenter.x,
    homeY: homeCenter.y,
    workX: workCenter.x,
    workY: workCenter.y,
    distance,
    walkTicks,
    severity: blocked ? 'blocked' : extreme ? 'extreme' : 'over_budget',
  };
}
