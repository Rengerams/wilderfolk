import type { Entity, HumanNeedsState } from '../gameTypes';
import { TICKS_PER_HOUR } from '../dayCycleClock';

export const HUMAN_NEEDS = {
  NUTRITION_BASE_LOSS_PER_SIM_HOUR: 1.2,
  NUTRITION_WORK_EXTRA_PER_SIM_HOUR: 0.16,
  NUTRITION_WALK_EXTRA_PER_SIM_HOUR: 0.12,
  NUTRITION_RESTORED_PER_FOOD_UNIT: 10,
  EAT_ENTER_NUTRITION: 70,
  EAT_COOLDOWN_SIM_HOURS: 2,
  REST_LOSS_AWAKE_PER_SIM_HOUR: 4,
  REST_RECOVERY_SLEEP_PER_SIM_HOUR: 12,
  STAMINA_WORK_LOSS_PER_SIM_HOUR: 9,
  STAMINA_WALK_LOSS_PER_SIM_HOUR: 5,
  STAMINA_IDLE_RECOVERY_PER_SIM_HOUR: 5,
  STAMINA_SLEEP_RECOVERY_PER_SIM_HOUR: 13,
  REST_CRITICAL: 20,
  STAMINA_CRITICAL: 15,
  NUTRITION_STARVING: 8,
  STARVATION_FATAL_SIM_HOURS: 48,
} as const;

const bounded = (n: number, fallback: number): number =>
  Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : fallback;

export function initialHumanNeeds(energy: number, maxEnergy: number): HumanNeedsState {
  return { nutrition: 80, rest: 85, stamina: maxEnergy > 0 && Number.isFinite(maxEnergy)
    ? bounded(energy / maxEnergy * 100, 80) : 80, severeHungerTicks: 0 };
}

export function normalizeHumanNeeds(entity: Entity): HumanNeedsState {
  const fallback = initialHumanNeeds(entity.energy, entity.maxEnergy);
  const old = entity.needs;
  const result: HumanNeedsState = {
    nutrition: bounded(old?.nutrition ?? fallback.nutrition, fallback.nutrition),
    rest: bounded(old?.rest ?? fallback.rest, fallback.rest),
    stamina: bounded(old?.stamina ?? fallback.stamina, fallback.stamina),
    severeHungerTicks: Number.isFinite(old?.severeHungerTicks)
      ? Math.max(0, Math.floor(old!.severeHungerTicks!)) : 0,
  };
  if (typeof old?.lastMealTick === 'number' && Number.isSafeInteger(old.lastMealTick) && old.lastMealTick >= 0) result.lastMealTick = old.lastMealTick;
  if (typeof old?.lastAdvancedTick === 'number' && Number.isSafeInteger(old.lastAdvancedTick) && old.lastAdvancedTick >= 0) result.lastAdvancedTick = old.lastAdvancedTick;
  entity.needs = result;
  return result;
}

export interface HumanNeedsObservation {
  tick: number;
  elapsedTicks?: number;
  sleeping: boolean;
  working: boolean;
  moving: boolean;
}

export function advanceHumanNeeds(entity: Entity, obs: HumanNeedsObservation): HumanNeedsState {
  const needs = entity.needs ?? normalizeHumanNeeds(entity);
  if (needs.lastAdvancedTick === obs.tick) return needs;
  const ticks = Math.max(0, Math.floor(obs.elapsedTicks ??
    (needs.lastAdvancedTick === undefined ? 1 : obs.tick - needs.lastAdvancedTick)));
  const hours = ticks / TICKS_PER_HOUR;
  const nutritionLoss = HUMAN_NEEDS.NUTRITION_BASE_LOSS_PER_SIM_HOUR
    + (obs.working ? HUMAN_NEEDS.NUTRITION_WORK_EXTRA_PER_SIM_HOUR : 0)
    + (obs.moving ? HUMAN_NEEDS.NUTRITION_WALK_EXTRA_PER_SIM_HOUR : 0);
  needs.nutrition = bounded(needs.nutrition - nutritionLoss * hours * (entity.isJuvenile ? 0.85 : 1), 0);
  needs.rest = bounded(needs.rest + hours * (obs.sleeping
    ? HUMAN_NEEDS.REST_RECOVERY_SLEEP_PER_SIM_HOUR : -HUMAN_NEEDS.REST_LOSS_AWAKE_PER_SIM_HOUR), 0);
  const staminaRate = obs.sleeping ? HUMAN_NEEDS.STAMINA_SLEEP_RECOVERY_PER_SIM_HOUR
    : obs.working ? -HUMAN_NEEDS.STAMINA_WORK_LOSS_PER_SIM_HOUR
      : obs.moving ? -HUMAN_NEEDS.STAMINA_WALK_LOSS_PER_SIM_HOUR
        : HUMAN_NEEDS.STAMINA_IDLE_RECOVERY_PER_SIM_HOUR;
  needs.stamina = bounded(needs.stamina + staminaRate * hours, 0);
  needs.severeHungerTicks = needs.nutrition <= HUMAN_NEEDS.NUTRITION_STARVING
    ? (needs.severeHungerTicks ?? 0) + ticks : 0;
  needs.lastAdvancedTick = obs.tick;
  // One-way compatibility read for legacy social and combat consumers.
  entity.energy = entity.maxEnergy * needs.stamina / 100;
  return needs;
}

export type HumanNeedsIntent = 'eat' | 'sleep' | 'takeBreak' | 'continueActivity';

export function resolveHumanNeedsIntent(entity: Entity, tick: number, sleeping: boolean): HumanNeedsIntent {
  if (sleeping || !entity.needs) return 'continueActivity';
  const needs = entity.needs;
  if (needs.nutrition < HUMAN_NEEDS.EAT_ENTER_NUTRITION &&
      (needs.lastMealTick == null ||
       tick - needs.lastMealTick >= HUMAN_NEEDS.EAT_COOLDOWN_SIM_HOURS * TICKS_PER_HOUR)) return 'eat';
  if (needs.rest < HUMAN_NEEDS.REST_CRITICAL) return 'sleep';
  if (needs.stamina < HUMAN_NEEDS.STAMINA_CRITICAL) return 'takeBreak';
  return 'continueActivity';
}

export function hasFatalStarvation(entity: Entity): boolean {
  return (entity.needs?.severeHungerTicks ?? 0) >= HUMAN_NEEDS.STARVATION_FATAL_SIM_HOURS * TICKS_PER_HOUR;
}
