import type { GameState } from './gameEngine';
import { EntityType as ET } from './gameEngine';
import { isPlayerHuman } from './groupEvents';

export interface YearlyStats {
  year: number;
  population: {
    humans: number;
    rabbits: number;
    deer: number;
    wolves: number;
    foxes: number;
    trees: number;
  };
  births: { humans: number; animals: number };
  deaths: { humans: number; animals: number };
  marriages: number;
  /** Married player humans at year-end (for year-over-year marriage delta). */
  marriedCount: number;
  buildings: { completed: number; total: number; upgraded: number };
  resources: { wood: number; stone: number; food: number; gold: number };
  ecosystem: { health: number; pollution: number; biodiversity: number };
  events: string[];
}

export interface LifetimeStats {
  totalHumansBorn: number;
  totalHumansDied: number;
  totalMarriages: number;
  totalBuildings: number;
  totalBuildingsUpgraded: number;
  totalResourcesGathered: { wood: number; stone: number; food: number; gold: number };
  disastersSurvived: number;
  technologiesResearched: number;
  tradeRoutesEstablished: number;
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
    longestLivingHuman: { name: '', age: 0 },
    largestPopulation: { count: 0, year: 0 },
    mostProductiveYear: { year: 0, buildings: 0 },
  };
}

export function recordYearlyStats(state: GameState, forYear?: number): YearlyStats {
  const entities = state.entities;
  const alive = entities.filter(e => e.alive);
  const statsYear = forYear ?? state.year;

  const humans = alive.filter((e) => e.type === ET.Human && isPlayerHuman(e));
  const prevYearStats = state.yearlyStats[state.yearlyStats.length - 1];

  // Humans born during this calendar year (birthYear set at birth in lifeSimulation)
  const humanBirths = humans.filter((h) => h.birthYear === statsYear).length;

  const marriedHumans = humans.filter(h => h.relationshipStatus === 'married').length;
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
  const prevUpgrades = prevYearStats?.buildings.upgraded ?? 0;
  const upgradesThisYear = Math.max(0, currentUpgrades - prevUpgrades);

  const stats: YearlyStats = {
    year: statsYear,
    population: {
      humans: humans.length,
      rabbits: state.wildlifeCounts.rabbits,
      deer: state.wildlifeCounts.deer,
      wolves: state.wildlifeCounts.wolves,
      foxes: state.wildlifeCounts.foxes,
      trees: state.wildlifeCounts.trees,
    },
    births: {
      humans: humanBirths,
      animals: animalBirths,
    },
    deaths: {
      humans: entities.filter(e => e.type === ET.Human && !e.alive && e.age > 0).length - (prevYearStats?.deaths.humans || 0),
      animals: entities.filter(
        (e) => e.type !== ET.Human && e.type !== ET.Tree && e.type !== ET.Grass && !e.alive && e.age > 0,
      ).length - (prevYearStats?.deaths.animals || 0),
    },
    marriages: marriagesThisYear,
    marriedCount: marriedHumans,
    buildings: {
      completed: state.buildings.filter(b => b.completed).length,
      total: state.totalBuildingsCompleted,
      upgraded: upgradesThisYear,
    },
    resources: { ...state.resources },
    ecosystem: {
      health: state.ecosystemHealth,
      pollution: state.pollutionLevel,
      biodiversity: state.biodiversityIndex,
    },
    events: [...(state.eventsThisYear ?? [])],
  };

  return stats;
}

export function updateLifetimeStats(state: GameState, stats: LifetimeStats): LifetimeStats {
  const s = { ...stats };

  s.totalHumansBorn = state.yearlyStats.reduce((sum, y) => sum + y.births.humans, 0);
  s.totalHumansDied = state.entities.filter(e => e.type === ET.Human && !e.alive).length;
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
      s.longestLivingHuman = { name: `${h.name} ${h.surname || ''}`.trim(), age: h.age };
    }
  }

  // Find largest population year
  for (const ys of state.yearlyStats) {
    if (ys.population.humans > s.largestPopulation.count) {
      s.largestPopulation = { count: ys.population.humans, year: ys.year };
    }
  }

  return s;
}

/** Record a world-event title for the closing year's statistics. */
export function trackYearEvent(state: GameState, title: string): void {
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
