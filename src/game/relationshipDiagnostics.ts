/**
 * Relationship diagnostics — interval counters reset each colony day; active state is computed at
 * flush and never reset. This module only records and reports, never mutating gameplay state.
 */
export interface RelationshipDiagnosticsSnapshot {
  tick: number;
  calendarDay: number;
  activeMarriages: number;
  activeCourtships: number;
  activeYouthLovePairs: number;
  activeAffairs: number;
  // Interval counters (reset on flush):
  conceptionCandidates: number;
  conceptionEligibilityRejected: number;
  conceptionProximityBlocked: number;
  conceptionEnergyBlocked: number;
  conceptionRollFailed: number;
  pregnanciesStartedThisInterval: number;
  affairChecks: number;
  affairProgressGains: number;
  affairsEstablished: number;
  gossipChecks: number;
  scandalExposures: number;
  birthsCompletedThisInterval: number;
  // Active state (computed at flush, not reset):
  activePregnancies: number;
}

export type RelationshipDiagnosticKey =
  | 'conceptionCandidates'
  | 'conceptionEligibilityRejected'
  | 'conceptionProximityBlocked'
  | 'conceptionEnergyBlocked'
  | 'conceptionRollFailed'
  | 'pregnanciesStartedThisInterval'
  | 'affairChecks'
  | 'affairProgressGains'
  | 'affairsEstablished'
  | 'gossipChecks'
  | 'scandalExposures'
  | 'birthsCompletedThisInterval';

type IntervalCounters = Record<RelationshipDiagnosticKey, number>;

let enabled = true;
let consoleLoggingEnabled = true;
let counters: IntervalCounters = emptyCounters();
const snapshotHistory: RelationshipDiagnosticsSnapshot[] = [];
const MAX_HISTORY = 400;

function emptyCounters(): IntervalCounters {
  return {
    conceptionCandidates: 0,
    conceptionEligibilityRejected: 0,
    conceptionProximityBlocked: 0,
    conceptionEnergyBlocked: 0,
    conceptionRollFailed: 0,
    pregnanciesStartedThisInterval: 0,
    affairChecks: 0,
    affairProgressGains: 0,
    affairsEstablished: 0,
    gossipChecks: 0,
    scandalExposures: 0,
    birthsCompletedThisInterval: 0,
  };
}

export function setRelationshipDiagnosticsEnabled(value: boolean): void {
  enabled = value;
}

export function isRelationshipDiagnosticsEnabled(): boolean {
  return enabled;
}

/** Enable or suppress console emission without disabling diagnostic collection. */
export function setRelationshipDiagnosticsConsoleLoggingEnabled(value: boolean): void {
  consoleLoggingEnabled = value;
}

export function recordRelationshipDiagnostic(key: RelationshipDiagnosticKey): void {
  if (!enabled) return;
  counters[key] += 1;
}

/**
 * Flush interval counters once per colony day. `activePregnancies` is not a counter: it is the
 * current count of living pregnant humans, passed in from the caller's world read.
 */
export interface ActiveRelationshipDiagnostics {
  activeMarriages: number;
  activeCourtships: number;
  activeYouthLovePairs: number;
  activeAffairs: number;
}

export function flushRelationshipDiagnostics(
  tick: number,
  calendarDay: number,
  activePregnancies: number,
  activeRelationships: ActiveRelationshipDiagnostics = {
    activeMarriages: 0,
    activeCourtships: 0,
    activeYouthLovePairs: 0,
    activeAffairs: 0,
  },
): RelationshipDiagnosticsSnapshot | null {
  if (!enabled) return null;
  const snapshot: RelationshipDiagnosticsSnapshot = {
    tick,
    calendarDay,
    ...activeRelationships,
    ...counters,
    activePregnancies,
  };
  snapshotHistory.push(snapshot);
  if (snapshotHistory.length > MAX_HISTORY) snapshotHistory.shift();
  if (consoleLoggingEnabled) {
    console.info('[Wilderfolk relationship diagnostics]', snapshot);
  }
  counters = emptyCounters();
  return snapshot;
}

export function getLatestRelationshipDiagnostics(): RelationshipDiagnosticsSnapshot | null {
  return snapshotHistory[snapshotHistory.length - 1] ?? null;
}

export function getRelationshipDiagnosticsHistory(): readonly RelationshipDiagnosticsSnapshot[] {
  return snapshotHistory;
}

export function resetRelationshipDiagnostics(): void {
  counters = emptyCounters();
  enabled = true;
  consoleLoggingEnabled = true;
  snapshotHistory.length = 0;
}