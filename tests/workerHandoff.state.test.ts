/**
 * The hand-off set: state a colony cannot rebuild from its own save must stay identical across the
 * worker boundary. Covers the election fields the delta used to drop, the beauty field every
 * hand-off used to strip, the faction-wander state a reused session inherited, and the simulation
 * pause the replica never received.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { gameTick } from '../src/game/gameTick';
import { extractSimTickDelta, applySimTickDelta, type SimTickDelta } from '../src/game/simBuffers/simDelta';
import { extractSimPrep, applySimPrep } from '../src/game/simWorker/simPrep';
import {
  hydrateWorldRuntimeCaches,
  invalidateWorldRuntimeCaches,
} from '../src/game/worldRuntimeCaches';
import { loadNames } from '../src/game/nameLoader';
import {
  adoptSimSeedFromWorld,
  getSimRng,
  personDayRoll,
  resetSimRng,
  snapshotSimRng,
} from '../src/game/simRng';
import { tickFactionCampWander } from '../src/game/factionWander';
import { createBeautyGrid } from '../src/game/beautyGrid';
import { tickHumanLeisure } from '../src/game/humanLeisureBehavior';
import {
  runVillageElection,
  startElectionCeremony,
} from '../src/game/villageLeadership';
import { getWorkSchedule } from '../src/game/workSchedule';
import { getHourOfDay, TICKS_PER_HOUR, TICKS_PER_DAY, DAYS_PER_YEAR } from '../src/game/dayCycleClock';
import { buildSaveData, loadGameFromParsed, parseSaveJson } from '../src/game/saveLoad';
import { createInitialView } from '../src/game/viewState';
import { WORKER_PROTO, type WorkerRequest, type WorkerResponse } from '../src/game/simWorker/protocol';
import { human, building } from '../src/test/factories';
import { BuildingType, EntityType, PATH_CELL, WeatherType, type WorldState } from '../src/game/gameTypes';

const SEED = 4242;
const TERM_YEAR = 2;

/** A small map keeps every hand-off fixture cheap while still exercising the real owners. */
function smallWorld(seed = SEED): WorldState {
  return initGame({ seed, width: 1024, height: 768 });
}

/** The `self` the worker module registers itself on when it is imported. */
interface WorkerSelf {
  onmessage: ((event: { data: WorkerRequest }) => void) | null;
  onerror: unknown;
  onunhandledrejection: unknown;
  postMessage: (message: unknown, transfer?: unknown) => void;
}

let self: WorkerSelf;
const posted: WorkerResponse[] = [];

/** Same harness as `workerMainThread.parity.test.ts`: the real module, one isolated test realm. */
function installWorkerSelf(): WorkerSelf {
  const fake: WorkerSelf = {
    onmessage: null,
    onerror: null,
    onunhandledrejection: null,
    postMessage: (message) => {
      posted.push(message as WorkerResponse);
    },
  };
  (globalThis as { self?: unknown }).self = fake;
  return fake;
}

async function send(message: WorkerRequest): Promise<void> {
  if (!self.onmessage) throw new Error('gameWorker did not register an onmessage handler');
  await self.onmessage({ data: message });
}

function lastTickResult(): Extract<WorkerResponse, { type: 'tickResult' }> {
  for (let i = posted.length - 1; i >= 0; i--) {
    if (posted[i]?.type === 'tickResult') return posted[i] as Extract<WorkerResponse, { type: 'tickResult' }>;
  }
  throw new Error('the worker did not answer with a tick result');
}

/** One RNG stream's live state, or `undefined` when this realm has not created it yet. */
function streamState(owner: string): number | undefined {
  return snapshotSimRng().owners.find(([name]) => name === owner)?.[1];
}

/** Mulberry32's state step per draw (see `simRng.mulberry32Advance`). */
const MULBERRY_STEP = 0x6d2b79f5;

describe('worker hand-off state', () => {
  beforeAll(async () => {
    await loadNames().catch(() => {});
    self = installWorkerSelf();
    const { installWorkerMessageHandlers } = await import('../src/game/simWorker/gameWorker');
    installWorkerMessageHandlers();
  });

  it('rebuilds the beauty field at the worker upload boundaries', () => {
    resetSimRng();
    const world = smallWorld();
    adoptSimSeedFromWorld(world);
    world.buildings.push(building(900001, BuildingType.Statue, { x: 300, y: 300 }));
    world.beautyGrid = undefined;

    // The load path's owner call, then the host upload (hydrate → invalidate → worker reset).
    const loaded = tinyLoad(world);
    expect(loaded.beautyGrid, 'loading must rebuild the beauty field').toBeDefined();

    invalidateWorldRuntimeCaches(world);
    const workerWorld = hydrateWorldRuntimeCaches(structuredClone(world));
    expect(workerWorld.beautyGrid, 'a worker import must not start without a beauty field').toBeDefined();
    expect(workerWorld.beautyGrid?.values.some((value) => value > 0)).toBe(true);
  });

  it('rolls an election back without skipping its id, then ships the result to the replica', () => {
    resetSimRng();
    const world = smallWorld();
    world.year = TERM_YEAR;
    world.dayInYear = 0;
    world.tick = TERM_YEAR * DAYS_PER_YEAR * TICKS_PER_DAY;

    const replica = hydrateWorldRuntimeCaches(structuredClone(world));
    const prep = extractSimPrep(world);
    expect(startElectionCeremony(world, TERM_YEAR, 'term')).toBe(true);
    const electionId = world.electionCeremony?.electionId ?? 0;
    expect(electionId).toBeGreaterThan(0);
    expect(world.nextElectionId).toBe(electionId + 1);

    // A failed tick during the ceremony must not consume the id: the retry reuses it.
    applySimPrep(world, prep);
    expect(world.nextElectionId).toBeUndefined();
    expect(world.electionCeremony).toBeNull();
    expect(startElectionCeremony(world, TERM_YEAR, 'term')).toBe(true);
    expect(world.electionCeremony?.electionId).toBe(electionId);

    const result = runVillageElection(world, TERM_YEAR, 'term');
    expect(result.leaderId).not.toBeNull();
    const residents = world.entities
      .filter((entity) => entity.alive && entity.type === EntityType.Human && !entity.faction)
      .slice(0, 2)
      .map((entity) => entity.id);
    world.pendingLeaderHouseResidentIds = residents;
    expect(world.lastElectionResult?.electionId).toBe(electionId);
    expect(world.nextElectionId).toBe(electionId + 1);

    const delta = extractSimTickDelta(world, world.entities.filter((entity) => entity.alive), {
      cloneMode: 'isolated',
    });
    applySimTickDelta(replica, structuredClone(delta));

    // The leadership panel reads these three off the replica; a dropped field freezes it.
    expect(replica.lastElectionResult).toEqual(world.lastElectionResult);
    expect(replica.nextElectionId).toBe(world.nextElectionId);
    expect(replica.pendingLeaderHouseResidentIds).toEqual(residents);

    // A full worker upload carries the same state into the new realm, like `GameWorkerHost.importSave`.
    invalidateWorldRuntimeCaches(world);
    const imported = hydrateWorldRuntimeCaches(structuredClone(world));
    expect(imported.lastElectionResult).toEqual(world.lastElectionResult);
    expect(imported.nextElectionId).toBe(world.nextElectionId);
    expect(imported.pendingLeaderHouseResidentIds).toEqual(residents);
    expect(imported.beautyGrid, 'the imported worker realm must start with a beauty field').toBeDefined();
  });

  it('keeps the beauty field across a rollback', () => {
    resetSimRng();
    const world = smallWorld();
    adoptSimSeedFromWorld(world);
    world.buildings.push(building(900002, BuildingType.Garden, { x: 400, y: 300 }));
    const prep = extractSimPrep(world);
    gameTick(world);
    applySimPrep(world, prep);

    expect(world.beautyGrid, 'a rollback must leave a usable beauty field').toBeDefined();
  });

  it('draws the same humanTick stream with and without a beauty field', () => {
    const drawsFor = (withGrid: boolean): { draws: number; state: number | undefined } => {
      resetSimRng();
      const world = smallWorld();
      adoptSimSeedFromWorld(world);
      const resident = human(900001, {
        x: 300,
        y: 300,
        partnerId: 900002,
        birthDay: 200,
        birthMonth: 5,
        energy: 100,
        maxEnergy: 100,
      });
      const partner = human(900002, {
        x: 312,
        y: 300,
        partnerId: 900001,
        birthDay: 201,
        birthMonth: 5,
        energy: 100,
        maxEnergy: 100,
      });
      world.entities = [resident, partner];
      world.buildings = [];
      world.weather = WeatherType.Clear;
      // A tick where the partner is chosen as company and the pair hangs out at 8–18 px.
      world.tick = findCompanyTick(resident.id);
      world.dayInYear = 0;
      if (withGrid) {
        const map = world.worldMap;
        if (!map) throw new Error('the fixture needs a world map');
        const grid = createBeautyGrid(map.width, map.height);
        const tx = Math.floor(resident.x / PATH_CELL);
        const ty = Math.floor(resident.y / PATH_CELL);
        grid.values[ty * grid.cols + tx] = 5;
        world.beautyGrid = grid;
      } else {
        world.beautyGrid = undefined;
      }
      getSimRng('humanTick');
      const before = streamState('humanTick') ?? 0;
      tickHumanLeisure({
        state: world,
        entity: resident,
        speed: 2,
        hourOfDay: getHourOfDay(world.tick),
        onSchedule: false,
        allowFreeRoam: true,
        inSpotlightGathering: false,
        allHumans: world.entities,
        entityById: new Map(world.entities.map((entity) => [entity.id, entity])),
        pickSocialBuilding: () => undefined,
        updatedBuildings: world.buildings,
        buildingById: new Map(),
        humanSocialGrid: undefined,
        width: world.width,
        height: world.height,
        livingHumanAt: (id) => (id == null ? undefined : world.entities.find((entity) => entity.id === id)),
        suppressIdleInitial: false,
        settlerChat: () => {},
        settlerPairChat: () => {},
        completedPoolOf: () => [],
        workersByWorkplace: new Map(),
        workerIndexById: new Map(),
        workplace: undefined,
        workSchedule: getWorkSchedule(world),
        idleVenues: [],
        festivalPerformers: undefined,
        treeGrid: undefined,
        trees: [],
        weekend: false,
      });
      const state = streamState('humanTick');
      const draws = state === undefined ? 0 : ((state - before) >>> 0) / MULBERRY_STEP;
      return { draws, state };
    };

    const withGrid = drawsFor(true);
    const withoutGrid = drawsFor(false);
    // The fixture really reaches the companion branch (guard against a vacuous pass).
    expect(withGrid.draws, 'the fixture must reach the companion beat').toBe(2);
    expect(withoutGrid.draws).toBe(2);
    expect(withoutGrid.state).toBe(withGrid.state);
  });

  it('clears the previous session faction-wander state on a worker session reset', async () => {
    resetSimRng();
    const world = smallWorld(SEED + 1);
    adoptSimSeedFromWorld(world);
    const rival = human(900010, { faction: 'rival', x: 100, y: 100 });
    world.entities = [rival];
    world.visitorGroups = [];
    world.tick = 0;

    // Populate the module-level wander state for this id (ensureWanderState draws and stores a target).
    tickFactionCampWander(world, rival, 500, 500, [], 2);
    const populated = streamState('factionWander');
    expect(populated).toBeDefined();

    // While the state exists the same id walks its stored target and draws nothing.
    tickFactionCampWander(world, rival, 500, 500, [], 2);
    expect(streamState('factionWander'), 'the stored wander state must be exercised').toBe(populated);

    // A full-world upload carries the live RNG positions, exactly like `GameWorkerHost.importSave`.
    const uploadedRng = snapshotSimRng();
    const upload = smallWorld(SEED + 1);
    const reused = human(900010, { faction: 'rival', x: 100, y: 100 });
    upload.entities = [reused];
    upload.visitorGroups = [];
    upload.tick = 0;
    upload.simRng = uploadedRng;
    await send({ type: 'init', proto: WORKER_PROTO, world: structuredClone(upload), features: [], headless: true });
    expect(streamState('factionWander'), 'the upload must restore the RNG positions').toBe(populated);

    tickFactionCampWander(upload, reused, 500, 500, [], 2);
    expect(
      streamState('factionWander'),
      'a reused visitor/rival id must re-plan instead of inheriting the old camp target',
    ).not.toBe(populated);
  });

  it('adopts a simulation pause on the tick result without letting a stale result resume it', async () => {
    resetSimRng();
    const world = smallWorld(SEED + 2);
    adoptSimSeedFromWorld(world);
    const replica = hydrateWorldRuntimeCaches(structuredClone(world));
    expect(replica.paused).toBe(false);

    await send({ type: 'init', proto: WORKER_PROTO, world: structuredClone(world), features: [], headless: true });
    await send({ type: 'setPaused', proto: WORKER_PROTO, paused: true });
    await send({ type: 'tick', proto: WORKER_PROTO });
    const result = lastTickResult();
    const delta = result.delta as SimTickDelta;

    expect(delta.paused).toBe(true);
    applySimTickDelta(replica, structuredClone(delta), { cloneMode: 'transfer' });
    expect(replica.paused, 'the pause overlay and diagnostics read the replica').toBe(true);

    // The simulation never resumes; an older unpaused snapshot must not undo the host's pause.
    applySimTickDelta(replica, extractSimTickDelta(world, world.entities.filter((entity) => entity.alive)));
    expect(replica.paused, 'only the host may resume a paused colony').toBe(true);
  });
});

/** The load owner's beauty rebuild, run through the real save/load boundary. */
function tinyLoad(world: WorldState): WorldState {
  const built = buildSaveData(world, createInitialView(world.width, world.height));
  const parsed = parseSaveJson(JSON.stringify(built));
  if (!parsed.valid) throw new Error('fixture save was refused');
  const loaded = loadGameFromParsed(parsed.parsed);
  if (!loaded) throw new Error('fixture load failed');
  return loaded.world;
}

/** First tick where the fixture resident picks its partner and stays within the companion radius. */
function findCompanyTick(entityId: number): number {
  // `leisureSlot` only advances every 80 in-game hours, so the fixture stays inside the first slot.
  const leisureSlot = entityId * 3;
  for (let tick = 0; tick < 80 * TICKS_PER_HOUR; tick++) {
    if (personDayRoll(entityId, tick, 510 + leisureSlot) >= 0.4) continue;
    if (personDayRoll(entityId, tick, 520 + leisureSlot) >= 0.78) continue;
    return tick;
  }
  throw new Error('the fixture has no companion tick');
}
