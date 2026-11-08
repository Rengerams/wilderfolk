import { describe, expect, it } from 'vitest';
import { BuildingType } from '../src/game/gameTypes';
import { isBuildingType, isFiniteNumber } from '../src/game/inputGuards';

describe('shared input guards', () => {
  it('accepts only finite numeric values across save, view and worker boundaries', () => {
    expect(isFiniteNumber(0)).toBe(true);
    expect(isFiniteNumber(-12.5)).toBe(true);
    expect(isFiniteNumber(Number.NaN)).toBe(false);
    expect(isFiniteNumber(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isFiniteNumber(Number.NEGATIVE_INFINITY)).toBe(false);
    expect(isFiniteNumber('12')).toBe(false);
    expect(isFiniteNumber(null)).toBe(false);
    expect(isFiniteNumber(undefined)).toBe(false);
  });

  it('recognizes only enum building types even for untrusted command data', () => {
    expect(isBuildingType(BuildingType.Farm)).toBe(true);
    expect(isBuildingType(BuildingType.Prison)).toBe(true);
    expect(isBuildingType('not-a-building')).toBe(false);
    expect(isBuildingType('')).toBe(false);
    expect(isBuildingType(90)).toBe(false);
    expect(isBuildingType(null)).toBe(false);
  });
});
