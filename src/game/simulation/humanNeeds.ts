import type { Building, Entity, WorldState } from '../gameTypes';
import { EntityType } from '../gameTypes';
import { getValleyHuntYieldMultiplier } from '../ecologyStage';
import { getHuntFoodMultiplier } from '../combat';
import { isStartOfClockHour, killHuman } from '../dayCycle';
import { getAbsoluteCalendarDay } from '../dayCycleClock';
import { createDeathParticles } from '../simEffects';
import { logDeath } from '../eventLog';
import { formatCitizenName, formatDeathLog } from '../citizenId';
import { spendFood } from '../economyLedger';
import { resolveHumanNeedsIntent, creditHumanNutritionFromFood } from './humanPhysiology';
import { isPlayerHuman } from '../playerHuman';
import { Human } from '../gameConstants';

const HUNT_BASE_YIELD: Partial<Record<EntityType, number>> = {
  [EntityType.Deer]: 52,
  [EntityType.Wolf]: 45,
  [EntityType.Fox]: 28,
  [EntityType.Rabbit]: 22,
};
const HUNT_DEFAULT_BASE_YIELD = 18;

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
    // One ration per captive per calendar day, without player physiology.
    return hourOfDay === 8 && entity.warCaptive.lastRationDay !== getAbsoluteCalendarDay(state.tick);
  }
  return isPlayerHuman(entity) && resolveHumanNeedsIntent(entity, state.tick, false) === 'eat';
}

export function tryEatColonyMeal(entity: Entity, state: WorldState, hourOfDay: number): boolean {
  if (!canEatColonyMeal(state, entity, hourOfDay)) return false;
  const amount = spendFood(state, 'meals', Math.min(1, state.resources.food));
  if (amount <= 0) return false;
  if (entity.warCaptive && !isPlayerHuman(entity)) {
    entity.warCaptive.lastRationDay = getAbsoluteCalendarDay(state.tick);
    return true;
  }
  creditHumanNutritionFromFood(entity, amount);
  entity.needs!.lastMealTick = state.tick;
  return true;
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
