/**
 * The adult floor is 18 (fixed 2026-09-16; it was 16).
 *
 * `HUMAN_ADULT_MIN_AGE` gates courtship, leadership, adoption guardianship, recruit ages and the
 * legacy age clamp. The repository's age ladder has always *documented* 18 —
 * `docs/archive/FERTILITY_AGE14_F1.md` ("The adult marriage threshold remains **18**"),
 * `docs/archive/YOUTH_LOVE_FEATURE.md` ("18 = Adult transition") and the CHANGELOG ("affairs 18+") —
 * while the constant said 16, so a 16–17 year old could court, lead, be recruited as an adult and be
 * offered housing of their own. See
 * `BUG_REPORTS/2026-09-16-adult-floor-was-16-against-the-documented-18.md`.
 */
import { describe, expect, it } from 'vitest';
import { HUMAN_ADULT_MIN_AGE, HUMAN_CHILDHOOD_DAYS } from '../src/game/dayCycle';
import { HUMAN_MOVE_OUT_MIN_AGE } from '../src/game/residencyOccupancy';
import { Relationship } from '../src/game/gameConstants';
import { isEligibleForLeadership } from '../src/game/villageLeadership';
import { isEligibleToCourt, isValidAffairTarget } from '../src/game/simulation/humanRelationships';
import { ensureOrphanAdoption } from '../src/game/residencySelection';
import { EntityType, BuildingType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';

function human(id: number, age: number, overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    type: EntityType.Human,
    name: `Settler${id}`,
    surname: 'Test',
    gender: 'male',
    alive: true,
    age,
    isJuvenile: age < HUMAN_CHILDHOOD_DAYS,
    relationshipStatus: 'single',
    childrenIds: [],
    ...overrides,
  } as Entity;
}

describe('the adult floor is 18', () => {
  it('sits on the documented age ladder, not at the old 16', () => {
    expect(HUMAN_ADULT_MIN_AGE).toBe(18);
    expect(HUMAN_ADULT_MIN_AGE).toBe(HUMAN_MOVE_OUT_MIN_AGE);
    expect(HUMAN_ADULT_MIN_AGE).toBe(Relationship.AFFAIR_MIN_AGE);
    expect(HUMAN_ADULT_MIN_AGE).toBeGreaterThan(HUMAN_CHILDHOOD_DAYS);
  });

  it('keeps a 17 year old out of courtship and lets an 18 year old in', () => {
    expect(isEligibleToCourt(human(1, 17))).toBe(false);
    expect(isEligibleToCourt(human(2, 18))).toBe(true);
  });

  it('keeps a 17 year old out of the leadership pool and lets an 18 year old in', () => {
    expect(isEligibleForLeadership(human(1, 17))).toBe(false);
    expect(isEligibleForLeadership(human(2, 18))).toBe(true);
  });

  it('refuses a 17 year old as an affair partner and accepts an 18 year old', () => {
    const married = human(1, 30, { relationshipStatus: 'married', partnerId: 9 });
    expect(isValidAffairTarget(married, human(2, 17, { gender: 'female' }), 100)).toBe(false);
    expect(isValidAffairTarget(married, human(3, 18, { gender: 'female' }), 100)).toBe(true);
  });

  it('does not let a 17 year old act as an adoptive guardian, but an 18 year old can', () => {
    const home = { id: 10, type: BuildingType.House, completed: true, occupants: [], x: 0, y: 0, width: 20, height: 20 } as unknown as Building;
    const residences = [home];

    // Only a 17 year old is available: the orphan is still housed (no settler is left without a
    // bed), but the minor is not recorded as anybody's adoptive child.
    const orphan = human(1, 6, { fatherId: 90, motherId: 91 });
    ensureOrphanAdoption(orphan, [orphan, human(2, 17)], residences);
    expect(orphan.adoptiveFatherId).toBeUndefined();
    expect(orphan.adoptiveMotherId).toBeUndefined();

    // An 18 year old is eligible, so they become the adoptive parent.
    const adopted = human(1, 6, { fatherId: 90, motherId: 91 });
    const adult = human(3, 18, { gender: 'female' });
    expect(ensureOrphanAdoption(adopted, [adopted, adult], residences)).toBe(true);
    expect(adopted.adoptiveMotherId).toBe(adult.id);
    expect(adult.childrenIds).toContain(adopted.id);
  });
});
