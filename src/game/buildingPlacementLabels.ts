/**
 * Player-facing wording for a refused building placement; `placementUtils` decides why a spot is
 * refused, this module decides how to say it, and every caller only draws the string.
 */
import { BuildingType, type ResearchNode } from './gameTypes';
import { getBuildingConfig } from './buildingConfig';
import type { getPlaceBuildingFailureReason } from './placementUtils';

/**
 * The reason vocabulary, derived from its owner so a reason added there becomes a missing entry in
 * {@link PLACEMENT_FAILURE_LABELS} — a compile error — rather than an `undefined` on screen.
 */
export type PlaceBuildingFailureReason = NonNullable<ReturnType<typeof getPlaceBuildingFailureReason>>;

/**
 * Fallback label per reason; `terrain`, `research` and `unique` are refined per building by
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
    const requirement = getBuildingConfig(type).unlockRequirement;
    const node = requirement
      ? researchNodes?.find((candidate) => candidate.id === requirement)
      : undefined;
    return node ? `Research ${node.name}` : PLACEMENT_FAILURE_LABELS.research;
  }
  if (reason === 'unique') {
    return `Only one ${getBuildingConfig(type).label} per village`;
  }
  return PLACEMENT_FAILURE_LABELS[reason];
}
