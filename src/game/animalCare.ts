/**
 * A1 — Post-taming animal care (roadmap v0.6.3).
 * Bounded daily stewardship: each tamed animal consumes 15% of a human's
 * normal daily food consumption (3 food/day) = 0.45 food per animal per day.
 * Status transitions: fed → warning (low food) → shortage (no food) → fed.
 * Approved direction: the shared food stock represents a fish-capable ration.
 */
import type { WorldState } from './gameTypes';
import { EntityType } from './gameTypes';
import { getColonyDay } from './dayCycle';
import { addNotification } from './simEffects';
import { spendFood } from './economyLedger';
import { ensureEntityByIdMap } from './entityIndex';
import { Human, Animal } from './gameConstants';

const FLAG_FED_DAY = 'animal_care_fed_day';
const FLAG_STATUS = 'animal_care_status';
const FLAG_WARNING_DAY = 'animal_care_warning_day';
const FLAG_SHORTAGE_DAY = 'animal_care_shortage_day';

export type AnimalCareStatus = 'fed' | 'warning' | 'shortage';

const STATUS_CODES: Record<AnimalCareStatus, number> = {
  fed: 1,
  warning: 2,
  shortage: 3,
};

/** A player human eats 1 food per meal window, up to several meals per day. */
export const HUMAN_DAILY_FOOD_CONSUMPTION = Human.DAILY_FOOD_CONSUMPTION;
/** Tamed animals eat 15% of a human's normal daily consumption. */
export const ANIMAL_FOOD_RATIO_OF_HUMAN = Animal.FOOD_RATIO_OF_HUMAN;
export const ANIMAL_DAILY_FOOD = HUMAN_DAILY_FOOD_CONSUMPTION * ANIMAL_FOOD_RATIO_OF_HUMAN;
/** Energy restored to a tamed animal's owner each fed day (per animal). */
export const TAMED_ANIMAL_OWNER_ENERGY_BONUS = 8;

export function countTamedAnimals(state: WorldState): number {
  // A pet is a living animal that has an owner, full stop. The audit's L2 defect — a pet whose
  // owner died stayed on the ration list forever and could never be hunted — is fixed where it
  // belongs, at the removal owner: `humanLifecycleCleanup.reconcileFamilyReferencesAfterRemoval`
  // clears the dead owner's `tamedBy`, which makes the animal wild and huntable again the moment
  // the owner is removed. Filtering on the owner's liveness here as well would instead leave a
  // stale link in place and hide the animal from the ration list while `isValidHuntPrey` still
  // refused it, i.e. an animal that is neither fed nor huntable.
  let count = 0;
  for (const e of state.entities) {
    if (e.alive && e.tamedBy != null) count++;
  }
  return count;
}

export function getAnimalCareStatus(state: WorldState): AnimalCareStatus {
  const code = state.storyFlags?.[FLAG_STATUS] ?? STATUS_CODES.fed;
  return code === STATUS_CODES.shortage ? 'shortage' : code === STATUS_CODES.warning ? 'warning' : 'fed';
}

/**
 * True when the colony provided today's tamed-animal ration, i.e. a pet is
 * being fed this colony day. When false, tamed predators are on their own and
 * may hunt to feed themselves rather than relying on the pantry.
 */
export function tamedAnimalsFedToday(state: WorldState): boolean {
  return (state.storyFlags?.[FLAG_FED_DAY] ?? -1) === getColonyDay(state);
}

/** Daily bounded care pulse — called after building production in tickLayerDaily. */
export function tickAnimalCare(state: WorldState): void {
  const tamed = countTamedAnimals(state);
  if (tamed === 0) return;

  const colonyDay = getColonyDay(state);
  const lastFedDay = state.storyFlags?.[FLAG_FED_DAY] ?? -1;
  const alreadyFedToday = lastFedDay === colonyDay;
  const previousStatus = getAnimalCareStatus(state);
  const cost = tamed * ANIMAL_DAILY_FOOD;

  if (!alreadyFedToday && state.resources.food >= cost) {
    spendFood(state, 'taming', cost);
    state.storyFlags = {
      ...state.storyFlags,
      [FLAG_FED_DAY]: colonyDay,
      [FLAG_STATUS]: STATUS_CODES.fed,
      [FLAG_WARNING_DAY]: -1,
      [FLAG_SHORTAGE_DAY]: -1,
    };
    if (previousStatus === 'shortage' || previousStatus === 'warning') {
      addNotification(state, '🐾 Animals fed again', 'The tamed animals are back on rations.', 'success');
    }
    // Tamed animals are not just a food sink — a fed pet gives its owner a
    // small daily energy lift so taming has a real gameplay benefit.
    //
    // The owner is looked up in the canonical id → living-entity map instead of
    // `state.entities.find(…)`: the previous form walked every living entity (grass and trees
    // included) once per tamed animal, inside a loop that was already walking all of them. The
    // original scan is kept as the map-miss fallback (the `hotelStay` precedent): every production
    // spawn is indexed, but a caller that pushes an entity straight into `state.entities` is still
    // answered the old way rather than silently skipped.
    const entityById = ensureEntityByIdMap(state);
    for (const animal of state.entities) {
      if (!animal.alive || animal.tamedBy == null) continue;
      const owner =
        entityById.get(animal.tamedBy) ??
        state.entities.find((h) => h.alive && h.type === EntityType.Human && h.id === animal.tamedBy);
      if (owner?.alive && owner.type === EntityType.Human) {
        owner.energy = Math.min(owner.maxEnergy, owner.energy + TAMED_ANIMAL_OWNER_ENERGY_BONUS);
      }
    }
    return;
  }

  if (!alreadyFedToday) {
    const warningDay = state.storyFlags?.[FLAG_WARNING_DAY] ?? -1;
    // `FLAG_SHORTAGE_DAY` records that the shortage has already been announced (it was written
    // but never read), so the warning fires once per shortage episode instead of every day the
    // animals stay unfed. The fed branch above clears both markers.
    const shortageAlreadyAnnounced = (state.storyFlags?.[FLAG_SHORTAGE_DAY] ?? -1) >= 0;
    if (warningDay >= 0 && colonyDay - warningDay >= 2) {
      // Two consecutive days without food → shortage.
      state.storyFlags = {
        ...state.storyFlags,
        [FLAG_SHORTAGE_DAY]: colonyDay,
        [FLAG_STATUS]: STATUS_CODES.shortage,
      };
      if (!shortageAlreadyAnnounced) {
        addNotification(state, '🐾 Animal shortage', 'Tamed animals are hungry — food is needed.', 'warning');
      }
    } else if (warningDay < 0) {
      state.storyFlags = {
        ...state.storyFlags,
        [FLAG_WARNING_DAY]: colonyDay,
        [FLAG_STATUS]: STATUS_CODES.warning,
      };
      addNotification(state, '🐾 Animal rations low', 'No food ration available for tamed animals today.', 'warning');
    }
  }
}