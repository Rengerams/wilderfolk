import type { WorldState, Entity } from './gameTypes';
import type { PopulationCounts } from './entityCounts';
import { countLivingPopulation } from './entityCounts';
import type { TickContext } from './simulation/simulationTypes';
import { TICKS_PER_DAY, FESTIVAL_CHECK_TICKS, getAbsoluteCalendarDay, DAYS_PER_YEAR, getCalendarDay, isNewCalendarDayTick } from './dayCycle';
import { displayYear } from './dayCycleClock';

import { addBigNews, addNotification } from './simEffects';
import { assignPendingGraves, logEvent } from './eventLog';
import { addReputation } from './simHelpers';
import { tickLeaderVacancy, tickElectionBuildup, tryStartVacancyElectionCeremony, tryStartTermElectionCeremony } from './villageLeadership';
import { getTownHallFestivalCooldownTicks, isTownHallStaffed } from './townHall';

import { rollYearlyWorldEvent, tryFirstWeekVisitor, tryMidYearVisitorEvent, tickVisitorGroups, tickVillageRequests } from './groupEvents';
import { tickWorldRivalSettlements } from './rivalWorldTick';
import { tickVisitorQuest } from './visitorQuest';
import { tickLeaderPromise } from './villageLeadership';
import { maybeOfferWelcome, maybeOfferWolfChoice, maybeOfferRangerVisit, maybeOfferGriefBeat, maybeOfferHowlerRumor, maybeOfferWinterPrep, tickWinterFreezeCheck, tickPendingStoryEvents, maybeOfferChildrenShelter, tickChildrenShelter } from './storyEvents';
import { maybeOfferTravelingTheatre, tickTravelingTheatre } from './travelingTheatre';
import { maybeOfferDeerParliament, tickDeerParliament } from './deerParliament';
import { maybeOfferWeddingDiplomacy, tickWeddingDiplomacy } from './weddingDiplomacy';
import { maybeOfferInventionFair, tickInventionFair } from './inventionFair';
import { maybeOfferRumourLedger, tickRumourLedger } from './rumourLedger';
import { tickAnimalCare } from './animalCare';
import { tickPrisonGuardDuty } from './prisonGuardDuty';
import { tickFamineDesperation } from './famineDesperation';
import { tickElectionPromises } from './electionPromises';
import { tickGuidedCampaign } from './guidedCampaign';
import { detectRaidersFromWatchtowers } from './watchtowerDetection';
import { trackYearEvent } from './stats';
import { replenishDepletedWildlife } from './worldGen';
import { mergeNewEntitiesIntoAlive, pushNewEntity } from './simulation/simulationEntities';
import { tickMigration } from './migration';
import { tickBeauty } from './beautyGrid';
import { tickEcosystemMetrics } from './dailyEcology';
import { tickValleyEcologyStage } from './ecologyStage';
import { decayIdleSkills } from './skills';
import { getSimRng } from './simRng';
import { syncGenealogyRegistry } from './genealogyRegistry';

/**
 * A festival the simulation can actually run, or `null`. The daily tick ends a festival when
 * `daysLeft` reaches zero, so a stored non-number must never survive the load.
 */
export function normalizeFestivalState(
  value: unknown,
): { active: boolean; name: string; daysLeft: number } | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as { active?: unknown; name?: unknown; daysLeft?: unknown };
  if (typeof candidate.active !== 'boolean') return null;
  if (typeof candidate.name !== 'string' || candidate.name.trim() === '') return null;
  if (typeof candidate.daysLeft !== 'number' || !Number.isFinite(candidate.daysLeft)) return null;
  if (candidate.daysLeft <= 0) return null;
  return { active: candidate.active, name: candidate.name, daysLeft: candidate.daysLeft };
}

/** Recover old saves whose festival never advanced: clear it only when a matching start entry proves it stale. */
export function repairStaleFestivalOnLoad(state: WorldState): void {
  if (!state.festival?.active) return;
  const match = [...(state.eventLog ?? [])].reverse().find(
    (entry) => typeof entry.message === 'string'
      && entry.message.includes(state.festival!.name)
      && /(?:began in the village|festival began|hosted a village festival)/i.test(entry.message)
      && typeof entry.tick === 'number',
  );
  if (!match || typeof match.tick !== 'number') return;
  // Even the longest randomly scheduled festival runs for fewer than 40 days.
  if (state.tick - match.tick > 40 * TICKS_PER_DAY) {
    state.festival = null;
  }
}

function tickFestivals(state: WorldState, counts: PopulationCounts): void {
  const townHallFestivalBoost = isTownHallStaffed(state.buildings) ? 1.4 : 1;

  let festivalStartedThisTick = false;

  // Seasonal festivals — 5 days at the start of each season, 20 guaranteed festival days a year.
  const dayInYear = getAbsoluteCalendarDay(state.tick) % DAYS_PER_YEAR;
  const seasonalStart = Math.floor(dayInYear / 90) * 90;
  const seasonalNames: Record<number, string> = {
    0: 'Spring Revel',
    90: 'Midsummer Feast',
    180: 'Harvest Festival',
    270: 'Frostfall Feast',
  };
  const seasonalName = seasonalNames[seasonalStart] ?? 'Village Festival';
  // The seasonal festival takes the first free day of its season rather than only day +3, and
  // `eventsThisYear` remembers it so a late start cannot become a second festival.
  const seasonalFestivalAlreadyRun = (state.eventsThisYear ?? []).includes(seasonalName);
  if (
    !state.festival
    && !seasonalFestivalAlreadyRun
    && dayInYear >= seasonalStart + 3
    && dayInYear < seasonalStart + 90
    && counts.humans >= 2
  ) {
    state.festival = { active: true, name: seasonalName, daysLeft: 5 };
    addReputation(state, 5);
    addBigNews(state, '🎉 Festival!', `${seasonalName} has begun! Production, courtship, and immigration are boosted for 5 days.`, 'positive');
    logEvent(state, 'season', `${seasonalName} began in the village`);
    trackYearEvent(state, seasonalName);
    festivalStartedThisTick = true;
  }

  // Seeded: a festival (its name and length) is world state, so the same seed and day roll
  // the same festival.
  const festivalRng = getSimRng('dailyWorldEvents');
  if (
    !state.festival
    && state.tick >= (state.townHallFestivalCooldownUntilTick ?? 0)
    && getAbsoluteCalendarDay(state.tick) % Math.max(1, Math.round(FESTIVAL_CHECK_TICKS / TICKS_PER_DAY)) === 0
    && counts.humans >= 6
    && festivalRng() < 0.25 * townHallFestivalBoost
  ) {
    const festivalNames = ['Harvest Festival', 'Moonlight Feast', 'Founders Day', 'Spring Revel', 'Trade Fair'];
    const name = festivalNames[Math.floor(festivalRng() * festivalNames.length)];
    state.festival = { active: true, name, daysLeft: 20 + Math.floor(festivalRng() * 20) };
    state.townHallFestivalCooldownUntilTick = state.tick + getTownHallFestivalCooldownTicks();
    addReputation(state, 10);
    addBigNews(state, '🎉 Festival!', `${name} has begun! Production, courtship, and immigration are boosted for ${state.festival.daysLeft} days.`, 'positive');
    logEvent(state, 'season', `${name} began in the village`);
    festivalStartedThisTick = true;
  }

  // Don't burn a day on the same tick the festival starts
  if (state.festival && !festivalStartedThisTick && state.tick > 0) {
    state.festival.daysLeft--;
    if (state.festival.daysLeft <= 0) {
      addBigNews(state, '🎉 Festival Ended', `${state.festival.name} is over. The village returns to normal.`, 'neutral');
      state.festival = null;
      state.townHallFestivalCooldownUntilTick = state.tick + getTownHallFestivalCooldownTicks();
    }
  }
}


export function tickDailyWorldEvents(state: WorldState, ctx: TickContext, allAlive: Entity[], counts: PopulationCounts): void {
  syncGenealogyRegistry(state);
  // Catch burials delayed by missing or full graveyards; constant-time when none await.
  assignPendingGraves(state);
  // Frontier systems
  tickVisitorGroups(state, allAlive);
  tickVillageRequests(state);
  tickVisitorQuest(state);
  tickLeaderPromise(state);
  // First-session arc (year 0 only): welcome, wolf choice, ranger's memory, Old Kaia's winter quest.
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
  tickPrisonGuardDuty(state);
  tickFamineDesperation(state, allAlive);
  tickElectionPromises(state);
  tickGuidedCampaign(state);
  // Watchtowers reveal marching raiders earlier than patrols (daily, bounded).
  detectRaidersFromWatchtowers(state, allAlive);
  tickWorldRivalSettlements(state, allAlive);

  // Population cleanup and immigration remain in tickLayerDaily.
  tickFestivals(state, counts);

  // Every 3 days — soft wildlife floor so passive play doesn't empty the map by mid-year
  if (state.tick > 0 && getAbsoluteCalendarDay(state.tick) % 3 === 0) {
    replenishDepletedWildlife(state, (entity) => pushNewEntity(state, ctx, entity));
  }
  // Replenished wildlife reaches the working list and the eco indexes at this point of use.
  mergeNewEntitiesIntoAlive(allAlive, ctx.newEntities);

  // Eco indexes refresh once per day (before the valley stage consumes them)
  tickEcosystemMetrics(state, countLivingPopulation(allAlive, ctx.newEntities), ctx.updatedBuildings);

  // Valley ecology stage, reading the eco indexes refreshed just above. It runs after this day's
  // building production, so its farm/hunt multipliers land one day late — always behind the warning.
  tickValleyEcologyStage(state);

  // Autumn deer migration — herds arrive, graze, and leave with memory
  tickMigration(state, allAlive, ctx);

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

  if (state.year > 0 && state.year !== state.lastEventYear) {
    state.lastEventYear = state.year;
    const rolled = rollYearlyWorldEvent(
      state, allAlive, ctx.updatedBuildings, ctx.width, ctx.height,
      () => state.nextEntityId++,
      // The context routes these spawns through `pushNewEntity`, so they reach the spatial grids and
      // `ctx.newEntities` inside this tick.
      ctx,
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
    const midEvent = tryMidYearVisitorEvent(state, allAlive, ctx.updatedBuildings, ctx);
    if (midEvent) {
      state.activeEvent = midEvent;
      trackYearEvent(state, midEvent.title);
      addNotification(state, midEvent.title, midEvent.description, 'event');
    }
  }

  // First-week visitor
  if (!state.firstWeekVisitorSpawned) {
    const firstWeekEvent = tryFirstWeekVisitor(state, allAlive, ctx.updatedBuildings, ctx);
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

  // Election buildup and ceremonies. The vacancy campaign is due on a fractional date, so it is
  // evaluated daily; the term election stays a year-rollover decision.
  const vacancyCeremony = tryStartVacancyElectionCeremony(state, state.year, state.dayInYear);

  const prevCalendarDay = state.tick <= 1 ? 0 : getCalendarDay(state.tick - 1);
  const yearRollover = state.dayInYear === 0 && prevCalendarDay > 0;
  let termCeremony = false;
  if (yearRollover) {
    const buildupNews = tickElectionBuildup(state, state.year, yearRollover);
    if (buildupNews) {
      addBigNews(state, buildupNews.title, buildupNews.message, 'neutral');
      addNotification(state, buildupNews.title, buildupNews.message, 'event');
    }

    termCeremony = !vacancyCeremony
      && tryStartTermElectionCeremony(state, state.year, state.dayInYear);
  }

  if (vacancyCeremony || termCeremony) {
    addBigNews(
      state,
      '🗳️ Election Day',
      `Settlers gather for the leadership election (Year ${displayYear(state.year)}). Gossip, tension, then the merit reveal — and a village party after.`,
      'neutral',
    );
    addNotification(
      state,
      '🗳️ Election Day',
      `Year ${displayYear(state.year)} leadership election — villagers gathering now.`,
      'event',
    );
  }

  
}
