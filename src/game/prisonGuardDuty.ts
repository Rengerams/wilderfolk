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
import { ensureEntityByIdMap } from './entityIndex';
import { logEvent } from './eventLog';
import { addFloatingText } from './simEffects';
import { Prison, Time } from './gameConstants';
import { getSimRng, randomBool, randomChoice } from './simRng';

/** Domain-isolated RNG stream: deterministic per run seed, separate from other systems. */
const RNG_OWNER = 'prison-guard-duty';

function heldPrisoners(state: WorldState, prisonId: number): Entity[] {
  const out: Entity[] = [];
  for (const e of state.entities) {
    if (e.alive && e.prisonBuildingId === prisonId && isPlayerHuman(e)) out.push(e);
  }
  return out;
}

function countGuardsOnDuty(state: WorldState, occupants: number[]): number {
  // The canonical id → living-entity map, not `state.entities.find(…)` per occupant id: that scan
  // walked every living entity (grass and trees included) once per occupant. The original scan stays
  // as the map-miss fallback (`hotelStay`'s precedent), so a caller holding an unindexed entity is
  // answered exactly as before. The `alive` test is kept either way — the map can hold an entity
  // whose `alive` was cleared without unindexing (`buildingPlacementActions`).
  const entityById = ensureEntityByIdMap(state);
  let guards = 0;
  for (const id of occupants) {
    const occupant = entityById.get(id) ?? state.entities.find((e) => e.id === id);
    if (occupant?.alive && isPlayerHuman(occupant) && occupant.job === 'prison_guard') {
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
    const coverageHours = Math.min(Time.HOURS_PER_DAY, guards * Prison.GUARD_SHIFT_HOURS);
    const unguardedHours = Time.HOURS_PER_DAY - coverageHours;
    if (unguardedHours <= 0) continue;

    // One escape attempt per unguarded hour; a success frees a single prisoner.
    const rng = getSimRng(RNG_OWNER);
    for (let hour = 0; hour < unguardedHours; hour++) {
      if (!randomBool(rng, Prison.ESCAPE_CHANCE_PER_UNGUARDED_HOUR)) continue;
      const escapee = randomChoice(rng, prisoners);
      if (!escapee) break;
      escapee.prisonBuildingId = undefined;
      escapee.prisonerUntilTick = undefined;
      escapee.prisonSentenceCrime = undefined;
      // Release clears the ownership field, so the prison's occupant list must
      // drop the id in the same step — the §5 invariant is "an occupant is a
      // prisoner (prisonBuildingId) or a guard (homeBuildingId)", and the next
      // assign pulse is up to 18 ticks away.
      prison.occupants = (prison.occupants ?? []).filter((id) => id !== escapee.id);
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