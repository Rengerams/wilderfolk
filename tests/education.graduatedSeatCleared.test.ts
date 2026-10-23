/**
 * A graduated settler releases the school seat they held as a pupil.
 *
 * `syncSchoolAssignments` hands seats to `isJuvenile` pupils only, so the seat an adult kept from
 * childhood stayed on their record — and the housing commute score, which adds a school trip for
 * any member carrying a school id, went on walking educated adults to their old school.
 */
import { describe, expect, it } from 'vitest';
import { BuildingType } from '../src/game/gameTypes';
import type { Building, Entity } from '../src/game/gameTypes';
import { SCHOOL_MIN_AGE } from '../src/game/gameConstants';
import { syncSchoolAssignments } from '../src/game/education';
import { building, human } from '../src/test/factories';

/** The bounded work-commute pace the assignment path is given. */
const WALK_SPEED = 2;

/** A staffed school, the settler who has graduated, and a pupil who has not. */
function fixtures(): { staff: Entity; graduate: Entity; pupil: Entity; school: Building } {
  return {
    staff: human(1, { x: 40, y: 40 }),
    school: building(50, BuildingType.School, { x: 40, y: 40, occupants: [1] }),
    // The adult still carries the seat the school-day rule left behind at graduation.
    graduate: human(2, { x: 44, y: 44, age: 30, isJuvenile: false, schoolBuildingId: 50, schoolDays: 400 }),
    pupil: human(3, { x: 44, y: 44, age: SCHOOL_MIN_AGE + 2, isJuvenile: true }),
  };
}

describe('syncSchoolAssignments and graduated settlers', () => {
  it('clears the adult seat and still seats the pupil', () => {
    const { staff, graduate, pupil, school } = fixtures();

    const assignments = syncSchoolAssignments([staff, graduate, pupil], [school], false, WALK_SPEED);

    expect(graduate.schoolBuildingId).toBeUndefined();
    expect(assignments.has(graduate.id)).toBe(false);
    expect(pupil.schoolBuildingId).toBe(school.id);
  });
});
