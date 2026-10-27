import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { BUILDING_CONFIGS, BuildingType, MapSize } from '../src/game/gameTypes';
import type { Building, WorldState } from '../src/game/gameTypes';
import { getBuildingFootprintForType } from '../src/game/buildingRotation';
import { getPlaceBuildingFailureReason } from '../src/game/buildingPlacementActions';
import { canPlaceBuildingSnapshot } from '../src/game/placementUtils';
import type { RenderSnapshot } from '../src/game/renderSnapshot';

function worldFor(type: BuildingType): WorldState {
  const world = initGame({ size: MapSize.Medium, seed: 20261026 });
  const required = BUILDING_CONFIGS[type].unlockRequirement;
  if (required) {
    world.unlockedTechs = [...world.unlockedTechs, required];
    world.researchNodes = world.researchNodes.map((node) => node.id === required
      ? { ...node, researched: true } : node);
  }
  return world;
}

function crossingSpot(world: WorldState, type: BuildingType): { x: number; y: number } {
  for (let y = 100; y < world.height - 100; y += 20) {
    for (let x = 100; x < world.width - 100; x += 20) {
      if (getPlaceBuildingFailureReason(world, type, x, y, 0) !== null) continue;
      if (getPlaceBuildingFailureReason(world, type, x, y, 90) !== null) continue;
      return { x, y };
    }
  }
  throw new Error('No two-orientation crossing on buildable ground');
}

function completedStrip(world: WorldState, type: BuildingType, x: number, y: number): Building {
  const footprint = getBuildingFootprintForType(type, 0);
  const building = {
    id: world.nextBuildingId++, type, x, y,
    width: footprint.width, height: footprint.height, rotation: 0,
    occupants: [], level: 1, constructionProgress: 100, completed: true,
    health: 100, maxHealth: 100, spriteScale: 1, buildAnimTimer: 0,
  } as Building;
  world.buildings.push(building);
  return building;
}

describe('crossing construction', () => {
  for (const type of [BuildingType.Road, BuildingType.Wall]) {
    it(`accepts perpendicular ${type} crossings without accepting duplicate parallel pieces`, () => {
      const world = worldFor(type);
      const { x, y } = crossingSpot(world, type);
      completedStrip(world, type, x, y);
      expect(getPlaceBuildingFailureReason(world, type, x, y, 90)).toBeNull();
      expect(canPlaceBuildingSnapshot(world as unknown as RenderSnapshot, type, x, y, 90)).toBe(true);
      expect(getPlaceBuildingFailureReason(world, type, x, y, 0)).toBe('blocked');
      expect(canPlaceBuildingSnapshot(world as unknown as RenderSnapshot, type, x, y, 0)).toBe(false);
    });
  }
});
