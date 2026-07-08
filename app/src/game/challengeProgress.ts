import type { Challenge, WorldState } from './gameTypes';

export type ChallengeProgressTone = 'eco' | 'default';

export interface ChallengeProgress {
  current: number;
  target: number;
  unit: string;
  tone?: ChallengeProgressTone;
}

export function getActiveChallengeId(challenges: Challenge[]): string | null {
  return challenges.find((c) => !c.completed)?.id ?? null;
}

export function getChallengeProgress(challenge: Challenge, state: WorldState): ChallengeProgress | null {
  if (challenge.completed) return null;

  const playerBuildings = state.buildings.filter(
    (b) => b.completed && b.faction !== 'rival',
  ).length;

  switch (challenge.id) {
    case 'eco_master':
      return {
        current: state.ecoHealthYearsAbove80,
        target: 10,
        unit: 'years eco ≥80%',
        tone: 'eco',
      };
    case 'first_settlers':
      return {
        current: state.humanPopulation,
        target: challenge.targetPopulation ?? 5,
        unit: 'settlers',
      };
    case 'growing_village': {
      const targetBuildings = challenge.targetBuildings ?? 5;
      const targetYear = challenge.targetYear ?? 5;
      const combined = Math.round(
        Math.min(playerBuildings / targetBuildings, 1) * 50
        + Math.min(state.year / targetYear, 1) * 50,
      );
      return {
        current: combined,
        target: 100,
        unit: '%',
      };
    }
    case 'thriving_town':
      return {
        current: state.humanPopulation,
        target: challenge.targetPopulation ?? 0,
        unit: 'population',
      };
    case 'great_city': {
      const targetBuildings = challenge.targetBuildings ?? 35;
      const targetPopulation = challenge.targetPopulation ?? 250;
      const combined = Math.round(
        Math.min(state.humanPopulation / targetPopulation, 1) * 50
        + Math.min(playerBuildings / targetBuildings, 1) * 50,
      );
      return {
        current: combined,
        target: 100,
        unit: '%',
      };
    }
    case 'century':
      return { current: state.year, target: challenge.targetYear ?? 100, unit: 'years' };
    case 'tech_pioneer':
      return {
        current: state.unlockedTechs.length,
        target: 5,
        unit: 'technologies',
      };
    case 'trading_hub':
      return {
        current: state.tradeRoutes.filter((r) => r.active).length,
        target: 3,
        unit: 'trade routes',
      };
    default:
      if (challenge.targetPopulation !== undefined) {
        return {
          current: state.humanPopulation,
          target: challenge.targetPopulation,
          unit: 'population',
        };
      }
      if (challenge.targetYear !== undefined) {
        return { current: state.year, target: challenge.targetYear, unit: 'years' };
      }
      if (challenge.targetBuildings !== undefined) {
        return { current: playerBuildings, target: challenge.targetBuildings, unit: 'buildings' };
      }
      return null;
  }
}