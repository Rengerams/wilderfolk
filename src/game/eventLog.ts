import { formatCitizenName } from './citizenId';
import { BuildingType } from './buildings';
import type { CombatLogKind, CombatLogStage, GameEventLog, WorldState } from './gameTypes';
import { addNotification } from './simEffects';

let nextEventLogId = 1;

/** Rolling window of the most recent chronicle entries; everything older is dropped. */
export const EVENT_LOG_MAX_ENTRIES = 20000;

/** Load repair: unique ids, and no more entries than the writers' own cap keeps. */
export function repairEventLogOnLoad(state: Pick<WorldState, 'eventLog'>): void {
  const seen = new Set<unknown>();
  const kept = state.eventLog.filter((entry) => {
    if (seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  });
  // Newest-first throughout, so a cap keeps the head (index 0) and discards the oldest tail — the
  // same end the tick trim (`pop`) and the worker delta merge (`slice(0, …)`) drop.
  const bounded = kept.length > EVENT_LOG_MAX_ENTRIES ? kept.slice(0, EVENT_LOG_MAX_ENTRIES) : kept;
  if (bounded.length !== state.eventLog.length) state.eventLog = bounded;
}

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
  combatStage?: CombatLogStage,
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
    combatStage,
  });
  if (state.eventLog.length > EVENT_LOG_MAX_ENTRIES) state.eventLog.pop();
}

/** Human death: chronicle entry + HUD notification. */
export function logDeath(
  state: WorldState,
  message: string,
  entityName?: string,
  focus?: { x: number; y: number },
  faction: 'player' | 'enemy' = 'player',
): void {
  logEvent(state, 'death', message, entityName);
  addNotification(state, 'Death', message, 'warning', focus);

  // Grave capacity is physical: each completed, player-owned graveyard holds 50 names.
  // Never discard existing memorials if the last graveyard is demolished.
  if (!entityName || faction === 'enemy') return;
  const graves = state.graveRecords ?? (state.graveRecords = []);
  const yard = state.buildings.find((building) =>
    building.completed && building.type === BuildingType.Graveyard
    && building.faction !== 'rival'
    && graves.filter((grave) => grave.graveyardId === building.id).length < 50
  );
  if (!yard) return;
  // The death owner has already marked the person dead when recording a casualty.
  // Keep the actual entity identity, so only real relatives mourn that grave.
  const deceased = state.entities.find((entity) =>
    !entity.alive && formatCitizenName(entity) === entityName
    && !entity.faction
  );
  graves.push({ name: entityName, faction: 'player', tick: state.tick, graveyardId: yard.id, deceasedId: deceased?.id });
}

/** Legacy fallback for saves logged before combatKind existed. */
export function resolveCombatLogKind(evt: GameEventLog): CombatLogKind | null {
  if (evt.combatKind) return evt.combatKind;
  // Only combat entries may be classified. Without this guard every chronicle line was
  // eligible, so any ordinary 'event' whose text mentioned a raid (a trade rumour, a story
  // card, a festival note) was counted as an incoming raid or a defence in the summary.
  if (evt.type !== 'combat') return null;
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

/** Classify saved pre-stage combat records without treating every entry as a new raid. */
export function resolveCombatLogStage(evt: GameEventLog): CombatLogStage | null {
  if (evt.type !== 'combat') return null;
  if (evt.combatStage) return evt.combatStage;
  const message = evt.message.toLowerCase();
  if (message.startsWith('declared hostility')) return 'challenge';
  if (message.includes('launched a raid on the village') || message.includes('dispatched toward')) {
    return 'dispatched';
  }
  if (message.includes('fell defending against') || message.includes('fell on the raid against')) {
    return 'casualties';
  }
  if (message.includes('broke off') || message.includes('fizzled')) return 'cancelled';
  return 'resolved';
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
    const stage = resolveCombatLogStage(evt);
    if (stage === 'dispatched' && (kind === 'incoming_raid' || kind === 'outgoing_raid')) raids++;
    if (stage === 'resolved' && (kind === 'defense' || kind === 'repelled' || kind === 'incoming_raid')) defended++;
    if (stage === 'resolved' && kind === 'repelled') repelled++;
  }
  return { raids, defended, repelled, total: events.length };
}
