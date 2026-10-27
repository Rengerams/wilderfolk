import { describe, expect, it } from 'vitest';
import { analyzeStripJunction, collectStripCenters, connectionsAt } from '../src/game/stripJunction';
import { building } from '../src/test/factories';
import { BuildingType } from '../src/game/gameTypes';

describe('junction geometry agrees with physical footprints', () => {
  it('does not connect distant strips or parallel strips separated by a gap', () => {
    expect(connectionsAt(0, 0, [{ x: 1000, y: 0, width: 72, height: 12 }], [], 72))
      .toEqual({ north: false, south: false, east: false, west: false });
    expect(connectionsAt(0, 0, [{ x: 0, y: 7, width: 72, height: 12 }], [], 72))
      .toEqual({ north: false, south: false, east: false, west: false });
  });

  it('classifies an actual perpendicular crossing as four arms', () => {
    const h = building(1, BuildingType.Road, { x: 14, y: 21, width: 72, height: 12 });
    const v = building(2, BuildingType.Road, { x: 14, y: 21, width: 12, height: 72, rotation: 90 });
    const centers = collectStripCenters([h, v], 'road');
    expect(analyzeStripJunction(14, 21, centers.hList, centers.vList, centers.along).kind).toBe('cross');
    expect(centers.hList[0]).toMatchObject({ x: 14, y: 21 });
  });

  it('distinguishes an endpoint T-junction from a crossing', () => {
    const h = [{ x: 0, y: 0, width: 72, height: 12 }];
    const v = [{ x: 0, y: -36, width: 12, height: 72 }];
    expect(analyzeStripJunction(0, 0, h, v, 72).kind).toBe('tee');
  });
});
