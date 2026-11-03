/**
 * Regression: pregnant settlers used to `continue` at the end of the pregnancy
 * block in tickHumans, skipping work, social life, leisure and the single
 * movement apply at the loop bottom. The walk-to-hospital logic only existed
 * inside that block (duplicated as the "BUGFIX" band-aid), so only pregnant
 * settlers could seek a staffed hospital at all.
 *
 * After the fix, hospital seeking is a main-loop behavior gated on
 * `needsMedicalCare(entity)` (which already covers pregnancy): sick or
 * pregnant settlers pick the nearest staffed hospital to walk to; healthy
 * settlers and already-hospital settlers do not.
 */
import { describe, expect, it } from 'vitest';
import { pickHospitalWalkTarget } from '../src/game/hospitalCare';
import { doctorMayServe, shouldAttemptHospitalTreatment, tickHumanHospitalPatientCare } from '../src/game/humanHospitalBehavior';
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
    // Standing at the south wall: 60 px from the centre, but 8 px from the door.
    const patient = entity(ward.x + ward.width / 2, ward.y + ward.height + 20, { energy: 10, pregnant: false });

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
  it('takes a near-term doctor off the ward round', () => {
    expect(doctorMayServe(entity(0, 0, { pregnancyProgress: PREGNANCY_TICKS * 0.79 }))).toBe(true);
    expect(doctorMayServe(entity(0, 0, { pregnancyProgress: PREGNANCY_TICKS * 0.81 }))).toBe(false);
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