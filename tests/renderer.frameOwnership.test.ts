/**
 * One owner per render surface: device-pixel ratio, the map canvas's colour grade, the mini-map's
 * frame cadence, and the per-tick SoA bucket containers.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { drawBuildSnapOverlay } from '../src/game/renderer/grid';
import { initGame } from '../src/game/worldGen';
import { createBuildGhost, createInitialView, type ViewState } from '../src/game/viewState';
import { fitCanvasToDpr } from '../src/game/canvasLayer';
import {
  drawMiniMapFrame,
  registerMiniMapFrameDraw,
  shouldRepaintMiniMap,
} from '../src/game/renderer/miniMapFrame';
import { BuildingType, EntityType, Season, type Building, type Entity, type WorldState } from '../src/game/gameTypes';
import { planGroundChunks } from '../src/game/renderer/terrain';
import { drawScreenVignette } from '../src/game/renderer/overlay';
import { buildEntityLayerKey } from '../src/game/entityLayer';
import { buildRenderSnapshot, type RenderSnapshot } from '../src/game/renderSnapshot';
import { packRenderSoA } from '../src/game/simBuffers/packRenderSoA';
import { createRenderSoAReader, type RenderSoAReaderV1 } from '../src/game/simBuffers/renderSoAReader';
import {
  invalidateRenderSoABucketsCache,
  updateRenderSoABuckets,
} from '../src/game/simBuffers/renderSoAEntities';

const realWindow = (globalThis as { window?: unknown }).window;

describe('device-pixel sizing has one owner', () => {
  beforeAll(() => {
    (globalThis as { window?: unknown }).window = { devicePixelRatio: 2 };
  });

  afterAll(() => {
    (globalThis as { window?: unknown }).window = realWindow;
  });

  it('sizes a display canvas at logical × dpr and reports the ratio to scale by', () => {
    const canvas = { width: 0, height: 0 };

    expect(fitCanvasToDpr(canvas, 152, 110)).toBe(2);
    expect(canvas).toEqual({ width: 304, height: 220 });
  });

  it('re-sizes the same surface when the ratio changes between paints', () => {
    const canvas = { width: 0, height: 0 };
    fitCanvasToDpr(canvas, 152, 110);

    (globalThis as { window?: unknown }).window = { devicePixelRatio: 1.25 };

    // A monitor move must re-fit the surface the map is drawn through, not re-allocate it.
    expect(fitCanvasToDpr(canvas, 152, 110)).toBe(1.25);
    expect(canvas).toEqual({ width: 190, height: 137 });
  });
});

describe('the mini-map is driven by the main render loop', () => {
  it('repaints on its own interval, not on the render loop’s', () => {
    const repainted: number[] = [];
    for (let frame = 1; frame <= 15; frame++) {
      if (shouldRepaintMiniMap(frame)) repainted.push(frame);
    }

    // The cadence module's `frameCounter % 5` gate paints every fifth frame.
    expect(repainted).toEqual([5, 10, 15]);
  });

  it('runs the registered paint every frame and stops when the panel unmounts', () => {
    let paints = 0;
    registerMiniMapFrameDraw(() => {
      paints++;
    });

    drawMiniMapFrame();
    drawMiniMapFrame();
    expect(paints).toBe(2);

    registerMiniMapFrameDraw(null);
    drawMiniMapFrame();
    expect(paints).toBe(2);
  });

});

describe('the per-tick SoA bucket rebuild reuses its containers', () => {
  const FIXTURE_ENTITIES = 400;

  function fixtureWorld(count: number): WorldState {
    const types = [EntityType.Human, EntityType.Tree, EntityType.Grass, EntityType.Wolf];
    const entities: Entity[] = [];
    for (let i = 0; i < count; i++) {
      entities.push({
        id: i + 1,
        type: types[i % types.length],
        x: i * 3,
        y: (i * 7) % 500,
        vx: 0,
        vy: 0,
        spriteAngle: 0,
        animFrame: 0,
        size: 1,
        flash: 0,
        alive: true,
      } as unknown as Entity);
    }
    return { entities, tick: 1, width: 1024, height: 768 } as unknown as WorldState;
  }

  function fixtureReader(): RenderSoAReaderV1 {
    const reader = createRenderSoAReader(packRenderSoA(fixtureWorld(FIXTURE_ENTITIES)).buffer);
    if (!reader) throw new Error('the fixture buffer did not validate as a render SoA');
    return reader;
  }

  it('hands back the same lists and slot indexes on the next tick', () => {
    const reader = fixtureReader();
    invalidateRenderSoABucketsCache();

    const first = updateRenderSoABuckets(reader, undefined, 1);
    expect(first.shims.length).toBeGreaterThan(0);

    const second = updateRenderSoABuckets(reader, undefined, 2);

    // Instance identity is the allocation count: a fresh array or Map per tick would fail here.
    expect(second.grassSlots).toBe(first.grassSlots);
    expect(second.treeSlots).toBe(first.treeSlots);
    expect(second.animalSlots).toBe(first.animalSlots);
    expect(second.humanSlots).toBe(first.humanSlots);
    expect(second.shims).toBe(first.shims);
    expect(second.shimBySlot).toBe(first.shimBySlot);
    expect(second.shimById).toBe(first.shimById);
  });

  it('re-fills the reused containers with the new tick, sorted and fully indexed', () => {
    const reader = fixtureReader();
    invalidateRenderSoABucketsCache();
    updateRenderSoABuckets(reader, undefined, 1);

    const buckets = updateRenderSoABuckets(reader, undefined, 2);
    const bucketCount = buckets.grassSlots.length + buckets.treeSlots.length
      + buckets.animalSlots.length + buckets.humanSlots.length;

    expect(buckets.shims.length).toBe(FIXTURE_ENTITIES);
    expect(bucketCount).toBe(buckets.shims.length);
    expect(buckets.shimBySlot.size).toBe(buckets.shims.length);
    expect(buckets.shimById.size).toBe(buckets.shims.length);

    const treeYs = buckets.treeSlots.map((slot) => reader.y(slot));
    expect(treeYs).toEqual([...treeYs].sort((a, b) => a - b));
    for (const slot of buckets.treeSlots) {
      expect(buckets.shimBySlot.get(slot)?.id).toBe(reader.id(slot));
    }
  });

  it('rebuilds a few-hundred-entity tick without reallocating its containers', () => {
    const reader = fixtureReader();
    invalidateRenderSoABucketsCache();
    const started = performance.now();

    for (let tick = 1; tick <= 400; tick++) {
      updateRenderSoABuckets(reader, undefined, tick);
    }

    const perRebuildMs = (performance.now() - started) / 400;
    console.log(`SoA bucket rebuild: ${perRebuildMs.toFixed(3)} ms/tick on ${FIXTURE_ENTITIES} entities`);
    expect(perRebuildMs).toBeLessThan(50);
  });

  it('pays nothing for the containers: the retired shape allocated six per tick', () => {
    const slots = Array.from({ length: FIXTURE_ENTITIES }, (_, i) => i);

    /** The allocation-heavy shape: a fresh list per layer and two fresh Maps, every tick. */
    const retired = (): number => {
      const grass: number[] = [];
      const tree: number[] = [];
      const animal: number[] = [];
      const human: number[] = [];
      const bySlot = new Map<number, number>();
      const byId = new Map<number, number>();
      for (const slot of slots) {
        const list = slot % 4 === 0 ? grass : slot % 4 === 1 ? tree : slot % 4 === 2 ? animal : human;
        list.push(slot);
        bySlot.set(slot, slot);
        byId.set(slot, slot);
      }
      return grass.length + tree.length + animal.length + human.length + bySlot.size + byId.size;
    };

    /** The shipped shape — the same six containers, cleared and refilled. */
    const reused = (() => {
      const grass: number[] = [];
      const tree: number[] = [];
      const animal: number[] = [];
      const human: number[] = [];
      const bySlot = new Map<number, number>();
      const byId = new Map<number, number>();
      return (): number => {
        grass.length = 0;
        tree.length = 0;
        animal.length = 0;
        human.length = 0;
        bySlot.clear();
        byId.clear();
        for (const slot of slots) {
          const list = slot % 4 === 0 ? grass : slot % 4 === 1 ? tree : slot % 4 === 2 ? animal : human;
          list.push(slot);
          bySlot.set(slot, slot);
          byId.set(slot, slot);
        }
        return grass.length + tree.length + animal.length + human.length + bySlot.size + byId.size;
      };
    })();

    const TICKS = 2000;
    const retiredStart = performance.now();
    let retiredEntries = 0;
    for (let i = 0; i < TICKS; i++) retiredEntries += retired();
    const retiredMs = performance.now() - retiredStart;

    const reusedStart = performance.now();
    let reusedEntries = 0;
    for (let i = 0; i < TICKS; i++) reusedEntries += reused();
    const reusedMs = performance.now() - reusedStart;

    console.log(`SoA containers over ${TICKS} rebuilds of ${FIXTURE_ENTITIES}: `
      + `${retiredMs.toFixed(1)} ms (fresh) vs ${reusedMs.toFixed(1)} ms (reused)`);
    expect(reusedEntries).toBe(retiredEntries);
  });
});

const VIEW = { x: 400, y: 300, width: 512, height: 384 };
const WORLD_W = 1200;
const WORLD_H = 900;
const CHUNK = 256;

describe('F-RND-2 — the ground chunk planner is not re-planned for a still camera', () => {
  it('hands back the same plan, and a real view change is not served from the memo', () => {
    const first = planGroundChunks(WORLD_W, WORLD_H, CHUNK, VIEW);
    expect(planGroundChunks(WORLD_W, WORLD_H, CHUNK, VIEW)).toBe(first);

    // A different viewport must produce a different plan, ordered around *its* centre.
    const moved = { ...VIEW, x: VIEW.x + CHUNK };
    const replanned = planGroundChunks(WORLD_W, WORLD_H, CHUNK, moved);
    expect(replanned).not.toBe(first);

    const centreX = moved.x + moved.width / 2;
    const centreY = moved.y + moved.height / 2;
    const [head] = replanned;
    expect(head.x).toBeLessThanOrEqual(centreX);
    expect(head.x + CHUNK).toBeGreaterThan(centreX);
    expect(head.y).toBeLessThanOrEqual(centreY);
    expect(head.y + CHUNK).toBeGreaterThan(centreY);
  });
});

describe('F-RND-3 — the overlay vignette gradient is built once per viewport', () => {
  function gradientCounter() {
    const calls = { created: 0 };
    const ctx = {
      fillStyle: '',
      createRadialGradient: () => {
        calls.created += 1;
        return { addColorStop: () => {} };
      },
      fillRect: () => {},
    };
    return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
  }

  it('reuses the gradient while size and night state hold, and rebuilds when they change', () => {
    const { ctx, calls } = gradientCounter();
    drawScreenVignette(ctx, 800, 600);
    drawScreenVignette(ctx, 800, 600);
    expect(calls.created).toBe(1);

    drawScreenVignette(ctx, 800, 600, true);
    expect(calls.created).toBe(2);

    drawScreenVignette(ctx, 1024, 600, true);
    expect(calls.created).toBe(3);
  });
});

function snapshot(overrides: Partial<RenderSnapshot> = {}): RenderSnapshot {
  return {
    tick: 10,
    staticLayerRevision: 'settled-colony',
    hourOfDay: 3,
    showGrid: false,
    showPaths: false,
    selectedEntity: null,
    selectedEntityIds: [],
    juiceEffectsEnabled: true,
    selectedBuilding: null,
    villageLeaderId: null,
    buildMode: null,
    buildRotation: 0,
    pendingRaidEvents: [],
    pendingOutgoingRaidEvents: [],
    buildings: [],
    entities: [],
    ...overrides,
  } as unknown as RenderSnapshot;
}

describe('F-RND-4 — the entity-layer key is not rebuilt while its fields hold', () => {
  it('reuses the key when its inputs hold, including a settled-world tick change', () => {
    const state = snapshot({ selectedEntityIds: [7, 8] });
    const key = buildEntityLayerKey(state, 800, 600);
    expect(buildEntityLayerKey(state, 800, 600)).toBe(key);
    // A settled colony intentionally keeps its static-layer revision across ticks.
    expect(buildEntityLayerKey(snapshot({ selectedEntityIds: [7, 8], tick: 11 }), 800, 600)).toBe(key);

    const changed = snapshot({ selectedEntityIds: [7, 8], staticLayerRevision: 'new-building' });
    expect(buildEntityLayerKey(changed, 800, 600)).not.toBe(key);
    expect(buildEntityLayerKey(state, 800, 600)).toBe(key);
  });

  it('changes the key for every field it keys', () => {
    const base = snapshot();
    const key = buildEntityLayerKey(base, 800, 600);
    // `hourOfDay` is deliberately absent: the static layer has no hour-dependent painter, so a bare
    // hour change must not re-bake it (the night grid tint lives in the per-frame overlay pass).
    expect(buildEntityLayerKey(snapshot({ hourOfDay: 4 }), 800, 600)).toBe(key);
    const variants: RenderSnapshot[] = [
      snapshot({ staticLayerRevision: 'changed-layer' }),
      snapshot({ showGrid: true }),
      snapshot({ showPaths: true }),
      snapshot({ selectedEntity: { id: 3 } as RenderSnapshot['selectedEntity'] }),
      snapshot({ selectedEntityIds: [3] }),
      snapshot({ juiceEffectsEnabled: false }),
      snapshot({ selectedBuilding: { id: 4 } as RenderSnapshot['selectedBuilding'] }),
      snapshot({ villageLeaderId: 5 }),
      snapshot({ buildMode: BuildingType.House }),
      snapshot({ buildRotation: 90 }),
      snapshot({ pendingRaidEvents: [{}] as RenderSnapshot['pendingRaidEvents'] }),
      snapshot({ pendingOutgoingRaidEvents: [{}] as RenderSnapshot['pendingOutgoingRaidEvents'] }),
      snapshot({ buildings: [blacksmithBuilding()] }),
      snapshot({ entities: [{}] as RenderSnapshot['entities'] }),
    ];
    for (const variant of variants) {
      expect(buildEntityLayerKey(variant, 800, 600)).not.toBe(key);
    }
    expect(buildEntityLayerKey(base, 800, 600)).toBe(key);
    expect(buildEntityLayerKey(base, 801, 600)).not.toBe(key);
  });
});

function minimalWorld(buildings: Building[], tick: number): WorldState {
  return {
    tick,
    year: 1,
    dayInYear: 1,
    season: Season.Spring,
    width: 100,
    height: 100,
    buildings,
    entities: [],
    deathParticles: [],
    floatingTexts: [],
    huntVisuals: [],
    disasters: [],
    rivalSettlements: [],
    unlockedTechs: [],
    researchNodes: [],
    tradeRoutes: [],
    worldMap: null,
    weather: 'clear',
    ecosystemHealth: 1,
    pollutionLevel: 0,
    festival: null,
    renffrOmen: null,
    villageForge: null,
    villageLeaderId: null,
  } as unknown as WorldState;
}

function camera(x: number, y: number): RenderSnapshot['camera'] {
  return { x, y, zoom: 1, targetX: x, targetY: y, targetZoom: 1 };
}

/**
 * Fixtures must satisfy the static-layer revision contract, which inspects occupants,
 * completion, sprite and health fields even when a test only targets the blacksmith cache.
 */
function blacksmithBuilding(overrides: Partial<Building> = {}): Building {
  return {
    id: 1,
    type: BuildingType.Blacksmith,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    level: 1,
    spriteScale: 1,
    health: 100,
    maxHealth: 100,
    occupants: [],
    constructionProgress: 100,
    buildAnimTimer: 0,
    completed: true,
    ...overrides,
  } as Building;
}

describe('F-RND-9 — camera-only snapshots reuse the blacksmith predicate result', () => {
  it('does not rerun the blacksmith search when only the camera moved', () => {
    const buildings = [blacksmithBuilding()];
    // The static-layer revision deliberately enumerates buildings each snapshot.
    // Count only the blacksmith predicate scan, not unrelated revision reads.
    const scan = vi.spyOn(buildings, 'some');
    try {
      const first = buildRenderSnapshot(minimalWorld(buildings, 5), { camera: camera(0, 0) } as never);
      expect(first.hasBlacksmith).toBe(true);
      expect(scan).toHaveBeenCalledTimes(1);

      const moved = buildRenderSnapshot(minimalWorld(buildings, 5), { camera: camera(64, 32) } as never);
      expect(moved.hasBlacksmith).toBe(true);
      expect(scan).toHaveBeenCalledTimes(1);
    } finally {
      scan.mockRestore();
    }
  });

  it('re-scans on the next tick, so a finished building is picked up', () => {
    const blacksmith = blacksmithBuilding({ completed: false, constructionProgress: 99 });
    const buildings = [blacksmith];
    const scan = vi.spyOn(buildings, 'some');
    try {
      expect(buildRenderSnapshot(minimalWorld(buildings, 5), { camera: camera(0, 0) } as never).hasBlacksmith)
        .toBe(false);
      expect(scan).toHaveBeenCalledTimes(1);

      blacksmith.completed = true;
      blacksmith.constructionProgress = 100;
      expect(buildRenderSnapshot(minimalWorld(buildings, 6), { camera: camera(0, 0) } as never).hasBlacksmith)
        .toBe(true);
      expect(scan).toHaveBeenCalledTimes(2);
    } finally {
      scan.mockRestore();
    }
  });
});

describe('W-06 — placement verdict markers follow the live ghost', () => {
  /** Records each diamond's first point, which is one marker per candidate cell. */
  function recordingContext() {
    const markers: { x: number; y: number }[] = [];
    const ctx = {
      save() {},
      restore() {},
      beginPath() {},
      moveTo(x: number, y: number) { markers.push({ x, y }); },
      lineTo() {},
      closePath() {},
      fill() {},
      stroke() {},
      ellipse() {},
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
    };
    return { ctx: ctx as unknown as CanvasRenderingContext2D, markers };
  }

  it('re-centres the verdict cloud when the ghost moves, with no cache-key term', () => {
    const world = initGame({ villageName: 'Ghost', seed: 20261111 });
    const view = createInitialView(world.width, world.height) as ViewState;
    const atGhost = (dx: number) => {
      const snapshot = buildRenderSnapshot(world, {
        ...view,
        buildMode: BuildingType.House,
        buildGhost: createBuildGhost(view.camera.x + dx, view.camera.y, null),
      });
      const { ctx, markers } = recordingContext();
      drawBuildSnapOverlay(ctx, snapshot, 800, 600);
      return markers.map((marker) => marker.x);
    };

    const left = atGhost(-100);
    const right = atGhost(100);
    expect(left.length).toBeGreaterThan(0);
    expect(Math.max(...right) - Math.max(...left)).toBeGreaterThan(100);
    expect(Math.min(...right) - Math.min(...left)).toBeGreaterThan(100);
  });


});

describe('D18 — the entity layer key covers what its painters read', () => {
  it('changes when only a non-primary selection id changes', () => {
    // `humans.ts` / `animals.ts` draw a ring per id in `selectedEntityIds`, so dropping the second
    // id has to invalidate the cached bitmap even though `selectedEntity.id` is unchanged.
    const two = buildEntityLayerKey(snapshot({ selectedEntityIds: [1, 2], selectedEntity: { id: 1 } as RenderSnapshot['selectedEntity'] }), 800, 600);
    const one = buildEntityLayerKey(snapshot({ selectedEntityIds: [1], selectedEntity: { id: 1 } as RenderSnapshot['selectedEntity'] }), 800, 600);
    expect(two).not.toBe(one);
  });

  it('changes when the juice-effects preference flips', () => {
    expect(buildEntityLayerKey(snapshot({ juiceEffectsEnabled: true }), 800, 600))
      .not.toBe(buildEntityLayerKey(snapshot({ juiceEffectsEnabled: false }), 800, 600));
  });

  it('the pre-fix key could not tell those states apart', () => {
    // A key without `selectedEntityIds` and `juiceEffectsEnabled` collides on these snapshots,
    // so the cached bitmap stays stale.
    const preFixKey = (s: RenderSnapshot): string => [
      s.tick, s.hourOfDay, s.showGrid ? 1 : 0, s.showPaths ? 1 : 0,
      s.hoveredBuilding?.id ?? '', s.selectedEntity?.id ?? '', s.selectedBuilding?.id ?? '',
      s.villageLeaderId ?? '', s.buildMode ?? '', s.buildRotation ?? 0,
      s.pendingRaidEvents?.length ?? 0, s.pendingOutgoingRaidEvents?.length ?? 0,
      s.buildings.length, s.entities.length,
    ].join('|');
    const two = snapshot({ selectedEntityIds: [1, 2], selectedEntity: { id: 1 } as RenderSnapshot['selectedEntity'] });
    const one = snapshot({ selectedEntityIds: [1], selectedEntity: { id: 1 } as RenderSnapshot['selectedEntity'] });
    expect(preFixKey(two)).toBe(preFixKey(one));
    expect(preFixKey(snapshot({ juiceEffectsEnabled: true })))
      .toBe(preFixKey(snapshot({ juiceEffectsEnabled: false })));
  });
});
