import { describe, expect, it } from 'vitest';
import { building, human } from '../src/test/factories';
import { testWorldMap } from '../src/test/worldMapFixtures';
import { BUILDING_CONFIGS, BuildingType, TerrainType } from '../src/game/gameTypes';
import { isFootprintOnBuildableTerrain } from '../src/game/placementUtils';
import { findPath, findRouteCost, getPathGrid, isOnWalkableRoadAt, setCurrentPathMap, steerWithPath } from '../src/game/pathfinding';
import { buildStripPreview, placeStripChain } from '../src/game/buildingPlacementActions';
import { demolishStripBuildingsInPlace } from '../src/game/buildingMaintenanceActions';
import { createBuilding } from '../src/game/worldGen';
import { Walkability } from '../src/game/terrain/terrainGrid';
import { initGame } from '../src/game/worldGen';
import { buildSaveData, loadGameFromParsed, parseSaveJson } from '../src/game/saveLoad';
import { createInitialView } from '../src/game/viewState';
import { estimatedCommuteHours, isWithinAssignableCommute } from '../src/game/commuteReach';
import { applyWorkerCommand, isWorkerCommand } from '../src/game/simWorker/commands';

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


  it('prices only road tile centres actually within the paved footprint', () => {
    const map = testWorldMap({ tilesX: 24, tilesY: 24 });
    const road = building(301, BuildingType.Road, { x: 100, y: 100, width: 160, height: 26 });
    const grid = getPathGrid(map, [road]);
    const at = (row: number) => row * grid.cols + 10;
    // The physical road covers a slice of rows 8 and 11, but their centres (85/115)
    // lie outside the road (y=87..113). Rows 9/10 have centres on the pavement.
    for (const row of [8, 9, 10, 11]) expect(grid.road?.[at(row)]).toBe(1);
    expect(grid.roadCost?.[at(8)]).toBe(0);
    expect(grid.roadCost?.[at(9)]).toBe(1);
    expect(grid.roadCost?.[at(10)]).toBe(1);
    expect(grid.roadCost?.[at(11)]).toBe(0);
    setCurrentPathMap(map, [road]);
    expect(isOnWalkableRoadAt(105, 85)).toBe(false);
    expect(isOnWalkableRoadAt(105, 100)).toBe(true);
    setCurrentPathMap(null);
  });

  it('never discounts the route through a thin road with no paved grid centres', () => {
    const map = testWorldMap({ tilesX: 24, tilesY: 24 });
    const road = building(302, BuildingType.Road, { x: 100, y: 100, width: 160, height: 6 });
    const plainCost = findRouteCost(getPathGrid(map, []), 3, 9, 15, 9);
    const grid = getPathGrid(map, [road]);
    expect(grid.road?.[9 * grid.cols + 10]).toBe(1);
    expect(grid.roadCost).toBeUndefined();
    expect(findRouteCost(grid, 3, 9, 15, 9)).toBeCloseTo(plainCost!, 5);
    // A walker precisely on the thin pavement still gets the speed benefit.
    setCurrentPathMap(map, [road]);
    expect(isOnWalkableRoadAt(100, 100)).toBe(true);
    expect(isOnWalkableRoadAt(100, 95)).toBe(false);
    setCurrentPathMap(null);
  });

  it('prices the full construction preview using real resources and does not draw unfunded segments as valid', () => {
    const world = initGame({ seed: 102 });
    world.worldMap = testWorldMap({ tilesX: 200, tilesY: 200 });
    world.buildings = [];
    const roadCost = BUILDING_CONFIGS[BuildingType.Road].cost;
    world.resources.wood = roadCost.wood * 2 - 1;
    world.resources.stone = roadCost.stone * 2 + 20;
    world.resources.gold = roadCost.gold * 2 + 20;
    world.storageMax = { ...world.storageMax, wood: 10000, stone: 10000, gold: 10000 };
    const original = { ...world.resources };
    const preview = buildStripPreview(world, BuildingType.Road, 500, 500, 850, 500, 0);
    expect(preview.segments.length).toBeGreaterThan(2);
    expect(preview.segments.filter((entry) => entry.valid)).toHaveLength(1);
    expect(preview.segments.some((entry) => entry.resourceShortage)).toBe(true);
    expect(preview.cost).toMatchObject(roadCost);
    expect(preview.available).toMatchObject({ wood: original.wood, stone: original.stone, gold: original.gold });
    // Preview reads must not spend any resources; the worker applies exactly the funded pieces.
    expect(world.resources).toMatchObject(original);
    const placed = placeStripChain(world, BuildingType.Road, preview.segments, 0);
    expect(placed.buildings.filter((entry) => entry.type === BuildingType.Road)).toHaveLength(1);
    for (const resource of ['wood', 'stone', 'gold'] as const) {
      expect(original[resource] - placed.resources[resource]).toBe(preview.cost?.[resource]);
    }
  });

  it('does not classify an off-grid trip as reachable from a single short road segment', () => {
    setCurrentPathMap(null);
    const home = building(801, BuildingType.House, { x: 50, y: 100 });
    const work = building(802, BuildingType.LumberMill, { x: 1050, y: 100 });
    const tinyRoad = building(803, BuildingType.Road, { x: 545, y: 100, width: 10, height: 10 });
    const buildings = [home, work, tinyRoad];
    expect(estimatedCommuteHours(home, work, buildings, 7)).toBeGreaterThan(2);
    const settler = human(804, { x: home.x, y: home.y, residenceBuildingId: home.id });
    expect(isWithinAssignableCommute(settler, work, buildings, 7)).toBe(false);
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
    const resourcesBeforePreview = { ...world.resources };
    const statsBeforePreview = structuredClone(world.lifetimeStats);
    const preview = buildStripPreview(world, BuildingType.WallGate, wall.x, wall.y, wall.x, wall.y, 0);
    buildStripPreview(world, BuildingType.WallGate, wall.x, wall.y, wall.x, wall.y, 0);
    expect(world.resources).toEqual(resourcesBeforePreview);
    expect(world.lifetimeStats).toEqual(statsBeforePreview);
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

  it('toggles a complete gate through worker commands, re-prices routes and persists closure', () => {
    const world = initGame({ seed: 20261026 });
    const map = testWorldMap({ tilesX: 20, tilesY: 20 });
    world.worldMap = map;
    const gate = building(9050, BuildingType.WallGate, {
      x: 105, y: 100, width: 10, height: 200, completed: true,
    });
    world.buildings = [gate];
    const cmd = { proto: 1, op: 'toggleWallGate', buildingId: gate.id } as const;
    expect(isWorkerCommand(cmd)).toBe(true);
    expect(findPath(getPathGrid(map, world.buildings), 2, 10, 17, 10)).not.toBeNull();
    const closed = applyWorkerCommand(world, cmd);
    expect(closed.buildings[0].gateClosed).toBe(true);
    expect(world.buildings[0].gateClosed).toBeUndefined();
    expect(findPath(getPathGrid(map, closed.buildings), 2, 10, 17, 10)).toBeNull();

    const save = buildSaveData(closed, createInitialView(closed.width, closed.height));
    const parsed = parseSaveJson(JSON.stringify(save));
    if (!parsed.valid || !parsed.parsed) throw new Error('gate fixture save rejected');
    const loaded = loadGameFromParsed(parsed.parsed)!.world;
    expect(loaded.buildings[0].gateClosed).toBe(true);
    expect(findPath(getPathGrid(map, loaded.buildings), 2, 10, 17, 10)).toBeNull();
    const reopened = applyWorkerCommand(loaded, cmd);
    expect(reopened.buildings[0].gateClosed).toBe(false);
    expect(findPath(getPathGrid(map, reopened.buildings), 2, 10, 17, 10)).not.toBeNull();
    expect(applyWorkerCommand(reopened, { ...cmd, buildingId: 123456 })).toBe(reopened);
    expect(isWorkerCommand({ ...cmd, buildingId: -1 })).toBe(false);
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
