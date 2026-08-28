import type { WorldState, Entity } from './gameTypes';
import type { PopulationCounts } from './entityCounts';
import type { TickContext } from './simulation/simulationTypes';
import { BuildingType } from './gameTypes';
import { TICKS_PER_DAY, FESTIVAL_CHECK_TICKS, getAbsoluteCalendarDay, DAYS_PER_YEAR, getCalendarDay, isNewCalendarDayTick } from './dayCycle';

import { addBigNews, addNotification } from './simEffects';
import { logEvent } from './eventLog';
import { tickLeaderVacancy, tickElectionBuildup, tryStartVacancyElectionCeremony, tryStartDecennialElectionCeremony } from './villageLeadership';
import { getTownHallFestivalCooldownTicks } from './townHall';

import { rollYearlyWorldEvent, tryFirstWeekVisitor, tryMidYearVisitorEvent, tickRivalSettlements, tickVisitorGroups, tickVillageRequests } from './groupEvents';
import { tickVisitorQuest } from './visitorQuest';
import { tickLeaderPromise } from './villageLeadership';
import { tickPendingOutgoingRaidEvents, tickPendingRaidEvents } from './frontierCombat';
import { maybeOfferWelcome, maybeOfferWolfChoice, maybeOfferRangerVisit, maybeOfferGriefBeat, maybeOfferHowlerRumor, maybeOfferWinterPrep, tickWinterFreezeCheck, tickPendingStoryEvents, maybeOfferChildrenShelter, tickChildrenShelter } from './storyEvents';
import { maybeOfferTravelingTheatre, tickTravelingTheatre } from './travelingTheatre';
import { maybeOfferDeerParliament, tickDeerParliament } from './deerParliament';
import { maybeOfferWeddingDiplomacy, tickWeddingDiplomacy } from './weddingDiplomacy';
import { maybeOfferInventionFair, tickInventionFair } from './inventionFair';
import { maybeOfferRumourLedger, tickRumourLedger } from './rumourLedger';
import { tickAnimalCare } from './animalCare';
import { tickElectionPromises } from './electionPromises';
import { tickGuidedCampaign } from './guidedCampaign';
import { detectRaidersFromWatchtowers } from './watchtowerDetection';
import { trackYearEvent } from './stats';
import { replenishDepletedWildlife } from './worldGen';
import { pushNewEntity } from './simulation/simulationEntities';
import { tickMigration } from './migration';
import { tickBeauty } from './beautyGrid';
import { tickEcosystemMetrics } from './dailyEcology';
import { tickValleyEcologyStage } from './ecologyStage';
import { decayIdleSkills } from './skills';

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


export function tickDailyWorldEvents(state: WorldState, ctx: TickContext, allAlive: Entity[], counts: PopulationCounts): void {
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

  // Population cleanup and immigration remain in tickLayerDaily.
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

  
}
