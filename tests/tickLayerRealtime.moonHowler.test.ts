import { describe, expect, it, vi } from 'vitest';
import { BuildingType, EntityType, MapSize, type Entity, type WorldState } from '../src/game/gameTypes';
import type { TickContext } from '../src/game/simulation/simulationTypes';
import { buildEntityByType } from '../src/game/simFocus';
import { initGame } from '../src/game/gameEngine';
import { finishedBuilding, human } from '../src/test/factories';

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

  it('forwards the owner rng and only rewrites occupants for a howler holding a residence', async () => {
    // Other tests reset the module cache while this suite is running. Importing
    // the realtime owner after the reset keeps its Moon Howler mock in the same realm.
    vi.resetModules();
    const { tickLayerRealtime: realtimeTick } = await import('../src/game/tickLayerRealtime');
    const state = initGame({ villageName: 'RealtimeGate', size: MapSize.Medium, seed: 3 });
    state.tick = 1; // realtime-only cadence; also skips the population-history sample
    const house = finishedBuilding(900, BuildingType.House, { occupants: [1] });
    state.buildings = [house];
    const werewolf = human(2, { type: EntityType.Werewolf, job: undefined, x: 100, y: 100, moonHowlerCursed: true });

    moonHowlerCalls.length = 0;
    const occupantsBefore = house.occupants;
    realtimeTick(state, realtimeContext(state, werewolf));

    expect(moonHowlerCalls).toHaveLength(1);
    // The default Math.random would arrive as `undefined` here.
    expect(typeof moonHowlerCalls[0][7]).toBe('function');
    // A transformed howler has no residence, so the per-tick rewrite must not run.
    expect(house.occupants).toBe(occupantsBefore);

    // A legacy save can leave a cursed werewolf holding a residence id — the repair still runs.
    werewolf.residenceBuildingId = 900;
    realtimeTick(state, realtimeContext(state, werewolf));
    expect(house.occupants).toEqual([werewolf.id]);
  });
});
