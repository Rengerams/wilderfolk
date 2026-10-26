import { describe, expect, it } from 'vitest';
import { building, human } from '../src/test/factories';
import { testWorldMap } from '../src/test/worldMapFixtures';
import { BUILDING_CONFIGS, BuildingType, TerrainType } from '../src/game/gameTypes';
import { isFootprintOnBuildableTerrain } from '../src/game/placementUtils';
import { findPath, getPathGrid, isOnWalkableRoadAt, setCurrentPathMap, steerWithPath } from '../src/game/pathfinding';
import { buildStripPreview, placeStripChain } from '../src/game/buildingPlacementActions';
import { demolishStripBuildingsInPlace } from '../src/game/buildingMaintenanceActions';
import { createBuilding } from '../src/game/worldGen';
import { Walkability } from '../src/game/terrain/terrainGrid';
import { initGame } from '../src/game/worldGen';
import { buildSaveData, loadGameFromParsed, parseSaveJson } from '../src/game/saveLoad';
import { createInitialView } from '../src/game/viewState';

describe('infrastructure acceptance boundaries', () => {
  for (const terrain of [TerrainType.Mountains, TerrainType.Snow, TerrainType.RiverBank]) {
    it(`allows roads on passable ${terrain} without permitting ordinary buildings`, () => {
      const worldMap = testWorldMap({ tilesX: 20, tilesY: 20, tileType: () => terrain });
      expect(isFootprintOnBuildableTerrain({ worldMap }, 10, 10, 55, 55, BuildingType.Road)).toBe(true);
      expect(isFootprintOnBuildableTerrain({ worldMap }, 10, 10, 55, 55, BuildingType.House)).toBe(false);
      worldMap.pathGrid![5 * worldMap.width + 5] = Walkability.Reserved;
      expect(isFootprintOnBuildableTerrain({ worldMap }, 10, 10, 55, 55, BuildingType.Road)).toBe(false);
    });
  }

  for (const terrain of [TerrainType.DeepWater, TerrainType.ShallowWater, TerrainType.River]) {
    it(`refuses road construction on ${terrain}`, () => {
      const worldMap = testWorldMap({ tilesX: 20, tilesY: 20, tileType: () => terrain });
      expect(isFootprintOnBuildableTerrain({ worldMap }, 10, 10, 55, 55, BuildingType.Road)).toBe(false);
    });
  }

  it('considers faster roads on short trips and when the gain is below five percent', () => {
    const map = testWorldMap({ tilesX: 40, tilesY: 20 });
    const shortRoad = building(70, BuildingType.Road, { x: 100, y: 105, width: 160, height: 10 });
    setCurrentPathMap(map, [shortRoad]);
    expect(steerWithPath(human(70, { x: 45, y: 105 }), 145, 105, 2, 'short-road')).toBe('path');
    const smallGain = building(71, BuildingType.Road, { x: 105, y: 105, width: 10, height: 10 });
    setCurrentPathMap(map, [smallGain]);
    expect(steerWithPath(human(71, { x: 25, y: 105 }), 325, 105, 2, 'small-gain')).toBe('path');
    setCurrentPathMap(null);
  });

  it('never lets a legacy road open impassable water', () => {
    const map = testWorldMap({ tilesX: 20, tilesY: 20, tileType: (x) => x === 10 ? TerrainType.River : undefined });
    const road = building(1, BuildingType.Road, { x: 105, y: 105, width: 30, height: 10 });
    expect(findPath(getPathGrid(map, [road]), 2, 10, 17, 10)).toBeNull();
    road.type = BuildingType.Bridge;
    expect(findPath(getPathGrid(map, [road]), 2, 10, 17, 10)).not.toBeNull();
  });

  it('rebuilds cached navigation when a wall completes, becomes a gate, closes or is removed', () => {
    const map = testWorldMap({ tilesX: 20, tilesY: 20 });
    const wall = building(2, BuildingType.Wall, { x: 105, y: 100, width: 10, height: 200, completed: false });
    expect(findPath(getPathGrid(map, [wall]), 2, 10, 17, 10)).not.toBeNull();
    wall.completed = true;
    expect(findPath(getPathGrid(map, [wall]), 2, 10, 17, 10)).toBeNull();
    wall.type = BuildingType.WallGate;
    expect(findPath(getPathGrid(map, [wall]), 2, 10, 17, 10)).not.toBeNull();
    wall.type = BuildingType.Wall;
    expect(findPath(getPathGrid(map, [wall]), 2, 10, 17, 10)).toBeNull();
    expect(findPath(getPathGrid(map, []), 2, 10, 17, 10)).not.toBeNull();
  });

  it('keeps a rectangular enclosure sealed until a gate opens one wall', () => {
    const map = testWorldMap({ tilesX: 20, tilesY: 20 });
    const walls = [
      building(10, BuildingType.Wall, { x: 100, y: 45, width: 120, height: 10 }),
      building(11, BuildingType.Wall, { x: 100, y: 155, width: 120, height: 10 }),
      building(12, BuildingType.Wall, { x: 45, y: 100, width: 10, height: 120 }),
      building(13, BuildingType.Wall, { x: 155, y: 100, width: 10, height: 120 }),
    ];
    expect(findPath(getPathGrid(map, walls), 10, 10, 1, 1)).toBeNull();
    walls[2].type = BuildingType.WallGate;
    expect(findPath(getPathGrid(map, walls), 10, 10, 1, 1)).not.toBeNull();
    walls[2].type = BuildingType.Wall;
    expect(findPath(getPathGrid(map, walls), 10, 10, 1, 1)).toBeNull();
  });

  it('grants road speed only on a completed footprint', () => {
    const map = testWorldMap({ tilesX: 20, tilesY: 20 });
    const road = building(3, BuildingType.Road, { x: 100, y: 105, width: 160, height: 6 });
    setCurrentPathMap(map, [road]);
    expect(isOnWalkableRoadAt(105, 105)).toBe(true);
    expect(isOnWalkableRoadAt(105, 109)).toBe(false);
    expect(isOnWalkableRoadAt(105, 115)).toBe(false);
    road.completed = false;
    setCurrentPathMap(map, [road]);
    expect(isOnWalkableRoadAt(105, 105)).toBe(false);
    setCurrentPathMap(null);
  });


  it('commits the gate preview with correct orientation and refunds, and preserves a refused replacement', () => {
    const world = initGame({ seed: 49 });
    world.worldMap = testWorldMap({ tilesX: 200, tilesY: 200 });
    world.buildings = [];
    for (const type of [BuildingType.Wall, BuildingType.WallGate]) {
      const tech = BUILDING_CONFIGS[type].unlockRequirement;
      if (tech) {
        world.unlockedTechs.push(tech);
        world.researchNodes = world.researchNodes.map((node) => node.id === tech ? { ...node, researched: true } : node);
      }
    }
    world.resources.wood = 1000;
    world.resources.stone = 1000;
    world.resources.gold = 1000;
    world.storageMax = { ...world.storageMax, wood: 10000, stone: 10000, gold: 10000 };
    const wall = createBuilding(BuildingType.Wall, 500, 500, world.nextBuildingId++, 90);
    wall.completed = true;
    wall.constructionProgress = 1;
    world.buildings.push(wall);
    const preview = buildStripPreview(world, BuildingType.WallGate, wall.x, wall.y, wall.x, wall.y, 0);
    expect(preview.segments).toHaveLength(1);
    expect(preview.segments[0]).toMatchObject({ valid: true, rotation: 90, replacesBuildingId: wall.id });
    const blocked = structuredClone(world);
    blocked.buildings.push(building(9001, BuildingType.House, { x: wall.x, y: wall.y, width: 100, height: 100 }));
    const refused = placeStripChain(blocked, BuildingType.WallGate, preview.segments, 0);
    expect(refused.buildings.find((entry) => entry.id === wall.id)).toEqual(wall);
    expect(refused.resources).toEqual(blocked.resources);
    const placed = placeStripChain(world, BuildingType.WallGate, preview.segments, 0);
    expect(placed.buildings.some((entry) => entry.id === wall.id)).toBe(false);
    const gate = placed.buildings.find((entry) => entry.type === BuildingType.WallGate)!;
    expect(gate).toMatchObject({ x: wall.x, y: wall.y, rotation: 90, completed: false });
    for (const resource of ['wood', 'stone', 'gold'] as const) {
      expect(placed.resources[resource]).toBe(world.resources[resource]
        + Math.floor(BUILDING_CONFIGS[BuildingType.Wall].cost[resource] / 2)
        - BUILDING_CONFIGS[BuildingType.WallGate].cost[resource]);
    }
    const house = building(9002, BuildingType.House);
    placed.buildings.push(house);
    demolishStripBuildingsInPlace(placed, [gate.id, house.id]);
    expect(placed.buildings.some((entry) => entry.id === gate.id)).toBe(false);
    expect(placed.buildings.some((entry) => entry.id === house.id)).toBe(true);
  });

  it('preserves mixed legacy infrastructure across three supported save round trips', () => {
    let world = initGame({ seed: 20261026 });
    const infrastructure = [BuildingType.Road, BuildingType.Road, BuildingType.Wall, BuildingType.WallGate, BuildingType.Bridge, BuildingType.Road]
      .map((type, index) => building(9000 + index, type, {
        x: 200 + index * 80, y: 200, width: index === 0 ? 300 : 72, height: 12,
        rotation: index === 1 ? 90 : 0, completed: index !== 5,
        constructionProgress: index === 5 ? 0.4 : 1,
      }));
    world.buildings.push(...infrastructure);
    world.nextBuildingId = 9006;
    for (let cycle = 0; cycle < 3; cycle++) {
      const data = buildSaveData(world, createInitialView(world.width, world.height));
      const parsed = parseSaveJson(JSON.stringify({ ...data, _version: '0.6.5.0' }));
      expect(parsed.valid).toBe(true);
      if (!parsed.valid || !parsed.parsed) throw new Error('invalid fixture save');
      const loaded = loadGameFromParsed(parsed.parsed);
      expect(loaded).not.toBeNull();
      world = loaded!.world;
      expect(world.buildings.filter((entry) => entry.id >= 9000)).toEqual(infrastructure);
    }
  });
});
