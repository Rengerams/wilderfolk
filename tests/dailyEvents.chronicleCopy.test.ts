/**
 * Chronicle copy and retention: one season line per festival, however its name is spelled, and one
 * line per label on a day that finishes a run of buildings.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createBuilding, initGame } from '../src/game/worldGen';
import { BUILDING_CONFIGS, BuildingType, Season } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import type { TickContext } from '../src/game/simulation/simulationTypes';
import { tickDailyBuildingEconomy } from '../src/game/dailyBuildingEconomy';
import { tickDailyWorldEvents } from '../src/game/dailyWorldEvents';
import { invalidateEntityByIdMap } from '../src/game/entityIndex';
import { isPlayerHuman } from '../src/game/playerHuman';
import { DAYS_PER_YEAR, TICKS_PER_DAY } from '../src/game/dayCycle';

const worldEventsSource = readFileSync(
  fileURLToPath(new URL('../src/game/dailyWorldEvents.ts', import.meta.url)),
  'utf8',
);

/** A day in the far-future calendar, so no festival from world gen is already running. */
function dayTick(dayInYear: number): number {
  return (900 * DAYS_PER_YEAR + dayInYear) * TICKS_PER_DAY;
}

function tickContext(world: WorldState, season: Season): TickContext {
  const alive = world.entities.filter((entity) => entity.alive);
  return {
    width: world.width,
    height: world.height,
    hourOfDay: 0,
    season,
    grassMult: 1,
    reproMult: 1,
    winterPenalty: 1,
    canHeat: true,
    byType: { human: alive } as unknown as TickContext['byType'],
    aliveEntities: alive,
    newEntities: [],
    updatedBuildings: world.buildings,
    roadBuildings: [],
    playerHumans: alive.filter(isPlayerHuman),
    entityById: new Map(alive.map((entity) => [entity.id, entity])),
    buildingById: new Map(world.buildings.map((building) => [building.id, building])),
    predators: [],
  };
}

describe('a festival name is never doubled in the seasonal chronicle line', () => {
  // The seasonal writer owns days 3-5 of each season; day 3 is the first one it can start on.
  const seasonStarts = [0, 90, 180, 270];
  const festivalDays = seasonStarts.flatMap((start) =>
    [3, 4, 5].map((offset) => ({ dayInYear: start + offset, tick: dayTick(start + offset) })),
  );

  it.each(festivalDays)('day $dayInYear names one festival start', ({ tick }) => {
    const world = initGame();
    world.tick = tick;

    tickDailyWorldEvents(world, tickContext(world, Season.Spring), [], { humans: 12 } as never);

    const started = world.eventLog.filter((entry) => / began in the village$/.test(entry.message));
    expect(started).toHaveLength(1);
    expect(started[0]!.message).not.toMatch(/\bfestival\b.*\bfestival\b/i);
  });

  it('writes both festival paths from one message shape, so neither can append the word again', () => {
    // Two writers build the line (the seasonal and the seeded one); this pins the shape they share.
    expect(worldEventsSource.match(/began in the village`/g)).toHaveLength(2);
    expect(worldEventsSource).not.toMatch(/festival began in the village/);
    expect(worldEventsSource).not.toMatch(/festival\$\{/);
  });
});

describe('a day of building completions is one chronicle line per label', () => {
  /** Three Walls and one Leader's House a hair from finishing, so today's pass completes them all. */
  function worldWithSitesNearCompletion(): WorldState {
    const world = initGame({ seed: 4242 });
    world.tick = dayTick(40);
    world.season = Season.Spring;
    const nearlyDone = (id: number, type: BuildingType, x: number) => {
      const site = createBuilding(type, x, 300, id);
      site.constructionProgress = 99;
      site.completed = false;
      return site;
    };
    world.buildings = [
      nearlyDone(900, BuildingType.Wall, 300),
      nearlyDone(901, BuildingType.Wall, 380),
      nearlyDone(902, BuildingType.Wall, 460),
      nearlyDone(903, BuildingType.LeaderHouse, 560),
    ];
    invalidateEntityByIdMap(world);
    return world;
  }

  function completions(world: WorldState): string[] {
    return world.eventLog.filter((entry) => entry.type === 'building').map((entry) => entry.message);
  }

  it('collapses a run of the same label and keeps a single completion, in one pass', () => {
    const world = worldWithSitesNearCompletion();
    expect(world.buildings.every((building) => building.constructionProgress < 100)).toBe(true);

    tickDailyBuildingEconomy(world, tickContext(world, Season.Spring), [] as Entity[]);

    expect(
      world.buildings.every((building) => building.completed),
      'the fixture sites must actually finish today',
    ).toBe(true);
    expect(completions(world).sort()).toEqual([
      `${BUILDING_CONFIGS[BuildingType.LeaderHouse].label} completed`,
      `${BUILDING_CONFIGS[BuildingType.Wall].label} completed ×3`,
    ]);
  });

  it('lists the labels in the order the buildings finished', () => {
    const world = worldWithSitesNearCompletion();
    // The Leader's House is updated first, so the Walls have all finished by the time it does.
    world.buildings = [world.buildings[3]!, ...world.buildings.slice(0, 3)];

    tickDailyBuildingEconomy(world, tickContext(world, Season.Spring), [] as Entity[]);

    // The log is newest-first, so the head is the last line written.
    expect(completions(world)).toEqual([
      `${BUILDING_CONFIGS[BuildingType.Wall].label} completed ×3`,
      `${BUILDING_CONFIGS[BuildingType.LeaderHouse].label} completed`,
    ]);
  });
});
