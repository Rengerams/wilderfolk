/**
 * Daily layer — once per colony day (`tick % TICKS_PER_DAY === 0`).
 *
 * Grass ecology (growth/spread), static bookkeeping, building production,
 * frontier systems, and daily-gated world events. Trees have no sim tick.
 */
import type {
  WorldState,
  Entity,
} from './gameTypes';

import type {
  PopulationCounts,
} from './entityCounts';

import {
  logEvent,
} from './eventLog';
import {
  advanceValleyChronicle,
  VALLEY_CHAPTERS,
} from './valleyChronicle';
import {
  advanceSocialRelationships,
} from './relationships';
import {
  advanceYouthLove,
} from './simulation/humanRelationships';
import {
  advanceApprenticeships,
} from './apprenticeships';
import {
  TICKS_PER_DAY,
  isNewCalendarDayTick,
} from './dayCycle';
import type {
  TickContext,
} from './simulation/simulationTypes';
import { tickDailyPopulation } from './dailyPopulation';
import { tickDailyChallenges } from './dailyChallenges';
import { tickGrassDaily } from './dailyGrassEcology';

import {
  applyDailyWeatherEffects,
} from './worldEvents';
import {
  addFloatingText,
} from './simEffects';

import {
  resolveDailyScheduleFatigue,
} from './scheduleFatigue';
/**
 * Winter heating — burns wood once per colony day, stores result on state for the whole day.
 * Call from gameTick only (not from daily layer again).
 */
export function tickWinterHeating(
  state: WorldState,
  humanCount: number,
  isWinter: boolean,
): boolean {
  if (!isWinter) {
    state.villageCanHeat = true;
    return true;
  }
  // Same colony day after morning burn: reuse stored flag
  if (state.tick > 0 && state.tick % TICKS_PER_DAY !== 0) {
    return state.villageCanHeat !== false;
  }
  // Day boundary: attempt to heat the village
  let canHeat = true;
  if (state.tick > 0 && humanCount > 0) {
    const woodNeeded = Math.ceil(humanCount / 5);
    if (state.resources.wood >= woodNeeded) {
      state.resources.wood -= woodNeeded;
      canHeat = true;
    } else {
      canHeat = false;
    }
  }
  state.villageCanHeat = canHeat;
  return canHeat;
}

import { tickDailyBuildingEconomy } from './dailyBuildingEconomy';

// ==================== FRONTIER SYSTEMS ====================

import { tickDailyWorldEvents } from './dailyWorldEvents';

// ==================== DAILY LAYER ENTRYPOINT ====================

export function tickLayerDaily(
  state: WorldState,
  ctx: TickContext,
  allAlive: Entity[],
  counts: PopulationCounts,
): void {
  // Winter heating runs once in gameTick (sets ctx.canHeat) — do not burn wood again here.

  if (isNewCalendarDayTick(state)) {
    for (const human of ctx.playerHumans) {
      if (!human.alive || human.isJuvenile) continue;
      const result = resolveDailyScheduleFatigue(human, state);
      if (Math.abs(result.fatigueAfter - result.fatigueBefore) >= 8) {
        const direction = result.fatigueAfter > result.fatigueBefore ? 'rose' : 'recovered';
        logEvent(state, 'event', `Schedule fatigue ${direction} to ${Math.round(result.fatigueAfter)}% after ${result.workedHours.toFixed(1)} hours of work.`);
      }
    }
  }

  // Phase 7 social layers — friendships, feuds and apprenticeships pulse daily.
  if (state.tick > 0) {
    advanceSocialRelationships(state, allAlive);
    advanceYouthLove(state, ctx);
    advanceApprenticeships(state, allAlive);
  }

  // Valley Chronicle — milestone chapters unlock once per day boundary.
  if (state.tick > 0) {
    const newly = advanceValleyChronicle(state);
    if (newly.length > 0) {
      for (const id of newly) {
        const ch = VALLEY_CHAPTERS.find((c) => c.id === id);
        if (ch) addFloatingText(state, state.width / 2, state.height / 2, `${ch.icon} ${ch.title}`, '#fbbf24', 'brief');
      }
    }
  }

  // Weather consequences (Phase 3.4) — storm damages buildings once per day
  applyDailyWeatherEffects(state);

  // Grass growth + spread once per day (trees are static props)
  tickGrassDaily(state, ctx, allAlive);

  // Construction / repair / decay and production remain in the daily building owner.
  tickDailyBuildingEconomy(state, ctx, allAlive);

  tickDailyPopulation(state, ctx, allAlive, counts);
  tickDailyWorldEvents(state, ctx, allAlive, counts);

  // Challenge evaluation and rewards remain in the daily challenge owner.
  tickDailyChallenges(state, ctx, counts);
}

// ============ TICK GRASS (once per day) ============
/**
 * Grass growth + spread once per colony day. Trees are static map props — never tick them.
 * Grazers still bite grass mid-day from `tickWildlife` / human hunt paths.
 * When `allAlive` is provided (daily host), new patches are appended so they persist.
 */
export { tickGrassDaily } from './dailyGrassEcology';
