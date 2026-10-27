/**
 * Player-facing wording for a refused building placement — the other half of
 * `buildingPlacementActions.getPlaceBuildingFailureReason`.
 *
 * The owner decides **why** a spot is refused; this module decides how to say it, so the canvas
 * (`renderer/buildPreview.ts`) only draws the string: values are computed by the game layer, never by
 * the view. Before this existed the ghost printed one fixed `'✗ Blocked'` for every refusal, which
 * reads as "the game will not let me build here" for the two buildings whose rule is about the
 * **whole footprint**: a Bridge must span actual river water and a Fishing Spot must cover a water
 * tile (`placementUtils.isFootprintOnBuildableTerrain`), so a dry-bank drop-off is not "blocked" — it
 * is missing the water the building needs inside its own pad.
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
 * {@link getPlaceBuildingFailureLabel}. Every entry is reachable, so the map stays honest.
 *
 * `blocked` is deliberately one sentence for two causes: the owner returns it for a footprint off the
 * map **and** for one overlapping a structure, so the wording has to be true of both.
 */
export const PLACEMENT_FAILURE_LABELS: Record<PlaceBuildingFailureReason, string> = {
  terrain: 'Cannot build on water/terrain',
  blocked: 'Cannot build here',
  research: 'Research required',
  unique: 'Only one per village',
};

/**
 * The two types whose terrain rule is a footprint-wide water requirement rather than "flat ground".
 * Bridge: every tile river/bank with at least one actual river tile. Fishing Spot: at least one water
 * tile under the dock.
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
