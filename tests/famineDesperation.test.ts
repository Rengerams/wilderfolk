/**
 * Famine desperation comedy — BITE joke.
 *
 * When food is truly gone and a settler is starving, the most desperate adult
 * may lunge at a neighbour's foot. Deliberately NON-LETHAL: no death, no energy
 * loss. The victim is not amused, so the pair's friendship score drops.
 */
import { describe, expect, it } from 'vitest';
import { EntityType } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import { tickFamineDesperation } from '../src/game/famineDesperation';
import { getSimRng, setSimSeed } from '../src/game/simRng';
import { friendshipScore } from '../src/game/relationships';
import { TICKS_PER_DAY } from '../src/game/dayCycle';

function human(id: number, energyRatio: number): Entity {
  return {
    id,
    type: EntityType.Human,
    x: 100,
    y: 100,
    energy: Math.round(500 * energyRatio),
    maxEnergy: 500,
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
    name: `Settler${id}`,
  };
}

/**
 * Force the famine-desperation RNG stream into a state where the attempt roll
 * succeeds: the module uses `getSimRng('famine-desperation')`, seeded from the
 * run seed, so we set a seed and pick one whose first draws trigger a bite.
 */
function seedThatFiresBite(): number {
  for (let seed = 1; seed < 5000; seed++) {
    setSimSeed(seed);
    const rng = getSimRng('famine-desperation');
    if (rng() < 0.15) {
      setSimSeed(seed); // re-seed so the real call sees this same draw
      return seed;
    }
  }
  throw new Error('no seed produced a firing bite attempt');
}

function makeState(): { state: WorldState; attacker: Entity; victim: Entity } {
  seedThatFiresBite();
  const attackerId = 1;
  const attacker = human(attackerId, 0.1); // starving
  const victim = human(9001, 0.9); // comfortable
  // They are friends before the bite (score 60).
  attacker.friendships = { [`friend_${victim.id}`]: 60 };
  victim.friendships = { [`friend_${attacker.id}`]: 60 };

  const state = {
    tick: TICKS_PER_DAY,
    paused: false,
    speed: 1,
    width: 500,
    height: 320,
    resources: { wood: 0, stone: 0, food: 0, gold: 0, iron: 0 },
    storageMax: { wood: 100, stone: 100, food: 100, gold: 100, iron: 0 },
    season: 'spring',
    weather: 'clear',
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
    totalBuildingsCompleted: 0,
    humanPopulation: 2,
    maxHumanPopulation: 10,
    workingSettlers: 0,
    idleSettlers: 2,
    villageName: 'Test Vale',
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
    festival: null,
  } as unknown as WorldState;
  state.entities = [attacker, victim];
  state.buildings = [];
  return { state, attacker, victim };
}

describe('famine desperation bite (joke)', () => {
  it('is a no-op when there is food', () => {
    const { state } = makeState();
    state.resources.food = 10;
    tickFamineDesperation(state, state.entities);
    expect(state.eventLog).toHaveLength(0);
  });

  it('is a no-op with only one adult', () => {
    const { state, attacker } = makeState();
    state.entities = [attacker]; // victim removed
    tickFamineDesperation(state, state.entities);
    expect(state.eventLog).toHaveLength(0);
  });

  it('starving settler lunges, friendship drops, nobody dies or loses energy', () => {
    const { state, attacker, victim } = makeState();

    const attackerEnergyBefore = attacker.energy;
    const victimEnergyBefore = victim.energy;
    const before = friendshipScore(attacker, victim.id);

    tickFamineDesperation(state, state.entities);

    // Comedy fired: notification + event log entry.
    expect(state.eventLog.length).toBeGreaterThan(0);
    expect(state.notifications.length).toBeGreaterThan(0);
    expect(state.eventLog[0].message).toMatch(/foot/i);

    // Non-lethal: both alive, energy untouched.
    expect(attacker.alive).toBe(true);
    expect(victim.alive).toBe(true);
    expect(attacker.energy).toBe(attackerEnergyBefore);
    expect(victim.energy).toBe(victimEnergyBefore);

    // Victim is not amused — friendship went down.
    const after = friendshipScore(attacker, victim.id);
    expect(after).toBeLessThan(before);
    expect(after).toBeGreaterThanOrEqual(0);
  });
});
