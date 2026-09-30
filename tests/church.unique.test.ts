import { describe, expect, it } from 'vitest';
import { BUILDING_CONFIGS } from '../src/game/buildings';
import { BuildingType } from '../src/game/gameTypes';

describe('Church building rule', () => {
  it('allows only one Church per settlement', () => {
    expect(BUILDING_CONFIGS[BuildingType.Church].unique).toBe(true);
  });

  it('keeps the four-priest capacity that defines the cure maximum', () => {
    expect(BUILDING_CONFIGS[BuildingType.Church].maxOccupants).toBe(4);
  });
});
