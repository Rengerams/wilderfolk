/**
 * F6 of the 2026-09-16 lifecycle/social audit (`docs/private/audits/2026-09-16/sim-lifecycle-social.md`):
 * the daily immigration spawn pushed the newcomer into `state.entities` / `allAlive` and only updated
 * the id maps, never `mobileGrid`. The daily layer runs **after** the tick's
 * `assertSpatialGridInvariants`, so the newcomer stayed invisible to social/hunt grid queries for the
 * rest of the tick (it self-heals on the next tick's reconcile). The spawn now goes through the
 * canonical `pushNewEntity` path, exactly as births do.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { BuildingType, EntityType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import type { PopulationCounts } from '../src/game/entityCounts';
import type { TickContext } from '../src/game/simulation/simulationTypes';
import { EntitySpatialGrid } from '../src/game/spatialGrid';
import { tickDailyPopulation } from '../src/game/dailyPopulation';
import { getSimRng, resetSimRng, setSimSeed } from '../src/game/simRng';
import { TICKS_PER_DAY } from '../src/game/dayCycle';

const WIDTH = 1200;
const HEIGHT = 900;

function settler(id: number, x: number, y: number): Entity {
  return {
    id,
    type: EntityType.Human,
    name: `Settler${id}`,
    alive: true,
    x,
    y,
    energy: 100,
    maxEnergy: 100,
    residenceBuildingId: 10,
  } as Entity;
}

function house(): Building {
  return {
    id: 10,
    type: BuildingType.House,
    x: 560,
    y: 420,
    width: 40,
    height: 40,
    occupants: [1, 2],
    level: 1,
    constructionProgress: 1,
    completed: true,
    health: 100,
    maxHealth: 100,
    spriteScale: 1,
    buildAnimTimer: 0,
  } as Building;
}

function fixture(): {
  state: WorldState;
  ctx: TickContext;
  allAlive: Entity[];
  counts: PopulationCounts;
  mobileGrid: EntitySpatialGrid;
  before: Set<number>;
} {
  const home = house();
  const founders = [settler(1, 560, 440), settler(2, 600, 420)];
  const allAlive = [...founders];
  const state = {
    entities: [...allAlive, home],
    buildings: [home],
    tick: TICKS_PER_DAY,
    year: 0,
    dayInYear: 1,
    width: WIDTH,
    height: HEIGHT,
    // High reputation + one completed house give a ~91 % daily immigration chance, so a seed whose
    // first `dailyPopulation` draw passes is easy to find and the fixture stays deterministic.
    villageReputation: 100,
    humanPopulation: founders.length,
    nextEntityId: 100,
    eventLog: [],
    notifications: [],
    bigNews: [],
    floatingTexts: [],
    nextFloatingTextId: 1,
    storyFlags: {},
    pendingStoryEvents: [],
    resources: {},
  } as unknown as WorldState;

  const mobileGrid = new EntitySpatialGrid(WIDTH, HEIGHT, 128);
  for (const e of allAlive) mobileGrid.update(e);

  const ctx = {
    width: WIDTH,
    height: HEIGHT,
    newEntities: [],
    updatedBuildings: [home],
    entityById: new Map(allAlive.map((e) => [e.id, e])),
    mobileGrid,
  } as unknown as TickContext;

  return {
    state,
    ctx,
    allAlive,
    counts: { humans: founders.length } as unknown as PopulationCounts,
    mobileGrid,
    before: new Set(state.entities.map((e) => e.id)),
  };
}

/** A seed whose first `dailyPopulation` draw admits a settler at this fixture's chance. */
function seedAdmittingSettler(): number {
  for (let seed = 1; seed <= 500; seed++) {
    setSimSeed(seed);
    if (getSimRng('dailyPopulation')() < 0.9) return seed;
  }
  throw new Error('fixture: no seed admits a settler');
}

afterEach(() => {
  resetSimRng();
});

describe('daily immigration and the spatial grid (F6)', () => {
  it('indexes an admitted settler in mobileGrid during the same tick', () => {
    const { state, ctx, allAlive, counts, mobileGrid, before } = fixture();

    setSimSeed(seedAdmittingSettler());
    tickDailyPopulation(state, ctx, allAlive, counts);

    const newcomer = allAlive.find((e) => !before.has(e.id));
    expect(newcomer).toBeDefined();

    const foundInGrid: number[] = [];
    mobileGrid.forEachInRadius(newcomer!.x, newcomer!.y, 8, (e) => foundInGrid.push(e.id));
    expect(foundInGrid).toContain(newcomer!.id);
    expect(ctx.newEntities).toContain(newcomer);
  });

  it('still shows the newcomer to the id maps and the daily event log', () => {
    const { state, ctx, allAlive, counts, before } = fixture();

    setSimSeed(seedAdmittingSettler());
    tickDailyPopulation(state, ctx, allAlive, counts);

    const newcomer = allAlive.find((e) => !before.has(e.id));
    expect(newcomer).toBeDefined();
    expect(state.entities).toContain(newcomer);
    expect(ctx.entityById.get(newcomer!.id)).toBe(newcomer);
    expect(state.eventLog.some((e) => e.message.includes('arrived'))).toBe(true);
  });
});
