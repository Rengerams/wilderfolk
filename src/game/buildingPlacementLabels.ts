/**
 * Player-facing wording for a refused building placement; `buildingPlacementActions` decides why a
 * spot is refused, this module decides how to say it, and the canvas only draws the string.
 */
import { BUILDING_CONFIGS, BuildingType, type ResearchNode } from './gameTypes';
import type { getPlaceBuildingFailureReason } from './buildingPlacementActions';

/**
 * The reason vocabulary, derived from its owner so a reason added there becomes a missing entry in
 * {@link PLACEMENT_FAILURE_LABELS} — a compile error — rather than an `undefined` on screen.
 */
export type PlaceBuildingFailureReason = NonNullable<ReturnType<typeof getPlaceBuildingFailureReason>>;

/**
 * Fallback label per reason; `terrain` and `research` are refined per building by
 * {@link getPlaceBuildingFailureLabel}.
 */
export const PLACEMENT_FAILURE_LABELS: Record<PlaceBuildingFailureReason, string> = {
  terrain: 'Cannot build on water/terrain',
  blocked: 'Cannot build here',
  research: 'Research required',
  unique: 'Only one per village',
};

/**
 * Types whose terrain rule is a footprint-wide water requirement rather than "flat ground".
 */
const FOOTPRINT_WATER_LABELS: Partial<Record<BuildingType, string>> = {
  [BuildingType.Bridge]: 'Must span river water',
  [BuildingType.FishingSpot]: 'Must include water',
};

/** The label the placement ghost shows for a refusal the owner named (never for `null`). */
export function getPlaceBuildingFailureLabel(
  type: BuildingType,
  reason: PlaceBuildingFailureReason,
  researchNodes?: readonly ResearchNode[],
): string {
  if (reason === 'terrain') {
    return FOOTPRINT_WATER_LABELS[type] ?? PLACEMENT_FAILURE_LABELS.terrain;
  }
  if (reason === 'research') {
    const requirement = BUILDING_CONFIGS[type].unlockRequirement;
    const node = requirement
      ? researchNodes?.find((candidate) => candidate.id === requirement)
      : undefined;
    return node ? `Research ${node.name}` : PLACEMENT_FAILURE_LABELS.research;
  }
  return PLACEMENT_FAILURE_LABELS[reason];
}
