/**
 * F5 — Settlement Memory and Legacy Goals (`Roadmap_V0_6.4.1.MD`, v0.6.4 slice).
 *
 * A long-running colony needs a recognizable identity: the valley remembers that it survived a
 * winter, kept a promise, broke a Moon Howler curse, or came back from a shortage. This module is
 * the **owner** of that list — the goal table, its thresholds, and the read-only
 * {@link collectLegacyGoals} projection the chronicle panel renders.
 *
 * ## Derived, not stored (the F5 decision, with its evidence)
 *
 * Every goal is derived from a record the simulation already writes and already saves, so **no new
 * save field is added** — no allow-list entry, no delta extract/apply, no prep snapshot, no
 * on-load default, no migration. The four records are:
 *
 * | goal | record the simulation already keeps | durable? |
 * | --- | --- | --- |
 * | `winter_survived` | `state.year` — the calendar owner advances it only after day 359 | yes, monotonic |
 * | `shortage_recovered` | `state.yearlyStats[].resources.food` — the stats owner's year-close larder | yes, one row per closed year (last 50) |
 * | `promise_kept` | the promise owner's own verdict line in `state.eventLog` | chronicle window |
 * | `howler_cured` | the cure line `moonHowler.tickMoonHowlerCycle` writes, in `state.eventLog` | chronicle window |
 *
 * The two chronicle-derived goals are bounded by `EVENT_LOG_MAX_ENTRIES`: the settlement
 * remembers what its chronicle still holds. That is the same memory the Chronicle panel already
 * shows, and it is why the goal is a *projection* rather than a second source of truth — a stored
 * copy of a recorded fact would be able to disagree with the record it copies.
 *
 * The panel does no rule arithmetic: it renders `id`, `label`, `detail`, `requirement`, `achieved`
 * and `evidence` as returned here.
 */
import type { GameEventLog, WorldState } from './gameTypes';
import type { YearlyStats } from './stats';
import { displayYear } from './dayCycleClock';
import { PROMISE_COUNT } from './electionPromises';
import { Time } from './gameConstants';

/** Stable goal ids — the keys the panel and the tests use. */
export type LegacyGoalId =
  | 'winter_survived'
  | 'promise_kept'
  | 'howler_cured'
  | 'shortage_recovered';

/** Calendar days of the winter quarter, derived from the one calendar owner (`gameConstants`). */
const WINTER_FIRST_DAY = Time.DAYS_PER_SEASON * 3;
const WINTER_LAST_DAY = Time.DAYS_PER_YEAR - 1;

/**
 * Goal thresholds. The only tunable numbers behind F5 — a designer changes one of these and the
 * requirement text, the evidence text and the achievement all follow.
 */

/** Full calendar years that must close (a closed year contains the winter quarter). */
export const LEGACY_WINTERS_SURVIVED = 1;
/** Promises that must be judged kept in a single election verdict. */
export const LEGACY_PROMISES_KEPT = 1;
/** Moon Howler curses that must be broken by a church rite. */
export const LEGACY_HOWLERS_CURED = 1;
/** A shortage is a year that closed with the larder at or below this. */
export const LEGACY_SHORTAGE_LARDER_FOOD = 0;
/** Recovery is this much food back in store after a shortage year closed. */
export const LEGACY_SHORTAGE_RECOVERY_FOOD = 100;

/**
 * The verdict `electionPromises.tickElectionPromises` logs when it judges a term's promises:
 * `Year 4 election promises evaluated: 2/2 kept (reputation +6).`
 * The count is built from `PROMISE_COUNT`, so the pattern cannot drift from the owner's total.
 */
const PROMISE_VERDICT_PATTERN = new RegExp(
  `election promises evaluated: (\\d+)\\/${PROMISE_COUNT} kept`,
);

/** The suffix `moonHowler.tickMoonHowlerCycle` logs when a rite breaks a curse. */
const HOWLER_CURE_MESSAGE = 'was cured of the Moon Howler curse';

export interface LegacyGoalDefinition {
  id: LegacyGoalId;
  icon: string;
  label: string;
  /** Why the goal matters to the settlement's story — one line, panel-ready. */
  detail: string;
  /** What has to happen, in the owner's words, built from the thresholds above. */
  requirement: string;
  /**
   * The evidence the simulation recorded, or `null` while it has recorded none. Pure and read-only:
   * it must never write to the world.
   */
  readEvidence: (state: WorldState) => string | null;
}

/** One row of {@link collectLegacyGoals} — everything the chronicle panel renders. */
export interface LegacyGoalStatus {
  id: LegacyGoalId;
  icon: string;
  label: string;
  detail: string;
  requirement: string;
  achieved: boolean;
  evidence: string | null;
}

/**
 * The best kept count of any judged election in the chronicle, if any.
 *
 * Coupled to `electionPromises`'s log line on purpose: that line **is** the durable judgement
 * (`tickElectionPromises` stores the evaluation tick but not the outcome). `tests/legacyGoals.test.ts`
 * drives that producer, so a change to the wording fails the test instead of silently un-achieving
 * the goal.
 *
 * The **best** verdict, not the newest: a promise kept in Year 4 stays kept when Year 6's term is
 * judged 0/2 — reading only the latest verdict would take the achievement away again.
 */
function findPromiseVerdict(log: readonly GameEventLog[]): { kept: number; year: number } | null {
  let best: { kept: number; year: number } | null = null;
  for (const event of log) {
    if (event.type !== 'event') continue;
    const match = PROMISE_VERDICT_PATTERN.exec(event.message);
    if (!match) continue;
    const kept = Number.parseInt(match[1] ?? '', 10);
    if (!Number.isFinite(kept)) continue;
    if (best == null || kept > best.kept) best = { kept, year: event.year };
  }
  return best;
}

/** The first recorded cure in the chronicle, if any. */
function findHowlerCure(log: readonly GameEventLog[]): GameEventLog | null {
  for (const event of log) {
    if (event.type !== 'event') continue;
    if (event.message.includes(HOWLER_CURE_MESSAGE)) return event;
  }
  return null;
}

/** The oldest retained year that closed with an empty larder, if any. */
function findShortageYear(stats: readonly YearlyStats[]): YearlyStats | null {
  return stats.find((year) => year.resources.food <= LEGACY_SHORTAGE_LARDER_FOOD) ?? null;
}

/**
 * The goal table. One row per goal, each with its own derived reader — no `switch`, no per-goal
 * branch in {@link collectLegacyGoals}.
 */
export const LEGACY_GOALS: readonly LegacyGoalDefinition[] = [
  {
    id: 'winter_survived',
    icon: '❄️',
    label: 'Winter Survivor',
    detail: 'The settlement lived through a winter — the season that takes the unprepared.',
    requirement:
      `Close ${LEGACY_WINTERS_SURVIVED} full calendar year — winter is days `
      + `${WINTER_FIRST_DAY}–${WINTER_LAST_DAY} of every year.`,
    // A closed calendar year contains the winter quarter, so `year` alone proves the winter passed.
    readEvidence: (state) => {
      if (state.year < LEGACY_WINTERS_SURVIVED) return null;
      const winters = state.year;
      return `${winters} calendar ${winters === 1 ? 'year has' : 'years have'} closed — the winter `
        + `quarter (days ${WINTER_FIRST_DAY}–${WINTER_LAST_DAY}) has passed ${winters} `
        + `${winters === 1 ? 'time' : 'times'}.`;
    },
  },
  {
    id: 'promise_kept',
    icon: '🗳️',
    label: 'A Promise Kept',
    detail: 'A village head promised, and the valley held them to it — and they delivered.',
    requirement:
      `Have a campaign promise judged kept at its evaluation day — at least `
      + `${LEGACY_PROMISES_KEPT} of the ${PROMISE_COUNT} promises in one verdict.`,
    readEvidence: (state) => {
      const verdict = findPromiseVerdict(state.eventLog);
      if (!verdict || verdict.kept < LEGACY_PROMISES_KEPT) return null;
      return `Year ${displayYear(verdict.year)} election promises evaluated: ${verdict.kept} of `
        + `${PROMISE_COUNT} campaign promises kept.`;
    },
  },
  {
    id: 'howler_cured',
    icon: '⛪',
    label: 'Curse Breaker',
    detail: 'A church rite broke the Moon Howler curse — the valley kept its own from the moon.',
    requirement:
      `Break the Moon Howler curse in a church rite at least ${LEGACY_HOWLERS_CURED} time.`,
    readEvidence: (state) => {
      const cure = findHowlerCure(state.eventLog);
      if (!cure) return null;
      const who = cure.entityName ?? 'A settler';
      return `${who} — cured of the Moon Howler curse (Year ${displayYear(cure.year)}).`;
    },
  },
  {
    id: 'shortage_recovered',
    icon: '🍞',
    label: 'Out of the Lean Days',
    detail: 'The larder ran empty, the settlement endured, and the stores came back.',
    requirement:
      `Live through a year that closed with an empty larder (${LEGACY_SHORTAGE_LARDER_FOOD} food or `
      + `less), then restock to ${LEGACY_SHORTAGE_RECOVERY_FOOD} food.`,
    // The year-close row is written before the live store it is compared against, so a stocked
    // larder now proves the recovery came after the shortage — never the other way round.
    readEvidence: (state) => {
      const shortage = findShortageYear(state.yearlyStats);
      if (!shortage) return null;
      const stored = Math.floor(state.resources.food);
      if (stored < LEGACY_SHORTAGE_RECOVERY_FOOD) return null;
      return `Year ${displayYear(shortage.year)} closed with an empty larder; the stores now hold ${stored} food.`;
    },
  },
];

/**
 * Read every legacy goal, with the evidence it rests on. Pure projection of the world's own
 * records: nothing is written, and no new save field backs it.
 */
export function collectLegacyGoals(state: WorldState): LegacyGoalStatus[] {
  return LEGACY_GOALS.map((goal) => {
    const evidence = goal.readEvidence(state);
    return {
      id: goal.id,
      icon: goal.icon,
      label: goal.label,
      detail: goal.detail,
      requirement: goal.requirement,
      achieved: evidence != null,
      evidence,
    };
  });
}
