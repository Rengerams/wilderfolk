/**
 * The relocation plan contract: one question, one answer, one write. Planning must not move
 * anyone, and a plan must never name a destination the writer refuses.
 */
import { describe, expect, it } from 'vitest';
import { BuildingType } from '../src/game/gameTypes';
import type { Entity } from '../src/game/gameTypes';
import { building, human } from '../src/test/factories';
import {
  applyRelocation,
  assignMissingResidences,
  buildHousingUnits,
  createHousingLedger,
  familyFitsInResidence,
  listPlayerResidences,
  planRelocation,
  standaloneMoveContext,
} from '../src/game/housingPipeline';
import type { HousingLedger } from '../src/game/housingPipeline';
import { isResidenceOccupantEntity } from '../src/game/housingModel';
import { isSettlerRelationshipEntity } from '../src/game/moonHowlerForm';
import { buildHousingColony } from '../src/test/housingColony';

function family(): Entity[] {
  const mother = human(1, { age: 30 });
  const father = human(2, { age: 32, partnerId: 1 });
  mother.partnerId = 2;
  const child = human(3, { age: 4, isJuvenile: true, motherId: 1, fatherId: 2 });
  return [mother, father, child];
}

function ledgerCounts(ledger: HousingLedger): Record<string, number> {
  return {
    settled: ledger.settled.size,
    visited: ledger.visited.size,
    reported: ledger.reported.size,
    relocations: ledger.report.relocations.length,
    protected: ledger.report.protectedUnits,
  };
}

describe('the relocation plan contract', () => {
  it('plans a fitting home for a homeless family and applies it once', () => {
    const homes = [building(10, BuildingType.House), building(11, BuildingType.House)];
    const unit = family();
    const context = standaloneMoveContext(unit, homes);

    const plan = planRelocation(unit, 'homeless', context);

    expect(plan.move).toBe(true);
    expect(plan.to).toBe(10);
    const applied = applyRelocation(unit, plan, 'homeless', context);
    expect(applied).toBeDefined();
    expect(unit.map((member) => member.residenceBuildingId)).toEqual([10, 10, 10]);
    expect(homes[0].occupants).toEqual([1, 2, 3]);
    expect(context.ledger.report.relocations).toHaveLength(1);
  });

  it('stays put when no home fits the whole split family', () => {
    const crowded = building(10, BuildingType.House);
    const mother = human(1, { age: 30, residenceBuildingId: 10 });
    const father = human(2, { age: 32, partnerId: 1 });
    mother.partnerId = 2;
    const child = human(3, { age: 4, isJuvenile: true, motherId: 1, fatherId: 2 });
    const residents = Array.from({ length: 4 }, (_, index) =>
      human(10 + index, { residenceBuildingId: 10 }));
    const unit = [mother, father, child];
    const context = standaloneMoveContext([...unit, ...residents], [crowded]);

    const plan = planRelocation(unit, 'homeless', context);

    expect(plan.move).toBe(false);
    expect(plan.settled).not.toBe(true);
    expect(applyRelocation(unit, plan, 'homeless', context)).toBeUndefined();
    expect(child.residenceBuildingId).toBeUndefined();
    expect(context.ledger.report.relocations).toHaveLength(0);
  });

  it('plans without writing, counting or settling anything', () => {
    const homes = [building(10, BuildingType.House)];
    const unit = family();
    const context = standaloneMoveContext(unit, homes);
    const before = {
      residences: unit.map((member) => member.residenceBuildingId),
      occupants: homes.map((home) => [...home.occupants]),
      counts: ledgerCounts(context.ledger),
      occupancy: [...context.occupancy.entries()],
      traits: [...context.traits.entries()].map(([id, entry]) =>
        [id, entry.adults, entry.minors, entry.pairs, [...entry.occupants.keys()]]),
      violations: [...context.ledger.report.violations],
    };

    planRelocation(unit, 'homeless', context);

    expect(unit.map((member) => member.residenceBuildingId)).toEqual(before.residences);
    expect(homes.map((home) => [...home.occupants])).toEqual(before.occupants);
    expect(ledgerCounts(context.ledger)).toEqual(before.counts);
    expect([...context.occupancy.entries()]).toEqual(before.occupancy);
    expect([...context.traits.entries()].map(([id, entry]) =>
      [id, entry.adults, entry.minors, entry.pairs, [...entry.occupants.keys()]])).toEqual(before.traits);
    expect(context.ledger.report.violations).toEqual(before.violations);
  });

  it('never plans a destination the run already refuses', () => {
    const homes = [building(10, BuildingType.House), building(11, BuildingType.House)];
    const unit = family();
    const ledger = createHousingLedger();
    const context = standaloneMoveContext(unit, homes, undefined, undefined, ledger);
    ledger.visited.set(unit[0].id, new Set([10]));

    const plan = planRelocation(unit, 'homeless', context);

    expect(plan.move).toBe(true);
    expect(plan.to).toBe(11);
    const applied = applyRelocation(unit, plan, 'homeless', context);
    expect(applied).toMatchObject({ phase: 'homeless', to: 11, members: [1, 2, 3] });
    expect(applied?.from).toBeUndefined();
    expect(unit.every((member) => member.residenceBuildingId === 11)).toBe(true);
  });

  it('reports the home the movers actually leave', () => {
    const home = building(10, BuildingType.House);
    const elsewhere = building(11, BuildingType.House);
    const mother = human(1, { age: 30, residenceBuildingId: 10 });
    const father = human(2, { age: 32, partnerId: 1, residenceBuildingId: 11 });
    mother.partnerId = 2;
    const child = human(3, { age: 4, isJuvenile: true, motherId: 1, fatherId: 2, residenceBuildingId: 10 });
    const unit = [mother, father, child];
    const context = standaloneMoveContext(unit, [home, elsewhere]);

    const plan = planRelocation(unit, 'homeless', context);

    expect(plan.move).toBe(true);
    expect(plan.to).toBe(10);
    const applied = applyRelocation(unit, plan, 'homeless', context);
    expect(applied).toMatchObject({ phase: 'homeless', to: 10, members: [1, 2, 3] });
    expect(applied?.from).toBe(11);
  });

  it('seats a partly housed household the phase sweep leaves alone', () => {
    const full = building(10, BuildingType.House);
    const room = building(11, BuildingType.House);
    const mother = human(1, { age: 30, residenceBuildingId: 10 });
    const father = human(2, { age: 32, partnerId: 1 });
    mother.partnerId = 2;
    const child = human(3, { age: 4, isJuvenile: true, motherId: 1, fatherId: 2, residenceBuildingId: 10 });
    const tenants = Array.from({ length: 4 }, (_, index) =>
      human(10 + index, { residenceBuildingId: 10 }));
    const guests = Array.from({ length: 4 }, (_, index) =>
      human(20 + index, { residenceBuildingId: 11 }));
    const humans = [mother, father, child, ...tenants, ...guests];

    const report = assignMissingResidences(humans, [full, room], humans);

    expect(humans.every((person) => person.residenceBuildingId != null)).toBe(true);
    expect(report.violations).toEqual([]);
  });

  it('lists completed player residences, not venues or unfinished sites', () => {
    const home = building(10, BuildingType.House);
    const tavern = building(11, BuildingType.Tavern);
    const unfinished = building(12, BuildingType.House, { completed: false });

    expect(listPlayerResidences([home, tavern, unfinished]).map((building) => building.id)).toEqual([10]);
  });

  it('keeps bed occupancy distinct from relationship membership', () => {
    const visitor = human(60, { faction: 'visitor' });

    expect(isResidenceOccupantEntity(visitor)).toBe(false);
    expect(isSettlerRelationshipEntity(visitor)).toBe(true);
  });

  it('plans nothing for an already settled family', () => {
    const home = building(10, BuildingType.House);
    const unit = family();
    for (const member of unit) member.residenceBuildingId = 10;
    const context = standaloneMoveContext(unit, [home]);

    const plan = planRelocation(unit, 'homeless', context);

    expect(plan.move).toBe(false);
    expect(plan.settled).toBe(true);
    expect(plan.why).toBe('settled');
  });

  it('names a stable shortage instead of calling a partly housed family settled', () => {
    const full = building(10, BuildingType.House);
    const mother = human(1, { age: 30, residenceBuildingId: 10 });
    const father = human(2, { age: 32, partnerId: 1 });
    mother.partnerId = 2;
    const child = human(3, { age: 4, isJuvenile: true, motherId: 1, fatherId: 2, residenceBuildingId: 10 });
    const tenants = Array.from({ length: 4 }, (_, index) =>
      human(10 + index, { residenceBuildingId: 10 }));
    const unit = [mother, father, child];
    const context = standaloneMoveContext([...unit, ...tenants], [full]);

    const plan = planRelocation(unit, 'homeless', context);

    expect(plan.move).toBe(false);
    expect(plan.shortage).toBe(true);
    expect(plan.settled).not.toBe(true);
    expect(plan.why).toBe('stable shortage');
  });

  it('never plans the manor for an ordinary household', () => {
    const manor = building(10, BuildingType.LeaderHouse);
    const unit = family();
    const context = standaloneMoveContext(unit, [manor]);

    expect(planRelocation(unit, 'homeless', context).move).toBe(false);
  });

  it('never plans an unfinished home', () => {
    const unfinished = building(10, BuildingType.House, { completed: false });
    const unit = family();
    const context = standaloneMoveContext(unit, [unfinished]);

    expect(planRelocation(unit, 'homeless', context).move).toBe(false);
  });

  it('never splits a minor from a custodian who is not in the unit', () => {
    const mother = human(1, { age: 30, residenceBuildingId: 10 });
    const father = human(2, { age: 32 });
    const child = human(3, { age: 4, isJuvenile: true, motherId: 1, fatherId: 2 });
    const unit = [father, child];
    const homes = [building(11, BuildingType.House), building(12, BuildingType.House)];
    const context = standaloneMoveContext([mother, father, child], homes);

    const plan = planRelocation(unit, 'homeless', context);

    expect(plan.move).toBe(false);
    expect(father.residenceBuildingId).toBeUndefined();
    expect(child.residenceBuildingId).toBeUndefined();
  });

  it('ends the sweep when no home can take the family', () => {
    const home = building(10, BuildingType.House);
    const residents = Array.from({ length: 6 }, (_, index) =>
      human(10 + index, { residenceBuildingId: 10 }));
    const unit = family();
    const humans = [...unit, ...residents];

    const report = assignMissingResidences(humans, [home], humans);

    expect(report.relocations).toHaveLength(0);
    expect(report.stats.passes).toBeGreaterThan(0);
    expect(report.stats.passes).toBeLessThanOrEqual(3);
    expect(report.stats.considered).toBeGreaterThan(0);
    expect(report.stats.moved).toBe(0);
    expect(unit.every((member) => member.residenceBuildingId == null)).toBe(true);
  });

  it('plans only destinations the writer accepts across generated colonies', () => {
    for (let seed = 1; seed <= 2; seed++) {
      const colony = buildHousingColony(seed);
      const residences = listPlayerResidences(colony.buildings);
      const context = standaloneMoveContext(colony.humans, residences);

      for (const unit of buildHousingUnits(colony.humans)) {
        const plan = planRelocation(unit, 'homeless', context);
        if (!plan.move || plan.to === undefined) continue;
        const target = residences.find((home) => home.id === plan.to);
        expect(target, `seed ${seed} target`).toBeDefined();
        expect(familyFitsInResidence(unit, target!, colony.humans, context.occupancy)).toBe(true);
        const applied = applyRelocation(unit, plan, 'homeless', context);
        expect(applied, `seed ${seed} unit ${unit.map((member) => member.id)}`).toBeDefined();
        expect(unit.every((member) => member.residenceBuildingId === plan.to)).toBe(true);
      }
    }
  });

  it('plans a capacity move out of an overfull home', () => {
    const overfull = building(10, BuildingType.House);
    const spare = building(11, BuildingType.House);
    const mother = human(1, { age: 30, residenceBuildingId: 10 });
    const father = human(2, { age: 32, partnerId: 1, residenceBuildingId: 10 });
    mother.partnerId = 2;
    const child = human(3, { age: 4, isJuvenile: true, motherId: 1, fatherId: 2, residenceBuildingId: 10 });
    const others = Array.from({ length: 4 }, (_, index) =>
      human(10 + index, { residenceBuildingId: 10 }));
    const unit = [mother, father, child];
    const context = standaloneMoveContext([...unit, ...others], [overfull, spare]);

    const plan = planRelocation(unit, 'capacity', context);

    expect(plan.move).toBe(true);
    expect(plan.reason).toBe('family');
    expect(plan.to).toBe(11);
    expect(applyRelocation(unit, plan, 'capacity', context)).toBeDefined();
    expect(unit.every((member) => member.residenceBuildingId === 11)).toBe(true);
  });

  it('unhouses only the surplus when no home can take the unit', () => {
    const overfull = building(10, BuildingType.House);
    const mother = human(1, { age: 30, residenceBuildingId: 10 });
    const father = human(2, { age: 32, partnerId: 1, residenceBuildingId: 10 });
    mother.partnerId = 2;
    const child = human(3, { age: 4, isJuvenile: true, motherId: 1, fatherId: 2, residenceBuildingId: 10 });
    const others = Array.from({ length: 4 }, (_, index) =>
      human(10 + index, { residenceBuildingId: 10 }));
    const unit = [mother, father, child];
    const context = standaloneMoveContext([...unit, ...others], [overfull]);

    expect(planRelocation(unit, 'capacity', context).move).toBe(false);
    const surplus = planRelocation(unit, 'surplus', context);
    expect(surplus.move).toBe(true);
    expect(surplus.to).toBeUndefined();
    expect(applyRelocation(unit, surplus, 'capacity', context)).toBeDefined();
    expect(unit.every((member) => member.residenceBuildingId == null)).toBe(true);
  });

  it('plans custody placement with the custodian, not an empty home', () => {
    const custodianHome = building(10, BuildingType.House);
    const empty = building(11, BuildingType.House);
    const mother = human(1, { age: 30, residenceBuildingId: 10 });
    const child = human(3, { age: 4, isJuvenile: true, motherId: 1 });
    const context = standaloneMoveContext([mother, child], [custodianHome, empty]);

    const plan = planRelocation([child], 'custody', context);

    expect(plan.move).toBe(true);
    expect(plan.reason).toBe('guardian');
    expect(plan.to).toBe(10);
    expect(applyRelocation([child], plan, 'guardianship', context)).toBeDefined();
    expect(child.residenceBuildingId).toBe(10);
  });
});
