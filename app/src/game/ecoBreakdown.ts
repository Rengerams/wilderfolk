import { BuildingType, type Building, type WorldState } from './gameTypes';
import { isPlayerHuman } from './groupEvents';

const INDUSTRIAL_TYPES: BuildingType[] = [
  BuildingType.Blacksmith,
  BuildingType.Mill,
  BuildingType.Workshop,
  BuildingType.Mine,
  BuildingType.Quarry,
  BuildingType.LumberMill,
];

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

export function getEcosystemBreakdown(state: WorldState, buildings: Building[] = state.buildings): EcosystemBreakdown {
  const counts = state.wildlifeCounts;
  const totalWildlife = counts.rabbits + counts.deer + counts.wolves + counts.foxes;
  const idealWildlife = 80;
  const wildlifeRatio = Math.min(1, totalWildlife / idealWildlife);
  const playerCompletedBuildings = buildings.filter(
    (b) => b.completed && b.faction !== 'rival',
  ).length;
  const buildingImpact = playerCompletedBuildings * 2;
  const industrialCount = buildings.filter(
    (b) => b.completed && INDUSTRIAL_TYPES.includes(b.type),
  ).length;
  const hasForestry2 = state.unlockedTechs.includes('forestry_2');
  const pollutionMult = hasForestry2 ? 0.5 : 1;
  const pollutionLevel = Math.min(
    100,
    Math.floor(industrialCount * 4 * pollutionMult + (state.entities.filter((e) => e.alive && isPlayerHuman(e)).length / 3)),
  );
  const pollutionPenalty = Math.floor(pollutionLevel / 2);
  const wildlifeBonus = wildlifeRatio * 30 - 20;
  const health = Math.max(0, Math.min(100, 100 - buildingImpact - pollutionPenalty + wildlifeBonus));

  const lines: EcosystemBreakdownLine[] = [
    { label: 'Base', delta: 100, detail: 'Starting wilderness score' },
    {
      label: 'Town footprint',
      delta: -buildingImpact,
      detail: `${playerCompletedBuildings} player buildings × −2 each`,
    },
    {
      label: 'Pollution',
      delta: -pollutionPenalty,
      detail: `${pollutionLevel}% pollution ÷ 2${hasForestry2 ? ' (forestry_2 halved industrial pollution)' : ''}`,
    },
    {
      label: 'Wildlife',
      delta: wildlifeBonus,
      detail: `${totalWildlife} animals (rabbits+deer+wolves+foxes) — scales to ~80 ideal; −20 baseline at zero wildlife`,
    },
  ];

  let summary = 'Early wilderness starts at ~80% — zero wildlife carries a −20 baseline; keep predators and prey balanced.';
  if (health <= 0 && playerCompletedBuildings >= 25) {
    summary = 'Town scale dominates: building footprint and pollution outweigh wildlife. Eco tracks land pressure — not a failure state for balanced towns.';
  } else if (health < 30) {
    summary = 'Land under stress — fewer buildings, less industry, and healthier wildlife raise the score.';
  } else if (health < 60) {
    summary = 'Moderate pressure — expansion and pollution are catching up with the wild.';
  }

  return {
    health,
    buildingCount: playerCompletedBuildings,
    buildingImpact,
    pollutionLevel,
    pollutionPenalty,
    wildlifeCount: totalWildlife,
    wildlifeBonus,
    lines,
    summary,
  };
}