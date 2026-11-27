import { describe, expect, it } from 'vitest';
import type { CombatLogKind, CombatLogStage, GameEventLog, WorldState } from '../src/game/gameTypes';
import { logEvent, selectRaidBattleEvents, summarizeCombatEvents } from '../src/game/eventLog';
import { formatChronicleCSV } from '../src/game/eventLogExport';

function entry(id: number, combatKind: CombatLogKind, combatStage: CombatLogStage, message: string): GameEventLog {
  return { id, tick: id, year: 0, day: 1, type: 'combat', message, combatKind, combatStage };
}

describe('raid chronicle lifecycle and combat stats', () => {
  it('isolates overlapping raids against the same rival, orders old-to-new and suppresses duplicate casualty summaries', () => {
    const tag = (id: number, message: string, raidId = 'a', tick = id, kind: CombatLogKind = 'outgoing_raid', stage: CombatLogStage = 'casualties') =>
      ({ ...entry(id, kind, stage, message), tick, raidId, entityName: 'Hillford' });
    const fallen = tag(4, 'Village fighter killed: Mara — fell raiding Hillford', 'a', 14);
    const logs = [
      tag(8, 'Battle ended', 'a', 16, 'outgoing_raid', 'resolved'),
      tag(7, 'Other war ended', 'b', 15, 'defense', 'resolved'),
      tag(6, 'Fallen in the fighting at Hillford: Mara.', 'a', 14),
      tag(5, '1 villager fell on the raid against Hillford (Mara)', 'a', 14),
      fallen, fallen, tag(3, 'First assault', 'a', 12, 'outgoing_raid', 'dispatched'),
      tag(2, 'Previous fight', 'old', 11, 'outgoing_raid', 'resolved'),
    ];
    expect(selectRaidBattleEvents(logs, { raidId: 'a', rivalName: 'Hillford', incoming: false,
      baselineId: 0, startedAtTick: 10, endedAtTick: 16 }).map((event) => event.id)).toEqual([3, 4, 8]);
  });

  it('does not drop distinct named deaths with identical text or an incomplete casualty summary', () => {
    const row = { ...entry(1, 'outgoing_raid', 'casualties', 'Village fighter killed: Alex'), tick: 20, raidId: 'a', entityName: 'Hillford' };
    const summary = { ...row, id: 3, message: '3 villagers fell on the raid against Hillford (Alex, Alex, Robin)' };
    expect(selectRaidBattleEvents([summary, { ...row, id: 2 }, row], {
      raidId: 'a', rivalName: 'Hillford', incoming: false, baselineId: 0,
    }).map((event) => event.id)).toEqual([1, 2, 3]);
  });

  it('scopes legacy reports to the correct side and bounded time window, including repelled defenses', () => {
    const legacy = (id: number, tick: number, kind: CombatLogKind, stage: CombatLogStage, name = 'Hillford') =>
      ({ ...entry(id, kind, stage, 'Report ' + id), tick, entityName: name });
    const logs = [legacy(5, 25, 'repelled', 'resolved'), legacy(4, 23, 'outgoing_raid', 'resolved'),
      legacy(3, 22, 'defense', 'dispatched'), legacy(2, 20, 'defense', 'resolved', 'Other'),
      legacy(1, 10, 'defense', 'resolved')];
    expect(selectRaidBattleEvents(logs, { rivalName: 'Hillford', incoming: true, baselineId: 0,
      startedAtTick: 20, endedAtTick: 25 }).map((event) => event.id)).toEqual([3, 5]);
    expect(selectRaidBattleEvents(logs, { rivalName: 'Hillford', incoming: true, baselineId: 0 })).toEqual([]);
  });

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

  it('writes stage metadata into the live Chronicle', () => {
    const state = { tick: 14, year: 0, dayInYear: 1, eventLog: [] } as unknown as WorldState;
    logEvent(state, 'combat', 'Rivals are marching', 'Rivals', 'incoming_raid', 'dispatched', 'raid-test');
    expect(state.eventLog[0]).toMatchObject({ combatKind: 'incoming_raid', combatStage: 'dispatched', raidId: 'raid-test' });
    expect(summarizeCombatEvents(state.eventLog).raids).toBe(1);
  });
});
