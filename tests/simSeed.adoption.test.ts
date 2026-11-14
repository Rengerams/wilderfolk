/**
 * Every realm that receives a world must adopt its colony seed rather than create one — the
 * simulation worker on session reset, and the save-load path.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  adoptSimSeedFromWorld,
  createSeededRng,
  getSimRng,
  getSimSeed,
  resetSimRng,
  setSimSeed,
} from '../src/game/simRng';
import { initGame } from '../src/game/gameEngine';
import { buildSaveData, loadGameFromParsed, parseSaveJson } from '../src/game/saveLoad';
import { createInitialView } from '../src/game/viewState';
import { BuildingType, EntityType, MapSize } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { DAYS_PER_YEAR, TICKS_PER_DAY } from '../src/game/dayCycle';
import { maybeTriggerRenffrOmen } from '../src/game/renffrStar';
import {
  GRANARY_FOOD_REQUIREMENT,
  electionPromisesForYear,
  recordElectionPromises,
} from '../src/game/electionPromises';
import {
  STORY_KEY as DEER_STORY_KEY,
  deerParliamentEligibleDay,
  maybeOfferDeerParliament,
} from '../src/game/deerParliament';

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

/**
 * The map record is terrain data; every seeded decision reads the adopted run seed. These load the
 * real save path with a `simRng.seed` that differs from `worldMap.seed` — the disagreement a seed
 * adoption can produce.
 */
describe('one run-seed authority for stories, elections and omens', () => {
  afterEach(() => {
    resetSimRng();
  });

  function loadWithDivergedSeeds(mapSeed: number, runSeed: number): WorldState {
    // Real terrain, so the map record exists and the save carries it.
    const world = initGame({ size: MapSize.Medium, seed: mapSeed });
    const save = buildSaveData(world, createInitialView(world.width, world.height));
    // The save boundary types simRng as untrusted; this fixture writes the diverged seed on purpose.
    (save.simRng as { seed: number }).seed = runSeed;
    const parsed = parseSaveJson(JSON.stringify(save));
    if (!parsed.valid) throw new Error(`save refused: ${parsed.reason}`);
    const loaded = loadGameFromParsed(parsed.parsed);
    if (!loaded) throw new Error('save did not load');
    expect(loaded.world.worldMap?.seed).toBe(mapSeed);
    expect(getSimSeed()).toBe(runSeed);
    return loaded.world;
  }

  function omenTriggerTick(state: WorldState): number {
    for (let offset = 0; offset < 300_000; offset++) {
      state.tick = 3 * TICKS_PER_DAY + offset;
      state.renffrOmen = null;
      if (maybeTriggerRenffrOmen(state, state.entities, true)) return state.tick;
    }
    throw new Error('the Renffr omen never triggered');
  }

  it('omen rolls follow the adopted run seed, not the map record', () => {
    const baseline = omenTriggerTick(loadWithDivergedSeeds(111, 4242));
    // A different map record cannot move the omen: the run seed alone decides it.
    expect(omenTriggerTick(loadWithDivergedSeeds(999_983, 4242))).toBe(baseline);
    // Two run seeds omen on different ticks.
    expect(omenTriggerTick(loadWithDivergedSeeds(999_983, 777))).not.toBe(baseline);
  });

  function thrivingNoWalls(state: WorldState): void {
    // Equal urgency everywhere except walls/healthcare, so the tie-break alone orders the promises.
    state.buildings = [];
    state.resources.food = GRANARY_FOOD_REQUIREMENT;
    state.villageReputation = 65;
    state.villageForge = {
      activeOrder: null,
      progress: 0,
      completed: {
        iron_spears: true,
        iron_shields: true,
        guard_halberds: true,
        wall_plates: true,
        iron_pickaxes: true,
        iron_swords: true,
        scale_mail: true,
        tower_ballistae: true,
      },
    };
  }

  function promiseOrder(runSeed: number, mapSeed: number, year: number): number[] {
    const state = initGame({ size: MapSize.Medium, seed: 5, skipTerrain: true });
    setSimSeed(runSeed);
    state.worldMap = { ...state.worldMap!, seed: mapSeed } as WorldState['worldMap'];
    state.storyFlags = {};
    state.electionPromiseRecords = [];
    thrivingNoWalls(state);
    recordElectionPromises(state, year);
    return electionPromisesForYear(state, year);
  }

  it('election tie-breaks follow the adopted run seed', () => {
    expect(promiseOrder(11, 1, 3)).toEqual(promiseOrder(11, 999_983, 3));
    const yearsDiffer = [1, 2, 3, 4, 5, 6, 7, 8].some(
      (year) => JSON.stringify(promiseOrder(11, 1, year)) !== JSON.stringify(promiseOrder(12, 1, year)),
    );
    expect(yearsDiffer).toBe(true);
  });

  it('authored story windows follow the adopted run seed', () => {
    const state = initGame({ size: MapSize.Medium, seed: 5, skipTerrain: true });
    setSimSeed(4242);
    const day = deerParliamentEligibleDay(getSimSeed());
    const lateMapSeed = [7, 13, 29, 63, 101, 211].find(
      (candidate) => deerParliamentEligibleDay(candidate) > day,
    );
    expect(lateMapSeed).toBeDefined();

    state.worldMap = { ...state.worldMap!, seed: lateMapSeed! } as WorldState['worldMap'];
    state.storyFlags = {};
    state.pendingStoryEvents = [];
    state.entities.push(
      ...Array.from({ length: 6 }, (_, index) => ({
        id: 10_000 + index,
        type: EntityType.Deer,
        alive: true,
      }) as unknown as Entity),
    );
    state.buildings.push({
      id: 20_000,
      type: BuildingType.HuntingSpot,
      completed: true,
      faction: 'player',
      occupants: [],
    } as unknown as Building);
    state.year = Math.floor(day / DAYS_PER_YEAR);
    state.dayInYear = day % DAYS_PER_YEAR;

    maybeOfferDeerParliament(state);

    expect((state.pendingStoryEvents ?? []).some((event) => event.storyKey === DEER_STORY_KEY)).toBe(true);
  });
});