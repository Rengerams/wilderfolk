import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tryNeighborGreeting, tryWorkplaceBanter } from '../src/game/socialLife';
import { personDayRoll } from '../src/game/dayCycle';
import { isDialogueBusy, resetDialogueSessions } from '../src/game/humanChat';
import type { Entity } from '../src/game/gameTypes';

beforeEach(resetDialogueSessions);
afterEach(resetDialogueSessions);

function settler(id: number, x = 30, y = 30): Entity {
  return { id, x, y, name: `Settler ${id}`, alive: true } as Entity;
}

function eligibleTick(id: number, salt: number, chance: number): number {
  for (let tick = 1; tick < 10000; tick++) {
    if (personDayRoll(id, tick, salt) <= chance) return tick;
  }
  throw new Error('Expected an eligible deterministic social roll');
}

describe('social events use the one JSON dialogue session path', () => {
  it('keeps coworker work-shift and midday gates and links real participants', () => {
    const a = settler(301);
    const b = settler(302);
    const tick = eligibleTick(a.id, 720, 0.08);
    tryWorkplaceBanter(a, [b], tick, 12, false);
    expect(a.chatPhrase).toBeUndefined();
    tryWorkplaceBanter(a, [b], tick, 10, true);
    expect(a.chatPhrase).toBeUndefined();
    tryWorkplaceBanter(a, [b], tick, 12, true);
    expect(a.chatDialogueSessionKey).toBe(b.chatDialogueSessionKey);
    expect(isDialogueBusy(a)).toBe(true);
    expect(isDialogueBusy(b)).toBe(true);
    expect(a.chatPartnerId).toBe(b.id);
    expect(b.chatPartnerId).toBe(a.id);
  });

  it('allows only solo workplace speech when no eligible coworker exists', () => {
    const a = settler(301);
    const tick = eligibleTick(a.id, 720, 0.08);
    tryWorkplaceBanter(a, [], tick, 12, true);
    expect(a.chatPhrase).toBeDefined();
    expect(a.chatPartnerId).toBeUndefined();
  });

  it('keeps doorstep greeting distance and early-morning gates', () => {
    const a = settler(401, 10, 10);
    const b = settler(402, 20, 10);
    const tick = eligibleTick(a.id, 724 + Math.abs(b.id), 0.12);
    tryNeighborGreeting(a, b, tick, 12);
    expect(a.chatPhrase).toBeUndefined();
    b.x = 100;
    tryNeighborGreeting(a, b, tick, 8);
    expect(a.chatPhrase).toBeUndefined();
    b.x = 20;
    tryNeighborGreeting(a, b, tick, 8);
    expect(a.chatDialogueSessionKey).toBe(b.chatDialogueSessionKey);
    expect(a.chatPartnerId).toBe(b.id);
    expect(b.chatPartnerId).toBe(a.id);
  });
});
