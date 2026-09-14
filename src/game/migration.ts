/**
 * The Passing Herds — a seasonal deer migration.
 *
 * Every autumn a herd of deer crosses the valley: they graze (real grazing
 * pressure), they are huntable (real meat), and they leave after a week.
 * The herds remember — every deer lost this year (hunted or taken by wolves,
 * starvation or old age) makes next year's herd smaller. Feast on the passing
 * herds and the valley grows emptier; let them pass and next autumn brings them
 * back, fat as ever.
 */
import type { Entity, WorldState } from './gameTypes';
import { EntityType } from './gameTypes';
import { DAYS_PER_YEAR, getAbsoluteCalendarDay } from './dayCycle';
import { createEntity } from './entityFactory';
import { SPECIES_CONFIG } from './speciesConfig';
import { addBigNews, addNotification } from './simEffects';
import { logEvent } from './eventLog';
import { getSimRng } from './simRng';
import { indexLivingEntity, unindexEntityFromState } from './entityIndex';
import { isPassableWildlifePosition, spawnWildlifeRing } from './worldGen';

export const MIGRATION_WINDOW_DAYS = 7;
export const HERD_BASE_SIZE = 10;
export const HERD_MIN_SIZE = 4;
export const HERD_MAX_SIZE = 16;

/**
 * The day-in-year the herd arrives (deterministic per map seed, late autumn
 * before winter, so grazing happens on the season's last growth).
 */
export function migrationArrivalDay(seed: number | undefined): number {
  const s = typeof seed === 'number' ? seed : 1;
  return 240 + ((s * 2654435761) >>> 0) % 20; // 240..259 of 360
}

function isMigratedHerdDeer(e: Entity, herdYear: number): boolean {
  return e.type === EntityType.Deer && e.migrationTag === herdYear;
}

/** How far inland a herd deer may be nudged to find passable ground. */
const HERD_SPAWN_NUDGE_STEP = 12;
const HERD_SPAWN_MAX_NUDGE = 300;

/**
 * Nearest passable point to a herd's edge arrival point: the nominal point
 * first, then successive steps inland off that edge. Returns null when the
 * whole strip is blocked. Passability is the shared wildlife predicate, so
 * herds obey the same `UNPASSABLE_WILDLIFE_TERRAIN` rule as every other spawn
 * path (deep/shallow water, river and bank, mountains, snow).
 */
function findPassableHerdSpawn(
  state: WorldState,
  x: number,
  y: number,
  inwardX: number,
  inwardY: number,
): { x: number; y: number } | null {
  for (let dist = 0; dist <= HERD_SPAWN_MAX_NUDGE; dist += HERD_SPAWN_NUDGE_STEP) {
    const px = x + inwardX * dist;
    const py = y + inwardY * dist;
    if (isPassableWildlifePosition(state, px, py, 8)) return { x: px, y: py };
  }
  return null;
}

function spawnHerdAtEdge(state: WorldState, out: Entity[], count: number, herdYear: number): void {
  const { width, height } = state;
  const edge = Math.floor(getSimRng('migration')() * 4);
  // Arrival point on the chosen edge, plus the direction "into the valley".
  let edgeX = width / 2;
  let edgeY = 40;
  let inwardX = 0;
  let inwardY = 1;
  if (edge === 0) { edgeX = 40; edgeY = height / 2; inwardX = 1; inwardY = 0; }
  else if (edge === 1) { edgeX = width - 40; edgeY = height / 2; inwardX = -1; inwardY = 0; }
  else if (edge === 2) { edgeX = width / 2; edgeY = 40; inwardX = 0; inwardY = 1; }
  else { edgeX = width / 2; edgeY = height - 40; inwardX = 0; inwardY = -1; }

  let unplaced = 0;
  for (let i = 0; i < count; i++) {
    const spread = (i - (count - 1) / 2) * 30;
    // Spread along the edge, i.e. perpendicular to the inward direction.
    const x = edgeX + (inwardX === 0 ? spread : 0);
    const y = edgeY + (inwardY === 0 ? spread : 0);

    const spot = findPassableHerdSpawn(state, x, y, inwardX, inwardY);
    if (!spot) {
      unplaced++;
      continue;
    }
    const deer = createEntity(
      EntityType.Deer,
      spot.x,
      spot.y,
      state.nextEntityId++,
      SPECIES_CONFIG[EntityType.Deer].spawnEnergy,
    );
    deer.migrationTag = herdYear;
    // BUG-12: gameTick replaces state.entities with allAlive after the daily layer —
    // pushing into state.entities would discard the herd on arrival.
    out.push(deer);
    // Herd deer follow the same spawn contract as every other wildlife spawn: the canonical
    // entity-id index must know about them, or same-tick lookups (`entityById`) cannot see them.
    indexLivingEntity(state, deer);
  }

  // A fully blocked edge strip (long coastline, mountain wall) would otherwise
  // drop herd members: fall back to the shared passability-retry ring spawner.
  if (unplaced > 0) {
    spawnWildlifeRing(state, EntityType.Deer, edgeX, edgeY, unplaced, 40, 120, {
      onSpawn: (deer) => {
        deer.migrationTag = herdYear;
        out.push(deer);
        // `spawnWildlifeRing` only indexes its own spawns when no `onSpawn` hook is given,
        // so the herd path indexes the deer itself (same contract as the placed loop above).
        indexLivingEntity(state, deer);
      },
    });
  }
}

/**
 * Daily migration step: arrive on the autumn window, depart at its end and
 * remember how many deer the herd lost. Call once per calendar day (tickLayerDaily).
 */
export function tickMigration(state: WorldState, allAlive: Entity[]): void {
  const day = getAbsoluteCalendarDay(state.tick);
  const dayInYear = day % DAYS_PER_YEAR;
  const year = Math.floor(day / DAYS_PER_YEAR);
  const active = state.activeMigration;

  // Departure: the herd leaves, and the valley remembers how many it lost.
  if (active && day >= active.endDay) {
    const herd = state.entities.filter((e) => isMigratedHerdDeer(e, active.herdYear));
    const alive = herd.filter((e) => e.alive).length;
    for (const e of herd) {
      e.alive = false;
      // The canonical id index only holds living entities; the departing deer are indexed on
      // spawn, so they must leave the index with the rest of the herd.
      unindexEntityFromState(state, e.id);
      const idx = state.entities.indexOf(e);
      if (idx >= 0) state.entities.splice(idx, 1);
    }
    // Every missing herd deer is a loss, whatever killed it. The kill site does not record a
    // cause (wolves, starvation, old age and the player's hunters all kill through the same
    // wildlife-death transition), so the memory and the wording count losses, not hunts.
    const lost = active.spawned - alive;
    if (lost > 0) {
      const base = state.migrationNextHerdSize ?? HERD_BASE_SIZE;
      state.migrationNextHerdSize = Math.max(HERD_MIN_SIZE, Math.min(HERD_MAX_SIZE, base - lost));
      addBigNews(state, '🦌 The herds remember', `${lost} deer were lost from the passing herd — next autumn will bring fewer.`, 'negative');
      logEvent(state, 'event', `Autumn migration: ${lost} herd deer lost from the passing herd; next herd ${state.migrationNextHerdSize}.`);
    } else {
      addNotification(state, '🦌 The herds moved on', 'The deer passed through unharmed — they will remember this valley.', 'success');
      logEvent(state, 'event', 'Autumn migration: the herds passed through unharmed.');
    }
    state.activeMigration = undefined;
    return;
  }

  // Arrival: no active herd + it is the arrival day for this seed → the herd comes.
  if (!active && dayInYear === migrationArrivalDay(state.worldMap?.seed)) {
    const count = state.migrationNextHerdSize ?? HERD_BASE_SIZE;
    spawnHerdAtEdge(state, allAlive, count, year);
    state.activeMigration = { herdYear: year, endDay: day + MIGRATION_WINDOW_DAYS, spawned: count };
    addBigNews(
      state,
      '🦌 The autumn herds arrive',
      `A herd of ${count} deer crosses the valley, fat on autumn grass. Hunt them for meat — or let them pass.`,
      'neutral',
    );
    logEvent(state, 'event', `Autumn migration: a herd of ${count} deer arrived.`);
  }
}
