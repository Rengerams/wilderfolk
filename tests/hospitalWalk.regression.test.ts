/**
 * Hospital seeking is a main-loop behavior gated on `needsMedicalCare`: sick or
 * near-term pregnant settlers walk to a staffed hospital, healthy ones do not.
 */
import { describe, expect, it } from 'vitest';
import { pickHospitalWalkTarget } from '../src/game/hospitalCare';
import { doctorMayServe, shouldRoutePregnantSettlerToHospital, shouldAttemptHospitalTreatment, tickHumanHospitalPatientCare } from '../src/game/humanHospitalBehavior';
import { PREGNANCY_TICKS } from '../src/game/dayCycle';
import { BuildingType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';

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

function hospital(id: number, x: number, y: number): Building {
  return {
    id,
    type: BuildingType.Hospital,
    x,
    y,
    width: 40,
    height: 32,
    occupants: [],
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
    const target = pickHospitalWalkTarget(patient, [hospital(1, 0, 0)]);
    expect(target).toBeUndefined();
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
    const ward = { ...hospital(1, 100, 100), width: 120, height: 80, occupants: [7] };
    // Standing at the south door: 60 px from the centre, 8 px from the entrance.
    const patient = entity(ward.x, ward.y + ward.height / 2 + 20, { energy: 10, pregnant: false });

    tickHumanHospitalPatientCare({
      state: { tick: 0 } as WorldState,
      entity: patient,
      staffedHospitals: [ward],
      onJobShift: false,
      speed: 2,
    });

    expect(patient.indoorBuildingId).toBe(ward.id);
  });
});

describe('hospital duty and care gates', () => {
  it('takes a doctor off the ward round at 85% of her own due date, not at the nominal term', () => {
    const personalTerm = PREGNANCY_TICKS * 0.85;
    expect(doctorMayServe(entity(0, 0, { pregnant: true, pregnancyDueProgress: personalTerm, pregnancyProgress: personalTerm * 0.84 }))).toBe(true);
    expect(doctorMayServe(entity(0, 0, { pregnant: true, pregnancyDueProgress: personalTerm, pregnancyProgress: personalTerm * 0.85 }))).toBe(false);
    expect(doctorMayServe(entity(0, 0, { pregnant: false, pregnancyProgress: PREGNANCY_TICKS }))).toBe(true);
  });

  it('does not send a pregnant worker to hospital until she reaches 85% of her personal term', () => {
    const due = PREGNANCY_TICKS * 1.15;
    const early = entity(0, 0, { pregnant: true, pregnancyDueProgress: due, pregnancyProgress: due * 0.84 });
    const late = entity(0, 0, { pregnant: true, pregnancyDueProgress: due, pregnancyProgress: due * 0.86 });
    for (const onShift of [false, true]) {
      expect(shouldRoutePregnantSettlerToHospital(early, onShift, true)).toBe(false);
      expect(shouldRoutePregnantSettlerToHospital(late, onShift, true)).toBe(true);
    }
    expect(shouldRoutePregnantSettlerToHospital(late, true, false)).toBe(false);
    expect(shouldAttemptHospitalTreatment(early, true, 10)).toBe(false);
    expect(shouldAttemptHospitalTreatment(late, true, 10)).toBe(true);
  });

  it('seeks care for a detected need even with stamina above half, working or not', () => {
    const grieving = entity(0, 0, {
      griefUntilTick: 500,
      needs: { nutrition: 80, rest: 80, stamina: 60, severeHungerTicks: 0 },
    });
    const healthy = entity(0, 0, {
      needs: { nutrition: 80, rest: 80, stamina: 90, severeHungerTicks: 0 },
    });

    expect(shouldAttemptHospitalTreatment(grieving, true, 10)).toBe(true);
    expect(shouldAttemptHospitalTreatment(healthy, true, 10)).toBe(false);
  });

  it('does not mark a patient indoors while they are still more than a door away', () => {
    const ward = { ...hospital(1, 100, 100), width: 120, height: 120, occupants: [7] };
    const door = { x: ward.x + ward.width / 2, y: ward.y + ward.height + 12 };
    const patient = entity(door.x, door.y - 20, { energy: 10 });

    tickHumanHospitalPatientCare({
      state: { tick: 0 } as WorldState,
      entity: patient,
      staffedHospitals: [ward],
      onJobShift: false,
      speed: 2,
    });

    expect(patient.indoorBuildingId).toBeUndefined();
  });
});