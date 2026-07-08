import { initGame } from '../../game/gameEngine';
import { assignIdleWorkerToBuilding } from '../../game/buildingActions';
import { syncResidenceOccupants } from '../../game/dayCycle';
import { isPlayerHuman } from '../../game/groupEvents';
import { createBuilding, createEntity } from '../../game/worldGen';
import type { Building, Entity, VisitorGroup, WorldState } from '../../game/gameTypes';
import { BuildingType,  EntityType } from '../../game/gameTypes';

/** Completed structure via worldGen.createBuilding — same path as gameplay placement. */
export function addCompletedBuilding(
  state: WorldState,
  type: BuildingType,
  id: number,
  x: number,
  y: number,
): Building {
  const b = createBuilding(type, x, y, id, 0);
  b.completed = true;
  b.constructionProgress = 100;
  state.buildings.push(b);
  return b;
}

export function makeCompletedHouse(state: WorldState, id: number, x = 200): Building {
  return addCompletedBuilding(state, BuildingType.House, id, x, 100);
}

export function makeIncompleteSite(state: WorldState, id: number, type: BuildingType): Building {
  const b = createBuilding(type, 200, 200, id, 0);
  b.constructionProgress = 10;
  state.buildings.push(b);
  return b;
}

/** Sync residence occupants through dayCycle — same as production housing updates. */
export function assignResidentToHouse(state: WorldState, human: Entity, house: Building): void {
  human.residenceBuildingId = house.id;
  syncResidenceOccupants(state.entities.filter(isPlayerHuman), state.buildings);
}

/** Assign a worker through buildingActions.assignIdleWorkerToBuilding. */
export function assignWorkerToBuilding(
  state: WorldState,
  buildingId: number,
  humanId: number,
): WorldState {
  return assignIdleWorkerToBuilding(state, buildingId, humanId);
}

export function refugeeGroup(id = 'ref_test'): VisitorGroup {
  return {
    id,
    name: 'Weary Refugees',
    kind: 'refugees',
    campX: 80,
    campY: 80,
    daysLeft: 5,
    entityIds: [],
    tradesCompleted: 0,
    giftsGiven: 0,
    refugeeResolved: false,
    leaderTalked: false,
  };
}

export function freshState(): WorldState {
  const state = initGame();
  state.maxHumanPopulation = 200;
  makeCompletedHouse(state, 99, 150);
  return state;
}

export function makeAdultSettler(id: number, surname = 'Test', ageYears = 25): ReturnType<typeof createEntity> {
  const e = createEntity(EntityType.Human, 100, 100, id, 250, false, {
    gender: 'male',
    surname,
  });
  e.age = ageYears;
  e.isJuvenile = false;
  e.faction = undefined;
  return e;
}

/** Set life-age years on an entity created via createEntity (opts do not include age). */
export function withLifeAge(ent: ReturnType<typeof createEntity>, ageYears: number, juvenile = false): void {
  ent.age = ageYears;
  ent.isJuvenile = juvenile;
}