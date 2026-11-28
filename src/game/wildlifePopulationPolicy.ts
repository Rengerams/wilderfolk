/** Shared wildlife population limits for breeding, three-day replenishment and the Nature panel.
 * This is policy data only: tickLayerSystems owns breeding/predation and worldGen owns spawning.
 */
import { BuildingType, EntityType } from './gameTypes';
import type { Building, Entity } from './gameTypes';

/** A completed grove and its surrounding habitat, measured from its centre in world pixels. */
export const WILDLIFE_PRESERVE_RADIUS = 96;

export function getCompletedWildlifePreserves(buildings: readonly Building[]): Building[] {
  return buildings.filter((building) => building.completed && building.type === BuildingType.WildlifePreserve);
}

/** Humans cannot hunt in a protected grove. Natural predator/prey interactions remain intact. */
export function isWildlifeProtected(prey: Pick<Entity, 'x' | 'y'>, preserves: readonly Building[]): boolean {
  return preserves.some((preserve) => (prey.x - preserve.x) ** 2 + (prey.y - preserve.y) ** 2 <= WILDLIFE_PRESERVE_RADIUS ** 2);
}

export const WILDLIFE_POPULATION_POLICY = {
  [EntityType.Rabbit]: { breedingCeiling: 150, replenishMinimum: 35, replenishTarget: 150 },
  [EntityType.Deer]: { breedingCeiling: 60, replenishMinimum: 12, replenishTarget: 45 },
  [EntityType.Fox]: { breedingCeiling: 8, replenishMinimum: 3, replenishTarget: 6 },
  [EntityType.Wolf]: { breedingCeiling: 6, replenishMinimum: 2, replenishTarget: 4 },
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

/**
 * Live carrying capacity is below the species breeding ceiling when the valley cannot feed a pack.
 * This is read by natural breeding, rare wolf immigration and the three-day refill owner.
 * Wolves can subsist on a mixed prey base; foxes depend specifically on rabbits.
 */
export function getWildlifeCarryingCapacity(
  type: EntityType,
  prey: { readonly rabbits: number; readonly deer: number; readonly foxes: number },
): number {
  const ceiling = wildlifeBreedingCeiling(type);
  // Rabbits at/below the refuge floor cannot be caught by predators; only surplus
  // rabbits count toward sustainable predator numbers.
  const surplusRabbits = Math.max(
    0, prey.rabbits - WILDLIFE_POPULATION_POLICY[EntityType.Rabbit].replenishMinimum,
  );
  if (type === EntityType.Fox) {
    return Math.min(ceiling, Math.floor(surplusRabbits / 3));
  }
  if (type === EntityType.Wolf) {
    const availablePrey = surplusRabbits
      + 2 * Math.max(0, prey.deer) + Math.max(0, prey.foxes);
    return Math.min(ceiling, Math.floor(availablePrey / 15));
  }
  return ceiling;
}
