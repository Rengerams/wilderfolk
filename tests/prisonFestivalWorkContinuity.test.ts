/** Owner rulings: a prison is open 24 hours, and a festival does not suspend work. */
import { describe, expect, it } from 'vitest';
import { BuildingType, EntityType, JobType, Season, WeatherType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { gameTick } from '../src/game/gameTick';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/game/dayCycle';
import { getHourOfDay } from '../src/game/dayCycleClock';
import { isFestivalOverrideActive, isVenueServiceHour } from '../src/game/venueSchedule';
import { getHumanActivityStatus } from '../src/game/humanStatus';

const PRISON_ID = 10;
const PRISON_X = 600;
const PRISON_Y = 40;

function human(id: number, overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    type: EntityType.Human,
    x: 150,
    y: 60,
    energy: 100,
    maxEnergy: 100,
    age: 30,
    birthYear: 0,
    birthMonth: 0,
    birthDay: 0,
    maxAge: 90,
    reproductionCooldown: 0,
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
    job: JobType.Settler,
    ...overrides,
  };
}

function building(
  id: number,
  type: BuildingType,
  x: number,
  y: number,
  occupants: number[],
): Building {
  return {
    id,
    type,
    x,
    y,
    width: 48,
    height: 42,
    occupants,
    level: 1,
    constructionProgress: 100,
    completed: true,
    health: 100,
    maxHealth: 100,
    spriteScale: 1,
    buildAnimTimer: 0,
  };
}

/**
 * `gameTick` ticks the real owners, so `maxAge` and `reproductionCooldown` are load-bearing —
 * absent, wildlife old-age death is dead code and the cooldown decrement is `NaN`.
 */
function worldState(
  entities: Entity[],
  buildings: Building[],
  festival: WorldState['festival'],
): WorldState {
  return {
    entities,
    buildings,
    tick: 0,
    paused: false,
    speed: 1,
    width: 900,
    height: 400,
    resources: { wood: 500, stone: 500, food: 500, gold: 500, iron: 0 },
    storageMax: { wood: 1000, stone: 1000, food: 1000, gold: 1000, iron: 300 },
    season: Season.Spring,
    weather: WeatherType.Clear,
    year: 0,
    dayInYear: 0,
    notifications: [],
    bigNews: [],
    floatingTexts: [],
    deathParticles: [],
    nextFloatingTextId: 1,
    nextBuildingId: 100,
    nextEntityId: 100,
    eventLog: [],
    screenShakeImpulse: 0,
    totalBuildingsCompleted: 2,
    humanPopulation: 2,
    maxHumanPopulation: 10,
    workingSettlers: 1,
    idleSettlers: 1,
    villageName: 'Ruling Vale',
    villageReputation: 50,
    challenges: [],
    autoSave: false,
    wildlifeCounts: {
      grass: 0, rabbits: 0, deer: 0, wolves: 0, foxes: 0, werewolves: 0, wildkin: 0, trees: 0,
    },
    foodSpoilageRate: 0,
    biodiversityIndex: 100,
    pollutionLevel: 0,
    disasters: [],
    tradeRoutes: [],
    eventsThisYear: [],
    worldMap: null,
    yearlyStats: [],
    lifetimeStats: {},
    visitorGroups: [],
    rivalSettlements: [],
    pendingDiplomacyEvents: [],
    pendingRaidEvents: [],
    pendingOutgoingRaidEvents: [],
    ecoHealthYearsAbove80: 0,
    firstWeekVisitorSpawned: false,
    villageLeaderId: null,
    leaderSinceYear: 0,
    lastElectionYear: -1,
    pendingElectionYear: null,
    electionBuildupNotifiedYear: null,
    electionCeremony: null,
    researchNodes: [],
    unlockedTechs: [],
    activeResearch: null,
    researchProgress: 0,
    // The colony default: 07:00-16:00, the window a prison's night shift sits outside.
    workSchedule: { startHour: 7, endHour: 16 },
    festival,
  } as unknown as WorldState;
}

/**
 * A staffed Prison with one prisoner and a house far outside `COMMUTE_SNAP_DISTANCE` (200), so a
 * guard sent home has to walk back — the distance a night duty would lose.
 */
function prisonWorld(): { state: WorldState; prison: Building; nightGuard: Entity } {
  const house = building(20, BuildingType.House, 40, 40, [1, 2, 3]);
  const prison = building(PRISON_ID, BuildingType.Prison, PRISON_X, PRISON_Y, [1, 2, 3, 4]);
  // Crew order decides the shift in week 0: morning, afternoon, night.
  const morning = human(1, { job: JobType.PrisonGuard, homeBuildingId: PRISON_ID, residenceBuildingId: 20, x: 60, y: 60 });
  const afternoon = human(2, { job: JobType.PrisonGuard, homeBuildingId: PRISON_ID, residenceBuildingId: 20, x: 80, y: 60 });
  const night = human(3, { job: JobType.PrisonGuard, homeBuildingId: PRISON_ID, residenceBuildingId: 20, x: 608, y: 71 });
  const prisoner = human(4, {
    prisonBuildingId: PRISON_ID,
    prisonerUntilTick: 1000,
    prisonSentenceCrime: 'scandal',
    x: 608,
    y: 71,
  });
  const state = worldState([morning, afternoon, night, prisoner], [house, prison], null);
  return { state, prison, nightGuard: night };
}

/** A working farm, a working tavern, a settler with no shift, and a festival through the afternoon. */
function festivalWorkWorld(): { state: WorldState; farmer: Entity; innkeeper: Entity; idler: Entity } {
  const house = building(20, BuildingType.House, 400, 200, [1, 2]);
  const farm = building(10, BuildingType.Farm, 30, 40, [1]);
  const tavern = building(30, BuildingType.Tavern, 250, 40, [2]);
  const farmer = human(1, { job: JobType.Farmer, homeBuildingId: 10, residenceBuildingId: 20 });
  const innkeeper = human(2, { job: JobType.Innkeeper, homeBuildingId: 30, residenceBuildingId: 20 });
  const idler = human(3);
  const state = worldState(
    [farmer, innkeeper, idler],
    [house, farm, tavern],
    { active: true, name: 'Test Festival', daysLeft: 3 },
  );
  state.tick = 15 * TICKS_PER_HOUR - 1;
  return { state, farmer, innkeeper, idler };
}

describe('a prison is open 24 hours', () => {
  it('holds the post at 02:00 — an hour inside the night shift, outside the work window', () => {
    const { state, prison, nightGuard } = prisonWorld();
    // From the top of the day, so the whole rotation is walked and every clock hour is sampled.
    state.tick = 0;

    let atTwoOClock: number | null = null;
    for (let i = 0; i < 71; i++) {
      gameTick(state);
      if (getHourOfDay(state.tick) !== 2) continue;
      atTwoOClock = Math.hypot(
        nightGuard.x - (prison.x + prison.width / 2),
        nightGuard.y - (prison.y + prison.height / 2),
      );
    }

    // The rostered night guard (23:00-08:00) stood on the post, not at home in bed.
    expect(atTwoOClock).not.toBeNull();
    expect(atTwoOClock!).toBeLessThanOrEqual(55);
    // And no clock hour of that day was recorded unguarded: nothing closed the prison.
    expect(prison.uncoveredPrisonHours ?? []).toEqual([]);
  });

  it('holds every clock hour with a crew larger than the watch, which rests a guard each day', () => {
    // The owner's report was "prisoners escape with 8 guards on the roster". The shift rows name three
    // of the crew and list the rest as off duty, so the risk is a rotation that leaves an hour open.
    const house = building(20, BuildingType.House, 40, 40, []);
    const prison = building(PRISON_ID, BuildingType.Prison, PRISON_X, PRISON_Y, []);
    const guards = [1, 2, 3, 4].map((id) =>
      human(id, { job: JobType.PrisonGuard, homeBuildingId: PRISON_ID, residenceBuildingId: 20, x: 608, y: 71 }),
    );
    const prisoner = human(
      9,
      { prisonBuildingId: PRISON_ID, prisonerUntilTick: 1000, prisonSentenceCrime: 'scandal', x: 608, y: 71 },
    );
    house.occupants = guards.map((guard) => guard.id);
    prison.occupants = [...guards.map((guard) => guard.id), prisoner.id];
    const state = worldState([...guards, prisoner], [house, prison], null);
    state.tick = 0;

    for (let day = 0; day < 3; day++) {
      for (let t = 0; t < TICKS_PER_DAY; t++) {
        gameTick(state);
        // Read before the day boundary's pulse clears the list, or the day's own hours are invisible.
        if (t === TICKS_PER_DAY - 1) {
          expect(prison.uncoveredPrisonHours ?? [], `day ${day} hours with nobody on the post`).toEqual([]);
        }
      }
    }
  });
});

describe('settlers keep working during a festival', () => {
  it('keeps a farmer on his shift working at 15:00 on a festival day', () => {
    const { state, farmer } = festivalWorkWorld();
    gameTick(state);

    // Attendance is the job: the schedule owner credits every tick spent on shift.
    expect(farmer.scheduleWorkedTicksToday ?? 0).toBeGreaterThan(0);
    // The farm is left of him; the festival crowd is not where he went.
    expect(farmer.vx).toBeLessThan(0);
  });

  it('labels the settler on shift as working and the free one as gathering', () => {
    const { state, farmer, idler } = festivalWorkWorld();
    gameTick(state);

    // One verdict, read by the tick and by the label: the two cannot disagree about who gathers.
    expect(getHumanActivityStatus(state, farmer)).not.toBe('Gathering at festival');
    expect(getHumanActivityStatus(state, idler)).toBe('Gathering at festival');
  });

  it('still keeps the tavern open all day during a festival', () => {
    const { state, innkeeper } = festivalWorkWorld();

    expect(isVenueServiceHour(state, 'tavern', 15, false)).toBe(false);
    expect(isVenueServiceHour(state, 'tavern', 15, true)).toBe(true);
    expect(isFestivalOverrideActive(state, 'tavern')).toBe(true);

    gameTick(state);
    expect(innkeeper.scheduleWorkedTicksToday ?? 0).toBeGreaterThan(0);
  });
});
