/**
 * Prison guard duty.
 *
 * Two cadences: `tickPrisonPresence` samples every clock hour whether the shift's guard actually
 * stood on the post, and the daily `tickPrisonGuardDuty` rolls one escape chance per hour that nobody
 * did. An "escape" frees one prisoner early — the settler stays in the colony (no removal/cleanup).
 */
import type { Entity, WorldState } from './gameTypes';
import { BuildingType } from './gameTypes';
import { isPlayerHuman } from './playerHuman';
import { ensureEntityByIdMap } from './entityIndex';
import { logEvent } from './eventLog';
import { addFloatingText } from './simEffects';
import { Prison } from './gameConstants';
import { getHourOfDay, isStartOfClockHour } from './dayCycleClock';
import { isNearBuilding } from './simulation/humanRelationships';
import { getSimRng, randomBool, randomChoice } from './simRng';
import {
  PRISON_SHIFTS,
  prisonRoster,
  prisonShiftsAtHour,
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
 * The living entity for an id.
 *
 * Reads the canonical id → living-entity map and falls back to a scan, because the map can miss an
 * entity that was added without reindexing (`hotelStay`'s precedent). The `alive` test is kept either
 * way — the map can also hold an entity whose `alive` was cleared without unindexing.
 */
function livingById(
  state: WorldState,
  entityById: Map<number, Entity>,
  id: number,
): Entity | undefined {
  const found = entityById.get(id) ?? state.entities.find((e) => e.id === id);
  return found?.alive ? found : undefined;
}

export function prisonGuardIds(state: WorldState, occupants: number[]): number[] {
  const entityById = ensureEntityByIdMap(state);
  const ids: number[] = [];
  for (const id of occupants) {
    const occupant = livingById(state, entityById, id);
    if (occupant && isPlayerHuman(occupant) && occupant.job === 'prison_guard') ids.push(id);
  }
  return ids;
}

function describeVacancy(roster: readonly PrisonRosterEntry[]): string {
  const vacant = vacantPrisonShifts(roster);
  if (vacant.length === 1) return `no guard on the ${vacant[0].label.toLowerCase()} shift`;
  return `${vacant.length} of ${PRISON_SHIFTS.length} shifts unstaffed`;
}

/** Why the post was open: a shift with nobody on it, or a guard who was elsewhere. */
function describeOpenPost(roster: readonly PrisonRosterEntry[]): string {
  return vacantPrisonShifts(roster).length > 0
    ? describeVacancy(roster)
    : 'the guard on duty was away from the post';
}

/**
 * Hourly. Records each clock hour that a Prison holding a prisoner had nobody on the post — a vacant
 * shift and a guard asleep at home both count, and the hour is recorded once.
 */
export function tickPrisonPresence(state: WorldState): void {
  if (!isStartOfClockHour(state.tick)) return;
  const hour = getHourOfDay(state.tick);
  const shiftsNow = prisonShiftsAtHour(hour);
  if (shiftsNow.length === 0) return;

  const entityById = ensureEntityByIdMap(state);
  for (const prison of state.buildings) {
    if (prison.type !== BuildingType.Prison || !prison.completed || prison.faction === 'rival') continue;
    if (heldPrisoners(state, prison.id).length === 0) continue;

    const roster = prisonRoster(prisonGuardIds(state, prison.occupants ?? []), state.tick);
    for (const shift of shiftsNow) {
      const guardId = roster.find((row) => row.shift.key === shift.key)?.guardId;
      const guard = guardId == null ? undefined : livingById(state, entityById, guardId);
      if (guard && isNearBuilding(guard, prison)) continue;
      const hours = (prison.uncoveredPrisonHours ??= []);
      if (!hours.includes(hour)) hours.push(hour);
    }
  }
}

/** Daily pulse — one escape chance per hour of the day nobody stood on the post. */
export function tickPrisonGuardDuty(state: WorldState): void {
  for (const prison of state.buildings) {
    if (prison.type !== BuildingType.Prison || !prison.completed || prison.faction === 'rival') {
      continue;
    }
    const sampled = prison.uncoveredPrisonHours ?? [];
    // The day is spent: clear before rolling, so a roll that frees nobody is not retried tomorrow.
    prison.uncoveredPrisonHours = [];

    const prisoners = heldPrisoners(state, prison.id);
    if (prisoners.length === 0) continue;

    const roster = prisonRoster(prisonGuardIds(state, prison.occupants ?? []), state.tick);
    // A shift with no guard on it has nobody on the post by definition, so it needs no sampling; a
    // staffed shift counts only the hours the hourly sampler found it empty.
    const uncoveredHours = [...new Set([...unguardedPrisonHours(roster), ...sampled])]
      .sort((a, b) => a - b);
    if (uncoveredHours.length === 0) continue;

    const rng = getSimRng(RNG_OWNER);
    for (let i = 0; i < uncoveredHours.length; i++) {
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
        `${escapee.name ?? 'A prisoner'} slipped out while the Prison was unguarded (${describeOpenPost(roster)}).`,
      );
      break;
    }
  }
}
