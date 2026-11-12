/**
 * A6: the cached static entity layer must key on a static-world revision, not `state.tick`, so a
 * settled colony stops repainting its trees, grass and buildings every tick.
 */
import { describe, expect, it } from 'vitest';
import { buildRenderSnapshot } from '../src/game/renderSnapshot';
import { buildEntityLayerKey } from '../src/game/entityLayer';
import { getHourOfDay } from '../src/game/dayCycle';
import { Season, type WorldState } from '../src/game/gameTypes';
import { BuildingType, type Building } from '../src/game/buildings';
import type { ViewState } from '../src/game/viewState';

const CW = 800;
const CH = 600;

function staticBuilding(overrides: Partial<Building> = {}): Building {
  return {
    id: 1,
    type: BuildingType.House,
    x: 100,
    y: 100,
    width: 32,
    height: 32,
    occupants: [],
    level: 1,
    constructionProgress: 100,
    completed: true,
    health: 100,
    maxHealth: 100,
    spriteScale: 1,
    buildAnimTimer: 0,
    ...overrides,
  } as Building;
}

function testWorld(overrides: Partial<WorldState> = {}): WorldState {
  return {
    tick: 100,
    paused: false,
    season: Season.Spring,
    year: 1,
    dayInYear: 1,
    width: 128,
    height: 128,
    floatingTexts: [],
    bigNews: [],
    deathParticles: [],
    visitorGroups: [],
    pendingRaidEvents: [],
    pendingOutgoingRaidEvents: [],
    buildings: [],
    entities: [],
    ...overrides,
  } as unknown as WorldState;
}

function testView(overrides: Partial<ViewState> = {}): ViewState {
  return {
    camera: { x: 100, y: 100, zoom: 1 },
    screenShake: 0,
    showGrid: false,
    showPaths: false,
    showLogistics: false,
    ...overrides,
  } as unknown as ViewState;
}

function layerKey(world: WorldState, view: ViewState = testView()): string {
  return buildEntityLayerKey(buildRenderSnapshot(world, view), CW, CH);
}

describe('static entity layer cache identity', () => {
  it('keeps the layer while only the tick advances', () => {
    const settled = testWorld({ buildings: [staticBuilding()] });

    expect(layerKey(testWorld({ ...settled, tick: 101 }))).toBe(layerKey(settled));
  });

  it('keeps the layer while only the hour advances', () => {
    // 12 ticks per hour, so these two ticks are in different hours.
    expect(getHourOfDay(100)).not.toBe(getHourOfDay(112));
    expect(layerKey(testWorld({ tick: 112 }))).toBe(layerKey(testWorld({ tick: 100 })));
  });

  it('keeps the layer on a bare tick even while a construction site exists', () => {
    const site = staticBuilding({ completed: false, constructionProgress: 40 });

    expect(layerKey(testWorld({ tick: 101, buildings: [site] })))
      .toBe(layerKey(testWorld({ tick: 100, buildings: [site] })));
  });

  it('repaints once when a construction site actually gains progress', () => {
    const site = staticBuilding({ completed: false, constructionProgress: 40 });
    const before = layerKey(testWorld({ buildings: [site] }));

    expect(layerKey(testWorld({ buildings: [staticBuilding({ completed: false, constructionProgress: 41 })] })))
      .not.toBe(before);
  });

  it('repaints when a building finishes or its workers change', () => {
    const done = staticBuilding({ completed: false, constructionProgress: 99 });
    const before = layerKey(testWorld({ buildings: [done] }));

    expect(layerKey(testWorld({ buildings: [staticBuilding()] }))).not.toBe(before);
    expect(layerKey(testWorld({ buildings: [staticBuilding({ occupants: [7] })] })))
      .not.toBe(layerKey(testWorld({ buildings: [staticBuilding()] })));
  });

  it('repaints when the day advances, so grass and camp countdowns refresh', () => {
    const camp = { id: 'visitor-1', campX: 200, campY: 200, daysLeft: 2 };
    const today = testWorld({ visitorGroups: [camp] as unknown as WorldState['visitorGroups'] });
    const tomorrow = testWorld({
      dayInYear: 2,
      visitorGroups: [{ ...camp, daysLeft: 1 }] as unknown as WorldState['visitorGroups'],
    });

    expect(layerKey(tomorrow)).not.toBe(layerKey(today));
  });

  it('reuses the built static revision for a camera-only snapshot rebuild', () => {
    const buildings = [staticBuilding()];
    let indexReads = 0;
    const tracked = new Proxy(buildings, {
      get(target, property, receiver) {
        if (typeof property === 'string' && /^\d+$/.test(property)) indexReads++;
        return Reflect.get(target, property, receiver);
      },
    });
    const world = testWorld({ buildings: tracked as unknown as Building[] });
    const view = testView();

    const first = buildRenderSnapshot(world, view);
    expect(indexReads).toBeGreaterThan(0);
    const readsAfterFirst = indexReads;

    // A camera move rebuilds the snapshot, not the world: the revision must not be enumerated again.
    const moved = buildRenderSnapshot(
      world,
      { ...view, camera: { x: 140, y: 100, zoom: 1 } } as ViewState,
    );
    expect(moved.staticLayerRevision).toBe(first.staticLayerRevision);
    expect(indexReads).toBe(readsAfterFirst);
  });
});
