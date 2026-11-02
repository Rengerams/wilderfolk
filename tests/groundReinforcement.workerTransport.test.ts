/**
 * Ground reinforcement is a terrain operation, so its result has to reach the display world.
 *
 * `startBuilding(GroundReinforcement)` patches the authoritative worker map to Rocky + `reinforced`;
 * placement validation and the soil sprite read the *display* world's map (`canPlaceBuilding`,
 * `drawReinforcedSoil`). The command delta therefore has to carry the patched tiles — otherwise the
 * ground still reads as mountains/snow on the client and the next building is refused.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/gameEngine';
import { BuildingType, MapSize, PATH_CELL, TerrainType } from '../src/game/gameTypes';
import type { WorldState } from '../src/game/gameTypes';
import { tileAt } from '../src/game/terrain/terrainGrid';
import { applyWorkerCommand, extractCommandDelta } from '../src/game/simWorker/commands';
import { applySimTickDelta } from '../src/game/simBuffers/simDelta';
import { isFootprintOnBuildableTerrain } from '../src/game/placementUtils';

const REINFORCE_PATCH_TILES = 3;
const UNSTABLE = new Set<TerrainType>([
  TerrainType.Mountains,
  TerrainType.Snow,
  TerrainType.ShallowWater,
  TerrainType.RiverBank,
]);

/** Centre of a 3×3 patch that the reinforcement accepts (some hard ground, no deep water or river). */
function findReinforceableSpot(world: WorldState): { x: number; y: number } | null {
  const map = world.worldMap;
  if (!map) return null;
  for (let ty = 1; ty < map.height - REINFORCE_PATCH_TILES - 1; ty++) {
    for (let tx = 1; tx < map.width - REINFORCE_PATCH_TILES - 1; tx++) {
      let unstable = 0;
      let liquid = false;
      for (let y = ty; y < ty + REINFORCE_PATCH_TILES; y++) {
        for (let x = tx; x < tx + REINFORCE_PATCH_TILES; x++) {
          const tile = tileAt(map, x, y);
          if (!tile) continue;
          if (tile.type === TerrainType.DeepWater || tile.type === TerrainType.River) liquid = true;
          if (UNSTABLE.has(tile.type)) unstable++;
        }
      }
      if (!liquid && unstable > 0) {
        return {
          x: tx * PATH_CELL + (REINFORCE_PATCH_TILES * PATH_CELL) / 2,
          y: ty * PATH_CELL + (REINFORCE_PATCH_TILES * PATH_CELL) / 2,
        };
      }
    }
  }
  return null;
}

describe('ground reinforcement crosses the worker boundary', () => {
  it('ships the patched tiles so the display world can build there', () => {
    const world = initGame({ size: MapSize.Medium, seed: 1234 });
    const spot = findReinforceableSpot(world);
    if (!spot) throw new Error('the fixture map has no reinforceable patch');
    world.resources.stone += 200;
    world.resources.gold += 200;
    const display = structuredClone(world);

    const authoritative = applyWorkerCommand(world, {
      proto: 1,
      op: 'startBuilding',
      type: BuildingType.GroundReinforcement,
      x: spot.x,
      y: spot.y,
      rotation: 0,
    }, 'owned');
    const delta = extractCommandDelta(authoritative);
    applySimTickDelta(display, structuredClone(delta), { cloneMode: 'transfer' });

    const tile = tileAt(display.worldMap!, Math.floor(spot.x / PATH_CELL), Math.floor(spot.y / PATH_CELL));
    expect(tile?.type, 'the reinforced patch must not stay mountains/snow on the display map').toBe(TerrainType.Rocky);
    expect(tile?.reinforced).toBe(true);
    expect(
      isFootprintOnBuildableTerrain(display, 30, 30, spot.x, spot.y),
      'a building must be placeable on the displayed reinforced ground',
    ).toBe(true);
  });
});
