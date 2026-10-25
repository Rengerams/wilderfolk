/** An adult child may trade the family home for a vacant one, never for the Leader's House. */
import { describe, expect, it } from 'vitest';
import { BuildingType } from '../src/game/gameTypes';
import type { Entity } from '../src/game/gameTypes';
import { building, human } from '../src/test/factories';
import { assignMissingResidences, tryMoveOutOfFamilyHome } from '../src/game/residencyReconciliation';

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

describe('assignMissingResidences — the adult-child phase', () => {
  it('keeps the adult child home when a prisoner still holds a bed in the vacant house', () => {
    const { parent, child, familyHome } = adultChildWorld();
    // A sentence reserves the bed, so this house is not free for a departing household.
    const reserved = building(1, BuildingType.House);
    const prisoners = Array.from({ length: 6 }, (_, i) => human(10 + i, {
      age: 30,
      isJuvenile: false,
      residenceBuildingId: reserved.id,
      prisonBuildingId: 9,
      prisonerUntilTick: 10_000,
    }));

    assignMissingResidences([parent, child, ...prisoners], [familyHome, reserved]);

    expect(child.residenceBuildingId).toBe(familyHome.id);
  });
});
