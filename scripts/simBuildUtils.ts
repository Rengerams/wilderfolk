/**
 * Shared headless placement helpers — matches in-game snapBuildingCenter rules
 * (strip buildings like walls/roads chain edge-to-edge; others snap to 20px grid).
 */
import { canPlaceBuilding, startBuilding } from '../src/game/gameEngine';
import type { WorldState } from '../src/game/gameTypes';
import type { BuildingType as BuildingTypeName } from '../src/game/gameTypes';
import {
  snapBuildingCenter,
  type BuildingRotation,
} from '../src/game/buildingRotation';

export type PlaceResult = { state: WorldState; ok: boolean; detail?: string };

function findBuildSpot(
  state: WorldState,
  type: BuildingTypeName,
  cx: number,
  cy: number,
  rotation: BuildingRotation = 0,
): [number, number] | null {
  for (let ring = 0; ring < 28; ring++) {
    const radius = 60 + ring * 36;
    const steps = 10 + ring * 2;
    for (let i = 0; i < steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      const rawX = cx + Math.cos(angle) * radius;
      const rawY = cy + Math.sin(angle) * radius;
      const { x, y } = snapBuildingCenter(type, rawX, rawY, rotation);
      if (canPlaceBuilding(state, type, x, y, rotation)) return [x, y];
    }
  }
  return null;
}

export function tryPlaceBuilding(
  state: WorldState,
  type: BuildingTypeName,
  cx: number,
  cy: number,
  rotation: BuildingRotation = 0,
): PlaceResult {
  const spot = findBuildSpot(state, type, cx, cy, rotation);
  if (!spot) return { state, ok: false, detail: 'no valid spot' };
  return { state: startBuilding(state, type, spot[0], spot[1], rotation), ok: true };
}
