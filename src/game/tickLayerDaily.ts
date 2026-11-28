
/**
 * Daily layer — invoked at 00:00, 06:00, 12:00, 18:00 and 23:00; noon has no owner.
 * The retired on-map visitor lifecycle is never scheduled here.
 */
import type { Entity, WorldState } from './gameTypes';
import { getWorkSchedule } from './workSchedule';
import { EntityType } from './gameTypes';
import type { TickContext } from './simulation/simulationTypes';
import { countLivingPopulation } from './entityCounts';
import { mergeNewEntitiesIntoAlive } from './simulation/simulationEntities';

import { addFloatingText } from './simEffects';
import { playerHumansFrom } from './playerHuman';
import { syncLeaderHouseResidency } from './leaderHouse';
import { decayIdleSkills } from './skills';
import { HUMAN_ADULT_MIN_AGE } from './daycycleconstants';
import { getPracticedJobForCompletedDay } from './scheduleFatigue';

// Social & Relationships
import { advanceSocialRelationships } from './relationships';
import { advanceYouthLove, reconcileCourtships } from './simulation/humanRelationships';
import { advanceApprenticeships } from './apprenticeships';

// Daily Systems
import { tickDailyPopulation } from './dailyPopulation';
import { tickDailyChallenges } from './dailyChallenges';
import { tickGrassDaily } from './dailyGrassEcology';
import { resolveDailyVillageScheduleFatigue } from './dailyScheduleFatigue';
import { tickBuildingProgress, tickDailyBuildingEconomy } from './dailyBuildingEconomy';
import { tickScheduledTownHallAudiences } from './townHall';
import { settleDailyEcology, tickDailyWorldEvents, tickYearBoundaryWorldEvents } from './dailyWorldEvents';
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

  // 00:00 — day-boundary owners, then the new day's weather and grass.
  if (hour === DAILY_PHASE_HOURS.fatigue) {
    for (const human of ctx.playerHumans) {
      if (human.alive && human.age >= HUMAN_ADULT_MIN_AGE) {
        decayIdleSkills(human, getPracticedJobForCompletedDay(human));
      }
    }
    tickYearBoundaryWorldEvents(state);
    const stage1 = profileStart();
    resolveDailyVillageScheduleFatigue(state, ctx.playerHumans, ctx.buildingById, ctx.byType[EntityType.Werewolf]);
    profileEnd('daily.resolveDailyVillageScheduleFatigue', stage1);

    const stage8 = profileStart();
    applyDailyWeatherEffects(state);
    profileEnd('daily.applyDailyWeatherEffects', stage8);
    const stage9 = profileStart();
    tickGrassDaily(state, ctx, allAlive);
    profileEnd('daily.tickGrassDaily', stage9);
  }

  // 06:00 — social layers; the living list excludes later same-day arrivals.
  if (hour === DAILY_PHASE_HOURS.relationships) {
    const dayPeople = playerHumansFrom(allAlive);

    const stage2 = profileStart();
    advanceSocialRelationships(state, allAlive, dayPeople);
    profileEnd('daily.advanceSocialRelationships', stage2);
    const stage3 = profileStart();
    advanceYouthLove(state, ctx);
    profileEnd('daily.advanceYouthLove', stage3);
    const stage4 = profileStart();
    reconcileCourtships(ctx);
    profileEnd('daily.reconcileCourtships', stage4);
    // Idempotent leader-house reconciliation: move the current spouse and children into the
    // manor and evict former household members.
    const stage6 = profileStart();
    syncLeaderHouseResidency(state);
    profileEnd('daily.syncLeaderHouseResidency', stage6);
  }

  // Apprentices train at 23:00 after even the latest legal work shift.
  // Witnessed attendance still exists before the midnight fatigue settlement.
  if (hour === DAILY_PHASE_HOURS.construction) {
    const stage5 = profileStart();
    advanceApprenticeships(state, allAlive, playerHumansFrom(allAlive));
    profileEnd('daily.advanceApprenticeships', stage5);
  }

  // 18:00 — election promises and the chronicle.
  if (hour === DAILY_PHASE_HOURS.worldEvents) {
  // World-events owns promise evaluation, once per evening.
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

  // The chronicle keeps its evening cadence. Settle production after all legal shifts.
  if (hour === DAILY_PHASE_HOURS.worldEvents) {
    const stage10 = profileStart();
    tickWildkinChronicle(state, ctx);
    profileEnd('daily.tickWildkinChronicle', stage10);
  }
  if (hour === DAILY_PHASE_HOURS.production) {
    state.productionDeferred = getWorkSchedule(state).endHour > hour;
    // The 18:00 world-events pass can change valley stage. Production still belongs to today.
    state.productionValleyStage = state.productionDeferred ? (state.valleyStage ?? 'stable') : undefined;
  }
  if ((hour === DAILY_PHASE_HOURS.production && !state.productionDeferred)
    || (hour === DAILY_PHASE_HOURS.construction && state.productionDeferred)) {
    const stage11 = profileStart();
    tickDailyBuildingEconomy(state, ctx, allAlive);
    profileEnd('daily.tickDailyBuildingEconomy', stage11);
    state.productionDeferred = false;
    state.productionValleyStage = undefined;
  }

  // Audiences belong to the evening civic phase, not deferred tax settlement.
  if (hour === DAILY_PHASE_HOURS.production) {
    tickScheduledTownHallAudiences(state, ctx.updatedBuildings, ctx.playerHumans);
  }

  // A deferred ecology pass observes the entire shift, before construction changes the footprint.
  if (hour === DAILY_PHASE_HOURS.construction && state.ecologySettlementPending) {
    settleDailyEcology(state, ctx, allAlive);
  }

  // 23:00 — consume all witnessed construction shifts before 00:00 clears the counters.
  // This is the existing construction owner in the same daily layer, not a new scheduler.
  if (hour === DAILY_PHASE_HOURS.construction) {
    const constructionStart = profileStart();
    tickBuildingProgress(state);
    profileEnd('daily.tickBuildingProgress', constructionStart);
  }

  // 18:00 — population, world events and challenges, after this day's spawns.
  if (hour === DAILY_PHASE_HOURS.worldEvents) {
    mergeNewEntitiesIntoAlive(allAlive, ctx.newEntities);
    // Count at the point of use, after this layer's own spawns and deaths; the pre-daily snapshot
    // misses them.
    const countsStart = profileStart();
    const counts = countLivingPopulation(allAlive, ctx.newEntities);
    profileEnd('daily.countLivingPopulation', countsStart);
    const stage12 = profileStart();
    tickDailyPopulation(state, ctx, allAlive, counts);
    profileEnd('daily.tickDailyPopulation', stage12);
    mergeNewEntitiesIntoAlive(allAlive, ctx.newEntities);
    const stage13 = profileStart();
    tickDailyWorldEvents(state, ctx, allAlive, countLivingPopulation(allAlive, ctx.newEntities));
    profileEnd('daily.tickDailyWorldEvents', stage13);
    mergeNewEntitiesIntoAlive(allAlive, ctx.newEntities);
    const stage14 = profileStart();
    tickDailyChallenges(state, ctx, countLivingPopulation(allAlive, ctx.newEntities));
    profileEnd('daily.tickDailyChallenges', stage14);
  }
}
