import type { WorldState, Building, Challenge } from './gameTypes';
import { BuildingType } from './gameTypes';

export interface ChallengeProgress {
  current: number;
  target: number;
  unit: string;
  tone?: 'eco' | 'default';
}

function countPlayerCompletedBuildings(buildings: Building[]): number {
  return buildings.filter((b) => b.completed && b.faction !== 'rival').length;
}

export function isChallengeComplete(
  challenge: Challenge,
  state: WorldState,
  humanCount: number,
  buildings: Building[],
): boolean {
  const playerBuildings = countPlayerCompletedBuildings(buildings);
  const hasHousing = buildings.some(
    (b) =>
      b.completed
      && b.faction !== 'rival'
      && (b.type === BuildingType.House || b.type === BuildingType.Mansion),
  );

  switch (challenge.id) {
    case 'first_settlers':
      return humanCount >= (challenge.targetPopulation ?? 0) && hasHousing;
    case 'growing_village':
      return (
        state.year >= (challenge.targetYear ?? 0)
        && playerBuildings >= (challenge.targetBuildings ?? 0)
      );
    case 'eco_master':
      return state.ecoHealthYearsAbove80 >= 10;
    case 'great_city':
      return (
        humanCount >= (challenge.targetPopulation ?? 0)
        && playerBuildings >= (challenge.targetBuildings ?? 0)
      );
    case 'tech_pioneer':
      return state.unlockedTechs.length >= 5;
    case 'trading_hub':
      return state.tradeRoutes.filter((r) => r.active).length >= 3;
    default: {
      // Generic target fields for any challenge not listed above
      let met = true;
      if (challenge.targetYear !== undefined) met = met && state.year >= challenge.targetYear;
      if (challenge.targetPopulation !== undefined) {
        met = met && humanCount >= challenge.targetPopulation;
      }
      if (challenge.targetBuildings !== undefined) {
        met = met && playerBuildings >= challenge.targetBuildings;
      }
      // No targets configured → incomplete (do not auto-complete)
      if (
        challenge.targetYear === undefined
        && challenge.targetPopulation === undefined
        && challenge.targetBuildings === undefined
      ) {
        return false;
      }
      return met;
    }
  }
}

export function getActiveChallengeId(challenges: Challenge[]): string | null {
  return challenges.find((c) => !c.completed)?.id ?? null;
}

export function getChallengeProgress(challenge: Challenge, state: WorldState): ChallengeProgress | null {
  if (challenge.completed) return null;
  switch (challenge.id) {
    case 'eco_master': return { current: state.ecoHealthYearsAbove80, target: 10, unit: 'years eco ≥80%', tone: 'eco' };
    case 'first_settlers': return { current: state.humanPopulation, target: challenge.targetPopulation ?? 5, unit: 'settlers' };
    case 'thriving_town': return { current: state.humanPopulation, target: challenge.targetPopulation ?? 0, unit: 'population' };
    case 'tech_pioneer': return { current: state.unlockedTechs.length, target: 5, unit: 'technologies' };
    case 'trading_hub': return { current: state.tradeRoutes.filter((r) => r.active).length, target: 3, unit: 'trade routes' };
    default: return null;
  }
}