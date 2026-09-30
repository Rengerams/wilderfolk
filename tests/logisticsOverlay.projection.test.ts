/**
 * F4 — Infrastructure and Logistics Overlay.
 *
 * The overlay must be testable without a canvas, so all classification is asserted on the pure
 * projection `computeLogisticsOverlay` and the renderer is guarded by source only. Boundaries are
 * asserted at the exact threshold value **and** one step past it, because "off by one world unit"
 * is the failure mode a named constant is supposed to make impossible.
 *
 * The fixtures are hand-placed on the real `BUILDING_CONFIGS` footprints: a Road is 66×26, so a
 * road whose centre is at (100, 100) has its footprint edge at y = 113 and every distance below is
 * measured from that edge.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { BUILDING_CONFIGS, BuildingType, EntityType, type Building, type Entity, type WorldState } from '../src/game/gameTypes';
import { blockedColumn, testWorldMap } from '../src/test/worldMapFixtures';
import {
  COMMUTE_EXTREME_DISTANCE,
  COMMUTE_WALK_BUDGET_TICKS,
  GOOD_ROAD_ACCESS_DISTANCE,
  MAX_ROAD_ACCESS_DISTANCE,
  SETTLER_WALK_SPEED,
  computeLogisticsOverlay,
  type LogisticsBuildingFlag,
} from '../src/game/logisticsOverlayData';
import { COMMUTE_SNAP_DISTANCE } from '../src/game/simulation/humanMovement';
import { WORK_COMMUTE_LEAD_HOURS } from '../src/game/workSchedule';
import { TICKS_PER_HOUR } from '../src/game/dayCycle';
import { createInitialView, createViewFromSave, mergeForSave } from '../src/game/viewState';
import { buildRenderSnapshot } from '../src/game/renderSnapshot';
import { drawLogisticsOverlay } from '../src/game/renderer/logistics';
import { isLogisticsHotkey } from '../src/game/hotkeys';
import { getPathGrid, getReadOnlyPathGrid, resetPathGridCaches } from '../src/game/pathfinding';

function readSrc(relative: string): string {
  return readFileSync(resolve(process.cwd(), 'src', relative), 'utf8');
}

/**
 * The projection reads only `buildings` and `entities`; the size/tick fields are there so the
 * `ViewState` save round-trip in this file has a sane world to work against. A narrow, documented
 * cast rather than a whole `WorldState` mock.
 */
function makeWorld(buildings: Building[], entities: Entity[] = []): WorldState {
  return { buildings, entities, width: 2000, height: 2000, tick: 0 } as unknown as WorldState;
}

/**
 * A world **with** a `worldMap`, because blocked-path classification is the only part of the
 * projection that reads terrain (every other case above deliberately omits the map, so `grid` is
 * null and they behave exactly as before). `hasRiver` blocks one tile column at x = 12 (world
 * 120–129); all other inputs are identical between the two arms of the controlled pair below, so
 * only the terrain can explain a severity change.
 */
function makeMappedWorld(buildings: Building[], entities: Entity[], hasRiver: boolean): WorldState {
  const cols = 40;
  const rows = 40;
  const worldMap = testWorldMap({
    tilesX: cols,
    tilesY: rows,
    seed: 7,
    tileType: hasRiver ? blockedColumn(12) : undefined,
  });
  return {
    buildings,
    entities,
    width: cols * 10,
    height: rows * 10,
    tick: 0,
    worldMap,
  } as unknown as WorldState;
}

function place(id: number, type: BuildingType, x: number, y: number, over: Partial<Building> = {}): Building {
  const config = BUILDING_CONFIGS[type];
  return {
    id,
    type,
    x,
    y,
    width: config.width,
    height: config.height,
    occupants: [],
    level: 1,
    constructionProgress: 100,
    completed: true,
    health: 100,
    maxHealth: 100,
    spriteScale: 1,
    buildAnimTimer: 0,
    rotation: 0,
    ...over,
  };
}

/** A settler. Remember the field-name trap: `homeBuildingId` is the **workplace**. */
function settler(
  id: number,
  residenceBuildingId: number | undefined,
  workBuildingId: number | undefined,
  over: Partial<Entity> = {},
): Entity {
  return {
    id,
    type: EntityType.Human,
    x: 0,
    y: 0,
    energy: 100,
    maxEnergy: 100,
    age: 30,
    birthYear: 0,
    birthMonth: 0,
    birthDay: 0,
    maxAge: 90,
    speed: SETTLER_WALK_SPEED,
    size: 10,
    vx: 0,
    vy: 0,
    reproductionCooldown: 0,
    alive: true,
    flash: 0,
    isJuvenile: false,
    residenceBuildingId,
    homeBuildingId: workBuildingId,
    ...over,
  };
}

function flagFor(flags: readonly LogisticsBuildingFlag[], id: number): LogisticsBuildingFlag | undefined {
  return flags.find((flag) => flag.buildingId === id);
}

describe('F4 projection — road network connectivity', () => {
  it('groups chained roads into one component and separates a detached road', () => {
    const roads = [
      place(1, BuildingType.Road, 100, 100),
      place(2, BuildingType.Road, 166, 100), // butt-jointed to road 1: rects meet at x = 133
      place(3, BuildingType.Road, 1000, 1000), // its own island
      place(4, BuildingType.Road, 300, 300, { completed: false }), // a site, not part of the network
    ];
    const data = computeLogisticsOverlay(makeWorld([...roads, place(10, BuildingType.House, 166, 140)]));

    expect(data.totals.roadCount).toBe(3);
    expect(data.totals.roadComponentCount).toBe(2);
    expect(data.roadComponents[0].nodes.map((node) => node.buildingId)).toEqual([1, 2]);
    expect(data.roadComponents[1].nodes.map((node) => node.buildingId)).toEqual([3]);
    // The house is served by the component road 2 belongs to, not the detached island.
    expect(data.supplyLinks).toHaveLength(1);
    expect(data.supplyLinks[0]).toMatchObject({ buildingId: 10, componentId: 0 });
  });
});

describe('F4 projection — poorly connected buildings', () => {
  it('separates well connected, poorly connected and no-access buildings', () => {
    const data = computeLogisticsOverlay(
      makeWorld([
        place(1, BuildingType.Road, 100, 100),
        place(10, BuildingType.House, 100, 140), // 27 wu from the road edge — snug
        place(11, BuildingType.Store, 100, 200), // 87 wu — over the good distance, inside max
        place(12, BuildingType.Farm, 700, 700), // far past max
      ]),
    );

    expect(flagFor(data.poorlyConnected, 10)).toBeUndefined();
    expect(flagFor(data.poorlyConnected, 11)).toMatchObject({
      issue: 'poorly_connected',
      buildingType: BuildingType.Store,
    });
    expect(flagFor(data.poorlyConnected, 11)?.distanceToRoad).toBeCloseTo(87, 6);
    expect(flagFor(data.poorlyConnected, 12)).toMatchObject({
      issue: 'no_road_access',
      distanceToRoad: Infinity,
    });

    expect(data.totals).toMatchObject({
      poorlyConnectedCount: 1,
      noRoadAccessCount: 1,
      noRoadNetworkCount: 0,
      supplyLinkCount: 2, // the two buildings a road can actually serve
    });
  });

  it('reports no_road_network when the colony has no completed road at all', () => {
    const data = computeLogisticsOverlay(makeWorld([place(10, BuildingType.House, 100, 100)]));

    expect(data.roadComponents).toEqual([]);
    expect(data.supplyLinks).toEqual([]);
    expect(flagFor(data.poorlyConnected, 10)).toMatchObject({
      issue: 'no_road_network',
      distanceToRoad: Infinity,
    });
    expect(data.totals.noRoadNetworkCount).toBe(1);
    expect(data.totals.poorlyConnectedCount).toBe(0);
  });

  it('pins the access-distance boundaries at the exact values', () => {
    const data = computeLogisticsOverlay(
      makeWorld([
        place(1, BuildingType.Road, 100, 100), // footprint bottom edge at y = 113
        place(20, BuildingType.House, 100, 113 + GOOD_ROAD_ACCESS_DISTANCE), // exactly 40
        place(21, BuildingType.House, 100, 113 + GOOD_ROAD_ACCESS_DISTANCE + 0.5), // 40.5
        place(22, BuildingType.House, 100, 113 + MAX_ROAD_ACCESS_DISTANCE), // exactly 120
        place(23, BuildingType.House, 100, 113 + MAX_ROAD_ACCESS_DISTANCE + 1), // 121
      ]),
    );

    expect(flagFor(data.poorlyConnected, 20), 'at the good distance is still connected').toBeUndefined();
    expect(flagFor(data.poorlyConnected, 21)).toMatchObject({ issue: 'poorly_connected' });
    expect(flagFor(data.poorlyConnected, 21)?.distanceToRoad).toBeCloseTo(GOOD_ROAD_ACCESS_DISTANCE + 0.5, 6);
    expect(flagFor(data.poorlyConnected, 22)).toMatchObject({ issue: 'poorly_connected' });
    expect(flagFor(data.poorlyConnected, 22)?.distanceToRoad).toBeCloseTo(MAX_ROAD_ACCESS_DISTANCE, 6);
    expect(flagFor(data.poorlyConnected, 23)).toMatchObject({
      issue: 'no_road_access',
      distanceToRoad: Infinity,
    });
    expect(data.totals.supplyLinkCount, 'a link exists exactly while a road is in reach').toBe(3);
  });
});

describe('F4 projection — commute pressure', () => {
  it('flags legs over the walk budget and legs past the sim’s snap distance', () => {
    const data = computeLogisticsOverlay(
      makeWorld(
        [
          place(30, BuildingType.House, 100, 140),
          place(31, BuildingType.Farm, 100, 240), // 100 wu from home — over budget, not extreme
          place(32, BuildingType.Workshop, 500, 140), // 400 wu — past the snap distance
          place(33, BuildingType.Farm, 100, 300, { completed: false }),
          place(34, BuildingType.Farm, 100, 200, { faction: 'rival' }),
        ],
        [
          settler(1, 30, 31),
          settler(2, 30, 32),
          settler(3, 30, undefined), // no workplace — nothing to measure
          settler(4, 30, 31, { faction: 'visitor' }), // not a colony settler
          settler(5, 30, 999), // workplace does not exist
          settler(6, 30, 33), // workplace is still a site
          settler(7, 30, 34), // rival structure
          settler(8, 30, 31, { alive: false }),
        ],
      ),
    );

    expect(data.commutes.map((commute) => commute.entityId)).toEqual([1, 2]);
    expect(data.commutes[0]).toMatchObject({
      homeBuildingId: 30,
      workBuildingId: 31,
      severity: 'over_budget',
    });
    expect(data.commutes[0].distance).toBeCloseTo(100, 6);
    expect(data.commutes[1]).toMatchObject({ severity: 'extreme' });
    expect(data.commutes[1].distance).toBeCloseTo(400, 6);
    expect(data.totals).toMatchObject({ commutePressureCount: 2, extremeCommuteCount: 1 });
  });

  it('pins the commute boundaries and the walk-speed fallback', () => {
    // The thresholds are the owners' values, never a local restatement.
    expect(COMMUTE_WALK_BUDGET_TICKS).toBe(WORK_COMMUTE_LEAD_HOURS * TICKS_PER_HOUR);
    expect(COMMUTE_EXTREME_DISTANCE).toBe(COMMUTE_SNAP_DISTANCE);

    const atBudget = COMMUTE_WALK_BUDGET_TICKS * SETTLER_WALK_SPEED; // 9 wu at the human pace
    const data = computeLogisticsOverlay(
      makeWorld(
        [
          place(40, BuildingType.House, 100, 140),
          place(41, BuildingType.Farm, 100, 140 + atBudget), // exactly at budget
          place(42, BuildingType.Farm, 100, 140 + atBudget + 0.5), // a hair over
          place(43, BuildingType.Farm, 100 + COMMUTE_EXTREME_DISTANCE, 140), // exactly the snap distance
          place(44, BuildingType.Farm, 100 + COMMUTE_EXTREME_DISTANCE + 0.5, 140), // past it
        ],
        [
          settler(1, 40, 41),
          settler(2, 40, 42),
          settler(3, 40, 43),
          settler(4, 40, 44),
          // No usable speed: the fallback pace must be the owner's, or a zero would read Infinity.
          settler(5, 40, 41, { speed: 0 }),
        ],
      ),
    );

    expect(data.commutes.map((commute) => commute.entityId)).toEqual([2, 3, 4]);
    expect(data.commutes[0]).toMatchObject({ severity: 'over_budget' });
    expect(data.commutes[0].walkTicks).toBeCloseTo(COMMUTE_WALK_BUDGET_TICKS + 0.5 / SETTLER_WALK_SPEED, 6);
    expect(data.commutes[1]).toMatchObject({ severity: 'over_budget' }); // 200 > 200 is false
    expect(data.commutes[1].distance).toBeCloseTo(COMMUTE_EXTREME_DISTANCE, 6);
    expect(data.commutes[2]).toMatchObject({ severity: 'extreme' });
  });
});

describe('F4 projection — blocked paths (the row-text residual)', () => {
  /**
   * Both grid caches key on `seed|preset|walls|size`, and in a real world the terrain *is* a pure
   * function of those (`generateWorldMap`), so the cache is correct. This controlled pair varies
   * terrain under a fixed seed, which no real world does — so the caches are cleared between the
   * two arms rather than pretending the key is wrong.
   */
  beforeEach(() => {
    resetPathGridCaches();
  });

  function mappedPair(hasRiver: boolean): WorldState {
    return makeMappedWorld(
      [place(50, BuildingType.House, 100, 100), place(51, BuildingType.Farm, 140, 100)],
      [settler(1, 50, 51)],
      hasRiver,
    );
  }

  it('classifies a leg whose direct line crosses water as blocked, and lets it take precedence', () => {
    const data = computeLogisticsOverlay(mappedPair(true));

    expect(data.commutes).toHaveLength(1);
    expect(data.commutes[0]).toMatchObject({ entityId: 1, severity: 'blocked' });
    // `blocked` beats the distance-based severity on the same leg, and is counted on its own.
    expect(data.totals).toMatchObject({ blockedCommuteCount: 1, extremeCommuteCount: 0 });
  });

  it('reports the identical leg as ordinary pressure when the terrain is clear', () => {
    // Negative control: same buildings, same entity, same 40 wu distance — only the river differs,
    // so nothing but terrain can account for the severity change.
    const data = computeLogisticsOverlay(mappedPair(false));

    expect(data.commutes).toHaveLength(1);
    expect(data.commutes[0]).toMatchObject({ severity: 'over_budget' });
    expect(data.totals).toMatchObject({ blockedCommuteCount: 0 });
  });

  it('keeps the read-only grid out of the simulation cache', () => {
    resetPathGridCaches();
    const world = mappedPair(true);
    expect(world.worldMap).toBeTruthy();
    // `worldMap` is nullable only for a world built without worldgen; this fixture generates one.
    const map = world.worldMap!;

    // The simulation's grid and the projection's grid are two objects with two backing buffers…
    const simGrid = getPathGrid(map, world.buildings);
    const readOnly = getReadOnlyPathGrid(map, world.buildings);
    expect(readOnly).not.toBe(simGrid);
    expect(readOnly.blocked).not.toBe(simGrid.blocked);

    // …and asking the projection for its grid again must not swap the simulation's identity —
    // which is what would make `setCurrentPathMap` clear the sim's waypoint cache from the render
    // path, the hazard that keeps this projection off `getPathGrid`.
    expect(getPathGrid(map, world.buildings)).toBe(simGrid);
  });
});

describe('F4 projection — empty world', () => {
  it('yields empty output and zeroed totals', () => {
    const data = computeLogisticsOverlay(makeWorld([]));

    expect(data.roadComponents).toEqual([]);
    expect(data.supplyLinks).toEqual([]);
    expect(data.poorlyConnected).toEqual([]);
    expect(data.commutes).toEqual([]);
    expect(data.totals).toEqual({
      roadCount: 0,
      roadComponentCount: 0,
      poorlyConnectedCount: 0,
      noRoadAccessCount: 0,
      noRoadNetworkCount: 0,
      supplyLinkCount: 0,
      commutePressureCount: 0,
      extremeCommuteCount: 0,
      blockedCommuteCount: 0,
    });
  });
});

describe('F4 toggle — default, persistence and shortcut', () => {
  it('is off by default and stays off for a save written before the field existed', () => {
    const view = createInitialView(800, 600);
    expect(view.showLogistics).toBe(false);
    expect(createViewFromSave({}, makeWorld([])).showLogistics).toBe(false);
    // …and a session that turned it on round-trips through the save shape.
    expect(mergeForSave(makeWorld([]), { ...view, showLogistics: true }).showLogistics).toBe(true);
  });

  it('accepts only a bare X as the shortcut', () => {
    const key = (value: string, over: Partial<KeyboardEvent> = {}): KeyboardEvent =>
      ({ key: value, ctrlKey: false, metaKey: false, altKey: false, repeat: false, ...over }) as KeyboardEvent;

    expect(isLogisticsHotkey(key('x'))).toBe(true);
    expect(isLogisticsHotkey(key('X'))).toBe(true);
    expect(isLogisticsHotkey(key('x', { ctrlKey: true }))).toBe(false);
    expect(isLogisticsHotkey(key('x', { repeat: true }))).toBe(false);
    expect(isLogisticsHotkey(key('g'))).toBe(false);
  });

  it('changes nothing while it is off — no projection, no canvas work', () => {
    const world = makeWorld([place(1, BuildingType.Road, 100, 100), place(10, BuildingType.House, 100, 140)]);
    const view = createInitialView(800, 600);

    // Off: the snapshot carries no projection at all, so nothing is computed and nothing is drawn.
    const off = buildRenderSnapshot(world, view);
    expect(off.logistics).toBeNull();
    expect(() => drawLogisticsOverlay(throwingContext(), off, 800, 600)).not.toThrow();

    // On: the projection is present, and the very same pass *does* reach the canvas — which is
    // what proves the silent off-state above was this guard and not a vacuous assertion.
    const on = buildRenderSnapshot(world, { ...view, showLogistics: true });
    expect(on.logistics).not.toBeNull();
    expect(() => drawLogisticsOverlay(throwingContext(), on, 800, 600)).toThrow(/canvas touched/);
  });
});

/** A context whose every property access throws — the off state must never touch one. */
function throwingContext(): CanvasRenderingContext2D {
  return new Proxy({} as CanvasRenderingContext2D, {
    get(): never {
      throw new Error('canvas touched');
    },
  });
}

describe('F4 source guard — the overlay draws the projection, it does not decide it', () => {
  /** The per-frame call, name and arguments included. */
  const OVERLAY_CALL = /drawLogisticsOverlay\(ctx, state, cw, ch\)/;
  /**
   * The projection owner, invoked where the snapshot is built.
   *
   * Both spellings are accepted: the plain function, and the memoised accessor the snapshot uses so
   * that panning (which rebuilds the snapshot every frame, because its key includes the camera) does
   * not re-project the whole colony per frame. Both live in the same owner module, which is what this
   * guard is about — a call to the owner, not a second implementation in the renderer.
   */
  const PROJECTION_OWNER = /computeLogisticsOverlayCached\(world\)|computeLogisticsOverlay\(world\)/;
  /** Any projection threshold — a decision the renderer must never take. */
  const THRESHOLD_IN_RENDERER =
    /GOOD_ROAD_ACCESS_DISTANCE|MAX_ROAD_ACCESS_DISTANCE|COMMUTE_WALK_BUDGET_TICKS|COMMUTE_EXTREME_DISTANCE|ROAD_CONNECT_GAP/;
  /** A projection read inside the tick-keyed layer key — the recorded bug class. */
  const PROJECTION_IN_ENTITY_LAYER = /logistics/i;

  it('runs in the per-frame overlay pass, never in the tick-keyed entity layer', () => {
    expect(readSrc('game/renderer/overlay.ts')).toMatch(OVERLAY_CALL);
    expect(readSrc('game/entityLayer.ts')).not.toMatch(PROJECTION_IN_ENTITY_LAYER);
  });

  it('reads the projection instead of re-deriving the classification', () => {
    const renderer = readSrc('game/renderer/logistics.ts');
    expect(renderer).toContain('state.logistics');
    expect(renderer).not.toMatch(THRESHOLD_IN_RENDERER);
    // Types only from the projection module: no classification helper can be called from here.
    expect(renderer).toMatch(/import type \{[\s\S]*?\} from '\.\.\/logisticsOverlayData';/);
    // And the snapshot feeds it from the owner rather than scanning the world inline.
    expect(readSrc('game/renderSnapshot.ts')).toMatch(PROJECTION_OWNER);
  });

  it('guards are not vacuous', () => {
    // The renderer deciding for itself (the defect the threshold guard exists for).
    expect('if (nearest.distance > GOOD_ROAD_ACCESS_DISTANCE) {').toMatch(THRESHOLD_IN_RENDERER);
    expect('if (hit.distance > MAX_ROAD_ACCESS_DISTANCE) return;').toMatch(THRESHOLD_IN_RENDERER);
    // A logistics read folded into the baked layer (`entityLayer.ts` before the fix would look
    // exactly like this line, added beside `state.showPaths ? 1 : 0`).
    expect('    state.showLogistics ? 1 : 0,').toMatch(PROJECTION_IN_ENTITY_LAYER);
    // The overlay call with a different receiver is not the per-frame pass.
    expect('  drawLogisticsOverlay(drawCtx, state, cw, ch);').not.toMatch(OVERLAY_CALL);
    expect('  computeLogisticsOverlay(this.world);').not.toMatch(PROJECTION_OWNER);
    // The guard is not vacuous on the new spelling either: a call with a different receiver is not the
    // snapshot's.
    expect('  computeLogisticsOverlayCached(this.world);').not.toMatch(PROJECTION_OWNER);
  });
});
