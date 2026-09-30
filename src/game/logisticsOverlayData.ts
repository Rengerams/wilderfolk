/**
 * F4 — Infrastructure and Logistics Overlay: the read-only projection behind the overlay.
 *
 * The renderer draws; it does not decide. Every threshold and every classification below lives
 * here, in the game layer, so the overlay can be tested without a canvas and so the renderer
 * cannot drift from the rule. Nothing in this module writes to the world, mutates a building or
 * entity, or reaches the save schema — it is a pure function of the authoritative `WorldState`.
 *
 * Three questions the projection answers for the first slice:
 *
 * 1. **Which road strips form one network?** Connectivity components over the road family
 *    (`stripTopology.stripFamilyFor`), joined when their footprints are within
 *    {@link ROAD_CONNECT_GAP}.
 * 2. **Which buildings are poorly connected to it?** Completed player buildings outside the road
 *    family, classified by their centre's distance to the nearest road footprint.
 * 3. **Where is commute pressure?** Settlers whose home↔work leg is blocked by water or mountains
 *    (it cannot be walked and must be detoured), exceeds the simulation's own too-far-to-walk
 *    distance, or exceeds the owner's one-hour commute allowance.
 *
 * Commute pressure is deliberately *not* rare: `humanTick` accelerates a long commute and
 * `COMMUTE_SNAP_DISTANCE` teleports the settler outright, so a colony with a one-hour allowance
 * (`WORK_COMMUTE_LEAD_HOURS`) puts most legs `over_budget`. Surfacing that is the point of the
 * overlay — the amber/red split is the finding, not a bug in the thresholds.
 */
import { BuildingType, EntityType, type Building, type Entity, type WorldState } from './gameTypes';
import { TICKS_PER_HOUR } from './dayCycle';
import { getBuildingCenter, getBuildingFootprintRect } from './placementUtils';
import { isPlayerHuman } from './playerHuman';
import { COMMUTE_SNAP_DISTANCE } from './simulation/humanMovement';
import { SPECIES_CONFIG } from './speciesConfig';
import { isStripBuildType } from './stripBuild';
import { isRoadStripType } from './stripTopology';
import { WORK_COMMUTE_LEAD_HOURS } from './workSchedule';
import { getReadOnlyPathGrid, lineCrossesBlocked, type PathGrid } from './pathfinding';

// ============ TUNABLE THRESHOLDS ============

/**
 * Footprint gap (world units) between two road strips that still counts as one network.
 *
 * Roads are chained edge-to-edge by `resolveRoadStripPlan`/`snapBuildingCenter`, so a real
 * junction has a gap of zero. The tolerance covers one placement-grid step (`GRID_SIZE` = 20)
 * plus rounding slack, which is what a player drawing a chain with the mouse actually leaves.
 */
export const ROAD_CONNECT_GAP = 26;

/** At or under this distance from a road footprint edge, a building is well connected. */
export const GOOD_ROAD_ACCESS_DISTANCE = 40;

/**
 * Beyond this distance from any road footprint edge, a building has **no** road access at all.
 *
 * Measured from the building's placement anchor (its centre, `placementUtils.getBuildingCenter`)
 * to the nearest point of the nearest road footprint — not centre-to-centre, so a building that
 * touches a road reads as `0` regardless of either footprint's size.
 */
export const MAX_ROAD_ACCESS_DISTANCE = 120;

/**
 * Home↔work distance at which the simulation already gives up on walking the leg.
 *
 * Reused from its owner (`humanMovement.COMMUTE_SNAP_DISTANCE`, the distance beyond which a
 * settler snaps to home or work) rather than restated, so the overlay can never disagree with
 * the simulation about which commutes it has abandoned.
 */
export const COMMUTE_EXTREME_DISTANCE = COMMUTE_SNAP_DISTANCE;

/**
 * Walk time an ordinary home↔work leg may take before it is over budget.
 *
 * The owner's commute allowance is `WORK_COMMUTE_LEAD_HOURS` hours before the shift
 * (`workSchedule`: "they have an hour to commute"), converted to sim ticks with `TICKS_PER_HOUR`.
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
 * Why a building is flagged. A discriminated union of causes rather than a boolean plus a
 * distance, because "no roads exist at all" and "this building is off the network" are different
 * problems for the player, and `poorly_connected` is the only one with a finite distance.
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
  readonly homeBuildingId: number;
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
 * Uniform bucket index over road footprint centres.
 *
 * Only exists so the projection stays near-linear in village size on a per-frame path: a naive
 * buildings × roads scan is O(n²). Cell size is comfortably wider than the widest strip footprint
 * (Road is 66×26), so a query expanded by the caller's radius plus the largest road half-extent
 * is fully covered by walking the cell square around the query point.
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
 * Completed player roads — `stripTopology.isRoadStripType` is the owner of that membership.
 *
 * Deliberately not `stripFamilyFor`, which routes any unclassified strip type (Fence) into the
 * 'road' family through its fallback: a fence line is a barrier, not a supply route.
 */
function isNetworkRoad(b: Building): boolean {
  return b.completed && b.faction !== 'rival' && isRoadStripType(b.type);
}

/**
 * A building the network is supposed to serve.
 *
 * Excludes every multi-tile strip type (roads are the network; walls, gates and fences are
 * barriers, not destinations), rival structures, and sites still under construction — a
 * half-built farm has no supply demand yet.
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
 * Projects the overlay's read of the world.
 *
 * Pure and deterministic: the same world always yields the same result, an empty world yields
 * empty output, and nothing here is cached between calls. Callers that render per frame want
 * {@link computeLogisticsOverlayCached} instead, which wraps this with a tick-keyed memo.
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
 * A settler's home↔work leg, or `null` when they have none or it is inside budget **and** passable.
 *
 * Severity precedence is `blocked` → `extreme` → `over_budget`, and the first is reported even when
 * the leg is within the walk budget: a direct line that crosses water or mountains is its own
 * finding, because the settler cannot walk it at all and must detour (`pathfinding.steerWithPath`).
 * A short-but-blocked commute was previously invisible here — it never exceeded the budget.
 *
 * The line test uses the **read-only** grid (`getReadOnlyPathGrid`) so this per-frame projection
 * cannot disturb the simulation's own grid/waypoint cache, and it is `lineCrossesBlocked` rather
 * than A\*: this runs on every render snapshot, so a search per leg would be a frame-time
 * regression. Step count scales with span (4–128 samples), so cheap short legs stay cheap.
 *
 * Field-name trap: on an `Entity`, `homeBuildingId` is the **workplace** and
 * `residenceBuildingId` is the home (`relationships.ts`, `residencyOccupancy.hasWorkAssignment`).
 */
/**
 * Memoised front for {@link computeLogisticsOverlay}.
 *
 * The projection is a pure function of the world, but it is **expensive** — it rebuilds the road
 * graph and a `RoadBucketGrid`, and runs `classifyCommute` (4–128 grid samples each) for every
 * settler. `buildRenderSnapshot` calls it once per snapshot, and the snapshot cache key in
 * `gameLoop.snapshotDirtyKey()` includes the camera, which `updateView` lerps **every frame**. So with
 * the overlay on, panning re-ran the whole projection at frame rate (~60× per second) instead of once
 * per simulation tick, with ~200 commute objects of garbage per frame
 *
 * The cache key is the world **object identity** plus the tick. Identity catches every in-place
 * mutation and every adoption of a new authoritative world, and the tick additionally catches a
 * handler that mutates the current world without advancing it (a pause while paused — the same shape
 * `GameLoop.invalidateRenderSnapshot` documents). It is deliberately conservative: a false miss costs
 * one projection, a false hit would draw stale data.
 */
let cachedOverlayWorld: WorldState | null = null;
let cachedOverlayTick = -1;
let cachedOverlay: LogisticsOverlayData | null = null;

/** The overlay for this world, recomputed only when the world object or the tick changes. */
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

function classifyCommute(
  entity: Entity,
  byId: ReadonlyMap<number, Building>,
  grid: PathGrid | null,
): LogisticsCommute | null {
  if (!entity.alive || !isPlayerHuman(entity)) return null;
  if (entity.homeBuildingId == null || entity.residenceBuildingId == null) return null;

  const work = byId.get(entity.homeBuildingId);
  const home = byId.get(entity.residenceBuildingId);
  if (!work || !home) return null;

  const workCenter = getBuildingCenter(work);
  const homeCenter = getBuildingCenter(home);
  const distance = Math.hypot(workCenter.x - homeCenter.x, workCenter.y - homeCenter.y);

  const speed = Number.isFinite(entity.speed) && entity.speed > 0 ? entity.speed : SETTLER_WALK_SPEED;
  const walkTicks = distance / speed;

  const blocked = grid
    ? lineCrossesBlocked(grid, homeCenter.x, homeCenter.y, workCenter.x, workCenter.y)
    : false;
  const extreme = distance > COMMUTE_EXTREME_DISTANCE;
  if (!blocked && !extreme && walkTicks <= COMMUTE_WALK_BUDGET_TICKS) return null;

  return {
    entityId: entity.id,
    homeBuildingId: home.id,
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
