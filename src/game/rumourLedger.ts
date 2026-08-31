import type { WorldState, StoryEvent } from './gameTypes';
import { BuildingType } from './gameTypes';
import { TICKS_PER_DAY, getColonyDay } from './dayCycle';
import { addBigNews, addNotification } from './simEffects';
import { logEvent } from './eventLog';
import { seededRandom } from './simRng';
import {
  storyFlag,
  setStoryFlags,
  bumpVillageReputation,
  eligibleDayForStory,
  pushStoryCard,
} from './storyHelpers';

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
  civic: 'The officials are hiding surplus grain in the Town Hall cellar.',
  ecology: 'The forest predators are gathering under a cunning new alpha.',
  frontier: 'The rival settlement is terrified of our frontier guards.',
  scandal: 'A prominent local family is secretly planning a village coup.',
};

type Stage1Choice = 'correct_record' | 'encourage' | 'ignore' | 'investigate';

const VALID_CHOICES: ReadonlySet<string> = new Set<Stage1Choice>([
  'correct_record',
  'encourage',
  'ignore',
  'investigate',
]);

export function rumourLedgerEligibleDay(mapSeed: number | undefined): number {
  return eligibleDayForStory(mapSeed, STORY_KEY, MIN_DAY, WINDOW_DAYS);
}

/**
 * Scans backwards through the event log to find the most recent matching event category.
 */
function recentSourceKind(state: WorldState): SourceKind | null {
  const log = state.eventLog;
  const scanLimit = Math.max(0, log.length - 40);

  for (let i = log.length - 1; i >= scanLimit; i--) {
    const type = log[i].type;
    if (type === 'birth' || type === 'marriage') return 'family';
    if (type === 'milestone' || type === 'research') return 'civic';
    if (type === 'season' || type === 'disaster') return 'ecology';
    if (type === 'combat' || type === 'trade') return 'frontier';
    if (type === 'scandal') return 'scandal';
  }
  return null;
}

function hasTownHall(state: WorldState): boolean {
  return state.buildings.some((b) => b.completed && b.type === BuildingType.TownHall);
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

  const seed = state.worldMap?.seed ?? 1;
  const truthRoll = seededRandom(seed, `rumour-truth-${colonyDay}`);
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
    description: `Whispers spread through the commons: “${RUMOUR_TEXT[sourceKind]}”`,
    choices: [
      {
        id: 'correct_record',
        label: 'Correct the record',
        detail: 'Dispel gossip with official statements. Restores calm and institutional trust.',
      },
      {
        id: 'encourage',
        label: 'Encourage the rumour',
        detail: 'Fuel the fire for immediate morale, though falsehoods will backfire later.',
      },
      {
        id: 'ignore',
        label: 'Ignore it',
        detail: 'Allow gossip to take its natural course without official interference.',
      },
      {
        id: 'investigate',
        label: 'Investigate discreetly',
        detail: 'Task town scribes with determining whether the claim holds any truth.',
      },
    ],
    createdAtTick: state.tick,
    expiresAtTick: state.tick + TICKS_PER_DAY * CARD_DURATION_DAYS,
  };

  pushStoryCard(state, event);
  addNotification(state, '📜 The Rumour Ledger', 'Town scribes bring widespread village rumours to your attention.', 'info');
}

export function resolveRumourLedger(state: WorldState, choiceId: string): boolean {
  const status = storyFlag(state, FLAG_STATUS);
  if (status !== STATUS.offered) return true;

  const safeChoice: Stage1Choice = VALID_CHOICES.has(choiceId)
    ? (choiceId as Stage1Choice)
    : 'ignore';

  return resolveStage1(state, safeChoice);
}

function resolveStage1(state: WorldState, choice: Stage1Choice): boolean {
  const colonyDay = getColonyDay(state);
  const truth = storyFlag(state, FLAG_TRUTH);
  const seed = state.worldMap?.seed ?? 1;

  if (choice === 'investigate') {
    const truthText =
      truth === TRUTH.true
        ? 'entirely true'
        : truth === TRUTH.exaggerated
          ? 'partially true, but heavily embellished'
          : 'completely fabricated';
    addNotification(
      state,
      '📜 Investigation Complete',
      `The scribes conclude the rumour was ${truthText}.`,
      'info',
    );
  }

  const responseMap: Record<Stage1Choice, number> = {
    correct_record: RESPONSE.correct,
    encourage: RESPONSE.encourage,
    ignore: RESPONSE.ignore,
    investigate: RESPONSE.investigate,
  };

  const delayDays = 2 + Math.floor(seededRandom(seed, `rumour-resolution-${colonyDay}`) * 3);

  setStoryFlags(state, {
    [FLAG_STATUS]: STATUS.responded,
    [FLAG_RESPONSE]: responseMap[choice],
    [FLAG_RESOLVE_DAY]: colonyDay + delayDays,
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

  let repDelta = 0;
  let headline = '📜 The Rumour Fades';
  let detail = 'The talk around the village square has quietly died down.';

  switch (response) {
    case RESPONSE.correct:
      repDelta = 2;
      headline = '📜 The Record Restored';
      detail = 'Clear communication dispelled confusion and reinforced trust in village leadership.';
      break;

    case RESPONSE.encourage:
      if (truth === TRUTH.false) {
        repDelta = -2;
        headline = '📜 Fabrication Exposed';
        detail = 'The endorsed rumour unraveled as a falsehood, causing embarrassment and cynicism.';
      } else {
        repDelta = 2;
        headline = '📜 Folk Legend Affirmed';
        detail = 'The popular tale captured the imagination of the settlement, boosting morale.';
      }
      break;

    case RESPONSE.investigate:
      repDelta = truth === TRUTH.false ? 2 : 1;
      headline = '📜 Truth Clarified';
      detail = 'The town council acted on verifiable facts, earning respect from the settlers.';
      break;

    case RESPONSE.ignore:
    default:
      repDelta = truth === TRUTH.false ? 0 : -1;
      headline = '📜 Unchecked Whispers';
      detail = 'Lacking official comment, the rumors left subtle unease throughout the village.';
      break;
  }

  if (repDelta !== 0) {
    bumpVillageReputation(state, repDelta);
  }

  setStoryFlags(state, {
    [FLAG_RESOLVED]: state.tick,
    [AUTHORED_STORY_COOLDOWN_FLAG]: colonyDay + AUTHORED_STORY_COOLDOWN_DAYS,
  });

  const repSign = repDelta >= 0 ? `+${repDelta}` : `${repDelta}`;
  const sentiment = repDelta >= 0 ? 'positive' : 'negative';

  addBigNews(state, headline, `${detail} (${repSign} Reputation)`, sentiment);
  logEvent(state, 'event', `The Rumour Ledger concluded: ${headline}.`);
}