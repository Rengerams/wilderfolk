/**
 * E1 — Election promises (roadmap v0.6.3).
 * Campaign promises are recorded at the election ceremony; after the evaluation
 * window the village either rewards kept promises or punishes broken ones.
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

/** Called by the election ceremony owner when a new leader is sworn in. */
export function recordElectionPromises(state: WorldState, year: number): void {
  const colonyDay = getColonyDay(state);
  setStoryFlags(state, {
    [promiseKey(year, 0)]: PROMISE_CODES.fill_granary,
    [promiseKey(year, 1)]: PROMISE_CODES.build_walls,
    [promiseKey(year, 2)]: PROMISE_CODES.run_forge,
    [evalDayKey(year)]: colonyDay + EVAL_DAY_OFFSET,
  });
  logEvent(state, 'event', `Election promises recorded for year ${year}.`, undefined);
}

function promiseKept(state: WorldState, year: number, index: number): boolean {
  const code = storyFlag(state, promiseKey(year, index));
  switch (code) {
    case PROMISE_CODES.fill_granary:
      return state.resources.food >= 300;
    case PROMISE_CODES.build_walls:
      return state.buildings.some(
        (b) => b.completed && (b.type === BuildingType.Wall || b.type === BuildingType.WallGate || b.type === BuildingType.Watchtower),
      );
    case PROMISE_CODES.run_forge:
      return state.buildings.some((b) => b.completed && b.type === BuildingType.Blacksmith);
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
  for (let i = 0; i < 3; i++) {
    if (promiseKept(state, year, i)) kept++;
  }
  const failed = 3 - kept;
  const repDelta = kept * 2 - failed;
  state.villageReputation = Math.max(0, state.villageReputation + repDelta);
  setStoryFlags(state, { [evaluatedKey(year)]: state.tick });
  addBigNews(
    state,
    '🗳️ Promises judged',
    `${kept} of 3 campaign promises kept. Reputation ${repDelta >= 0 ? '+' : ''}${repDelta}.`,
    repDelta >= 0 ? 'positive' : 'negative',
  );
  logEvent(state, 'event', `Year ${year} election promises evaluated: ${kept}/3 kept (rep ${repDelta}).`, undefined);
}
