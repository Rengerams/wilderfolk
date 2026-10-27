/**
 * The colony seed has to be *adopted* by every realm that receives a world instead of
 * creating one — the simulation worker (`gameWorker.resetWorkerSession`) and the save-load
 * path (`saveLoad.loadGameFromParsed`).
 *
 * Both used to inherit `simRng`'s module default of seed 1: the worker because it is a
 * separate realm that was never seeded, and a load because nothing re-seeded this realm
 * after the game it had created. Every `getSimRng(owner)` / `seededRandomForRun()` draw in
 * those realms then came from the wrong seed, so the same world diverged between worker and
 * main-thread mode and two different seeds shared one set of random streams.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  adoptSimSeedFromWorld,
  createSeededRng,
  getSimRng,
  getSimSeed,
  resetSimRng,
} from '../src/game/simRng';
import { initGame } from '../src/game/gameEngine';
import { buildSaveData, loadGameFromParsed, parseSaveJson } from '../src/game/saveLoad';
import { createInitialView } from '../src/game/viewState';
import { MapSize } from '../src/game/gameTypes';

describe('simulation seed adoption', () => {
  afterEach(() => {
    resetSimRng();
  });

  it('adopts the seed a received world carries', () => {
    const world = initGame({ size: MapSize.Medium, seed: 777 });
    // Stand in for a fresh realm (the worker, or a page that never called initGame).
    resetSimRng();
    expect(getSimSeed()).not.toBe(777);

    expect(adoptSimSeedFromWorld(world)).toBe(777);
    expect(getSimSeed()).toBe(777);
    // The first draw is the one the creating realm would make, not the seed-1 stream.
    expect(getSimRng('entityFactory')()).toBe(createSeededRng(777, 'entityFactory')());
    expect(getSimRng('entityFactory')()).not.toBe(createSeededRng(1, 'entityFactory')());
  });

  it('falls back to seed 1 when a world carries none', () => {
    resetSimRng();
    expect(adoptSimSeedFromWorld({ worldMap: null })).toBe(1);
    expect(adoptSimSeedFromWorld({})).toBe(1);
    expect(getSimSeed()).toBe(1);
  });

  it('restores the colony seed through a real save round-trip', () => {
    const world = initGame({ size: MapSize.Medium, seed: 31337 });
    const saved = buildSaveData(world, createInitialView(world.width, world.height));
    const parsed = parseSaveJson(JSON.stringify(saved));
    expect(parsed.valid).toBe(true);
    // `SaveReadResult` is a union: narrow to the accepted arm before reading `parsed`.
    if (!parsed.valid) throw new Error(`save refused: ${parsed.reason}`);

    // Another game first, so the loading realm is holding the wrong seed.
    initGame({ size: MapSize.Medium, seed: 4 });
    expect(getSimSeed()).toBe(4);

    const loaded = loadGameFromParsed(parsed.parsed);
    expect(loaded).not.toBeNull();
    expect(loaded!.world.worldMap?.seed).toBe(31337);
    expect(getSimSeed()).toBe(31337);
  });
});