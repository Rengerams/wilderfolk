import type { Entity, WorldState } from './gameTypes';
import { EntityType as ET } from './gameTypes';
import { isPlayerHuman, isPlayerHumanShiftOwner } from './playerHuman';
import { citizenFullName } from './citizenId';
import { bondCensus, isMarriedOrExpecting, type BondCensus } from './relationships';
import { getEcosystemHealth } from './dailyEcology';
import type { ResourceKey } from './resourceTypes';

/**
 * The four resources the yearly and lifetime records account for. Iron sits outside this record:
 * `Resources` carries it, but the four-key shape is what every stored world reads.
 */
export type GatheredResources = Record<Exclude<ResourceKey, 'iron'>, number>;

export interface YearlyStats {
  year: number;
  population: {
    humans: number;
    rabbits: number;
    deer: number;
    wolves: number;
    foxes: number;
  };
  births: { humans: number; animals: number };
  deaths: { humans: number; animals: number };
  marriages: number;
  /** Married player humans at year-end (for year-over-year marriage delta). */
  marriedCount: number;
  buildings: {
    completed: number;
    total: number;
    /** Upgrades completed during this year. */
    upgraded: number;
    /** Cumulative upgrade levels standing at year end — the baseline next year's delta compares to. */
    upgradedTotal: number;
  };
  resources: GatheredResources;
  ecosystem: { health: number; pollution: number; biodiversity: number };
  /**
   * How friendships stood at year end, with the year's growth. Optional so older saves still load:
   * readers default rather than migrate, like `marriedCount` and `upgradedTotal`.
   */
  social?: BondCensus & { bondsFormed?: number };
  events: string[];
}

export interface LifetimeStats {
  totalHumansBorn: number;
  totalHumansDied: number;
  totalMarriages: number;
  totalBuildings: number;
  totalBuildingsUpgraded: number;
  totalResourcesGathered: GatheredResources;
  disastersSurvived: number;
  technologiesResearched: number;
  tradeRoutesEstablished: number;
  tradeCaravansCompleted: number;
  goldFromTradeRoutes: number;
  longestLivingHuman: { name: string; age: number };
  largestPopulation: { count: number; year: number };
  mostProductiveYear: { year: number; buildings: number };
}

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

  // Active marriages, not `=== 'married'`: conception moves both partners to `'expecting'`, so the
  // narrow test lost the couple and `floor(delta / 2)` read the marriage as never having happened.
  const marriedHumans = humans.filter(isMarriedOrExpecting).length;
  const prevMarried = prevYearStats?.marriedCount ?? 0;
  const marriagesThisYear = Math.max(0, Math.floor((marriedHumans - prevMarried) / 2));

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

  s.totalHumansBorn = state.yearlyStats.reduce((sum, y) => sum + y.births.humans, 0);
  // Summed from the yearly records, like births above, so a legacy save (whose yearly entries
  // predate the per-tick tally) simply starts accumulating from here instead of reading 0.
  s.totalHumansDied = state.yearlyStats.reduce((sum, y) => sum + (y.deaths?.humans ?? 0), 0);
  s.totalBuildings = state.totalBuildingsCompleted;
  s.technologiesResearched = state.unlockedTechs.length;
  const latestYear = state.yearlyStats[state.yearlyStats.length - 1];
  if (latestYear) {
    s.totalMarriages += latestYear.marriages;
    s.totalBuildingsUpgraded += latestYear.buildings.upgraded;
  }
  // tradeRoutesEstablished incremented in establishTradeRoute; disastersSurvived in worldEvents.ts

  // Find longest living human
  const allHumans = state.entities.filter(e => e.type === ET.Human);
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

// Simple bar chart renderer
export function drawBarChart(
  ctx: CanvasRenderingContext2D,
  data: number[],
  labels: string[],
  colors: string[],
  x: number, y: number, w: number, h: number
) {
  if (data.length === 0) return;
  const max = Math.max(...data, 1);
  const barW = w / data.length * 0.7;
  const gap = w / data.length * 0.3;

  ctx.save();
  for (let i = 0; i < data.length; i++) {
    const barH = (data[i] / max) * h;
    const bx = x + i * (barW + gap) + gap / 2;
    const by = y + h - barH;

    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(bx, by, barW, barH);

    // Label
    if (labels[i]) {
      ctx.fillStyle = '#a8a29e';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(labels[i], bx + barW / 2, y + h + 12);
    }
  }
  ctx.restore();
}

export function drawLineChart(
  ctx: CanvasRenderingContext2D,
  data: number[],
  color: string,
  x: number, y: number, w: number, h: number
) {
  if (data.length < 2) return;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const stepX = w / (data.length - 1);

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < data.length; i++) {
    const px = x + i * stepX;
    const py = y + h - ((data[i] - min) / range) * h;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();

  const fillAlpha = /^#[0-9a-fA-F]{6}$/.test(color) ? color + '20' : color;
  ctx.fillStyle = fillAlpha;
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}