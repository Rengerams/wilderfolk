/**
 * E1 — Election promises (roadmap v0.6.3).
 * Campaign promises are recorded at the election ceremony; after the evaluation
 * window the village either rewards kept promises or punishes broken ones.
 *
 * Each election deterministically selects TWO promises from three options
 * using the world seed + election year. Thresholds are deliberately a bit
 * higher so promises feel like real commitments.
 */
import type { WorldState } from './gameTypes';
import { BuildingType } from './gameTypes';
import { getColonyDay } from './dayCycle';
import { displayYear } from './dayCycleClock';
import { addBigNews } from './simEffects';
import { logEvent } from './eventLog';
import { storyFlag, setStoryFlags } from './storyHelpers';
import { addReputation } from './simHelpers';

export const PROMISE_CODES = {
  fill_granary: 1,
  build_walls: 2,
  run_forge: 3,
} as const;

export type PromiseCode = (typeof PROMISE_CODES)[keyof typeof PROMISE_CODES];

export const EVAL_DAY_OFFSET = 180;

// Higher thresholds (2026-08-25 dev request): promises should feel meaningful.
export const GRANARY_FOOD_REQUIREMENT = 400;
export const WALLS_REQUIREMENT = 5;
export const FORGE_ORDERS_REQUIREMENT = 3;

export const PROMISE_COUNT = 2;

const FLAG_PREFIX = 'election_promises';
const FLAG_ACTIVE_YEAR = 'election_promises_active_year';

function promiseKey(year: number, index: number): string {
  return `${FLAG_PREFIX}_${year}_${index}`;
}

function evaluatedKey(year: number): string {
  return `${FLAG_PREFIX}_${year}_evaluated`;
}

function evalDayKey(year: number): string {
  return `${FLAG_PREFIX}_${year}_eval_day`;
}

function hashSeed(seed: number, year: number): number {
  let h = (seed ^ (year * 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Deterministic tie-break between equally urgent promises. */
function tieBreak(code: number, mapSeed: number | undefined, year: number): number {
  return hashSeed((mapSeed ?? 1) >>> 0, year + code * 7919);
}

export function countCompletedWalls(state: WorldState): number {
  let count = 0;
  for (let i = 0; i < state.buildings.length; i++) {
    const b = state.buildings[i];
    if (!b.completed || b.faction === 'rival') continue;
    if (b.type === BuildingType.Wall || b.type === BuildingType.WallGate || b.type === BuildingType.Watchtower) {
      count++;
    }
  }
  return count;
}

export function countCompletedForgeOrders(state: WorldState): number {
  const completed = state.villageForge?.completed ?? {};
  let count = 0;
  for (const value of Object.values(completed)) {
    if (value) count++;
  }
  return count;
}

/**
 * Pick the TWO promises that address what is going worst in the village.
 * If the village is thriving everywhere, fall back to a deterministic pair.
 */
function selectPromiseCodes(state: WorldState, year: number): number[] {
  const foodNeed = Math.max(0, GRANARY_FOOD_REQUIREMENT - state.resources.food);
  const wallsNeed = Math.max(0, WALLS_REQUIREMENT - countCompletedWalls(state));
  const forgeNeed = Math.max(0, FORGE_ORDERS_REQUIREMENT - countCompletedForgeOrders(state));

  const needs: { code: number; need: number }[] = [
    { code: PROMISE_CODES.fill_granary, need: foodNeed },
    { code: PROMISE_CODES.build_walls, need: wallsNeed },
    { code: PROMISE_CODES.run_forge, need: forgeNeed },
  ];

  needs.sort((a, b) => {
    if (b.need !== a.need) return b.need - a.need;
    return tieBreak(a.code, state.worldMap?.seed, year) - tieBreak(b.code, state.worldMap?.seed, year);
  });

  return [needs[0].code, needs[1].code];
}

/** Read-only projection of the two promises recorded for a year. */
export function electionPromisesForYear(state: WorldState, year: number): number[] {
  const codes: number[] = [];
  for (let i = 0; i < PROMISE_COUNT; i++) {
    const c = storyFlag(state, promiseKey(year, i));
    if (c > 0) codes.push(c);
  }
  return codes;
}

export interface PromiseDetail {
  code: number;
  label: string;
  current: number;
  target: number;
  fulfilled: boolean;
  /**
   * Progress toward the target, 0–100, computed here so the panel renders a number instead of doing
   * arithmetic on game values (`LIVE-FINDINGS-STATUS.md`, F4 / the owner's "food can't be calculated
   * at the UX" principle).
   */
  pct: number;
}

/** Progress toward a promise's target, as a whole percentage (0 when the target is not positive). */
function promiseProgressPct(current: number, target: number): number {
  if (!(target > 0)) return 0;
  return Math.min(100, Math.round((current / target) * 100));
}

export function getPromiseDetail(state: WorldState, code: number): PromiseDetail {
  switch (code) {
    case PROMISE_CODES.fill_granary: {
      const current = Math.floor(state.resources.food);
      return {
        code,
        label: `Fill Granary: Store at least ${GRANARY_FOOD_REQUIREMENT} food`,
        current,
        target: GRANARY_FOOD_REQUIREMENT,
        fulfilled: current >= GRANARY_FOOD_REQUIREMENT,
        pct: promiseProgressPct(current, GRANARY_FOOD_REQUIREMENT),
      };
    }
    case PROMISE_CODES.build_walls: {
      const current = countCompletedWalls(state);
      return {
        code,
        label: `Fortify Village: Construct at least ${WALLS_REQUIREMENT} walls or towers`,
        current,
        target: WALLS_REQUIREMENT,
        fulfilled: current >= WALLS_REQUIREMENT,
        pct: promiseProgressPct(current, WALLS_REQUIREMENT),
      };
    }
    case PROMISE_CODES.run_forge: {
      const current = countCompletedForgeOrders(state);
      return {
        code,
        label: `Forge Ahead: Fulfill at least ${FORGE_ORDERS_REQUIREMENT} forge orders`,
        current,
        target: FORGE_ORDERS_REQUIREMENT,
        fulfilled: current >= FORGE_ORDERS_REQUIREMENT,
        pct: promiseProgressPct(current, FORGE_ORDERS_REQUIREMENT),
      };
    }
    default:
      return { code, label: 'Unknown promise', current: 0, target: 1, fulfilled: false, pct: 0 };
  }
}

/** Returns status of promises currently undergoing evaluation. */
export function getActiveElectionPromises(state: WorldState): {
  year: number;
  daysRemaining: number;
  promises: PromiseDetail[];
} | null {
  const year = storyFlag(state, FLAG_ACTIVE_YEAR);
  if (storyFlag(state, evaluatedKey(year)) > 0) return null;
  // An unrecorded set reads 0 here too, so the eval day below is what says "nothing was promised".
  // Year 0 is the founding year, and an election held in it records real promises under it.
  const evalDay = storyFlag(state, evalDayKey(year));
  if (evalDay <= 0) return null;

  const daysRemaining = Math.max(0, evalDay - getColonyDay(state));
  const codes = electionPromisesForYear(state, year);
  return {
    year,
    daysRemaining,
    promises: codes.map((c) => getPromiseDetail(state, c)),
  };
}

/** Called by the election ceremony owner when a new leader is sworn in. */
export function recordElectionPromises(state: WorldState, year: number): void {
  const colonyDay = getColonyDay(state);
  const [first, second] = selectPromiseCodes(state, year);
  setStoryFlags(state, {
    [FLAG_ACTIVE_YEAR]: year,
    [promiseKey(year, 0)]: first,
    [promiseKey(year, 1)]: second,
    [evalDayKey(year)]: colonyDay + EVAL_DAY_OFFSET,
    // A second election in the same calendar year — a mid-year succession after the term election —
    // re-records the promises under the *same* year keys, so the previous election's "already
    // judged" marker must be cleared with them. Leaving it set made the new promises inert forever:
    // `tickElectionPromises` and `getActiveElectionPromises` both early-return on it, so the
    // reputation swing never happened and the panel showed nothing (LIVE-FINDINGS-STATUS.md, M7).
    // Each election therefore gets its own evaluation window; the codes and the window are
    // overwritten in the same call, so no promise is ever judged twice.
    [evaluatedKey(year)]: 0,
  });

  const p1 = getPromiseDetail(state, first);
  const p2 = getPromiseDetail(state, second);
  logEvent(
    state,
    'event',
    `Campaign promises recorded for Year ${displayYear(year)}: 1) ${p1.label} 2) ${p2.label}.`,
    undefined,
  );
}

function promiseKept(state: WorldState, year: number, index: number): boolean {
  const code = storyFlag(state, promiseKey(year, index));
  return getPromiseDetail(state, code).fulfilled;
}

export function tickElectionPromises(state: WorldState): void {
  const year = storyFlag(state, FLAG_ACTIVE_YEAR);
  if (storyFlag(state, evaluatedKey(year)) > 0) return;

  // Founding-year promises are promises: an unrecorded set is caught by the eval day below, not by the
  // year, which is 0 for the first election of a colony.
  const evalDay = storyFlag(state, evalDayKey(year));
  if (evalDay <= 0) return;
  if (getColonyDay(state) < evalDay) return;

  let kept = 0;
  for (let i = 0; i < PROMISE_COUNT; i++) {
    if (promiseKept(state, year, i)) kept++;
  }
  const failed = PROMISE_COUNT - kept;
  const repDelta = kept * 3 - failed * 2;
  addReputation(state, repDelta);
  setStoryFlags(state, { [evaluatedKey(year)]: state.tick });

  // Attribute to current leader for incumbent performance tracking
  const leader = state.villageLeaderId != null ? state.entities.find((e) => e.id === state.villageLeaderId) : null;
  const leaderName = leader?.name ? (leader.surname ? `${leader.name} ${leader.surname}` : leader.name) : undefined;

  if (failed > 0) {
    logEvent(
      state,
      'scandal',
      `${leaderName ? `${leaderName}'s b` : 'B'}roken election promises are the talk of the village (Year ${displayYear(year)}).`,
      leaderName,
    );
  }

  addBigNews(
    state,
    '🗳️ Promises judged',
    `${kept} of ${PROMISE_COUNT} campaign promises kept. Reputation ${repDelta >= 0 ? '+' : ''}${repDelta}.`,
    repDelta >= 0 ? 'positive' : 'negative',
  );

  logEvent(
    state,
    'event',
    `Year ${displayYear(year)} election promises evaluated: ${kept}/${PROMISE_COUNT} kept (reputation ${repDelta >= 0 ? '+' : ''}${repDelta}).`,
    leaderName,
  );
}