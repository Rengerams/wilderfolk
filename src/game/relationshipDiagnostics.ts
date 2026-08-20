/**
 * Relationship diagnostics — flush-cadence counters and active state.
 *
 * Truth rule (SIMULATION_AUTHORITY.md §5 + Objective 8): every counter means
 * exactly what its name says.
 *
 *   - INTERVAL counters are reset on every flush (once per colony day):
 *     conceptionCandidates / conceptionEligibilityRejected /
 *     conceptionProximityBlocked / conceptionEnergyBlocked /
 *     conceptionRollFailed / pregnanciesStartedThisInterval /
 *     birthsCompletedThisInterval / affair* / gossip* / scandal*.
 *   - ACTIVE state is computed at flush from the authoritative WorldState and
 *     never reset: `activePregnancies` = living pregnant humans RIGHT NOW.
 *
 * A birth must never be inferred from `pregnanciesStartedThisInterval` (that
 * counter means "new pregnancies created this interval", not "pregnancies
 * existing"). A seeded or earlier pregnancy is visible only through
 * `activePregnancies`.
 *
 * This module only records and reports — it never mutates gameplay state.
 */
export interface RelationshipDiagnosticsSnapshot {
  tick: number;
  calendarDay: number;
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

let enabled = false;
let counters: IntervalCounters = emptyCounters();

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

export function recordRelationshipDiagnostic(key: RelationshipDiagnosticKey): void {
  if (!enabled) return;
  counters[key] += 1;
}

/**
 * Flush interval counters once per colony day.
 *
 * `activePregnancies` is NOT a counter — it is the current count of living
 * pregnant humans in the authoritative state (pass it in from the caller's
 * world read). A value of 0 here means "no pregnancy exists right now"; it is
 * never derived from `pregnanciesStartedThisInterval`.
 */
export function flushRelationshipDiagnostics(
  tick: number,
  calendarDay: number,
  activePregnancies: number,
): RelationshipDiagnosticsSnapshot | null {
  if (!enabled) return null;
  const snapshot: RelationshipDiagnosticsSnapshot = {
    tick,
    calendarDay,
    ...counters,
    activePregnancies,
  };
  console.info('[Wilderfolk relationship diagnostics]', snapshot);
  counters = emptyCounters();
  return snapshot;
}

export function resetRelationshipDiagnostics(): void {
  counters = emptyCounters();
}
