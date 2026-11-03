/**
 * Opt-in, read-only recorder for relocated households (churn investigation). Bounded in both
 * directions: a fixed recent-event ring and a capped household index, so a long session cannot grow.
 */
export interface HousingRelocationEvent {
  tick: number;
  year: number;
  dayInYear: number;
  phase: string;
  reason: string;
  members: number[];
  names: string[];
  from?: number;
  to?: number;
  /** True when the move had no destination, i.e. the household was made surplus. */
  homeless: boolean;
}

export interface HousingRelocationSnapshot {
  enabled: boolean;
  totalMoves: number;
  homelessMoves: number;
  distinctHouseholds: number;
  /** Moves of a household the recorder has already seen (the churn signature). */
  repeatMoves: number;
  byPhase: { phase: string; moves: number }[];
  byReason: { reason: string; moves: number }[];
  recent: HousingRelocationEvent[];
}

const MAX_RECENT_EVENTS = 64;
const MAX_TRACKED_HOUSEHOLDS = 8_192;

let enabled = false;
let clockTick = 0;
let clockYear = 0;
let clockDay = 0;
let totalMoves = 0;
let homelessMoves = 0;
let repeatMoves = 0;
let byPhase = new Map<string, number>();
let byReason = new Map<string, number>();
let householdMoves = new Map<string, number>();
let recent: HousingRelocationEvent[] = [];

export function setHousingRelocationMonitorEnabled(next: boolean): void {
  enabled = next;
  if (next) resetHousingRelocationMonitor();
}

export function resetHousingRelocationMonitor(): void {
  totalMoves = 0;
  homelessMoves = 0;
  repeatMoves = 0;
  byPhase = new Map();
  byReason = new Map();
  householdMoves = new Map();
  recent = [];
}

/** The pipeline has no clock, so the tick stamps it once per frame before the housing layers run. */
export function stampHousingRelocationClock(tick: number, year: number, dayInYear: number): void {
  clockTick = tick;
  clockYear = year;
  clockDay = dayInYear;
}

export function recordHousingRelocation(input: {
  phase: string;
  reason: string;
  members: readonly { id: number; name?: string }[];
  from?: number;
  to?: number;
}): void {
  if (!enabled) return;
  const ids = input.members.map((member) => member.id);
  const householdKey = [...ids].sort((a, b) => a - b).join(',');
  const seen = householdMoves.get(householdKey) ?? 0;

  totalMoves += 1;
  if (input.to === undefined) homelessMoves += 1;
  if (seen > 0) repeatMoves += 1;
  byPhase.set(input.phase, (byPhase.get(input.phase) ?? 0) + 1);
  byReason.set(input.reason, (byReason.get(input.reason) ?? 0) + 1);
  if (seen > 0 || householdMoves.size < MAX_TRACKED_HOUSEHOLDS) householdMoves.set(householdKey, seen + 1);

  const event: HousingRelocationEvent = {
    tick: clockTick,
    year: clockYear,
    dayInYear: clockDay,
    phase: input.phase,
    reason: input.reason,
    members: ids,
    names: input.members.map((member) => member.name ?? `#${member.id}`),
    homeless: input.to === undefined,
  };
  if (input.from !== undefined) event.from = input.from;
  if (input.to !== undefined) event.to = input.to;
  recent.push(event);
  if (recent.length > MAX_RECENT_EVENTS) recent.shift();
}

export function getHousingRelocationSnapshot(): HousingRelocationSnapshot {
  const phases = [...byPhase].map(([phase, moves]) => ({ phase, moves })).sort((a, b) => b.moves - a.moves);
  const reasons = [...byReason].map(([reason, moves]) => ({ reason, moves })).sort((a, b) => b.moves - a.moves);
  return {
    enabled,
    totalMoves,
    homelessMoves,
    distinctHouseholds: householdMoves.size,
    repeatMoves,
    byPhase: phases,
    byReason: reasons,
    recent: [...recent],
  };
}