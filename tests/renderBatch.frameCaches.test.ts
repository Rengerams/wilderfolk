/**
 * Per-frame render bookkeeping that must not repeat work when nothing changed.
 *
 * The renderer runs a chunk planner, a vignette gradient, an entity-layer cache key and a render
 * snapshot on every frame; the camera moves far more often than the simulation does, so each of
 * these has to be cheap on a frame where its *own* inputs are unchanged.
 */
import { describe, expect, it, vi } from 'vitest';
import { planGroundChunks } from '../src/game/renderer/terrain';
import { drawScreenVignette } from '../src/game/renderer/overlay';
import { buildEntityLayerKey } from '../src/game/entityLayer';
import { buildRenderSnapshot, type RenderSnapshot } from '../src/game/renderSnapshot';
import { BuildingType, Season, type Building, type WorldState } from '../src/game/gameTypes';

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
    hourOfDay: 3,
    showGrid: false,
    showPaths: false,
    selectedEntity: null,
    selectedEntityIds: [],
    juiceEffectsEnabled: true,
    selectedBuilding: null,
    villageLeaderId: null,
    highlightedCampKey: null,
    buildMode: null,
    buildRotation: 0,
    pendingRaidEvents: [],
    pendingOutgoingRaidEvents: [],
    visitorGroups: [],
    buildings: [],
    entities: [],
    ...overrides,
  } as unknown as RenderSnapshot;
}

describe('F-RND-4 — the entity-layer key is not rebuilt while its fields hold', () => {
  it('builds no key string on a repeat call', () => {
    const state = snapshot({ selectedEntityIds: [7, 8] });
    buildEntityLayerKey(state, 800, 600);
    const join = vi.spyOn(Array.prototype, 'join');
    try {
      buildEntityLayerKey(state, 800, 600);
      expect(join).not.toHaveBeenCalled();
      // The spy is not blind: a changed snapshot does go through the join.
      buildEntityLayerKey(snapshot({ selectedEntityIds: [7, 8], tick: 11 }), 800, 600);
      expect(join).toHaveBeenCalled();
    } finally {
      join.mockRestore();
    }
  });

  it('changes the key for every field it keys', () => {
    const base = snapshot();
    const key = buildEntityLayerKey(base, 800, 600);
    const variants: RenderSnapshot[] = [
      snapshot({ tick: 11 }),
      snapshot({ hourOfDay: 4 }),
      snapshot({ showGrid: true }),
      snapshot({ showPaths: true }),
      snapshot({ selectedEntity: { id: 3 } as RenderSnapshot['selectedEntity'] }),
      snapshot({ selectedEntityIds: [3] }),
      snapshot({ juiceEffectsEnabled: false }),
      snapshot({ selectedBuilding: { id: 4 } as RenderSnapshot['selectedBuilding'] }),
      snapshot({ villageLeaderId: 5 }),
      snapshot({ highlightedCampKey: '4,5' }),
      snapshot({ buildMode: BuildingType.House }),
      snapshot({ buildRotation: 90 }),
      snapshot({ pendingRaidEvents: [{}] as RenderSnapshot['pendingRaidEvents'] }),
      snapshot({ pendingOutgoingRaidEvents: [{}] as RenderSnapshot['pendingOutgoingRaidEvents'] }),
      snapshot({ visitorGroups: [{}] as RenderSnapshot['visitorGroups'] }),
      snapshot({ buildings: [{}] as Building[] }),
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
    visitorGroups: [],
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

describe('F-RND-9 — a camera-only snapshot rebuild does not re-scan the buildings', () => {
  function countedBuildings(buildings: Building[]): { proxy: Building[]; reads: () => number } {
    let indexReads = 0;
    const proxy = new Proxy(buildings, {
      get(target, prop, receiver) {
        if (typeof prop === 'string' && /^\d+$/.test(prop)) indexReads += 1;
        return Reflect.get(target, prop, receiver);
      },
    });
    return { proxy, reads: () => indexReads };
  }

  it('reads no building entry when only the camera moved', () => {
    const blacksmith = {
      id: 1,
      type: BuildingType.Blacksmith,
      completed: true,
      faction: undefined,
      x: 0,
      y: 0,
      height: 10,
      width: 10,
    } as unknown as Building;
    const { proxy, reads } = countedBuildings([blacksmith]);

    const first = buildRenderSnapshot(minimalWorld(proxy, 5), { camera: camera(0, 0) } as never);
    expect(first.hasBlacksmith).toBe(true);
    expect(reads()).toBeGreaterThan(0);

    const before = reads();
    const moved = buildRenderSnapshot(minimalWorld(proxy, 5), { camera: camera(64, 32) } as never);
    expect(moved.hasBlacksmith).toBe(true);
    expect(reads()).toBe(before);
  });

  it('re-scans when the tick moves, so a building finishing is picked up', () => {
    const blacksmith = {
      id: 1,
      type: BuildingType.Blacksmith,
      completed: false,
      faction: undefined,
    } as unknown as Building;
    const buildings = [blacksmith];

    expect(buildRenderSnapshot(minimalWorld(buildings, 5), { camera: camera(0, 0) } as never).hasBlacksmith)
      .toBe(false);

    blacksmith.completed = true;
    expect(buildRenderSnapshot(minimalWorld(buildings, 6), { camera: camera(0, 0) } as never).hasBlacksmith)
      .toBe(true);
  });
});
