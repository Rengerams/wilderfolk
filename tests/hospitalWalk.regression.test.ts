/**
 * Regression: pregnant settlers used to `continue` at the end of the pregnancy
 * block in tickHumans, skipping work, social life, leisure and the single
 * movement apply at the loop bottom. The walk-to-hospital logic only existed
 * inside that block (duplicated as the "BUGFIX" band-aid), so only pregnant
 * settlers could seek a staffed hospital at all.
 *
 * After the fix, hospital seeking is a main-loop behavior gated on
 * `needsMedicalCare(entity)` (which already covers pregnancy): sick or
 * pregnant settlers pick the nearest staffed hospital to walk to; healthy
 * settlers and already-hospital settlers do not.
 */
import { describe, expect, it } from 'vitest';
import { pickHospitalWalkTarget } from '../src/game/hospitalCare';
import { BuildingType } from '../src/game/gameTypes';
import type { Building, Entity } from '../src/game/gameTypes';

function entity(x: number, y: number, overrides: Partial<Entity> = {}): Entity {
  return {
    id: 1,
    type: 'human',
    x,
    y,
    vx: 0,
    vy: 0,
    alive: true,
    age: 25,
    energy: 100,
    maxEnergy: 100,
    gender: 'female',
    isJuvenile: false,
    ...overrides,
  } as Entity;
}

function hospital(id: number, x: number, y: number): Building {
  return {
    id,
    type: BuildingType.Hospital,
    x,
    y,
    width: 40,
    height: 32,
    completed: true,
    faction: undefined,
    occupants: [],
    constructionProgress: 100,
  } as Building;
}

describe('pickHospitalWalkTarget', () => {
  it('returns the nearest staffed hospital when farther than 28px', () => {
    const patient = entity(0, 0, { pregnant: true });
    const near = hospital(1, 500, 0);
    const far = hospital(2, 900, 0);
    const target = pickHospitalWalkTarget(patient, [near, far]);
    expect(target?.id).toBe(near.id);
  });

  it('returns undefined when the settler is already at a hospital (<= 28px)', () => {
    const patient = entity(10, 10, { pregnant: true });
    const target = pickHospitalWalkTarget(patient, [hospital(1, 0, 0)]);
    expect(target).toBeUndefined();
  });

  it('returns undefined when there is no staffed hospital', () => {
    const patient = entity(0, 0, { pregnant: true });
    expect(pickHospitalWalkTarget(patient, [])).toBeUndefined();
  });

  it('still picks a hospital when it is far away (walking distance is not capped)', () => {
    const patient = entity(0, 0);
    expect(pickHospitalWalkTarget(patient, [hospital(1, 10_000, 10_000)])?.id).toBe(1);
  });
});
