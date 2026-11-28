import type { Building, WildlifeCounts, WorldState } from './gameTypes';
import { BuildingType, BUILDING_CONFIGS, MAP_SIZE_DIMENSIONS, MapSize } from './gameTypes';
import { getWorkdayAttendance } from './scheduleFatigue';
import { TICKS_PER_HOUR } from './dayCycleClock';
import { getWorkSchedule, getWorkScheduleHours } from './workSchedule';
import { isPlayerHuman } from './playerHuman';
import type { PopulationCounts } from './entityCounts';
import { hasTech } from './simHelpers';

/** Full-shift industrial pollution on a medium map; extraction is heavier than craft. */
const INDUSTRIAL_EMISSIONS: Partial<Record<BuildingType, number>> = {
  [BuildingType.Blacksmith]: 4,
  [BuildingType.Mill]: 1,
  [BuildingType.Workshop]: 2,
  [BuildingType.Mine]: 5,
  [BuildingType.Quarry]: 4,
  [BuildingType.LumberMill]: 2,
};

/** Land disturbance weights, independent of decorative building count. */
const LOW_IMPACT_FOOTPRINT: Partial<Record<BuildingType, number>> = {
  [BuildingType.Road]: 0.1,
  [BuildingType.Bridge]: 0.1,
  [BuildingType.GroundReinforcement]: 0.1,
  [BuildingType.Garden]: 0.1,
  [BuildingType.Statue]: 0.1,
  [BuildingType.Lamp]: 0.1,
  [BuildingType.Fence]: 0.1,
  [BuildingType.WildlifePreserve]: 0,
  [BuildingType.Farm]: 0.5,
  [BuildingType.HuntingSpot]: 0.25,
  [BuildingType.FishingSpot]: 0.25,
};
const MAX_PRESERVE_HEALTH_BONUS = 20;
const MEDIUM_MAP_AREA = MAP_SIZE_DIMENSIONS[MapSize.Medium].width * MAP_SIZE_DIMENSIONS[MapSize.Medium].height;

const IDEAL_WILDLIFE = 80;

/** Settlers per point of population pollution: 300 / 1,000 / 2,500 colonies grade 12 / 40 / 100. */
const HUMAN_POLLUTION_PER_POINT = 25;
/** Each Wildlife Preserve damps the whole pollution score by 5%, floored so it never erases it. */
const POLLUTION_PRESERVE_DAMPING = 0.05;
const POLLUTION_PRESERVE_FLOOR = 0.5;

/** Ecosystem health a completed Wildlife Preserve adds (advertised in the build panel). */
export const PRESERVE_HEALTH_BONUS = 4;

/**
 * Ecosystem health a world with no recorded score reads as: the 0–100 scale's 50 midpoint, so a
 * missing metric describes neither a healthy valley nor a collapsed one.
 */
export const UNKNOWN_ECOSYSTEM_HEALTH = 50;

/**
 * The single reader of the ecosystem-health score, so no two panels can disagree about one valley.
 */
export function getEcosystemHealth(state: WorldState): number {
  return state.ecosystemHealth ?? UNKNOWN_ECOSYSTEM_HEALTH;
}

/** The single writer of the score: clamps to the 0–100 scale the readers assume. */
function setEcosystemHealth(state: WorldState, value: number): void {
  state.ecosystemHealth = Math.max(0, Math.min(100, value));
}

/**
 * A story-driven adjustment to the derived ecosystem-health score: write through now, and queue the
 * same delta so the next recompute consumes it once — never erased, never double-counted.
 */
export function adjustEcosystemHealth(state: WorldState, delta: number): void {
  if (!Number.isFinite(delta) || delta === 0) return;
  setEcosystemHealth(state, getEcosystemHealth(state) + delta);
  state.pendingEcosystemHealthDelta = (state.pendingEcosystemHealthDelta ?? 0) + delta;
}

/** Adjust the pollution level. Same two jobs as {@link adjustEcosystemHealth}. */
export function adjustPollutionLevel(state: WorldState, delta: number): void {
  if (!Number.isFinite(delta) || delta === 0) return;
  state.pollutionLevel = Math.max(0, Math.min(100, state.pollutionLevel + delta));
  state.pendingPollutionDelta = (state.pendingPollutionDelta ?? 0) + delta;
}

/** The wildlife tally plus the settler count the ecosystem-health score reads. */
export type EcosystemCounts = WildlifeCounts & { humans: number };

export interface EcosystemMetrics {
  /** Completed player (non-rival) buildings — the town footprint. */
  playerCompletedBuildings: number;
  buildingImpact: number;
  /** Weighted land use as a percentage of the map's buildable habitat. */
  occupiedLandPercent: number;
  industrialEmissions: number;
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

/**
 * Calculates the Shannon-Wiener biodiversity index (H') for the wildlife population.
 * H' = -sum(p_i * ln(p_i)) where p_i is the relative abundance of each species.
 */
function calculateBiodiversityIndex(counts: PopulationCounts): number {
  const speciesCounts = [
    counts.rabbits,
    counts.deer,
    counts.wolves,
    counts.foxes,
    counts.werewolves,
    counts.wildkin,
  ];

  let total = 0;
  for (let i = 0; i < speciesCounts.length; i++) {
    total += speciesCounts[i];
  }

  if (total === 0) return 0;

  let entropy = 0;
  for (let i = 0; i < speciesCounts.length; i++) {
    const count = speciesCounts[i];
    if (count > 0) {
      const proportion = count / total;
      entropy -= proportion * Math.log(proportion);
    }
  }

  return entropy;
}

/**
 * The single definition of the ecosystem-health score. `tickEcosystemMetrics`
 * writes it to state and `ecoBreakdown` explains it, so the two cannot drift.
 */
export function calculateEcosystemMetrics(
  state: WorldState,
  counts: EcosystemCounts,
  buildings: Building[],
): EcosystemMetrics {
  let industrialCount = 0;
  let playerCompletedBuildings = 0;
  let preserveCount = 0;
  let disturbedArea = 0;
  let industrialEmissions = 0;
  const mapArea = state.width > 0 && state.height > 0 ? state.width * state.height : MEDIUM_MAP_AREA;
  const buildableFraction = state.worldMap?.stats?.__buildable ?? 1;
  const habitatArea = mapArea * Math.max(0.05, Math.min(1, buildableFraction));
  const mediumMapScale = MEDIUM_MAP_AREA / mapArea;
  const shiftHours = Math.max(1, getWorkScheduleHours(getWorkSchedule(state)));
  const workedHoursBySite = new Map<number, number>();
  for (const worker of state.entities ?? []) {
    if (!worker.alive || !isPlayerHuman(worker)) continue;
    const attendance = getWorkdayAttendance(worker);
    if (attendance.siteId == null || attendance.siteId < 0 || attendance.ticks <= 0) continue;
    workedHoursBySite.set(attendance.siteId, (workedHoursBySite.get(attendance.siteId) ?? 0) + attendance.ticks / TICKS_PER_HOUR);
  }

  // Single-pass building scan
  for (let i = 0; i < buildings.length; i++) {
    const building = buildings[i];
    if (!building.completed) continue;

    playerCompletedBuildings++;

    const emissions = INDUSTRIAL_EMISSIONS[building.type];
    const footprintWeight = LOW_IMPACT_FOOTPRINT[building.type] ?? (emissions == null ? 1 : 1.5);
    disturbedArea += Math.max(0, building.width) * Math.max(0, building.height) * footprintWeight;
    if (emissions != null) {
      industrialCount++;
      const capacity = Math.max(1, BUILDING_CONFIGS[building.type].maxOccupants);
      const activity = Math.min(1, (workedHoursBySite.get(building.id) ?? 0) / (capacity * shiftHours));
      industrialEmissions += emissions * activity;
    }

    if (building.type === BuildingType.WildlifePreserve) {
      preserveCount++;
    }
  }

  // Calculate Pollution: the population term grades across the scale instead of pinning at the cap.
  const pollutionMult = hasTech(state, 'forestry_2') ? 0.5 : 1.0;
  const preserveDamping = Math.max(
    POLLUTION_PRESERVE_FLOOR,
    1 - preserveCount * POLLUTION_PRESERVE_DAMPING,
  );
  const rawPollution = (industrialEmissions * pollutionMult
    + counts.humans / HUMAN_POLLUTION_PER_POINT) * mediumMapScale * preserveDamping;
  const pollutionLevel = Math.max(0, Math.min(100, Math.floor(rawPollution)));

  // Calculate Total Wildlife & Ratio
  const totalWildlife =
    counts.rabbits +
    counts.deer +
    counts.wolves +
    counts.foxes +
    counts.werewolves +
    counts.wildkin;
  const wildlifeRatio = Math.min(1.0, totalWildlife / IDEAL_WILDLIFE);

  // Calculate Ecosystem Health (0 - 100)
  const occupiedLandPercent = Math.min(100, 100 * disturbedArea / habitatArea);
  const buildingImpact = Math.round(occupiedLandPercent);
  const pollutionPenalty = Math.floor(pollutionLevel / 2);
  const preserveBonus = Math.min(MAX_PRESERVE_HEALTH_BONUS, preserveCount * PRESERVE_HEALTH_BONUS);
  const wildlifeBonus = wildlifeRatio * 30 - 20;

  const rawEcoHealth = 100 - buildingImpact - pollutionPenalty + preserveBonus + wildlifeBonus;
  const health = Math.max(0, Math.min(100, rawEcoHealth));

  return {
    playerCompletedBuildings,
    buildingImpact,
    occupiedLandPercent,
    industrialEmissions,
    industrialCount,
    pollutionLevel,
    pollutionPenalty,
    preserveCount,
    preserveBonus,
    totalWildlife,
    wildlifeRatio,
    wildlifeBonus,
    health,
  };
}

/**
 * Refreshes daily-only ecology indexes and applies the day's queued story adjustments once, before
 * the valley stage reads them; the daily layer owns the call order.
 */
export function tickEcosystemMetrics(
  state: WorldState,
  counts: PopulationCounts,
  buildings: Building[],
): void {
  const metrics = calculateEcosystemMetrics(state, counts, buildings);
  state.pollutionLevel = metrics.pollutionLevel;
  setEcosystemHealth(state, Math.round(metrics.health));

  // Apply the day's queued story adjustments on top of the recompute, then clear them.
  const healthDelta = state.pendingEcosystemHealthDelta ?? 0;
  if (healthDelta !== 0) {
    setEcosystemHealth(state, getEcosystemHealth(state) + healthDelta);
    state.pendingEcosystemHealthDelta = 0;
  }
  const pollutionDelta = state.pendingPollutionDelta ?? 0;
  if (pollutionDelta !== 0) {
    state.pollutionLevel = Math.max(0, Math.min(100, state.pollutionLevel + pollutionDelta));
    state.pendingPollutionDelta = 0;
  }

  // Calculate Biodiversity
  state.biodiversityIndex = calculateBiodiversityIndex(counts);
}