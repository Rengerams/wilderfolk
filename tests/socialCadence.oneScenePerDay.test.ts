/**
 * W-104/W-105/W-106: social scenes fire at most once per person per colony day, the movement
 * inspector reads the same social inputs as the simulation, and one stagger predicate is shared.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PERSON_DAY_ROLL_SALTS, personDayRoll, personPairDayRoll } from '../src/game/simRng';
import {
  isGreetingHour,
  isSocialStaggerTick,
  pickSocialImpulse,
  tryNeighborGreeting,
  tryWorkplaceBanter,
} from '../src/game/socialLife';
import { resetDialogueSessions, tickHumanChat } from '../src/game/humanChat';
import { simAmbientChatNeighbors } from '../src/game/simulation/humanSocial';
import { explainHumanMovement } from '../src/game/movementExplanation';
import { createBuilding, initGame } from '../src/game/worldGen';
import { BuildingType, EntityType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { isPlayerHuman } from '../src/game/playerHuman';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/game/dayCycle';

beforeEach(resetDialogueSessions);
afterEach(resetDialogueSessions);

function settler(id: number, x = 30, y = 30): Entity {
  return { id, type: EntityType.Human, x, y, name: `Settler ${id}`, alive: true } as Entity;
}

/** Run the real session owner until the scene ends, so the next call is tested on the day gate. */
function endScene(a: Entity, b: Entity): void {
  const resolve = (id: number) => (id === a.id ? a : id === b.id ? b : undefined);
  for (let guard = 0; guard < 100 && (a.chatDialogueSessionKey || b.chatDialogueSessionKey); guard++) {
    tickHumanChat(a, resolve);
    tickHumanChat(b, resolve);
  }
}

function eligibleTick(id: number, salt: number, chance: number): number {
  for (let tick = 1; tick < 20_000; tick++) {
    if (personDayRoll(id, tick, salt) <= chance) return tick;
  }
  throw new Error('Expected an eligible deterministic social roll');
}

/** The greeting gate rolls the PAIR, so eligibility needs both ids and the fixed greeting salt. */
function eligiblePairTick(a: number, b: number, salt: number, chance: number): number {
  for (let tick = 1; tick < 20_000; tick++) {
    if (personPairDayRoll(a, b, tick, salt) <= chance) return tick;
  }
  throw new Error('Expected an eligible deterministic pair roll');
}

describe('one social scene per person per colony day (W-104)', () => {
  it('does not replay coworker banter after the first scene of the day', () => {
    const a = settler(301);
    const b = settler(302);
    const tick = eligibleTick(a.id, 720, 0.08);

    tryWorkplaceBanter(a, [b], tick, 12, true);
    expect(a.chatDialogueSessionKey).toBe(b.chatDialogueSessionKey);
    expect(a.chatDialogueSessionKey).toBeDefined();

    // The 4-tick scene has finished; the same day's day roll still passes, but the pair is spent.
    endScene(a, b);
    tryWorkplaceBanter(a, [b], tick + 1, 12, true);
    expect(a.chatDialogueSessionKey).toBeUndefined();
    expect(b.chatDialogueSessionKey).toBeUndefined();
  });

  it('does not mix a doorstep greeting and workplace banter on the same day', () => {
    const a = settler(501, 10, 10);
    const neighbor = settler(502, 20, 10);
    const mate = settler(503, 30, 30);

    // Find one colony day on which both the greeting and the banter rolls pass.
    const greetingSalt = 724 + Math.abs(neighbor.id);
    let greetTick = -1;
    let banterTick = -1;
    for (let day = 1; day < 400 && greetTick < 0; day++) {
      const start = day * TICKS_PER_DAY;
      const end = start + TICKS_PER_DAY;
      let g = -1;
      let b = -1;
      for (let tick = start; tick < end; tick++) {
        if (g < 0 && personPairDayRoll(a.id, neighbor.id, tick, PERSON_DAY_ROLL_SALTS.socialGreeting) <= 0.12) g = tick;
        if (b < 0 && personDayRoll(a.id, tick, 720) <= 0.08) b = tick;
      }
      if (g >= 0 && b >= 0) { greetTick = g; banterTick = b; }
    }
    expect(greetTick, 'no day has both eligible rolls').toBeGreaterThan(0);

    tryNeighborGreeting(a, neighbor, greetTick, 8);
    expect(a.chatDialogueSessionKey, 'the greeting did not fire').toBeDefined();
    endScene(a, neighbor);

    // Same person, same colony day, different event family: the day is already spent.
    tryWorkplaceBanter(a, [mate], banterTick, 12, true);
    expect(a.chatDialogueSessionKey).toBeUndefined();
    expect(mate.chatDialogueSessionKey).toBeUndefined();
  });

  it('does not replay a doorstep greeting after the first scene of the day', () => {
    const a = settler(401, 10, 10);
    const b = settler(402, 20, 10);
    const tick = eligiblePairTick(a.id, b.id, PERSON_DAY_ROLL_SALTS.socialGreeting, 0.12);

    tryNeighborGreeting(a, b, tick, 8);
    expect(a.chatDialogueSessionKey).toBeDefined();

    endScene(a, b);
    tryNeighborGreeting(a, b, tick + 1, 8);
    expect(a.chatDialogueSessionKey).toBeUndefined();
  });
});

describe('one shared social predicate (W-106)', () => {
  it('hashes both ids so a pair decision cannot reuse a fixed single-person salt (F-2)', () => {
    const tick = 6 * TICKS_PER_DAY;
    const greeting = new Set<number>();
    const comfort = new Set<number>();
    for (let other = 1; other <= 200; other++) {
      greeting.add(personPairDayRoll(9, other, tick, PERSON_DAY_ROLL_SALTS.socialGreeting));
      comfort.add(personPairDayRoll(9, other, tick, PERSON_DAY_ROLL_SALTS.socialWearyComfort));
    }
    // The old `salt + id` arithmetic collided with the fixed greeting/comfort salts for ids 1-2.
    expect(greeting.size, 'greeting pair rolls collapse across partner ids').toBeGreaterThan(190);
    expect(comfort.size, 'comfort pair rolls collapse across partner ids').toBeGreaterThan(190);
  });

  it('exposes one stagger bucket and one greeting window', () => {
    const a = settler(401);
    const bucketTick = 6 - (a.id % 6);
    expect(isSocialStaggerTick(a, bucketTick)).toBe(true);
    expect(isSocialStaggerTick(a, bucketTick + 1)).toBe(false);

    expect(isGreetingHour(6)).toBe(true);
    expect(isGreetingHour(8)).toBe(true);
    expect(isGreetingHour(9)).toBe(true);
    expect(isGreetingHour(5)).toBe(false);
    expect(isGreetingHour(10)).toBe(false);
    expect(isGreetingHour(Number.NaN)).toBe(false);
  });

  it('routes the simulation neighbour scan through the same stagger bucket', () => {
    const a = settler(401);
    const b = settler(402, 34, 30);
    const offBucket = 6 - (a.id % 6) + 1;
    const onBucket = 6 - (a.id % 6);

    expect(simAmbientChatNeighbors(a, offBucket, undefined, [a, b], 500, 500)).toEqual([]);
    expect(
      simAmbientChatNeighbors(a, onBucket, undefined, [a, b], 500, 500).map((entity) => entity.id),
    ).toContain(b.id);
  });
});

describe('movement inspector reads the real social input (W-105)', () => {
  it('names no venue when the settler is actually minding a pregnant spouse', () => {
    const state: WorldState = initGame({ skipTerrain: true, seed: 424242 });
    const adults = state.entities.filter((entity) =>
      entity.type === EntityType.Human && entity.alive && entity.age >= 18 && isPlayerHuman(entity));
    const mother = adults[0]!;
    const spouse = adults[1]!;
    mother.partnerId = spouse.id;
    spouse.partnerId = mother.id;
    mother.relationshipStatus = 'married';
    spouse.relationshipStatus = 'married';
    spouse.pregnant = true;
    spouse.x = mother.x;
    spouse.y = mother.y;

    const market = {
      id: state.nextBuildingId++, type: BuildingType.Market, x: mother.x + 8, y: mother.y,
      width: 40, height: 30, occupants: [], level: 1, constructionProgress: 100,
      completed: true, health: 100, maxHealth: 100,
    } as unknown as Building;
    state.buildings.push(market);

    // A weekend mid-morning tick whose unqualified impulse names the market but whose real
    // input (the nearby pregnant spouse) is the partner-care motive.
    let chosen = -1;
    for (let day = 5; day < 40 && chosen < 0; day += 7) {
      const tick = day * TICKS_PER_DAY + 10 * TICKS_PER_HOUR;
      state.tick = tick;
      const withoutNeighbours = pickSocialImpulse(mother, state, state.buildings, []);
      const withSpouse = pickSocialImpulse(mother, state, state.buildings, [spouse]);
      if (withoutNeighbours.building && withSpouse.motive === 'care_pregnant') chosen = tick;
    }
    expect(chosen, 'fixture premise: the two input sets disagree on this tick').toBeGreaterThanOrEqual(0);

    const explanation = explainHumanMovement(state, mother.id);
    expect(explanation.stops.some((stop) => stop.kind === 'venue')).toBe(false);
  });
});

describe('social motives respect needs, mutual relationships and completed errands', () => {
  it('does not send a healthy early pregnancy or a stale energy mirror to the ward', () => {
    const state = initGame({ skipTerrain: true, seed: 424242 });
    const person = state.entities.find((e) => e.alive && isPlayerHuman(e) && e.age >= 18)!;
    person.energy = 1;
    person.needs = { nutrition: 90, rest: 90, stamina: 90, severeHungerTicks: 0 };
    person.pregnant = true;
    person.pregnancyProgress = 1;
    person.pregnancyDueProgress = 100;
    person.griefUntilTick = 0;
    const ward = createBuilding(BuildingType.Hospital, person.x, person.y, 10001);
    ward.completed = true;
    ward.occupants = [10002];
    for (let day = 1; day < 30; day++) {
      state.tick = day * TICKS_PER_DAY + 12 * TICKS_PER_HOUR;
      const impulse = pickSocialImpulse(person, state, [ward], []);
      expect(impulse.motive).not.toBe('hospital_visit');
      expect(impulse.motive).not.toBe('sick_day');
    }
    person.needs = { ...person.needs, stamina: 10 };
    expect(pickSocialImpulse(person, state, [ward], []).motive).toBe('sick_day');
  });

  it('checks mutual spouse links rather than a stale one-way marriage', () => {
    const state = initGame({ skipTerrain: true, seed: 424242 });
    const adults = state.entities.filter((e) => e.alive && isPlayerHuman(e) && e.age >= 18);
    const [person, spouse] = adults;
    person.relationshipStatus = spouse.relationshipStatus = 'married';
    person.partnerId = spouse.id;
    spouse.partnerId = person.id;
    spouse.pregnant = true;
    let found = false;
    for (let day = 1; day < 60; day++) {
      state.tick = day * TICKS_PER_DAY + 12 * TICKS_PER_HOUR;
      if (pickSocialImpulse(person, state, [], [spouse]).motive !== 'care_pregnant') continue;
      found = true;
      spouse.partnerId = undefined;
      expect(pickSocialImpulse(person, state, [], [spouse]).motive).not.toBe('care_pregnant');
      break;
    }
    expect(found).toBe(true);
  });

  it('chooses the nearest completed venue in either pool order and skips a completed errand', () => {
    const state = initGame({ skipTerrain: true, seed: 424242 });
    const person = state.entities.find((e) => e.alive && isPlayerHuman(e) && e.age >= 18)!;
    person.workerBuildingId = undefined;
    person.pregnant = false;
    person.griefUntilTick = 0;
    const near = createBuilding(BuildingType.Market, person.x + 10, person.y, 10001);
    near.completed = true;
    const far = { ...near, id: 10002, x: person.x + 100 };
    let found = false;
    for (let day = 1; day < 100; day++) {
      state.tick = day * TICKS_PER_DAY + 10 * TICKS_PER_HOUR;
      if (pickSocialImpulse(person, state, [far, near], []).motive !== 'market_errand') continue;
      found = true;
      expect(pickSocialImpulse(person, state, [far, near], []).building?.id).toBe(near.id);
      expect(pickSocialImpulse(person, state, [near, far], [], () => [near, far]).building?.id).toBe(near.id);
      person.socialErrands = { day, market: true };
      expect(pickSocialImpulse(person, state, [far, near], []).motive).not.toBe('market_errand');
      break;
    }
    expect(found).toBe(true);
  });
});
