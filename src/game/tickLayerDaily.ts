
/**
 * Daily layer — invoked at 00:00, 06:00, 12:00 and 18:00; its phases run at 00:00, 06:00 and 18:00.
 */
import type { Entity, WorldState } from './gameTypes';
import { EntityType } from './gameTypes';
import type { TickContext } from './simulation/simulationTypes';
import { countLivingPopulation } from './entityCounts';
import { mergeNewEntitiesIntoAlive } from './simulation/simulationEntities';

import { addFloatingText } from './simEffects';
import { playerHumansFrom } from './playerHuman';
import { syncLeaderHouseResidency } from './leaderHouse';
import { tickElectionPromises } from './electionPromises';
import { tickVisitorGroups } from './groupEvents';
import { decayIdleSkills } from './skills';
import { HUMAN_ADULT_MIN_AGE } from './daycycleconstants';

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
import { tickDailyWorldEvents, tickYearBoundaryWorldEvents } from './dailyWorldEvents';
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
  // Run strict day-boundary owners before the day's later 06:00/18:00 work.
  tickVisitorGroups(state, allAlive);
  for (const human of ctx.playerHumans) {
    if (human.alive && human.age >= HUMAN_ADULT_MIN_AGE) decayIdleSkills(human, human.job);
  }
  tickYearBoundaryWorldEvents(state);
  const stage1 = profileStart();
  resolveDailyVillageScheduleFatigue(state, ctx.playerHumans, ctx.buildingById, ctx.byType[EntityType.Werewolf]);
  profileEnd('daily.resolveDailyVillageScheduleFatigue', stage1);

  }
  if (hour === DAILY_PHASE_HOURS.relationships) {
  // Social owners share the current living list; late 18:00 arrivals are not in this phase.
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

  // Idempotent leader-house reconciliation: move the current spouse and children into the
  // manor and evict former household members.
  const stage6 = profileStart();
  syncLeaderHouseResidency(state);
  profileEnd('daily.syncLeaderHouseResidency', stage6);

  }
  if (hour === DAILY_PHASE_HOURS.worldEvents) {
  // Evaluate active campaign promises when their evaluation day arrives
  const stage7 = profileStart();
  tickElectionPromises(state);
  profileEnd('daily.tickElectionPromises', stage7);

  // Valley Chronicle — milestone chapters are checked once per day.
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
  // Production may have queued spawns; fold them in before the point-of-use counts and before the
  // systems that read the working alive list.
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
