import { describe, expect, it } from 'vitest';
import { rebuildChildrenIds } from '@/game/dayCycle';
import { createEntity } from '@/game/worldGen';
import { EntityType } from '@/game/gameTypes';

describe('rebuildChildrenIds', () => {
  it('links both parents and deduplicates when twins share mother and father', () => {
    const mother = createEntity(EntityType.Human, 0, 0, 1, 400, false, {
      gender: 'female',
      surname: 'A',
      ageYears: 30,
    });
    const father = createEntity(EntityType.Human, 10, 0, 2, 400, false, {
      gender: 'male',
      surname: 'A',
      ageYears: 30,
    });
    const twinA = createEntity(EntityType.Human, 5, 5, 10, 400, false, {
      gender: 'male',
      surname: 'A',
      ageYears: 0,
    });
    const twinB = createEntity(EntityType.Human, 6, 5, 11, 400, false, {
      gender: 'female',
      surname: 'A',
      ageYears: 0,
    });
    twinA.motherId = mother.id;
    twinA.fatherId = father.id;
    twinB.motherId = mother.id;
    twinB.fatherId = father.id;
    twinA.isJuvenile = true;
    twinB.isJuvenile = true;

    const humans = [mother, father, twinA, twinB];
    rebuildChildrenIds(humans);

    expect(mother.childrenIds.sort()).toEqual([10, 11]);
    expect(father.childrenIds.sort()).toEqual([10, 11]);
    expect(twinA.childrenIds).toEqual([]);
  });

  it('links adoptive parents from adoptiveMotherId and adoptiveFatherId', () => {
    const adoptiveMother = createEntity(EntityType.Human, 0, 0, 1, 400, false, {
      gender: 'female',
      ageYears: 35,
    });
    const adoptiveFather = createEntity(EntityType.Human, 10, 0, 2, 400, false, {
      gender: 'male',
      ageYears: 36,
    });
    const orphan = createEntity(EntityType.Human, 5, 5, 10, 400, false, { ageYears: 4 });
    orphan.adoptiveMotherId = adoptiveMother.id;
    orphan.adoptiveFatherId = adoptiveFather.id;
    orphan.isJuvenile = true;

    rebuildChildrenIds([adoptiveMother, adoptiveFather, orphan]);

    expect(adoptiveMother.childrenIds).toEqual([10]);
    expect(adoptiveFather.childrenIds).toEqual([10]);
  });

  it('skips dead children so parents do not retain ghost links', () => {
    const mother = createEntity(EntityType.Human, 0, 0, 1, 400, false, {
      gender: 'female',
      ageYears: 30,
    });
    const child = createEntity(EntityType.Human, 5, 5, 10, 400, false, { ageYears: 2 });
    child.motherId = mother.id;
    child.alive = false;

    rebuildChildrenIds([mother, child]);

    expect(mother.childrenIds).toEqual([]);
  });
});