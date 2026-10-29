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

describe('eight-hour ordinary sleep', () => {
  it('fills empty stamina and rest reserves in eight simulated hours without extra bonuses', () => {
    const p = resident();
    p.needs!.stamina = 0;
    p.needs!.rest = 0;
    for (let tick = 0; tick < 8 * TICKS_PER_HOUR; tick++) {
      advanceHumanNeeds(p, { tick, sleeping: true, working: false, moving: false });
    }
    expect(HUMAN_NEEDS.STAMINA_SLEEP_RECOVERY_PER_SIM_HOUR).toBe(12.5);
    expect(HUMAN_NEEDS.REST_RECOVERY_SLEEP_PER_SIM_HOUR).toBe(12.5);
    expect(p.needs!.stamina).toBeCloseTo(100);
    expect(p.needs!.rest).toBeCloseTo(100);
  });
  it('caps normal sleep recovery at 100', () => {
    const p = resident();
    p.needs!.stamina = 90;
    p.needs!.rest = 90;
    for (let tick = 0; tick < 8 * TICKS_PER_HOUR; tick++) {
      advanceHumanNeeds(p, { tick, sleeping: true, working: false, moving: false });
    }
    expect(p.needs!.stamina).toBe(100);
    expect(p.needs!.rest).toBe(100);
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
