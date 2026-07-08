import { describe, expect, it } from 'vitest';
import { BuildingType } from '@/game/gameTypes';
import { getBuildingFootprintForType } from '@/game/buildingRotation';
import {
  computeStripSegmentCenters,
  MAX_STRIP_SEGMENTS,
} from '@/game/stripBuild';

describe('computeStripSegmentCenters', () => {
  it('preserves the drag endpoint when segment count exceeds MAX_STRIP_SEGMENTS', () => {
    const { width, height } = getBuildingFootprintForType(BuildingType.Wall, 0);
    const along = Math.max(width, height);
    const startX = 0;
    const endX = along * (MAX_STRIP_SEGMENTS + 5);
    const centers = computeStripSegmentCenters(
      BuildingType.Wall,
      startX,
      100,
      endX,
      100,
      0,
    );

    expect(centers.length).toBeGreaterThan(MAX_STRIP_SEGMENTS - 1);
    expect(centers.length).toBeLessThanOrEqual(MAX_STRIP_SEGMENTS);
    const last = centers[centers.length - 1];
    const snappedEnd = computeStripSegmentCenters(
      BuildingType.Wall,
      endX,
      100,
      endX,
      100,
      0,
    )[0];
    expect(last.x).toBe(snappedEnd.x);
    expect(last.y).toBe(100);
  });
});