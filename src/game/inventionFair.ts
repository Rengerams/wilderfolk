/**
 * S4 — The Apprentice's Terrible Invention Fair (roadmap v0.6.3).
 * Full chain per docs/archive/story/STORY_APPRENTICE_INVENTION_FAIR.md:
 * three inventions → fund/redesign → delayed demonstration → keep/improve/dismantle.
 */
import type { WorldState, StoryEvent } from './gameTypes';
import { BuildingType } from './gameTypes';
import { TICKS_PER_DAY, getColonyDay } from './dayCycle';
import { addBigNews, addNotification } from './simEffects';
import { logEvent } from './eventLog';
import { storyFlag, setStoryFlags, bumpVillageReputation, eligibleDayForStory, seededRoll, hashSalt, pushStoryCard, AUTHORED_STORY_COOLDOWN_FLAG } from './storyHelpers';

export const STORY_KEY = 'invention_fair';
export const AUTHORED_STORY_COOLDOWN_DAYS = 14;

const FLAG_OFFERED = 'invention_fair_offered';
const FLAG_STATUS = 'invention_fair_status';
const FLAG_INVENTION = 'invention_fair_invention';
const FLAG_RISK = 'invention_fair_risk';
const FLAG_APPRENTICE = 'invention_fair_apprentice';
const FLAG_RESOLVE_DAY = 'invention_fair_resolve_day';
const FLAG_RESOLVED = 'invention_fair_resolved';

const MIN_DAY = 30;
const WINDOW_DAYS = 90;
const CARD_DURATION_DAYS = 4;

const STATUS = {
  offered: 1,
  funded: 2,
} as const;

const RISK = {
  experimental: 1,
  safe: 2,
} as const;

const INVENTION_COSTS: Record<string, number> = {
  granary_counter: 15,
  polite_gate: 10,
  emergency_bell: 12,
};

type Stage1Choice = 'fund_granary' | 'fund_gate' | 'fund_bell' | 'reject' | 'safer_redesign';
type Stage2Choice = 'keep' | 'improve' | 'dismantle';

export function inventionFairEligibleDay(mapSeed: number | undefined): number {
  return eligibleDayForStory(mapSeed, STORY_KEY, MIN_DAY, WINDOW_DAYS);
}

function findApprentice(state: WorldState): { id: number; name: string } | null {
  const apprentice = state.entities.find((e) => e.alive && e.apprenticeOfId != null);
  if (!apprentice) return null;
  return { id: apprentice.id, name: apprentice.name ?? 'the apprentice' };
}

function hasWorkshop(state: WorldState): boolean {
  return state.buildings.some(
    (b) =>
      b.completed &&
      (b.type === BuildingType.Workshop || b.type === BuildingType.Blacksmith),
  );
}

export function maybeOfferInventionFair(state: WorldState): void {
  if (storyFlag(state, FLAG_OFFERED) > 0) return;
  const colonyDay = getColonyDay(state);
  if (colonyDay < inventionFairEligibleDay(state.worldMap?.seed)) return;
  if (storyFlag(state, AUTHORED_STORY_COOLDOWN_FLAG) > colonyDay) return;
  if ((state.pendingStoryEvents ?? []).length > 0) return;
  if (!hasWorkshop(state)) return;
  const apprentice = findApprentice(state);
  if (!apprentice) return;

  setStoryFlags(state, {
    [FLAG_OFFERED]: state.tick,
    [FLAG_STATUS]: STATUS.offered,
    [FLAG_APPRENTICE]: apprentice.id,
    [AUTHORED_STORY_COOLDOWN_FLAG]: colonyDay + AUTHORED_STORY_COOLDOWN_DAYS,
  });

  const event: StoryEvent = {
    id: `invention_stage1_${state.tick}`,
    emoji: '⚙️',
    storyKey: STORY_KEY,
    title: 'The Apprentice’s Invention Fair',
    description:
      `${apprentice.name} has three inventions to present. Each one could be brilliant, useless, or technically successful in a way nobody wanted.`,
    choices: [
      { id: 'fund_granary', label: `Fund the Self-Counting Granary (${INVENTION_COSTS.granary_counter} wood)`, detail: 'Better food visibility; occasionally counts the same sack twice.' },
      { id: 'fund_gate', label: `Fund the Polite Gate (${INVENTION_COSTS.polite_gate} wood)`, detail: 'Small reputation benefit; opens at the wrong moments.' },
      { id: 'fund_bell', label: `Fund the Emergency Bell (${INVENTION_COSTS.emergency_bell} wood)`, detail: 'Faster alerts; rings for birthdays and fox sightings.' },
      { id: 'safer_redesign', label: 'Fund a safer redesign', detail: 'Higher cost (+8 wood), lower benefit, lower risk.' },
      { id: 'reject', label: 'Reject the proposals', detail: 'No cost; the apprentice is disappointed.' },
    ],
    createdAtTick: state.tick,
    expiresAtTick: state.tick + TICKS_PER_DAY * CARD_DURATION_DAYS,
  };
  pushStoryCard(state, event);
  addNotification(state, '⚙️ Invention Fair', 'An apprentice wants to present three inventions.', 'info');
}

export function resolveInventionFair(state: WorldState, choiceId: string): boolean {
  const status = storyFlag(state, FLAG_STATUS);
  if (status === STATUS.offered) return resolveStage1(state, choiceId as Stage1Choice);
  if (status === STATUS.funded) return resolveStage2(state, choiceId as Stage2Choice);
  return true;
}

function resolveStage1(state: WorldState, choice: Stage1Choice): boolean {
  const colonyDay = getColonyDay(state);
  let inventionId: string | null = null;
  let cost = 0;
  let riskMode: number = RISK.experimental;

  switch (choice) {
    case 'fund_granary':
      inventionId = 'granary_counter';
      cost = INVENTION_COSTS.granary_counter;
      break;
    case 'fund_gate':
      inventionId = 'polite_gate';
      cost = INVENTION_COSTS.polite_gate;
      break;
    case 'fund_bell':
      inventionId = 'emergency_bell';
      cost = INVENTION_COSTS.emergency_bell;
      break;
    case 'safer_redesign': {
      const base = INVENTION_COSTS.granary_counter;
      inventionId = 'granary_counter';
      cost = base + 8;
      riskMode = RISK.safe;
      break;
    }
    case 'reject':
    default: {
      setStoryFlags(state, {
        [FLAG_RESOLVED]: state.tick,
        [AUTHORED_STORY_COOLDOWN_FLAG]: colonyDay + AUTHORED_STORY_COOLDOWN_DAYS,
      });
      addBigNews(state, '⚙️ The proposals are rejected', 'The apprentice packs away the inventions, a little wiser.', 'neutral');
      return true;
    }
  }

  if (state.resources.wood < cost) {
    addNotification(state, 'Not enough wood', `Funding this invention needs ${cost} wood.`, 'warning');
    return false;
  }
  state.resources.wood -= cost;

  setStoryFlags(state, {
    [FLAG_STATUS]: STATUS.funded,
    [FLAG_INVENTION]: hashSalt(`invention-${inventionId}`) % 1000,
    [FLAG_RISK]: riskMode,
    [FLAG_RESOLVE_DAY]: colonyDay + 4 + Math.floor(seededRoll(state.worldMap?.seed ?? 1, hashSalt('invention-demo-delay')) * 3),
  });
  addNotification(state, '⚙️ Experiment funded', 'The apprentice gets to work. The demonstration is in a few days.', 'info');
  return true;
}

export function tickInventionFair(state: WorldState): void {
  if (storyFlag(state, FLAG_RESOLVED) > 0) return;
  if (storyFlag(state, FLAG_STATUS) !== STATUS.funded) return;
  const colonyDay = getColonyDay(state);
  const resolveDay = storyFlag(state, FLAG_RESOLVE_DAY);
  if (resolveDay <= 0 || colonyDay < resolveDay) return;

  const apprenticeId = storyFlag(state, FLAG_APPRENTICE);
  const apprentice = state.entities.find((e) => e.id === apprenticeId);
  const name = apprentice?.name ?? 'the apprentice';
  const safe = storyFlag(state, FLAG_RISK) === RISK.safe;
  const success = seededRoll(state.worldMap?.seed ?? 1, hashSalt(safe ? 'invention-safe-demo' : 'invention-demo')) > (safe ? 0.25 : 0.45);

  const event: StoryEvent = {
    id: `invention_stage2_${state.tick}`,
    emoji: '⚙️',
    storyKey: STORY_KEY,
    title: 'The Demonstration',
    description: success
      ? `${name}'s invention works — mostly. The crowd is amused and impressed.`
      : `${name}'s invention performs exactly as designed, which is the problem. Smoke, confusion, and a few laughs follow.`,
    choices: [
      { id: 'keep', label: 'Keep the invention active', detail: 'A modest lasting effect.' },
      { id: 'improve', label: 'Improve it (8 wood)', detail: 'Bigger benefit, another cost.' },
      { id: 'dismantle', label: 'Dismantle it', detail: 'Refund 4 wood and end the nuisance.' },
    ],
    createdAtTick: state.tick,
    expiresAtTick: state.tick + TICKS_PER_DAY * CARD_DURATION_DAYS,
  };
  pushStoryCard(state, event);
  addNotification(state, '⚙️ Demonstration day', 'The invention has shown its result.', 'info');
}

function resolveStage2(state: WorldState, choice: Stage2Choice): boolean {
  const colonyDay = getColonyDay(state);
  if (choice === 'improve' && state.resources.wood < 8) {
    addNotification(state, 'Not enough wood', 'Improving the invention needs 8 wood.', 'warning');
    return false;
  }

  if (choice === 'improve') {
    state.resources.wood -= 8;
    bumpVillageReputation(state, 2);
    addBigNews(state, '⚙️ A useful invention', 'The improved device becomes a small village landmark.', 'positive');
  } else if (choice === 'keep') {
    bumpVillageReputation(state, 1);
    addBigNews(state, '⚙️ The invention stays', 'It works well enough to keep around.', 'positive');
  } else {
    state.resources.wood += 4;
    addBigNews(state, '⚙️ Dismantled', 'The device is taken apart; part of the wood is recovered.', 'neutral');
  }

  setStoryFlags(state, {
    [FLAG_RESOLVED]: state.tick,
    [AUTHORED_STORY_COOLDOWN_FLAG]: colonyDay + AUTHORED_STORY_COOLDOWN_DAYS,
  });
  logEvent(state, 'event', `The Invention Fair resolved (${choice}).`, undefined);
  return true;
}
