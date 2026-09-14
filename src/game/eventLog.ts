import type { CombatLogKind, GameEventLog, WorldState } from './gameTypes';
import { addNotification } from './simEffects';

let nextEventLogId = 1;

/** Bound authoritative and presentation event history consistently. */
export const EVENT_LOG_MAX_ENTRIES = 2000;

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
  // Ids must be monotonic *per log*, not per realm. `nextEventLogId` is module state, and a
  // realm that receives a world (the simulation worker, or the optimistic display copy the
  // main thread builds from a worker snapshot) starts it at 1 while the imported log already
  // holds ids 1..N. `applySimTickDelta` drops incoming entries whose id already exists, so
  // every event that realm logged was silently discarded until its counter passed N.
  // `eventLog` is newest-first (unshift/pop), so its head carries the highest id: never
  // issue an id the log already uses.
  const newestId = state.eventLog[0]?.id ?? 0;
  if (newestId >= nextEventLogId) nextEventLogId = newestId + 1;

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
  if (state.eventLog.length > EVENT_LOG_MAX_ENTRIES) state.eventLog.pop();
}

/** Human death: chronicle entry + HUD notification. */
export function logDeath(
  state: WorldState,
  message: string,
  entityName?: string,
  focus?: { x: number; y: number },
): void {
  logEvent(state, 'death', message, entityName);
  addNotification(state, 'Death', message, 'warning', focus);
}

/** Legacy fallback for saves logged before combatKind existed. */
export function resolveCombatLogKind(evt: GameEventLog): CombatLogKind | null {
  if (evt.combatKind) return evt.combatKind;
  const msg = evt.message.toLowerCase();
  if (msg.includes('repelled') || msg.includes('routed')) return 'repelled';
  if (msg.includes('defending') || msg.includes('militia') || msg.includes('barricade')) return 'defense';
  if (msg.includes('raid')) {
    if (msg.includes('launched a raid on the village') || msg.includes('raid on the village')) {
      return 'incoming_raid';
    }
    if (msg.includes(' raid on ') || msg.startsWith('raid on ')) {
      return 'outgoing_raid';
    }
    return 'incoming_raid';
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