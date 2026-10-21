import { COMMUTE_CONFIG, commuteWalkSpeed } from '../commuteReach';
import { PATH_CELL } from '../gameTypes';
import { BuildingType } from '../buildings';
import type { Building, Entity } from '../gameTypes';
import { PRISON_GUARDS_MAX } from '../prisonShifts';
import { isActiveMoonHowler } from '../moonHowler';
import { invalidateCommutePathsForWalker, isGroundWalkableAt, isWalkStepAllowed, steerWithPath } from '../pathfinding';
import { faceVelocity } from './movementSteering';

// ============ COMMUTE HELPERS ============

/** Cells probed for a blocked stand point, nearest ring first and south before north. */
const STAND_POINT_FALLBACK_OFFSETS: readonly (readonly [number, number])[] = [
  [0, 1], [1, 1], [-1, 1], [1, 0], [-1, 0], [1, -1], [-1, -1], [0, -1],
];

/**
 * Moves a stand point onto ground a walker can occupy.
 *
 * A workplace row, a home arc and a crowd slot are geometry, not terrain: they land on water, on a
 * decor cell the L3 pass reserved, or under a completed wall. The owner's own save had two soldiers
 * standing in a pond and ten settlers inside walls — all of them simply standing where the row put
 * them, and a walk that cannot occupy its destination hovers at the edge of it instead of arriving.
 * The grid owns "can a walker stand here", so the point moves to the nearest cell it allows.
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

  return walkableStandPoint(
    cx + Math.cos(angle) * radius,
    cy + Math.sin(angle) * (radius * 0.65) + building.height * 0.2,
  );
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
   *    same mistake the camera-focus callers made.
   *  - the only dispersion was `((seed % 7) - 3) * 6` from a hash of the entity id: **seven** possible
   *    x positions in a ±18 px band, an **identical y for everyone**, and past seven workers the hash
   *    collides so two settlers stand on the exact same pixel.
   *
   * The slot now comes from the list that owns the crew (`building.occupants`, with the `?? []` its
   * other save-boundary readers use), and the row is centred on the footprint. Deterministic — no RNG,
   * so the same world and crew always give the same positions.
   */
  const crew = building.occupants ?? [];
  // A Prison's row holds its *guards*, but the only list the building carries is `occupants` — guards
  // ∪ prisoners (`workforce.syncJobBuildingOccupants`). Folding the occupant index into the post count
  // keeps the row the width of the posts, which is what the presence check can see: `prisonGuardDuty`
  // samples within 55 px of the centre and this row stands 33 px south of it, leaving 44 px sideways.
  // Five posts span ±32 px and fit; the nine occupants they were spread across spanned ±64 px and did
  // not, so a guard on his post could read as away from it.
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

export function commuteDistanceToBuilding(
  entity: Entity,
  building: Building,
  arrivingHome: boolean,
): number {
  const target = humanBuildingTarget(building, entity.id, arrivingHome);
  return Math.hypot(target.x - entity.x, target.y - entity.y);
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
  const startTileX = Math.floor(startX / PATH_CELL);
  const startTileY = Math.floor(startY / PATH_CELL);
  const targetTileX = Math.floor(targetX / PATH_CELL);
  const targetTileY = Math.floor(targetY / PATH_CELL);
  return `c_${buildingId}_${arrivingHome ? 'h' : 'w'}_${startTileX}_${startTileY}_${targetTileX}_${targetTileY}`;
}

const STUCK_WALK_RECOVERY_TICKS = 12;
const STUCK_WALK_MIN_PROGRESS_PX = 0.05;
const stuckWalkers = new WeakMap<Entity, { x: number; y: number; ticks: number }>();

/**
 * Applies one tick's walk step, refusing the tiles the path grid blocks.
 *
 * Every walk ends here, which is where "a wall is solid and water is not ground" has to hold: the
 * steerers only set a velocity, and none of them is obliged to check what it points into. A step
 * into a blocked tile becomes its axis-separated halves, so a walker pressed against a wall or bank
 * slides along its face instead of passing through it or stopping dead in the open.
 *
 * Velocity is left exactly as the steering owner set it — this only decides how far of it is walked,
 * because the blend the caller reads back (`vx`/`vy` after the tick) is that owner's contract.
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
  if (isWalkStepAllowed(entity.x, entity.y, entity.x + stepX, entity.y + stepY)) {
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
  // Recalculate a stale route early; don't let a blocked waypoint hold a commuter
  // stationary until the emergency stand-point relocation after twelve ticks.
  if (ticks === 3) invalidateCommutePathsForWalker(entity.id);
  if (ticks < STUCK_WALK_RECOVERY_TICKS) return;

  const tileX = Math.floor(entity.x / PATH_CELL);
  const tileY = Math.floor(entity.y / PATH_CELL);
  const directionX = Math.sign(stepX);
  const directionY = Math.sign(stepY);
  const recoveryOffsets: readonly (readonly [number, number])[] = [
    [-directionX, -directionY],
    [-directionX, 0],
    [0, -directionY],
    ...STAND_POINT_FALLBACK_OFFSETS,
  ];
  for (let ring = 1; ring <= 3; ring++) {
    for (const [dx, dy] of recoveryOffsets) {
      if (dx === 0 && dy === 0) continue;
      const recoveryX = (tileX + dx * ring + 0.5) * PATH_CELL;
      const recoveryY = (tileY + dy * ring + 0.5) * PATH_CELL;
      if (!isGroundWalkableAt(recoveryX, recoveryY)) continue;
      entity.x = recoveryX;
      entity.y = recoveryY;
      entity.vx = 0;
      entity.vy = 0;
      stuckWalkers.delete(entity);
      return;
    }
  }
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

  const moveSpeed = commuteWalkSpeed(speed, rush);

  // The path owner is asked at **every** distance. This used to run only beyond LONG_RANGE_DIST
  // (50 px), so a shorter leg — and the last 50 px of every leg — steered straight at the target,
  // straight across a river or a wall. `steerWithPath` answers 'direct' when the line is clear,
  // which is what leaves the direct and pathed movement on the same integration path.
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

  if (dist > COMMUTE_CONFIG.LONG_RANGE_DIST) {
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
  MAX_COMMUTE_SPEED_MULTIPLIER,
  WORK_COMMUTE_RUSH,
  commuteWalkSpeed,
  commuteLeadHoursFor,
  isWithinAssignableCommute,
} from '../commuteReach';
