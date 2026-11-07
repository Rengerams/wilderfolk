/**
 * Post-taming animal care: each tamed animal consumes 15% of a human's daily food (0.45/day).
 * Status steps fed → warning → shortage → fed when rations resume.
 */
import type { WorldState } from './gameTypes';
import { EntityType } from './gameTypes';
import { getColonyDay } from './dayCycle';
import { addNotification } from './simEffects';
import { spendFood } from './economyLedger';
import { ensureEntityByIdMap } from './entityIndex';
import { Human, Animal } from './gameConstants';
import { isPlayerHuman } from './playerHuman';
import { adjustHumanStaminaFromEnergy } from './simulation/humanPhysiology';

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

/** Daily ration for a tamed animal, derived from authoritative diet settings. */
const ANIMAL_DAILY_FOOD = Human.DAILY_FOOD_CONSUMPTION * Animal.FOOD_RATIO_OF_HUMAN;
/** Energy restored to a tamed animal's owner each fed day (per animal). */
export const TAMED_ANIMAL_OWNER_ENERGY_BONUS = 8;

export function countTamedAnimals(state: WorldState): number {
  // A pet is a living animal with an owner, full stop: removal of the owner clears `tamedBy` at
  // `reconcileFamilyReferencesAfterRemoval`, which makes the animal wild and huntable again.
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
 * True when the colony provided today's tamed-animal ration. When false, tamed predators may hunt
 * for themselves instead of relying on the pantry.
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
    // A fed pet gives its owner a small daily energy lift. The canonical id → living-entity map is
    // read first, with the entity scan kept as fallback for unindexed spawns.
    const entityById = ensureEntityByIdMap(state);
    for (const animal of state.entities) {
      if (!animal.alive || animal.tamedBy == null) continue;
      const owner =
        entityById.get(animal.tamedBy) ??
        state.entities.find((h) => h.alive && h.type === EntityType.Human && h.id === animal.tamedBy);
      if (owner?.alive && owner.type === EntityType.Human) {
        if (isPlayerHuman(owner)) {
          adjustHumanStaminaFromEnergy(owner, TAMED_ANIMAL_OWNER_ENERGY_BONUS);
        } else {
          // Preserve legacy energy semantics for foreign owners.
          owner.energy = Math.min(owner.maxEnergy, owner.energy + TAMED_ANIMAL_OWNER_ENERGY_BONUS);
        }
      }
    }
    return;
  }

  if (!alreadyFedToday) {
    const warningDay = state.storyFlags?.[FLAG_WARNING_DAY] ?? -1;
    // `FLAG_SHORTAGE_DAY` records an announced shortage, so the warning fires once per episode;
    // the fed branch clears both markers.
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