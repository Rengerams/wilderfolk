import type { Building, WildlifeCounts, WorldState } from './gameTypes';
import { BuildingType } from './gameTypes';
import type { PopulationCounts } from './entityCounts';
import { hasTech } from './simHelpers';

const INDUSTRIAL_BUILDING_TYPES: ReadonlySet<BuildingType> = new Set<BuildingType>([
  BuildingType.Blacksmith,
  BuildingType.Mill,
  BuildingType.Workshop,
  BuildingType.Mine,
  BuildingType.Quarry,
  BuildingType.LumberMill,
]);

const IDEAL_WILDLIFE = 80;

/** Ecosystem health a completed Wildlife Preserve adds (advertised in the build panel). */
export const PRESERVE_HEALTH_BONUS = 4;

/**
 * Ecosystem health a world with no recorded score reads as.
 *
 * The score runs 0–100, where 100 is pristine wilderness and 0 is a dead valley, so an
 * unrecorded value reads as the 50 midpoint: a missing metric must describe neither a healthy
 * valley (a legacy save predating the field used to read 80 to the story modules and 100 to the
 * Nature tab and one dashboard metric) nor a collapsed one (the same save read 0 in another
 * dashboard metric).
 */
export const UNKNOWN_ECOSYSTEM_HEALTH = 50;

/**
 * The single reader of the ecosystem-health score. Panels, dashboards and story modules all read
 * the valley's health through this function, so one world cannot look healthy in one place and
 * collapsed in another.
 */
export function getEcosystemHealth(state: WorldState): number {
  return state.ecosystemHealth ?? UNKNOWN_ECOSYSTEM_HEALTH;
}

/** The single writer of the score: clamps to the 0–100 scale the readers assume. */
export function setEcosystemHealth(state: WorldState, value: number): void {
  state.ecosystemHealth = Math.max(0, Math.min(100, value));
}

/**
 * A story-driven **adjustment** to the ecosystem-health score.
 *
 * Two jobs, and both are needed:
 *
 * 1. **Write through**, so the effect is visible the moment the story resolves. That is the contract
 *    the callers and their tests pin (`storyEvents.test.ts` asserts `ecosystemHealth === before - 6`
 *    on the resolved world) and it is what the card promises when it says "Ecology +6 now".
 * 2. **Queue the same delta**, because the score is *derived*: `tickEcosystemMetrics` recomputes it
 *    from buildings, pollution and wildlife once per day and assigns it outright. Twelve call sites
 *    used to write the field only — `setEcosystemHealth(state, getEcosystemHealth(state) + 6)` and
 *    `state.pollutionLevel + 0.5` — and every one of them ran *earlier in the same daily tick* than
 *    that recompute, so the value was overwritten before anything could read it. The Deer Parliament
 *    advertised "Ecology +6 now", `storyEvents` −6 / +4 / +2 / +1 / −5 / +5 / −3, and the rival "+0.5
 *    pollution": all of them were erased in the same tick.
 *
 * The queue is consumed once, immediately after the next recompute, and cleared — so a beat is a
 * one-day adjustment to a derived score, applied exactly once, never double-counted.
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
export function calculateBiodiversityIndex(counts: PopulationCounts): number {
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

  // Single-pass building scan
  for (let i = 0; i < buildings.length; i++) {
    const building = buildings[i];
    if (!building.completed) continue;

    if (building.faction !== 'rival') {
      playerCompletedBuildings++;
    }

    if (INDUSTRIAL_BUILDING_TYPES.has(building.type)) {
      industrialCount++;
    }

    if (building.type === BuildingType.WildlifePreserve) {
      preserveCount++;
    }
  }

  // Calculate Pollution
  const pollutionMult = hasTech(state, 'forestry_2') ? 0.5 : 1.0;
  const rawPollution = industrialCount * 4 * pollutionMult + counts.humans / 3;
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
  const buildingImpact = playerCompletedBuildings * 2;
  const pollutionPenalty = Math.floor(pollutionLevel / 2);
  const preserveBonus = preserveCount * PRESERVE_HEALTH_BONUS;
  const wildlifeBonus = wildlifeRatio * 30 - 20;

  const rawEcoHealth = 100 - buildingImpact - pollutionPenalty + preserveBonus + wildlifeBonus;
  const health = Math.max(0, Math.min(100, rawEcoHealth));

  return {
    playerCompletedBuildings,
    buildingImpact,
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
 * Refreshes daily-only ecology indexes before the valley stage consumes them.
 * The daily layer retains ownership of the call order and cadence.
 *
 * This is also the one place a queued story adjustment is applied: the writers run earlier in the
 * same daily tick (`dailyWorldEvents`: `tickPendingStoryEvents` / `tickDeerParliament` /
 * `tickWorldRivalSettlements` all precede this call), so without consuming them here their effect
 * lasted exactly zero ticks. Apply-then-clear, so no delta is ever double-counted on the next day.
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