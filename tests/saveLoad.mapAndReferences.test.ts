/**
 * The parts of a colony a compact save has to carry beyond its seed, and the fields a payload must
 * not be allowed to choose for itself.
 *
 * - **Terrain overrides.** A compact save regenerates the ground from its seed, and the sparse
 *   per-tile overrides are the only record of terrain the player changed (placing a building clears
 *   the forest under its footprint). Without them every building's cleared ground came back as
 *   forest on load.
 * - **Dangling references.** A relationship id that resolves to nobody is not a crash — lookups are
 *   guarded — it is a settler whose status says `married` with no spouse, who therefore never
 *   widows and is excluded from courtship by the id it cannot resolve, permanently.
 * - **Chosen dimensions and tick resolution.** Both are read from an untrusted payload before
 *   anything allocates or scales.
 *
 * The fixture is a real payload from `buildSaveData`, so a green case proves the load keeps a world
 * it produced rather than merely tolerating a hand-written one.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { createInitialView } from '../src/game/viewState';
import { buildSaveData, loadGameFromParsedOutcome } from '../src/game/saveLoad';
import { resetSimRng } from '../src/game/simRng';
import { tileAt } from '../src/game/terrain/terrainGrid';
import { EntityType, TerrainType, type Entity, type WorldState } from '../src/game/gameTypes';

function gameWithSettlers(): WorldState {
  resetSimRng();
  const world = initGame({ seed: 987654 });
  // Two settlers, so a relationship can be pointed at a third that does not exist.
  for (let index = 0; index < 2; index++) {
    const donor = world.entities.find((entity) => entity.alive && entity.type !== EntityType.Human);
    if (!donor) break;
    donor.type = EntityType.Human;
    donor.gender = index === 0 ? 'male' : 'female';
    donor.age = 25;
    donor.isJuvenile = false;
    donor.relationshipStatus = 'single';
  }
  return world;
}

function payloadFrom(world: WorldState): Record<string, unknown> {
  return structuredClone(
    buildSaveData(world, createInitialView(world.width, world.height)),
  ) as Record<string, unknown>;
}

function buildWorld(payload: Record<string, unknown>): WorldState {
  const outcome = loadGameFromParsedOutcome(payload);
  if (!outcome.ok) throw new Error(`expected the payload to load: ${outcome.detail}`);
  return outcome.world;
}

beforeEach(() => {
  resetSimRng();
});

afterEach(() => {
  resetSimRng();
});

describe('a compact save carries the terrain the player changed', () => {
  it('round-trips a tile override through save and load', () => {
    const world = gameWithSettlers();
    // Clear a specific tile the way building placement does. World generation ships overrides of its
    // own (the starting camp clearing), so this adds to them rather than being the only entry.
    const tx = 5;
    const ty = 7;
    if (!world.worldMap) throw new Error('fixture has no map');
    const key = ty * world.worldMap.width + tx;
    world.worldMap.overrides = new Map(world.worldMap.overrides ?? []);
    world.worldMap.overrides.set(key, {
      type: TerrainType.Grassland,
      elevation: 0.5,
      moisture: 0.5,
      variation: 0.25,
    });
    const expected = world.worldMap.overrides.size;

    const reloaded = buildWorld(payloadFrom(world));

    expect(reloaded.worldMap?.overrides?.size).toBe(expected);
    expect(tileAt(reloaded.worldMap, tx, ty)?.type).toBe(TerrainType.Grassland);
  });

  it('carries every override the world held, not just the last one', () => {
    const world = gameWithSettlers();
    if (!world.worldMap) throw new Error('fixture has no map');
    const before = [...(world.worldMap.overrides ?? new Map()).entries()];

    const reloaded = buildWorld(payloadFrom(world));

    expect(reloaded.worldMap?.overrides?.size).toBe(before.length);
    for (const [key, tile] of before) {
      expect(reloaded.worldMap?.overrides?.get(key)?.type).toBe(tile.type);
    }
  });

  it('drops a malformed override entry instead of trusting it', () => {
    const world = gameWithSettlers();
    const payload = payloadFrom(world);
    const map = payload.worldMap as Record<string, unknown>;
    map._compact = true;
    const legitimate = (map._overrides as unknown[] | undefined)?.length ?? 0;
    map._overrides = [
      ...((map._overrides as unknown[] | undefined) ?? []),
      [1, { type: 'NotTerrain', elevation: 0.1, moisture: 0.1, variation: 0.1 }],
      ['nope', { type: TerrainType.Grassland, elevation: 0.1, moisture: 0.1, variation: 0.1 }],
      [2, { type: TerrainType.Grassland, elevation: 'x', moisture: 0.1, variation: 0.1 }],
    ];

    const reloaded = buildWorld(payload);

    // None of the three bogus entries landed: the count is the legitimate set, unchanged.
    expect(reloaded.worldMap?.overrides?.size).toBe(legitimate);
  });
});

describe('a load clears references it cannot resolve', () => {
  it('clears a spouse id that names nobody, so the settler is not stuck married', () => {
    const world = gameWithSettlers();
    const survivor = world.entities.find((entity) => entity.alive && entity.type === EntityType.Human);
    if (!survivor) throw new Error('fixture has no settler');
    survivor.partnerId = 999_999;
    survivor.relationshipStatus = 'married';

    const reloaded = buildWorld(payloadFrom(world));
    const loaded = reloaded.entities.find((entity) => entity.id === survivor.id) as Entity;

    expect(loaded.partnerId).toBeUndefined();
    expect(loaded.relationshipStatus).not.toBe('married');
  });

  it('clears a courtship id, an affair id and a tamedBy that name nobody', () => {
    const world = gameWithSettlers();
    const survivor = world.entities.find((entity) => entity.alive && entity.type === EntityType.Human);
    if (!survivor) throw new Error('fixture has no settler');
    survivor.courtshipPartnerId = 999_998;
    survivor.courtshipProgress = 80;
    survivor.affairPartnerId = 999_997;
    survivor.affairProgress = 40;
    survivor.tamedBy = 999_996;

    const reloaded = buildWorld(payloadFrom(world));
    const loaded = reloaded.entities.find((entity) => entity.id === survivor.id) as Entity;

    expect(loaded.courtshipPartnerId).toBeUndefined();
    expect(loaded.courtshipProgress).toBe(0);
    expect(loaded.affairPartnerId).toBeUndefined();
    expect(loaded.affairProgress).toBe(0);
    expect(loaded.tamedBy).toBeUndefined();
  });

  it('keeps a relationship that does resolve', () => {
    const world = gameWithSettlers();
    const humans = world.entities.filter((entity) => entity.alive && entity.type === EntityType.Human);
    if (humans.length < 2) throw new Error('fixture needs two settlers');
    humans[0].partnerId = humans[1].id;
    humans[0].relationshipStatus = 'married';
    humans[1].partnerId = humans[0].id;
    humans[1].relationshipStatus = 'married';

    const reloaded = buildWorld(payloadFrom(world));
    const loaded = reloaded.entities.find((entity) => entity.id === humans[0].id) as Entity;

    expect(loaded.partnerId).toBe(humans[1].id);
  });
});

describe('a payload cannot choose its own dimensions or tick resolution', () => {
  it('ignores an absurd tile dimension pair rather than allocating for it', () => {
    const world = gameWithSettlers();
    const payload = payloadFrom(world);
    const map = payload.worldMap as Record<string, unknown>;
    map.width = 4000;
    map.height = 3000;

    const reloaded = buildWorld(payload);

    // Fell through to the size-based regeneration instead of building a 4000x3000 surface.
    expect(reloaded.worldMap?.width).toBe(world.worldMap?.width);
  });

  it('ignores a negative map dimension instead of throwing a raw RangeError', () => {
    const world = gameWithSettlers();
    const payload = payloadFrom(world);
    const map = payload.worldMap as Record<string, unknown>;
    map.width = -50;

    expect(() => buildWorld(payload)).not.toThrow();
  });

  it('refuses a forged _ticksPerDay instead of rescaling the timeline to year 66666', () => {
    const world = gameWithSettlers();
    const payload = payloadFrom(world);
    payload._ticksPerDay = 1e-6;

    const reloaded = buildWorld(payload);

    expect(reloaded.tick).toBe(world.tick);
    expect(reloaded.year).toBe(world.year);
  });
});
