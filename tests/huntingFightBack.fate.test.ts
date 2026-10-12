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
  HUNTING_FIGHT_BACK_CHANCE,
  HUNTING_FIGHT_BACK_KILL_CHANCE,
  HUNTING_FIGHT_BACK_INJURY_CHANCE,
  HUNTING_FIGHT_BACK_SKILL_FLOOR,
  huntingFightBackFate,
  huntingFightBackKillChance,
} from '../src/game/huntingSpot';
import { seededRandomForRun } from '../src/game/simRng';
import { TICKS_PER_DAY } from '../src/game/dayCycle';
import { MAX_SKILL } from '../src/game/skills';

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
    const fates = rolls.map((roll) => huntingFightBackFate(roll));
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

/**
 * The cadence and the skill mitigation (owner balance): *"the many wolf attacks are bit much"* and
 * *"a hunter with 100 skill should also get less change to get killed"*.
 */
describe('how often a wolf turns on the hunter, and how badly', () => {
  /** The call site's own shot key (`dailyBuildingEconomy`): a hunt per staffed spot per production day. */
  function wolfHunts(buildingCount: number, days: number): number {
    let bites = 0;
    let hunts = 0;
    for (let building = 1; building <= buildingCount; building += 1) {
      for (let day = 1; day <= days; day += 1) {
        hunts += 1;
        const key = `hunt:${building}:${day * TICKS_PER_DAY}:${building + 100}:fight`;
        if (seededRandomForRun(key) < HUNTING_FIGHT_BACK_CHANCE) bites += 1;
      }
    }
    return bites / hunts;
  }

  it('turns on the hunter in about one wolf hunt in ten', () => {
    const share = wolfHunts(40, 250);
    expect(share).toBeGreaterThan(0.05);
    expect(share).toBeLessThanOrEqual(0.15);
  });

  it('gives a master hunter a fatal band a fraction of a novice’s', () => {
    expect(huntingFightBackKillChance(0)).toBeCloseTo(HUNTING_FIGHT_BACK_KILL_CHANCE, 6);
    expect(huntingFightBackKillChance(MAX_SKILL))
      .toBeCloseTo(HUNTING_FIGHT_BACK_KILL_CHANCE * HUNTING_FIGHT_BACK_SKILL_FLOOR, 6);
    expect(huntingFightBackKillChance(MAX_SKILL)).toBeLessThan(huntingFightBackKillChance(0) / 3);
  });

  it('downgrades a killing roll to a mauling for the skilled hunter, never past the bite', () => {
    const killingRoll = HUNTING_FIGHT_BACK_KILL_CHANCE - 0.001;
    expect(huntingFightBackFate(killingRoll, { skill: 0 })).toBe('killed');
    expect(huntingFightBackFate(killingRoll, { skill: MAX_SKILL })).toBe('mauled');
    expect(huntingFightBackFate(HUNTING_FIGHT_BACK_KILL_CHANCE + HUNTING_FIGHT_BACK_INJURY_CHANCE, { skill: MAX_SKILL }))
      .toBe('bitten');
  });

  it('measures the fatal odds a hunter faces at each end of the skill range', () => {
    const rolls = Array.from({ length: 20_000 }, (_, index) => (index + 0.5) / 20_000);
    const killedShare = (skill: number) =>
      rolls.filter((roll) => huntingFightBackFate(roll, { skill }) === 'killed').length / rolls.length;

    expect(killedShare(0)).toBeCloseTo(0.05, 2);
    expect(killedShare(MAX_SKILL)).toBeCloseTo(0.01, 2);
    expect(killedShare(MAX_SKILL)).toBeLessThan(killedShare(0) / 3);
  });
});
