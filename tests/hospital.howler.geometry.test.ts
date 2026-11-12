/**
 * Geometry regressions for two gameplay promises: `building.x/y` is the footprint centre, so the
 * hospital gates must read the centre + the shared reach rule (S-10), and "keep settlers indoors"
 * on a full moon must actually shelter them from the Moon Howler's prey filter (S-16).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { BUILDING_CONFIGS, BuildingType, EntityType, JobType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import type { TickContext } from '../src/game/simulation/simulationTypes';
import { createBuilding, initGame } from '../src/game/worldGen';
import { createEntity } from '../src/game/entityFactory';
import { TICKS_PER_DAY } from '../src/game/dayCycle';
import { personDayRoll, setSimSeed } from '../src/game/simRng';
import { resetPathGridCaches } from '../src/game/pathfinding';
import {
  doctorTreatNearby,
  pickHospitalWalkTarget,
  tickHospitalDailyCare,
} from '../src/game/hospitalCare';
import { getHumanStaminaRatio } from '../src/game/simulation/humanPhysiology';
import { tickWildlife } from '../src/game/tickLayerSystems';

const FIXTURE_SEED = 20_261_111;
const WARD_ID = 10;
const DOCTOR_ID = 20;
const PATIENT_ID = 21;
/** A real Hospital footprint: the audit's 53 × 46 building, not a toy rectangle. */
const WARD_CONFIG = BUILDING_CONFIGS[BuildingType.Hospital];
const WARD_X = 500;
const WARD_Y = 400;

function freshState(entities: Entity[], buildings: Building[]): WorldState {
  const state = initGame({ skipTerrain: true, seed: FIXTURE_SEED });
  state.entities = entities;
  state.buildings = buildings;
  state.tick = 0;
  return state;
}

function ward(occupants: number[], x = WARD_X, y = WARD_Y): Building {
  const hospital = createBuilding(BuildingType.Hospital, x, y, WARD_ID);
  hospital.completed = true;
  hospital.occupants = occupants;
  return hospital;
}

function settler(id: number, x: number, y: number, energy: number): Entity {
  return createEntity(EntityType.Human, x, y, id, energy, false, { ageYears: 30 });
}

/** The first colony day whose ward-round roll lets this doctor treat this patient. */
function passingWardRoundTick(doctorId: number, patientId: number): number {
  for (let day = 0; day < 60; day++) {
    const tick = day * TICKS_PER_DAY;
    if (personDayRoll(doctorId, tick, 901 + patientId) <= 0.35) return tick;
  }
  throw new Error('no ward-round roll passes in the fixture window');
}

/** Runs the doctor's own ward round from one position; the patient stands in the ward. */
function doctorTreatsFrom(x: number, y: number): boolean {
  const hospital = ward([DOCTOR_ID]);
  const doctor = settler(DOCTOR_ID, x, y, 500);
  doctor.job = JobType.Doctor;
  doctor.workerBuildingId = hospital.id;
  const patient = settler(PATIENT_ID, WARD_X, WARD_Y, 200);
  const state = freshState([doctor, patient], [hospital]);
  state.tick = passingWardRoundTick(DOCTOR_ID, PATIENT_ID);
  return doctorTreatNearby(state, doctor, hospital, [patient]);
}

describe('S-10 — hospital gates read the footprint centre and the shared reach rule', () => {
  it('lets a doctor at the true centre and at a walkable frontage run the ward round', () => {
    expect(doctorTreatsFrom(WARD_X, WARD_Y)).toBe(true);
    // The north frontage: 12 px outside the footprint, in front of the west/north door. The old
    // `x + width/2, y + height*0.9` gate sat ~81 px away and refused this doctor.
    expect(doctorTreatsFrom(WARD_X, WARD_Y - WARD_CONFIG.height / 2 - 12)).toBe(true);
  });

  it('refuses a doctor 60 px outside the footprint', () => {
    expect(doctorTreatsFrom(WARD_X + WARD_CONFIG.width / 2 + 60, WARD_Y)).toBe(false);
  });

  it('stops a walk target only when the settler is already at the ward', () => {
    const hospital = ward([DOCTOR_ID]);
    expect(pickHospitalWalkTarget({ x: WARD_X, y: WARD_Y }, [hospital])).toBeUndefined();
    expect(
      pickHospitalWalkTarget(
        { x: WARD_X + WARD_CONFIG.width / 2 + 60, y: WARD_Y },
        [hospital],
      )?.id,
    ).toBe(WARD_ID);
  });

  it('treats a patient inside the true ward radius that the shifted centre missed', () => {
    const hospital = ward([DOCTOR_ID]);
    const doctor = settler(DOCTOR_ID, WARD_X, WARD_Y, 500);
    doctor.job = JobType.Doctor;
    doctor.workerBuildingId = hospital.id;
    // 45 px outside the north wall (68 px from the centre): inside the 70 px ward radius, outside
    // the old shifted 70 px circle. Non-urgent, so only the ward test can reach them.
    const patient = settler(PATIENT_ID, WARD_X, WARD_Y - WARD_CONFIG.height / 2 - 45, 200);
    const state = freshState([doctor, patient], [hospital]);
    const before = getHumanStaminaRatio(patient);

    tickHospitalDailyCare(state, hospital, [doctor, patient]);

    expect(getHumanStaminaRatio(patient)).toBeGreaterThan(before);
  });
});

/** A house and its south doorway, the position a sleeper occupies while indoors. */
function houseAndDoorway(): { house: Building; door: { x: number; y: number } } {
  const house = createBuilding(BuildingType.House, 600, 500, 30);
  house.completed = true;
  const door = { x: house.x, y: house.y + house.height / 2 + 12 };
  return { house, door };
}

function wildlifeContext(state: WorldState, entities: Entity[], howler: Entity): TickContext {
  const byType = {} as Record<EntityType, Entity[]>;
  for (const type of Object.values(EntityType)) byType[type] = [];
  for (const entity of entities) byType[entity.type].push(entity);
  return {
    width: state.width,
    height: state.height,
    hourOfDay: 22,
    season: state.season,
    grassMult: 1,
    reproMult: 1,
    winterPenalty: 0,
    canHeat: true,
    byType,
    aliveEntities: entities,
    newEntities: [],
    updatedBuildings: state.buildings,
    roadBuildings: [],
    playerHumans: entities,
    entityById: new Map(entities.map((entity) => [entity.id, entity])),
    buildingById: new Map(),
    predators: [howler],
  } as unknown as TickContext;
}

/** A hungry active Moon Howler 40 px from a settler at their own doorstep. */
function howlerAtDoor(indoors: boolean): { howler: Entity; settler: Entity } {
  const { house, door } = houseAndDoorway();
  const howler = createEntity(EntityType.Werewolf, door.x + 40, door.y, 40, 350);
  howler.moonHowlerCursed = true;
  const target = settler(41, door.x, door.y, 200);
  if (indoors) target.indoorBuildingId = house.id;
  const state = freshState([howler, target], [house]);

  tickWildlife(state, wildlifeContext(state, state.entities, howler));
  return { howler, settler: target };
}

describe('S-16 — indoors is safe from the Moon Howler', () => {
  it('does not pick a settler whose indoor building record says they are inside', () => {
    expect(howlerAtDoor(true).howler.huntTargetId).toBeUndefined();
  });

  it('still picks the same settler standing at the doorway outside', () => {
    const { howler, settler: target } = howlerAtDoor(false);
    expect(howler.huntTargetId).toBe(target.id);
  });
});

beforeEach(() => {
  // Every gate falls back to the current path grid; a leaked grid from another file would change it.
  resetPathGridCaches();
  setSimSeed(FIXTURE_SEED);
});
