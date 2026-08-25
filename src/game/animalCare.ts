/**
 * A1 — Post-taming animal care (roadmap v0.6.3).
 * Bounded daily stewardship: each tamed animal consumes 10% of a human's
 * normal daily food consumption (2 food/day) = 0.2 food per animal per day.
 * Status transitions: fed → warning (low food) → shortage (no food) → fed.
 * Approved direction: the shared food stock represents a fish-capable ration.
 */
import type { WorldState } from './gameTypes';
import { getColonyDay } from './dayCycle';
import { addNotification } from './simEffects';

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

/** A player human eats 1 food per meal window, twice per day. */
export const HUMAN_DAILY_FOOD_CONSUMPTION = 2;
/** Tamed animals eat 10% of a human's normal daily consumption. */
export const ANIMAL_FOOD_RATIO_OF_HUMAN = 0.1;
export const ANIMAL_DAILY_FOOD = HUMAN_DAILY_FOOD_CONSUMPTION * ANIMAL_FOOD_RATIO_OF_HUMAN;

export function countTamedAnimals(state: WorldState): number {
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
    state.resources.food -= cost;
    state.storyFlags = {
      ...state.storyFlags,
      [FLAG_FED_DAY]: colonyDay,
      [FLAG_STATUS]: STATUS_CODES.fed,
    };
    if (previousStatus === 'shortage' || previousStatus === 'warning') {
      addNotification(state, '🐾 Animals fed again', 'The tamed animals are back on rations.', 'success');
    }
    return;
  }

  if (!alreadyFedToday) {
    const shortageDay = state.storyFlags?.[FLAG_SHORTAGE_DAY] ?? -1;
    const warningDay = state.storyFlags?.[FLAG_WARNING_DAY] ?? -1;
    if (shortageDay >= 0 && colonyDay - shortageDay >= 2) {
      state.storyFlags = {
        ...state.storyFlags,
        [FLAG_STATUS]: STATUS_CODES.shortage,
      };
      addNotification(state, '🐾 Animal shortage', 'Tamed animals are hungry — food is needed.', 'warning');
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
