/** A deferred route is not a completed staffing decision.
 * The next scheduled assignment pulse must retry with a fresh search budget.
 */
import { describe, expect, it, vi } from 'vitest';
import { BuildingType } from '../src/game/gameTypes';
import type { WorldState } from '../src/game/gameTypes';
import { assignMissingWorkers } from '../src/game/workforce';
import { building, human } from '../src/test/factories';

const route = vi.hoisted(() => ({
  deferred: true,
  searches: 0,
  budgets: [] as number[],
  grid: { cols: 128, rows: 128 },
}));

vi.mock('../src/game/pathfinding', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/game/pathfinding')>();
  return {
    ...actual,
    getCurrentPathGrid: () => route.grid,
    findRouteCostOutcome: (_grid: unknown, _sx: number, _sy: number, _tx: number, _ty: number, maxNodes: number) => {
      route.searches++;
      route.budgets.push(maxNodes);
      return route.deferred
        ? { cost: null, budgetExhausted: true }
        : { cost: 1, budgetExhausted: false };
    },
  };
});

describe('budget-deferred workforce commute', () => {
  it('retries an unchanged colony at the next staffing pulse instead of waiting a week', () => {
    route.deferred = true;
    route.searches = 0;
    route.budgets = [];
    const worker = human(1, { x: 0, y: 0 });
    const farm = building(2, BuildingType.Farm, { x: 120, y: 0 });
    const world = {
      entities: [worker],
      buildings: [farm],
      tick: 100,
      resources: { food: 100, wood: 100, stone: 100, iron: 100, gold: 100 },
      workforcePolicy: 'balanced',
    } as unknown as WorldState;

    assignMissingWorkers(world.entities, world.buildings, world);
    expect(worker.workerBuildingId).toBeUndefined();
    expect(route.searches).toBeGreaterThan(0);
    const firstSearches = route.searches;

    // Same people, buildings, policy and tick: only the route budget recovers.
    route.deferred = false;
    assignMissingWorkers(world.entities, world.buildings, world);
    expect(route.searches).toBeGreaterThan(firstSearches);
    expect(route.budgets).toEqual([4000, 8000]);
    expect(worker.workerBuildingId).toBe(farm.id);
    expect(farm.occupants).toContain(worker.id);

    // With a fully priced commute, a subsequent unchanged pulse can be cached.
    const completedSearches = route.searches;
    assignMissingWorkers(world.entities, world.buildings, world);
    expect(route.searches).toBe(completedSearches);
  });
  it('increases the node limit across pulses, then stops after the bounded terminal verdict', () => {
    route.deferred = true;
    route.searches = 0;
    route.budgets = [];
    route.grid = { cols: 32, rows: 32 };
    const worker = human(90, { x: 0, y: 0 });
    const farm = building(92, BuildingType.Farm, { x: 120, y: 0 });
    const world = {
      entities: [worker], buildings: [farm], tick: 123,
      resources: { food: 100, wood: 100, stone: 100, iron: 100, gold: 100 },
      workforcePolicy: 'balanced',
    } as unknown as WorldState;

    // Every request exhausts its node allowance. A 32×32 grid has a
    // conservative terminal cap of 4,096 nodes, so the second search ends
    // the retry sequence instead of deferring indefinitely.
    assignMissingWorkers(world.entities, world.buildings, world);
    expect(route.budgets).toEqual([4000]);
    assignMissingWorkers(world.entities, world.buildings, world);
    expect(route.budgets).toEqual([4000, 4096]);
    assignMissingWorkers(world.entities, world.buildings, world);
    expect(route.budgets).toEqual([4000, 4096]);
    expect(worker.workerBuildingId).toBeUndefined();
  });

});
