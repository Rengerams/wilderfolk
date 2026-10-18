import { describe, expect, it } from 'vitest';
import type { CombatLogKind, CombatLogStage, GameEventLog, WorldState } from '../src/game/gameTypes';
import { logEvent, resolveCombatLogStage, summarizeCombatEvents } from '../src/game/eventLog';
import { formatChronicleCSV } from '../src/game/eventLogExport';

function entry(id: number, combatKind: CombatLogKind, combatStage: CombatLogStage, message: string): GameEventLog {
  return { id, tick: id, year: 0, day: 1, type: 'combat', message, combatKind, combatStage };
}

describe('raid chronicle lifecycle and combat stats', () => {
  it('counts departures, not outcomes or casualties, as launched raids', () => {
    const entries = [
      entry(7, 'incoming_raid', 'resolved', 'Raid from Stonefall succeeded'),
      entry(6, 'defense', 'casualties', '2 villagers fell defending against Stonefall'),
      entry(5, 'incoming_raid', 'dispatched', 'Stonefall launched a raid on the village'),
      entry(4, 'outgoing_raid', 'resolved', 'Raid on Eastwood succeeded'),
      entry(3, 'outgoing_raid', 'dispatched', 'Raid dispatched toward Eastwood'),
      entry(2, 'outgoing_raid', 'cancelled', 'War-band broke off'),
      entry(1, 'outgoing_raid', 'challenge', 'Declared hostility toward Eastwood'),
    ];
    expect(summarizeCombatEvents(entries)).toEqual({ raids: 2, defended: 1, repelled: 0, total: 7 });
    expect(formatChronicleCSV(entries).split('\n')[0]).toBe(
      'id,tick,year,day,type,message,entityName,combatKind,combatStage',
    );
    expect(formatChronicleCSV(entries)).toContain('"incoming_raid","dispatched"');
  });

  it('records a successful defense once, even when casualties are logged', () => {
    const entries = [
      entry(3, 'repelled', 'resolved', 'Militia routed the enemy'),
      entry(2, 'defense', 'casualties', 'Villagers fell defending against rivals'),
      entry(1, 'incoming_raid', 'dispatched', 'Rivals launched a raid on the village'),
    ];
    expect(summarizeCombatEvents(entries)).toEqual({ raids: 1, defended: 1, repelled: 1, total: 3 });
  });

  it('classifies legacy combat logs without stage fields', () => {
    const old = (id: number, kind: CombatLogKind, message: string): GameEventLog => ({
      id, tick: id, year: 0, day: 0, type: 'combat', message, combatKind: kind,
    });
    const entries = [
      old(4, 'defense', '1 villager fell defending against Eastwood'),
      old(3, 'repelled', 'Barricade repelled the raid'),
      old(2, 'incoming_raid', 'Eastwood launched a raid on the village'),
      old(1, 'outgoing_raid', 'Declared hostility toward Eastwood'),
    ];
    expect(entries.map(resolveCombatLogStage)).toEqual(['casualties', 'resolved', 'dispatched', 'challenge']);
    expect(summarizeCombatEvents(entries)).toEqual({ raids: 1, defended: 1, repelled: 1, total: 4 });
  });

  it('writes stage metadata into the live Chronicle', () => {
    const state = { tick: 14, year: 0, dayInYear: 1, eventLog: [] } as unknown as WorldState;
    logEvent(state, 'combat', 'Rivals are marching', 'Rivals', 'incoming_raid', 'dispatched');
    expect(state.eventLog[0]).toMatchObject({ combatKind: 'incoming_raid', combatStage: 'dispatched' });
    expect(summarizeCombatEvents(state.eventLog).raids).toBe(1);
  });
});
