import { describe, expect, it } from 'vitest';
import type { Entity } from '../src/game/gameTypes';
import { EntityType } from '../src/game/gameTypes';
import { collectLeaderDescendants } from '../src/game/householdComposition';
import { buildResidenceOccupancy, countResidentsInBuilding, isResidenceOccupantEntity } from '../src/game/residencyOccupancy';

const human = (id: number, extra: Partial<Entity> = {}): Entity => ({
  id, type: EntityType.Human, alive: true, name: `P${id}`, age: 30,
  isJuvenile: false, ...extra,
} as Entity);

describe('housing regressions: married descendants and cursed residents', () => {
  it('does not recall married adult grandchildren into the Leader House', () => {
    const leader = human(1, { childrenIds: [2] });
    const child = human(2, { motherId: 1, childrenIds: [3] });
    const grandchild = human(3, { motherId: 2, age: 22, partnerId: 4 });
    const spouse = human(4, { partnerId: 3 });
    expect(collectLeaderDescendants(leader, [leader, child, grandchild, spouse]).map((p) => p.id)).toEqual([1]);
  });

  it('keeps a cursed Moon Howler bed occupied until their human form returns', () => {
    const cursed = human(5, {
      type: EntityType.Werewolf,
      moonHowlerCursed: true,
      residenceBuildingId: 10,
    });
    const resident = human(6, { residenceBuildingId: 10 });
    const visitor = human(7, { faction: 'visitor', residenceBuildingId: 10 });
    const people = [cursed, resident, visitor];
    expect(isResidenceOccupantEntity(cursed)).toBe(true);
    expect(buildResidenceOccupancy(people).get(10)).toBe(2);
    expect(countResidentsInBuilding(people, 10)).toBe(2);
    cursed.type = EntityType.Human;
    expect(buildResidenceOccupancy(people).get(10)).toBe(2);
    expect(countResidentsInBuilding(people, 10)).toBe(2);
  });
});
