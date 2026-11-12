/**
 * W-05/W-126: a long strip clear emits more tile patches than the old 256-entry queue held, and a
 * delta lost after the drain (failed post, rolled-back tick) must not strand the replica on stale ground.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { TerrainType } from '../src/game/gameTypes';
import type { WorldState } from '../src/game/gameTypes';
import { patchTile, takeTerrainPatches, tileAt } from '../src/game/terrain/terrainGrid';
import { applySimTickDelta, extractSimTickDelta } from '../src/game/simBuffers/simDelta';
import { applySimPrep, extractSimPrep } from '../src/game/simWorker/simPrep';
import { testWorldMap } from '../src/test/worldMapFixtures';

/** MAX_STRIP_SEGMENTS (72) × up to 6 tiles per segment footprint = 432 possible patches. */
const STRIP_TILES = 400;

function forestWorld(): WorldState {
  const world = initGame({ skipTerrain: true, seed: 20_261_111 });
  world.worldMap = testWorldMap({
    tilesX: 128,
    tilesY: 96,
    seed: 20_261_111,
    tileType: () => TerrainType.Forest,
  });
  return world;
}

describe('terrain patch queue', () => {
  it('ships every tile of a 400-tile strip clear instead of dropping the oldest', () => {
    const world = forestWorld();
    const replica = structuredClone(world);
    const cleared: { tx: number; ty: number }[] = [];
    for (let i = 0; i < STRIP_TILES; i++) {
      const tx = 10 + (i % 100);
      const ty = 40 + Math.floor(i / 100);
      patchTile(world.worldMap!, tx, ty, { type: TerrainType.Grassland });
      cleared.push({ tx, ty });
    }

    const delta = extractSimTickDelta(world, world.entities.filter((entity) => entity.alive), {
      cloneMode: 'isolated',
    });
    // The old cap kept only the newest 256 patches, so a 400-tile clear lost its first 144 tiles.
    expect(delta.terrainPatches).toHaveLength(STRIP_TILES);

    applySimTickDelta(replica, structuredClone(delta), { cloneMode: 'transfer' });
    for (const { tx, ty } of cleared) {
      expect(tileAt(replica.worldMap!, tx, ty)?.type, `tile ${tx},${ty} kept stale canopy`).toBe(
        TerrainType.Grassland,
      );
    }
  });

  it('coalesces repeated writes to one tile into its final state', () => {
    const world = forestWorld();
    patchTile(world.worldMap!, 5, 5, { type: TerrainType.Grassland });
    patchTile(world.worldMap!, 5, 5, { type: TerrainType.Rocky });

    const patches = takeTerrainPatches(world.worldMap);
    expect(patches).toHaveLength(1);
    expect(patches[0].tile.type).toBe(TerrainType.Rocky);
    expect(tileAt(world.worldMap!, 5, 5)?.type).toBe(TerrainType.Rocky);
    // The batch rides one more extraction for a lost delta, then retires.
    expect(takeTerrainPatches(world.worldMap)).toEqual(patches);
    expect(takeTerrainPatches(world.worldMap)).toEqual([]);
  });

  it('re-ships the drained tiles after a failed post rolls the worker world back', () => {
    const world = forestWorld();
    const replica = structuredClone(world);
    const prep = extractSimPrep(world);
    patchTile(world.worldMap!, 5, 5, { type: TerrainType.Grassland });
    patchTile(world.worldMap!, 6, 5, { type: TerrainType.Grassland });

    // The delta that carried the patches is built, then the post throws and is never delivered.
    const lost = extractSimTickDelta(world, world.entities.filter((entity) => entity.alive), {
      cloneMode: 'isolated',
    });
    expect(lost.terrainPatches).toHaveLength(2);
    applySimPrep(world, prep);
    expect(tileAt(replica.worldMap!, 5, 5)?.type).toBe(TerrainType.Forest);

    // The next successful delta must still carry them: the worker world kept the overrides.
    const retry = extractSimTickDelta(world, world.entities.filter((entity) => entity.alive), {
      cloneMode: 'isolated',
    });
    expect(retry.terrainPatches).toHaveLength(2);
    applySimTickDelta(replica, structuredClone(retry), { cloneMode: 'transfer' });
    expect(tileAt(replica.worldMap!, 5, 5)?.type).toBe(TerrainType.Grassland);
    expect(tileAt(replica.worldMap!, 6, 5)?.type).toBe(TerrainType.Grassland);
  });
});
