import { TERRAIN_TILE_SIZE } from '../gameTypes';
import type { Building, Entity } from '../gameTypes';
import { TICKS_PER_HOUR } from '../dayCycle';
import { isActiveMoonHowler } from '../moonHowler';
import { steerWithPath } from '../pathfinding';
import { faceVelocity } from './movementSteering';

const COMMUTE_CONFIG = {
  LONG_RANGE_DIST: 50,
  ARRIVAL_DIST: 8,
  MAX_DIST_RUSH: 12,
  /**
   * Final-approach easing: inside `LONG_RANGE_DIST` the walk closes on the doorstep at
   * `dist * APPROACH_RATE_PER_TICK` per tick, clamped to the base walking speed at the low end and
   * to the commute speed at the high end.
   *
   * Both earlier tunings were wrong in opposite directions: a flat `moveSpeed * 0.12` crawl took
   * most of a game hour to cover the last 50 px (owner report: "the cooling down period to a
   * building is now very slow"), while `Math.max(speed, moveSpeed * 0.65)` snapped through the same
   * stretch in about ten ticks. A distance-proportional step decelerates *visibly* — full commute
   * speed at 50 px, ~2.5x walking speed at 10 px — without ever crawling or snapping, and the
   * `Math.min(dist, …)` cap still means no overshoot.
   */
  APPROACH_RATE_PER_TICK: 0.25,
  /** Per-tick distance on the pathed branch, as a fraction of `moveSpeed` (see M27). */
  PATH_STEER_SPEED_RATIO: 0.88,
} as const;

/** Beyond this distance, settlers snap to home/work. */
export const COMMUTE_SNAP_DISTANCE = 200;

/** The longest commute lead the scheduler will hand out, in hours (see `commuteLeadHoursFor`). */
export const MAX_COMMUTE_LEAD_HOURS = 6;

/**
 * How many hours before their shift a settler must set off, given how far they are.
 *
 * The owner's rule is that a settler is **at** work when the shift starts rather than starting to
 * walk then ("they should be AT work when working tim start not begining with walking"). The old
 * fixed one-hour allowance (`workSchedule.WORK_COMMUTE_LEAD_HOURS`) could not honour that for a long
 * leg: the map is far wider than an hour's walk, and `COMMUTE_SNAP_DISTANCE` only teleports legs
 * under 200 units, so anyone further out simply arrived late.
 *
 * The estimate uses the movement owner's own numbers — base `speed`, the distance-scaled `distRush`,
 * and `PATH_STEER_SPEED_RATIO` — so it cannot drift from how the walk behaves. It is deliberately
 * *pessimistic* (one straight pathed leg, no rush bonus from the caller), because leaving slightly
 * early is invisible while arriving late is the reported bug.
 *
 * It is an estimate with a floor and a ceiling, **not** an arrival guarantee: past
 * `MAX_COMMUTE_LEAD_HOURS` a very long leg cannot be walked in the time available, and
 * `humanTick`'s existing shift-start snap is what still puts that settler at their post. Never
 * returns less than an hour, so a short commute keeps exactly the behaviour it had before.
 */
export function commuteLeadHoursFor(distance: number, walkSpeed: number): number {
  if (!Number.isFinite(distance) || distance <= COMMUTE_CONFIG.ARRIVAL_DIST) return 1;
  const speed = Number.isFinite(walkSpeed) && walkSpeed > 0 ? walkSpeed : 1;
  const perTick = speed * Math.min(COMMUTE_CONFIG.MAX_DIST_RUSH, 1 + distance / 40)
    * COMMUTE_CONFIG.PATH_STEER_SPEED_RATIO;
  if (!Number.isFinite(perTick) || perTick <= 0) return 1;
  const hours = distance / perTick / TICKS_PER_HOUR;
  if (!Number.isFinite(hours)) return 1;
  return Math.min(MAX_COMMUTE_LEAD_HOURS, Math.max(1, hours));
}

// ============ COMMUTE HELPERS ============

/**
 * A place in a crowd gathered around a point — a festival at the performers' camp or the hall front.
 *
 * Owner, 2026-09-30: *"they again in a circle"*, with no election running and five taverns in the
 * village. The festival branch of `humanTick` placed its crowd with `((id % 7) - 3) * 11` and
 * `((Math.floor(id / 7) % 5) - 2) * 9`: **35 slots total**, repeating, so a village's festival-goers
 * stacked tens deep on each one and the whole gathering read as a single dense, chatting ring. Twelve
 * staggered rings of sixteen slots give 192 distinct places spread over a few hundred px, so a crowd
 * looks like a crowd. Deterministic per settler — no RNG.
 */
export function crowdGatherPosition(cx: number, cy: number, entityId: number): { x: number; y: number } {
  const seed = Math.abs(entityId * 17 + 13);
  const ring = seed % CROWD_GATHER_RINGS;
  const slot = Math.floor(seed / CROWD_GATHER_RINGS) % CROWD_GATHER_PER_RING;
  // Stagger each ring so slots do not line up into spokes.
  const angle = (slot / CROWD_GATHER_PER_RING) * Math.PI * 2 + ring * 0.13;
  const radius = CROWD_GATHER_INNER_PX + ring * CROWD_GATHER_RING_GAP_PX;

  return {
    x: cx + Math.cos(angle) * radius,
    // Flattened, so the crowd occupies ground rather than forming a perfect circle.
    y: cy + Math.sin(angle) * radius * 0.7,
  };
}

/** 12 × 16 = 192 places in a festival crowd, from just outside the stage to the edge of it. */
const CROWD_GATHER_RINGS = 12;
const CROWD_GATHER_PER_RING = 16;
const CROWD_GATHER_INNER_PX = 34;
const CROWD_GATHER_RING_GAP_PX = 14;

/**
 * A place of one's own at a venue — the arc in front of a tavern, market, hall or church.
 *
 * Owner, 2026-09-30, looking at a clump of dozens of settlers mid-village with no event running:
 * *"they again in a circle"*. Nothing was gathering them there: `humanLeisureBehavior`'s day-off /
 * Sunday-service / market / grief impulse sent **every** settler to a single point on the venue —
 * `b.x + b.width / 2, b.y + b.height * 0.92` — and each stopped within 20 px of it, so a village's
 * leisure crowd stacked into a ring around one coordinate. (That point is also the corner form applied
 * to a value that already is the footprint centre, `buildingGeometry`; see `humanBuildingTarget`.)
 *
 * This gives every settler a deterministic slot on three shallow arcs across the venue's front, using
 * the same stable hash idea as `homeStandPosition` and the same south-facing bias, so a crowd reads as a
 * crowd around the entrance rather than a circle around a pixel. No RNG: the same settler at the same
 * venue always stands in the same place.
 */
export function venueGatherPosition(building: Building, entityId: number): { x: number; y: number } {
  const seed = Math.abs(entityId * 17 + building.id * 31);
  const arc = seed % VENUE_GATHER_ARCS;
  const slot = Math.floor(seed / VENUE_GATHER_ARCS) % VENUE_GATHER_PER_ARC;
  // South-facing arcs (30° to 150°), each one pushed a little further from the wall.
  const angle = Math.PI * 0.18 + (slot / Math.max(1, VENUE_GATHER_PER_ARC - 1)) * Math.PI * 0.64;
  const radius = building.width / 2 + VENUE_GATHER_STANDOFF_PX + arc * VENUE_GATHER_ARC_GAP_PX;

  return {
    x: building.x + Math.cos(angle) * radius,
    // Cleared of the wall by a standoff at every angle — the flatter the arc, the closer the apex came to
    // the footprint, which put settlers inside the building they came to visit.
    y: building.y + building.height + VENUE_GATHER_STANDOFF_PX + Math.sin(angle) * radius * 0.5,
  };
}

/** Slots available to a venue crowd: three arcs of eight. */
const VENUE_GATHER_ARCS = 3;
const VENUE_GATHER_PER_ARC = 8;
const VENUE_GATHER_STANDOFF_PX = 18;
const VENUE_GATHER_ARC_GAP_PX = 10;

/**
 * Calculates a deterministic, dispersed standing position in the front yard of a home residence
 * so family members and roommates do not overlap sprites or get hidden behind the roof.
 */
export function homeStandPosition(building: Building, entityId: number): { x: number; y: number } {
  const cx = building.x + building.width / 2;
  const cy = building.y + building.height / 2;
  const seed = Math.abs(entityId * 17 + building.id * 31);

  // Bias angle toward the south (front yard / porch arc: 30° to 150°)
  const angle = Math.PI * 0.18 + ((seed % 100) / 100) * Math.PI * 0.64;
  const ring = (seed % 4) + 1;
  const radius = 10 + ring * 6;

  return {
    x: cx + Math.cos(angle) * radius,
    y: cy + Math.sin(angle) * (radius * 0.65) + building.height * 0.2,
  };
}

/** Spacing between two workers of the same building, in world px (a settler sprite is ~20 px wide). */
export const WORKER_STAND_SPACING_PX = 16;

/** How far south of the footprint's edge the worker row stands, in px — in front of it, never on it. */
export const WORKER_STAND_STANDOFF_PX = 10;

/**
 * Returns the exact destination coordinates for a human heading to home or workplace.
 */
export function humanBuildingTarget(
  building: Building,
  entityId: number,
  arrivingHome: boolean,
): { x: number; y: number } {
  if (arrivingHome) {
    return homeStandPosition(building, entityId);
  }
  /**
   * A real slot per worker, in a row across the building's front.
   *
   * Owner, 2026-09-30, looking at the crew of a Hunting Spot: *"why are they all standing at side of
   * the village?"*, then *"but why all at the same palce not logic"*. Both halves of that were true
   * here, and both are fixed by this one expression:
   *
   *  - the point was built in the **corner form** — `building.x + building.width / 2` — on a value
   *    that already *is* the footprint centre (`buildingGeometry`), so a crew stood half a footprint to
   *    the right of its own workplace. That is the "at the side of it" the owner saw, and it is the
   *    same mistake the camera-focus callers made (F23).
   *  - the only dispersion was `((seed % 7) - 3) * 6` from a hash of the entity id: **seven** possible
   *    x positions in a ±18 px band, an **identical y for everyone**, and past seven workers the hash
   *    collides so two settlers stand on the exact same pixel.
   *
   * The slot now comes from the list that owns the crew (`building.occupants`, with the `?? []` its
   * other save-boundary readers use), and the row is centred on the footprint. Deterministic — no RNG,
   * so the same world and crew always give the same positions.
   */
  const crew = building.occupants ?? [];
  const slot = Math.max(0, crew.indexOf(entityId));
  const span = Math.max(0, crew.length - 1) * WORKER_STAND_SPACING_PX;
  return {
    x: building.x - span / 2 + slot * WORKER_STAND_SPACING_PX,
    // Workers stand in front of the building (south) so sprites are not obscured
    y: building.y + building.height / 2 + WORKER_STAND_STANDOFF_PX,
  };
}

export function commuteDistanceToBuilding(
  entity: Entity,
  building: Building,
  arrivingHome: boolean,
): number {
  const target = humanBuildingTarget(building, entity.id, arrivingHome);
  return Math.hypot(target.x - entity.x, target.y - entity.y);
}

export function snapHumanToBuilding(entity: Entity, building: Building, arrivingHome: boolean): void {
  const target = humanBuildingTarget(building, entity.id, arrivingHome);
  entity.x = target.x;
  entity.y = target.y;
  entity.vx = 0;
  entity.vy = 0;
  entity.spriteAngle = Math.PI / 2; // Face forward/south toward the road
}

/**
 * Generates a stable path key per commute leg so A* is not recalculated on every tile crossed.
 */
export function commutePathCacheKey(
  buildingId: number,
  arrivingHome: boolean,
  startX: number,
  startY: number,
  targetX: number,
  targetY: number,
  entityId?: number,
): string {
  // A known entity identifies the commute on its own: the key must stay stable
  // while that settler crosses tiles, or A* would rerun on every step.
  if (entityId != null) {
    return `c_${entityId}_${buildingId}_${arrivingHome ? 'h' : 'w'}`;
  }
  // Without an entity there is nothing else to name the commute, so both
  // endpoint tiles are part of the key.
  const startTileX = Math.floor(startX / TERRAIN_TILE_SIZE);
  const startTileY = Math.floor(startY / TERRAIN_TILE_SIZE);
  const targetTileX = Math.floor(targetX / TERRAIN_TILE_SIZE);
  const targetTileY = Math.floor(targetY / TERRAIN_TILE_SIZE);
  return `c_${buildingId}_${arrivingHome ? 'h' : 'w'}_${startTileX}_${startTileY}_${targetTileX}_${targetTileY}`;
}

/**
 * Steers a human entity towards their target building.
 * Returns `true` if the entity has arrived within destination radius, `false` otherwise.
 */
export function commuteHumanToBuilding(
  entity: Entity,
  building: Building,
  speed: number,
  arrivingHome: boolean,
  rush = 1,
): boolean {
  const target = humanBuildingTarget(building, entity.id, arrivingHome);
  const dx = target.x - entity.x;
  const dy = target.y - entity.y;
  const dist = Math.hypot(dx, dy);

  // Arrived at destination
  if (dist <= COMMUTE_CONFIG.ARRIVAL_DIST) {
    entity.vx = 0;
    entity.vy = 0;
    return true;
  }

  // Accelerate long-range commutes so cross-map walks do not consume the entire work day
  const distRush = Math.min(COMMUTE_CONFIG.MAX_DIST_RUSH, 1 + dist / 40);
  const moveSpeed = speed * rush * distRush;

  if (dist > COMMUTE_CONFIG.LONG_RANGE_DIST) {
    const cacheKey = commutePathCacheKey(
      building.id,
      arrivingHome,
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
    if (handled === 'arrived') return true;

    const step = Math.min(dist, moveSpeed * COMMUTE_CONFIG.PATH_STEER_SPEED_RATIO);
    entity.vx = (dx / dist) * step;
    entity.vy = (dy / dist) * step;
    faceVelocity(entity);
    return false;
  }

  // Final approach: ease in at a distance-proportional step (never below a normal walk, never a
  // snap) and never overshoot the doorstep.
  const approachSpeed = Math.min(
    moveSpeed,
    Math.max(speed, dist * COMMUTE_CONFIG.APPROACH_RATE_PER_TICK),
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
