import type { Building, Entity, WorldState } from '../gameTypes';
import { EntityType } from '../gameTypes';
import { getValleyHuntYieldMultiplier } from '../ecologyStage';
import { getHuntFoodMultiplier } from '../combat';
import { traitMultiplier } from '../settlerTraits';
import {
  prefersHomeTonight,
  hasResidenceAssignment,
  isStartOfClockHour,
  killHuman,
} from '../dayCycle';
import { createDeathParticles } from '../simEffects';
import { logDeath } from '../eventLog';
import { formatCitizenName, formatDeathLog } from '../citizenId';
import { recordFoodConsumed } from '../economyLedger';
import { isPlayerHuman } from '../playerHuman';
import type { SpeciesConfig } from '../speciesConfig';
import { Human } from '../gameConstants';

export const MEAL_CHECK_INTERVAL_HOURS = Human.MEAL_CHECK_INTERVAL_HOURS;
export const HUNGER_MEAL_THRESHOLD = Human.HUNGER_MEAL_THRESHOLD;

const HUNT_BASE_YIELD: Partial<Record<EntityType, number>> = {
  [EntityType.Deer]: 52,
  [EntityType.Rabbit]: 22,
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

/**
 * The one colony-larder meal rule, shared by every human tick path.
 *
 * Drains one food and restores MEAL_ENERGY_RESTORE energy when all of these
 * hold: the eater is a player settler, the hour is a meal-check hour, the tick
 * starts a clock hour, the larder holds at least one food, and the eater is
 * below HUNGER_MEAL_THRESHOLD of max energy.
 *
 * Player-settler gating lives here on purpose: visitors, rivals, and trade
 * caravans must never drain the colony larder, whichever path reaches this rule.
 *
 * @returns true when a meal was actually eaten (callers use this to set their
 * own "ate this tick" flag), false when any gate refused it.
 */
export function tryEatColonyMeal(entity: Entity, state: WorldState, hourOfDay: number): boolean {
  if (!isPlayerHuman(entity)) return false;
  if (!isMealCheckHour(hourOfDay)) return false;
  if (!isStartOfClockHour(state.tick)) return false;
  if (state.resources.food < 1) return false;
  if (entity.energy >= entity.maxEnergy * HUNGER_MEAL_THRESHOLD) return false;

  state.resources.food -= 1;
  recordFoodConsumed(state, 'meals', 1);
  entity.energy = Math.min(entity.maxEnergy, entity.energy + Human.MEAL_ENERGY_RESTORE);
  return true;
}

/**
 * The one exhaustion-death sequence, shared by every human tick path: kill the
 * settler, spawn death particles at their position, and log the cause.
 *
 * The caller decides who may die of exhaustion; this function never gates on
 * player-settler status because its call sites intentionally differ.
 */
export function killFromExhaustion(
  entity: Entity,
  state: WorldState,
  buildings: Building[],
  entityById: Map<number, Entity>,
): void {
  killHuman(entity, buildings, entityById, state.tick);
  createDeathParticles(state, entity.x, entity.y, '#8B0000', 8);
  logDeath(
    state,
    formatDeathLog(entity, 'succumbed to exhaustion'),
    formatCitizenName(entity),
    { x: entity.x, y: entity.y },
  );
}

/** Returns the fractional component of a floating-point number. */
export function fract(value: number): number {
  return value - Math.floor(value);
}

/**
 * Calculates raw food yield harvested from a free-roam animal kill.
 * Modulated by colony tech and ecological stage multipliers.
 */
export function freeHuntFoodGain(preyType: EntityType, state: WorldState): number {
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
