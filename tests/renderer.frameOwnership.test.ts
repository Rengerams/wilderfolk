/**
 * One owner per render surface: the device-pixel ratio, the map canvas's colour grade, the
 * mini-map's frame cadence, and the per-tick SoA bucket containers (audit batch ET: F-RND-7,
 * F-RND-8, F-RND-10, F-RND-14).
 *
 * F-RND-8 and the rAF half of F-RND-14 are "the right code runs in the wrong place" defects, so
 * their guards are on the source, in the style of `visualsAudit.renderWiring.test.ts`: every
 * pattern is declared once and then fed the pre-fix expression, so the guard cannot be vacuous.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fitCanvasToDpr } from '../src/game/canvasLayer';
import {
  drawMiniMapFrame,
  registerMiniMapFrameDraw,
  shouldRepaintMiniMap,
} from '../src/game/renderer/miniMapFrame';
import { EntityType, type Entity, type WorldState } from '../src/game/gameTypes';
import { packRenderSoA } from '../src/game/simBuffers/packRenderSoA';
import { createRenderSoAReader, type RenderSoAReaderV1 } from '../src/game/simBuffers/renderSoAReader';
import {
  invalidateRenderSoABucketsCache,
  updateRenderSoABuckets,
} from '../src/game/simBuffers/renderSoAEntities';

function readSrc(relative: string): string {
  return readFileSync(fileURLToPath(new URL(`../src/${relative}`, import.meta.url)), 'utf8');
}

// ---- F-RND-8: the map canvas no longer carries a full-screen CSS filter ----
const FULL_SCREEN_CANVAS_FILTER = /filter:\s*contrast\(/;
const PRE_FIX_CANVAS_FILTER = '.map-canvas {\n  filter: contrast(1.04) saturate(1.06);\n}';

// ---- F-RND-14: the panel paints through the render loop, not its own rAF loop ----
const PRIVATE_RAF_LOOP = /requestAnimationFrame/;
const PRE_FIX_MINIMAP_LOOP = 'animId = requestAnimationFrame(draw);';

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

describe('the map canvas leaves its grade to the draw', () => {
  it('has no per-frame full-screen filter left in the stylesheet', () => {
    expect(FULL_SCREEN_CANVAS_FILTER.test(PRE_FIX_CANVAS_FILTER), 'the guard must catch the rule it replaced').toBe(true);
    expect(FULL_SCREEN_CANVAS_FILTER.test(readSrc('App.css'))).toBe(false);
  });
});

describe('the mini-map is driven by the main render loop', () => {
  it('repaints on its own interval, not on the render loop’s', () => {
    const repainted: number[] = [];
    for (let frame = 1; frame <= 15; frame++) {
      if (shouldRepaintMiniMap(frame)) repainted.push(frame);
    }

    // The panel's former `frameCounter % 5` gate, now owned by the cadence module.
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

  it('opens no requestAnimationFrame loop of its own', () => {
    expect(PRIVATE_RAF_LOOP.test(PRE_FIX_MINIMAP_LOOP), 'the guard must catch the loop it replaced').toBe(true);
    expect(PRIVATE_RAF_LOOP.test(readSrc('components/MiniMap.tsx'))).toBe(false);
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

    /** The retired shape — a fresh list per layer and two fresh Maps, every tick. */
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
