/**
 * The Passing Herds — a seasonal deer migration.
 *
 * Every autumn a herd of deer crosses the valley: they graze (real grazing
 * pressure), they are huntable (real meat), and they leave after a week.
 * The herds remember — every deer taken this year makes next year's herd
 * smaller. Feast on the passing herds and the valley grows emptier; let them
 * pass and next autumn brings them back, fat as ever.
 */
import type { Entity, WorldState } from './gameTypes';
import { EntityType } from './gameTypes';
import { DAYS_PER_YEAR, getAbsoluteCalendarDay } from './dayCycle';
import { createEntity } from './entityFactory';
import { SPECIES_CONFIG } from './speciesConfig';
import { addBigNews, addNotification } from './simEffects';
import { logEvent } from './eventLog';

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

function spawnHerdAtEdge(state: WorldState, out: Entity[], count: number, herdYear: number): void {
  const { width, height } = state;
  const edge = Math.floor(Math.random() * 4);
  for (let i = 0; i < count; i++) {
    const spread = (i - (count - 1) / 2) * 30;
    let x: number;
    let y: number;
    if (edge === 0) { x = 40; y = height / 2 + spread; }
    else if (edge === 1) { x = width - 40; y = height / 2 + spread; }
    else if (edge === 2) { x = width / 2 + spread; y = 40; }
    else { x = width / 2 + spread; y = height - 40; }
    const deer = createEntity(
      EntityType.Deer,
      x,
      y,
      state.nextEntityId++,
      SPECIES_CONFIG[EntityType.Deer].spawnEnergy,
    );
    deer.migrationTag = herdYear;
    // BUG-12: gameTick replaces state.entities with allAlive after the daily layer —
    // pushing into state.entities would discard the herd on arrival.
    out.push(deer);
  }
}

/**
 * Daily migration step: arrive on the autumn window, depart at its end and
 * remember how many were taken. Call once per calendar day (tickLayerDaily).
 */
export function tickMigration(state: WorldState, allAlive: Entity[]): void {
  const day = getAbsoluteCalendarDay(state.tick);
  const dayInYear = day % DAYS_PER_YEAR;
  const year = Math.floor(day / DAYS_PER_YEAR);
  const active = state.activeMigration;

  // Departure: the herd leaves, and the valley remembers the hunt.
  if (active && day >= active.endDay) {
    const herd = state.entities.filter((e) => isMigratedHerdDeer(e, active.herdYear));
    const alive = herd.filter((e) => e.alive).length;
    for (const e of herd) {
      e.alive = false;
      const idx = state.entities.indexOf(e);
      if (idx >= 0) state.entities.splice(idx, 1);
    }
    const killed = active.spawned - alive;
    if (killed > 0) {
      const base = state.migrationNextHerdSize ?? HERD_BASE_SIZE;
      state.migrationNextHerdSize = Math.max(HERD_MIN_SIZE, Math.min(HERD_MAX_SIZE, base - killed));
      addBigNews(state, '🦌 The herds remember', `${killed} deer taken from the passing herd — next autumn will bring fewer.`, 'negative');
      logEvent(state, 'event', `Autumn migration: ${killed} herd deer hunted; next herd ${state.migrationNextHerdSize}.`);
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
