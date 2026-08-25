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
import { addBigNews } from './simEffects';
import { logEvent } from './eventLog';
import { storyFlag, setStoryFlags } from './storyHelpers';

export const PROMISE_CODES: Record<string, number> = {
  fill_granary: 1,
  build_walls: 2,
  run_forge: 3,
};

export const EVAL_DAY_OFFSET = 180;

// Higher thresholds (2026-08-25 dev request): promises should feel meaningful.
const GRANARY_FOOD_REQUIREMENT = 400;
const WALLS_REQUIREMENT = 5;
const FORGE_ORDERS_REQUIREMENT = 3;

const PROMISE_COUNT = 2;
const ALL_PROMISES = [PROMISE_CODES.fill_granary, PROMISE_CODES.build_walls, PROMISE_CODES.run_forge] as const;

const FLAG_PREFIX = 'election_promises';

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

/** Deterministic pick of two distinct promises from the three options. */
function selectPromiseCodes(mapSeed: number | undefined, year: number): number[] {
  const r = hashSeed((mapSeed ?? 1) >>> 0, year);
  const first = ALL_PROMISES[r % ALL_PROMISES.length]!;
  const remaining = ALL_PROMISES.filter((c) => c !== first);
  const second = remaining[(r >>> 8) % remaining.length]!;
  return [first, second];
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

/** Called by the election ceremony owner when a new leader is sworn in. */
export function recordElectionPromises(state: WorldState, year: number): void {
  const colonyDay = getColonyDay(state);
  const [first, second] = selectPromiseCodes(state.worldMap?.seed, year);
  setStoryFlags(state, {
    [promiseKey(year, 0)]: first,
    [promiseKey(year, 1)]: second,
    [evalDayKey(year)]: colonyDay + EVAL_DAY_OFFSET,
  });
  logEvent(state, 'event', `Election promises recorded for year ${year}.`, undefined);
}

function countCompletedWalls(state: WorldState): number {
  let count = 0;
  for (const b of state.buildings) {
    if (!b.completed || b.faction === 'rival') continue;
    if (b.type === BuildingType.Wall || b.type === BuildingType.WallGate || b.type === BuildingType.Watchtower) {
      count++;
    }
  }
  return count;
}

function countCompletedForgeOrders(state: WorldState): number {
  const completed = state.villageForge?.completed ?? {};
  let count = 0;
  for (const value of Object.values(completed)) {
    if (value) count++;
  }
  return count;
}

function promiseKept(state: WorldState, year: number, index: number): boolean {
  const code = storyFlag(state, promiseKey(year, index));
  switch (code) {
    case PROMISE_CODES.fill_granary:
      return state.resources.food >= GRANARY_FOOD_REQUIREMENT;
    case PROMISE_CODES.build_walls:
      return countCompletedWalls(state) >= WALLS_REQUIREMENT;
    case PROMISE_CODES.run_forge:
      return countCompletedForgeOrders(state) >= FORGE_ORDERS_REQUIREMENT;
    default:
      return false;
  }
}

export function tickElectionPromises(state: WorldState): void {
  const year = state.year;
  if (storyFlag(state, evaluatedKey(year)) > 0) return;
  const evalDay = storyFlag(state, evalDayKey(year));
  if (evalDay <= 0) return;
  if (getColonyDay(state) < evalDay) return;

  let kept = 0;
  for (let i = 0; i < PROMISE_COUNT; i++) {
    if (promiseKept(state, year, i)) kept++;
  }
  const failed = PROMISE_COUNT - kept;
  const repDelta = kept * 3 - failed * 2;
  state.villageReputation = Math.max(0, state.villageReputation + repDelta);
  setStoryFlags(state, { [evaluatedKey(year)]: state.tick });
  addBigNews(
    state,
    '🗳️ Promises judged',
    `${kept} of ${PROMISE_COUNT} campaign promises kept. Reputation ${repDelta >= 0 ? '+' : ''}${repDelta}.`,
    repDelta >= 0 ? 'positive' : 'negative',
  );
  logEvent(state, 'event', `Year ${year} election promises evaluated: ${kept}/${PROMISE_COUNT} kept (rep ${repDelta}).`, undefined);
}
