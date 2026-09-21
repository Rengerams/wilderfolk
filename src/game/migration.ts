
import type { Entity, WorldState } from './gameTypes';
import { EntityType } from './gameTypes';
import { DAYS_PER_YEAR, getAbsoluteCalendarDay } from './dayCycle';
import { createEntity } from './entityFactory';
import { SPECIES_CONFIG } from './speciesConfig';
import { addBigNews } from './simEffects';
import { logEvent } from './eventLog';
import { getSimRng } from './simRng';
import { indexLivingEntity, unindexEntityFromState } from './entityIndex';
import type { TickContext } from './simulation/simulationTypes';
import { pushNewEntity } from './simulation/simulationEntities';
import { isPassableWildlifePosition, spawnWildlifeRing } from './worldGen';

export const MIGRATION_WINDOW_DAYS = 7;
export const HERD_BASE_SIZE = 10;
export const HERD_MIN_SIZE = 4;
export const HERD_MAX_SIZE = 16;

/**
 * The day-in-year the herd arrives (deterministic per map seed, late autumn
 * before winter, so grazing happens on the season's last growth).
 */
export function migrationArrivalDay(seed: number | undefined, daysPerYear = DAYS_PER_YEAR): number {
  const s = typeof seed === 'number' ? seed : 1;
  const baseDay = Math.floor(daysPerYear * (240 / 360));
  const variance = Math.max(1, Math.floor(daysPerYear * (20 / 360)));
  return baseDay + (((s * 2654435761) >>> 0) % variance);
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

/**
 * Register a herd deer on every same-tick bookkeeping path.
 *
 * The daily layer runs *after* `gameTick` snapshots the living entities and *before* it assigns
 * `state.entities = allAlive`, so `state.entities` is not the list the tick ends with. Routing the
 * spawn through the canonical `pushNewEntity` is what makes the deer visible to `ctx.newEntities`
 * (the worker delta) and to `ctx.mobileGrid` in the tick they arrive — the same repair the daily
 * immigrant path took (`dailyPopulation.ts`).
 *
 * `ctx` is optional only for direct owner-level callers that drive the herd without a tick context
 * (tests). Without it the spawn falls back to the entity list and the id index, which is the
 * pre-existing behaviour.
 */
function registerHerdDeer(state: WorldState, ctx: TickContext | undefined, deer: Entity): void {
  if (!state.entities.includes(deer)) {
    state.entities.push(deer);
  }
  indexLivingEntity(state, deer);
  if (ctx) pushNewEntity(state, ctx, deer);
}

function spawnHerdAtEdge(
  state: WorldState,
  out: Entity[],
  count: number,
  herdYear: number,
  ctx?: TickContext,
): void {
  const { width, height } = state;
  const edge = Math.floor(getSimRng('migration')() * 4);
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
    out.push(deer);
    registerHerdDeer(state, ctx, deer);
  }

  // A fully blocked edge strip falls back to the shared passability-retry ring spawner
  if (unplaced > 0) {
    spawnWildlifeRing(state, EntityType.Deer, edgeX, edgeY, unplaced, 40, 120, {
      onSpawn: (deer) => {
        deer.migrationTag = herdYear;
        out.push(deer);
        registerHerdDeer(state, ctx, deer);
      },
    });
  }
}

/**
 * Daily migration step: arrive on the autumn window, depart at its end and
 * remember how many deer the herd lost. Call once per calendar day (tickLayerDaily).
 *
 * `ctx` carries the tick's spawn bookkeeping (newEntities + spatial grids). It is optional so
 * owner-level callers without a tick context keep working; the daily layer always passes it.
 */
export function tickMigration(state: WorldState, allAlive: Entity[], ctx?: TickContext): void {
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
      unindexEntityFromState(state, e.id);
      const idx = state.entities.indexOf(e);
      if (idx >= 0) state.entities.splice(idx, 1);
      const aliveIdx = allAlive.indexOf(e);
      if (aliveIdx >= 0) allAlive.splice(aliveIdx, 1);
    }

    const lost = active.spawned - alive;
    if (lost > 0) {
      const base = state.migrationNextHerdSize ?? HERD_BASE_SIZE;
      state.migrationNextHerdSize = Math.max(HERD_MIN_SIZE, Math.min(HERD_MAX_SIZE, base - lost));
      addBigNews(
        state,
        '🦌 The herds remember',
        `${lost} deer were lost from the passing herd — next autumn will bring fewer (next herd: ${state.migrationNextHerdSize}).`,
        'negative',
      );
      logEvent(state, 'event', `Autumn migration: ${lost} herd deer lost from the passing herd; next herd ${state.migrationNextHerdSize}.`);
    }
    state.activeMigration = undefined;
    return;
  }

  // Arrival: no active herd + it is the arrival day for this seed → the herd comes.
  if (!active && dayInYear === migrationArrivalDay(state.worldMap?.seed, DAYS_PER_YEAR)) {
    const count = state.migrationNextHerdSize ?? HERD_BASE_SIZE;
    spawnHerdAtEdge(state, allAlive, count, year, ctx);
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