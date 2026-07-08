import { describe, expect, it } from 'vitest';
import { createEntity } from '@/game/worldGen';
import { EntityType } from '@/game/gameTypes';
import {
  ADULT_DAYS_PER_AGE_YEAR,
  computeHumanAgeYears,
  daysLivedFromAgeYears,
  getBirthDateString,
  getColonyDay,
  getFemaleFertility,
  getOldAgeDeathChance,
  HUMAN_ADULT_MIN_AGE,
  HUMAN_CHILDHOOD_DAYS,
  HUMAN_MAX_LIFESPAN_YEARS,
  HUMAN_VENERABLE_AGE,
  JUVENILE_DAYS_PER_AGE_YEAR,
  isProductionTick,
  setHumanBirthFromAge,
  syncHumanAgeFromCalendar,
  migrateHumanAges,
  ticksForDays,
  WORK_START,
} from '@/game/dayCycle';
import { initGame } from '@/game/gameEngine';

describe('getColonyDay', () => {
  it('combines year and dayInYear', () => {
    expect(getColonyDay({ year: 2, dayInYear: 10 })).toBe(2 * 360 + 10);
  });
});

describe('daysLivedFromAgeYears', () => {
  it('uses faster juvenile calendar than adults', () => {
    expect(daysLivedFromAgeYears(5)).toBe(5 * JUVENILE_DAYS_PER_AGE_YEAR);
    expect(daysLivedFromAgeYears(20)).toBe(
      HUMAN_CHILDHOOD_DAYS * JUVENILE_DAYS_PER_AGE_YEAR + (20 - HUMAN_CHILDHOOD_DAYS) * ADULT_DAYS_PER_AGE_YEAR,
    );
  });
});

describe('setHumanBirthFromAge + computeHumanAgeYears', () => {
  it('round-trips adult age at the same colony day', () => {
    const state = initGame();
    state.year = 3;
    state.dayInYear = 45;
    const colonyDay = getColonyDay(state);
    const ent = createEntity(EntityType.Human, 0, 0, 1, 250);
    setHumanBirthFromAge(ent, 28, colonyDay);
    expect(computeHumanAgeYears(ent, colonyDay)).toBe(28);
  });

  it('advances adults ~1 life-year per game year', () => {
    const ent = createEntity(EntityType.Human, 0, 0, 1, 250);
    setHumanBirthFromAge(ent, 28, 0);
    const afterOneYear = computeHumanAgeYears(ent, 360);
    expect(afterOneYear).toBe(29);
  });

  it('does not jump to elder age after a few colony days (regression)', () => {
    const ent = createEntity(EntityType.Human, 0, 0, 1, 250);
    setHumanBirthFromAge(ent, 28, 0);
    expect(computeHumanAgeYears(ent, 60)).toBe(28);
  });

  it('derives birthMonth from the provided day, not the pre-override colony day', () => {
    const ent = createEntity(EntityType.Human, 0, 0, 1, 250);
    setHumanBirthFromAge(ent, 10, 300, undefined, 5);
    expect(ent.birthDay).toBe(5);
    expect(ent.birthMonth).toBe(0);
    expect(getBirthDateString(ent)).toMatch(/^January 6,/);
  });
});

describe('getBirthDateString', () => {
  it('clamps out-of-range birth months', () => {
    const ent = createEntity(EntityType.Human, 0, 0, 1, 250);
    ent.birthYear = 50;
    ent.birthMonth = 14;
    ent.birthDay = 2;
    expect(getBirthDateString(ent)).toBe('March 3, 1750');
  });

  it('maps day-of-year birthDay to day-of-month', () => {
    const ent = createEntity(EntityType.Human, 0, 0, 1, 250);
    ent.birthYear = 10;
    ent.birthMonth = 11;
    ent.birthDay = 359;
    expect(getBirthDateString(ent)).toBe('December 30, 1710');
  });
});

describe('isProductionTick', () => {
  it('fires at work-start phase on standard day intervals', () => {
    expect(isProductionTick(WORK_START, ticksForDays(1))).toBe(true);
    expect(isProductionTick(WORK_START + ticksForDays(1), ticksForDays(1))).toBe(true);
  });

  it('only fires at work-start hour when interval is shorter than a day', () => {
    const interval = 5;
    expect(isProductionTick(WORK_START, interval)).toBe(true);
    expect(isProductionTick(WORK_START + 1, interval)).toBe(false);
    expect(isProductionTick(WORK_START % interval, interval)).toBe(false);
  });
});

describe('syncHumanAgeFromCalendar', () => {
  it('writes computed age onto the entity', () => {
    const state = initGame();
    const ent = createEntity(EntityType.Human, 0, 0, 1, 250);
    setHumanBirthFromAge(ent, 30, getColonyDay(state));
    syncHumanAgeFromCalendar(ent, state);
    expect(ent.age).toBe(30);
    expect(ent.maxAge).toBe(HUMAN_MAX_LIFESPAN_YEARS);
  });
});

describe('getOldAgeDeathChance', () => {
  it('is zero below venerable age', () => {
    expect(getOldAgeDeathChance(HUMAN_VENERABLE_AGE - 1)).toBe(0);
  });

  it('is certain at max lifespan', () => {
    expect(getOldAgeDeathChance(HUMAN_MAX_LIFESPAN_YEARS)).toBe(1);
  });
});

describe('getFemaleFertility', () => {
  it('ramps up then declines with age', () => {
    expect(getFemaleFertility(HUMAN_ADULT_MIN_AGE - 1)).toBe(0);
    expect(getFemaleFertility(20)).toBeGreaterThan(getFemaleFertility(45));
    expect(getFemaleFertility(55)).toBe(0);
  });
});

describe('ticksForDays', () => {
  it('uses 24 ticks per day', () => {
    expect(ticksForDays(1)).toBe(24);
  });
});

describe('migrateHumanAges', () => {
  it('preserves calendar-backed adults when stored age looks inflated', () => {
    const colony = { year: 0, dayInYear: 40 };
    const backed = createEntity(EntityType.Human, 0, 0, 1, 250);
    setHumanBirthFromAge(backed, 32, getColonyDay(colony));
    backed.age = 38;

    migrateHumanAges([backed], colony);

    expect(backed.age).toBe(38);
  });

  it('still migrates founder saves with missing birth records and per-day age drift', () => {
    const colony = { year: 0, dayInYear: 40 };
    const corrupt = createEntity(EntityType.Human, 0, 0, 2, 250, false, { generation: 1 });
    corrupt.age = 38;
    corrupt.birthYear = 0;
    corrupt.birthDay = 0;

    migrateHumanAges([corrupt], colony);

    expect(corrupt.age).not.toBe(38);
  });
});