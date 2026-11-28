import { describe, expect, it } from 'vitest';
import type { Entity } from '../src/game/gameTypes';
import { BuildingType } from '../src/game/gameTypes';
import { HUMAN_NEEDS, getHumanStaminaRatio, legacyHumanNeeds, normalizeHumanNeeds } from '../src/game/simulation/humanPhysiology';
import { getHospitalRoster, medicalCareReason, medicalUrgency, needsMedicalCare } from '../src/game/hospitalCare';

function human(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 1,
    type: 'human',
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    alive: true,
    age: 30,
    energy: 500,
    maxEnergy: 500,
    gender: 'female',
    isJuvenile: false,
    pregnant: false,
    needs: { nutrition: 80, rest: 80, stamina: 80, severeHungerTicks: 0 },
    ...overrides,
  } as Entity;
}

describe('hospital care reads the authoritative stamina reserve', () => {
  it('sends critical exhaustion, not stale energy, to medical care', () => {
    const patient = human({ energy: 450, needs: { nutrition: 80, rest: 80, stamina: 10, severeHungerTicks: 0 } });
    expect(getHumanStaminaRatio(patient)).toBeCloseTo(0.1);
    expect(needsMedicalCare(patient, 0)).toBe(true);
    expect(medicalCareReason(patient, 0)).toBe('exhausted');
    expect(medicalUrgency(patient, 0)).toBe(0.85);
  });

  it('leaves normal end-of-day fatigue to sleep/recovery rather than hospital admission', () => {
    for (const stamina of [20, 30, 41, 55]) {
      const settler = human({ needs: { nutrition: 80, rest: 50, stamina, severeHungerTicks: 0 } });
      expect(needsMedicalCare(settler, 0), `stamina ${stamina}`).toBe(false);
      expect(medicalCareReason(settler, 0)).toBeNull();
      expect(medicalUrgency(settler, 0)).toBe(0);
    }
  });

  it('shares exactly the physiological critical threshold, without admitting someone at its boundary', () => {
    const settler = human();
    settler.needs!.stamina = HUMAN_NEEDS.STAMINA_CRITICAL;
    expect(needsMedicalCare(settler, 0)).toBe(false);
    settler.needs!.stamina = HUMAN_NEEDS.STAMINA_CRITICAL - 0.01;
    expect(needsMedicalCare(settler, 0)).toBe(true);
    expect(medicalCareReason(settler, 0)).toBe('exhausted');
  });

  it('retains genuine grief and late-pregnancy admissions independently of ordinary fatigue', () => {
    const grieving = human({ griefUntilTick: 200, needs: { nutrition: 80, rest: 80, stamina: 60, severeHungerTicks: 0 } });
    expect(needsMedicalCare(grieving, 100)).toBe(true);
    expect(medicalCareReason(grieving, 100)).toBe('grieving');
    expect(medicalUrgency(grieving, 100)).toBeGreaterThan(0);
    expect(needsMedicalCare(grieving, 200)).toBe(false);
    expect(medicalUrgency(grieving, 200)).toBe(0);
  });

  it('shows only genuine patients in the ward, even when tired visitors remain indoors', () => {
    const ward = { id: 9, type: BuildingType.Hospital, completed: true,
      x: 0, y: 0, width: 40, height: 40, occupants: [99] } as import('../src/game/gameTypes').Building;
    const tiredVisitor = human({ id: 1, energy: 140, indoorBuildingId: 9,
      needs: { nutrition: 80, rest: 80, stamina: 28, severeHungerTicks: 0 } });
    const criticallyExhausted = human({ id: 2, indoorBuildingId: 9,
      needs: { nutrition: 80, rest: 80, stamina: 12, severeHungerTicks: 0 } });
    const grieving = human({ id: 3, indoorBuildingId: 9, griefUntilTick: 200,
      needs: { nutrition: 80, rest: 80, stamina: 60, severeHungerTicks: 0 } });
    const wardRoster = getHospitalRoster(ward, [tiredVisitor, criticallyExhausted, grieving], 100);
    expect(wardRoster.patients.map((p) => p.entity.id)).toEqual([2, 3]);
    expect(wardRoster.patients.map((p) => p.reason)).toEqual(['exhausted', 'grieving']);
  });

  it('does not call a settler exhausted when stamina is healthy but energy is stale', () => {
    const patient = human({ energy: 50, needs: { nutrition: 80, rest: 80, stamina: 80, severeHungerTicks: 0 } });
    expect(getHumanStaminaRatio(patient)).toBeCloseTo(0.8);
    expect(needsMedicalCare(patient, 0)).toBe(false);
    expect(medicalCareReason(patient, 0)).toBeNull();
  });

  it('uses old energy only at explicit migration, never during a medical decision', () => {
    const tired = human({ energy: 100, needs: undefined });
    expect(getHumanStaminaRatio(tired)).toBeCloseTo(0.8);
    normalizeHumanNeeds(tired, legacyHumanNeeds(tired.energy, tired.maxEnergy));
    expect(getHumanStaminaRatio(tired)).toBeCloseTo(0.2);
    expect(needsMedicalCare(tired, 0)).toBe(false);
    const patient = human({ energy: 50, needs: undefined });
    expect(needsMedicalCare(patient, 0)).toBe(false);
    normalizeHumanNeeds(patient, legacyHumanNeeds(patient.energy, patient.maxEnergy));
    expect(getHumanStaminaRatio(patient)).toBeCloseTo(0.1);
    expect(needsMedicalCare(patient, 0)).toBe(true);
    expect(medicalCareReason(patient, 0)).toBe('exhausted');
  });
});

describe('M11 — grief is a window, not a permanent state', () => {
  it('only seeks care while the grief deadline is in the future', () => {
    const mourner = human({ energy: 120, maxEnergy: 200, needs: undefined, griefUntilTick: 500 });

    expect(needsMedicalCare(mourner, 100)).toBe(true);
    expect(needsMedicalCare(mourner, 500)).toBe(false);
    expect(needsMedicalCare(mourner, 900)).toBe(false);
  });
});
