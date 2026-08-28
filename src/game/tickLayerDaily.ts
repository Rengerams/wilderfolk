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
import {
  BuildingType,
  EntityType,
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
  tickMigration,
} from './migration';
import {
  tickPendingStoryEvents,
  tickChildrenShelter,
  maybeOfferWelcome,
  maybeOfferWolfChoice,
  maybeOfferRangerVisit,
  maybeOfferGriefBeat,
  maybeOfferHowlerRumor,
  maybeOfferWinterPrep,
  maybeOfferChildrenShelter,
  tickWinterFreezeCheck,
} from './storyEvents';
import {
  tickGuidedCampaign,
} from './guidedCampaign';
import {
  detectRaidersFromWatchtowers,
} from './watchtowerDetection';
import {
  maybeOfferTravelingTheatre,
  tickTravelingTheatre,
} from './travelingTheatre';
import {
  maybeOfferDeerParliament,
  tickDeerParliament,
} from './deerParliament';
import {
  maybeOfferWeddingDiplomacy,
  tickWeddingDiplomacy,
} from './weddingDiplomacy';
import {
  maybeOfferInventionFair,
  tickInventionFair,
} from './inventionFair';
import {
  maybeOfferRumourLedger,
  tickRumourLedger,
} from './rumourLedger';
import {
  tickElectionPromises,
} from './electionPromises';
import {
  tickAnimalCare,
} from './animalCare';
import {
  tickBeauty,
} from './beautyGrid';
import {
  TICKS_PER_DAY,
  isNewCalendarDayTick,
  getCalendarDay,
  FESTIVAL_CHECK_TICKS,
  
  getAbsoluteCalendarDay,
  DAYS_PER_YEAR,
} from './dayCycle';
import type {
  TickContext,
} from './simulation/simulationTypes';
import {
  GRASS_GROWTH_PER_TICK,
} from './grassEcology';
import {
  SPECIES_CONFIG,
} from './speciesConfig';
import {
  buildGrassPopulationSnapshot,
  grassPopulationTotal,
} from './simQueries';
import {
  createEntity,
} from './entityFactory';
import {
  pushNewEntity,
  syncEntityGrids,
  getGrassPopulationCap,
  markGrassDead,
} from './simulation/simulationEntities';

import {
  applyDailyWeatherEffects,
} from './worldEvents';
import {
  addFloatingText,
  addBigNews,
    addNotification,

} from './simEffects';

import {
  tickVisitorQuest,
} from './visitorQuest';
import {
  tickLeaderPromise,
} from './villageLeadership';

import {
  decayIdleSkills,
} from './skills';

import {
  resolveDailyScheduleFatigue,
} from './scheduleFatigue';
import {
  tickValleyEcologyStage,
} from './ecologyStage';
import {
  tickEcosystemMetrics,
} from './dailyEcology';
import {
  rollYearlyWorldEvent,
  tryFirstWeekVisitor,
  tryMidYearVisitorEvent,
  tickRivalSettlements,
  tickVisitorGroups,
  tickVillageRequests,
} from './groupEvents';
import {
  tickElectionBuildup,
  tickLeaderVacancy,
  tryStartDecennialElectionCeremony,
  tryStartVacancyElectionCeremony,
} from './villageLeadership';
import {
  trackYearEvent,
} from './stats';
import {
    getTownHallFestivalCooldownTicks,

} from './townHall';
import {
  tickPendingOutgoingRaidEvents,
  tickPendingRaidEvents,
} from './frontierCombat';

import {
  replenishDepletedWildlife,
} from './worldGen';


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

function tickFestivals(state: WorldState, counts: PopulationCounts): void {
  const townHallFestivalBoost = state.buildings.some(
    (b) => b.completed && b.type === BuildingType.TownHall && b.faction !== 'rival' && b.occupants.length > 0,
  )
    ? 1.4
    : 1;

  let festivalStartedThisTick = false;

  // Seasonal festivals — 5 days at the start of each season: 20 guaranteed
  // festival days per year (Spring Revel · Midsummer Feast · Harvest Festival ·
  // Frostfall Feast), on top of the random festivals.
  const dayInYear = getAbsoluteCalendarDay(state.tick) % DAYS_PER_YEAR;
  const seasonalStart = Math.floor(dayInYear / 90) * 90;
  if (!state.festival && dayInYear === seasonalStart + 3 && counts.humans >= 2) {
    const seasonalNames: Record<number, string> = {
      0: 'Spring Revel',
      90: 'Midsummer Feast',
      180: 'Harvest Festival',
      270: 'Frostfall Feast',
    };
    const name = seasonalNames[seasonalStart] ?? 'Village Festival';
    state.festival = { active: true, name, daysLeft: 5 };
    state.villageReputation = Math.min(100, state.villageReputation + 5);
    addBigNews(state, '🎉 Festival!', `${name} has begun! Production, courtship, and immigration are boosted for 5 days.`, 'positive');
    logEvent(state, 'season', `${name} festival began in the village`);
    festivalStartedThisTick = true;
  }

  if (
    !state.festival
    && state.tick >= (state.townHallFestivalCooldownUntilTick ?? 0)
    && state.tick % FESTIVAL_CHECK_TICKS === 0
    && counts.humans >= 6
    && Math.random() < 0.25 * townHallFestivalBoost
  ) {
    const festivalNames = ['Harvest Festival', 'Moonlight Feast', 'Founders Day', 'Spring Revel', 'Trade Fair'];
    const name = festivalNames[Math.floor(Math.random() * festivalNames.length)];
    state.festival = { active: true, name, daysLeft: 20 + Math.floor(Math.random() * 20) };
    state.townHallFestivalCooldownUntilTick = state.tick + getTownHallFestivalCooldownTicks();
    state.villageReputation = Math.min(100, state.villageReputation + 10);
    addBigNews(state, '🎉 Festival!', `${name} has begun! Production, courtship, and immigration are boosted for ${state.festival.daysLeft} days.`, 'positive');
    logEvent(state, 'season', `${name} festival began in the village`);
    festivalStartedThisTick = true;
  }

  // Don't burn a day on the same tick the festival starts
  if (state.festival && !festivalStartedThisTick && state.tick > 0 && state.tick % TICKS_PER_DAY === 0) {
    state.festival.daysLeft--;
    if (state.festival.daysLeft <= 0) {
      addBigNews(state, '🎉 Festival Ended', `${state.festival.name} is over. The village returns to normal.`, 'neutral');
      state.festival = null;
      state.townHallFestivalCooldownUntilTick = state.tick + getTownHallFestivalCooldownTicks();
    }
  }
}

import { tickDailyPopulation } from './dailyPopulation';
import { tickDailyChallenges } from './dailyChallenges';

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


  // Frontier systems
  tickVisitorGroups(state, allAlive);
  tickVillageRequests(state);
  tickVisitorQuest(state);
  tickLeaderPromise(state);
  tickPendingRaidEvents(state, allAlive, ctx.updatedBuildings);
  tickPendingOutgoingRaidEvents(state);
  // First-session arc (year 0 only — zero cost in later years): the welcome
  // beat, the wolf choice (first two months), the ranger's memory of it, and
  // Old Kaia's first-winter quest with its freeze-day resolution.
  if (state.year === 0) {
    maybeOfferWelcome(state);
    maybeOfferWolfChoice(state);
    maybeOfferRangerVisit(state);
    maybeOfferGriefBeat(state);
    maybeOfferHowlerRumor(state);
    maybeOfferWinterPrep(state);
    tickWinterFreezeCheck(state);
  }
  tickPendingStoryEvents(state);
  maybeOfferChildrenShelter(state);
  tickChildrenShelter(state);
  maybeOfferTravelingTheatre(state);
  tickTravelingTheatre(state);
  maybeOfferDeerParliament(state);
  tickDeerParliament(state);
  maybeOfferWeddingDiplomacy(state);
  tickWeddingDiplomacy(state);
  maybeOfferInventionFair(state);
  tickInventionFair(state);
  maybeOfferRumourLedger(state);
  tickRumourLedger(state);
  tickAnimalCare(state);
  tickElectionPromises(state);
  tickGuidedCampaign(state);
  // Watchtowers reveal marching raiders earlier than patrols (daily, bounded).
  detectRaidersFromWatchtowers(state, allAlive);
  tickRivalSettlements(state, allAlive);

  // Population cleanup and immigration remain in the daily population owner.
  tickDailyPopulation(state, ctx, allAlive, counts);

  tickFestivals(state, counts);

  // Every 3 days — soft wildlife floor so passive play doesn't empty the map by mid-year
  if (state.tick > 0 && state.tick % (TICKS_PER_DAY * 3) === 0) {
    replenishDepletedWildlife(state, (entity) => pushNewEntity(state, ctx, entity));
  }

  // Eco indexes refresh once per day (before the valley stage consumes them)
  tickEcosystemMetrics(state, counts, ctx.updatedBuildings);

  // Valley ecology stage (after wildlife counts on state; before production yields)
  tickValleyEcologyStage(state);

  // Autumn deer migration — herds arrive, graze, and leave with memory
  tickMigration(state, allAlive);

  // Neighborhood beauty grid + village happiness (Phase 3.2)
  tickBeauty(state);



  // Skill decay (new calendar day)
  if (isNewCalendarDayTick(state)) {
    for (const human of ctx.playerHumans) {
      if (!human.alive || human.isJuvenile) continue;
      decayIdleSkills(human, human.job);
    }
  }

  // Election ceremony advances in realtime (every tick) — see tickLayerRealtime

  // Leader vacancy
  const vacancyNews = tickLeaderVacancy(state);
  if (vacancyNews) {
    addBigNews(state, vacancyNews.title, vacancyNews.message, 'neutral');
    addNotification(state, vacancyNews.title, vacancyNews.message, 'event');
  }

  // Yearly world events
  if (state.dayInYear === 0 && state.year > 0) {
    state.activeEvent = null;
  }

  if (state.year > 0 && state.year % 2 === 0 && state.year !== state.lastEventYear) {
    state.lastEventYear = state.year;
    const rolled = rollYearlyWorldEvent(
      state, allAlive, ctx.updatedBuildings, ctx.width, ctx.height,
      () => state.nextEntityId++,
    );
    state.activeEvent = rolled.event;
    if (rolled.bountifulHarvest) state.bountifulHarvest = true;
    if (state.activeEvent) {
      trackYearEvent(state, state.activeEvent.title);
      addNotification(state, state.activeEvent.title, state.activeEvent.description, state.activeEvent.type === 'positive' ? 'success' : state.activeEvent.type === 'negative' ? 'warning' : 'event');
    }
  }

  // Mid-year visitor
  if (state.dayInYear === 180 && state.year > 0 && state.tick > 0) {
    const midEvent = tryMidYearVisitorEvent(state, allAlive, ctx.updatedBuildings);
    if (midEvent) {
      state.activeEvent = midEvent;
      trackYearEvent(state, midEvent.title);
      addNotification(state, midEvent.title, midEvent.description, 'event');
    }
  }

  // First-week visitor
  if (!state.firstWeekVisitorSpawned) {
    const firstWeekEvent = tryFirstWeekVisitor(state, allAlive, ctx.updatedBuildings);
    if (firstWeekEvent) {
      state.activeEvent = firstWeekEvent;
      trackYearEvent(state, firstWeekEvent.title);
      addNotification(state, firstWeekEvent.title, firstWeekEvent.description, 'success');
    }
  }

  // Bountiful harvest reset on odd years
  if (state.year > 0 && state.year % 2 !== 0) {
    state.bountifulHarvest = false;
  }

  // Election buildup and ceremonies (year rollover)
  const prevCalendarDay = state.tick <= 1 ? 0 : getCalendarDay(state.tick - 1);
  const yearRollover = state.dayInYear === 0 && prevCalendarDay > 0;
  if (yearRollover) {
    const buildupNews = tickElectionBuildup(state, state.year, yearRollover);
    if (buildupNews) {
      addBigNews(state, buildupNews.title, buildupNews.message, 'neutral');
      addNotification(state, buildupNews.title, buildupNews.message, 'event');
    }

    const vacancyCeremony = tryStartVacancyElectionCeremony(state, state.year, state.dayInYear);
    const decennialCeremony = !vacancyCeremony
      && tryStartDecennialElectionCeremony(state, state.year, state.dayInYear);

    if (vacancyCeremony || decennialCeremony) {
      addBigNews(
        state,
        '🗳️ Election Day',
        `Settlers gather for the leadership election (Year ${state.year}). Gossip, tension, then the merit reveal — and a village party after.`,
        'neutral',
      );
      addNotification(
        state,
        '🗳️ Election Day',
        `Year ${state.year} leadership election — villagers gathering now.`,
        'event',
      );
    }
  }

    // Challenge evaluation and rewards remain in the daily challenge owner.
  tickDailyChallenges(state, ctx, counts);
}

// ============ TICK GRASS (once per day) ============
/**
 * Grass growth + spread once per colony day. Trees are static map props — never tick them.
 * Grazers still bite grass mid-day from `tickWildlife` / human hunt paths.
 * When `allAlive` is provided (daily host), new patches are appended so they persist.
 */
export function tickGrassDaily(
  state: WorldState,
  ctx: TickContext,
  allAlive?: Entity[],
): void {
  const { width, height, byType, grassMult, reproMult, newEntities } = ctx;

  if (!ctx.grassPopulation) {
    ctx.grassPopulation = buildGrassPopulationSnapshot(byType, newEntities);
  }
  if (ctx.grassCap === undefined) {
    ctx.grassCap = getGrassPopulationCap(width, height);
  }

  const grassConfig = SPECIES_CONFIG[EntityType.Grass];
  const growth = GRASS_GROWTH_PER_TICK * grassMult * TICKS_PER_DAY;
  // Approximate former per-tick spawn chance over a full day.
  const dailyReproChance = Math.min(
    1,
    1 - Math.pow(1 - grassConfig.reproductionChance, TICKS_PER_DAY),
  );

  const grassList = byType[EntityType.Grass] ?? [];
  for (const grass of grassList) {
    if (!grass.alive) continue;

    grass.age++;
    if (grass.age >= grass.maxAge) {
      markGrassDead(ctx, grass);
      syncEntityGrids(ctx, grass);
      continue;
    }

    grass.energy = Math.min(grass.maxEnergy, grass.energy + growth);
    grass.flash = Math.max(0, (grass.flash ?? 0) - 1);

    const total = grassPopulationTotal(ctx.grassPopulation);
    if (
      total < ctx.grassCap
      && grass.energy >= grassConfig.reproductionEnergyThreshold
      && Math.random() < dailyReproChance * reproMult
    ) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 8 + Math.random() * grassConfig.wanderRadius;
      const nx = Math.min(width, Math.max(0, grass.x + Math.cos(angle) * dist));
      const ny = Math.min(height, Math.max(0, grass.y + Math.sin(angle) * dist));
      const patch = createEntity(
        EntityType.Grass,
        nx,
        ny,
        state.nextEntityId++,
        grassConfig.spawnEnergy,
      );
      pushNewEntity(state, ctx, patch);
      allAlive?.push(patch);
    }

    syncEntityGrids(ctx, grass);
  }
}
