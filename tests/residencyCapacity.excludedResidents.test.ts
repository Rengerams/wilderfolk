/**
 * Beds are counted from every resident, not only from the settlers a pass may move: an excluded
 * settler still sleeps in the house, and leaving their bed out of the count seats a newcomer into
 * a house that is already full (the day-90 overflow the long-run harness reports).
 */
import { describe, expect, it } from 'vitest';
import { BuildingType } from '../src/game/gameTypes';
import type { Entity } from '../src/game/gameTypes';
import { building, human } from '../src/test/factories';
import { assignMissingResidences } from '../src/game/residencyReconciliation';
import { buildResidenceOccupancy, getResidenceCapacity } from '../src/game/residencyOccupancy';

describe('capacity counts settlers the pass may not move', () => {
  it('keeps a full house full when part of its household is left out of the movable list', () => {
    const home = building(0, BuildingType.House);
    const capacity = getResidenceCapacity(home);
    const excluded = [
      human(1, { residenceBuildingId: home.id }),
      human(2, { residenceBuildingId: home.id }),
    ];
    const movable = Array.from({ length: capacity - excluded.length }, (_, index) =>
      human(10 + index, { residenceBuildingId: home.id }));
    const newcomer = human(99);
    const everyone: Entity[] = [...excluded, ...movable, newcomer];
    const movableOnly = [...movable, newcomer];

    assignMissingResidences(movableOnly, [home], everyone);

    expect(buildResidenceOccupancy(everyone).get(home.id)).toBe(capacity);
    expect(newcomer.residenceBuildingId).toBeUndefined();
  });
});
