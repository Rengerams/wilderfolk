import { describe, expect, it } from 'vitest';
import { isAdult, isMinor, isMinorChild } from '../src/game/housingModel';
import { HUMAN_ADULT_MIN_AGE } from '../src/game/daycycleconstants';
import { human } from '../src/test/factories';

describe('the one adult rule', () => {
  it('takes the age floor over a stale juvenile flag', () => {
    const adult = human(1, { age: HUMAN_ADULT_MIN_AGE, isJuvenile: true });
    const almost = human(2, { age: HUMAN_ADULT_MIN_AGE - 1, isJuvenile: false });

    expect(isAdult(adult)).toBe(true);
    expect(isMinor(adult)).toBe(false);
    expect(isMinor(almost)).toBe(true);
    expect(isAdult(almost)).toBe(false);
  });

  it('emancipates a partnered minor only for household membership', () => {
    const partnered = human(3, { age: HUMAN_ADULT_MIN_AGE - 1, partnerId: 4 });
    const unpartnered = human(5, { age: HUMAN_ADULT_MIN_AGE - 1 });

    expect(isMinor(partnered)).toBe(true);
    expect(isMinorChild(partnered)).toBe(false);
    expect(isMinorChild(unpartnered)).toBe(true);
  });
});
