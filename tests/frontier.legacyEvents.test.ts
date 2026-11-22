/** Legal terrain for yearly wildlife and flora — obsolete on-map visitor tests retired in PR #165. */
import { describe, expect, it } from 'vitest';
import { initGame, isPassableWildlifePosition } from '../src/game/worldGen';
import { EntityType, TerrainType } from '../src/game/gameTypes';
import type { Entity, WorldMap, WorldState } from '../src/game/gameTypes';
import { rollYearlyWorldEvent } from '../src/game/groupEvents';
import { isFootprintOnBuildableTerrain, overlapsAnyBuilding } from '../src/game/placementUtils';
import { resetSimRng, setSimSeed } from '../src/game/simRng';

function paintMap(state: WorldState, isLand: (tx: number, ty: number, wx: number, wy: number) => boolean): void {
  const map: WorldMap = {
    width: Math.floor(state.width / 10),
    height: Math.floor(state.height / 10),
    seed: 1,
    rivers: [],
    preset: 'continental',
    size: 'medium',
    overrides: new Map(),
  } as unknown as WorldMap;
  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      const land = isLand(tx, ty, tx * 10 + 5, ty * 10 + 5);
      map.overrides!.set(ty * map.width + tx, {
        type: land ? TerrainType.Grassland : TerrainType.DeepWater,
        elevation: land ? 50 : 0,
        moisture: 50,
        variation: 0,
      });
    }
  }
  state.worldMap = map;
}

describe('yearly world events', () => {
  it('W-81: yearly wildlife and flora spawn only on legal ground', () => {
    const animals: Array<{ state: WorldState; entity: Entity }> = [];
    const props: Array<{ state: WorldState; entity: Entity }> = [];
    for (let seed = 1; seed <= 24; seed++) {
      resetSimRng();
      setSimSeed(seed);
      const state = initGame({ skipTerrain: true, width: 1200, height: 900, seed });
      // A ring island: land only in a small inner disc and an outer band, water between.
      paintMap(state, (_tx, _ty, wx, wy) => {
        const distance = Math.hypot(wx - 600, wy - 450);
        return distance <= 120 || (distance >= 200 && distance <= 460);
      });
      const before = new Set(state.entities.map((entity) => entity.id));
      rollYearlyWorldEvent(
        state, state.entities, state.buildings, state.width, state.height, () => state.nextEntityId++,
      );
      for (const entity of state.entities) {
        if (before.has(entity.id)) continue;
        if (entity.type === EntityType.Wolf || entity.type === EntityType.Deer) animals.push({ state, entity });
        else if (entity.type === EntityType.Tree || entity.type === EntityType.Grass) props.push({ state, entity });
      }
    }

    // Guard against a vacuous pass: the fixture must actually roll spawn events.
    expect(animals.length, 'no yearly animals were spawned').toBeGreaterThan(0);
    expect(props.length, 'no yearly flora was spawned').toBeGreaterThan(0);
    for (const { state, entity } of animals) {
      expect(
        isPassableWildlifePosition(state, entity.x, entity.y),
        `${entity.type} spawned in water or on impassable ground at ${entity.x},${entity.y}`,
      ).toBe(true);
    }
    for (const { state, entity } of props) {
      expect(
        isFootprintOnBuildableTerrain(state, 32, 32, entity.x, entity.y)
        && !overlapsAnyBuilding(state.buildings, 32, 32, entity.x, entity.y),
        `${entity.type} spawned on an illegal prop site at ${entity.x},${entity.y}`,
      ).toBe(true);
    }
  });

});
