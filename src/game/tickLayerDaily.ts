/**
 * Daily layer — once per colony day (`tick % TICKS_PER_DAY === 0`).
 *
 * Grass ecology (growth/spread), static bookkeeping, building production,
 * frontier systems, and daily-gated world events. Trees have no sim tick.
 */
import type { Entity, WorldState } from './gameTypes';
import type { PopulationCounts } from './entityCounts';
import type { TickContext } from './simulation/simulationTypes';

import { isNewCalendarDayTick } from './dayCycle';
import { addFloatingText } from './simEffects';
import { syncLeaderHouseResidency } from './leaderHouse';

// Social & Relationships
import { advanceSocialRelationships } from './relationships';
import { advanceYouthLove } from './simulation/humanRelationships';
import { advanceApprenticeships } from './apprenticeships';

// Daily Systems
import { tickDailyPopulation } from './dailyPopulation';
import { tickDailyChallenges } from './dailyChallenges';
import { tickGrassDaily } from './dailyGrassEcology';
import { resolveDailyVillageScheduleFatigue } from './dailyScheduleFatigue';
import { tickDailyBuildingEconomy } from './dailyBuildingEconomy';
import { tickDailyWorldEvents } from './dailyWorldEvents';
import { applyDailyWeatherEffects } from './worldEvents';

// Chronicles
import { advanceValleyChronicle, VALLEY_CHAPTERS } from './valleyChronicle';

// Re-export for external daily layer consumers
export { tickGrassDaily } from './dailyGrassEcology';

// ==================== DAILY LAYER ENTRYPOINT ====================

export function tickLayerDaily(
  state: WorldState,
  ctx: TickContext,
  allAlive: Entity[],
  counts: PopulationCounts,
): void {
  // Winter heating runs once in gameTick (sets ctx.canHeat) — do not burn wood again here.

  if (isNewCalendarDayTick(state)) {
    resolveDailyVillageScheduleFatigue(state, ctx.playerHumans);
  }

  // Phase 7 social layers & chronicles — pulse daily (skip tick 0 initialization)
  if (state.tick > 0) {
    advanceSocialRelationships(state, allAlive);
    advanceYouthLove(state, ctx);
    advanceApprenticeships(state, allAlive);

    // Idempotent leader-house reconciliation: marriage/divorce/reassignment may
    // have changed the leader's household this day, so move the current spouse
    // (and children) into the manor and evict former household members.
    syncLeaderHouseResidency(state);

    // Valley Chronicle — milestone chapters unlock once per day boundary.
    const newlyUnlocked = advanceValleyChronicle(state);
    if (newlyUnlocked.length > 0) {
      for (const id of newlyUnlocked) {
        const chapter = VALLEY_CHAPTERS.find((c) => c.id === id);
        if (chapter) {
          addFloatingText(state, state.width / 2, state.height / 2, `${chapter.icon} ${chapter.title}`, '#fbbf24', 'brief');
        }
      }
    }
  }

  // Daily world & economy systems
  applyDailyWeatherEffects(state);
  tickGrassDaily(state, ctx, allAlive);
  tickDailyBuildingEconomy(state, ctx, allAlive);
  tickDailyPopulation(state, ctx, allAlive, counts);
  tickDailyWorldEvents(state, ctx, allAlive, counts);
  tickDailyChallenges(state, ctx, counts);
}