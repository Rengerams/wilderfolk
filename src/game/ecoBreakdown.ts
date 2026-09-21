import { type Building, type WorldState } from './gameTypes';
import { calculateEcosystemMetrics, getEcosystemHealth, PRESERVE_HEALTH_BONUS, type EcosystemCounts } from './dailyEcology';
import { hasTech } from './simHelpers';

export interface EcosystemBreakdownLine {
  label: string;
  delta: number;
  detail: string;
}

export interface EcosystemBreakdown {
  health: number;
  buildingCount: number;
  buildingImpact: number;
  pollutionLevel: number;
  pollutionPenalty: number;
  wildlifeCount: number;
  wildlifeBonus: number;
  lines: EcosystemBreakdownLine[];
  summary: string;
}

/**
 * Read-only explanation of the ecosystem-health score. The score itself is
 * owned by `dailyEcology.tickEcosystemMetrics`; this module always reports the
 * value that owner recorded (`state.ecosystemHealth`) and derives every line
 * from the same inputs through the owner's `calculateEcosystemMetrics`, so the
 * Nature tab's "Why this score" lines cannot disagree with the Health shown
 * above them.
 */
export function getEcosystemBreakdown(state: WorldState, buildings: Building[] = state.buildings): EcosystemBreakdown {
  const counts: EcosystemCounts = { ...state.wildlifeCounts, humans: state.humanPopulation };
  const metrics = calculateEcosystemMetrics(state, counts, buildings);
  const hasForestry2 = hasTech(state, 'forestry_2');
  const health = getEcosystemHealth(state);

  const lines: EcosystemBreakdownLine[] = [
    { label: 'Base', delta: 100, detail: 'Starting wilderness score' },
    {
      label: 'Town footprint',
      delta: -metrics.buildingImpact,
      detail: `${metrics.playerCompletedBuildings} player buildings × −2 each`,
    },
    {
      label: 'Pollution',
      delta: -metrics.pollutionPenalty,
      detail: `${metrics.pollutionLevel}% pollution ÷ 2${hasForestry2 ? ' (forestry_2 halved industrial pollution)' : ''}`,
    },
    {
      label: 'Wildlife',
      delta: metrics.wildlifeBonus,
      detail: `${metrics.totalWildlife} animals (rabbits+deer+wolves+foxes+moon howlers+wildkin) — scales to ~80 ideal; −20 baseline at zero wildlife`,
    },
  ];
  if (metrics.preserveBonus > 0) {
    lines.push({
      label: 'Wildlife preserves',
      delta: metrics.preserveBonus,
      detail: `${metrics.preserveCount} completed preserve${metrics.preserveCount === 1 ? '' : 's'} × +${PRESERVE_HEALTH_BONUS} each`,
    });
  }

  let summary = 'Early wilderness starts at ~80% — zero wildlife carries a −20 baseline; keep predators and prey balanced.';
  if (health <= 0 && metrics.playerCompletedBuildings >= 25) {
    summary = 'Town scale dominates: building footprint and pollution outweigh wildlife. Eco tracks land pressure — not a failure state for balanced towns.';
  } else if (health < 30) {
    summary = 'Land under stress — fewer buildings, less industry, and healthier wildlife raise the score.';
  } else if (health < 60) {
    summary = 'Moderate pressure — expansion and pollution are catching up with the wild.';
  }

  return {
    health,
    buildingCount: metrics.playerCompletedBuildings,
    buildingImpact: metrics.buildingImpact,
    pollutionLevel: metrics.pollutionLevel,
    pollutionPenalty: metrics.pollutionPenalty,
    wildlifeCount: metrics.totalWildlife,
    wildlifeBonus: metrics.wildlifeBonus,
    lines,
    summary,
  };
}
