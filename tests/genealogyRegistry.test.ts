import { describe, expect, it } from 'vitest';
import { human } from '../src/test/factories';
import type { WorldState } from '../src/game/gameTypes';
import { descendantsOf, largestBloodlines, largestExtendedFamilies, recordGenealogyBirth, recordGenealogyDeath, syncGenealogyRegistry } from '../src/game/genealogyRegistry';

function world(): WorldState {
  return { entities: [], year: 4, dayInYear: 15 } as unknown as WorldState;
}

describe('persistent genealogy registry', () => {
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

  it('records a newborn not yet merged into the world entity list', () => {
    const state = world();
    state.entities = [human(1, { name: 'Mother' })];
    syncGenealogyRegistry(state);
    recordGenealogyBirth(state, human(2, { name: 'Baby', motherId: 1 }));
    expect(state.genealogyRegistry!.people['1'].childrenIds).toContain(2);
    expect(state.genealogyRegistry!.people['2'].alive).toBe(true);
  });
});
