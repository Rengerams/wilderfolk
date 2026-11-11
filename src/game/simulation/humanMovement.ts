import { COMMUTE_CONFIG, commuteWalkSpeed } from '../commuteReach';
import { PATH_CELL } from '../gameTypes';
import { BuildingType } from '../buildings';
import type { Building, Entity } from '../gameTypes';
import { buildingAccessPoint, buildingAccessPoints, isAtBuildingReach } from '../buildingAccess';
import { PRISON_GUARDS_MAX } from '../prisonShifts';
import { isActiveMoonHowler } from '../moonHowler';
import { getCurrentPathGrid, getNavigationQuote, invalidateCommutePathsForWalker, isGroundWalkableAt, isWalkStepAllowed, lineCrossesBlocked, steerWithPath } from '../pathfinding';
import { faceVelocity, steerEntityToward } from './movementSteering';

/** Outdoor sites have no interior; construction crews stay visible until completion. */
const OUTDOOR_BUILDINGS = new Set<Building['type']>([
  BuildingType.Farm, BuildingType.Quarry, BuildingType.Market, BuildingType.Graveyard,
  BuildingType.Square, BuildingType.Well, BuildingType.TamingPost, BuildingType.Road,
  BuildingType.Wall, BuildingType.WallGate, BuildingType.Watchtower, BuildingType.HuntingSpot,
  BuildingType.FishingSpot, BuildingType.WildlifePreserve, BuildingType.Bridge,
  BuildingType.GroundReinforcement, BuildingType.Garden, BuildingType.Statue,
  BuildingType.Lamp, BuildingType.Fence,
]);

/** The sim's own walk threshold: below this a settler is standing still, not travelling. */
const WALKING_MIN_SPEED_PX = 0.1;

/**
 * Read-only evidence of travel: the settler is moving this tick and closing on this point. Reports
 * only what the movement owners already steered — it never plans a route.
 */
export function isWalkingToward(entity: Entity, point: { x: number; y: number }): boolean {
  if (Math.hypot(entity.vx, entity.vy) <= WALKING_MIN_SPEED_PX) return false;
  return (point.x - entity.x) * entity.vx + (point.y - entity.y) * entity.vy > 0;
}

/** Arrival changes presentation only; the settler remains in the simulation and building roster. */
export function enterHumanBuilding(entity: Entity, building: Building): void {
  if (!building.completed || OUTDOOR_BUILDINGS.has(building.type)) return;
  entity.indoorBuildingId = building.id;
  entity.vx = 0;
  entity.vy = 0;
}

/**
 * Steer toward a fixed place, taking the path owner's route when the direct line is blocked — for
 * doorways, work rows and venue spots a settler must reach rather than press against.
 */
export function steerHumanToward(
  entity: Entity,
  targetX: number,
  targetY: number,
  speed: number,
  approachFactor = 1,
  cacheKey = `local_${entity.id}`,
): void {
  const route = steerWithPath(entity, targetX, targetY, speed * approachFactor, cacheKey);
  if (route === 'direct') {
    steerEntityToward(entity, targetX, targetY, speed, approachFactor);
  }
}

// ============ COMMUTE HELPERS ============

/** Cells probed for a blocked stand point, nearest ring first and south before north. */
const STAND_POINT_FALLBACK_OFFSETS: readonly (readonly [number, number])[] = [
  [0, 1], [1, 1], [-1, 1], [1, 0], [-1, 0], [1, -1], [-1, -1], [0, -1],
];

/**
 * Moves a stand point onto ground a walker can occupy: rows, arcs and crowd slots are geometry, not
 * terrain, and the grid owns "can a walker stand here", so the point moves to the nearest allowed cell.
 */
function walkableStandPoint(x: number, y: number): { x: number; y: number } {
  if (isGroundWalkableAt(x, y)) return { x, y };
  for (let ring = 1; ring <= 3; ring++) {
    for (const [dx, dy] of STAND_POINT_FALLBACK_OFFSETS) {
      const nx = x + dx * PATH_CELL * ring;
      const ny = y + dy * PATH_CELL * ring;
      if (isGroundWalkableAt(nx, ny)) return { x: nx, y: ny };
    }
  }
  return { x, y };
}

/**
 * A place in a crowd gathered around a point: 12 staggered rings of 16 slots (192 places) so a
 * festival crowd spreads instead of stacking on the same slots. Deterministic per settler, no RNG.
 */
export function crowdGatherPosition(cx: number, cy: number, entityId: number): { x: number; y: number } {
  const seed = Math.abs(entityId * 17 + 13);
  const ring = seed % CROWD_GATHER_RINGS;
  const slot = Math.floor(seed / CROWD_GATHER_RINGS) % CROWD_GATHER_PER_RING;
  // Stagger each ring so slots do not line up into spokes.
  const angle = (slot / CROWD_GATHER_PER_RING) * Math.PI * 2 + ring * 0.13;
  const radius = CROWD_GATHER_INNER_PX + ring * CROWD_GATHER_RING_GAP_PX;

  return walkableStandPoint(
    cx + Math.cos(angle) * radius,
    // Flattened, so the crowd occupies ground rather than forming a perfect circle.
    cy + Math.sin(angle) * radius * 0.7,
  );
}

/** 12 × 16 = 192 places in a festival crowd, from just outside the stage to the edge of it. */
const CROWD_GATHER_RINGS = 12;
const CROWD_GATHER_PER_RING = 16;
const CROWD_GATHER_INNER_PX = 34;
const CROWD_GATHER_RING_GAP_PX = 14;

/**
 * A place of one's own at a venue — a deterministic slot on three shallow arcs across the venue's
 * front, so a leisure crowd reads as a crowd around the entrance, not a circle around one pixel.
 */
export function venueGatherPosition(building: Building, entityId: number): { x: number; y: number } {
  const seed = Math.abs(entityId * 17 + building.id * 31);
  const arc = seed % VENUE_GATHER_ARCS;
  const slot = Math.floor(seed / VENUE_GATHER_ARCS) % VENUE_GATHER_PER_ARC;
  // South-facing arcs (30° to 150°), each one pushed a little further from the wall.
  const angle = Math.PI * 0.18 + (slot / Math.max(1, VENUE_GATHER_PER_ARC - 1)) * Math.PI * 0.64;
  const radius = building.width / 2 + VENUE_GATHER_STANDOFF_PX + arc * VENUE_GATHER_ARC_GAP_PX;

  return walkableStandPoint(
    building.x + Math.cos(angle) * radius,
    // Cleared of the wall by a standoff at every angle — the flatter the arc, the closer the apex came to
    // the footprint, which put settlers inside the building they came to visit.
    building.y + building.height + VENUE_GATHER_STANDOFF_PX + Math.sin(angle) * radius * 0.5,
  );
}

/** Slots available to a venue crowd: three arcs of eight. */
const VENUE_GATHER_ARCS = 3;
const VENUE_GATHER_PER_ARC = 8;
const VENUE_GATHER_STANDOFF_PX = 18;
const VENUE_GATHER_ARC_GAP_PX = 10;

/**
 * A deterministic, dispersed spot in the frontage of a home's one doorway, so family members and
 * roommates do not overlap sprites or get hidden behind the roof.
 */
export function homeStandPosition(building: Building, entityId: number): { x: number; y: number } {
  const access = buildingAccessPoint(building);
  const seed = Math.abs(entityId * 17 + building.id * 31);
  const lateralSlot = seed % 7 - 3;
  const porchRow = Math.floor(seed / 7) % 3;
  const alongX = access.side === 'south' || access.side === 'north';
  const lateral = lateralSlot * Math.min(6, (alongX ? building.width : building.height) / 7);
  const depth = porchRow * 4;

  if (access.side === 'east') return walkableStandPoint(access.x + depth, access.y + lateral);
  if (access.side === 'west') return walkableStandPoint(access.x - depth, access.y + lateral);
  return walkableStandPoint(
    access.x + lateral,
    access.y + (access.side === 'south' ? depth : -depth),
  );
}

/** Spacing between two workers of the same building, in world px (a settler sprite is ~20 px wide). */
export const WORKER_STAND_SPACING_PX = 16;

/** How far south of the footprint's edge the worker row stands, in px — in front of it, never on it. */
export const WORKER_STAND_STANDOFF_PX = 10;

/** The work-post stand point in front of a building; placement only, never a navigation target. */
export function humanBuildingTarget(building: Building, entityId: number): { x: number; y: number } {
  if (building.type === BuildingType.School && !building.occupants.includes(entityId)) {
    // A pupil's place is a yard slot, not the footprint centre: the centre is unwalkable and every
    // pupil snapped to the same neighbouring cell, stacking the whole class on one pixel.
    return venueGatherPosition(building, entityId);
  }
  /**
   * A real slot per worker, in a row across the building's front, taken from `building.occupants` and
   * centred on the footprint. Deterministic, so the same crew always stands in the same places.
   */
  const crew = building.occupants ?? [];
  // A Prison's row holds its guards, but the building only carries `occupants` (guards ∪ prisoners), so
  // the occupant index folds into the post count to keep the row within the presence check's width.
  const isPrison = building.type === BuildingType.Prison;
  const rawSlot = Math.max(0, crew.indexOf(entityId));
  const slot = isPrison ? rawSlot % PRISON_GUARDS_MAX : rawSlot;
  const rowLength = isPrison ? PRISON_GUARDS_MAX : crew.length;
  const span = Math.max(0, rowLength - 1) * WORKER_STAND_SPACING_PX;
  return walkableStandPoint(
    building.x - span / 2 + slot * WORKER_STAND_SPACING_PX,
    // Workers stand in front of the building (south) so sprites are not obscured
    building.y + building.height / 2 + WORKER_STAND_STANDOFF_PX,
  );
}

/** Distance measures the building itself (its centre), not a settler's personal stand slot. */
function buildingCommutePoint(building: Building): { x: number; y: number } {
  return { x: building.x, y: building.y };
}

export function commuteDistanceToBuilding(entity: Entity, building: Building): number {
  const target = buildingAccessPoint(building);
  return Math.hypot(target.x - entity.x, target.y - entity.y);
}

/** Commute distance from the home's doorway to the destination. */
export function commuteDistanceFromResidence(
  entity: Entity,
  residence: Building | undefined,
  destination: Building,
): number {
  const origin = residence ? buildingAccessPoint(residence) : entity;
  const target = buildingCommutePoint(destination);
  const dx = origin.x - target.x;
  const dy = origin.y - target.y;
  return Math.hypot(dx, dy);
}

/**
 * Generates a stable path key per commute leg so A* is not recalculated on every tile crossed.
 */
export function commutePathCacheKey(
  buildingId: number,
  startX: number,
  startY: number,
  targetX: number,
  targetY: number,
  entityId?: number,
): string {
  // A known entity identifies the commute on its own: the key must stay stable
  // while that settler crosses tiles, or A* would rerun on every step.
  if (entityId != null) {
    return `c_${entityId}_${buildingId}`;
  }
  // Without an entity there is nothing else to name the commute, so both
  // endpoint tiles are part of the key.
  const startTileX = Math.floor(startX / PATH_CELL);
  const startTileY = Math.floor(startY / PATH_CELL);
  const targetTileX = Math.floor(targetX / PATH_CELL);
  const targetTileY = Math.floor(targetY / PATH_CELL);
  return `c_${buildingId}_${startTileX}_${startTileY}_${targetTileX}_${targetTileY}`;
}

/** Minimum genuine progress in a tick before a blocked walk is considered stuck. */
const STUCK_WALK_MIN_PROGRESS_PX = 0.05;
const stuckWalkers = new WeakMap<Entity, { x: number; y: number; ticks: number }>();

/**
 * Apply only collision-valid displacement. Replan a blocked route after repeated failed steps.
 * Never snap to another tile: that caused a visible move/backtrack loop against walls.
 */
export function applyHumanWalkStep(entity: Entity, roadMult: number): void {
  const stepX = entity.vx * roadMult;
  const stepY = entity.vy * roadMult;
  if (stepX === 0 && stepY === 0) {
    stuckWalkers.delete(entity);
    return;
  }

  const startX = entity.x;
  const startY = entity.y;
  if (isWalkStepAllowed(startX, startY, startX + stepX, startY + stepY)) {
    entity.x += stepX;
    entity.y += stepY;
  } else {
    if (stepX !== 0 && isWalkStepAllowed(entity.x, entity.y, entity.x + stepX, entity.y)) {
      entity.x += stepX;
    }
    if (stepY !== 0 && isWalkStepAllowed(entity.x, entity.y, entity.x, entity.y + stepY)) {
      entity.y += stepY;
    }
  }

  if (Math.hypot(entity.x - startX, entity.y - startY) > STUCK_WALK_MIN_PROGRESS_PX) {
    stuckWalkers.delete(entity);
    return;
  }

  const previous = stuckWalkers.get(entity);
  const ticks = previous
    && Math.hypot(previous.x - entity.x, previous.y - entity.y) <= STUCK_WALK_MIN_PROGRESS_PX
    ? previous.ticks + 1
    : 1;
  stuckWalkers.set(entity, { x: entity.x, y: entity.y, ticks });
  // Invalidate all destination-specific routes, not merely the commute cache. Retries are
  // bounded to every third failed step; an unreachable walk remains stationary instead of teleporting.
  if (ticks % 3 === 0) invalidateCommutePathsForWalker(entity.id);
  entity.vx = 0;
  entity.vy = 0;
}

/** Selected frontage belongs to the walker, never to the building or its saved roster. */
const walkerBuildingAccess = new WeakMap<Entity, {
  buildingId: number; grid: ReturnType<typeof getCurrentPathGrid>; x: number; y: number;
}>();

/**
 * Walk to any reachable facade, not a fixed southern entrance. An obstructed approach cannot
 * authorize arrival; keep the chosen facade while walking so the route does not oscillate.
 * Arrival never writes indoor state: the caller's activity decides whether to enter.
 */
export function commuteHumanToBuilding(
  entity: Entity,
  building: Building,
  speed: number,
  rush = 1,
): boolean {
  if (isAtBuildingReach(entity, building)) {
    entity.vx = 0;
    entity.vy = 0;
    walkerBuildingAccess.delete(entity);
    return true;
  }
  const grid = getCurrentPathGrid();
  const candidates = buildingAccessPoints(building, grid);
  if (candidates.length === 0) {
    entity.vx = 0;
    entity.vy = 0;
    walkerBuildingAccess.delete(entity);
    return false;
  }
  const saved = walkerBuildingAccess.get(entity);
  let target = saved?.buildingId === building.id && saved.grid === grid
    ? candidates.find((point) => point.x === saved.x && point.y === saved.y) : undefined;
  if (!target) {
    let bestCost = Infinity;
    for (const point of candidates) {
      let cost = Math.hypot(point.x - entity.x, point.y - entity.y);
      if (grid && lineCrossesBlocked(grid, entity.x, entity.y, point.x, point.y)) {
        const quote = getNavigationQuote(grid,
          { x: Math.floor(entity.x / PATH_CELL), y: Math.floor(entity.y / PATH_CELL) },
          { x: Math.floor(point.x / PATH_CELL), y: Math.floor(point.y / PATH_CELL) },
          { maxNodes: 6000 });
        if (quote.status !== 'priced') continue;
        cost = quote.costTiles * PATH_CELL;
      }
      if (cost < bestCost) {
        bestCost = cost;
        target = point;
      }
    }
    if (target) walkerBuildingAccess.set(entity, {
      buildingId: building.id, grid, x: target.x, y: target.y,
    });
  }
  if (!target) {
    entity.vx = 0;
    entity.vy = 0;
    return false;
  }
  const dx = target.x - entity.x;
  const dy = target.y - entity.y;
  const dist = Math.hypot(dx, dy);

  if (dist === 0) {
    entity.vx = 0;
    entity.vy = 0;
    return false;
  }

  const moveSpeed = commuteWalkSpeed(speed, rush);

  // The path owner is asked at every distance: asking only beyond 50 px sent short legs and every final
  // approach straight across a river or wall. `steerWithPath` answers 'direct' when the line is clear.
  const cacheKey = commutePathCacheKey(
    building.id,
    entity.x,
    entity.y,
    target.x,
    target.y,
    entity.id,
  );
  const handled = steerWithPath(
    entity,
    target.x,
    target.y,
    moveSpeed * COMMUTE_CONFIG.PATH_STEER_SPEED_RATIO,
    cacheKey,
  );

  // 'path' only sets the velocity along the route; the human loop's movement apply at the end of
  // the tick is the single integration (the stepper must not move the entity as well).
  if (handled === 'path') return false;
  if (handled === 'blocked') {
    // A changed obstacle may invalidate this side; re-evaluate all usable facades next tick.
    walkerBuildingAccess.delete(entity);
    entity.vx = 0;
    entity.vy = 0;
    return false;
  }

  if (dist > COMMUTE_CONFIG.LONG_RANGE_DIST
    || (building.type === BuildingType.School && !building.occupants.includes(entity.id))) {
    const step = Math.min(dist, moveSpeed * COMMUTE_CONFIG.PATH_STEER_SPEED_RATIO);
    entity.vx = (dx / dist) * step;
    entity.vy = (dy / dist) * step;
    faceVelocity(entity);
    return false;
  }

  // Final approach is capped by the same bounded pace and never overshoots the doorstep.
  const approachSpeed = Math.min(
    moveSpeed,
    Math.max(speed * COMMUTE_CONFIG.APPROACH_MIN_SPEED_RATIO, dist * COMMUTE_CONFIG.APPROACH_RATE_PER_TICK),
  );
  const step = Math.min(dist, approachSpeed);
  entity.vx = (dx / dist) * step;
  entity.vy = (dy / dist) * step;

  if (Math.abs(entity.vx) > 0.001 || Math.abs(entity.vy) > 0.001) {
    faceVelocity(entity);
  }

  return false;
}

/**
 * Finds the nearest active, living cursed Moon Howler (werewolf form)
 * relative to an entity (used primarily for priest exorcism AI).
 */
export function nearestActiveMoonHowler(
  entity: Entity,
  werewolves: Entity[] | undefined,
): Entity | undefined {
  if (!werewolves || werewolves.length === 0) return undefined;

  let best: Entity | undefined;
  let bestDistSq = Infinity;

  for (let i = 0; i < werewolves.length; i++) {
    const w = werewolves[i];
    // Ignore self, dead entities, and non-active werewolves
    if (w.id === entity.id || !w.alive || !isActiveMoonHowler(w)) continue;

    const dx = w.x - entity.x;
    const dy = w.y - entity.y;
    const distSq = dx * dx + dy * dy;

    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      best = w;
    }
  }

  return best;
}

export {
  MAX_ASSIGNABLE_COMMUTE_HOURS,
  MAX_COMMUTE_LEAD_HOURS,
  commuteLeadHoursFor,
  isWithinAssignableCommute,
} from '../commuteReach';
