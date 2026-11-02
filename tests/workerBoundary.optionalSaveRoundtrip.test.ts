import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { MapSize } from '../src/game/gameTypes';
import { applySimTickDelta, extractSimTickDelta } from '../src/game/simBuffers/simDelta';
import { buildSaveData, loadGameFromParsed, parseSaveJson } from '../src/game/saveLoad';
import { createInitialView } from '../src/game/viewState';

describe('worker boundary optional state and save parity', () => {
  it('preserves absent grave records distinctly from a real empty grave list', () => {
    const source = initGame({ size: MapSize.Medium, seed: 144 });
    source.graveRecords = undefined;
    const target = structuredClone(source);
    target.graveRecords = [];
    applySimTickDelta(target, extractSimTickDelta(source));
    expect(target.graveRecords).toBeUndefined();

    source.graveRecords = [];
    applySimTickDelta(target, extractSimTickDelta(source));
    expect(target.graveRecords).toEqual([]);
  });

  it('round-trips the new-world building allocator and serialized genealogy records', () => {
    const world = initGame({ size: MapSize.Medium, seed: 145 });
    expect(world.nextBuildingId).toBe(1);
    const saved = buildSaveData(world, createInitialView(world.width, world.height));
    const parsed = parseSaveJson(JSON.stringify(saved));
    expect(parsed.valid).toBe(true);
    if (!parsed.valid) throw new Error(parsed.reason);

    const result = loadGameFromParsed(parsed.parsed);
    expect(result).not.toBeNull();
    if (!result) throw new Error('The saved world did not reload');

    expect(result.world.nextBuildingId).toBe(world.nextBuildingId);
    const savedRegistry = JSON.parse(JSON.stringify(saved.genealogyRegistry ?? null)) as unknown;
    const loadedRegistry = JSON.parse(JSON.stringify(result.world.genealogyRegistry ?? null)) as unknown;
    expect(loadedRegistry).toEqual(savedRegistry);
  });
});
