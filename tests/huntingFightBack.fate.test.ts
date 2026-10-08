/**
 * A wolf's bite could not kill anything.
 *
 * The fight-back branch (`dailyBuildingEconomy`) only ever subtracted
 * `HUNTING_FIGHT_BACK_BITE_ENERGY` from the hunter's energy, set a flash and logged a line — there was
 * no damage and no death path in it at all. The owner read two years of one colony's chronicle and
 * found thousands of "A wild wolf fought back … and bit <name>" events and not one death, and ruled:
 * *"wolfs should kill sometimes a human like a 5% change and 11% change for hurting a human"*.
 *
 * So the bite now resolves to one of three fates on a single roll, and the bands are the owner's
 * numbers. The bands are a pure function (`huntingFightBackFate`) because the roll itself comes from a
 * stateless hash keyed on the shot, which is not something a test should have to steer.
 */
import { describe, expect, it } from 'vitest';
import {
  HUNTING_FIGHT_BACK_KILL_CHANCE,
  HUNTING_FIGHT_BACK_INJURY_CHANCE,
  huntingFightBackFate,
} from '../src/game/huntingSpot';

describe('what a wolf bite does to the hunter (owner, 2026-10-06)', () => {
  it('kills below the 5 % band', () => {
    expect(huntingFightBackFate(0)).toBe('killed');
    expect(huntingFightBackFate(0.049)).toBe('killed');
  });

  it('mauls in the 11 % band above the kill band, not in a separate 11 % of its own', () => {
    // The boundary matters: rolling the two chances independently would make the real kill chance
    // 5 % of 11 %, not 5 % of bites.
    expect(huntingFightBackFate(HUNTING_FIGHT_BACK_KILL_CHANCE)).toBe('mauled');
    expect(huntingFightBackFate(HUNTING_FIGHT_BACK_KILL_CHANCE + HUNTING_FIGHT_BACK_INJURY_CHANCE - 0.001))
      .toBe('mauled');
  });

  it('leaves an ordinary bite above both bands', () => {
    expect(huntingFightBackFate(HUNTING_FIGHT_BACK_KILL_CHANCE + HUNTING_FIGHT_BACK_INJURY_CHANCE))
      .toBe('bitten');
    expect(huntingFightBackFate(0.999)).toBe('bitten');
  });

  it('uses the owner odds: 5 % killed, 11 % mauled, the rest bitten', () => {
    const rolls = Array.from({ length: 20_000 }, (_, index) => (index + 0.5) / 20_000);
    const fates = rolls.map(huntingFightBackFate);
    const share = (fate: string) => fates.filter((f) => f === fate).length / fates.length;

    expect(share('killed')).toBeCloseTo(0.05, 2);
    expect(share('mauled')).toBeCloseTo(0.11, 2);
    expect(share('bitten')).toBeCloseTo(0.84, 2);
  });

  it('never leaves a roll unresolved', () => {
    for (const roll of [0, 0.2, 0.5, 0.84, 0.999999]) {
      expect(['killed', 'mauled', 'bitten']).toContain(huntingFightBackFate(roll));
    }
  });
});
