import { describe, expect, it } from 'vitest';
import type { Entity } from '../src/game/gameTypes';
import { getHumanStaminaRatio } from '../src/game/simulation/humanPhysiology';
import { medicalCareReason, medicalUrgency, needsMedicalCare } from '../src/game/hospitalCare';

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
  it('treats low stamina as exhausted even when the energy mirror is full', () => {
    const patient = human({ energy: 450, needs: { nutrition: 80, rest: 80, stamina: 30, severeHungerTicks: 0 } });
    expect(getHumanStaminaRatio(patient)).toBeCloseTo(0.3);
    expect(needsMedicalCare(patient, 0)).toBe(true);
    expect(medicalCareReason(patient, 0)).toBe('exhausted');
    expect(medicalUrgency(patient)).toBeGreaterThan(0);
  });

  it('does not call a settler exhausted when stamina is healthy but energy is stale', () => {
    const patient = human({ energy: 50, needs: { nutrition: 80, rest: 80, stamina: 80, severeHungerTicks: 0 } });
    expect(getHumanStaminaRatio(patient)).toBeCloseTo(0.8);
    expect(needsMedicalCare(patient, 0)).toBe(false);
    expect(medicalCareReason(patient, 0)).toBeNull();
  });

  it('falls back to energy for a legacy human without needs', () => {
    const patient = human({ energy: 100, needs: undefined });
    expect(getHumanStaminaRatio(patient)).toBeCloseTo(0.2);
    expect(needsMedicalCare(patient, 0)).toBe(true);
    expect(medicalCareReason(patient, 0)).toBe('exhausted');
  });
});
