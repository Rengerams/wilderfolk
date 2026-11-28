import type { ResourceKey } from './resourceTypes';
import type { BondCensus } from './bondTypes';

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
  /** Married player humans at year-end (population stock, not wedding count). */
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
  /** Open-year event tally, absent only on pre-event-accounting saves. */
  marriagesThisYear?: number;
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

