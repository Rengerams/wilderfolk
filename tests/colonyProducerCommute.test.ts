import { gameTick } from '../src/game/gameTick';
import { TICKS_PER_DAY } from '../src/game/dayCycle';
import { afterEach, describe, expect, it } from 'vitest';
import { createColonyObserver, prepareColonyWorld, sampleDelta } from '../scripts/colonyHealth';
import { beginCommuteRoutePass, isWithinAssignableCommute } from '../src/game/commuteReach';
import { BuildingType, MapSize } from '../src/game/gameTypes';
import { getCurrentPathGrid, resetPathGridCaches, setCurrentPathMap } from '../src/game/pathfinding';
import { SPECIES_CONFIG } from '../src/game/speciesConfig';
import { EntityType } from '../src/game/gameTypes';

afterEach(() => {
  setCurrentPathMap(null);
  resetPathGridCaches();
});

describe('seeded producer-colony commute preflight', () => {
  it('can seed a full producer colony on connected dry ground on the huge benchmark map', () => {
    const { world } = prepareColonyWorld({
      size: MapSize.Huge, seed: 12345, scenario: 'producers', preferConnectedStart: true,
    });
    const homes = world.buildings.filter((site) => site.completed && site.type === BuildingType.House);
    const farms = world.buildings.filter((site) => site.completed && site.type === BuildingType.Farm);
    expect(homes).toHaveLength(8);
    expect(farms).toHaveLength(4);
    setCurrentPathMap(world.worldMap, world.buildings);
    const founder = world.entities.find((e) => e.alive && e.type === EntityType.Human)!;
    for (const home of homes) {
      beginCommuteRoutePass();
      const worker = { ...founder, residenceBuildingId: home.id };
      expect(farms.some((farm) =>
        isWithinAssignableCommute(worker, farm, world.buildings, SPECIES_CONFIG[EntityType.Human].speed)),
      `Starter home ${home.id} has no genuine two-hour dry route to a farm`).toBe(true);
    }
  });

  it('observes a full day after normal simulation movement without changing the world', () => {
    const { world } = prepareColonyWorld({ size: MapSize.Medium, seed: 12345, scenario: 'producers' });
    const observer = createColonyObserver(world);
    for (let tick = 0; tick < TICKS_PER_DAY; tick++) {
      gameTick(world);
      const positions = world.entities.map((entity) => [entity.x, entity.y, entity.vx, entity.vy]);
      observer.sampleMovement();
      expect(world.entities.map((entity) => [entity.x, entity.y, entity.vx, entity.vy])).toEqual(positions);
    }
    const report = observer.observe(1, sampleDelta(world), []);
    expect(report.movement.secondsPerDayAt1x).toBe(288);
    expect(report.movement.settlers.length).toBeGreaterThan(0);
    expect(report.movement.settlers.some((sample) => sample.walked > 0)).toBe(true);
    const sampledTicks = world.tick - report.movement.dayStart;
    expect(sampledTicks).toBeGreaterThan(0);
    expect(report.movement.settlers.some((sample) =>
      sample.travelling + sample.atWork + sample.atHome + sample.idle === sampledTicks)).toBe(true);
    expect(report.movement.settlers.every((sample) => Number.isFinite(sample.walked))).toBe(true);
  });

  it('offers a reachable Farm from each of the starter residences', () => {
    const { world } = prepareColonyWorld({ size: MapSize.Medium, seed: 12345, scenario: 'producers' });
    const houses = world.buildings.filter((site) => site.type === BuildingType.House && site.completed);
    const farms = world.buildings.filter((site) => site.type === BuildingType.Farm && site.completed);
    expect(houses.length, 'producer fixture must have completed houses').toBeGreaterThan(0);
    expect(farms.length, 'producer fixture must have completed farms').toBeGreaterThan(0);
    const founder = world.entities.find((person) => person.alive && person.type === EntityType.Human);
    expect(founder).toBeDefined();
    expect(world.worldMap).not.toBeNull();
    setCurrentPathMap(world.worldMap, world.buildings);
    const grid = getCurrentPathGrid();
    expect(grid).not.toBeNull();
    const blockedAt = (x: number, y: number) => {
      if (!grid) return null;
      const col = Math.floor(x / 10);
      const row = Math.floor(y / 10);
      return col < 0 || row < 0 || col >= grid.cols || row >= grid.rows
        ? 'outside'
        : grid.blocked[row * grid.cols + col];
    };
    const coverage = houses.map((home) => {
      // One assignment pulse prices one residence's candidates; a pulse whose legs could not be
      // priced is retried, so each home is quoted on its own pass rather than sharing one budget.
      beginCommuteRoutePass();
      const applicant = { ...founder!, residenceBuildingId: home.id, workerBuildingId: undefined };
      const reachable = farms.filter((farm) =>
        isWithinAssignableCommute(applicant, farm, world.buildings, SPECIES_CONFIG[EntityType.Human].speed));
      return {
        home: home.id,
        location: [home.x, home.y],
        blocked: blockedAt(home.x, home.y),
        reachable: reachable.map((farm) => farm.id),
      };
    });
    expect(coverage.every((entry) => entry.reachable.length > 0),
      `The staffed-farm regression must start from navigable residences: ${JSON.stringify({ coverage, farms: farms.map((farm) => ({ id: farm.id, x: farm.x, y: farm.y, blocked: blockedAt(farm.x, farm.y) })) })}`).toBe(true);
  });
});
