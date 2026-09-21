
/**
 * Daily layer — once per colony day (`tick % TICKS_PER_DAY === 0`).
 *
 * Grass ecology (growth/spread), static bookkeeping, building production,
 * frontier systems, and daily-gated world events. Trees have no sim tick.
 */
import type { Entity, WorldState } from './gameTypes';
import type { PopulationCounts } from './entityCounts';
import type { TickContext } from './simulation/simulationTypes';

import { addFloatingText } from './simEffects';
import { playerHumansFrom } from './playerHuman';
import { syncLeaderHouseResidency } from './leaderHouse';
import { tickElectionPromises } from './electionPromises';

// Social & Relationships
import { advanceSocialRelationships } from './relationships';
import { advanceYouthLove, reconcileCourtships } from './simulation/humanRelationships';
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

// ==================== DAILY LAYER ENTRYPOINT ====================

export function tickLayerDaily(
  state: WorldState,
  ctx: TickContext,
  allAlive: Entity[],
  counts: PopulationCounts,
): void {
  resolveDailyVillageScheduleFatigue(state, ctx.playerHumans);

  // The living settler list the two social owners below both need, derived once.
  //
  // Deliberately NOT `ctx.playerHumans`: that list is built at tick start (`gameTick`) and refreshed
  // only on a Moon Howler form change, whereas `allAlive` has this tick's `ctx.newEntities` appended
  // — so substituting it would silently drop today's newborns from friendship and apprenticeship
  // grouping. Between the two calls nothing writes `alive`, `faction` or `type`, so one array is
  // correct for both.
  const dayPeople = playerHumansFrom(allAlive);

  // Phase 7 social layers & chronicles — pulse daily
  advanceSocialRelationships(state, allAlive, dayPeople);
  advanceYouthLove(state, ctx);
  reconcileCourtships(ctx);
  advanceApprenticeships(state, allAlive, dayPeople);

  // Idempotent leader-house reconciliation: marriage/divorce/reassignment may
  // have changed the leader's household this day, so move the current spouse
  // (and children) into the manor and evict former household members.
  syncLeaderHouseResidency(state);

  // Evaluate active campaign promises when their evaluation day arrives
  tickElectionPromises(state);

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

  // Daily world & economy systems
  applyDailyWeatherEffects(state);
  tickGrassDaily(state, ctx, allAlive);
  tickDailyBuildingEconomy(state, ctx, allAlive);
  tickDailyPopulation(state, ctx, allAlive, counts);
  tickDailyWorldEvents(state, ctx, allAlive, counts);
  tickDailyChallenges(state, ctx, counts);
}
