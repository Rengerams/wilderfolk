/**
 * Phase 2 contracts:
 * - S-11: a deliberate invariant violation fails the dev/test tick path, and `colonyHealth` carries
 *   the same collector's errors into a failing stall verdict;
 * - S-14: an ordinary work commute starts at the shift minus the lead and is not damped below the
 *   priced commute pace;
 * - S-15: an unharmed autumn herd recovers toward its base size, a hunted one does not, and the herd
 *   remembers the deer actually placed rather than the number requested.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { gameTick } from '../src/game/gameEngine';
import { createBuilding, createEntity, initGame } from '../src/game/worldGen';
import { testWorldMap } from '../src/test/worldMapFixtures';
import { isAtBuildingReach } from '../src/game/buildingAccess';
import { COMMUTE_CONFIG, commuteWalkSpeed, WORK_COMMUTE_RUSH } from '../src/game/commuteReach';
import { commuteDistanceToBuilding, commuteLeadHoursFor } from '../src/game/simulation/humanMovement';
import { SPECIES_CONFIG } from '../src/game/speciesConfig';
import {
  HERD_BASE_SIZE,
  HERD_MIN_SIZE,
  MIGRATION_WINDOW_DAYS,
  migrationArrivalDay,
  tickMigration,
} from '../src/game/migration';
import { DAYS_PER_YEAR, TICKS_PER_DAY, TICKS_PER_HOUR, getHourOfDay } from '../src/game/dayCycle';
import {
  BuildingType,
  EntityType,
  JobType,
  MapSize,
  Season,
  TerrainType,
  WeatherType,
  type Building,
  type Entity,
  type WorldState,
} from '../src/game/gameTypes';
import { rebuildEntityByIdMap } from '../src/game/entityIndex';
import { invalidateCachedEntityByType } from '../src/game/entityTypeCache';
import { resetSimRng, setSimSeed } from '../src/game/simRng';
import {
  assessColonyStall,
  assertColonyNotStalled,
  createColonyObserver,
  sampleDelta,
} from '../scripts/colonyHealth';

const FLAT_SEED = 20_261_112;
const SETTLER_ID = 9001;
const SHIFT_DAY = 8;
const SHIFT_START_TICK = SHIFT_DAY * TICKS_PER_DAY + 7 * TICKS_PER_HOUR;
/** Walking speed priced by `commuteLeadHoursFor` and used by `commuteHumanToBuilding`. */
const COMMUTE_PACE = commuteWalkSpeed(
  SPECIES_CONFIG[EntityType.Human].speed,
  WORK_COMMUTE_RUSH,
) * COMMUTE_CONFIG.PATH_STEER_SPEED_RATIO;

/** A flat, isolated 1000 × 1000 px world; the generated colony is discarded, not reused. */
function flatWorld(): WorldState {
  const state = initGame({
    size: MapSize.Medium,
    width: 1000,
    height: 1000,
    seed: FLAT_SEED,
    skipTerrain: true,
  });
  state.worldMap = testWorldMap({ tilesX: 100, tilesY: 100, seed: FLAT_SEED });
  state.entities = [];
  state.buildings = [];
  state.nextEntityId = SETTLER_ID + 1;
  state.nextBuildingId = 9100;
  state.tick = SHIFT_DAY * TICKS_PER_DAY;
  state.weather = WeatherType.Clear;
  state.season = Season.Spring;
  state.villageLeaderId = null;
  state.electionCeremony = null;
  state.pendingElectionYear = null;
  state.festival = null;
  state.spotlightLore = null;
  state.inventionFair = null;
  state.visitorGroups = [];
  state.pendingRaidEvents = [];
  state.pendingOutgoingRaidEvents = [];
  state.pendingDiplomacyEvents = [];
  state.pendingStoryEvents = [];
  state.resources.food = 50;
  state.resources.wood = 500;
  rebuildEntityByIdMap(state);
  invalidateCachedEntityByType(state);
  return state;
}

function completedBuilding(
  state: WorldState,
  type: BuildingType,
  x: number,
  y: number,
  id: number,
): Building {
  const building = createBuilding(type, x, y, id);
  building.completed = true;
  building.constructionProgress = 100;
  building.health = building.maxHealth;
  building.spriteScale = 1;
  state.buildings.push(building);
  return building;
}

function settler(x: number, y: number): Entity {
  return createEntity(EntityType.Human, x, y, SETTLER_ID, 400, false, {
    gender: 'male',
    name: 'Aster',
    surname: 'Reed',
    ageYears: 30,
    colonyDay: 0,
  });
}

/** One home at the west edge and one workplace 500 px east, on the same walkable line. */
function longCommuteWorld(withRoads: boolean): { state: WorldState; home: Building; work: Building; worker: Entity } {
  const state = flatWorld();
  const home = completedBuilding(state, BuildingType.House, 120, 500, 9100);
  const work = completedBuilding(state, BuildingType.Farm, 620, 500, 9101);
  if (withRoads) {
    for (let x = 100; x <= 640; x += 40) {
      completedBuilding(state, BuildingType.Road, x, 500, 9200 + x);
    }
  }
  const worker = settler(home.x, home.y);
  worker.residenceBuildingId = home.id;
  worker.workerBuildingId = work.id;
  worker.job = JobType.Farmer;
  worker.isJuvenile = false;
  state.entities = [worker];
  home.occupants = [worker.id];
  work.occupants = [worker.id];
  rebuildEntityByIdMap(state);
  invalidateCachedEntityByType(state);
  return { state, home, work, worker };
}

afterEach(() => {
  resetSimRng();
});

describe('invariant gate (S-11)', () => {
  it('fails the dev/test tick on a deliberate violation and colonyHealth reports it', () => {
    const ticked = flatWorld();
    ticked.tick = 71;
    // A clean daily pass must not fail: the assertion has to be able to stay quiet.
    expect(() => gameTick(ticked)).not.toThrow();

    ticked.villageLeaderId = 999_999;
    ticked.tick = 143;
    expect(() => gameTick(ticked)).toThrow(/Simulation invariants violated/);

    // The health owner carries the same collector's errors: a violation that a later observation
    // no longer reports still fails the stall verdict for the run.
    const observed = flatWorld();
    const observer = createColonyObserver(observed);
    const violating = observer.observe(90, sampleDelta(observed), ['human 7 is deliberately broken']);
    const repaired = observer.observe(93, sampleDelta(observed), []);
    expect(violating.invariants.violations).toBe(1);
    expect(violating.invariants.sample[0]).toContain('deliberately broken');
    expect(repaired.invariants.violations).toBe(0);

    const verdict = assessColonyStall({
      world: observed,
      snapshots: [violating],
      final: repaired,
      newBuildingsAtEnd: 0,
    });
    expect(verdict.stalled).toBe(true);
    expect(verdict.reasons).toContain('invariant-violation');
    expect(verdict.evidence.join(' ')).toContain('deliberately broken');
    expect(() => assertColonyNotStalled(verdict, 'test run')).toThrow(/invariant-violation/);
  });
});

describe('ordinary work commute (S-14)', () => {
  it('starts at the shift minus the lead and arrives by shift start', () => {
    setSimSeed(FLAT_SEED);
    const { state, work, worker } = longCommuteWorld(true);
    const leadHours = commuteLeadHoursFor(
      commuteDistanceToBuilding(worker, work),
      SPECIES_CONFIG[EntityType.Human].speed,
    );
    const expectedDepartureTick = SHIFT_START_TICK - Math.floor(leadHours * TICKS_PER_HOUR);
    state.tick = SHIFT_DAY * TICKS_PER_DAY + 5 * TICKS_PER_HOUR;

    let departureTick: number | null = null;
    let departureSpeed = 0;
    let arrivalTick: number | null = null;
    for (let tick = 0; tick < 3 * TICKS_PER_HOUR; tick++) {
      gameTick(state);
      if (arrivalTick == null && isAtBuildingReach(worker, work)) arrivalTick = state.tick;
      if (departureTick == null) {
        const speed = Math.hypot(worker.vx, worker.vy);
        if (speed >= 20) {
          departureTick = state.tick;
          departureSpeed = speed;
        }
      }
    }

    expect(departureTick, 'the work walk opens on the commute lead').toBe(expectedDepartureTick);
    expect(leadHours).toBeGreaterThan(1);
    expect(departureSpeed, 'the lead is priced at the undamped commute pace')
      .toBeGreaterThanOrEqual(COMMUTE_PACE * 0.99);
    expect(arrivalTick).not.toBeNull();
    expect(arrivalTick!, 'the worker reaches the post by shift start').toBeLessThanOrEqual(SHIFT_START_TICK);
  });

  it('does not damp a work walk below its priced pace after the shift starts', () => {
    setSimSeed(FLAT_SEED);
    const { state, work, worker } = longCommuteWorld(false);
    // This deliberately starts too late for the full lead, so the walk is still running at 07:00.
    state.tick = SHIFT_START_TICK - TICKS_PER_HOUR / 2;

    const shiftSpeeds: number[] = [];
    let arrivalTick: number | null = null;
    for (let tick = 0; tick < 2 * TICKS_PER_HOUR; tick++) {
      gameTick(state);
      if (arrivalTick == null && isAtBuildingReach(worker, work)) {
        arrivalTick = state.tick;
        break;
      }
      if (getHourOfDay(state.tick) >= 7) {
        const speed = Math.hypot(worker.vx, worker.vy);
        if (speed > 0.1) shiftSpeeds.push(speed);
      }
    }

    expect(arrivalTick, 'the worker arrives within the sampled window').not.toBeNull();
    expect(arrivalTick!, 'a 30-minute head start cannot beat a longer commute').toBeGreaterThan(SHIFT_START_TICK);
    expect(shiftSpeeds.length).toBeGreaterThan(1);
    expect(Math.min(...shiftSpeeds), 'the shift-time walk keeps the priced commute pace')
      .toBeGreaterThanOrEqual(COMMUTE_PACE * 0.99);
  });
});

describe('autumn herd memory (S-15)', () => {
  it('recovers one deer per unharmed autumn toward the base size', () => {
    const state = initGame({ size: MapSize.Medium, seed: 42 });
    // Real generated terrain, with predators removed so the pass really is unharmed; the contract
    // under test is herd memory, not a second predator model.
    state.entities = state.entities.filter((entity) =>
      entity.type !== EntityType.Wolf && entity.type !== EntityType.Fox);
    const arrival = migrationArrivalDay(state.worldMap!.seed);
    state.migrationNextHerdSize = 6;

    state.tick = arrival * TICKS_PER_DAY;
    tickMigration(state, state.entities);
    expect(state.activeMigration?.spawned).toBe(6);

    state.tick = (arrival + MIGRATION_WINDOW_DAYS) * TICKS_PER_DAY;
    tickMigration(state, state.entities);
    // An unharmed pass restores one deer, not the whole herd at once.
    expect(state.migrationNextHerdSize).toBe(7);

    state.tick = (arrival + DAYS_PER_YEAR) * TICKS_PER_DAY;
    tickMigration(state, state.entities);
    expect(state.activeMigration?.spawned).toBe(7);
    state.tick = (arrival + DAYS_PER_YEAR + MIGRATION_WINDOW_DAYS) * TICKS_PER_DAY;
    tickMigration(state, state.entities);
    expect(state.migrationNextHerdSize).toBe(8);
    expect(state.migrationNextHerdSize).toBeLessThanOrEqual(HERD_BASE_SIZE);
  });

  it('does not recover in the autumn the herd was hunted', () => {
    const state = initGame({ size: MapSize.Medium, seed: 42 });
    state.entities = state.entities.filter((entity) =>
      entity.type !== EntityType.Wolf && entity.type !== EntityType.Fox);
    const arrival = migrationArrivalDay(state.worldMap!.seed);
    state.migrationNextHerdSize = 6;

    state.tick = arrival * TICKS_PER_DAY;
    tickMigration(state, state.entities);
    let killed = 0;
    for (const deer of state.entities) {
      if (deer.type !== EntityType.Deer || deer.migrationTag !== 0 || !deer.alive) continue;
      if (killed >= 2) break;
      deer.alive = false;
      killed++;
    }
    state.tick = (arrival + MIGRATION_WINDOW_DAYS) * TICKS_PER_DAY;
    tickMigration(state, state.entities);

    expect(killed).toBe(2);
    expect(state.migrationNextHerdSize).toBe(HERD_MIN_SIZE);

    // The next unharmed autumn resumes the recovery from the hunted memory.
    state.tick = (arrival + DAYS_PER_YEAR) * TICKS_PER_DAY;
    tickMigration(state, state.entities);
    state.tick = (arrival + DAYS_PER_YEAR + MIGRATION_WINDOW_DAYS) * TICKS_PER_DAY;
    tickMigration(state, state.entities);
    expect(state.migrationNextHerdSize).toBe(HERD_MIN_SIZE + 1);
  });

  it('remembers the deer it placed, not the number it requested', () => {
    const state = flatWorld();
    // Every tile is river: the edge strip and the ring fallback both place nothing.
    state.worldMap = testWorldMap({
      tilesX: 100,
      tilesY: 100,
      seed: 7,
      tileType: () => TerrainType.River,
    });
    state.migrationNextHerdSize = 7;
    state.tick = migrationArrivalDay(7) * TICKS_PER_DAY;
    tickMigration(state, state.entities);

    expect(state.activeMigration?.spawned).toBe(0);
    expect(state.entities.filter((entity) =>
      entity.type === EntityType.Deer && entity.migrationTag === 0)).toEqual([]);
  });
});
