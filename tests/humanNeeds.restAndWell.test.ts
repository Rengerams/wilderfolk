import { describe, expect, it } from 'vitest';
import { BuildingType, EntityType } from '../src/game/gameTypes';
import type { Building, Entity } from '../src/game/gameTypes';
import { TICKS_PER_HOUR } from '../src/game/dayCycleClock';
import { HUMAN_NEEDS, advanceHumanNeeds, hasNearbyWell, initialHumanNeeds, normalizeHumanNeeds } from '../src/game/simulation/humanPhysiology';

const resident = (): Entity => ({ id: 2, type: EntityType.Human, alive: true,
  isJuvenile: false, x: 0, y: 0, energy: 50, maxEnergy: 500,
  needs: initialHumanNeeds(50, 500) } as Entity);
const well = (id: number, x: number, overrides: Partial<Building> = {}): Building =>
  ({ id, x, y: 0, width: 0, height: 0, type: BuildingType.Well,
     completed: true, occupants: [], ...overrides } as Building);
const sleep = (person: Entity, tick: number, buildingId?: number, moving = false): void => {
  advanceHumanNeeds(person, { tick, sleeping: true, working: false, moving,
    restingBuildingId: buildingId });
};

describe('the 400 px well radius', () => {
  it('requires a completed player well, including the 400 px boundary', () => {
    const p = resident();
    expect(hasNearbyWell(p, [well(1, 400)])).toBe(true);
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

describe('four-hour uninterrupted actual sleep', () => {
  it('gives 50% faster stamina recovery only after the full 4 hours', () => {
    const real = resident(), passer = resident();
    let before = 0;
    for (let t = 0; t <= 4 * TICKS_PER_HOUR; t++) {
      before = real.needs!.stamina;
      sleep(real, t, 15);
      sleep(passer, t);
      if (t === 4 * TICKS_PER_HOUR) {
        expect(real.needs!.stamina - before).toBeCloseTo(
          HUMAN_NEEDS.STAMINA_SLEEP_RECOVERY_PER_SIM_HOUR
          * HUMAN_NEEDS.REST_BONUS_STAMINA_RECOVERY_MULTIPLIER / TICKS_PER_HOUR);
      }
    }
    expect(real.needs!.stamina).toBeGreaterThan(passer.needs!.stamina);
  });
  it('resets on movement, change of site, tick gap, or waking', () => {
    const p = resident();
    for (let t = 0; t < 2 * TICKS_PER_HOUR; t++) sleep(p, t, 10);
    expect(p.needs!.restStartTick).toBe(0);
    p.x = 1; sleep(p, 2 * TICKS_PER_HOUR, 10);
    expect(p.needs!.restStartTick).toBe(2 * TICKS_PER_HOUR);
    sleep(p, 2 * TICKS_PER_HOUR + 1, 11);
    expect(p.needs!.restStartTick).toBe(2 * TICKS_PER_HOUR + 1);
    sleep(p, 2 * TICKS_PER_HOUR + 3, 11);
    expect(p.needs!.restStartTick).toBe(2 * TICKS_PER_HOUR + 3);
    sleep(p, 2 * TICKS_PER_HOUR + 4, 11, true);
    expect(p.needs!.restStartTick).toBeUndefined();
    advanceHumanNeeds(p, { tick: 2 * TICKS_PER_HOUR + 5,
      sleeping: false, working: false, moving: false });
    expect(p.needs!.restBuildingId).toBeUndefined();
  });
  it('saves and normalizes the rest clock including building id zero', () => {
    const p = resident();
    sleep(p, 10, 0);
    const copy = structuredClone(p);
    normalizeHumanNeeds(copy);
    expect(copy.needs!.restStartTick).toBe(10);
    expect(copy.needs!.restBuildingId).toBe(0);
  });
});
