/**
 * The housing commute estimate prices the walkable route, so a home across a river is scored by the
 * detour it forces instead of the straight line through the water — with a cache and a per-sweep
 * search budget, and the straight line as the fallback whenever no route is priced.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  beginCommuteRoutePass,
  commuteLeadHoursFor,
  estimatedCommuteHours,
  MAX_COMMUTE_ROUTE_SEARCHES_PER_PASS,
} from '../src/game/commuteReach';
import { resetPathGridCaches, setCurrentPathMap } from '../src/game/pathfinding';
import {
  flushPathfinderTickToSession,
  getPathfinderReport,
  resetPathfinderSession,
  resetPathfinderTickMetrics,
  setPathfindingMetricsEnabled,
} from '../src/game/pathfindingMetrics';
import { BuildingType, PATH_CELL, TerrainType } from '../src/game/gameTypes';
import type { Building, WorldMap } from '../src/game/gameTypes';
import { building } from '../src/test/factories';
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

  it('agrees with the straight line when the route is unobstructed', () => {
    setCurrentPathMap(riverMap(), []);
    const home = onTile(1, BuildingType.House, 5, 5);
    const sameSide = onTile(2, BuildingType.Quarry, 15, 5);

    const routed = estimatedCommuteHours(home, sameSide, [], WALK_SPEED);
    expect(routed).toBeGreaterThanOrEqual(straightHours(home, sameSide));
    expect(routed).toBeLessThan(straightHours(home, sameSide) * 1.2);
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
    expect(first.searches).toBe(1);
    expect(second.searches).toBe(1);
  });

  it('stops searching once the sweep budget is spent and prices the rest straight-line', () => {
    setCurrentPathMap(riverMap(), []);
    const home = onTile(1, BuildingType.House, 10, 20);
    const destinations: Building[] = [];
    for (let y = 1; y <= 40 && destinations.length <= MAX_COMMUTE_ROUTE_SEARCHES_PER_PASS; y++) {
      for (let x = 25; x <= 35 && destinations.length <= MAX_COMMUTE_ROUTE_SEARCHES_PER_PASS; x++) {
        destinations.push(onTile(100 + destinations.length, BuildingType.Quarry, x, y));
      }
    }

    const values = destinations.map((destination) =>
      estimatedCommuteHours(home, destination, [], WALK_SPEED),
    );
    const last = destinations[destinations.length - 1]!;

    expect(values[0]).toBeGreaterThan(straightHours(home, destinations[0]!));
    expect(values[values.length - 1]).toBe(straightHours(home, last));
  });
});
