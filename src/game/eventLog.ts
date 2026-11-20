import { formatCitizenName } from './citizenId';
import { isPlayerHuman } from './playerHuman';
import { BuildingType } from './buildings';
import type { CombatLogKind, CombatLogStage, GameEventLog, WorldState } from './gameTypes';
import { addNotification } from './simEffects';
import { bumpHistoryRevision } from './historyRevisions';

let nextEventLogId = 1;

/** Rolling window of the most recent chronicle entries; everything older is dropped. */
export const EVENT_LOG_MAX_ENTRIES = 20000;

/** Burials one completed player graveyard can hold; the panel reads this instead of a second 50. */
export const GRAVEYARD_CAPACITY_PER_YARD = 50;

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
  // Ids must be monotonic per log, not per realm: `applySimTickDelta` drops entries whose id
  // already exists, so never issue an id the newest-first log already uses.
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

  if (!entityName || faction === 'enemy') return;
  const deceased = state.entities.find((entity) =>
    !entity.alive && formatCitizenName(entity) === entityName
  );
  if (deceased && !isPlayerHuman(deceased)) return;
  const graves = state.graveRecords ?? (state.graveRecords = []);
  // Death may be reported by more than one system. Each villager gets one grave,
  // even if no completed graveyard exists yet.
  if (deceased && graves.some((grave) => grave.deceasedId === deceased.id)) return;
  graves.push({
    name: entityName,
    faction: 'player',
    tick: state.tick,
    deceasedId: deceased?.id,
  });
  bumpHistoryRevision(state, 'graveRecords');
  assignPendingGraves(state);
}

/**
 * Assign awaiting burial records to completed graveyards. Unassigned records persist, so a
 * graveyard built later still receives earlier deaths.
 */
export function assignPendingGraves(state: WorldState): void {
  const graves = state.graveRecords;
  if (!graves?.some((grave) => grave.faction === 'player' && grave.graveyardId == null)) return;
  const capacity = new Map<number, number>();
  for (const building of state.buildings) {
    if (building.completed && building.type === BuildingType.Graveyard && building.faction !== 'rival') {
      capacity.set(building.id, GRAVEYARD_CAPACITY_PER_YARD);
    }
  }
  if (capacity.size === 0) return;
  for (const grave of graves) {
    if (grave.faction === 'player' && grave.graveyardId != null && capacity.has(grave.graveyardId)) {
      capacity.set(grave.graveyardId, Math.max(0, capacity.get(grave.graveyardId)! - 1));
    }
  }
  let assigned = 0;
  for (const grave of graves) {
    if (grave.faction !== 'player' || grave.graveyardId != null) continue;
    for (const [id, spaces] of capacity) {
      if (spaces <= 0) continue;
      grave.graveyardId = id;
      capacity.set(id, spaces - 1);
      assigned += 1;
      break;
    }
  }
  if (assigned > 0) bumpHistoryRevision(state, 'graveRecords');
}

/** Combat kind of a stored entry. Only combat entries may be classified, so an ordinary event
 *  mentioning a raid is not counted as one in the summary. */
export function resolveCombatLogKind(evt: GameEventLog): CombatLogKind | null {
  return evt.type === 'combat' ? evt.combatKind ?? null : null;
}

/** Combat stage of a stored entry; every combat writer records one. */
export function resolveCombatLogStage(evt: GameEventLog): CombatLogStage | null {
  return evt.type === 'combat' ? evt.combatStage ?? null : null;
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
