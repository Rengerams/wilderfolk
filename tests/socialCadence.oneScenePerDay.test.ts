/**
 * W-104/W-105/W-106: social scenes fire at most once per person per colony day, the movement
 * inspector reads the same social inputs as the simulation, and one stagger predicate is shared.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { personDayRoll } from '../src/game/simRng';
import {
  isGreetingHour,
  isSocialStaggerTick,
  pickSocialImpulse,
  tryNeighborGreeting,
  tryWorkplaceBanter,
} from '../src/game/socialLife';
import { resetDialogueSessions, tickHumanChat } from '../src/game/humanChat';
import { simAmbientChatNeighbors } from '../src/game/simulation/humanSocial';
import { explainSettlerMovement } from '../src/game/dashboardData';
import { initGame } from '../src/game/worldGen';
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

  it('does not replay a doorstep greeting after the first scene of the day', () => {
    const a = settler(401, 10, 10);
    const b = settler(402, 20, 10);
    const tick = eligibleTick(a.id, 724 + Math.abs(b.id), 0.12);

    tryNeighborGreeting(a, b, tick, 8);
    expect(a.chatDialogueSessionKey).toBeDefined();

    endScene(a, b);
    tryNeighborGreeting(a, b, tick + 1, 8);
    expect(a.chatDialogueSessionKey).toBeUndefined();
  });
});

describe('one shared social predicate (W-106)', () => {
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
      const withoutNeighbours = pickSocialImpulse(mother, state, state.buildings, [], []);
      const withSpouse = pickSocialImpulse(mother, state, state.buildings, [spouse], []);
      if (withoutNeighbours.building && withSpouse.motive === 'care_pregnant') chosen = tick;
    }
    expect(chosen, 'fixture premise: the two input sets disagree on this tick').toBeGreaterThanOrEqual(0);

    const explanation = explainSettlerMovement(state, mother.id);
    expect(explanation.stops.some((stop) => stop.kind === 'venue')).toBe(false);
  });
});
