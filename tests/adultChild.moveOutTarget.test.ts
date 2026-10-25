/**
 * An adult child may trade the family home for a vacant one, but the Leader's House is never a
 * destination: the move is refused there instead of reporting success and staying put.
 */
import { describe, expect, it } from 'vitest';
import { BuildingType } from '../src/game/gameTypes';
import type { Entity } from '../src/game/gameTypes';
import { building, human } from '../src/test/factories';
import { tryMoveOutOfFamilyHome } from '../src/game/residencyReconciliation';

function adultChildWorld(): { parent: Entity; child: Entity; familyHome: ReturnType<typeof building> } {
  const familyHome = building(0, BuildingType.House);
  const parent = human(1, { age: 50, isJuvenile: false, residenceBuildingId: familyHome.id });
  const child = human(2, { age: 20, isJuvenile: false, residenceBuildingId: familyHome.id, motherId: parent.id });
  parent.childrenIds = [child.id];
  familyHome.occupants = [parent.id, child.id];
  return { parent, child, familyHome };
}

describe('tryMoveOutOfFamilyHome', () => {
  it('moves the adult child into an ordinary vacant home', () => {
    const { parent, child, familyHome } = adultChildWorld();
    const vacant = building(1, BuildingType.House);

    expect(tryMoveOutOfFamilyHome(child, [parent, child], [familyHome, vacant])).toBe(true);
    expect(child.residenceBuildingId).toBe(vacant.id);
  });

  it('refuses the empty Leader\u2019s House instead of reporting a move that never happens', () => {
    const { parent, child, familyHome } = adultChildWorld();
    const manor = building(1, BuildingType.LeaderHouse);

    expect(tryMoveOutOfFamilyHome(child, [parent, child], [familyHome, manor])).toBe(false);
    expect(child.residenceBuildingId).toBe(familyHome.id);
  });
});
