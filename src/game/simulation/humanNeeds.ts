import type { Building, Entity, WorldState } from '../gameTypes';
import { EntityType } from '../gameTypes';
import { getValleyHuntYieldMultiplier } from '../ecologyStage';
import { getHuntFoodMultiplier } from '../combat';
import { traitMultiplier } from '../settlerTraits';
import { prefersHomeTonight, hasResidenceAssignment } from '../dayCycle';
import type { SpeciesConfig } from '../speciesConfig';

export const MEAL_CHECK_INTERVAL_HOURS = 4;
export const HUNGER_MEAL_THRESHOLD = 0.9;

const HUNT_BASE_YIELD: Partial<Record<EntityType, number>> = {
  [EntityType.Deer]: 52,
  // @ts-ignore - magic number for rabbit yield\n  // @ts-ignore - magic number representing rabbit yield\n  [2]: 22,
};
const HUNT_DEFAULT_BASE_YIELD = 18;

const ENERGY_MODIFIERS = {
  WELL_REDUCTION: 0.8,
  UNHEATED_WINTER_PENALTY: 1.5,
  GREENTHUMB_WINTER_RESISTANCE: 0.7,
  HOME_RESTING_REDUCTION: 0.5,
  HOSPITAL_REDUCTION: 0.9,
  HARDY_TRAIT_REDUCTION: 0.85,
  FIERCE_TRAIT_REDUCTION: 0.9,
} as const;

/** Evaluates whether the current clock hour is a scheduled meal check (00:00, 04:00, 08:00, etc.). */
export function isMealCheckHour(hourOfDay: number): boolean {
  return hourOfDay % MEAL_CHECK_INTERVAL_HOURS === 0;
}

/** Returns the fractional component of a floating-point number. */
export function fract(value: number): number {
  return value - Math.floor(value);
}

/**
 * Calculates raw food yield harvested from a free-roam animal kill.
 * Modulated by colony tech and ecological stage multipliers.
 */
function freeHuntFoodGain(preyType: EntityType, state: WorldState): number {
  const base = HUNT_BASE_YIELD[preyType] ?? HUNT_DEFAULT_BASE_YIELD;
  const techMult = getHuntFoodMultiplier(state);
  const ecoMult = getValleyHuntYieldMultiplier(state);
  return Math.max(1, Math.round(base * techMult * ecoMult));
}

export interface HumanEnergyLossOptions {
  hasWell: boolean;
  isWinter: boolean;
  canHeat: boolean;
  hasHospital: boolean;
  tick: number;
  hourOfDay: number;
  buildingById: Map<number, Building>;
}

/**
 * Calculates net energy drain for a settler on the current simulation tick.
 * Evaluates: base metabolism, well access, unheated winter cold, home resting proximity,
 * hospital care, and genetic traits ('greenthumb', 'hardy', 'fierce').
 */
export function humanEnergyLoss(
  entity: Entity,
  config: SpeciesConfig,
  opts: HumanEnergyLossOptions,
): number {
  const { hasWell, isWinter, canHeat, hasHospital, tick, hourOfDay, buildingById } = opts;

  // 1. Base metabolism (clean water from well reduces strain)
  let loss = hasWell
    ? config.energyLossPerTick * ENERGY_MODIFIERS.WELL_REDUCTION
    : config.energyLossPerTick;

  // 2. Winter exposure (Greenthumb settlers resist freezing temperatures)
  if (isWinter && !canHeat) {
    const greenthumbMod = traitMultiplier(entity, 'greenthumb', ENERGY_MODIFIERS.GREENTHUMB_WINTER_RESISTANCE);
    loss *= ENERGY_MODIFIERS.UNHEATED_WINTER_PENALTY * greenthumbMod;
  }

  // 3. Resting near home during evening/night or quiet periods
  if (
    hasResidenceAssignment(entity) &&
    prefersHomeTonight(entity.id, tick, hourOfDay)
  ) {
    const residence = buildingById.get(entity.residenceBuildingId!);
    if (residence && residence.completed) {
      const hdx = residence.x + residence.width / 2 - entity.x;
      const hdy = residence.y + residence.height / 2 - entity.y;
      
      // Radius accommodates homeStandPosition rings around the house
      const maxRestDist = Math.max(residence.width, residence.height) * 0.75 + 16;
      if (hdx * hdx + hdy * hdy < maxRestDist * maxRestDist) {
        loss *= ENERGY_MODIFIERS.HOME_RESTING_REDUCTION;
      }
    }
  }

  // 4. Village infrastructure & healthcare
  if (hasHospital) {
    loss *= ENERGY_MODIFIERS.HOSPITAL_REDUCTION;
  }

  // 5. Genetic settler traits
  loss *= traitMultiplier(entity, 'hardy', ENERGY_MODIFIERS.HARDY_TRAIT_REDUCTION);
  loss *= traitMultiplier(entity, 'fierce', ENERGY_MODIFIERS.FIERCE_TRAIT_REDUCTION);

  return Math.max(0, loss);
}
