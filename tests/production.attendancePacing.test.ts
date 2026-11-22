/**
 * Phase 1 production order, through the real `gameTick`:
 * - camera focus must not change how far a traveller walks (S-06),
 * - a crew paid on the rota but never at its post earns no output (W-136),
 * - a site no crew can be posted to finishes in its advertised days (S-18),
 * - the Defense preset raises barracks guards before the trades (W-09).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { gameTick } from '../src/game/gameEngine';
import { createBuilding, createEntity, initGame } from '../src/game/worldGen';
import { blockedColumn, testWorldMap } from '../src/test/worldMapFixtures';
import { buildingAccessPoint, isAtBuildingReach } from '../src/game/buildingAccess';
import { getReadOnlyPathGrid } from '../src/game/pathfinding';
import { BUILDING_CONFIGS } from '../src/game/buildings';
import { addResource, updateStorageCaps } from '../src/game/economy';
import {
  BuildingType,
  EntityType,
  JobType,
  MapSize,
  Season,
  WeatherType,
  type Building,
  type Entity,
  type WorldState,
} from '../src/game/gameTypes';
import type { SimulationFocus } from '../src/game/simFocus';
import { TICKS_PER_DAY, TICKS_PER_HOUR, tickAtDailyPhase } from '../src/game/dayCycleClock';
import { rebuildEntityByIdMap } from '../src/game/entityIndex';
import { invalidateCachedEntityByType } from '../src/game/entityTypeCache';
import { resetSimRng, setSimSeed } from '../src/game/simRng';
import { jobBuildingPriorityForPolicy } from '../src/game/workforcePolicy';
import { getWorkdayAttendance } from '../src/game/scheduleFatigue';
import { getWorkScheduleHours, getWorkSchedule } from '../src/game/workSchedule';
import { ensureEntitySkills, readSkill } from '../src/game/skills';

const TEST_SEED = 20_261_112;
const SETTLER_ID = 9001;
const ON_SCREEN: SimulationFocus = { minX: 0, maxX: 1000, minY: 0, maxY: 1000 };
const OFF_SCREEN: SimulationFocus = { minX: -3000, maxX: -2000, minY: -3000, maxY: -2000 };

/** An isolated 100 × 100-tile world; the generated colony is discarded, not reused. */
function isolatedWorld(blocked = false): WorldState {
  const state = initGame({
    size: MapSize.Medium,
    width: 1000,
    height: 1000,
    seed: TEST_SEED,
    skipTerrain: true,
  });
  state.worldMap = testWorldMap({
    tilesX: 100,
    tilesY: 100,
    seed: TEST_SEED,
    tileType: blocked ? blockedColumn(50) : undefined,
  });
  state.entities = [];
  state.buildings = [];
  state.nextEntityId = SETTLER_ID + 1;
  state.nextBuildingId = 9100;
  state.tick = TICKS_PER_DAY;
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
  rebuildEntityByIdMap(state);
  invalidateCachedEntityByType(state);
  return state;
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

function completedBuilding(type: BuildingType, x: number, y: number, id: number): Building {
  const building = createBuilding(type, x, y, id);
  building.completed = true;
  building.constructionProgress = 100;
  building.health = building.maxHealth;
  building.spriteScale = 1;
  return building;
}

function runTicks(state: WorldState, ticks: number, focus: SimulationFocus): void {
  for (let tick = 0; tick < ticks; tick++) gameTick(state, focus);
}

afterEach(() => {
  resetSimRng();
});

describe('focus does not change travel time (S-06)', () => {
  it('walks an out-of-focus settler as far per game tick as an in-focus one', () => {
    const focused = isolatedWorld();
    const offscreen = isolatedWorld();
    const start = { x: 100, y: 500 };

    for (const state of [focused, offscreen]) {
      // A separate house object per world: the two runs must not share mutable building state.
      const home = completedBuilding(BuildingType.House, 900, 500, 9100);
      state.buildings = [home];
      const walker = settler(start.x, start.y);
      walker.residenceBuildingId = home.id;
      state.entities = [walker];
      rebuildEntityByIdMap(state);
      invalidateCachedEntityByType(state);
      // 23:00: the settler walks home; the run stays clear of the midnight daily pass.
      state.tick = TICKS_PER_DAY + 23 * TICKS_PER_HOUR;
    }

    // Two focused ticks record the commanded walk in both worlds; then only the door changes.
    setSimSeed(TEST_SEED);
    runTicks(focused, 2, ON_SCREEN);
    setSimSeed(TEST_SEED);
    runTicks(offscreen, 2, ON_SCREEN);

    const focusedStart = { x: focused.entities[0].x, y: focused.entities[0].y };
    const offscreenStart = { x: offscreen.entities[0].x, y: offscreen.entities[0].y };
    expect(offscreenStart).toEqual(focusedStart);

    setSimSeed(TEST_SEED);
    runTicks(focused, 8, ON_SCREEN);
    setSimSeed(TEST_SEED);
    runTicks(offscreen, 8, OFF_SCREEN);

    const focusedDistance = Math.hypot(
      focused.entities[0].x - focusedStart.x,
      focused.entities[0].y - focusedStart.y,
    );
    const offscreenDistance = Math.hypot(
      offscreen.entities[0].x - offscreenStart.x,
      offscreen.entities[0].y - offscreenStart.y,
    );

    expect(focusedDistance, 'fixture premise: the settler is travelling').toBeGreaterThan(50);
    expect(offscreenDistance).toBeCloseTo(focusedDistance, 6);
  });

  it('arrives at the same doorstep while out of focus', () => {
    const focused = isolatedWorld();
    const offscreen = isolatedWorld();

    for (const state of [focused, offscreen]) {
      const home = completedBuilding(BuildingType.House, 900, 500, 9100);
      state.buildings = [home];
      const walker = settler(100, 500);
      walker.residenceBuildingId = home.id;
      state.entities = [walker];
      rebuildEntityByIdMap(state);
      invalidateCachedEntityByType(state);
      state.tick = TICKS_PER_DAY + 23 * TICKS_PER_HOUR;
    }

    // Two focused ticks record the same commanded walk in both worlds; the door then changes.
    setSimSeed(TEST_SEED);
    runTicks(focused, 2, ON_SCREEN);
    setSimSeed(TEST_SEED);
    runTicks(offscreen, 2, ON_SCREEN);

    // The rest of the walk happens overnight, so nobody has a reason to leave the doorstep again.
    setSimSeed(TEST_SEED);
    runTicks(focused, 60, ON_SCREEN);
    setSimSeed(TEST_SEED);
    runTicks(offscreen, 60, OFF_SCREEN);

    for (const [label, state] of [['in focus', focused], ['out of focus', offscreen]] as const) {
      const walker = state.entities[0];
      const home = state.buildings[0];
      expect(state.worldMap, `${label} fixture keeps its map`).toBeTruthy();
      const atDoor = isAtBuildingReach(walker, home, getReadOnlyPathGrid(state.worldMap!, [home]));
      expect(
        atDoor || walker.indoorBuildingId === home.id,
        `${label} settler reached the house`,
      ).toBe(true);
    }
  });
});

describe('production pays only witnessed attendance (W-136)', () => {
  it.each([
    { case: 'a scheduled crew that never reached the post', worker: { scheduleWorkedTicksToday: 108 }, mobile: false, ticks: 0 },
    { case: 'a scheduled crew witnessed for five ticks', worker: { scheduleWorkedTicksToday: 108, schedulePresentTicksToday: 5 }, mobile: false, ticks: 5 },
    { case: 'a resolved day with no shift', worker: { scheduleWorkedTicksToday: 0, schedulePresentTicksToday: 0, scheduleLastWorkedHours: 9 }, mobile: false, ticks: 108 },
    { case: 'a mobile hunter whose shift is the field', worker: { scheduleWorkedTicksToday: 108, schedulePresentTicksToday: 0 }, mobile: true, ticks: 108 },
    { case: 'a legacy save with only settled hours', worker: { scheduleLastWorkedHours: 6 }, mobile: false, ticks: 72 },
  ])('pays $case', ({ worker, mobile, ticks }) => {
    expect(getWorkdayAttendance(worker, mobile).ticks).toBe(ticks);
  });

  /** One farm, one assigned farmer and their starting position; the day runs 07:00 → 18:00 production. */
  function farmDay(blocked: boolean): { state: WorldState; farm: Building; worker: Entity } {
    const state = isolatedWorld(blocked);
    const farm = completedBuilding(BuildingType.Farm, 650, 500, 9101);
    state.buildings = [farm];
    if (!state.worldMap) throw new Error('fixture must supply a world map');
    // The canonical frontage: the on-post settler stands where the arrival rule accepts them.
    const onPost = buildingAccessPoint(farm, getReadOnlyPathGrid(state.worldMap, [farm]));
    // The west side of the full-height river can never reach the farm; the east side can.
    const worker = settler(blocked ? 350 : onPost.x, blocked ? 500 : onPost.y);
    worker.job = JobType.Farmer;
    worker.occupation = 'farmer';
    worker.workerBuildingId = farm.id;
    farm.occupants = [worker.id];
    state.entities = [worker];
    // Day 1 07:00: day 0's production anchor is tick 0, which the calendar gate rejects.
    state.tick = TICKS_PER_DAY + 7 * TICKS_PER_HOUR;
    rebuildEntityByIdMap(state);
    invalidateCachedEntityByType(state);
    return { state, farm, worker };
  }

  it('pays an on-post crew and pays a never-at-post crew nothing', () => {
    const onPost = farmDay(false);
    const absent = farmDay(true);

    // 07:00 → 18:00: the whole rota plus the production pass that reads it.
    runTicks(onPost.state, 1 + (18 - 7) * TICKS_PER_HOUR, ON_SCREEN);
    runTicks(absent.state, 1 + (18 - 7) * TICKS_PER_HOUR, ON_SCREEN);

    // The rota credited both crews; only one was ever witnessed at the post.
    expect(absent.worker.scheduleWorkedTicksToday ?? 0).toBeGreaterThan(0);
    expect(absent.worker.schedulePresentTicksToday ?? 0).toBe(0);
    expect(onPost.worker.schedulePresentTicksToday ?? 0).toBeGreaterThan(0);

    const onPostFood = onPost.state.economyLedger?.produced.farms ?? 0;
    const absentFood = absent.state.economyLedger?.produced.farms ?? 0;
    expect(onPostFood, 'the on-post crew produced food').toBeGreaterThan(0);
    expect(absentFood, 'rota credit is not presence').toBe(0);
  });

  it('prices and teaches only the workers who attended, never an absent roster member', () => {
    /** One production tick with the rota already settled: the fixture states attendance directly. */
    const runProduction = (withAbsentMaster: boolean) => {
      resetSimRng();
      const fixture = farmDay(false);
      fixture.worker.scheduleWorkedTicksToday = 108;
      fixture.worker.schedulePresentTicksToday = 108;
      fixture.worker.schedulePresentSiteIdToday = fixture.farm.id;
      let master: Entity | undefined;
      if (withAbsentMaster) {
        // Assigned and credited on the rota, but never witnessed at the post: the absent master.
        master = createEntity(EntityType.Human, 350, 500, SETTLER_ID + 1, 400, false, {
          gender: 'male', name: 'Master', surname: 'Reed', ageYears: 55, colonyDay: 0,
        });
        master.job = JobType.Farmer;
        master.occupation = 'farmer';
        master.workerBuildingId = fixture.farm.id;
        master.scheduleWorkedTicksToday = 108;
        master.schedulePresentTicksToday = 0;
        ensureEntitySkills(master).farmer = 50;
        fixture.farm.occupants.push(master.id);
        fixture.state.entities.push(master);
        rebuildEntityByIdMap(fixture.state);
        invalidateCachedEntityByType(fixture.state);
      }
      fixture.state.tick = tickAtDailyPhase(1, 'production') - 1;
      gameTick(fixture.state, ON_SCREEN);
      return {
        produced: fixture.state.economyLedger?.produced.farms ?? 0,
        attendingSkill: readSkill(fixture.worker, JobType.Farmer),
        masterSkill: master ? readSkill(master, JobType.Farmer) : undefined,
      };
    };

    const control = runProduction(false);
    const withMaster = runProduction(true);

    // The absent master's skill must not raise the crew's output multiplier...
    expect(withMaster.produced).toBe(control.produced);
    // ...and must not earn trade XP for a shift they never worked.
    expect(withMaster.masterSkill, 'absent roster member kept their old skill').toBe(50);
    expect(control.attendingSkill, 'the attending farmer learned the trade').toBeGreaterThan(0);
  });
});

/** Stamp the already-observed shift into the existing recorder's daily fields. */
function witnessSiteShift(worker: Entity, site: Building, ticks: number, job: JobType): void {
  worker.scheduleWorkedTicksToday = ticks;
  worker.scheduleWorkedSiteIdToday = site.id;
  worker.scheduleWorkedJobToday = job;
  worker.schedulePresentTicksToday = ticks;
  worker.schedulePresentSiteIdToday = site.id;
}

describe('crewless zero-slot sites finish in their advertised days (S-18)', () => {
  it.each([
    { type: BuildingType.Wall, days: BUILDING_CONFIGS[BuildingType.Wall].buildTime },
    { type: BuildingType.Barn, days: BUILDING_CONFIGS[BuildingType.Barn].buildTime },
    { type: BuildingType.Mill, days: BUILDING_CONFIGS[BuildingType.Mill].buildTime },
  ])('builds a crewless $type in its $days advertised day(s)', ({ type, days }) => {
    const state = isolatedWorld();
    const site = createBuilding(type, 500, 500, 9102);
    state.buildings = [site];
    // A settler is present but cannot be posted to a zero-slot site, so the site is its own builder.
    state.entities = [settler(300, 500)];
    rebuildEntityByIdMap(state);
    invalidateCachedEntityByType(state);

    let productionDay = 1;
    for (let elapsed = 0; elapsed < days - 1; elapsed++) {
      state.tick = tickAtDailyPhase(productionDay++, 'construction') - 1;
      gameTick(state, ON_SCREEN);
      expect(site.completed, `finishes early after ${elapsed + 1} day(s)`).toBe(false);
    }
    state.tick = tickAtDailyPhase(productionDay, 'construction') - 1;
    gameTick(state, ON_SCREEN);
    expect(site.completed, `finishes within ${days} advertised day(s)`).toBe(true);
    expect(site.occupants, 'a zero-slot site never keeps a crew').toEqual([]);
  });

  it.each([
    { type: BuildingType.Barn, resource: 'wood' as const },
    { type: BuildingType.Silo, resource: 'food' as const },
    { type: BuildingType.WoodStorehouse, resource: 'iron' as const },
  ])('refreshes $resource capacity when a $type completes at 23:00', ({ type, resource }) => {
    const state = isolatedWorld();
    const site = createBuilding(type, 500, 500, 9104);
    site.constructionProgress = 99;
    state.buildings = [site];
    state.entities = [settler(300, 500)];
    rebuildEntityByIdMap(state);
    invalidateCachedEntityByType(state);

    // This is the snapshot calculated before completion by the regular 18:00 owner.
    updateStorageCaps(state);
    const previousCap = state.storageMax[resource];
    const previousSpoilage = state.foodSpoilageRate;
    state.resources[resource] = previousCap;
    state.tick = tickAtDailyPhase(1, 'construction') - 1;
    gameTick(state, ON_SCREEN);

    expect(site.completed).toBe(true);
    expect(state.storageMax[resource], 'completion left the resource at its old cap')
      .toBeGreaterThan(previousCap);
    expect(addResource(state, resource, 100), 'an overnight gain still hits the obsolete cap').toBe(100);
    if (type === BuildingType.Silo) {
      expect(state.foodSpoilageRate, 'Silo spoilage remained on yesterday\'s rate')
        .toBeLessThan(previousSpoilage);
    }
  });

  it('lets a real crew beat those advertised days', () => {
    const advertised = BUILDING_CONFIGS[BuildingType.Farm].buildTime;
    const state = isolatedWorld();
    const site = createBuilding(BuildingType.Farm, 500, 500, 9103);
    site.completed = false;
    site.constructionProgress = 0;
    state.buildings = [site];
    // Two idle adults are exactly the pool construction hires from; a Farm takes a crew of two.
    state.entities = [SETTLER_ID, SETTLER_ID + 1].map((id) => createEntity(
      EntityType.Human, 380 + (id - SETTLER_ID) * 20, 500, id, 400, false,
      { gender: 'male', name: 'Bram', surname: 'Reed', ageYears: 30, colonyDay: 0 },
    ));
    site.occupants = state.entities.map((person) => person.id);
    rebuildEntityByIdMap(state);
    invalidateCachedEntityByType(state);

    const shiftTicks = getWorkScheduleHours(getWorkSchedule(state)) * TICKS_PER_HOUR;
    for (const worker of state.entities) witnessSiteShift(worker, site, shiftTicks, JobType.Farmer);
    state.tick = tickAtDailyPhase(1, 'construction') - 1;
    gameTick(state, ON_SCREEN);
    expect(site.completed, `one day of a crew is not enough for a ${advertised}-day advert`).toBe(false);
    for (const worker of state.entities) witnessSiteShift(worker, site, shiftTicks, JobType.Farmer);
    state.tick = tickAtDailyPhase(2, 'construction') - 1;
    gameTick(state, ON_SCREEN);
    expect(site.completed, 'a witnessed crew finishes ahead of the passive advertised days').toBe(true);
  });
});


describe('construction and production attendance are separate (PR #166 reviews)', () => {
  it.each([
    BuildingType.Church,
    BuildingType.TownHall,
    BuildingType.Hospital,
    BuildingType.Prison,
  ])('records witnessed construction at an unfinished %s', (type) => {
    const state = isolatedWorld();
    const site = createBuilding(type, 500, 500, 9200);
    site.completed = false;
    site.constructionProgress = 0;
    state.buildings = [site];
    const onPost = buildingAccessPoint(site, getReadOnlyPathGrid(state.worldMap!, [site]));
    const worker = settler(onPost.x, onPost.y);
    state.entities = [worker];
    site.occupants = [worker.id];
    rebuildEntityByIdMap(state);
    invalidateCachedEntityByType(state);

    // A real work tick, not a manually stamped attendance record.
    state.tick = TICKS_PER_DAY + (getWorkSchedule(state).startHour + 1) * TICKS_PER_HOUR - 1;
    gameTick(state, ON_SCREEN);
    expect(worker.scheduleWorkedSiteIdToday).toBe(site.id);
    expect(worker.schedulePresentSiteIdToday).toBe(site.id);
    expect(worker.schedulePresentTicksToday).toBeGreaterThan(0);
  });

  function constructionDay(extraTicks: number, experienced = false): {
    progress: number; food: number; finished: boolean; workerSkill: number;
  } {
    const state = isolatedWorld();
    const site = createBuilding(BuildingType.Mine, 500, 500, 9201);
    site.completed = false;
    site.constructionProgress = 0;
    state.buildings = [site];
    const senior = settler(450, 500);
    const junior = createEntity(EntityType.Human, 470, 500, SETTLER_ID + 1, 400, false,
      { gender: 'male', name: 'Luka', surname: 'Reed', ageYears: 30, colonyDay: 0 });
    if (experienced) senior.skills = { [JobType.Miner]: 100 };
    state.entities = [senior, junior];
    site.occupants = [senior.id, junior.id];
    rebuildEntityByIdMap(state);
    invalidateCachedEntityByType(state);
    const full = getWorkScheduleHours(getWorkSchedule(state)) * TICKS_PER_HOUR;
    // Keep an expert's simulated shift below the 100% cap so the helper's tick remains measurable.
    witnessSiteShift(senior, site, experienced ? Math.max(1, Math.floor(full / 4)) : full, JobType.Miner);
    if (extraTicks > 0) witnessSiteShift(junior, site, extraTicks, JobType.Miner);
    state.tick = tickAtDailyPhase(1, 'construction') - 1;
    gameTick(state, ON_SCREEN);
    return {
      progress: site.constructionProgress, food: state.resources.food,
      finished: site.completed, workerSkill: senior.skills?.[JobType.Miner] ?? 0,
    };
  }

  it('credits a witnessed 19:00–23:00 construction shift after 18:00', () => {
    const state = isolatedWorld();
    state.workSchedule = { startHour: 19, endHour: 23 };
    const site = createBuilding(BuildingType.Farm, 500, 500, 9203);
    state.buildings = [site];
    const onPost = buildingAccessPoint(site, getReadOnlyPathGrid(state.worldMap!, [site]));
    const worker = settler(onPost.x, onPost.y);
    state.entities = [worker];
    site.occupants = [worker.id];
    rebuildEntityByIdMap(state);
    invalidateCachedEntityByType(state);
    state.tick = tickAtDailyPhase(1, 'production') - 1;
    gameTick(state, ON_SCREEN);
    expect(site.constructionProgress, 'the shift has not started at 18:00').toBe(0);
    runTicks(state, 5 * TICKS_PER_HOUR, ON_SCREEN);
    expect(state.tick).toBe(tickAtDailyPhase(1, 'construction'));
    expect(worker.schedulePresentTicksToday).toBeGreaterThan(0);
    expect(site.constructionProgress).toBeGreaterThan(0);
    expect(readSkill(worker, JobType.Farmer)).toBeGreaterThan(0);
  });

  it('never lowers progress when a second builder contributes one tick', () => {
    const one = constructionDay(0);
    const extra = constructionDay(1);
    expect(one.finished).toBe(false);
    expect(extra.progress).toBeGreaterThan(one.progress);
  });

  it('does not dilute an expert when a weaker colleague helps briefly', () => {
    const expert = constructionDay(0, true);
    const withHelp = constructionDay(1, true);
    expect(expert.finished, 'slow expert fixture must remain below 100%').toBe(false);
    expect(withHelp.finished).toBe(false);
    expect(withHelp.progress).toBeGreaterThan(expert.progress);
  });

  it('does not pay 18:00 production for a site finished at 23:00', () => {
    const makeDay = (progress: number, previouslyCompleted: boolean) => {
      const state = isolatedWorld();
      const site = createBuilding(BuildingType.Farm, 500, 500, 9202);
      site.completed = previouslyCompleted;
      site.constructionProgress = progress;
      state.buildings = [site];
      const farmer = settler(450, 500);
      if (previouslyCompleted) {
        farmer.workerBuildingId = site.id;
        farmer.job = JobType.Farmer;
      }
      state.entities = [farmer];
      site.occupants = [farmer.id];
      rebuildEntityByIdMap(state);
      invalidateCachedEntityByType(state);
      const shift = getWorkScheduleHours(getWorkSchedule(state)) * TICKS_PER_HOUR;
      witnessSiteShift(farmer, site, shift, JobType.Farmer);
      state.tick = tickAtDailyPhase(1, 'production') - 1;
      gameTick(state, ON_SCREEN);
      const foodAtEvening = state.resources.food;
      state.tick = tickAtDailyPhase(1, 'construction') - 1;
      gameTick(state, ON_SCREEN);
      return { state, site, farmer, foodAtEvening };
    };
    const stillBuilding = makeDay(0, false);
    const justCompleted = makeDay(99, false);
    const operational = makeDay(100, true);

    expect(stillBuilding.site.completed).toBe(false);
    expect(justCompleted.site.completed).toBe(true);
    expect(justCompleted.farmer.skills?.[JobType.Farmer] ?? 0).toBeCloseTo(0.2, 8);
    expect(justCompleted.foodAtEvening).toBe(stillBuilding.foodAtEvening);
    expect(operational.foodAtEvening).toBeGreaterThan(justCompleted.foodAtEvening);
  });
});

describe('the Defense preset raises barracks guards first (W-09)', () => {
  it('assigns the idle settler to the Barracks before the Prison and the trades', () => {
    const state = isolatedWorld();
    state.workforcePolicy = 'defense';
    const barracks = completedBuilding(BuildingType.Barracks, 400, 400, 9110);
    const prison = completedBuilding(BuildingType.Prison, 500, 400, 9111);
    const tavern = completedBuilding(BuildingType.Tavern, 600, 400, 9112);
    const farm = completedBuilding(BuildingType.Farm, 700, 400, 9113);
    state.buildings = [tavern, farm, prison, barracks];
    const idle = settler(300, 400);
    state.entities = [idle];
    rebuildEntityByIdMap(state);
    invalidateCachedEntityByType(state);

    // 09:00 is an assignment sweep; the idle settler must take the guard post.
    state.tick = 9 * TICKS_PER_HOUR - 1;
    gameTick(state, ON_SCREEN);

    expect(idle.workerBuildingId).toBe(barracks.id);
    expect(barracks.occupants).toContain(idle.id);
  });

  it('ranks the guard posts above every trade in the preset order', () => {
    const barracksRank = jobBuildingPriorityForPolicy('defense', BuildingType.Barracks);
    const prisonRank = jobBuildingPriorityForPolicy('defense', BuildingType.Prison);
    expect(barracksRank).toBe(0);
    expect(prisonRank).toBeLessThan(jobBuildingPriorityForPolicy('defense', BuildingType.Mine));
    expect(prisonRank).toBeLessThan(jobBuildingPriorityForPolicy('defense', BuildingType.Tavern));
    expect(prisonRank).toBeLessThan(jobBuildingPriorityForPolicy('defense', BuildingType.Church));
  });
});
