import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { BUILDING_CONFIGS, BuildingType, MapSize } from '../src/game/gameTypes';
import type { Building, WorldState } from '../src/game/gameTypes';
import { getBuildingFootprintForType } from '../src/game/buildingRotation';
import { buildStripPreview, placeStripChain, getPlaceBuildingFailureReason } from '../src/game/buildingPlacementActions';
import { canPlaceBuilding } from '../src/game/placementUtils';
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
      expect(canPlaceBuilding(world as unknown as RenderSnapshot, type, x, y, 90)).toBe(true);
      expect(getPlaceBuildingFailureReason(world, type, x, y, 0)).toBe('blocked');
      expect(canPlaceBuilding(world as unknown as RenderSnapshot, type, x, y, 0)).toBe(false);
    });
  }
});

import { testWorldMap } from '../src/test/worldMapFixtures';
import { TerrainType } from '../src/game/gameTypes';

describe('compact wall runs', () => {
  it('replaces an off-lattice legacy wall with a gate at its saved centre', () => {
    const world = worldFor(BuildingType.WallGate);
    world.worldMap = testWorldMap({ tilesX: 60, tilesY: 60, tileType: () => TerrainType.Grassland });
    world.width = world.height = 600;
    world.buildings = [];
    world.resources.wood = world.resources.stone = world.resources.gold = 10000;
    const wall = completedStrip(world, BuildingType.Wall, 180, 200);
    wall.width = 60;
    wall.height = 40;
    const preview = buildStripPreview(world, BuildingType.WallGate, 180, 200, 180, 200, 0);
    expect(preview.segments).toHaveLength(1);
    expect(preview.segments[0]).toMatchObject({ x: 180, y: 200, replacesBuildingId: wall.id, valid: true });
    const next = placeStripChain(world, BuildingType.WallGate, preview.segments, 0);
    expect(next.buildings).toHaveLength(1);
    expect(next.buildings[0]).toMatchObject({ type: BuildingType.WallGate, x: 180, y: 200 });
  });

  it.each([BuildingType.Wall, BuildingType.WallGate])('commits horizontal and vertical %s with matching footprints', (type) => {
    const world = worldFor(type);
    world.worldMap = testWorldMap({ tilesX: 60, tilesY: 60, tileType: () => TerrainType.Grassland });
    world.width = world.height = 600;
    world.buildings = [];
    world.resources.wood = world.resources.stone = world.resources.gold = 10000;
    for (const rotation of [0, 90] as const) {
      const x = rotation === 0 ? 150 : 390;
      const y = 150;
      const preview = buildStripPreview(world, type, x, y, x + (rotation === 0 ? 90 : 0), y + (rotation === 90 ? 90 : 0), rotation);
      expect(preview.segments).toHaveLength(4);
      expect(preview.segments.every((s) => s.valid && s.rotation === rotation)).toBe(true);
      const placed = placeStripChain(world, type, preview.segments, rotation);
      expect(placed.buildings).toHaveLength(4);
      const fp = getBuildingFootprintForType(type, rotation);
      expect(placed.buildings.every((b) => b.width === fp.width && b.height === fp.height && (b.rotation ?? 0) === rotation)).toBe(true);
    }
  });
});

describe('long bridge construction', () => {
  it.each([0, 90] as const)('places a continuous bridge stroke at rotation %s', (rotation) => {
    const w = worldFor(BuildingType.Bridge);
    w.worldMap = testWorldMap({ tilesX: 60, tilesY: 60, tileType: (x, y) => {
      const axis = rotation === 0 ? x : y;
      return axis >= 10 && axis < 35 ? TerrainType.River : TerrainType.Grassland;
    } });
    w.width = w.height = 600;
    w.buildings = [];
    w.resources.wood = w.resources.stone = w.resources.gold = 10000;
    const a = rotation === 0 ? { x: 64, y: 200 } : { x: 200, y: 64 };
    const b = rotation === 0 ? { x: 384, y: 200 } : { x: 200, y: 384 };
    const preview = buildStripPreview(w, BuildingType.Bridge, a.x, a.y, b.x, b.y, rotation);
    expect(preview.segments.length).toBeGreaterThan(2);
    expect(preview.segments.every(s => s.valid && s.rotation === rotation)).toBe(true);
    const next = placeStripChain(w, BuildingType.Bridge, preview.segments, rotation);
    expect(next.buildings).toHaveLength(preview.segments.length);
    expect(next.buildings.every(b => !b.completed && b.type === BuildingType.Bridge)).toBe(true);
    expect(w.resources.wood - next.resources.wood).toBe(preview.segments.length * BUILDING_CONFIGS[BuildingType.Bridge].cost.wood);
    // A segment can become occupied after the preview has been submitted.
    const blocked = structuredClone(w);
    blocked.buildings.push({ ...next.buildings[Math.floor(preview.segments.length / 2)], completed: true });
    const blockedResult = placeStripChain(blocked, BuildingType.Bridge, preview.segments, rotation);
    expect(blockedResult.buildings).toEqual(blocked.buildings);
    expect(blockedResult.resources).toEqual(blocked.resources);
    expect(blockedResult.floatingTexts.length).toBeGreaterThan(blocked.floatingTexts.length);
    // Enough resources for the first piece, but not the complete stroke.
    w.resources.wood = BUILDING_CONFIGS[BuildingType.Bridge].cost.wood;
    const refused = placeStripChain(w, BuildingType.Bridge, preview.segments, rotation);
    expect(refused.buildings).toEqual(w.buildings);
    expect(refused.resources).toEqual(w.resources);
    expect(refused.floatingTexts.length).toBeGreaterThan(w.floatingTexts.length);
  });
});
