/**
 * The housing commute estimate prices the walkable route, not the straight line: crossings are paid as
 * detours, a per-sweep search budget caps searches, and straight-line hours are the fallback.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  beginCommuteRoutePass,
  commuteLeadHoursFor,
  estimatedCommuteHours,
  quoteBuildingCommute,
  isWithinAssignableCommute,
  MAX_COMMUTE_ROUTE_SEARCHES_PER_PASS,
  wereCommuteRouteChecksDeferred,
} from '../src/game/commuteReach';
import { findRouteCost, getCurrentPathGrid, resetPathGridCaches, setCurrentPathMap } from '../src/game/pathfinding';
import {
  flushPathfinderTickToSession,
  getPathfinderReport,
  resetPathfinderSession,
  resetPathfinderTickMetrics,
  setPathfindingMetricsEnabled,
} from '../src/game/pathfindingMetrics';
import { BuildingType, PATH_CELL, TerrainType } from '../src/game/gameTypes';
import type { Building, WorldMap } from '../src/game/gameTypes';
import { building, human } from '../src/test/factories';
import { testWorldMap } from '../src/test/worldMapFixtures';

const WALK_SPEED = 1.2;

/** A 40×40 map split by a river down tile column 20, crossable only at the tile (20, 0) gap. */
function riverMap(): WorldMap {
  return testWorldMap({
    tilesX: 40,
    tilesY: 40,
    seed: 7,
    tileType: (x, y) => (x === 20 && y !== 0 ? TerrainType.River : undefined),
  });
}

/** A 40×40 map whose tile (30, 30) sits on an island ringed by river. */
function islandMap(): WorldMap {
  return testWorldMap({
    tilesX: 40,
    tilesY: 40,
    seed: 7,
    tileType: (x, y) =>
      (x >= 29 && x <= 31 && y >= 29 && y <= 31 && !(x === 30 && y === 30) ? TerrainType.River : undefined),
  });
}

/** A completed building centred on one tile — the estimate reads a position, not a footprint. */
function onTile(id: number, type: BuildingType, tileX: number, tileY: number): Building {
  return building(id, type, {
    x: tileX * PATH_CELL + PATH_CELL / 2,
    y: tileY * PATH_CELL + PATH_CELL / 2,
  });
}

/** The straight-line hours between two buildings — the estimate's own fallback. */
function straightHours(home: Building, destination: Building): number {
  return commuteLeadHoursFor(Math.hypot(destination.x - home.x, destination.y - home.y), WALK_SPEED);
}

/** This call's share of the pathfinder's A* counter, with the tick bucket drained either side. */
function measuredSearches(run: () => number): { value: number; searches: number } {
  resetPathfinderTickMetrics();
  const value = run();
  flushPathfinderTickToSession();
  resetPathfinderTickMetrics();
  return { value, searches: getPathfinderReport().session.findPathCalls };
}

describe('estimatedCommuteHours route pricing', () => {
  beforeEach(() => {
    resetPathGridCaches();
    setCurrentPathMap(null);
    beginCommuteRoutePass();
  });

  it('prices the detour around a river instead of the straight line through it', () => {
    setCurrentPathMap(riverMap(), []);
    const home = onTile(1, BuildingType.House, 10, 20);
    const across = onTile(2, BuildingType.Quarry, 30, 20);

    expect(estimatedCommuteHours(home, across, [], WALK_SPEED))
      .toBeGreaterThan(straightHours(home, across) * 1.5);
  });

  it('prices a home across an uncrossable barrier as unreachable, never by the straight line', () => {
    setCurrentPathMap(islandMap(), []);
    const home = onTile(1, BuildingType.House, 10, 20);
    const island = onTile(2, BuildingType.Quarry, 30, 30);

    expect(estimatedCommuteHours(home, island, [], WALK_SPEED)).toBe(Infinity);
  });

  it('prices the reachable facades rather than assuming a full centre-to-centre walk', () => {
    setCurrentPathMap(riverMap(), []);
    const home = onTile(1, BuildingType.House, 5, 5);
    const sameSide = onTile(2, BuildingType.Quarry, 15, 5);

    const routed = estimatedCommuteHours(home, sameSide, [], WALK_SPEED);
    // A walker enters from the nearest open facade; building centres are not walkable
    // destinations, so their separation cannot be imposed as a hard minimum.
    expect(routed).toBeGreaterThanOrEqual(straightHours(home, sameSide) / 1.5 * 0.7);
    expect(routed).toBeLessThan(straightHours(home, sameSide) * 1.2);
  });

  it('prices a paved route that is longer on the map but cheaper to walk', () => {
    // A 21-tile paved strip one row below the straight line: 22 steps against the line's 20, but a
    // road step costs a fraction of an open-ground step, so the detour is the cheaper route.
    const map = testWorldMap({ tilesX: 40, tilesY: 40, seed: 7 });
    const road = building(3, BuildingType.Road, {
      x: 20.5 * PATH_CELL,
      y: 11.5 * PATH_CELL,
      width: 21 * PATH_CELL,
      height: PATH_CELL,
      completed: true,
    });
    setCurrentPathMap(map, [road]);

    const grid = getCurrentPathGrid();
    expect(grid).toBeTruthy();
    const paved = findRouteCost(grid!, 10, 10, 30, 10, 4000);

    // The straight ground route costs one per step, so twenty: a cost search that returns twenty
    // has priced the slower route and would misjudge a household's commute.
    expect(paved).not.toBeNull();
    expect(paved!).toBeLessThan(20);
  });

  it('accepts a paved 700 px commute even when unpaved travel exceeds two hours', () => {
    const map = testWorldMap({ tilesX: 95, tilesY: 40, seed: 7 });
    const home = building(1, BuildingType.House, { x: 105, y: 205 });
    const workplace = building(2, BuildingType.Quarry, { x: 805, y: 205 });
    const road = building(3, BuildingType.Road, {
      x: 455, y: 205, width: 660, height: PATH_CELL, completed: true,
    });
    const worker = human(4, { x: home.x, y: home.y, residenceBuildingId: home.id });
    const walkSpeed = 8;

    setCurrentPathMap(map, [home, workplace]);
    const unpaved = quoteBuildingCommute(home, workplace, walkSpeed);
    expect(unpaved.status).toBe('priced');
    if (unpaved.status !== 'priced') return;
    expect(unpaved.travelHours).toBeGreaterThan(2);
    expect(isWithinAssignableCommute(worker, workplace, [home, workplace], walkSpeed)).toBe(false);

    setCurrentPathMap(map, [home, workplace, road]);
    beginCommuteRoutePass();
    const paved = quoteBuildingCommute(home, workplace, walkSpeed);
    expect(paved.status).toBe('priced');
    if (paved.status !== 'priced') return;
    expect(paved.travelHours).toBeLessThan(2);
    expect(paved.travelHours).toBeLessThan(unpaved.travelHours);
    expect(paved.costTiles).toBeLessThan(unpaved.costTiles);
    expect(isWithinAssignableCommute(worker, workplace, [home, workplace, road], walkSpeed)).toBe(true);
  });

  it('food placement previews use the supplied map, not a prior walkable colony grid', () => {
    const clear = testWorldMap({ tilesX: 40, tilesY: 40, seed: 9 });
    const blocked = islandMap();
    const home = onTile(1, BuildingType.House, 25, 30);
    const farm = onTile(2, BuildingType.Farm, 30, 30);
    const settler = human(3, { x: home.x, y: home.y, residenceBuildingId: home.id });
    setCurrentPathMap(clear, [home, farm]);

    expect(isWithinAssignableCommute(settler, farm, [home, farm], WALK_SPEED)).toBe(true);
    expect(isWithinAssignableCommute(settler, farm, [home, farm], WALK_SPEED,
      undefined, blocked)).toBe(false);
    // A speculative bot decision must not replace the simulation's grid.
    expect(isWithinAssignableCommute(settler, farm, [home, farm], WALK_SPEED)).toBe(true);
  });

  it('falls back to the straight line when no grid is current', () => {
    const home = onTile(1, BuildingType.House, 10, 20);
    const across = onTile(2, BuildingType.Quarry, 30, 20);

    expect(estimatedCommuteHours(home, across, [], WALK_SPEED)).toBe(straightHours(home, across));
  });

  it('searches a leg once and serves the repeat from the route cache', () => {
    setCurrentPathMap(riverMap(), []);
    const home = onTile(1, BuildingType.House, 10, 20);
    const across = onTile(2, BuildingType.Quarry, 30, 20);

    setPathfindingMetricsEnabled(true);
    resetPathfinderSession();
    const first = measuredSearches(() => estimatedCommuteHours(home, across, [], WALK_SPEED));
    const second = measuredSearches(() => estimatedCommuteHours(home, across, [], WALK_SPEED));
    setPathfindingMetricsEnabled(false);

    expect(first.value).toBe(second.value);
    // A four-sided building can price up to sixteen facade pairs. A repeated
    // quote must reuse them all without incrementing the search count.
    expect(first.searches).toBeGreaterThanOrEqual(1);
    expect(first.searches).toBeLessThanOrEqual(16);
    expect(second.searches).toBe(first.searches);
  });

  it('defers unsolved legs when the search budget is spent, never approving a direct-line shortcut', () => {
    setCurrentPathMap(riverMap(), []);
    const home = onTile(1, BuildingType.House, 10, 20);
    const destinations: Building[] = [];
    for (let y = 1; y < 40 && destinations.length <= MAX_COMMUTE_ROUTE_SEARCHES_PER_PASS + 120; y++) {
      for (let x = 25; x <= 35 && destinations.length <= MAX_COMMUTE_ROUTE_SEARCHES_PER_PASS + 120; x++) {
        destinations.push(onTile(100 + destinations.length, BuildingType.Quarry, x, y));
      }
    }

    // Adjacent buildings can share the same exterior doorstep tile; cover enough distinct
    // endpoints to exhaust the *actual A* budget*, not just the number of candidate buildings.
    const values = destinations.map((destination) =>
      estimatedCommuteHours(home, destination, [], WALK_SPEED),
    );
    expect(values[0]).toBeGreaterThan(straightHours(home, destinations[0]!));
    expect(values[values.length - 1]).toBe(Infinity);
    expect(wereCommuteRouteChecksDeferred()).toBe(true);
  });
});
