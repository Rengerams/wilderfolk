/**
 * Shared headless placement helpers — matches in-game snapBuildingCenter rules
 * (strip buildings like walls/roads chain edge-to-edge; others snap to 20px grid).
 */
import { canPlaceBuilding, startBuilding } from '../src/game/gameEngine';
import type { WorldState } from '../src/game/gameTypes';
import { BuildingType } from '../src/game/gameTypes';
import type { BuildingType as BuildingTypeName } from '../src/game/gameTypes';
import {
  snapBuildingCenter,
  getBuildingFootprintForType,
  type BuildingRotation,
} from '../src/game/buildingRotation';

export type PlaceResult = { state: WorldState; ok: boolean; detail?: string };

export function findBuildSpot(
  state: WorldState,
  type: BuildingTypeName,
  cx: number,
  cy: number,
  rotation: BuildingRotation = 0,
): [number, number] | null {
  for (let ring = 0; ring < 16; ring++) {
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

/** Place a short wall line — exercises strip snap (same as player click-drag along a row). */
export function tryPlaceWallChain(
  state: WorldState,
  cx: number,
  cy: number,
  segments = 4,
): PlaceResult {
  const rotations: BuildingRotation[] = [0, 90];
  for (const rotation of rotations) {
    const footprint = getBuildingFootprintForType(BuildingType.Wall, rotation);
    const along = Math.max(footprint.width, footprint.height);
    for (let ring = 0; ring < 12; ring++) {
      const offset = ring * 52;
      let s = state;
      let placed = 0;
      for (let i = 0; i < segments; i++) {
        const rawX = rotation === 0 ? cx + offset + i * along : cx + offset;
        const rawY = rotation === 0 ? cy + offset : cy + offset + i * along;
        const { x, y } = snapBuildingCenter(BuildingType.Wall, rawX, rawY, rotation);
        if (!canPlaceBuilding(s, BuildingType.Wall, x, y, rotation)) {
          placed = 0;
          break;
        }
        s = startBuilding(s, BuildingType.Wall, x, y, rotation);
        placed++;
      }
      if (placed >= 2) {
        return { state: s, ok: true, detail: `${placed} segments @ rot ${rotation}°` };
      }
    }
  }
  return tryPlaceBuilding(state, BuildingType.Wall, cx, cy, 0);
}