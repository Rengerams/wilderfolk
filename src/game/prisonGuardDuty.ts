/**
 * Prison guard duty (daily owner).
 *
 * `prisonShifts.ts` owns who is on duty; this module frees a held prisoner early from the first
 * unguarded hour that lets one out. An "escape" frees one prisoner early — the settler stays in the
 * colony (no removal/cleanup). Count-based, like animal care.
 */
import type { Entity, WorldState } from './gameTypes';
import { BuildingType } from './gameTypes';
import { isPlayerHuman } from './playerHuman';
import { ensureEntityByIdMap } from './entityIndex';
import { logEvent } from './eventLog';
import { addFloatingText } from './simEffects';
import { Prison } from './gameConstants';
import { getSimRng, randomBool, randomChoice } from './simRng';
import {
  PRISON_SHIFTS,
  prisonRoster,
  unguardedPrisonHours,
  vacantPrisonShifts,
  type PrisonRosterEntry,
} from './prisonShifts';

/** Domain-isolated RNG stream: deterministic per run seed, separate from other systems. */
const RNG_OWNER = 'prison-guard-duty';

function heldPrisoners(state: WorldState, prisonId: number): Entity[] {
  const out: Entity[] = [];
  for (const e of state.entities) {
    if (e.alive && e.prisonBuildingId === prisonId && isPlayerHuman(e)) out.push(e);
  }
  return out;
}

/**
 * Living player-human guards among the prison's occupants.
 *
 * Reads the canonical id → living-entity map rather than scanning every living entity (grass and
 * trees included) once per occupant id; the original scan stays as the map-miss fallback
 * (`hotelStay`'s precedent). The `alive` test is kept either way — the map can hold an entity whose
 * `alive` was cleared without unindexing (`buildingPlacementActions`).
 */
function prisonGuardIds(state: WorldState, occupants: number[]): number[] {
  const entityById = ensureEntityByIdMap(state);
  const ids: number[] = [];
  for (const id of occupants) {
    const occupant = entityById.get(id) ?? state.entities.find((e) => e.id === id);
    if (occupant?.alive && isPlayerHuman(occupant) && occupant.job === 'prison_guard') ids.push(id);
  }
  return ids;
}

function describeVacancy(roster: readonly PrisonRosterEntry[]): string {
  const vacant = vacantPrisonShifts(roster);
  if (vacant.length === 1) return `no guard on the ${vacant[0].label.toLowerCase()} shift`;
  return `${vacant.length} of ${PRISON_SHIFTS.length} shifts unstaffed`;
}

/** Daily pulse — frees a held prisoner early if any hour of the day has no guard on it. */
export function tickPrisonGuardDuty(state: WorldState): void {
  for (const prison of state.buildings) {
    if (prison.type !== BuildingType.Prison || !prison.completed || prison.faction === 'rival') {
      continue;
    }
    const prisoners = heldPrisoners(state, prison.id);
    if (prisoners.length === 0) continue;

    const roster = prisonRoster(prisonGuardIds(state, prison.occupants ?? []), state.tick);
    const unguardedHours = unguardedPrisonHours(roster);
    if (unguardedHours.length === 0) continue;

    // One escape attempt per unguarded hour; a success frees a single prisoner.
    const rng = getSimRng(RNG_OWNER);
    for (let i = 0; i < unguardedHours.length; i++) {
      if (!randomBool(rng, Prison.ESCAPE_CHANCE_PER_UNGUARDED_HOUR)) continue;
      const escapee = randomChoice(rng, prisoners);
      if (!escapee) break;
      escapee.prisonBuildingId = undefined;
      escapee.prisonerUntilTick = undefined;
      escapee.prisonSentenceCrime = undefined;
      // Release clears the ownership field, so the prison's occupant list must drop the id in the same
      // step — the §5 invariant is "an occupant is a prisoner (prisonBuildingId) or a guard
      // (homeBuildingId)", and the next assign pulse is up to 18 ticks away.
      prison.occupants = (prison.occupants ?? []).filter((id) => id !== escapee.id);
      const cx = prison.x + prison.width / 2;
      const cy = prison.y + prison.height / 2;
      addFloatingText(state, cx, cy - 14, 'A prisoner slipped out!', '#f59e0b');
      logEvent(
        state,
        'event',
        `${escapee.name ?? 'A prisoner'} slipped out while the Prison was understaffed (${describeVacancy(roster)}).`,
      );
      break;
    }
  }
}
