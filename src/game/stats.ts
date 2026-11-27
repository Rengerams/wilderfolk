import type { Entity, WorldState } from './gameTypes';
import { EntityType as ET } from './gameTypes';
import { isPlayerHuman, isPlayerHumanShiftOwner } from './playerHuman';
import { citizenFullName } from './citizenId';
import { bondCensus, isMarriedOrExpecting } from './relationships';
import { getEcosystemHealth } from './dailyEcology';
import type { ResourceKey } from './resourceTypes';
import type { BondCensus } from './bondTypes';
import type { YearlyStats, LifetimeStats, GatheredResources } from './statsRecords';

export function createEmptyLifetimeStats(): LifetimeStats {
  return {
    totalHumansBorn: 0,
    totalHumansDied: 0,
    totalMarriages: 0,
    totalBuildings: 0,
    totalBuildingsUpgraded: 0,
    totalResourcesGathered: { wood: 0, stone: 0, food: 0, gold: 0 },
    disastersSurvived: 0,
    technologiesResearched: 0,
    tradeRoutesEstablished: 0,
    tradeCaravansCompleted: 0,
    goldFromTradeRoutes: 0,
    longestLivingHuman: { name: '', age: 0 },
    largestPopulation: { count: 0, year: 0 },
    mostProductiveYear: { year: 0, buildings: 0 },
  };
}

/** A loaded `lifetimeStats`: every one of the record's 14 fields falls back to its empty value. */
export function normalizeLifetimeStats(value: unknown): LifetimeStats {
  const empty = createEmptyLifetimeStats();
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return empty;
  const saved = value as Partial<LifetimeStats>;
  const count = (field: unknown, fallback: number): number =>
    typeof field === 'number' && Number.isFinite(field) ? field : fallback;
  const record = (field: unknown): Record<string, unknown> =>
    field !== null && typeof field === 'object' && !Array.isArray(field)
      ? (field as Record<string, unknown>)
      : {};
  const gathered = record(saved.totalResourcesGathered);
  const longest = record(saved.longestLivingHuman);
  const largest = record(saved.largestPopulation);
  const productive = record(saved.mostProductiveYear);
  return {
    totalHumansBorn: count(saved.totalHumansBorn, empty.totalHumansBorn),
    totalHumansDied: count(saved.totalHumansDied, empty.totalHumansDied),
    totalMarriages: count(saved.totalMarriages, empty.totalMarriages),
    totalBuildings: count(saved.totalBuildings, empty.totalBuildings),
    totalBuildingsUpgraded: count(saved.totalBuildingsUpgraded, empty.totalBuildingsUpgraded),
    totalResourcesGathered: {
      wood: count(gathered.wood, empty.totalResourcesGathered.wood),
      stone: count(gathered.stone, empty.totalResourcesGathered.stone),
      food: count(gathered.food, empty.totalResourcesGathered.food),
      gold: count(gathered.gold, empty.totalResourcesGathered.gold),
    },
    disastersSurvived: count(saved.disastersSurvived, empty.disastersSurvived),
    technologiesResearched: count(saved.technologiesResearched, empty.technologiesResearched),
    tradeRoutesEstablished: count(saved.tradeRoutesEstablished, empty.tradeRoutesEstablished),
    tradeCaravansCompleted: count(saved.tradeCaravansCompleted, empty.tradeCaravansCompleted),
    goldFromTradeRoutes: count(saved.goldFromTradeRoutes, empty.goldFromTradeRoutes),
    longestLivingHuman: {
      name: typeof longest.name === 'string' ? longest.name : empty.longestLivingHuman.name,
      age: count(longest.age, empty.longestLivingHuman.age),
    },
    largestPopulation: {
      count: count(largest.count, empty.largestPopulation.count),
      year: count(largest.year, empty.largestPopulation.year),
    },
    mostProductiveYear: {
      year: count(productive.year, empty.mostProductiveYear.year),
      buildings: count(productive.buildings, empty.mostProductiveYear.buildings),
    },
  };
}

/**
 * The single writer of `lifetimeStats.totalResourcesGathered`: adds the amount storage accepted, so a
 * capped or partial deposit records only what entered. Iron is ignored.
 */
export function recordResourcesGathered(state: WorldState, type: ResourceKey, accepted: number): void {
  if (!(accepted > 0) || type === 'iron') return;
  // A partial fixture can omit the record; a world without it has nothing to update.
  const gathered = state.lifetimeStats.totalResourcesGathered as GatheredResources | undefined;
  if (!gathered) return;
  gathered[type] = (gathered[type] ?? 0) + accepted;
}

/**
 * Record a settler's age at the moment the death commits. The year-end scan sees only the living,
 * so an elder who died in June never reached the record.
 */
export function recordHumanDeath(state: WorldState, entity: Entity): void {
  if (!entity.name || !(entity.age > state.lifetimeStats.longestLivingHuman.age)) return;
  state.lifetimeStats.longestLivingHuman = { name: citizenFullName(entity), age: entity.age };
}

/**
 * Tally the entities alive at tick start that are not now. Ownership decides before the visual type,
 * so a cursed settler dying in wolf form counts as a human and a foreign human counts as neither.
 */
export function tallyTickDeaths(state: WorldState, aliveAtTickStart: readonly Entity[]): void {
  let deadHumans = 0;
  let deadAnimals = 0;
  for (const entity of aliveAtTickStart) {
    if (entity.alive) continue;
    if (isPlayerHumanShiftOwner(entity)) {
      deadHumans++;
      recordHumanDeath(state, entity);
    } else if (entity.type !== ET.Human && entity.type !== ET.Tree && entity.type !== ET.Grass) {
      deadAnimals++;
    }
  }
  if (deadHumans === 0 && deadAnimals === 0) return;
  const tally = state.deathsThisYear ?? (state.deathsThisYear = { humans: 0, animals: 0 });
  tally.humans += deadHumans;
  tally.animals += deadAnimals;
}

export function recordYearlyStats(state: WorldState, forYear?: number): YearlyStats {
  const entities = state.entities;
  const alive = entities.filter(e => e.alive);
  const statsYear = forYear ?? state.year;

  const humans = alive.filter((e) => e.type === ET.Human && isPlayerHuman(e));
  const prevYearStats = state.yearlyStats[state.yearlyStats.length - 1];

  // Humans born during this calendar year (birthYear set at birth in `humanLifecycle`)
  const humanBirths = humans.filter((h) => h.birthYear === statsYear).length;

  // Current married population is a stock; completed marriage events are a flow.
  // Divorce and death must not subtract completed weddings.
  const marriedHumans = humans.filter(isMarriedOrExpecting).length;
  const marriagesThisYear = state.eventLog.filter(event => event.type === 'marriage' && event.year === statsYear).length;

  const animalTypes = new Set<ET>([
    ET.Rabbit, ET.Deer, ET.Wolf, ET.Fox, ET.Werewolf, ET.Wildkin,
  ]);
  const animalBirths = alive.filter(
    (e) => animalTypes.has(e.type) && e.birthYear === statsYear && e.birthYear >= 0,
  ).length;

  const currentUpgrades = state.buildings.reduce(
    (sum, b) => sum + (b.level > 1 ? b.level - 1 : 0),
    0,
  );
  // `upgradedTotal` is the cumulative baseline and `buildings.upgraded` only this year's delta, so
  // comparing the cumulative count against the delta reported phantom upgrades.
  const prevUpgrades = prevYearStats?.buildings.upgradedTotal ?? 0;
  const upgradesThisYear = Math.max(0, currentUpgrades - prevUpgrades);

  // Friendships, reported once a year: `bondsFormed` needs a baseline. A fresh world's first year has
  // none, an older save's growth is unknown (omitted, never wrong), otherwise it is the difference.
  const census = bondCensus(humans);
  const prevSocial = prevYearStats?.social;
  const social: BondCensus & { bondsFormed?: number } = {
    ...census,
    bondsFormed: prevSocial
      ? Math.max(0, census.closeBonds - prevSocial.closeBonds)
      : prevYearStats
        ? undefined
        : census.closeBonds,
  };

  const stats: YearlyStats = {
    year: statsYear,
    population: {
      humans: humans.length,
      rabbits: state.wildlifeCounts.rabbits,
      deer: state.wildlifeCounts.deer,
      wolves: state.wildlifeCounts.wolves,
      foxes: state.wildlifeCounts.foxes,
    },
    births: {
      humans: humanBirths,
      animals: animalBirths,
    },
    deaths: {
      // `gameTick` tallies these per tick, because by the time a year closes `state.entities`
      // holds only the living (the old `!e.alive` filters here always produced 0).
      humans: state.deathsThisYear?.humans ?? 0,
      animals: state.deathsThisYear?.animals ?? 0,
    },
    marriages: marriagesThisYear,
    marriedCount: marriedHumans,
    buildings: {
      completed: state.buildings.filter(b => b.completed).length,
      total: state.totalBuildingsCompleted,
      upgraded: upgradesThisYear,
      upgradedTotal: currentUpgrades,
    },
    resources: { ...state.resources },
    ecosystem: {
      health: getEcosystemHealth(state),
      pollution: state.pollutionLevel,
      biodiversity: state.biodiversityIndex,
    },
    events: [...(state.eventsThisYear ?? [])],
    social,
  };

  return stats;
}

export function updateLifetimeStats(state: WorldState, stats: LifetimeStats): LifetimeStats {
  const s = { ...stats };

  // The yearly window is capped at 50 records, so summing it shrinks after year 50. Carry the
  // latest record forward instead: the first reconciliation still adopts the whole stored window.
  const latestYear = state.yearlyStats[state.yearlyStats.length - 1];
  const windowBirths = state.yearlyStats.reduce((sum, y) => sum + y.births.humans, 0);
  const windowDeaths = state.yearlyStats.reduce((sum, y) => sum + (y.deaths?.humans ?? 0), 0);
  s.totalHumansBorn = Math.max(windowBirths, stats.totalHumansBorn + (latestYear?.births.humans ?? 0));
  s.totalHumansDied = Math.max(
    windowDeaths,
    stats.totalHumansDied + (latestYear?.deaths?.humans ?? 0),
  );
  s.totalBuildings = state.totalBuildingsCompleted;
  s.technologiesResearched = state.unlockedTechs.length;
  if (latestYear) {
    s.totalMarriages += latestYear.marriages;
    s.totalBuildingsUpgraded += latestYear.buildings.upgraded;
  }
  // tradeRoutesEstablished incremented in establishTradeRoute; disastersSurvived in worldEvents.ts

  // Find longest living human — the player's own settlers only, never a rival or visitor.
  const allHumans = state.entities.filter(isPlayerHumanShiftOwner);
  for (const h of allHumans) {
    if (h.age > s.longestLivingHuman.age && h.name) {
      s.longestLivingHuman = { name: citizenFullName(h), age: h.age };
    }
  }

  // Find largest population year
  for (const ys of state.yearlyStats) {
    if (ys.population.humans > s.largestPopulation.count) {
      s.largestPopulation = { count: ys.population.humans, year: ys.year };
    }
  }

  // Most productive year, on the same scan as the two records above. Guarded on a non-zero
  // completion count so a year that built nothing cannot take the record from the empty default.
  for (const ys of state.yearlyStats) {
    if (ys.buildings.completed > s.mostProductiveYear.buildings) {
      s.mostProductiveYear = { year: ys.year, buildings: ys.buildings.completed };
    }
  }

  return s;
}

/** Record a world-event title for the closing year's statistics. */
export function trackYearEvent(state: WorldState, title: string): void {
  if (!state.eventsThisYear) state.eventsThisYear = [];
  if (!state.eventsThisYear.includes(title)) {
    state.eventsThisYear.push(title);
  }
}
