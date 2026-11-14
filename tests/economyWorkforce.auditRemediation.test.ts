/**
 * Audit remediation for the economy and auto-staffing defects: the Mill bonus is player-only, a
 * jailed holder's post is backfilled, a completed Taming Post offers no unfillable slots, a full food
 * building can seed another, construction leaves hands for the preset's jobs, and a bounded swap
 * resolves an unreachable vacancy.
 */
import { describe, expect, it } from 'vitest';
import { BUILDING_CONFIGS, BuildingType, EntityType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { createBuilding, createEntity, initGame } from '../src/game/worldGen';
import { gameTick } from '../src/game/gameTick';
import { tickAtDailyPhase } from '../src/game/dayCycleClock';
import {
  assignMissingWorkers,
  countActiveWorkersAtBuilding,
  countWorkersAtBuilding,
  rebalanceJobWorkers,
  staffingCapFor,
} from '../src/game/workforce';

const SEED = 20_261_112;

function completed(
  type: BuildingType,
  x: number,
  y: number,
  id: number,
  overrides: Partial<Building> = {},
): Building {
  const building = createBuilding(type, x, y, id);
  building.completed = true;
  building.constructionProgress = 100;
  Object.assign(building, overrides);
  return building;
}

function settler(id: number, x: number, y: number, overrides: Partial<Entity> = {}): Entity {
  const entity = createEntity(
    EntityType.Human, x, y, id, 400, false,
    { gender: 'male', name: `Settler${id}`, surname: 'Test', ageYears: 30, colonyDay: 0 },
  );
  Object.assign(entity, overrides);
  return entity;
}

function freshWorld(): WorldState {
  return initGame({ skipTerrain: true, villageName: 'Audit', size: 'medium', seed: SEED });
}

/** A farm with one witnessed shift, standing on the tick before its 18:00 production pass. */
function farmWorld(mill: 'none' | 'player' | 'rival'): WorldState {
  const state = freshWorld();
  const farm = completed(BuildingType.Farm, 100, 100, 30);
  farm.occupants = [1];
  const worker = settler(1, 100, 100, { workerBuildingId: farm.id, scheduleLastWorkedHours: 9 });
  state.entities = [worker];
  state.buildings = [farm];
  if (mill !== 'none') {
    const millBuilding = completed(BuildingType.Mill, 200, 100, 31);
    if (mill === 'rival') millBuilding.faction = 'rival';
    state.buildings.push(millBuilding);
  }
  state.resources.food = 300;
  state.tick = tickAtDailyPhase(2, 'production') - 1;
  return state;
}

function runProductionPass(state: WorldState): number {
  const before = state.resources.food;
  gameTick(state);
  return state.resources.food - before;
}

describe('the Mill farm bonus belongs to the player', () => {
  it('grants no bonus for a rival Mill and the full bonus for a player Mill', () => {
    const none = runProductionPass(farmWorld('none'));
    const rival = runProductionPass(farmWorld('rival'));
    const player = runProductionPass(farmWorld('player'));

    expect(none, 'the fixture must produce food, or the bonus proves nothing').toBeGreaterThan(0);
    expect(rival, 'a rival Mill must not feed the player\'s farms').toBe(none);
    expect(player, 'a player Mill raises farm output').toBeGreaterThan(none);
  });
});

describe('a jailed holder\'s post is backfilled', () => {
  it('hires reachable idle settlers into posts the sentence reserved', () => {
    const state = freshWorld();
    const farm = completed(BuildingType.Farm, 100, 100, 40);
    const jailed = [1, 2].map((id) => settler(id, 100 + id, 100, {
      workerBuildingId: farm.id,
      prisonBuildingId: 90,
      prisonerUntilTick: 100_000,
    }));
    const idle = [3, 4].map((id) => settler(id, 105 + id, 100));
    state.entities = [...jailed, ...idle];
    state.buildings = [farm];

    assignMissingWorkers(state.entities, state.buildings, state);

    expect(countActiveWorkersAtBuilding(state.entities, farm.id)).toBe(
      BUILDING_CONFIGS[BuildingType.Farm].maxOccupants,
    );
    expect(countWorkersAtBuilding(state.entities, farm.id)).toBe(
      BUILDING_CONFIGS[BuildingType.Farm].maxOccupants + jailed.length,
    );
    for (const prisoner of jailed) expect(prisoner.workerBuildingId).toBe(farm.id);
  });
});

describe('a completed Taming Post exposes no post a mechanism cannot fill', () => {
  it('reports no staffing posts while keeping its construction slots', () => {
    const post = completed(BuildingType.TamingPost, 100, 100, 50);
    const idle = settler(1, 100, 100);

    expect(staffingCapFor(post, [idle])).toEqual({ cap: 0, staffed: 0 });
    // Construction still uses the two configured slots (`BUILDING_JOB_TYPES` has no Taming Post job).
    expect(BUILDING_CONFIGS[BuildingType.TamingPost].maxOccupants).toBe(2);
  });
});

describe('construction leaves hands for the preset\'s jobs', () => {
  it('seeds the growth preset\'s job building before the builders take the idle pool', () => {
    const state = freshWorld();
    state.workforcePolicy = 'growth';
    const mill = completed(BuildingType.LumberMill, 200, 200, 60);
    const house = createBuilding(BuildingType.House, 100, 100, 61);
    const settlers = Array.from({ length: 6 }, (_, i) => settler(10 + i, 100 + i, 100));
    state.entities = settlers;
    state.buildings = [house, mill];

    assignMissingWorkers(settlers, state.buildings, state);

    expect(countActiveWorkersAtBuilding(settlers, mill.id), 'the Lumber Mill is not left empty').toBeGreaterThan(0);
    expect(house.occupants.length, 'the construction site still has a crew').toBeGreaterThan(0);
  });
});

describe('a bounded swap resolves a vacancy no idle settler can reach', () => {
  it('moves the reachable worker and backfills the post behind them', () => {
    const mill = completed(BuildingType.LumberMill, 600, 0, 70);
    const quarry = completed(BuildingType.Quarry, 1_200, 0, 71);
    // The mill worker reaches both sites; the idle settler reaches only the mill.
    const atMill = settler(1, 850, 0, { workerBuildingId: mill.id });
    const idle = settler(2, 100, 0);
    mill.occupants = [atMill.id];

    rebalanceJobWorkers([atMill, idle], [mill, quarry], 'growth', 100);

    expect(atMill.workerBuildingId, 'the reachable worker takes the far vacancy').toBe(quarry.id);
    expect(idle.workerBuildingId, 'the post behind them is backfilled').toBe(mill.id);
    expect(quarry.occupants).toContain(atMill.id);
    expect(mill.occupants).toContain(idle.id);
  });
});
