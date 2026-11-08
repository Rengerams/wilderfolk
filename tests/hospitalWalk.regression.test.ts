/**
 * One pregnancy hospital rule: the lifecycle's 85% threshold plus a staffed ward sends a settler to
 * hospital regardless of shift, and below it pregnancy never routes anyone away from work.
 */
import { describe, expect, it } from 'vitest';
import { pickHospitalWalkTarget } from '../src/game/hospitalCare';
import {
  isPregnancyHospitalPriority,
  isStaffedHospital,
  tickHumanDoctorHospitalService,
  tickHumanHospitalPatientCare,
} from '../src/game/humanHospitalBehavior';
import { isPregnancyHospitalDue } from '../src/game/simulation/humanLifecycle';
import { doctorHospitalShift, HOSPITAL_SHIFT_HOURS } from '../src/game/hospitalShifts';
import { personDayRoll } from '../src/game/simRng';
import { PREGNANCY_TICKS, TICKS_PER_DAY, TICKS_PER_HOUR, getTickOfDay } from '../src/game/dayCycle';
import { BuildingType, JobType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';

/** The one threshold, as a test fixture may spell it: 85% of the term. */
const HOSPITAL_THRESHOLD_PROGRESS = PREGNANCY_TICKS * 0.85;

function entity(x: number, y: number, overrides: Partial<Entity> = {}): Entity {
  return {
    id: 1,
    type: 'human',
    x,
    y,
    vx: 0,
    vy: 0,
    alive: true,
    age: 25,
    energy: 100,
    maxEnergy: 100,
    gender: 'female',
    isJuvenile: false,
    ...overrides,
  } as Entity;
}

function hospital(id: number, x: number, y: number, occupants: number[] = []): Building {
  return {
    id,
    type: BuildingType.Hospital,
    x,
    y,
    width: 40,
    height: 32,
    occupants,
    level: 1,
    constructionProgress: 100,
    completed: true,
    health: 100,
    maxHealth: 100,
    spriteScale: 1,
    buildAnimTimer: 0,
  };
}

describe('pickHospitalWalkTarget', () => {
  it('returns the nearest staffed hospital when farther than 28px', () => {
    const patient = entity(0, 0, { pregnant: true });
    const near = hospital(1, 500, 0);
    const far = hospital(2, 900, 0);
    const target = pickHospitalWalkTarget(patient, [near, far]);
    expect(target?.id).toBe(near.id);
  });

  it('returns undefined when the settler is already at a hospital (<= 28px)', () => {
    const patient = entity(10, 10, { pregnant: true });
    expect(pickHospitalWalkTarget(patient, [hospital(1, 0, 0)])).toBeUndefined();
  });

  it('returns undefined when there is no staffed hospital', () => {
    const patient = entity(0, 0, { pregnant: true });
    expect(pickHospitalWalkTarget(patient, [])).toBeUndefined();
  });

  it('still picks a hospital when it is far away (walking distance is not capped)', () => {
    const patient = entity(0, 0);
    expect(pickHospitalWalkTarget(patient, [hospital(1, 10_000, 10_000)])?.id).toBe(1);
  });

  it('admits an exhausted patient at a large hospital by its entrance, not its footprint centre', () => {
    const ward = { ...hospital(1, 100, 100, [7]), width: 120, height: 80 };
    // Standing at the south door: 60 px from the centre, 8 px from the entrance.
    const patient = entity(ward.x, ward.y + ward.height / 2 + 20, { energy: 10, pregnant: false });

    tickHumanHospitalPatientCare({
      state: { tick: 0 } as WorldState,
      entity: patient,
      staffedHospitals: [ward],
      speed: 2,
    });

    expect(patient.indoorBuildingId).toBe(ward.id);
  });

  it('does not mark a patient indoors while they are still more than a door away', () => {
    const ward = { ...hospital(1, 100, 100, [7]), width: 120, height: 120 };
    const door = { x: ward.x + ward.width / 2, y: ward.y + ward.height + 12 };
    const patient = entity(door.x, door.y - 20, { energy: 10 });

    tickHumanHospitalPatientCare({
      state: { tick: 0 } as WorldState,
      entity: patient,
      staffedHospitals: [ward],
      speed: 2,
    });

    expect(patient.indoorBuildingId).toBeUndefined();
  });
});

describe('the single pregnancy hospital threshold', () => {
  it('is false without a pregnancy and false below 85%', () => {
    expect(isPregnancyHospitalDue(entity(0, 0))).toBe(false);
    expect(isPregnancyHospitalDue(entity(0, 0, { pregnant: true, pregnancyProgress: 0 }))).toBe(false);
    expect(isPregnancyHospitalDue(entity(0, 0, { pregnant: true, pregnancyProgress: HOSPITAL_THRESHOLD_PROGRESS - 1 }))).toBe(false);
  });

  it('is true at exactly 85% and every later progress', () => {
    expect(isPregnancyHospitalDue(entity(0, 0, { pregnant: true, pregnancyProgress: HOSPITAL_THRESHOLD_PROGRESS }))).toBe(true);
    expect(isPregnancyHospitalDue(entity(0, 0, { pregnant: true, pregnancyProgress: PREGNANCY_TICKS }))).toBe(true);
  });

  it('needs a staffed ward as well as the threshold', () => {
    const due = entity(0, 0, { pregnant: true, pregnancyProgress: HOSPITAL_THRESHOLD_PROGRESS });
    expect(isPregnancyHospitalPriority(due, true)).toBe(true);
    expect(isPregnancyHospitalPriority(due, false)).toBe(false);
    expect(isPregnancyHospitalPriority(entity(0, 0, { pregnant: true, pregnancyProgress: 120 }), true)).toBe(false);
  });

  it('counts only a completed, player-owned, staffed ward as available', () => {
    expect(isStaffedHospital(hospital(1, 0, 0, [2]))).toBe(true);
    expect(isStaffedHospital(hospital(1, 0, 0, []))).toBe(false);
    expect(isStaffedHospital({ ...hospital(1, 0, 0, [2]), completed: false })).toBe(false);
    expect(isStaffedHospital({ ...hospital(1, 0, 0, [2]), faction: 'rival' })).toBe(false);
  });
});

describe('hospital routing follows the threshold, not the shift', () => {
  function routedAt(progress: number, opts: { staffed?: boolean; overrides?: Partial<Entity> } = {}) {
    const ward = hospital(5, 400, 300, [7]);
    const patient = entity(20, 20, {
      pregnant: true,
      pregnancyProgress: progress,
      ...opts.overrides,
    });
    tickHumanHospitalPatientCare({
      state: { tick: 0 } as WorldState,
      entity: patient,
      staffedHospitals: opts.staffed === false ? [] : [ward],
      speed: 2,
    });
    return patient;
  }

  it('leaves a settler below 85% where she is, off shift or not', () => {
    const patient = routedAt(HOSPITAL_THRESHOLD_PROGRESS - 1);
    expect(Math.hypot(patient.vx, patient.vy)).toBe(0);
    expect(patient.indoorBuildingId).toBeUndefined();
  });

  it('starts hospital travel at exactly 85%', () => {
    const patient = routedAt(HOSPITAL_THRESHOLD_PROGRESS);
    expect(Math.hypot(patient.vx, patient.vy)).toBeGreaterThan(0);
    expect(patient.indoorBuildingId).toBeUndefined();
  });

  it('keeps travelling above 85% with no shift in play', () => {
    const patient = routedAt(PREGNANCY_TICKS);
    expect(Math.hypot(patient.vx, patient.vy)).toBeGreaterThan(0);
  });

  it('invents neither travel nor admission when no ward is staffed', () => {
    const patient = routedAt(PREGNANCY_TICKS, { staffed: false });
    expect(Math.hypot(patient.vx, patient.vy)).toBe(0);
    expect(patient.indoorBuildingId).toBeUndefined();
  });

  it('admits her only on real arrival at the ward', () => {
    const ward = hospital(5, 100, 100, [7]);
    const patient = entity(ward.x, ward.y, { pregnant: true, pregnancyProgress: PREGNANCY_TICKS });
    tickHumanHospitalPatientCare({
      state: { tick: 0 } as WorldState,
      entity: patient,
      staffedHospitals: [ward],
      speed: 2,
    });
    expect(patient.indoorBuildingId).toBe(ward.id);
  });

  it('gives a near-term doctor the same hospital priority as every other trade', () => {
    const doctor = routedAt(PREGNANCY_TICKS, { overrides: { job: JobType.Doctor, workerBuildingId: 5 } });
    expect(Math.hypot(doctor.vx, doctor.vy)).toBeGreaterThan(0);
  });
});

describe('doctor duty under the one pregnancy rule', () => {
  /** A patient id whose daily roll clears the doctor's own 35% treatment gate on that tick. */
  function treatablePatientId(doctorId: number, tick: number): number | null {
    for (let id = 2; id < 200; id++) {
      if (personDayRoll(doctorId, tick, 901 + id) <= 0.35) return id;
    }
    return null;
  }

  /**
   * Runs the real ward round at the ticks the roster schedules it, with a patient whose roll passes,
   * so `treated` reports whether the doctor actually served.
   */
  function wardRoundServes(progress: number, staffed: boolean): boolean {
    const ward = { ...hospital(5, 100, 100, [1, 2, 3, 4, 5]), width: 60, height: 40 };
    const hx = ward.x + ward.width / 2;
    const hy = ward.y + ward.height * 0.9;
    const doctor = entity(hx, hy, {
      id: 1,
      job: JobType.Doctor,
      workerBuildingId: ward.id,
      pregnant: true,
      pregnancyProgress: progress,
    });
    for (let tick = 1; tick <= 6 * TICKS_PER_DAY; tick++) {
      const shift = doctorHospitalShift(ward, tick, doctor.id);
      if (!shift) continue;
      const roundTick = shift.startHour * TICKS_PER_HOUR + (doctor.id % (HOSPITAL_SHIFT_HOURS * TICKS_PER_HOUR));
      if (getTickOfDay(tick) !== roundTick) continue;
      const patientId = treatablePatientId(doctor.id, tick);
      if (patientId == null) continue;
      const patient = entity(hx, hy, {
        id: patientId,
        energy: 5,
        needs: { nutrition: 80, rest: 80, stamina: 10, severeHungerTicks: 0 },
      });
      const state = {
        tick,
        entities: [doctor, patient],
        resources: { wood: 0, stone: 0, food: 100, gold: 0, iron: 0 },
        floatingTexts: [],
        nextFloatingTextId: 1,
      } as unknown as WorldState;
      tickHumanDoctorHospitalService({
        state,
        entity: doctor,
        allHumans: [doctor, patient],
        updatedBuildings: [ward],
        staffedHospitals: staffed ? [ward] : [],
        onHospitalShift: true,
      });
      return patient.energy > 5;
    }
    throw new Error('no scheduled ward round found in the fixture window');
  }

  it('lets a doctor at 81% run the ward round', () => {
    expect(wardRoundServes(PREGNANCY_TICKS * 0.81, true)).toBe(true);
  });

  it('keeps a doctor at 85% from serving when a staffed ward can take her', () => {
    expect(wardRoundServes(PREGNANCY_TICKS, true)).toBe(false);
  });

  it('still lets her serve at 85% when no staffed ward exists to attend', () => {
    expect(wardRoundServes(PREGNANCY_TICKS, false)).toBe(true);
  });
});
