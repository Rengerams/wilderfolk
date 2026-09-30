/*
 * Hunting Spot cleanup regression — BUG 2026-08-21-hunting-spot-bypasses-wildlife-cleanup.
 *
 * Daily Hunting Spot production must not duplicate a partial wildlife death
 * path. A successful kill must invoke the shared death and reverse-hunt-target
 * transitions, which keep tick-local indexes and spatial queries coherent.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  BuildingType,
  EntityType,
  JobType,
  Season,
  WeatherType,
} from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';

const cleanupSpies = vi.hoisted(() => ({
  markWildlifeDead: vi.fn(),
  clearHuntersTargetingPrey: vi.fn(),
}));

vi.mock('../src/game/simulation/simulationEntities', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/game/simulation/simulationEntities')>();
  return {
    ...actual,
    markWildlifeDead: (...args: Parameters<typeof actual.markWildlifeDead>) => {
      cleanupSpies.markWildlifeDead(...args);
      return actual.markWildlifeDead(...args);
    },
    clearHuntersTargetingPrey: (...args: Parameters<typeof actual.clearHuntersTargetingPrey>) => {
      cleanupSpies.clearHuntersTargetingPrey(...args);
      return actual.clearHuntersTargetingPrey(...args);
    },
  };
});

import { gameTick } from '../src/game/gameTick';
import { TICKS_PER_DAY } from '../src/game/dayCycle';

/**
 * These fixtures are ticked by the real `gameTick`, so `maxAge` and `reproductionCooldown` are
 * load-bearing: `tickWildlife` reads `entity.age >= entity.maxAge` for old-age death and
 * `Math.max(0, entity.reproductionCooldown - step)` every pulse — an absent cooldown is `NaN`,
 * which makes every downstream `<= 0` comparison false. Values match `SPECIES_CONFIG`.
 */
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
    job: JobType.Hunter,
    ...overrides,
  } as Entity;
}

function deer(id: number): Entity {
  return {
    id,
    type: EntityType.Deer,
    // Beside the hunter (100,100) on purpose. The spot's reach is now bodies touching — the owner's
    // ruling, *"120 px is way to far, its 1800's they dont have guns"* — so a deer 30 px away is
    // correctly *not* shot; in game the hunter walks to the animal (`huntingSpot.huntingSpotChaseTarget`,
    // applied in `humanTick`), which this fixture does not run.
    x: 112,
    y: 100,
    energy: 500,
    maxEnergy: 500,
    age: 10,
    maxAge: 4380,
    reproductionCooldown: 576,
    birthYear: 0,
    birthMonth: 0,
    birthDay: 0,
    alive: true,
    size: 12,
    speed: 1,
    vx: 0,
    vy: 0,
    flash: 0,
    animFrame: 0,
    spriteAngle: 0,
    childrenIds: [],
    generation: 0,
    isJuvenile: false,
  } as Entity;
}

function huntingSpot(occupants: number[]): Building {
  return {
    id: 10,
    type: BuildingType.HuntingSpot,
    x: 80,
    y: 80,
    width: 40,
    height: 40,
    occupants,
    level: 1,
    constructionProgress: 100,
    completed: true,
    health: 100,
    maxHealth: 100,
    spriteScale: 1,
    buildAnimTimer: 0,
    huntingSpotPrey: 'deer',
  };
}

function makeState(): WorldState {
  const hunter = human(1, { homeBuildingId: 10, huntTargetId: 2 });
  // The spot is staffed and the hunter is standing at it (occupant 1, at the building's centre). Both
  // are needed now: the hunt is anchored on the *hunter's* position rather than the building's, and a
  // spot whose worker is elsewhere does nothing (owner: a spot is a work location, not a turret).
  const prey = deer(2);
  return {
    // gameTick increments first: 71 -> 72 is the shared systems/assign/daily boundary.
    tick: 71,
    paused: false,
    speed: 1,
    width: 400,
    height: 300,
    entities: [hunter, prey],
    buildings: [huntingSpot([hunter.id])],
    resources: { wood: 500, stone: 500, food: 0, gold: 500, iron: 0 },
    storageMax: { wood: 1000, stone: 1000, food: 1000, gold: 1000, iron: 300 },
    season: Season.Spring,
    weather: WeatherType.Clear,
    year: 0,
    dayInYear: 1,
    notifications: [],
    bigNews: [],
    floatingTexts: [],
    deathParticles: [],
    nextFloatingTextId: 1,
    nextBuildingId: 100,
    nextEntityId: 100,
    eventLog: [],
    screenShakeImpulse: 0,
    totalBuildingsCompleted: 1,
    humanPopulation: 1,
    maxHumanPopulation: 10,
    workingSettlers: 1,
    idleSettlers: 0,
    villageName: 'Hunt Test',
    villageReputation: 50,
    challenges: [],
    autoSave: false,
    wildlifeCounts: {
      grass: 0, rabbits: 0, deer: 1, wolves: 0, foxes: 0, werewolves: 0, wildkin: 0, trees: 0,
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
    festival: null,
  } as unknown as WorldState;
}

describe('Hunting Spot wildlife cleanup', () => {
  it('uses the shared cleanup transitions when its daily hunt succeeds', () => {
    cleanupSpies.markWildlifeDead.mockClear();
    cleanupSpies.clearHuntersTargetingPrey.mockClear();
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);

    try {
      const state = makeState();
      const after = gameTick(state);

      // Wildlife is marked dead through the shared transition and then removed
      // from the authoritative entity collection at the end of the tick.
      expect(after.entities.find((entity) => entity.id === 2)).toBeUndefined();
      expect(cleanupSpies.markWildlifeDead).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: 2, type: EntityType.Deer }),
        undefined,
        TICKS_PER_DAY,
      );
      // The fourth argument is the tick's `byType` buckets: passing them scopes the reverse-hunt sweep
      // to HUNTER_TYPES instead of every living entity (`simulationEntities.clearHuntersTargetingPrey`,
      // audit H-1). Asserting it here is what stops the call site silently dropping back to the
      // full-entity scan.
      expect(cleanupSpies.clearHuntersTargetingPrey).toHaveBeenCalledWith(
        2,
        expect.any(Map),
        expect.any(Map),
        expect.any(Object),
      );
      expect(after.entities.find((entity) => entity.id === 1)?.huntTargetId).toBeUndefined();
    } finally {
      random.mockRestore();
    }
  });
});
