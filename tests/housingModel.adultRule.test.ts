import { describe, expect, it } from 'vitest';
import { HUMAN_ADULT_MIN_AGE } from '../src/game/daycycleconstants';
import { tryGraduateHumanChild } from '../src/game/dayCycle';
import { collectMinorHousehold, isAdultChildAtHome } from '../src/game/housingModel';
import { human } from '../src/test/factories';

describe('the one adult rule', () => {
  it('graduates on age even when the juvenile flag is stale', () => {
    const almost = human(1, { age: HUMAN_ADULT_MIN_AGE - 1, isJuvenile: false });
    const adult = human(2, { age: HUMAN_ADULT_MIN_AGE, isJuvenile: true });

    expect(tryGraduateHumanChild(almost, 12, 3)).toBe(false);
    expect(tryGraduateHumanChild(adult, 12, 3)).toBe(true);
    expect(adult.isJuvenile).toBe(false);
  });

  it('keeps an unpartnered minor in the parent household', () => {
    const parent = human(1, { childrenIds: [2] });
    const child = human(2, { age: HUMAN_ADULT_MIN_AGE - 1, motherId: 1, isJuvenile: false });

    expect(collectMinorHousehold(parent, [parent, child]).map((member) => member.id)).toEqual([1, 2]);
  });

  it('rooms a partnered minor separately without calling them an adult', () => {
    const parent = human(1, { childrenIds: [2] });
    const partnered = human(2, {
      age: HUMAN_ADULT_MIN_AGE - 1,
      motherId: 1,
      partnerId: 3,
    });

    expect(collectMinorHousehold(parent, [parent, partnered]).map((member) => member.id)).toEqual([1]);
    // The housing exception is not an adulthood: age alone still blocks graduation.
    expect(tryGraduateHumanChild(partnered, 12, 3)).toBe(false);
  });

  it('treats an adult with a stale juvenile flag as an adult child at home', () => {
    const parent = human(1, { residenceBuildingId: 5 });
    const adult = human(2, {
      age: HUMAN_ADULT_MIN_AGE,
      isJuvenile: true,
      motherId: 1,
      residenceBuildingId: 5,
    });
    const movedOut = human(3, {
      age: HUMAN_ADULT_MIN_AGE,
      isJuvenile: true,
      motherId: 1,
      residenceBuildingId: 6,
    });

    expect(isAdultChildAtHome(adult, [parent, adult])).toBe(true);
    expect(isAdultChildAtHome(movedOut, [parent, movedOut])).toBe(false);
  });
});
