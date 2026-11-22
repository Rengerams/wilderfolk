import { describe, expect, it } from 'vitest';
import { human } from '../src/test/factories';
import { EntityType, type Entity, type WorldState } from '../src/game/gameTypes';
import { buildFullFamilyTree } from '../src/game/familyTree';
import { findFamilyGroupRoot, descendantsOf, largestBloodlines, largestExtendedFamilies, recordGenealogyBirth, recordGenealogyDeath, syncGenealogyRegistry } from '../src/game/genealogyRegistry';

function world(): WorldState {
  return { entities: [], year: 4, dayInYear: 15 } as unknown as WorldState;
}

describe('persistent genealogy registry', () => {
  it('uses one compressed root lookup for all family group projections', () => {
    const parents = new Map<number, number>([[1, 2], [2, 3], [3, 3], [4, 4]]);
    expect(findFamilyGroupRoot(parents, 1)).toBe(3);
    expect(parents.get(1)).toBe(3);
    expect(parents.get(2)).toBe(3);
    expect(findFamilyGroupRoot(parents, 4)).toBe(4);
    expect(findFamilyGroupRoot(parents, 99)).toBe(99);
    expect(parents.has(99)).toBe(false);
  });

  it('preserves a dead ancestor and descendants across surnames and save serialization', () => {
    const state = world();
    const ancestor = human(1, { name: 'Founder', surname: 'Aquino' });
    const child = human(2, { name: 'Daughter', surname: 'Trowbridge', motherId: 1 });
    const grandchild = human(3, { name: 'Grandchild', surname: 'Smith', motherId: 2 });
    state.entities = [ancestor, child, grandchild];
    syncGenealogyRegistry(state);
    recordGenealogyDeath(state, ancestor);
    state.entities = [child, grandchild];
    syncGenealogyRegistry(state);

    const restored = JSON.parse(JSON.stringify(state.genealogyRegistry!));
    expect(restored.people['1'].alive).toBe(false);
    expect(restored.people['1'].diedYear).toBe(4);
    expect(descendantsOf(restored, 1).map(person => person.id).sort()).toEqual([2, 3]);
    expect(largestBloodlines(restored, 1)[0].ancestor.id).toBe(1);
  });

  it('preserves the prior registry through birth, death and census updates for tick rollback', () => {
    const state = world();
    const mother = human(1);
    state.entities = [mother];
    const checkpoint = syncGenealogyRegistry(state);
    const original = structuredClone(checkpoint);
    recordGenealogyBirth(state, human(2, { motherId: 1 }));
    recordGenealogyDeath(state, mother);
    state.entities = [];
    syncGenealogyRegistry(state);
    expect(state.genealogyRegistry!.people['1'].alive).toBe(false);
    expect(state.genealogyRegistry!.people['1'].childrenIds).toEqual([2]);
    expect(checkpoint).toEqual(original);
  });

  it('counts marriage-connected families without calling spouses blood descendants', () => {
    const state = world();
    const a = human(1, { name: 'A', surname: 'Catron', partnerId: 2 });
    const b = human(2, { name: 'B', surname: 'Zarate', partnerId: 1 });
    const c = human(3, { name: 'C', surname: 'Trowbridge', motherId: 2 });
    state.entities = [a, b, c];
    const registry = syncGenealogyRegistry(state);
    expect(largestExtendedFamilies(registry, 1)[0].livingMembers).toBe(3);
    expect(descendantsOf(registry, 1)).toHaveLength(0);
    expect(descendantsOf(registry, 2).map(person => person.id)).toEqual([3]);
  });

  it('retains a human mother and a deer father in the Wildkin family tree and after death', () => {
    const state = world();
    const mother = human(1, { name: 'Maren' });
    const deer = { id: 9, type: EntityType.Deer, alive: true, birthYear: 2, birthDay: 15 } as Entity;
    const wildkin = {
      id: 10, type: EntityType.Wildkin, alive: true, name: 'Wildkin #10',
      motherId: mother.id, fatherId: deer.id, age: 0, birthYear: 4, birthDay: 15,
      isJuvenile: true,
    } as Entity;
    state.entities = [mother, deer];

    syncGenealogyRegistry(state);
    recordGenealogyBirth(state, deer);
    recordGenealogyBirth(state, wildkin);
    // Production's newEntities have not been committed to state.entities at this phase.
    syncGenealogyRegistry(state, [mother, deer, wildkin]);

    const record = state.genealogyRegistry!.people['10'];
    expect(record.alive).toBe(true);
    expect(record.entityType).toBe(EntityType.Wildkin);
    expect(record.motherId).toBe(mother.id);
    expect(record.fatherId).toBe(deer.id);
    expect(state.genealogyRegistry!.people['1'].childrenIds).toContain(10);
    expect(state.genealogyRegistry!.people['9'].childrenIds).toContain(10);

    const tree = buildFullFamilyTree(mother, [mother, deer, wildkin]);
    expect(tree.parentLinks.get(wildkin.id)).toEqual(expect.arrayContaining([mother.id, deer.id]));

    state.entities = [mother, deer, wildkin];
    recordGenealogyDeath(state, wildkin);
    const saved = structuredClone(state);
    expect(saved.genealogyRegistry!.people['10'].alive).toBe(false);
    expect(saved.genealogyRegistry!.people['10'].fatherId).toBe(deer.id);
  });

  it('records both parents of a Wildkin-to-Wildkin newborn without assuming their gender', () => {
    const state = world();
    const a = { id: 4, type: EntityType.Wildkin, alive: true, name: 'Wildkin #4' } as Entity;
    const b = { id: 5, type: EntityType.Wildkin, alive: true, name: 'Wildkin #5' } as Entity;
    const child = {
      id: 6, type: EntityType.Wildkin, alive: true, name: 'Wildkin #6',
      wildkinParentIds: [4, 5],
    } as Entity;
    state.entities = [a, b, child];
    recordGenealogyBirth(state, a);
    recordGenealogyBirth(state, b);
    recordGenealogyBirth(state, child);
    syncGenealogyRegistry(state);
    expect(state.genealogyRegistry!.people['6'].wildkinParentIds).toEqual([4, 5]);
    expect(state.genealogyRegistry!.people['4'].childrenIds).toContain(6);
    expect(state.genealogyRegistry!.people['5'].childrenIds).toContain(6);
    expect(buildFullFamilyTree(a, [a, b, child]).parentLinks.get(6))
      .toEqual(expect.arrayContaining([4, 5]));
  });

  it('records a newborn not yet merged into the world entity list', () => {
    const state = world();
    state.entities = [human(1, { name: 'Mother' })];
    syncGenealogyRegistry(state);
    recordGenealogyBirth(state, human(2, { name: 'Baby', motherId: 1 }));
    expect(state.genealogyRegistry!.people['1'].childrenIds).toContain(2);
    expect(state.genealogyRegistry!.people['2'].alive).toBe(true);
  });
});
