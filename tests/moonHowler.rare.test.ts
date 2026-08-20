/**
 * Moon Howler rarity — SIMULATION_AUTHORITY.md §5 + Objective 10.
 *
 * The curse path must be a RARE replacement event, not a guaranteed
 * every-full-moon spawn:
 *   - a surviving cursed Howler makes later full moons quiet (it returns
 *     instead — never a second curse);
 *   - after a kill/cure, full moons may be quiet;
 *   - a replacement appears only through MOON_HOWLER_REPLACEMENT_CHANCE;
 *   - a full moon never guarantees a new Howler.
 *
 * RNG is injectable (`rng` param on shouldApplyNewMoonHowlerCurse /
 * tickMoonHowlerCycle) so quiet moons, survivor returns, and rare
 * replacements are deterministic.
 */
import { describe, expect, it } from 'vitest';
import { DAYS_PER_MOON_CYCLE, NIGHT_START } from '../src/game/dayCycleConstants';
import { EntityType, Season, WeatherType } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import {
  MOON_HOWLER_REPLACEMENT_CHANCE,
  countActiveMoonHowlerCurses,
  shouldApplyNewMoonHowlerCurse,
  tickMoonHowlerCycle,
} from '../src/game/moonHowler';
import { collectSimulationInvariantErrors } from '../src/game/simulation/simulationInvariants';

const FULL_MOON_NIGHTFALL = { colonyDay: DAYS_PER_MOON_CYCLE, hourOfDay: NIGHT_START };

function human(id: number, overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    type: EntityType.Human,
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
    job: 'settler' as Entity['job'],
    gender: 'male',
    ...overrides,
  } as Entity;
}

function makeState(entities: Entity[]): WorldState {
  return {
    entities,
    buildings: [],
    tick: DAYS_PER_MOON_CYCLE * 72 + NIGHT_START * 3,
    paused: false,
    speed: 1,
    width: 400,
    height: 300,
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
    totalBuildingsCompleted: 0,
    humanPopulation: 0,
    maxHumanPopulation: 0,
    workingSettlers: 0,
    idleSettlers: 0,
    villageName: 'Moonville',
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
  } as unknown as WorldState;
}

function sevenAdults(): Entity[] {
  return Array.from({ length: 7 }, (_, i) => human(i + 1, { gender: i % 2 === 0 ? 'male' : 'female' }));
}

describe('Moon Howler rarity (Objective 10)', () => {
  it('a surviving cursed Howler makes the full moon quiet — no second curse', () => {
    const { colonyDay, hourOfDay } = FULL_MOON_NIGHTFALL;
    const survivor = human(1, { moonHowlerCursed: true });
    // Even a rng that would pass the replacement roll cannot double-curse.
    expect(shouldApplyNewMoonHowlerCurse(colonyDay, hourOfDay, 10, 1, () => 0.001)).toBe(false);
    void survivor;
  });

  it('a full moon after a kill is QUIET when the replacement roll fails', () => {
    const { colonyDay, hourOfDay } = FULL_MOON_NIGHTFALL;
    expect(
      shouldApplyNewMoonHowlerCurse(colonyDay, hourOfDay, 10, 0, () => MOON_HOWLER_REPLACEMENT_CHANCE + 0.01),
    ).toBe(false);
  });

  it('a replacement Howler appears only through the rare roll', () => {
    const { colonyDay, hourOfDay } = FULL_MOON_NIGHTFALL;
    expect(
      shouldApplyNewMoonHowlerCurse(colonyDay, hourOfDay, 10, 0, () => MOON_HOWLER_REPLACEMENT_CHANCE - 0.01),
    ).toBe(true);
  });

  it('the base gates still hold regardless of rng', () => {
    const { colonyDay, hourOfDay } = FULL_MOON_NIGHTFALL;
    expect(shouldApplyNewMoonHowlerCurse(colonyDay, hourOfDay, 5, 0, () => 0.001)).toBe(false); // too few humans
    expect(shouldApplyNewMoonHowlerCurse(colonyDay, NIGHT_START - 1, 10, 0, () => 0.001)).toBe(false); // wrong hour
    expect(shouldApplyNewMoonHowlerCurse(1, hourOfDay, 10, 0, () => 0.001)).toBe(false); // not full moon
  });

  it('cycle: quiet moon with a survivor returns the same Howler, never a replacement', () => {
    const survivor = human(1, { moonHowlerCursed: true });
    const others = sevenAdults().filter((h) => h.id !== 1);
    const state = makeState([survivor, ...others]);
    const entityById = new Map(state.entities.map((e) => [e.id, e]));

    tickMoonHowlerCycle(
      state,
      state.entities,
      [],
      FULL_MOON_NIGHTFALL.colonyDay,
      FULL_MOON_NIGHTFALL.hourOfDay,
      entityById,
      undefined,
      () => 0.001, // would pass the replacement roll if it were reachable
    );

    const cursed = state.entities.filter((e) => e.alive && e.moonHowlerCursed);
    expect(cursed.length).toBe(1);
    expect(cursed[0]!.id).toBe(1); // the SAME survivor
    expect(collectSimulationInvariantErrors(state)).toEqual([]);
  });

  it('cycle: quiet full moon after the Howler is gone (roll fails)', () => {
    const state = makeState(sevenAdults());
    const entityById = new Map(state.entities.map((e) => [e.id, e]));

    tickMoonHowlerCycle(
      state,
      state.entities,
      [],
      FULL_MOON_NIGHTFALL.colonyDay,
      FULL_MOON_NIGHTFALL.hourOfDay,
      entityById,
      undefined,
      () => 0.99,
    );

    expect(countActiveMoonHowlerCurses(state.entities)).toBe(0);
    expect(state.bigNews.some((n) => n.text.includes('Curse'))).toBe(false);
  });

  it('cycle: rare replacement roll curses exactly one settler', () => {
    const state = makeState(sevenAdults());
    const entityById = new Map(state.entities.map((e) => [e.id, e]));

    tickMoonHowlerCycle(
      state,
      state.entities,
      [],
      FULL_MOON_NIGHTFALL.colonyDay,
      FULL_MOON_NIGHTFALL.hourOfDay,
      entityById,
      undefined,
      () => 0.001,
    );

    const cursed = state.entities.filter((e) => e.alive && e.moonHowlerCursed);
    expect(cursed.length).toBe(1);
    expect(cursed[0]!.isJuvenile).toBe(false);
    expect(collectSimulationInvariantErrors(state)).toEqual([]);
  });
});
