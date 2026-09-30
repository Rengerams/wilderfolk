/**
 * Low-tier simulation/geometry batch — one focused regression per finding fixed here.
 *
 *   L43  huntingSpots        prey-id guard must not accept Object.prototype keys
 *   L44  mapBounds           NaN positions must not survive the clamp
 *   L47  militiaBalance      wall-cap label must match the cap the forge grants
 *   L21/L22 entityFactory    the auto-detected juvenile flag must use the 12-year floor
 *   L54  residencyReconciliation  the unreachable duplicate family scorer is gone
 *   L55  residencySelection  housing audit must ignore rival/leader housing
 *   L63  simulationEntities  mid-tick hunters must lose a dangling prey target
 *   L71  stripJunction       the lone-crossing coercion contract (dead guard removed)
 *   X1/X2 tickLayerRealtime  owner rng forwarded; occupants rewrite gated
 *   L28  gameLoop            the render-snapshot dirty key includes the multi-selection
 */
import { describe, expect, it, vi } from 'vitest';
import {
  BuildingType,
  EntityType,
  JobType,
  MapSize,
} from '../src/game/gameTypes';
import type { Building, Entity, VillageForgeState, WorldState } from '../src/game/gameTypes';

/** Records the arguments tickLayerRealtime hands to the Moon Howler owner. */
const moonHowlerCalls = vi.hoisted(() => [] as unknown[][]);

vi.mock('../src/game/moonHowler', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/game/moonHowler')>();
  return {
    ...actual,
    tickMoonHowlerCycle: (...args: Parameters<typeof actual.tickMoonHowlerCycle>) => {
      moonHowlerCalls.push(args);
      // Keep the caller's byType index and make no form change, so the gate under test is
      // exercised directly rather than through full-moon calendar state.
      return { byType: args[6], entityById: args[5], changed: false };
    },
  };
});

import {
  HUNTING_SPOT_PREY_OPTIONS,
  isValidHuntingSpotPrey,
} from '../src/game/huntingSpots';
import { clampToMapBounds } from '../src/game/mapBounds';
import { computeMilitiaBreakdown } from '../src/game/militiaBalance';
import { getDefenseStructureBreakdown, getWallSegmentCap } from '../src/game/defenseStructures';
import { createEntity } from '../src/game/entityFactory';
import { SPECIES_CONFIG } from '../src/game/speciesConfig';
import { clearHuntersTargetingPrey } from '../src/game/simulation/simulationEntities';
import * as residencySelection from '../src/game/residencySelection';
import { auditHousingSharingIssues } from '../src/game/residencySelection';
import { classifyJunction, connectionsAt } from '../src/game/stripJunction';
import { tickLayerRealtime } from '../src/game/tickLayerRealtime';
import { buildEntityByType } from '../src/game/simFocus';
import type { TickContext } from '../src/game/simulation/simulationTypes';
import { initGame } from '../src/game/gameEngine';
import { GameLoop } from '../src/game/gameLoop';
import { createInitialView } from '../src/game/viewState';

function entity(id: number, type: EntityType, overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    type,
    x: 100,
    y: 100,
    energy: 100,
    maxEnergy: 100,
    age: 30,
    birthYear: 0,
    birthMonth: 0,
    birthDay: 0,
    alive: true,
    size: 10,
    speed: 2,
    vx: 0,
    vy: 0,
    flash: 0,
    animFrame: 0,
    spriteAngle: 0,
    childrenIds: [],
    generation: 0,
    isJuvenile: false,
    ...overrides,
  } as Entity;
}

function building(id: number, type: BuildingType, overrides: Partial<Building> = {}): Building {
  return {
    id,
    type,
    x: 0,
    y: 0,
    width: 20,
    height: 20,
    occupants: [],
    level: 1,
    constructionProgress: 100,
    completed: true,
    health: 100,
    maxHealth: 100,
    spriteScale: 1,
    buildAnimTimer: 0,
    faction: 'player',
    ...overrides,
  } as Building;
}

describe('L43 hunting spot prey ids', () => {
  it('accepts only own prey option ids and rejects Object.prototype keys', () => {
    for (const option of HUNTING_SPOT_PREY_OPTIONS) {
      expect(isValidHuntingSpotPrey(option.id)).toBe(true);
    }
    expect(isValidHuntingSpotPrey('toString')).toBe(false);
    expect(isValidHuntingSpotPrey('constructor')).toBe(false);
    expect(isValidHuntingSpotPrey('__proto__')).toBe(false);
    expect(isValidHuntingSpotPrey(42)).toBe(false);
  });
});

describe('L44 map bounds clamp', () => {
  it('resets non-finite positions instead of letting NaN through', () => {
    const nan = { x: Number.NaN, y: Number.NaN };
    clampToMapBounds(nan, 200, 100);
    expect(nan.x).toBe(0);
    expect(nan.y).toBe(0);

    // Ordinary over-the-edge positions still clamp to the map rectangle.
    const outside = { x: -5, y: 300 };
    clampToMapBounds(outside, 200, 100);
    expect(outside.x).toBe(0);
    expect(outside.y).toBe(100);
  });
});

describe('L47 wall-cap label', () => {
  function militiaWorld(forge: VillageForgeState | undefined): WorldState {
    const state = initGame({ villageName: 'MilitiaCap', size: MapSize.Medium, seed: 11 });
    state.buildings = Array.from({ length: 10 }, (_, i) =>
      building(100 + i, BuildingType.Wall, { x: i * 20 }),
    );
    state.entities = [entity(1, EntityType.Human, { job: JobType.Settler })];
    state.villageForge = forge;
    return state;
  }

  it('reports the cap the forge actually grants (+72 plain, +96 with wall plates)', () => {
    const plainState = militiaWorld(undefined);
    const plain = computeMilitiaBreakdown(plainState, plainState.entities);
    expect(plain.lines.some((line) => line.includes('max +72'))).toBe(true);
    expect(plain.lines.some((line) => line.includes('max +96'))).toBe(false);

    const platedState = militiaWorld({
      activeOrder: null,
      progress: 0,
      completed: { wall_plates: true },
    } as VillageForgeState);
    const plated = computeMilitiaBreakdown(platedState, platedState.entities);
    expect(plated.lines.some((line) => line.includes('max +96'))).toBe(true);
    // The label must not understate the bonus the same state actually grants.
    expect(plated.barricadeStrength).toBeGreaterThan(plain.barricadeStrength);
  });

  it('reports the same cap in the defense-structure break-down (the L47 twin)', () => {
    const plainState = militiaWorld(undefined);
    expect(getWallSegmentCap(plainState)).toBe(72);
    expect(
      getDefenseStructureBreakdown(plainState, plainState.buildings).some((line) =>
        line.includes('max +72'),
      ),
    ).toBe(true);

    const platedState = militiaWorld({
      activeOrder: null,
      progress: 0,
      completed: { wall_plates: true },
    } as VillageForgeState);
    expect(getWallSegmentCap(platedState)).toBe(96);
    const lines = getDefenseStructureBreakdown(platedState, platedState.buildings);
    expect(lines.some((line) => line.includes('max +96'))).toBe(true);
    expect(lines.some((line) => line.includes('max +72'))).toBe(false);
  });
});

describe('L21/L22 factory juvenile threshold', () => {
  it('keeps the auto-detected size in step with the 12-year juvenile floor', () => {
    const humanSize = SPECIES_CONFIG[EntityType.Human].size;

    const child = createEntity(EntityType.Human, 10, 10, 899, undefined, undefined, {
      ageYears: 11,
      colonyDay: 0,
    });
    expect(child.isJuvenile).toBe(true);
    expect(child.size).toBe(humanSize * 0.5);

    // 12-15 year olds are adults to every age-gated rule (isJuvenile is recomputed from the
    // 12-year floor), so they must not be created at half size with `isJuvenile === false`.
    const teen = createEntity(EntityType.Human, 10, 10, 900, undefined, undefined, {
      ageYears: 13,
      colonyDay: 0,
    });
    expect(teen.isJuvenile).toBe(false);
    expect(teen.size).toBe(humanSize);

    const adult = createEntity(EntityType.Human, 10, 10, 901, undefined, undefined, {
      ageYears: 17,
      colonyDay: 0,
    });
    expect(adult.isJuvenile).toBe(false);
    expect(adult.size).toBe(humanSize);
  });
});

describe('L54 dead family scorer', () => {
  it('no longer exports the unreachable duplicate shared-residence scorer', () => {
    expect('pickSharedResidenceForFamily' in residencySelection).toBe(false);
  });
});

describe('L55 housing-sharing audit', () => {
  it('does not count rival-camp or leader housing as empty housing', () => {
    const lone = entity(1, EntityType.Human, { residenceBuildingId: 1 });
    const partnerA = entity(2, EntityType.Human, { residenceBuildingId: 1, partnerId: 3 });
    const partnerB = entity(3, EntityType.Human, { residenceBuildingId: 1, partnerId: 2 });
    const humans = [lone, partnerA, partnerB];

    const sharedHouse = building(1, BuildingType.House, { occupants: [1, 2, 3] });
    const rivalHouse = building(2, BuildingType.House, { faction: 'rival' });
    const leaderHouse = building(3, BuildingType.LeaderHouse);

    // Pre-fix the rival and leader houses made emptyCount 2, so the settler sharing the
    // family home was reported as "sharing while empty houses are available".
    expect(auditHousingSharingIssues(humans, [sharedHouse, rivalHouse, leaderHouse])).toEqual([]);

    // A genuinely empty player house is still reported.
    const freePlayerHouse = building(4, BuildingType.House);
    const issues = auditHousingSharingIssues(humans, [sharedHouse, freePlayerHouse]);
    expect(issues.some((issue) => issue.includes('1 empty house(s) are available'))).toBe(true);
  });
});

describe('L63 clearHuntersTargetingPrey', () => {
  it('clears hunters that acquired the prey after the tick-start index was built', () => {
    const indexed = entity(1, EntityType.Wolf, { huntTargetId: 7 });
    const midTick = entity(2, EntityType.Wolf, { huntTargetId: 7 });
    const bystander = entity(3, EntityType.Deer);
    const entityById = new Map<number, Entity>([
      [indexed.id, indexed],
      [midTick.id, midTick],
      [bystander.id, bystander],
    ]);
    const index = new Map<number, Set<number>>([[7, new Set([indexed.id])]]);

    clearHuntersTargetingPrey(7, entityById, index);

    expect(indexed.huntTargetId).toBeUndefined();
    expect(midTick.huntTargetId).toBeUndefined();
    expect(index.has(7)).toBe(false);
  });
});

describe('L71 lone-crossing junction', () => {
  it('coerces a lone H/V crossing to an elbow instead of zero connections', () => {
    const conn = connectionsAt(100, 100, [{ x: 100, y: 100 }], [{ x: 100, y: 100 }], 40);
    expect(conn).toEqual({ north: true, south: false, east: true, west: false });
    expect(classifyJunction(conn)).toBe('elbow');
  });
});

describe('tickLayerRealtime Moon Howler work', () => {
  function realtimeContext(state: WorldState, werewolf: Entity): TickContext {
    const alive = [werewolf];
    return {
      width: state.width,
      height: state.height,
      hourOfDay: 12,
      season: state.season,
      grassMult: 1,
      reproMult: 1,
      winterPenalty: 0,
      canHeat: true,
      byType: buildEntityByType(alive),
      aliveEntities: alive,
      newEntities: [],
      updatedBuildings: state.buildings,
      roadBuildings: [],
      playerHumans: [],
      entityById: new Map(alive.map((e) => [e.id, e])),
      buildingById: new Map(state.buildings.map((b) => [b.id, b])),
      predators: [],
    } as unknown as TickContext;
  }

  it('forwards the owner rng and only rewrites occupants for a howler holding a residence', () => {
    const state = initGame({ villageName: 'RealtimeGate', size: MapSize.Medium, seed: 3 });
    state.tick = 1; // realtime-only cadence; also skips the population-history sample
    const house = building(900, BuildingType.House, { occupants: [1] });
    state.buildings = [house];
    const werewolf = entity(2, EntityType.Werewolf, { moonHowlerCursed: true });

    moonHowlerCalls.length = 0;
    const occupantsBefore = house.occupants;
    tickLayerRealtime(state, realtimeContext(state, werewolf));

    expect(moonHowlerCalls).toHaveLength(1);
    // The default Math.random would arrive as `undefined` here.
    expect(typeof moonHowlerCalls[0][7]).toBe('function');
    // A transformed howler has no residence, so the per-tick rewrite must not run.
    expect(house.occupants).toBe(occupantsBefore);

    // A legacy save can leave a cursed werewolf holding a residence id — the repair still runs.
    werewolf.residenceBuildingId = 900;
    tickLayerRealtime(state, realtimeContext(state, werewolf));
    expect(house.occupants).toEqual([werewolf.id]);
  });
});

describe('L28 render snapshot dirty key', () => {
  it('changes when the multi-selection changes even if the primary id does not', () => {
    const world = initGame({ villageName: 'DirtyKey', size: MapSize.Medium, seed: 4 });
    const loop = new GameLoop(world, createInitialView(world.width, world.height), () => null);
    try {
      const keyOf = () =>
        (loop as unknown as { snapshotDirtyKey(): string }).snapshotDirtyKey();

      loop.patchView({ selectedEntityId: 7, selectedEntityIds: [7, 8] }, true);
      const withTwo = keyOf();
      // Shift-deselect drops the second id; the primary id is unchanged.
      loop.patchView({ selectedEntityIds: [7] }, true);
      const withOne = keyOf();
      expect(withOne).not.toBe(withTwo);

      loop.patchView({ selectedEntityIds: [7, 8] }, true);
      expect(keyOf()).toBe(withTwo);
    } finally {
      loop.stop();
    }
  });
});
