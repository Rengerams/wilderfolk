import { describe, expect, it } from 'vitest';
import { BuildingType, EntityType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { treatPatientAtHospital } from '../src/game/hospitalCare';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/game/dayCycleClock';
import { tryEatColonyMeal } from '../src/game/simulation/humanNeeds';
import { advanceHumanNeeds, adjustHumanStamina, getHumanNeedsWorkMultiplier, legacyHumanNeeds, normalizeHumanNeeds, resolveHumanNeedsIntent } from '../src/game/simulation/humanPhysiology';

const mealTick = TICKS_PER_DAY;
function person(override: Partial<Entity> = {}): Entity {
  return {
    id: 1, type: EntityType.Human, alive: true, age: 30, isJuvenile: false,
    energy: 300, maxEnergy: 500,
    needs: { nutrition: 60, rest: 70, stamina: 60 },
    ...override,
  } as Entity;
}
function world(food: number): WorldState {
  return { tick: mealTick, resources: { wood: 0, stone: 0, food } } as WorldState;
}

describe('single human meal transaction', () => {
  it('debits food once and restores only nutrition', () => {
    const state = world(10);
    const eater = person();
    const before = { ...eater.needs! };
    expect(tryEatColonyMeal(eater, state)).toBe(true);
    expect(state.resources.food).toBe(9);
    expect(state.economyLedger?.consumed.meals).toBe(1);
    expect(eater.needs!.nutrition).toBe(70);
    expect(eater.needs!.rest).toBe(before.rest);
    expect(eater.needs!.stamina).toBe(before.stamina);
    expect(eater.energy).toBe(300);
    expect(tryEatColonyMeal(eater, state)).toBe(false);
    expect(state.resources.food).toBe(9);
  });

  it('prevents visitors, well-fed and unfunded meals without owning the scheduler cadence', () => {
    const cases: Array<[Entity, WorldState]> = [
      [person({ faction: 'visitor' }), world(10)],
      [person({ needs: { nutrition: 85, rest: 20, stamina: 5 } }), world(10)],
      [person(), world(0)],
    ];
    for (const [e, state] of cases) {
      const food = state.resources.food;
      const nutrition = e.needs!.nutrition;
      expect(tryEatColonyMeal(e, state)).toBe(false);
      expect(state.resources.food).toBe(food);
      expect(e.needs!.nutrition).toBe(nutrition);
    }
  });

  it('does not decide clock-hour cadence inside the meal transaction', () => {
    const state = { ...world(3), tick: mealTick + 1 };
    const eater = person();
    // Normally humanTick calls this only at the top of the hour.
    expect(tryEatColonyMeal(eater, state)).toBe(true);
    expect(state.resources.food).toBe(2);
    expect(tryEatColonyMeal(eater, state)).toBe(false);
  });

  it('cancels accumulated fatal hunger when food restores nutrition above the severe threshold', () => {
    const state = world(1);
    const eater = person({ needs: { nutrition: 0, rest: 60, stamina: 40,
      severeHungerTicks: 100000 } });
    expect(tryEatColonyMeal(eater, state)).toBe(true);
    expect(eater.needs!.nutrition).toBe(10);
    expect(eater.needs!.severeHungerTicks).toBe(0);
  });

  it('accounts accurately for fractional food and meal cooldown', () => {
    const state = world(0.5);
    const eater = person();
    expect(tryEatColonyMeal(eater, state)).toBe(true);
    expect(state.resources.food).toBe(0);
    expect(state.economyLedger?.consumed.meals).toBe(0.5);
    expect(eater.needs!.nutrition).toBe(65);
    state.resources.food = 10;
    state.tick += TICKS_PER_HOUR;
    expect(tryEatColonyMeal(eater, state)).toBe(false);
    state.tick += TICKS_PER_HOUR;
    expect(tryEatColonyMeal(eater, state)).toBe(true);
  });
});

describe('cross-system physiology compatibility', () => {
  it('applies native stamina points independently of legacy capacity and clamps the reserve', () => {
    for (const maxEnergy of [100, 400, 500, 900]) {
      const e = person({ maxEnergy, energy: 0, needs: { nutrition: 60, rest: 70, stamina: 20 } });
      adjustHumanStamina(e, 9);
      expect(e.needs!.stamina).toBe(29);
      adjustHumanStamina(e, -50);
      expect(e.needs!.stamina).toBe(0);
      adjustHumanStamina(e, 150);
      expect(e.needs!.stamina).toBe(100);
      expect(e.needs!.rest).toBe(70);
      expect(e.needs!.nutrition).toBe(60);
      expect(e.energy).toBe(0);
    }
  });

  it('sizes medical treatment from stamina even when legacy energy disagrees', () => {
    const run = (energy: number, stamina: number) => {
      const patient = person({ x: 100, y: 100, energy, needs: { nutrition: 60, rest: 70, stamina } });
      const doctor = person({ id: 2, x: 100, y: 100 });
      const hospital = { id: 4, type: BuildingType.Hospital, completed: true,
        x: 100, y: 100, width: 40, height: 40, occupants: [doctor.id] } as Building;
      const state = { ...world(10), entities: [patient, doctor],
        floatingTexts: [], nextFloatingTextId: 1 } as WorldState;
      const treated = treatPatientAtHospital(state, patient, hospital, { doctorPresent: true });
      return { treated, stamina: patient.needs!.stamina };
    };
    expect(run(500, 20)).toEqual(run(100, 20));
    expect(run(500, 20).treated).toBe(true);
    expect(run(0, 100)).toEqual({ treated: false, stamina: 100 });
  });

  it('keeps a hospital stamina treatment after the next physiological tick', () => {
    const patient = person({ x: 100, y: 100, needs: { nutrition: 60, rest: 70, stamina: 20 },
      energy: 100 });
    const doctor = person({ id: 2, x: 100, y: 100 });
    const hospital = { id: 4, type: BuildingType.Hospital, completed: true,
      x: 100, y: 100, width: 40, height: 40, occupants: [doctor.id] } as Building;
    const state = { ...world(10), entities: [patient, doctor],
      floatingTexts: [], nextFloatingTextId: 1 } as WorldState;
    const before = patient.needs!.stamina;
    expect(treatPatientAtHospital(state, patient, hospital, { doctorPresent: true })).toBe(true);
    expect(patient.needs!.stamina).toBeGreaterThan(before);
    const afterTreatment = patient.needs!.stamina;
    advanceHumanNeeds(patient, { tick: state.tick + 1, sleeping: false, working: false, moving: false });
    expect(patient.needs!.stamina).toBeLessThan(afterTreatment);
    expect(patient.needs!.stamina).toBeGreaterThan(before);
    expect(patient.energy).toBe(100); // no runtime mirror
  });
});

describe('independent physiological advancement', () => {
  it('eating and sleeping do not masquerade as the same resource', () => {
    const e = person({ needs: { nutrition: 20, rest: 10, stamina: 0 } });
    advanceHumanNeeds(e, { tick: mealTick, sleeping: true, working: false, moving: false });
    expect(e.needs!.rest).toBeGreaterThan(10);
    expect(e.needs!.stamina).toBeGreaterThan(0);
    expect(e.needs!.nutrition).toBeLessThan(20);
    const once = { ...e.needs! };
    advanceHumanNeeds(e, { tick: mealTick, sleeping: true, working: false, moving: false });
    expect(e.needs).toEqual(once);
  });

  it('preserves normal output but penalizes severe deprivation', () => {
    expect(getHumanNeedsWorkMultiplier(person())).toBe(1);
    expect(getHumanNeedsWorkMultiplier(person({ needs: { nutrition: 4, rest: 70, stamina: 60 } }))).toBe(0.55);
    expect(getHumanNeedsWorkMultiplier(person({ needs: { nutrition: 60, rest: 70, stamina: 3 } }))).toBe(0.55);
  });

  it('persists an off-duty stamina break until sufficiently recovered, even when hungry', () => {
    const e = person({ needs: { nutrition: 60, rest: 80, stamina: 10 } });
    advanceHumanNeeds(e, { tick: mealTick + 1, sleeping: false, working: false, moving: false });
    // Between scheduler meal pulses the break still outranks hunger.
    expect(resolveHumanNeedsIntent(e, mealTick + 1, false, false)).toBe('takeBreak');
    expect(e.needs!.breakUntilRecovered).toBe(true);
    const restored = structuredClone(e);
    normalizeHumanNeeds(restored);
    expect(restored.needs!.breakUntilRecovered).toBe(true);
    restored.needs!.stamina = 30;
    expect(resolveHumanNeedsIntent(restored, mealTick + 2, false, false)).toBe('takeBreak');
    expect(restored.needs!.breakUntilRecovered).toBe(true);
    restored.needs!.stamina = 55;
    advanceHumanNeeds(restored, { tick: mealTick + 2, sleeping: false, working: false, moving: false });
    expect(resolveHumanNeedsIntent(restored, mealTick + 3, false, false)).toBe('continueActivity');
    expect(restored.needs!.breakUntilRecovered).toBeUndefined();
  });

  it('treats zero stamina as recoverable and clamps bad old energy', () => {
    const e = person({ energy: Number.NaN, maxEnergy: 0 });
    expect(legacyHumanNeeds(e.energy, e.maxEnergy).stamina).toBe(80);
    e.needs = { nutrition: 50, rest: 50, stamina: 0 };
    advanceHumanNeeds(e, { tick: mealTick, sleeping: false, working: false, moving: false, resting: true });
    expect(e.alive).toBe(true);
    expect(e.needs.stamina).toBeGreaterThan(0);
  });
});
