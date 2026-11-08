import { BuildingType } from './gameTypes';

/** Shared runtime numeric guard for untrusted save, view and worker-command data. */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

// Deliberately lazy: type data may be imported through a module cycle at startup.
let buildingTypeValues: Set<string> | null = null;

/** Validate a building type without relying on unchecked type assertions at input boundaries. */
export function isBuildingType(value: unknown): value is BuildingType {
  if (typeof value !== 'string') return false;
  if (buildingTypeValues === null) {
    buildingTypeValues = new Set<string>(
      BuildingType && typeof BuildingType === 'object' ? Object.values(BuildingType) : [],
    );
  }
  return buildingTypeValues.has(value);
}
