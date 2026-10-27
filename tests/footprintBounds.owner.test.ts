import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { isFootprintWithinMapBounds } from '../src/game/placementUtils';

describe('A13 — footprint bounds have one implementation owner', () => {
  it('does not retain the obsolete building-actions compatibility facade', () => {
    expect(existsSync(resolve(process.cwd(), 'src/game/buildingActions.ts'))).toBe(false);
  });

  it('uses the placement owner rule at the inset edge', () => {
    expect(isFootprintWithinMapBounds(10, 10, 5, 5, 100, 100)).toBe(false);
    expect(isFootprintWithinMapBounds(10, 10, 11, 11, 100, 100)).toBe(true);
  });
});
