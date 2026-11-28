import type { WorldState } from './gameTypes';
import { getEcosystemHealth, PRESERVE_HEALTH_BONUS } from './dailyEcology';

interface EcosystemBreakdownLine {
  label: string;
  delta: number;
  detail: string;
}

export interface EcosystemBreakdown {
  health: number;
  buildingCount?: number;
  buildingImpact?: number;
  pollutionLevel: number;
  pollutionPenalty?: number;
  wildlifeCount?: number;
  wildlifeBonus?: number;
  lines: EcosystemBreakdownLine[];
  summary: string;
}

/**
 * Read-only explanation of the ecosystem-health score: reports the value its owner recorded and
 * derives every line from the same inputs, so the Nature tab cannot disagree with the Health shown.
 */
export function getEcosystemBreakdown(state: WorldState): EcosystemBreakdown {
  const health = getEcosystemHealth(state);
  const metrics = state.settledEcology;
  if (!metrics) return {
    health,
    pollutionLevel: state.pollutionLevel,
    lines: [{ label: 'Recorded health', delta: health, detail: 'No settled breakdown yet' }],
    summary: 'The detailed explanation will be available after the next ecology settlement.',
  };

  const lines: EcosystemBreakdownLine[] = [
    { label: 'Base', delta: 100, detail: 'Starting wilderness score' },
    {
      label: 'Town footprint',
      delta: -metrics.buildingImpact,
      detail: `${metrics.occupiedLandPercent.toFixed(1)}% weighted buildable land occupied by ${metrics.playerCompletedBuildings} completed buildings`,
    },
    {
      label: 'Pollution',
      delta: -metrics.pollutionPenalty,
      detail: `${metrics.pollutionLevel}% settled pollution ÷ 2; ${metrics.industrialEmissions.toFixed(1)} industrial emissions before map scaling${metrics.forestryReduced ? ' (forestry research halves industrial emissions)' : ''}${state.pollutionLevel !== metrics.pollutionLevel ? `; current pollution ${state.pollutionLevel}% after story adjustments` : ''}`,
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
      detail: `${metrics.preserveCount} completed preserve${metrics.preserveCount === 1 ? '' : 's'}; up to +${PRESERVE_HEALTH_BONUS} each, total capped`,
    });
  }

  const rawTotal = lines.reduce((total, line) => total + line.delta, 0);
  if (rawTotal !== Math.round(metrics.health)) {
    lines.push({ label: 'Score limit', delta: Math.round(metrics.health) - rawTotal, detail: 'Health is rounded and limited to 0–100' });
  }

  const storyAdjustment = health - Math.round(metrics.health);
  if (storyAdjustment !== 0) {
    lines.push({ label: 'Story adjustments', delta: storyAdjustment, detail: 'Net change to the recorded health since calculation' });
  }

  let summary = 'Early wilderness starts at ~80% — zero wildlife carries a −20 baseline; keep predators and prey balanced.';
  if (health < 30) {
    summary = 'Land under stress — protect habitat, reduce industrial emissions and maintain healthy wildlife.';
  } else if (health < 60) {
    summary = 'Moderate pressure — expansion and pollution are catching up with the wild.';
  }

  return {
    health,
    buildingCount: metrics.playerCompletedBuildings,
    buildingImpact: metrics.buildingImpact,
    pollutionLevel: state.pollutionLevel,
    pollutionPenalty: metrics.pollutionPenalty,
    wildlifeCount: metrics.totalWildlife,
    wildlifeBonus: metrics.wildlifeBonus,
    lines,
    summary,
  };
}
