/**
 * The Wildkin's chronicle lines — where the half-human creature is, at the three moments a player
 * can act on: its birth, the first time it comes near the settlement, and its death.
 *
 * Nothing here invents a naming scheme. A place is named from owners that already exist: the
 * biome cell the generator classified (`terrain/biomes`, the vocabulary the map is built from), the
 * nearest player building as the settlement anchor, and two plain distance bands. Everything goes
 * through `eventLog.logEvent`, the one chronicle writer.
 */
import { EntityType, type Entity, type WorldState } from './gameTypes';
import { BIOME_BY_IDX } from './terrain/biomes';
import { TERRAIN_CELL } from './terrain/terrainGrid';
import { isPlayerHuman } from './playerHuman';
import { logEvent } from './eventLog';

/**
 * How near the settlement the creature has to come before its arrival is chronicled, in world units.
 *
 * Four biome cells — measured, not chosen for flavour: the map is 256×192 wu at the default size,
 * and the Wildkin's `wanderRadius` is 90, so it holds to a patch several hundred units across. Under
 * this band it is at the settlement rather than roaming the wilds, which is the one moment worth a
 * line; a creature that never approaches is never announced.
 */
export const WILDKIN_SETTLEMENT_RANGE_WU = TERRAIN_CELL * 4;

/** The first completed player building stands in for "the settlement" — one anchor, not a centroid. */
function settlementAnchor(state: WorldState): { x: number; y: number } | null {
  for (let i = 0; i < state.buildings.length; i++) {
    const building = state.buildings[i];
    if (!building.completed || building.faction === 'rival') continue;
    return { x: building.x, y: building.y };
  }
  return null;
}

const COMPASS_SECTORS: readonly string[] = [
  'east', 'south-east', 'south', 'south-west',
  'west', 'north-west', 'north', 'north-east',
];

/** Plain compass sector from the anchor, eight ways, no invented place names. */
function compassSector(dx: number, dy: number): string {
  const degrees = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
  return COMPASS_SECTORS[Math.round(degrees / 45) % COMPASS_SECTORS.length];
}

/** The biome cell the generator classified at a world position, or `null` off-map / legacy map. */
export function biomeNameAt(state: WorldState, x: number, y: number): string | null {
  const map = state.worldMap;
  const cols = map?.cols;
  const rows = map?.rows;
  const terrain = map?.terrain;
  if (!map || !cols || !rows || !terrain) return null;
  const tx = Math.min(cols - 1, Math.max(0, Math.floor(x / TERRAIN_CELL)));
  const ty = Math.min(rows - 1, Math.max(0, Math.floor(y / TERRAIN_CELL)));
  return BIOME_BY_IDX[terrain[ty * cols + tx]]?.name ?? null;
}

/**
 * Where a Wildkin is, in words: its biome and how it lies from the settlement. Falls back to the
 * map's own centre when no completed player building exists to anchor on.
 */
export function describeWildkinPlace(state: WorldState, entity: Entity): string {
  const anchor = settlementAnchor(state);
  const fromX = anchor?.x ?? state.width / 2;
  const fromY = anchor?.y ?? state.height / 2;
  const distance = Math.hypot(entity.x - fromX, entity.y - fromY);
  const where = distance <= WILDKIN_SETTLEMENT_RANGE_WU
    ? 'at the settlement'
    : distance <= TERRAIN_CELL * 16
      ? 'near the settlement'
      : `out in the wilds to the ${compassSector(entity.x - fromX, entity.y - fromY)}`;
  const biome = biomeNameAt(state, entity.x, entity.y);
  return biome ? `${where}, in the ${biome}` : where;
}

/** Whether a living Wildkin has come inside the settlement band of any colony settler. */
export function isWildkinNearSettlement(state: WorldState, entity: Entity): boolean {
  for (let i = 0; i < state.entities.length; i++) {
    const settler = state.entities[i];
    if (!settler.alive || !isPlayerHuman(settler)) continue;
    if (Math.hypot(settler.x - entity.x, settler.y - entity.y) <= WILDKIN_SETTLEMENT_RANGE_WU) {
      return true;
    }
  }
  return false;
}

/**
 * Which Wildkin have already been announced, per world. Deliberately not a saved field: the flag
 * decides whether one line is written, so losing it to a reload can at worst repeat that line once.
 */
const announcedSightings = new WeakMap<WorldState, Set<number>>();

function hasAnnouncedSighting(state: WorldState, id: number): boolean {
  return announcedSightings.get(state)?.has(id) ?? false;
}

function markSightingAnnounced(state: WorldState, id: number): void {
  let seen = announcedSightings.get(state);
  if (!seen) {
    seen = new Set<number>();
    announcedSightings.set(state, seen);
  }
  seen.add(id);
}

/** Birth chronicle line for the human-mother path, carrying the place it was born. */
export function logWildkinBirth(state: WorldState, entity: Entity, motherName: string): void {
  const name = motherName || 'A settler';
  logEvent(
    state,
    'birth',
    `${name} gave birth to a Wildkin — half human — ${describeWildkinPlace(state, entity)}`,
    name,
  );
}

/**
 * Death chronicle line, carrying where it died. Not `logDeath`: that announces a settler's death to
 * the HUD, and this is not a settler. No age suffix either — `formatDeathAgeSuffix` reads human life
 * stages ("child" below 18), which would label a 4-year-old Wildkin a child.
 */
export function logWildkinDeath(state: WorldState, entity: Entity): void {
  logEvent(
    state,
    'death',
    `The Wildkin died — ${describeWildkinPlace(state, entity)}`,
    'A Wildkin',
  );
}

/**
 * One line the first day a Wildkin is at the settlement. Called from the daily layer, so it never
 * runs per tick and a creature that stays near the settlement is announced exactly once.
 */
export function tickWildkinChronicle(state: WorldState, ctx: { newEntities?: readonly Entity[] }): void {
  const candidates: readonly Entity[] = state.entities.concat(ctx.newEntities ?? []);
  for (let i = 0; i < candidates.length; i++) {
    const entity = candidates[i];
    if (entity.type !== EntityType.Wildkin || !entity.alive) continue;
    if (hasAnnouncedSighting(state, entity.id)) continue;
    if (!isWildkinNearSettlement(state, entity)) continue;
    markSightingAnnounced(state, entity.id);
    logEvent(
      state,
      'milestone',
      `A Wildkin was sighted ${describeWildkinPlace(state, entity)}`,
      'A Wildkin',
    );
  }
}
