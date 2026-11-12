/**
 * A crafted import is read through the same JSON string boundary as "Load from file": the transient
 * pools are sanitized element-wise and the fields a systems tick or the path grid would consume are
 * refused with the failing field named.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { createInitialView } from '../src/game/viewState';
import { buildSaveData, loadGameFromFileTextOutcome } from '../src/game/saveLoad';
import { resetSimRng } from '../src/game/simRng';
import { BuildingType, MapSize } from '../src/game/gameTypes';

/** A real save object, cloned so each case mutates only its own copy. */
function realPayload(): Record<string, unknown> {
  resetSimRng();
  const world = initGame({ skipTerrain: true, seed: 4242, size: MapSize.Medium });
  return structuredClone(
    buildSaveData(world, createInitialView(world.width, world.height)),
  ) as Record<string, unknown>;
}

/**
 * The same payload with a real generated map and its start buildings: the geometry rules only run
 * on a save that carries a `worldMap` and building footprints.
 */
let terrainPayloadCache: Record<string, unknown> | null = null;

function terrainPayload(): Record<string, unknown> {
  resetSimRng();
  if (!terrainPayloadCache) {
    const world = initGame({ seed: 4242, size: MapSize.Medium });
    terrainPayloadCache = structuredClone(
      buildSaveData(world, createInitialView(world.width, world.height)),
    ) as Record<string, unknown>;
  }
  return structuredClone(terrainPayloadCache);
}

/** The exact string boundary a downloaded file takes. */
function loadText(text: string) {
  return loadGameFromFileTextOutcome(text);
}

function refusedOutcome(payload: Record<string, unknown>) {
  const outcome = loadText(JSON.stringify(payload));
  if (outcome.ok) throw new Error('the crafted save was expected to be refused');
  return outcome;
}

const validParticle = {
  x: 10,
  y: 20,
  vx: 1,
  vy: 2,
  life: 5,
  maxLife: 10,
  color: '#f00',
  size: 2,
  type: 'blood',
};

const validFloatingText = {
  id: 1,
  x: 30,
  y: 40,
  text: 'Hello',
  color: '#fff',
  life: 4,
  maxLife: 6,
  scale: 1,
};

const validDisaster = {
  type: 'fire',
  x: 100,
  y: 100,
  radius: 30,
  duration: 200,
  progress: 10,
};

beforeEach(() => {
  resetSimRng();
});

afterEach(() => {
  resetSimRng();
});

describe('the transient pools drop only their malformed elements', () => {
  it('drops null entries and keeps the valid particle, text and disaster', () => {
    const payload = realPayload();
    payload.deathParticles = [null, validParticle];
    payload.floatingTexts = [null, validFloatingText];
    payload.disasters = [null, validDisaster];

    const outcome = loadText(JSON.stringify(payload));

    expect(outcome.ok, outcome.ok ? '' : outcome.detail).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.world.deathParticles).toEqual([validParticle]);
    expect(outcome.world.floatingTexts).toEqual([validFloatingText]);
    expect(outcome.world.disasters).toEqual([validDisaster]);
  });

  it('drops a disaster with no finite progress instead of handing it to the systems tick', () => {
    const payload = realPayload();
    payload.disasters = [{ ...validDisaster, progress: null }];

    const outcome = loadText(JSON.stringify(payload));

    expect(outcome.ok, outcome.ok ? '' : outcome.detail).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.world.disasters).toEqual([]);
  });
});

describe('entity energy must survive the JSON round-trip', () => {
  it('refuses a NaN energy that JSON serializes as null, naming the entity field', () => {
    const payload = realPayload();
    const entities = payload.entities as Record<string, unknown>[];
    entities[0].energy = Number.NaN;

    const text = JSON.stringify(payload);
    expect(text).toContain('"energy":null');

    const outcome = refusedOutcome(payload);

    expect(outcome.reason).toBe('unrestorable');
    expect(outcome.detail).toContain('entities[0].energy');
  });

  it('still loads a legacy save whose entities carry no energy field', () => {
    const payload = realPayload();
    const entities = payload.entities as Record<string, unknown>[];
    delete entities[0].energy;
    delete entities[0].maxEnergy;

    const outcome = loadText(JSON.stringify(payload));

    expect(outcome.ok, outcome.ok ? '' : outcome.detail).toBe(true);
  });
});

describe('save-supplied geometry is bounded before it reaches a hot loop', () => {
  it('refuses a completed Fishing Spot wider than the map before water sampling', () => {
    const payload = terrainPayload();
    const buildings = payload.buildings as Record<string, unknown>[];
    const spot = {
      id: payload.nextBuildingId as number,
      type: BuildingType.FishingSpot,
      x: 100,
      y: 100,
      width: 1e9,
      height: 40,
      occupants: [],
      level: 1,
      constructionProgress: 100,
      completed: true,
      health: 100,
      maxHealth: 100,
      spriteScale: 1,
      buildAnimTimer: 0,
    };
    buildings.push(spot);
    // Remove the recorded terrain seed so the water witness would otherwise be sampled.
    delete (payload.worldMap as Record<string, unknown>)._terrainSeed;

    const outcome = refusedOutcome(payload);

    expect(outcome.reason).toBe('unrestorable');
    expect(outcome.detail).toContain(`buildings[${buildings.length - 1}].width`);
  });

  it('refuses a non-compact worldMap whose tile width would size the path grid', () => {
    const payload = terrainPayload();
    const map = payload.worldMap as Record<string, unknown>;
    map._compact = false;
    map.width = 1e9;

    const outcome = refusedOutcome(payload);

    expect(outcome.reason).toBe('unrestorable');
    expect(outcome.detail).toContain('worldMap.width');
  });
});

describe('an untouched save still loads unchanged', () => {
  it('accepts the real payload through the string boundary', () => {
    const payload = realPayload();

    const outcome = loadText(JSON.stringify(payload));

    expect(outcome.ok, outcome.ok ? '' : outcome.detail).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.world.tick).toBe(payload.tick);
    expect(outcome.world.villageName).toBe(payload.villageName);
    expect(outcome.world.resources).toEqual(payload.resources);
    expect(outcome.world.entities).toHaveLength((payload.entities as unknown[]).length);
  });
});
