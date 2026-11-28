export type ValleyStage = 'stable' | 'strained' | 'damaged' | 'collapse';

/** Settled ecological score inputs; shared state contract without simulation dependencies. */
export interface EcosystemMetrics {
  /** Completed player (non-rival) buildings — the town footprint. */
  playerCompletedBuildings: number;
  buildingImpact: number;
  /** Weighted land use as a percentage of the map's buildable habitat. */
  occupiedLandPercent: number;
  industrialEmissions: number;
  forestryReduced: boolean;
  /** Completed industrial buildings of any faction, before the forestry multiplier. */
  industrialCount: number;
  pollutionLevel: number;
  pollutionPenalty: number;
  preserveCount: number;
  preserveBonus: number;
  /** Rabbits + deer + wolves + foxes + werewolves + wildkin — every species the score counts. */
  totalWildlife: number;
  wildlifeRatio: number;
  wildlifeBonus: number;
  /** Clamped to 0-100 but not rounded; `tickEcosystemMetrics` stores the rounded value. */
  health: number;
}
