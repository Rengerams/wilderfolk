/**
 * The numeric identity of a building type: one number per type, never shared, never reused.
 * Filters read the code (`isResidenceBuildingType`), so a renamed type cannot change what they match.
 */
import { describe, expect, it } from 'vitest';
import { BUILDING_TYPE_CODES, BuildingType } from '../src/game/buildings';
import { isResidenceBuildingType } from '../src/game/residencyOccupancy';

describe('building type codes', () => {
  const codes = Object.values(BUILDING_TYPE_CODES);

  it('numbers every type once, contiguously from 1', () => {
    expect(codes.every((code) => Number.isInteger(code) && code > 0)).toBe(true);
    expect(new Set(codes).size).toBe(codes.length);
    expect([...codes].sort((a, b) => a - b)).toEqual(codes.map((_, index) => index + 1));
  });

  it('keeps the known numbers stable', () => {
    expect(BUILDING_TYPE_CODES[BuildingType.House]).toBe(1);
    expect(BUILDING_TYPE_CODES[BuildingType.Quarry]).toBe(8);
    expect(BUILDING_TYPE_CODES[BuildingType.LeaderHouse]).toBe(18);
    expect(BUILDING_TYPE_CODES[BuildingType.Villa]).toBe(26);
  });

  it('filters homes by code', () => {
    expect([BuildingType.House, BuildingType.Mansion, BuildingType.Villa, BuildingType.LeaderHouse]
      .every(isResidenceBuildingType)).toBe(true);
    expect(isResidenceBuildingType(BuildingType.Farm)).toBe(false);
    expect(isResidenceBuildingType(BuildingType.Hotel)).toBe(false);
  });
});
