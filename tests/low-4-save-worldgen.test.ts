/**
 * Low-tier regression batch 4 — save/load cross-cutting items (X1/X5) plus the
 * worldGen / daily lows from the 2026-09-13 simulation-logic audit:
 * L12 (dead couple-split repair), L13/L14 (seasonal festival guarantee),
 * L72 (duplicate Grassland branch), L73 (always-true daily guards),
 * L80 (InitGameOptions.width/height + empty entityByType),
 * L81 (wildlife log throttle), L82 (sufficientGrass), L83 (dead final guard).
 *
 * Each test is written against a real function or fixture; the ones that pin a
 * deleted dead branch say so in their name.
 */
import { describe, expect, it } from 'vitest';
import { gameTick, initGame } from '../src/game/gameEngine';
import {
  EntityType,
  MapPreset,
  MapSize,
  TERRAIN_TILE_SIZE,
  TerrainType,
} from '../src/game/gameTypes';
import { createInitialView } from '../src/game/viewState';
import { buildSaveData, loadGameFromParsed, parseSaveJson } from '../src/game/saveLoad';
import { createImmigrantSettler, replenishDepletedWildlife } from '../src/game/worldGen';
import { generateWorldMap } from '../src/game/terrainGen';
import { rebakeTerrainGrids, setTileOverride, tileTypeAt } from '../src/game/terrain/terrainGrid';
import { TICKS_PER_DAY } from '../src/game/dayCycle';

function countType(state: ReturnType<typeof initGame>, type: EntityType): number {
  return state.entities.filter((e) => e.alive && e.type === type).length;
}

describe('saveLoad cross-cutting items', () => {
  it('does not apply legacy migrations that the exact-version gate makes unreachable', () => {
    const world = initGame({ seed: 12, size: MapSize.Medium });
    const saved = buildSaveData(world, createInitialView(world.width, world.height));

    // The gate rejects every other version, so `loadGameFromParsed` can only ever see this
    // build's version — the v0.4 … v0.5.1 branches that used to run there are deleted.
    expect(parseSaveJson(JSON.stringify({ ...saved, _version: '0.4' })).valid).toBe(false);

    const forged = { ...saved, _version: '0.4', foodSpoilageRate: 0.5 };
    const loaded = loadGameFromParsed(forged);
    expect(loaded).not.toBeNull();
    // The removed `v0.4` branch forced 0.03 and stamped the migration id.
    expect(loaded!.world.foodSpoilageRate).toBe(0.5);
    expect(loaded!.world.appliedSaveMigrations ?? []).not.toContain('v0.4');
  });

  it('treats a same-version save without _ticksPerDay as the current day length', () => {
    const world = initGame({ seed: 9, size: MapSize.Medium });
    world.tick = 10 * TICKS_PER_DAY;
    const mother = world.entities.find((e) => e.type === EntityType.Human)!;
    mother.pregnant = true;
    mother.pregnancyDueProgress = 1200;

    const saved = buildSaveData(world, createInitialView(world.width, world.height));
    const trimmed = JSON.parse(JSON.stringify(saved)) as Record<string, unknown>;
    delete trimmed._ticksPerDay;

    const parsed = parseSaveJson(JSON.stringify(trimmed));
    expect(parsed.valid).toBe(true);
    if (!parsed.valid || !parsed.parsed) throw new Error('save invalid');

    const loaded = loadGameFromParsed(parsed.parsed);
    expect(loaded).not.toBeNull();
    // The old default (LEGACY_TICKS_PER_DAY = 24) rescaled the calendar and every absolute
    // deadline by TICKS_PER_DAY / 24 = 3.
    expect(loaded!.world.tick).toBe(10 * TICKS_PER_DAY);
    const loadedMother = loaded!.world.entities.find((e) => e.id === mother.id)!;
    expect(loadedMother.pregnancyDueProgress).toBe(1200);
  });
});

describe('worldGen lows', () => {
  it('L80 — InitGameOptions.width/height size the generated world map', () => {
    const world = initGame({ width: 640, height: 480, seed: 99 });
    expect(world.width).toBe(640);
    expect(world.height).toBe(480);
    expect(world.worldMap?.width).toBe(Math.ceil(640 / TERRAIN_TILE_SIZE));
    expect(world.worldMap?.height).toBe(Math.ceil(480 / TERRAIN_TILE_SIZE));
  });

  it('L80 — initGame fills entityByType instead of leaving defined-but-empty buckets', () => {
    const world = initGame({ seed: 3, size: MapSize.Medium });
    const livingGrass = countType(world, EntityType.Grass);
    expect(livingGrass).toBeGreaterThan(0);
    // `entityByType` is optional on the save-compatibility surface; this test is exactly the
    // claim that a freshly generated world defines it.
    expect(world.entityByType).toBeTruthy();
    const byType = world.entityByType!;
    expect(byType[EntityType.Grass].length).toBe(livingGrass);
    expect(byType[EntityType.Rabbit].length).toBe(countType(world, EntityType.Rabbit));
  });

  it('L81 — the wildlife replenish log throttle only advances when a message is logged', () => {
    const world = initGame({ seed: 11, size: MapSize.Medium });
    const depleted = {
      ...world.wildlifeCounts,
      grass: 10, rabbits: 0, deer: 0, foxes: 0, wolves: 0,
    };
    world.wildlifeCounts = { ...depleted };
    world.lastWildlifeReplenishLogDay = -999;

    const logsBefore = world.eventLog.length;
    expect(replenishDepletedWildlife(world)).toBe(true);
    expect(world.eventLog.length).toBeGreaterThan(logsBefore);
    const loggedDay = world.lastWildlifeReplenishLogDay;

    // The next day the frontier is depleted again, but the 40-day gap has not passed: no
    // message is due, so the throttle must stay where the last message left it.
    world.wildlifeCounts = { ...depleted };
    world.dayInYear += 1;
    const logsBeforeSecond = world.eventLog.length;
    replenishDepletedWildlife(world);
    expect(world.eventLog.length).toBe(logsBeforeSecond);
    expect(world.lastWildlifeReplenishLogDay).toBe(loggedDay);
  });

  it('L82 — prey do not repopulate when the grass refill actually placed nothing', () => {
    const world = initGame({ seed: 33, size: MapSize.Medium });
    // A 40px world puts every grass patch centre out of bounds (`spawnGrassPatch` bounds-checks
    // `state.width/height`), while a passable tile grid still lets wildlife spawn — so this
    // isolates "the grass credit assumed the full 98 but nothing grew".
    world.width = 40;
    world.height = 40;
    // A passable tile grid still lets wildlife spawn. Teraforge keeps no per-tile grid, so the
    // "grassland everywhere" the old fixture built is one override per tile.
    if (world.worldMap) {
      const map = world.worldMap;
      for (let ty = 0; ty < map.height; ty++) {
        for (let tx = 0; tx < map.width; tx++) {
          setTileOverride(map, tx, ty, {
            type: TerrainType.Grassland, elevation: 30, moisture: 50, variation: 0,
          });
        }
      }
      rebakeTerrainGrids(map, { startTx: 0, endTx: map.width - 1, startTy: 0, endTy: map.height - 1 });
    }
    world.entities = world.entities.filter((e) => e.type !== EntityType.Grass);
    world.wildlifeCounts = {
      ...world.wildlifeCounts,
      grass: 0, rabbits: 10, deer: 10, foxes: 14, wolves: 6,
    };

    const rabbitsBefore = countType(world, EntityType.Rabbit);
    expect(replenishDepletedWildlife(world)).toBe(true);
    expect(countType(world, EntityType.Rabbit)).toBe(rabbitsBefore);
  });

  it('L83 — replenishDepletedWildlife reports false only when nothing needed refilling', () => {
    const world = initGame({ seed: 55, size: MapSize.Medium });
    world.wildlifeCounts = {
      ...world.wildlifeCounts,
      grass: 200, rabbits: 60, deer: 25, foxes: 20, wolves: 10,
    };
    const logsBefore = world.eventLog.length;
    expect(replenishDepletedWildlife(world)).toBe(false);
    expect(world.eventLog.length).toBe(logsBefore);

    world.wildlifeCounts = {
      ...world.wildlifeCounts,
      grass: 10, rabbits: 0, deer: 0, foxes: 0, wolves: 0,
    };
    expect(replenishDepletedWildlife(world)).toBe(true);
  });
});

describe('daily lows', () => {
  it('L12 — createImmigrantSettler already caps a family at the passed slot count', () => {
    const world = initGame({ seed: 77, size: MapSize.Medium });
    // With a single free slot the family roll is impossible, so the "admit only 1 of a couple"
    // repair in tickImmigration could never run: the cap is applied at the source.
    for (let i = 0; i < 120; i++) {
      expect(createImmigrantSettler(world, 600, 450, 1).length).toBe(1);
    }
    let sawCouple = false;
    for (let i = 0; i < 300 && !sawCouple; i++) {
      sawCouple = createImmigrantSettler(world, 600, 450, 2).length === 2;
    }
    expect(sawCouple).toBe(true);
  });

  it('L13/L14 — a random festival no longer cancels the seasonal festival for a whole season', () => {
    const world = initGame({ seed: 4242, size: MapSize.Medium });
    // Day 5 of Spring (the seasonal window starts at day 3) with a random festival still
    // running: the seasonal festival must defer, not be lost.
    world.tick = 5 * TICKS_PER_DAY - 1;
    world.festival = { active: true, name: 'Harvest Festival', daysLeft: 30 };
    const blocked = gameTick(world);
    expect(blocked.festival?.name).toBe('Harvest Festival');

    // The random festival ends; the seasonal festival still starts later in the season.
    blocked.festival = null;
    blocked.tick = 6 * TICKS_PER_DAY - 1;
    const later = gameTick(blocked);
    expect(later.festival?.name).toBe('Spring Revel');
  });

  it('L73 — the daily layer runs its social/chronicle block at tick 0 too', () => {
    const world = initGame({ seed: 8, size: MapSize.Medium });
    // gameTick increments first, so tick -1 becomes the tick-0 boundary the removed guards
    // used to treat as "initialization" and skip. 36 worked ticks = 12h must raise fatigue.
    world.tick = -1;
    for (const entity of world.entities) {
      if (entity.type === EntityType.Human) entity.scheduleWorkedTicksToday = 36;
    }
    const after = gameTick(world);
    const humans = after.entities.filter((e) => e.type === EntityType.Human);
    expect(humans.length).toBeGreaterThan(0);
    expect(Math.max(...humans.map((h) => h.scheduleFatigue ?? 0))).toBeGreaterThan(0);
  });
});

describe('terrainGen lows', () => {
  it('L72 — the fallback biome is still Grassland after the no-op dry branch was removed', () => {
    const map = generateWorldMap(MapSize.Medium, MapPreset.Arabia, 1234);
    let grassland = 0;
    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = 0; tx < map.width; tx++) {
        if (tileTypeAt(map, tx, ty) === TerrainType.Grassland) grassland++;
      }
    }
    expect(grassland).toBeGreaterThan(0);
  });
});
