import { tickAtDailyPhase } from '../src/game/dayCycleClock';
import { indexLivingEntity } from '../src/game/entityIndex';
import { gameTick } from '../src/game/gameEngine';
/** Legal terrain for yearly wildlife and flora — obsolete on-map visitor tests retired in PR #165. */
import { afterEach, describe, expect, it } from 'vitest';
import { initGame, isPassableWildlifePosition } from '../src/game/worldGen';
import { EntityType, TerrainType, BuildingType } from '../src/game/gameTypes';
import type { Entity, WorldMap, WorldState, Building, GameEvent } from '../src/game/gameTypes';
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
  afterEach(resetSimRng);

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
        isFootprintOnBuildableTerrain(state, 32, 32, entity.x, entity.y),
        `${entity.type} spawned on unbuildable terrain at ${entity.x},${entity.y}`,
      ).toBe(true);
      expect(
        overlapsAnyBuilding(state.buildings, 32, 32, entity.x, entity.y),
        `${entity.type} overlaps a building at ${entity.x},${entity.y}`,
      ).toBe(false);
    }
  });

});

describe('Yearly event identity and strategic frontier founding', () => {
  afterEach(resetSimRng);

  describe('L34 — recurring events carry instance-unique ids', () => {
    it('does not reuse one id for the same yearly world event in different years', () => {
      const first = yearlyEventAt(100);
      const second = yearlyEventAt(200);
      expect(first).not.toBeNull();
      expect(second).not.toBeNull();
      // Same seed + same pool ⇒ the same event is picked, so this really compares
      // two instances of one event rather than two different events.
      const baseId = (id: string) => id.replace(/_\d+$/, '');
      expect(baseId(first!.id)).toBe(baseId(second!.id));
      expect(first!.id.endsWith('_100')).toBe(true);
      expect(second!.id.endsWith('_200')).toBe(true);
      expect(second!.id).not.toBe(first!.id);
    });
  });

  /** Same world, same seeded draw, different tick — the pick must be identical. */
  function yearlyEventAt(tick: number): GameEvent | null {
    const state = initGame({ skipTerrain: true });
    state.tick = tick;
    setSimSeed(9);
    return rollYearlyWorldEvent(
      state,
      [...state.entities],
      state.buildings,
      state.width,
      state.height,
      () => state.nextEntityId++,
    ).event;
  }

  describe('legacy frontier rival settlement spawning is retired', () => {
    function colonyFixture(humans: number, withHouse: boolean): { state: WorldState; allAlive: Entity[] } {
      const state = initGame({ skipTerrain: true });
      const template = state.entities.find((e) => e.alive && e.type === EntityType.Human);
      if (!template) throw new Error('the fixture world has no settler to clone');
      let id = 900_000;
      while (state.entities.filter((e) => e.alive && e.type === EntityType.Human).length < humans) {
        const clone = { ...template, id: id++ } as Entity;
        state.entities.push(clone);
        // The grids are asserted inside `gameTick`, so a fixture settler must be indexed like a real one.
        indexLivingEntity(state, clone);
      }
      if (withHouse) {
        state.buildings.push({
          id: 800_000,
          type: BuildingType.House,
          x: 400,
          y: 400,
          width: 3,
          height: 3,
          completed: true,
          occupants: [],
        } as unknown as Building);
      }
      return { state, allAlive: [...state.entities] };
    }


    it('founds only a strategic settlement at the frontier milestone, for any seed', () => {
      for (const seed of [1, 7, 42]) {
        resetSimRng();
        setSimSeed(seed);
        const { state } = colonyFixture(10, true);
        state.paused = false;
        state.tick = tickAtDailyPhase(10, 'worldEvents') - 1;
        const originalBuildingCount = state.buildings.length;

        gameTick(state);

        expect(state.rivalSettlements).toHaveLength(1);
        expect(state.entities.some((entity) => entity.faction === 'rival')).toBe(false);
        expect(state.buildings).toHaveLength(originalBuildingCount);
      }
    });


  });
});
