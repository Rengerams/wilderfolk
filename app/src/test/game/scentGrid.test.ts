import { describe, expect, it } from 'vitest';
import { EntityType } from '@/game/gameTypes';
import { createEntity } from '@/game/worldGen';
import {
  ScentGrid,
  ScentGridReader,
  SCENT_GRID_MAGIC,
  SCENT_GRID_VERSION,
  SCENT_FLEE_MIN,
} from '@/game/scentGrid';

describe('ScentGrid', () => {
  it('packs and reads sidecar buffer with versioned header', () => {
    const grid = new ScentGrid(400, 300, 80);
    grid.deposit(120, 90, 12);
    const buffer = grid.packSidecar(42);
    const reader = ScentGridReader.tryCreate(buffer);
    expect(reader).not.toBeNull();
    expect(reader!.tick).toBe(42);
    expect(reader!.maxScent()).toBeGreaterThan(0);

    const u32 = new Uint32Array(buffer);
    expect(u32[0]).toBe(SCENT_GRID_MAGIC);
    expect(u32[1]).toBe(SCENT_GRID_VERSION);
  });

  it('decays scent each tick', () => {
    const grid = new ScentGrid(200, 200, 80);
    grid.deposit(50, 50, 20);
    const before = grid.getScentAt(50, 50);
    grid.decay(0.5);
    expect(grid.getScentAt(50, 50)).toBeCloseTo(before * 0.5);
  });

  it('deposits wolf scent at predator positions', () => {
    const grid = new ScentGrid(300, 300, 80);
    const wolf = createEntity(EntityType.Wolf, 100, 100, 1, 200);
    grid.depositPredatorScent([wolf]);
    expect(grid.getScentAt(100, 100)).toBeGreaterThan(0);
  });

  it('sampleFleeGradient points away from high scent cells', () => {
    const grid = new ScentGrid(320, 320, 80);
    grid.deposit(200, 160, 30);
    const sample = grid.sampleFleeGradient(120, 160, 1.25);
    expect(sample.strength).toBeGreaterThanOrEqual(SCENT_FLEE_MIN);
    expect(sample.awayX).toBeLessThan(0);
    expect(Math.hypot(sample.awayX, sample.awayY)).toBeCloseTo(1, 3);
  });

  it('returns zero gradient when scent is negligible', () => {
    const grid = new ScentGrid(200, 200, 80);
    const sample = grid.sampleFleeGradient(50, 50);
    expect(sample.strength).toBe(0);
    expect(sample.awayX).toBe(0);
    expect(sample.awayY).toBe(0);
  });
});