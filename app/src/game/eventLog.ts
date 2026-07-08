import type { CombatLogKind, GameEventLog, WorldState } from './gameTypes';

let nextEventLogId = 1;

/** Restore monotonic ids after loading a save. */
export function syncEventLogIdFromState(state: Pick<WorldState, 'eventLog'>): void {
  if (state.eventLog.length > 0) {
    nextEventLogId = Math.max(...state.eventLog.map((e) => e.id)) + 1;
  }
}

export function logEvent(
  state: WorldState,
  type: GameEventLog['type'],
  message: string,
  entityName?: string,
  combatKind?: CombatLogKind,
): void {
  state.eventLog.unshift({
    id: nextEventLogId++,
    tick: state.tick,
    year: state.year,
    day: state.dayInYear,
    type,
    message,
    entityName,
    combatKind,
  });
  if (state.eventLog.length > 2000) state.eventLog.pop();
}

/** Legacy fallback for saves logged before combatKind existed. */
export function resolveCombatLogKind(evt: GameEventLog): CombatLogKind | null {
  if (evt.combatKind) return evt.combatKind;
  const msg = evt.message.toLowerCase();
  if (msg.includes('repelled') || msg.includes('routed')) return 'repelled';
  if (msg.includes('defending') || msg.includes('militia') || msg.includes('barricade')) return 'defense';
  if (msg.includes('raid')) {
    return msg.includes('raid on ') ? 'outgoing_raid' : 'incoming_raid';
  }
  return null;
}

export function summarizeCombatEvents(events: GameEventLog[]): {
  raids: number;
  defended: number;
  repelled: number;
  total: number;
} {
  let raids = 0;
  let defended = 0;
  let repelled = 0;
  for (const evt of events) {
    const kind = resolveCombatLogKind(evt);
    if (kind === 'incoming_raid' || kind === 'outgoing_raid') raids += 1;
    if (kind === 'defense') defended += 1;
    if (kind === 'repelled') repelled += 1;
  }
  return { raids, defended, repelled, total: events.length };
}