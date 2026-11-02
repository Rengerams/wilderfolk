import { describe, expect, it } from 'vitest';
import { BuildingType } from '../src/game/gameTypes';
import type { Entity } from '../src/game/gameTypes';
import { familyFitsInResidence } from '../src/game/housingPipeline';
import { getResidenceCapacity } from '../src/game/housingModel';
import { building, human } from '../src/test/factories';

/**
 * The capacity rule's behaviour table: the one guard a household write passes, so a mutant that
 * ignores the bed count or the already-here discount turns a row red.
 */
describe('the capacity rule', () => {
  const home = building(1, BuildingType.House);
  const cap = getResidenceCapacity(home);

  function residents(count: number): Entity[] {
    return Array.from({ length: count }, (_, index) => human(index + 1, { residenceBuildingId: home.id }));
  }

  function movers(count: number): Entity[] {
    return Array.from({ length: count }, (_, index) => human(100 + index));
  }

  it.each([
    { residents: 0, movers: cap, fits: true, why: 'an empty home takes a household exactly at its beds' },
    { residents: 0, movers: cap + 1, fits: false, why: 'a household one over the beds does not fit' },
    { residents: 2, movers: cap - 2, fits: true, why: 'the free beds take exactly the household' },
    { residents: 2, movers: cap - 1, fits: false, why: 'one more than the free beds does not fit' },
    { residents: cap - 1, movers: 2, fits: false, why: 'one free bed never takes two settlers' },
  ])('is $fits when $why', ({ residents: residentCount, movers: moverCount, fits }) => {
    const all = [...residents(residentCount), ...movers(moverCount)];
    const family = all.slice(residentCount);

    expect(familyFitsInResidence(family, home, all)).toBe(fits);
  });

  it('counts a household member already living there once', () => {
    const atHome = residents(3);
    const family = [...atHome.slice(0, 2), ...movers(2)];
    const all = [...atHome, ...family.slice(2)];

    expect(familyFitsInResidence(family, home, all)).toBe(true);
  });
});
