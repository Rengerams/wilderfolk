/**
 * S5 — The Rumour Ledger (roadmap v0.6.3).
 * Full chain per docs/archive/story/STORY_RUMOUR_LEDGER.md:
 * recent event → one rumour → response → delayed social resolution.
 */
import type { WorldState, StoryEvent } from './gameTypes';
import { BuildingType } from './gameTypes';
import { TICKS_PER_DAY, getColonyDay } from './dayCycle';
import { addBigNews, addNotification } from './simEffects';
import { logEvent } from './eventLog';
import { storyFlag, setStoryFlags, bumpVillageReputation } from './storyHelpers';

export const STORY_KEY = 'rumour_ledger';
export const AUTHORED_STORY_COOLDOWN_FLAG = 'authored_story_cd_until';
export const AUTHORED_STORY_COOLDOWN_DAYS = 14;

const FLAG_OFFERED = 'rumour_ledger_offered';
const FLAG_STATUS = 'rumour_ledger_status';
const FLAG_SOURCE_KIND = 'rumour_ledger_source_kind';
const FLAG_SOURCE_EVENT = 'rumour_ledger_source_event';
const FLAG_TRUTH = 'rumour_ledger_truth';
const FLAG_RESPONSE = 'rumour_ledger_response';
const FLAG_RESOLVE_DAY = 'rumour_ledger_resolve_day';
const FLAG_RESOLVED = 'rumour_ledger_resolved';

const MIN_DAY = 60;
const WINDOW_DAYS = 90;
const CARD_DURATION_DAYS = 4;

const STATUS = {
  offered: 1,
  responded: 2,
} as const;

const TRUTH = {
  true: 1,
  exaggerated: 2,
  false: 3,
} as const;

const RESPONSE = {
  correct: 1,
  encourage: 2,
  ignore: 3,
  investigate: 4,
} as const;

const SOURCE_KINDS = ['family', 'civic', 'ecology', 'frontier', 'scandal'] as const;
type SourceKind = (typeof SOURCE_KINDS)[number];

const RUMOUR_TEXT: Record<SourceKind, string> = {
  family: 'The child carries an unusually lucky bloodline.',
  civic: 'The officials are hiding grain in the Town Hall.',
  ecology: 'The wolves have chosen a new leader.',
  frontier: 'The rival settlement is afraid of our guards.',
  scandal: 'The entire family is planning a coup.',
};

type Stage1Choice = 'correct_record' | 'encourage' | 'ignore' | 'investigate';

function seededRoll(seed: number, salt: number): number {
  let s = (seed ^ salt) >>> 0;
  s = (s + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function hashSalt(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function rumourLedgerEligibleDay(mapSeed: number | undefined): number {
  const seed = (mapSeed ?? 1) >>> 0;
  return MIN_DAY + Math.floor(seededRoll(seed, hashSalt(STORY_KEY)) * WINDOW_DAYS);
}

function recentSourceKind(state: WorldState): SourceKind | null {
  const recent = state.eventLog.slice(-30);
  if (recent.some((e) => e.type === 'birth' || e.type === 'family')) return 'family';
  if (recent.some((e) => e.type === 'election' || e.type === 'civic')) return 'civic';
  if (recent.some((e) => e.type === 'ecology' || e.type === 'hunt')) return 'ecology';
  if (recent.some((e) => e.type === 'raid' || e.type === 'frontier')) return 'frontier';
  if (recent.some((e) => e.type === 'scandal' || e.type === 'prison')) return 'scandal';
  return null;
}

function hasTownHall(state: WorldState): boolean {
  return state.buildings.some((b) => b.completed && b.type === BuildingType.TownHall);
}

function pushCard(state: WorldState, event: StoryEvent): void {
  state.pendingStoryEvents ??= [];
  if (!state.pendingStoryEvents.some((e) => e.id === event.id)) {
    state.pendingStoryEvents.push(event);
  }
}

export function maybeOfferRumourLedger(state: WorldState): void {
  if (storyFlag(state, FLAG_OFFERED) > 0) return;
  const colonyDay = getColonyDay(state);
  if (colonyDay < rumourLedgerEligibleDay(state.worldMap?.seed)) return;
  if (storyFlag(state, AUTHORED_STORY_COOLDOWN_FLAG) > colonyDay) return;
  if ((state.pendingStoryEvents ?? []).length > 0) return;
  if (!hasTownHall(state)) return;
  const sourceKind = recentSourceKind(state);
  if (!sourceKind) return;

  const truthRoll = seededRoll(state.worldMap?.seed ?? 1, hashSalt(`rumour-truth-${colonyDay}`));
  const truth = truthRoll < 0.3 ? TRUTH.true : truthRoll < 0.7 ? TRUTH.exaggerated : TRUTH.false;

  setStoryFlags(state, {
    [FLAG_OFFERED]: state.tick,
    [FLAG_STATUS]: STATUS.offered,
    [FLAG_SOURCE_KIND]: SOURCE_KINDS.indexOf(sourceKind) + 1,
    [FLAG_SOURCE_EVENT]: state.eventLog[state.eventLog.length - 1]?.id ?? 0,
    [FLAG_TRUTH]: truth,
    [AUTHORED_STORY_COOLDOWN_FLAG]: colonyDay + AUTHORED_STORY_COOLDOWN_DAYS,
  });

  const event: StoryEvent = {
    id: `rumour_stage1_${state.tick}`,
    emoji: '📜',
    storyKey: STORY_KEY,
    title: 'The Rumour Ledger',
    description: `Several villagers insist that: “${RUMOUR_TEXT[sourceKind]}”`,
    choices: [
      { id: 'correct_record', label: 'Correct the record', detail: 'Reduces rumour strength; improves trust.' },
      { id: 'encourage', label: 'Encourage the rumour', detail: 'Temporary morale; future exaggeration.' },
      { id: 'ignore', label: 'Ignore it', detail: 'It may fade — or spread.' },
      { id: 'investigate', label: 'Investigate', detail: 'Reveals whether the rumour is true, partly true, or false.' },
    ],
    createdAtTick: state.tick,
    expiresAtTick: state.tick + TICKS_PER_DAY * CARD_DURATION_DAYS,
  };
  pushCard(state, event);
  addNotification(state, '📜 The Rumour Ledger', 'The scribe brings a rumour to the Town Hall.', 'info');
}

export function resolveRumourLedger(state: WorldState, choiceId: string): boolean {
  const status = storyFlag(state, FLAG_STATUS);
  if (status === STATUS.offered) return resolveStage1(state, choiceId as Stage1Choice);
  return true;
}

function resolveStage1(state: WorldState, choice: Stage1Choice): boolean {
  const colonyDay = getColonyDay(state);
  const truth = storyFlag(state, FLAG_TRUTH);

  if (choice === 'investigate') {
    const truthText = truth === TRUTH.true ? 'mostly true' : truth === TRUTH.exaggerated ? 'partly true' : 'false';
    addNotification(state, '📜 Investigation complete', `The scribe reports the rumour is ${truthText}.`, 'info');
  }

  setStoryFlags(state, {
    [FLAG_STATUS]: STATUS.responded,
    [FLAG_RESPONSE]: RESPONSE[choice] ?? RESPONSE.ignore,
    [FLAG_RESOLVE_DAY]: colonyDay + 2 + Math.floor(seededRoll(state.worldMap?.seed ?? 1, hashSalt('rumour-resolution')) * 3),
    ...(choice === 'encourage'
      ? { [AUTHORED_STORY_COOLDOWN_FLAG]: colonyDay + 28 }
      : {}),
  });
  return true;
}

export function tickRumourLedger(state: WorldState): void {
  if (storyFlag(state, FLAG_RESOLVED) > 0) return;
  if (storyFlag(state, FLAG_STATUS) !== STATUS.responded) return;
  const colonyDay = getColonyDay(state);
  const resolveDay = storyFlag(state, FLAG_RESOLVE_DAY);
  if (resolveDay <= 0 || colonyDay < resolveDay) return;

  const response = storyFlag(state, FLAG_RESPONSE);
  const truth = storyFlag(state, FLAG_TRUTH);
  const colonyDayNow = getColonyDay(state);
  let repDelta = 0;
  let headline = '📜 The rumour fades';

  switch (response) {
    case RESPONSE.correct:
      repDelta = 2;
      headline = '📜 The record is corrected';
      break;
    case RESPONSE.encourage:
      repDelta = truth === TRUTH.false ? -1 : 2;
      headline = truth === TRUTH.false ? '📜 The lie is exposed' : '📜 The rumour helps';
      break;
    case RESPONSE.investigate:
      repDelta = truth === TRUTH.false ? 2 : 1;
      headline = '📜 The truth is known';
      break;
    default:
      break;
  }

  if (repDelta !== 0) bumpVillageReputation(state, repDelta);
  setStoryFlags(state, {
    [FLAG_RESOLVED]: state.tick,
    [AUTHORED_STORY_COOLDOWN_FLAG]: colonyDayNow + AUTHORED_STORY_COOLDOWN_DAYS,
  });
  addBigNews(state, headline, `The rumour resolves with a ${repDelta >= 0 ? '+' : ''}${repDelta} reputation change.`, repDelta >= 0 ? 'positive' : 'negative');
  logEvent(state, 'event', `The Rumour Ledger resolved (response ${response}).`, undefined);
}
