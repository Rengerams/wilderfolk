
/**
 * Daily layer — invoked four times per colony day at 00:00, 06:00, 12:00 and 18:00.
 * `gameTick.ts` gates invocation with `tick % (TICKS_PER_DAY / 4) === 0`.
 *
 * Grass ecology (growth/spread), static bookkeeping, building production,
 * frontier systems, and daily-gated world events. Trees have no sim tick.
 */
import type { Entity, WorldState } from './gameTypes';
import { EntityType } from './gameTypes';
import type { TickContext } from './simulation/simulationTypes';
import { countLivingPopulation } from './entityCounts';

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
import { tickWildkinChronicle } from './wildkinChronicle';
import { profileStart, profileEnd } from './performanceProfiler';
import { DAILY_PHASE_HOURS, getHourOfDay } from './dayCycleClock';

// ==================== DAILY LAYER ENTRYPOINT ====================

export function tickLayerDaily(
  state: WorldState,
  ctx: TickContext,
  allAlive: Entity[],
): void {
  const hour = getHourOfDay(state.tick);
  if (hour === DAILY_PHASE_HOURS.fatigue) {
  const stage1 = profileStart();
  resolveDailyVillageScheduleFatigue(state, ctx.playerHumans, ctx.byType[EntityType.Werewolf]);
  profileEnd('daily.resolveDailyVillageScheduleFatigue', stage1);

  }
  if (hour === DAILY_PHASE_HOURS.relationships) {
  // The living settler list the two social owners below both need, derived once.
  //
  // Deliberately NOT `ctx.playerHumans`: that list is built at tick start (`gameTick`) and refreshed
  // only on a Moon Howler form change, whereas `allAlive` has this tick's `ctx.newEntities` appended
  // — so substituting it would silently drop today's newborns from friendship and apprenticeship
  // grouping. Between the two calls nothing writes `alive`, `faction` or `type`, so one array is
  // correct for both.
  const dayPeople = playerHumansFrom(allAlive);

  // Phase 7 social layers & chronicles — pulse daily
  const stage2 = profileStart();
  advanceSocialRelationships(state, allAlive, dayPeople);
  profileEnd('daily.advanceSocialRelationships', stage2);
  const stage3 = profileStart();
  advanceYouthLove(state, ctx);
  profileEnd('daily.advanceYouthLove', stage3);
  const stage4 = profileStart();
  reconcileCourtships(ctx);
  profileEnd('daily.reconcileCourtships', stage4);
  const stage5 = profileStart();
  advanceApprenticeships(state, allAlive, dayPeople);
  profileEnd('daily.advanceApprenticeships', stage5);

  // Idempotent leader-house reconciliation: marriage/divorce/reassignment may
  // have changed the leader's household this day, so move the current spouse
  // (and children) into the manor and evict former household members.
  const stage6 = profileStart();
  syncLeaderHouseResidency(state);
  profileEnd('daily.syncLeaderHouseResidency', stage6);

  }
  if (hour === DAILY_PHASE_HOURS.worldEvents) {
  // Evaluate active campaign promises when their evaluation day arrives
  const stage7 = profileStart();
  tickElectionPromises(state);
  profileEnd('daily.tickElectionPromises', stage7);

  // Valley Chronicle — milestone chapters unlock once per day boundary.
  const chronicleStart = profileStart();
  const newlyUnlocked = advanceValleyChronicle(state);
  profileEnd('daily.advanceValleyChronicle', chronicleStart);
  if (newlyUnlocked.length > 0) {
    for (const id of newlyUnlocked) {
      const chapter = VALLEY_CHAPTERS.find((c) => c.id === id);
      if (chapter) {
        addFloatingText(state, state.width / 2, state.height / 2, `${chapter.icon} ${chapter.title}`, '#fbbf24', 'brief');
      }
    }
  }

  }
  if (hour === DAILY_PHASE_HOURS.fatigue) {
  // Daily world & economy systems
  const stage8 = profileStart();
  applyDailyWeatherEffects(state);
  profileEnd('daily.applyDailyWeatherEffects', stage8);
  const stage9 = profileStart();
  tickGrassDaily(state, ctx, allAlive);
  profileEnd('daily.tickGrassDaily', stage9);
  }
  if (hour === DAILY_PHASE_HOURS.production) {
  const stage10 = profileStart();
  tickWildkinChronicle(state, ctx);
  profileEnd('daily.tickWildkinChronicle', stage10);
  const stage11 = profileStart();
  tickDailyBuildingEconomy(state, ctx, allAlive);
  profileEnd('daily.tickDailyBuildingEconomy', stage11);
  }
  if (hour === DAILY_PHASE_HOURS.worldEvents) {
  // The tail counts at the point of use, after this layer's own spawns and deaths: the tick's
  // pre-daily snapshot no longer describes the colony by the time these three read it.
  const countsStart = profileStart();
  const counts = countLivingPopulation(allAlive, ctx.newEntities);
  profileEnd('daily.countLivingPopulation', countsStart);
  const stage12 = profileStart();
  tickDailyPopulation(state, ctx, allAlive, counts);
  profileEnd('daily.tickDailyPopulation', stage12);
  const stage13 = profileStart();
  tickDailyWorldEvents(state, ctx, allAlive, counts);
  profileEnd('daily.tickDailyWorldEvents', stage13);
  const stage14 = profileStart();
  tickDailyChallenges(state, ctx, counts);
  profileEnd('daily.tickDailyChallenges', stage14);
  }
}
