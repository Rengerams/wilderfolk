/**
 * Housing invariants over generated colonies: what the pipeline promises the world, not how it
 * computes it. Every assertion reads settlement state, never a private helper.
 */
import { describe, expect, it } from 'vitest';
import { BuildingType } from '../src/game/gameTypes';
import type { Entity } from '../src/game/gameTypes';
import {
  assignMissingResidences,
  type HousingReport,
} from '../src/game/housingPipeline';
import {
  buildResidenceOccupancy,
  getResidenceCapacity,
  isLeaderHouseResidence,
  isResidenceOccupantEntity,
} from '../src/game/housingModel';
import { buildHousingColony } from '../src/test/housingColony';
import type { HousingColony } from '../src/test/housingColony';
import { building, human } from '../src/test/factories';

function assignment(colony: HousingColony): Map<number, number | undefined> {
  return new Map(colony.humans.map((person) => [person.id, person.residenceBuildingId]));
}

function run(colony: HousingColony, humans = colony.humans): HousingReport {
  return assignMissingResidences(humans, colony.buildings, colony.humans);
}

function unhoused(colony: HousingColony): number[] {
  return colony.humans.filter((person) => person.residenceBuildingId == null).map((person) => person.id);
}

/** Capacity, links, manor exclusivity and the derived roster — the settlement's own consistency. */
function settlementProblems(colony: HousingColony): string[] {
  const problems: string[] = [];
  const homes = new Map(colony.buildings.map((home) => [home.id, home]));
  const occupancy = buildResidenceOccupancy(colony.humans);

  for (const person of colony.humans) {
    const homeId = person.residenceBuildingId;
    if (homeId == null) continue;
    const home = homes.get(homeId);
    if (!home || !home.completed) problems.push(`#${person.id} lives in non-home #${homeId}`);
    else if (isLeaderHouseResidence(home)) problems.push(`#${person.id} lives in the manor`);
  }
  for (const house of colony.houses) {
    const count = occupancy.get(house.id) ?? 0;
    if (count > getResidenceCapacity(house)) {
      problems.push(`#${house.id} holds ${count} of ${getResidenceCapacity(house)} beds`);
    }
  }

  const implied = new Map<number, number[]>();
  for (const person of colony.humans) {
    if (!isResidenceOccupantEntity(person)) continue;
    const homeId = person.residenceBuildingId;
    if (homeId == null) continue;
    const ids = implied.get(homeId) ?? [];
    ids.push(person.id);
    implied.set(homeId, ids);
  }
  for (const home of colony.buildings) {
    if (home.type === BuildingType.Prison || !home.completed) continue;
    const expected = implied.get(home.id) ?? [];
    if (home.occupants.join(',') !== expected.join(',')) {
      problems.push(`#${home.id} roster [${home.occupants}] does not match [${expected}]`);
    }
  }
  return problems;
}

describe('generated housing colonies', () => {
  it('settles every generated colony lawfully and consistently', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const colony = buildHousingColony(seed);
      const report = run(colony);

      expect(report.violations, `seed ${seed} audit`).toEqual([]);
      expect(settlementProblems(colony), `seed ${seed} settlement`).toEqual([]);
    }
  });

  it('settles the same colony the same way on identical input', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const first = buildHousingColony(seed);
      run(first);
      const second = buildHousingColony(seed);
      run(second);

      expect(assignment(second), `seed ${seed}`).toEqual(assignment(first));
    }
  });

  it('settles the same colony the same way whatever order the settlers arrive in', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const first = buildHousingColony(seed);
      run(first);

      const second = buildHousingColony(seed);
      run(second, [...second.humans].reverse());

      expect(assignment(second), `seed ${seed}`).toEqual(assignment(first));
    }
  });

  it('reports every settler whose home the run changed', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const colony = buildHousingColony(seed);
      const before = assignment(colony);

      const report = run(colony);
      const reported = new Set(report.relocations.flatMap((relocation) => relocation.members));

      for (const person of colony.humans) {
        if (before.get(person.id) === person.residenceBuildingId) continue;
        expect(reported.has(person.id), `seed ${seed} settler #${person.id}`).toBe(true);
      }
    }
  });

  it('keeps a prisoner’s bed reserved and never moves them', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const colony = buildHousingColony(seed);
      const reserved = new Map(colony.prisoners.map((prisoner) => [prisoner.id, prisoner.residenceBuildingId]));

      run(colony);

      for (const [id, home] of reserved) {
        const prisoner = colony.humans.find((person) => person.id === id) as Entity;
        expect(prisoner.residenceBuildingId, `seed ${seed} prisoner #${id}`).toBe(home);
      }
    }
  });

  it('houses a family the capacity phase split while beds remain', () => {
    const colony = buildHousingColony(2);
    run(colony);
    expect(unhoused(colony)).toEqual([]);
  });

  it('leaves a settled colony unchanged on a second run', () => {
    const colony = buildHousingColony(2);
    run(colony);
    expect(run(colony).relocations).toEqual([]);
  });

  it('never overfills a home when a household cannot fit', () => {
    const home = building(1, BuildingType.House);
    const residents = [1, 2, 3, 4, 5].map((id) => human(id, { residenceBuildingId: home.id }));
    const movers = [11, 12, 13, 14].map((id) => human(id));
    const humans = [...residents, ...movers];

    const report = assignMissingResidences(humans, [home], humans);

    expect(report.violations).toEqual([]);
    expect(buildResidenceOccupancy(humans).get(home.id)).toBe(getResidenceCapacity(home));
    expect(movers.filter((person) => person.residenceBuildingId == null)).toHaveLength(3);
  });
});
