/**
 * The housing decision pipeline: one priority order, whole-household decisions, and a second run
 * that repeats nothing. These pin the boundaries between phases, not their internal choreography.
 */
import { describe, expect, it } from 'vitest';
import { BuildingType } from '../src/game/gameTypes';
import type { Entity } from '../src/game/gameTypes';
import { building, human } from '../src/test/factories';
import {
  assignMissingResidences,
  createHousingLedger,
  isHousingUnitProtected,
  relocateHousehold,
} from '../src/game/residencyReconciliation';
import { buildResidenceOccupancy, getResidenceCapacity } from '../src/game/residencyOccupancy';
import { buildResidenceTraits } from '../src/game/residencySelection';

function moveContext(alive: Entity[], residences: ReturnType<typeof building>[]) {
  return {
    alive,
    residences,
    buildings: residences,
    occupancy: buildResidenceOccupancy(alive),
    traits: buildResidenceTraits(alive),
    ledger: createHousingLedger(),
  };
}

describe('the housing decision pipeline', () => {
  it('withholds an optional move once a mandatory phase settled the household', () => {
    const ledger = createHousingLedger();
    const home = building(0, BuildingType.House);
    const settler = human(1, { residenceBuildingId: home.id });
    ledger.settled.set(settler.id, 'capacity');

    expect(isHousingUnitProtected(ledger, [settler], 'commute')).toBe(true);
    expect(isHousingUnitProtected(ledger, [settler], 'adult-child')).toBe(true);
    // A mandatory correction always outranks an earlier decision.
    expect(isHousingUnitProtected(ledger, [settler], 'guardianship')).toBe(false);
  });

  it('refuses the whole household move when the destination cannot hold everyone', () => {
    const from = building(0, BuildingType.House);
    const target = building(1, BuildingType.House);
    const beds = getResidenceCapacity(target);
    const household = Array.from({ length: beds + 1 }, (_, index) =>
      human(index + 1, { residenceBuildingId: from.id }),
    );
    from.occupants = household.map((member) => member.id);

    const moved = relocateHousehold(household, target.id, 'homeless', 'assignment', moveContext(household, [from, target]));

    expect(moved).toBe(false);
    expect(household.every((member) => member.residenceBuildingId === from.id)).toBe(true);
  });

  it('keeps a dependent child with their custodian', () => {
    const familyHome = building(0, BuildingType.House);
    const spare = building(1, BuildingType.House);
    const mother = human(1, { gender: 'female', residenceBuildingId: familyHome.id });
    const child = human(2, { isJuvenile: true, age: 4, motherId: mother.id, residenceBuildingId: familyHome.id });

    const moved = relocateHousehold([child], spare.id, 'homeless', 'assignment', moveContext([mother, child], [familyHome, spare]));

    expect(moved).toBe(false);
    expect(child.residenceBuildingId).toBe(familyHome.id);
  });

  it('never puts an ordinary household in the Leader\u2019s House', () => {
    const home = building(0, BuildingType.House);
    const manor = building(1, BuildingType.LeaderHouse);
    const settler = human(1, { residenceBuildingId: home.id });

    const moved = relocateHousehold([settler], manor.id, 'homeless', 'assignment', moveContext([settler], [home, manor]));

    expect(moved).toBe(false);
    expect(settler.residenceBuildingId).toBe(home.id);
  });

  it('seats a homeless family on the first run and repeats nothing on the second', () => {
    const home = building(0, BuildingType.House);
    const beds = getResidenceCapacity(home);
    const adults = [
      human(1, { gender: 'female', partnerId: 2 }),
      human(2, { gender: 'male', partnerId: 1 }),
    ];
    const children = Array.from({ length: Math.max(1, beds - 2) }, (_, index) =>
      human(10 + index, { isJuvenile: true, age: 4, motherId: 1, fatherId: 2 }),
    );
    const villagers = [...adults, ...children];
    for (const adult of adults) adult.childrenIds = children.map((child) => child.id);

    const first = assignMissingResidences(villagers, [home], villagers);
    expect(villagers.every((member) => member.residenceBuildingId === home.id)).toBe(true);
    expect(first.relocations.length).toBeGreaterThan(0);

    const seated = villagers.map((member) => member.residenceBuildingId);
    const second = assignMissingResidences(villagers, [home], villagers);

    expect(second.relocations).toHaveLength(0);
    expect(villagers.map((member) => member.residenceBuildingId)).toEqual(seated);
    expect(second.violations).toEqual([]);
  });

  it('reports a broken assignment instead of silently keeping it', () => {
    const home = building(0, BuildingType.House);
    const mother = human(1, { gender: 'female', residenceBuildingId: home.id });
    const child = human(2, { isJuvenile: true, age: 4, motherId: mother.id, residenceBuildingId: 999 });

    const report = assignMissingResidences([mother, child], [home], [mother, child]);

    expect(child.residenceBuildingId).toBe(home.id);
    expect(report.violations).toEqual([]);
  });
});
