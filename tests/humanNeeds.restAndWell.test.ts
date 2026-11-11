import { describe, expect, it } from 'vitest';
import { BuildingType, EntityType } from '../src/game/gameTypes';
import type { Building, Entity } from '../src/game/gameTypes';
import { TICKS_PER_HOUR } from '../src/game/dayCycleClock';
import { isRestingHospitalPatient } from '../src/game/hospitalCare';
import { HUMAN_NEEDS, advanceHumanNeeds, hasNearbyWell, initialHumanNeeds } from '../src/game/simulation/humanPhysiology';

const resident = (): Entity => ({ id: 2, type: EntityType.Human, alive: true,
  isJuvenile: false, x: 0, y: 0, energy: 50, maxEnergy: 500,
  needs: initialHumanNeeds(50, 500) } as Entity);
const well = (id: number, x: number, overrides: Partial<Building> = {}): Building =>
  ({ id, x, y: 0, width: 0, height: 0, type: BuildingType.Well,
     completed: true, occupants: [], ...overrides } as Building);
describe('the 400 px well radius', () => {
  it('requires a completed player well, including the 400 px boundary', () => {
    const p = resident();
    expect(hasNearbyWell(p, [well(1, 400, { width: 40, height: 40 })])).toBe(true);
    expect(hasNearbyWell(p, [well(1, 401)])).toBe(false);
    expect(hasNearbyWell(p, [well(1, 20, { completed: false })])).toBe(false);
    expect(hasNearbyWell(p, [well(1, 20, { faction: 'rival' })])).toBe(false);
  });
  it('does not stack two overlapping water wells', () => {
    const one = resident(), two = resident(), none = resident();
    for (const [entity, wells] of [[one, [well(1, 20)]], [two, [well(1, 20), well(2, 60)]],
      [none, []]] as const) {
      advanceHumanNeeds(entity, { tick: 0, elapsedTicks: TICKS_PER_HOUR,
        sleeping: false, moving: false, working: true, hasWell: hasNearbyWell(entity, wells) });
    }
    expect(one.needs!.stamina).toBeCloseTo(two.needs!.stamina);
    expect(one.needs!.stamina).toBeGreaterThan(none.needs!.stamina);
  });
});

describe('seven-hour ordinary sleep', () => {
  it('fills empty stamina and rest reserves after seven actual sleep hours', () => {
    const p = resident();
    p.needs!.stamina = 0;
    p.needs!.rest = 0;
    for (let tick = 0; tick < 7 * TICKS_PER_HOUR; tick++) {
      advanceHumanNeeds(p, { tick, sleeping: true, working: false, moving: false });
      if (tick === 6 * TICKS_PER_HOUR - 1) {
        expect(p.needs!.stamina).toBeLessThan(100);
        expect(p.needs!.rest).toBeLessThan(100);
      }
    }
    expect(HUMAN_NEEDS.SLEEP_RECOVERY_PER_SIM_HOUR).toBeCloseTo(100 / 7);
    expect(p.needs!.stamina).toBeCloseTo(100);
    expect(p.needs!.rest).toBeCloseTo(100);
  });
  it('caps ordinary sleep recovery at 100', () => {
    const p = resident();
    p.needs!.stamina = 90;
    p.needs!.rest = 90;
    for (let tick = 0; tick < 7 * TICKS_PER_HOUR; tick++) {
      advanceHumanNeeds(p, { tick, sleeping: true, working: false, moving: false });
    }
    expect(p.needs!.stamina).toBe(100);
    expect(p.needs!.rest).toBe(100);
  });
});

describe('24-hour stamina budget with configurable working hours', () => {
  it('arrives at bedtime near 30% after nine hours of work and eight hours awake', () => {
    const p = resident();
    p.needs!.stamina = 100;
    for (let hour = 0; hour < 17; hour++) {
      advanceHumanNeeds(p, {
        tick: hour, elapsedTicks: TICKS_PER_HOUR, sleeping: false,
        working: hour >= 1 && hour < 10, moving: false,
      });
    }
    expect(p.needs!.stamina).toBeCloseTo(30, 6);
    for (let hour = 17; hour < 24; hour++) {
      advanceHumanNeeds(p, { tick: hour, elapsedTicks: TICKS_PER_HOUR,
        sleeping: true, working: false, moving: false });
    }
    expect(p.needs!.stamina).toBeCloseTo(100, 6);
  });

  it('uses actual shift hours: shorter work leaves more stamina, longer work less', () => {
    for (const [workHours, bedtimeStamina] of [[8, 34], [9, 30], [10, 26]]) {
      const p = resident();
      p.needs!.stamina = 100;
      for (let hour = 0; hour < 17; hour++) {
        advanceHumanNeeds(p, { tick: hour, elapsedTicks: TICKS_PER_HOUR,
          sleeping: false, working: hour < workHours, moving: false });
      }
      expect(p.needs!.stamina, `${workHours} work hours`).toBeCloseTo(bedtimeStamina, 6);
    }
  });

  it('spends stamina while awake but recovers during a deliberate stationary needs break', () => {
    const p = resident();
    p.needs!.stamina = 50;
    advanceHumanNeeds(p, { tick: 0, elapsedTicks: TICKS_PER_HOUR,
      sleeping: false, working: false, moving: false });
    expect(p.needs!.stamina).toBe(48);
    advanceHumanNeeds(p, { tick: 1, elapsedTicks: TICKS_PER_HOUR,
      sleeping: false, working: false, moving: false, resting: true });
    expect(p.needs!.stamina).toBe(53);
    advanceHumanNeeds(p, { tick: 2, elapsedTicks: TICKS_PER_HOUR,
      sleeping: false, working: false, moving: true, resting: true });
    expect(p.needs!.stamina).toBe(48);
  });
});

describe('hospital admission versus mere proximity', () => {
  const ward = { id: 9, type: BuildingType.Hospital, completed: true,
    x: 0, y: 0, width: 40, height: 40, occupants: [111] } as Building;
  it('requires a medically eligible patient actually admitted to a staffed ward', () => {
    const p = resident(); // energy 10% => medically eligible
    expect(isRestingHospitalPatient(p, ward, 0, 9)).toBe(true);
    expect(isRestingHospitalPatient(p, ward, 0, undefined)).toBe(false);
    expect(isRestingHospitalPatient(p, { ...ward, occupants: [] }, 0, 9)).toBe(false);
    expect(isRestingHospitalPatient(p, { ...ward, completed: false }, 0, 9)).toBe(false);
    expect(isRestingHospitalPatient(p, { ...ward, faction: 'rival' }, 0, 9)).toBe(false);
  });
  it('increases sleeping stamina recovery, not a nonexistent negative hospital drain', () => {
    const regular = resident(), patient = resident();
    advanceHumanNeeds(regular, { tick: 0, sleeping: true, working: false, moving: false });
    advanceHumanNeeds(patient, { tick: 0, sleeping: true, working: false,
      moving: false, hasHospital: isRestingHospitalPatient(patient, ward, 0, 9) });
    expect(patient.needs!.stamina).toBeGreaterThan(regular.needs!.stamina);
  });
});
