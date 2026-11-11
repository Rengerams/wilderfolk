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
    expect(report.movement.settlers.some((sample) =>
      sample.travelling + sample.atWork + sample.atHome + sample.idle === world.tick - report.movement.dayStart)).toBe(true);
    expect(report.movement.settlers.every((sample) => Number.isFinite(sample.walked))).toBe(true);
  });

  it('offers a reachable Farm from each of the starter residences', () => {
    const { world } = prepareColonyWorld({ size: MapSize.Medium, seed: 12345, scenario: 'producers' });
    const houses = world.buildings.filter((site) => site.type === BuildingType.House && site.completed);
    const farms = world.buildings.filter((site) => site.type === BuildingType.Farm && site.completed);
    const founder = world.entities.find((person) => person.alive && person.type === EntityType.Human);
    expect(founder).toBeDefined();
    expect(world.worldMap).not.toBeNull();
    setCurrentPathMap(world.worldMap, world.buildings);
    beginCommuteRoutePass();
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
