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
import { spendFood } from '../economyLedger';
import { resolveHumanNeedsIntent, creditHumanNutritionFromFood } from './humanPhysiology';
import { isPlayerHuman } from '../playerHuman';
import type { SpeciesConfig } from '../speciesConfig';
import { Human } from '../gameConstants';

const HUNT_BASE_YIELD: Partial<Record<EntityType, number>> = {
  [EntityType.Deer]: 52,
  [EntityType.Wolf]: 45,
  [EntityType.Fox]: 28,
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
  const normalizedHour = ((hourOfDay % 24) + 24) % 24;
  return normalizedHour % Human.MEAL_CHECK_INTERVAL_HOURS === 0;
}

/**
 * The one colony-larder meal rule, read without eating: every gate {@link tryEatColonyMeal}
 * applies before it drains a unit of food.
 */
export function canEatColonyMeal(state: WorldState, entity: Entity, hourOfDay: number): boolean {
  if (!entity.alive || state.resources.food <= 0) return false;
  if (!isStartOfClockHour(state.tick)) return false;
  if (entity.warCaptive && !isPlayerHuman(entity)) {
    return isMealCheckHour(hourOfDay) && entity.energy < entity.maxEnergy * Human.HUNGER_MEAL_THRESHOLD;
  }
  return isPlayerHuman(entity) && resolveHumanNeedsIntent(entity, state.tick, false) === 'eat';
}

export function tryEatColonyMeal(entity: Entity, state: WorldState, hourOfDay: number): boolean {
  if (!canEatColonyMeal(state, entity, hourOfDay)) return false;
  const amount = spendFood(state, 'meals', Math.min(1, state.resources.food));
  if (amount <= 0) return false;
  if (entity.warCaptive && !isPlayerHuman(entity)) {
    entity.energy = Math.min(entity.maxEnergy, entity.energy + Human.MEAL_ENERGY_RESTORE * amount);
    return true;
  }
  creditHumanNutritionFromFood(entity, amount);
  entity.needs!.lastMealTick = state.tick;
  return true;
}

export function killForeignCaptiveFromExhaustion(
  entity: Entity, state: WorldState, buildings: Building[], entityById: Map<number, Entity>,
): void {
  if (!entity.alive || !entity.warCaptive || isPlayerHuman(entity)) return;
  killHuman(entity, buildings, entityById, state.tick, state);
  createDeathParticles(state, entity.x, entity.y, '#8B0000', 8);
  logDeath(state, formatDeathLog(entity, 'succumbed to exhaustion'),
    formatCitizenName(entity), { x: entity.x, y: entity.y }, 'enemy');
}

export function killFromStarvation(
  entity: Entity, state: WorldState, buildings: Building[], entityById: Map<number, Entity>,
): void {
  if (!entity.alive) return;
  killHuman(entity, buildings, entityById, state.tick, state);
  createDeathParticles(state, entity.x, entity.y, '#8B0000', 8);
  logDeath(state, formatDeathLog(entity, 'died after prolonged starvation'),
    formatCitizenName(entity), { x: entity.x, y: entity.y }, 'player');
}

/** Returns the fractional component of a floating-point number. */
export function fract(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value - Math.floor(value);
}

/**
 * Calculates raw food yield harvested from a free-roam animal kill.
 * Modulated by colony tech and ecological stage multipliers.
 */
export function freeHuntFoodGain(preyType: EntityType, state: WorldState): number {
  const base = HUNT_BASE_YIELD[preyType] ?? HUNT_DEFAULT_BASE_YIELD;
  const techMult = getHuntFoodMultiplier(state) || 1;
  const ecoMult = getValleyHuntYieldMultiplier(state) || 1;
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
  const baseRate = config?.energyLossPerTick ?? 1.4;

  // 1. Base metabolism (clean water from well reduces physical strain)
  let loss = hasWell
    ? baseRate * ENERGY_MODIFIERS.WELL_REDUCTION
    : baseRate;

  // 2. Winter exposure (Greenthumb settlers resist freezing temperatures)
  if (isWinter && !canHeat) {
    const greenthumbMod = traitMultiplier(entity, 'greenthumb', ENERGY_MODIFIERS.GREENTHUMB_WINTER_RESISTANCE);
    loss *= ENERGY_MODIFIERS.UNHEATED_WINTER_PENALTY * greenthumbMod;
  }

  // 3. Resting near home during evening/night OR daytime recovery when weary/sick
  if (hasResidenceAssignment(entity) && buildingById) {
    const residence = buildingById.get(entity.residenceBuildingId!);
    if (residence && residence.completed && residence.faction !== 'rival') {
      const hdx = residence.x + residence.width / 2 - entity.x;
      const hdy = residence.y + residence.height / 2 - entity.y;
      
      const maxRestDist = Math.max(residence.width, residence.height) * 0.75 + 16;
      const isNearHome = hdx * hdx + hdy * hdy < maxRestDist * maxRestDist;
      
      // Grants resting bonus at night OR when resting at home due to low energy/sick days
      const isRestingPeriod =
        prefersHomeTonight(entity.id, tick, hourOfDay) ||
        entity.energy < entity.maxEnergy * 0.45;

      if (isNearHome && isRestingPeriod) {
        loss *= ENERGY_MODIFIERS.HOME_RESTING_REDUCTION;
      }
    }
  }

  // 4. Village healthcare infrastructure
  if (hasHospital) {
    loss *= ENERGY_MODIFIERS.HOSPITAL_REDUCTION;
  }

  // 5. Genetic settler traits
  loss *= traitMultiplier(entity, 'hardy', ENERGY_MODIFIERS.HARDY_TRAIT_REDUCTION);
  loss *= traitMultiplier(entity, 'fierce', ENERGY_MODIFIERS.FIERCE_TRAIT_REDUCTION);

  return Math.max(0, loss);
}
