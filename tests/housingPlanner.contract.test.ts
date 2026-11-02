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
  createHousingLedger,
  planRelocation,
  standaloneMoveContext,
} from '../src/game/housingPipeline';
import type { HousingLedger } from '../src/game/housingPipeline';

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
    };

    planRelocation(unit, 'homeless', context);

    expect(unit.map((member) => member.residenceBuildingId)).toEqual(before.residences);
    expect(homes.map((home) => [...home.occupants])).toEqual(before.occupants);
    expect(ledgerCounts(context.ledger)).toEqual(before.counts);
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
    expect(applyRelocation(unit, plan, 'homeless', context)).toBeDefined();
    expect(unit.every((member) => member.residenceBuildingId === 11)).toBe(true);
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
});
