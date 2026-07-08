import { describe, expect, it } from 'vitest';
import { EntityType } from '@/game/gameTypes';
import { createEntity } from '@/game/worldGen';
import { buildGrassGrid } from '@/game/spatialGrid';
import {
  flushSpatialQueryTickToSession,
  formatSpatialQueryReport,
  getSpatialQueryReport,
  resetSpatialQuerySession,
  setSpatialQueryMetricsEnabled,
  withSpatialQuery,
} from '@/game/spatialQueryMetrics';

describe('spatialQueryMetrics', () => {
  it('counts graze grid queries and candidates per tick', () => {
    setSpatialQueryMetricsEnabled(true);
    resetSpatialQuerySession();

    const grassGrid = buildGrassGrid(400, 400, [
      createEntity(EntityType.Grass, 50, 50, 1, 80),
      createEntity(EntityType.Grass, 55, 55, 2, 80),
    ]);

    withSpatialQuery('graze', () => {
      grassGrid.findClosestInRadius(50, 50, 50, (g) => g.alive);
    });
    flushSpatialQueryTickToSession();

    const report = getSpatialQueryReport();
    expect(report.ticks).toBe(1);
    expect(report.perTick.graze.queries).toBe(1);
    expect(report.perTick.graze.candidates).toBeGreaterThan(0);

    setSpatialQueryMetricsEnabled(false);
  });

  it('formats measured report text', () => {
    const text = formatSpatialQueryReport({
      ticks: 120,
      perTick: {
        graze: { queries: 12, candidates: 180, cells: 108 },
        flee: { queries: 8, candidates: 95, cells: 72 },
        hunt: { queries: 0, candidates: 0, cells: 0 },
        wolf_pack: { queries: 0, candidates: 0, cells: 0 },
        mate: { queries: 0, candidates: 0, cells: 0 },
        social: { queries: 2, candidates: 400, cells: 18 },
        human_hunt: { queries: 0, candidates: 0, cells: 0 },
        tamed_hunt: { queries: 0, candidates: 0, cells: 0 },
        road_near: { queries: 0, candidates: 0, cells: 0 },
        road_avoid: { queries: 0, candidates: 0, cells: 0 },
      },
      session: {} as never,
      gridMode: 'grid',
    });
    expect(text).toContain('Graze');
    expect(text).toContain('grid (default)');
  });
});