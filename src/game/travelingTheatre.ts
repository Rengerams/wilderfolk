/**
 * S2 — The Traveling Theatre Company (roadmap v0.6.3).
 * Full chain per docs/archive/story/STORY_TRAVELING_THEATRE_COMPANY.md:
 * script selection from real history → support package → opening night response.
 */
import type { WorldState, StoryEvent } from './gameTypes';
import { TICKS_PER_DAY, getColonyDay } from './dayCycle';
import { addBigNews, addNotification } from './simEffects';
import { logEvent } from './eventLog';
import { storyFlag, setStoryFlags, bumpVillageReputation, eligibleDayForStory, seededRoll, hashSalt, pushStoryCard, AUTHORED_STORY_COOLDOWN_FLAG } from './storyHelpers';

export const STORY_KEY = 'traveling_theatre';
export const AUTHORED_STORY_COOLDOWN_DAYS = 21;

const FLAG_OFFERED = 'traveling_theatre_company_offered';
const FLAG_STATUS = 'traveling_theatre_company_status';
const FLAG_SCRIPT = 'traveling_theatre_company_script';
const FLAG_SUPPORT = 'traveling_theatre_company_support';
const FLAG_PERFORMANCE_DAY = 'traveling_theatre_company_performance_day';
const FLAG_STAGE3 = 'traveling_theatre_company_stage3';
const FLAG_RESOLVED = 'theatre_story_resolved';

const MIN_DAY = 50;
const WINDOW_DAYS = 60;
const CARD_DURATION_DAYS = 4;

const STATUS = {
  script_selected: 1,
  preparing: 2,
} as const;

const SCRIPTS = {
  first_winter: 1,
  wolf_mistake: 2,
  town_hall_scandal: 3,
  famine_foot: 4,
} as const;

const SUPPORT = {
  hospitality: 1,
  venue: 2,
  improvise: 3,
  cancel: 4,
} as const;

type Stage1Choice = 'first_winter' | 'wolf_mistake' | 'town_hall_scandal' | 'famine_foot';
type Stage2Choice = 'support_hospitality' | 'support_venue' | 'support_improvise' | 'cancel_show';
type Stage3Choice = 'correct_story' | 'let_legend_grow' | 'interrupt';

const HOSPITALITY_FOOD = 20;
const VENUE_WOOD = 15;

export function travelingTheatreEligibleDay(mapSeed: number | undefined): number {
  return eligibleDayForStory(mapSeed, STORY_KEY, MIN_DAY, WINDOW_DAYS);
}

function hasPerformerGroup(state: WorldState): boolean {
  return state.visitorGroups.some((g) => g.kind === 'performers' && (g.daysLeft ?? 0) > 0);
}

function availableScripts(state: WorldState): Stage1Choice[] {
  const recent = state.eventLog.slice(-40);
  const scripts: Stage1Choice[] = [];
  if (recent.some((e) => e.type === 'disaster' || e.type === 'season')) {
    scripts.push('first_winter');
  }
  if (recent.some((e) => e.type === 'season' || e.type === 'combat')) {
    scripts.push('wolf_mistake');
  }
  if (recent.some((e) => e.type === 'milestone' || e.type === 'research' || e.type === 'scandal')) {
    scripts.push('town_hall_scandal');
  }
  // The famine foot-bite is recorded as a scandal; the troupe turns it into a
  // raucous self-mocking farce about the lean days.
  if (recent.some((e) => e.type === 'scandal' && /foot/i.test(e.message))) {
    scripts.push('famine_foot');
  }
  return scripts;
}

export function maybeOfferTravelingTheatre(state: WorldState): void {
  if (storyFlag(state, FLAG_OFFERED) > 0) return;
  const colonyDay = getColonyDay(state);
  if (colonyDay < travelingTheatreEligibleDay(state.worldMap?.seed)) return;
  if (storyFlag(state, AUTHORED_STORY_COOLDOWN_FLAG) > colonyDay) return;
  if ((state.pendingStoryEvents ?? []).length > 0) return;
  if (!hasPerformerGroup(state)) return;
  const scripts = availableScripts(state);
  if (scripts.length === 0) return;

  setStoryFlags(state, {
    [FLAG_OFFERED]: state.tick,
    [FLAG_STATUS]: STATUS.script_selected,
    [AUTHORED_STORY_COOLDOWN_FLAG]: colonyDay + AUTHORED_STORY_COOLDOWN_DAYS,
  });

  const scriptChoices: StoryEvent['choices'] = [];
  if (scripts.includes('first_winter')) {
    scriptChoices.push({ id: 'first_winter', label: '“The First Winter”', detail: 'Heroic and sincere — from the survival records.' });
  }
  if (scripts.includes('wolf_mistake')) {
    scriptChoices.push({ id: 'wolf_mistake', label: '“The Great Wolf Mistake”', detail: 'Absurd and self-mocking — from the hunting records.' });
  }
  if (scripts.includes('town_hall_scandal')) {
    scriptChoices.push({ id: 'town_hall_scandal', label: '“The Scandal at the Town Hall”', detail: 'Risky and embarrassing — from the civic records.' });
  }
  if (scripts.includes('famine_foot')) {
    scriptChoices.push({ id: 'famine_foot', label: '“The Famine Foot”', detail: 'A raucous self-mocking farce — from the lean days, when a hungry settler tried to eat a neighbour.' });
  }

  const event: StoryEvent = {
    id: `theatre_stage1_${state.tick}`,
    emoji: '🎭',
    storyKey: STORY_KEY,
    title: 'The Traveling Theatre Company',
    description: 'A performer troupe has arrived with costumes, scenery, and a dangerously incomplete understanding of the colony’s history. They offer three plays.',
    choices: scriptChoices,
    createdAtTick: state.tick,
    expiresAtTick: state.tick + TICKS_PER_DAY * CARD_DURATION_DAYS,
  };
  pushStoryCard(state, event);
  addNotification(state, '🎭 The Traveling Theatre', 'A troupe offers to stage the valley’s story.', 'info');
}

/**
 * Whether `resolveTravelingTheatre` would accept this answer right now.
 *
 * Mirrors the stage-2 support gates the resolver applies — the same contract
 * `getDiplomacyChoiceEligibility` provides for diplomacy cards — so a consumer
 * (the auto-play bot) can tell an answer the troupe takes from one it refuses.
 * A refused answer leaves the card open, so a consumer that cannot tell the
 * difference would re-propose it forever; the card always offers free
 * alternatives (`support_improvise`, `cancel_show`).
 */
export function getTravelingTheatreChoiceEligibility(
  state: WorldState,
  choiceId: string,
): { ok: boolean; blockReason?: string } {
  if (choiceId === 'support_hospitality' && state.resources.food < HOSPITALITY_FOOD) {
    return { ok: false, blockReason: `Need ${HOSPITALITY_FOOD}🍖` };
  }
  if (choiceId === 'support_venue' && state.resources.wood < VENUE_WOOD) {
    return { ok: false, blockReason: `Need ${VENUE_WOOD}🪵` };
  }
  return { ok: true };
}

export function resolveTravelingTheatre(state: WorldState, choiceId: string): boolean {
  const status = storyFlag(state, FLAG_STATUS);
  if (status === STATUS.script_selected) return resolveStage1(state, choiceId as Stage1Choice);
  if (status === STATUS.preparing) return resolveStage2(state, choiceId as Stage2Choice);
  return resolveStage3(state, choiceId as Stage3Choice);
}

function resolveStage1(state: WorldState, choice: Stage1Choice): boolean {
  const colonyDay = getColonyDay(state);
  setStoryFlags(state, {
    [FLAG_STATUS]: STATUS.preparing,
    [FLAG_SCRIPT]: SCRIPTS[choice] ?? SCRIPTS.first_winter,
    [FLAG_PERFORMANCE_DAY]: colonyDay + 3 + Math.floor(seededRoll(state.worldMap?.seed ?? 1, hashSalt('theatre-performance')) * 3),
  });

  const event: StoryEvent = {
    id: `theatre_stage2_${state.tick}`,
    emoji: '🎭',
    storyKey: STORY_KEY,
    title: 'Build the Production',
    description: 'The troupe needs support before opening night.',
    choices: [
      { id: 'support_hospitality', label: `Provide food and lodging (${HOSPITALITY_FOOD} food)`, detail: 'A well-fed cast performs best.' },
      { id: 'support_venue', label: `Provide a venue and materials (${VENUE_WOOD} wood)`, detail: 'A proper stage and scenery.' },
      { id: 'support_improvise', label: 'Let them perform with whatever they have', detail: 'No cost — but a rougher show.' },
      { id: 'cancel_show', label: 'Cancel the show', detail: 'The colony is under pressure.' },
    ],
    createdAtTick: state.tick,
    expiresAtTick: state.tick + TICKS_PER_DAY * CARD_DURATION_DAYS,
  };
  pushStoryCard(state, event);
  addNotification(state, '🎭 Building the production', 'The troupe needs a support package.', 'info');
  return true;
}

function resolveStage2(state: WorldState, choice: Stage2Choice): boolean {
  const colonyDay = getColonyDay(state);
  switch (choice) {
    case 'support_hospitality': {
      if (state.resources.food < HOSPITALITY_FOOD) {
        addNotification(state, 'Not enough food', `Hospitality needs ${HOSPITALITY_FOOD} food.`, 'warning');
        return false;
      }
      state.resources.food -= HOSPITALITY_FOOD;
      setStoryFlags(state, { [FLAG_SUPPORT]: SUPPORT.hospitality });
      break;
    }
    case 'support_venue': {
      if (state.resources.wood < VENUE_WOOD) {
        addNotification(state, 'Not enough wood', `A venue needs ${VENUE_WOOD} wood.`, 'warning');
        return false;
      }
      state.resources.wood -= VENUE_WOOD;
      setStoryFlags(state, { [FLAG_SUPPORT]: SUPPORT.venue });
      break;
    }
    case 'support_improvise':
      setStoryFlags(state, { [FLAG_SUPPORT]: SUPPORT.improvise });
      break;
    case 'cancel_show':
    default: {
      setStoryFlags(state, {
        [FLAG_RESOLVED]: state.tick,
        [AUTHORED_STORY_COOLDOWN_FLAG]: colonyDay + AUTHORED_STORY_COOLDOWN_DAYS,
      });
      addBigNews(state, '🎭 The troupe leaves offended', 'The show is cancelled; the troupe folds its canvas and departs.', 'neutral');
      return true;
    }
  }

  addNotification(state, '🎭 Building the production', 'Opening night is in a few days.', 'info');
  return true;
}

export function tickTravelingTheatre(state: WorldState): void {
  if (storyFlag(state, FLAG_RESOLVED) > 0) return;
  if (storyFlag(state, FLAG_STATUS) !== STATUS.preparing) return;
  if (storyFlag(state, FLAG_STAGE3) > 0) return;
  const colonyDay = getColonyDay(state);
  const performanceDay = storyFlag(state, FLAG_PERFORMANCE_DAY);
  if (performanceDay <= 0 || colonyDay < performanceDay) return;

  setStoryFlags(state, { [FLAG_STAGE3]: state.tick });
  const event: StoryEvent = {
    id: `theatre_stage3_${state.tick}`,
    emoji: '🎭',
    storyKey: STORY_KEY,
    title: 'Opening Night',
    description: 'The troupe performs. After the applause, the player must decide how the valley remembers the story.',
    choices: [
      { id: 'correct_story', label: 'Correct the story', detail: 'Preserve factual history; modest reputation.' },
      { id: 'let_legend_grow', label: 'Let the legend grow', detail: 'Visitor excitement and reputation, but an exaggerated tale.' },
      { id: 'interrupt', label: 'Interrupt the performance', detail: 'Avoid embarrassment, but lose the troupe’s goodwill.' },
    ],
    createdAtTick: state.tick,
    expiresAtTick: state.tick + TICKS_PER_DAY * CARD_DURATION_DAYS,
  };
  pushStoryCard(state, event);
  addNotification(state, '🎭 Opening night', 'The play is about to begin.', 'info');
}

function resolveStage3(state: WorldState, choice: Stage3Choice): boolean {
  const colonyDay = getColonyDay(state);
  const support = storyFlag(state, FLAG_SUPPORT);
  const qualityBonus = support === SUPPORT.hospitality || support === SUPPORT.venue ? 1 : 0;

  switch (choice) {
    case 'let_legend_grow':
      bumpVillageReputation(state, 2 + qualityBonus);
      addBigNews(state, '🎭 A living legend', 'The play becomes local folklore; the factual Chronicle remains untouched underneath.', 'positive');
      break;
    case 'correct_story':
      bumpVillageReputation(state, 1);
      addBigNews(state, '🎭 Honest history', 'The factual version is preserved, and the colony gains modest respect.', 'positive');
      break;
    default:
      bumpVillageReputation(state, -1);
      addBigNews(state, '🎭 The performance is interrupted', 'The troupe leaves in a huff; the valley is amused and embarrassed in equal measure.', 'negative');
  }

  setStoryFlags(state, {
    [FLAG_RESOLVED]: state.tick,
    [AUTHORED_STORY_COOLDOWN_FLAG]: colonyDay + AUTHORED_STORY_COOLDOWN_DAYS,
  });
  logEvent(state, 'event', `The Traveling Theatre resolved (${choice}).`, undefined);
  return true;
}
