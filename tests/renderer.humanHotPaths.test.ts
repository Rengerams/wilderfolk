/**
 * A7 render hot paths: the sleeper cull indexes buildings once per tick instead of scanning the list
 * per settler, and the status-icon inputs are rebuilt only when a new snapshot arrives.
 */
import { describe, expect, it, vi } from 'vitest';
import { building, human } from '../src/test/factories';
import {
  BuildingType,
  EntityType,
  emptyEntityByType,
  type Building,
  type Entity,
  type EntityByType,
} from '../src/game/gameTypes';
import { TICKS_PER_HOUR } from '../src/game/dayCycleClock';
import { resetEntityCaches, updateCachedEntities } from '../src/game/renderer/entityCache';
import { drawHumans, resetHumanRenderCaches } from '../src/game/renderer/humans';
import type { RenderSnapshot } from '../src/game/renderSnapshot';

const CANVAS_W = 1000;
const CANVAS_H = 800;
const CAMERA = { x: 500, y: 500, zoom: 1, targetX: 500, targetY: 500, targetZoom: 1 };
/** 23:00 — the night window that makes a resident at their house a sleeper. */
const NIGHT_TICK = 23 * TICKS_PER_HOUR;
/** Buildings ahead of the homes, so a per-settler `find` has to walk the list. */
const FILLER_COUNT = 60;

interface Fixture {
  buildings: Building[];
  byType: EntityByType;
}

function countedBuildings(buildings: Building[], counter: { reads: number }): Building[] {
  return new Proxy(buildings, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && /^\d+$/.test(prop)) counter.reads++;
      return Reflect.get(target, prop, receiver);
    },
  });
}

function sleeperFixture(count: number): Fixture {
  const fillers: Building[] = [];
  for (let i = 0; i < FILLER_COUNT; i++) {
    fillers.push(building(200 + i, BuildingType.Store, { x: 5000 + i * 10, y: 5000 }));
  }
  const homes: Building[] = [];
  const settlers: Entity[] = [];
  for (let i = 0; i < count; i++) {
    const home = building(1 + i, BuildingType.House, {
      x: 400 + (i % 10) * 6,
      y: 400 + Math.floor(i / 10) * 6,
    });
    homes.push(home);
    settlers.push(human(10 + i, { x: home.x, y: home.y, residenceBuildingId: home.id }));
  }
  const byType = emptyEntityByType();
  byType[EntityType.Human] = settlers;
  return { buildings: [...fillers, ...homes], byType };
}

function snapshotFor(buildings: Building[]): RenderSnapshot {
  return {
    tick: NIGHT_TICK,
    hourOfDay: 23,
    buildings,
    camera: CAMERA,
    worldMap: null,
    spotlightLore: undefined,
    selectedEntity: null,
    selectedEntityIds: [],
    villageLeaderId: null,
    workSchedule: undefined,
    unlockedTechs: [],
    hasBlacksmith: false,
    villageForge: undefined,
  } as unknown as RenderSnapshot;
}

function stubContext(paint: ReturnType<typeof vi.fn>): CanvasRenderingContext2D {
  return new Proxy({}, { get: () => paint, set: () => true }) as CanvasRenderingContext2D;
}

function drawSleepers(fixture: Fixture): { counter: { reads: number }; paint: ReturnType<typeof vi.fn> } {
  const counter = { reads: 0 };
  const counted = countedBuildings(fixture.buildings, counter);
  const paint = vi.fn();
  resetEntityCaches();
  resetHumanRenderCaches();
  updateCachedEntities(fixture.byType, null, NIGHT_TICK, CAMERA, 2000, 2000, CANVAS_W, CANVAS_H);
  drawHumans(stubContext(paint), snapshotFor(counted), CANVAS_W, CANVAS_H);
  return { counter, paint };
}

describe('render hot paths — settlers', () => {
  it('indexes the building list instead of scanning it per sleeper', () => {
    const small = drawSleepers(sleeperFixture(20));
    const large = drawSleepers(sleeperFixture(80));

    // All sleepers are culled from the moving pass, so the drawing path itself stays untouched.
    expect(small.paint).not.toHaveBeenCalled();
    expect(large.paint).not.toHaveBeenCalled();
    // 60 extra homes cost at most four index passes; the old per-settler scan cost ~70 reads each.
    expect(large.counter.reads).toBeLessThan(small.counter.reads + 400);
  });

  it('reuses the status-icon context until a new snapshot arrives', () => {
    const fixture = sleeperFixture(20);
    const counter = { reads: 0 };
    const counted = countedBuildings(fixture.buildings, counter);
    const state = snapshotFor(counted);
    const paint = vi.fn();
    const ctx = stubContext(paint);
    resetEntityCaches();
    resetHumanRenderCaches();
    updateCachedEntities(fixture.byType, null, NIGHT_TICK, CAMERA, 2000, 2000, CANVAS_W, CANVAS_H);

    drawHumans(ctx, state, CANVAS_W, CANVAS_H);
    const firstFrameReads = counter.reads;
    counter.reads = 0;
    drawHumans(ctx, state, CANVAS_W, CANVAS_H);

    expect(firstFrameReads).toBeGreaterThan(0);
    expect(counter.reads).toBe(0);
    expect(paint).not.toHaveBeenCalled();
  });
});
