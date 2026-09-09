/**
 * Citizen-first overview numbers for the full-screen People screen.
 * Presentation-only aggregation — does not mutate simulation state.
 */
import { Season, type WorldState, type Entity } from './gameTypes';
import { isPlayerHuman } from './playerHuman';
import { hasWorkAssignment, isImprisoned } from './residencyOccupancy';
import { getEconomyLedger } from './economyLedger';
import { getOpenBeds, getTotalBeds } from './populationGrowth';

export type VillageMood =
  | 'thriving'
  | 'stable'
  | 'strained'
  | 'hungry'
  | 'scandal'
  | 'cold';

export interface CitizenOverviewStats {
  total: number;
  adults: number;
  children: number;
  working: number;
  idle: number;
  imprisoned: number;
  pregnant: number;
  married: number;
  affairs: number;
  grieving: number;
  homeless: number;
  beds: number;
  openBeds: number;
  food: number;
  foodNetToday: number;
  reputation: number;
  canHeat: boolean;
  isWinter: boolean;
  mood: VillageMood;
  moodLabel: string;
  moodDetail: string;
}

function getActiveConstructionWorkers(world: WorldState): Set<number> {
  const workers = new Set<number>();
  for (const b of world.buildings) {
    if (!b.completed && b.faction !== 'rival') {
      for (const id of b.occupants) workers.add(id);
    }
  }
  return workers;
}

function deriveMood(stats: Omit<CitizenOverviewStats, 'mood' | 'moodLabel' | 'moodDetail'>): {
  mood: VillageMood;
  moodLabel: string;
  moodDetail: string;
} {
  if (stats.isWinter && !stats.canHeat) {
    return {
      mood: 'cold',
      moodLabel: 'Freezing',
      moodDetail: 'Winter heat failed — people are cold.',
    };
  }
  if (stats.food < Math.max(20, stats.total * 2)) {
    return {
      mood: 'hungry',
      moodLabel: 'Hungry',
      moodDetail: 'Food stores look dangerously low.',
    };
  }
  if (stats.affairs > 0 || stats.imprisoned > 0) {
    return {
      mood: 'scandal',
      moodLabel: 'Trouble at home',
      moodDetail:
        stats.imprisoned > 0
          ? `${stats.imprisoned} jailed · secrets and gossip are stirring.`
          : `${stats.affairs} secret affair${stats.affairs === 1 ? '' : 's'} active.`,
    };
  }
  if (stats.openBeds <= 0 || stats.homeless > 0 || stats.idle > Math.max(2, stats.adults * 0.35)) {
    return {
      mood: 'strained',
      moodLabel: 'Under pressure',
      moodDetail:
        stats.openBeds <= 0 || stats.homeless > 0
          ? 'Housing is tight.'
          : 'Many adults are idle without work.',
    };
  }
  if (stats.foodNetToday >= 0 && stats.working >= stats.idle && stats.reputation >= 20) {
    return {
      mood: 'thriving',
      moodLabel: 'Thriving',
      moodDetail: 'People are housed, fed, and mostly busy.',
    };
  }
  return {
    mood: 'stable',
    moodLabel: 'Stable',
    moodDetail: 'The village is holding together.',
  };
}

export function computeCitizenOverview(world: WorldState): CitizenOverviewStats {
  const constructionWorkers = getActiveConstructionWorkers(world);
  const tick = world.tick;

  let total = 0;
  let adults = 0;
  let children = 0;
  let working = 0;
  let idle = 0;
  let imprisoned = 0;
  let pregnant = 0;
  let married = 0;
  let affairs = 0;
  let grieving = 0;
  let homeless = 0;

  for (const e of world.entities as Entity[]) {
    if (!e.alive || !isPlayerHuman(e)) continue;
    total++;

    if (e.pregnant) pregnant++;
    if (e.relationshipStatus === 'married' || e.relationshipStatus === 'expecting') married++;
    if (e.affairPartnerId != null && e.id < e.affairPartnerId) affairs++;
    if ((e.griefUntilTick ?? 0) > tick) grieving++;
    if (e.residenceBuildingId == null && !e.isJuvenile) homeless++;

    if (e.isJuvenile) {
      children++;
      continue;
    }

    adults++;
    if (isImprisoned(e)) {
      imprisoned++;
      continue;
    }
    if (hasWorkAssignment(e) || constructionWorkers.has(e.id)) working++;
    else idle++;
  }

  const ledger = getEconomyLedger(world);
  const produced = ledger
    ? Object.values(ledger.produced).reduce((sum, v) => sum + v, 0)
    : 0;
  const consumed = ledger
    ? Object.values(ledger.consumed).reduce((sum, v) => sum + v, 0)
    : 0;

  const base = {
    total,
    adults,
    children,
    working,
    idle,
    imprisoned,
    pregnant,
    married,
    affairs,
    grieving,
    homeless,
    beds: getTotalBeds(world),
    openBeds: getOpenBeds(world),
    food: Math.floor(world.resources.food),
    foodNetToday: produced - consumed,
    reputation: world.villageReputation,
    canHeat: world.villageCanHeat !== false,
    isWinter: world.season === Season.Winter,
  };

  const mood = deriveMood(base);
  return { ...base, ...mood };
}
