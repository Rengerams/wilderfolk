/** Shared wildlife population limits for breeding, three-day replenishment and the Nature panel.
 * This is policy data only: tickLayerSystems owns breeding/predation and worldGen owns spawning.
 */
import { EntityType } from './gameTypes';

export const WILDLIFE_POPULATION_POLICY = {
  [EntityType.Rabbit]: { breedingCeiling: 150, replenishMinimum: 35, replenishTarget: 150 },
  [EntityType.Deer]: { breedingCeiling: 60, replenishMinimum: 12, replenishTarget: 45 },
  [EntityType.Fox]: { breedingCeiling: 35, replenishMinimum: 8, replenishTarget: 20 },
  [EntityType.Wolf]: { breedingCeiling: 10, replenishMinimum: 5, replenishTarget: 10 },
} as const;

/** Wildkin and other reproductive fauna retain their existing 35-animal ceiling. */
export function wildlifeBreedingCeiling(type: EntityType): number {
  const policy: Partial<Record<EntityType, { breedingCeiling: number }>> = WILDLIFE_POPULATION_POLICY;
  return policy[type]?.breedingCeiling ?? 35;
}

/** Wild predators leave a scarce rabbit population to recover; settler hunting is unchanged. */
export function wildlifeMayHuntRabbit(remainingRabbits: number): boolean {
  return remainingRabbits > WILDLIFE_POPULATION_POLICY[EntityType.Rabbit].replenishMinimum;
}
