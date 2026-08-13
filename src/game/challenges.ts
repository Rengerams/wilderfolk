/**
 * Challenges: catalog + progress/win-check logic. Leaf module — runtime imports
 * only from sibling leaf modules (buildings / resourceTypes); gameTypes re-exports
 * the catalog without a cycle.
 */
import type { WorldState } from './gameTypes';
import { BuildingType } from './buildings';
import type { Building } from './buildings';
import type { Resources } from './resourceTypes';

export interface Challenge {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  targetYear?: number;
  targetPopulation?: number;
  targetBuildings?: number;
  reward?: Resources;
  rewardText?: string;
}

export const INITIAL_CHALLENGES: Challenge[] = [
  { id: 'first_settlers', title: 'First Settlers', description: 'Build a house and reach a population of 5 humans.', completed: false, targetPopulation: 5, reward: { wood: 50, stone: 20, food: 30, gold: 20 }, rewardText: '+50 wood, +20 stone, +30 food, +20 gold' },
  { id: 'growing_village', title: 'Growing Village', description: 'Reach Year 5 with at least 5 completed buildings.', completed: false, targetYear: 5, targetBuildings: 5, reward: { wood: 100, stone: 50, food: 50, gold: 40 }, rewardText: '+100 wood, +50 stone, +50 food, +40 gold' },
  { id: 'thriving_town', title: 'Thriving Town', description: 'Reach a population of 50 humans.', completed: false, targetPopulation: 50, reward: { wood: 200, stone: 100, food: 100, gold: 100 }, rewardText: '+200 wood, +100 stone, +100 food, +100 gold' },
  { id: 'century', title: 'Century Mark', description: 'Survive for 100 years.', completed: false, targetYear: 100, reward: { wood: 500, stone: 500, food: 500, gold: 500 }, rewardText: '+500 all resources!' },
  { id: 'eco_master', title: 'Eco Master', description: 'Maintain ecosystem health above 80% for 10 years.', completed: false, reward: { wood: 150, stone: 100, food: 200, gold: 100 }, rewardText: '+150 wood, +100 stone, +200 food, +100 gold' },
  { id: 'tech_pioneer', title: 'Tech Pioneer', description: 'Research 5 technologies.', completed: false, reward: { wood: 100, stone: 100, food: 0, gold: 200 }, rewardText: '+100 wood, +100 stone, +200 gold' },
  { id: 'trading_hub', title: 'Trading Hub', description: 'Establish 3 trade routes.', completed: false, reward: { wood: 0, stone: 0, food: 0, gold: 300 }, rewardText: '+300 gold' },
  { id: 'great_city', title: 'Great City', description: 'Reach a population of 250 humans with 35 buildings.', completed: false, targetPopulation: 250, targetBuildings: 35, reward: { wood: 1000, stone: 1000, food: 1000, gold: 1000 }, rewardText: '+1000 all resources!' },
];

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
