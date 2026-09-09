/**
 * Prison guard duty (daily owner).
 *
 * Player design (2026-09-08): one staffed guard covers an 8-hour shift, so a
 * completed Prison needs 3 guards for full 24 h coverage. If the Prison holds
 * prisoners and coverage is below 24 h, each unguarded hour carries an escape
 * risk. v1 keeps it soft: an "escape" frees one prisoner early — the settler
 * stays in the colony (no removal/cleanup). Count-based, like animal care.
 */
import type { Entity, WorldState } from './gameTypes';
import { BuildingType } from './gameTypes';
import { isPlayerHuman } from './playerHuman';
import { logEvent } from './eventLog';
import { addFloatingText } from './simEffects';

/** One staffed guard covers an 8-hour shift. */
export const GUARD_SHIFT_HOURS = 8;
/** Guards needed for round-the-clock coverage (24 / 8). */
export const GUARDS_FOR_FULL_COVERAGE = 24 / GUARD_SHIFT_HOURS;
/** Escape chance per unguarded hour when a prisoner is held. */
export const ESCAPE_CHANCE_PER_UNGUARDED_HOUR = 0.05;

function heldPrisoners(state: WorldState, prisonId: number): Entity[] {
  const out: Entity[] = [];
  for (const e of state.entities) {
    if (e.alive && e.prisonBuildingId === prisonId && isPlayerHuman(e)) out.push(e);
  }
  return out;
}

function countGuardsOnDuty(state: WorldState, occupants: number[]): number {
  let guards = 0;
  for (const id of occupants) {
    const occupant = state.entities.find((e) => e.id === id);
    if (occupant && occupant.alive && isPlayerHuman(occupant) && occupant.job === 'prison_guard') {
      guards++;
    }
  }
  return guards;
}

/** Daily pulse — frees a held prisoner early if the guard post is understaffed. */
export function tickPrisonGuardDuty(state: WorldState): void {
  for (const prison of state.buildings) {
    if (prison.type !== BuildingType.Prison || !prison.completed || prison.faction === 'rival') {
      continue;
    }
    const prisoners = heldPrisoners(state, prison.id);
    if (prisoners.length === 0) continue;

    const guards = countGuardsOnDuty(state, prison.occupants ?? []);
    const coverageHours = Math.min(24, guards * GUARD_SHIFT_HOURS);
    const unguardedHours = 24 - coverageHours;
    if (unguardedHours <= 0) continue;

    // One escape attempt per unguarded hour; a success frees a single prisoner.
    for (let hour = 0; hour < unguardedHours; hour++) {
      if (Math.random() >= ESCAPE_CHANCE_PER_UNGUARDED_HOUR) continue;
      const escapee = prisoners[Math.floor(Math.random() * prisoners.length)];
      if (!escapee) break;
      escapee.prisonBuildingId = undefined;
      escapee.prisonerUntilTick = undefined;
      const cx = prison.x + prison.width / 2;
      const cy = prison.y + prison.height / 2;
      addFloatingText(state, cx, cy - 14, 'A prisoner slipped out!', '#f59e0b');
      logEvent(
        state,
        'event',
        `${escapee.name ?? 'A prisoner'} slipped out while the Prison was understaffed (${guards} guard${guards === 1 ? '' : 's'} for 24 h).`,
      );
      break;
    }
  }
}
