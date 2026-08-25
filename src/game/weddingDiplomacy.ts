/**
 * S3 — The Wedding That Nearly Started a War (roadmap v0.6.3).
 * Full three-stage chain per docs/archive/story/STORY_WEDDING_THAT_STARTED_A_WAR.md:
 * invitation gift → delayed rival response → feast/delegation/fortify → outcome.
 */
import type { WorldState, StoryEvent } from './gameTypes';
import { BuildingType, EntityType } from './gameTypes';
import { TICKS_PER_DAY, getColonyDay } from './dayCycle';
import { addBigNews, addNotification } from './simEffects';
import { logEvent } from './eventLog';
import { storyFlag, setStoryFlags, bumpVillageReputation, eligibleDayForStory, seededRoll, hashSalt, pushStoryCard } from './storyHelpers';

export const STORY_KEY = 'wedding_diplomacy';
export const AUTHORED_STORY_COOLDOWN_FLAG = 'authored_story_cd_until';
export const AUTHORED_STORY_COOLDOWN_DAYS = 28;

const FLAG_OFFERED = 'wedding_diplomacy_offered';
const FLAG_STATUS = 'wedding_diplomacy_status';
const FLAG_RIVAL = 'wedding_diplomacy_rival';
const FLAG_GIFT = 'wedding_diplomacy_gift';
const FLAG_ENVOY = 'wedding_diplomacy_envoy';
const FLAG_STARTED_DAY = 'wedding_diplomacy_started_day';
const FLAG_RESOLVE_DAY = 'wedding_diplomacy_resolve_day';
const FLAG_STAGE2 = 'wedding_diplomacy_stage2_pushed';
const FLAG_RESOLVED = 'wedding_diplomacy_resolved';

const MIN_DAY = 40;
const WINDOW_DAYS = 90;
const CARD_DURATION_DAYS = 5;
const PRACTICAL_FOOD = 20;
const PRACTICAL_WOOD = 10;
const IMPRESSIVE_GOLD = 15;
const FEAST_FOOD = 40;
const DELEGATION_FOOD = 10;

const STATUS = {
  offered: 1,
  gift_sent: 2,
  declined: 3,
} as const;

const GIFT = {
  practical: 1,
  impressive: 2,
  none: 3,
} as const;

type Stage1Choice = 'gift_practical' | 'gift_impressive' | 'decline' | 'envoy';
type Stage2Choice = 'host_feast' | 'send_delegation' | 'stay_home_fortify';
type WeddingOutcome = 'alliance' | 'uneasy_respect' | 'insult' | 'catastrophe';

export function weddingDiplomacyEligibleDay(mapSeed: number | undefined): number {
  return eligibleDayForStory(mapSeed, STORY_KEY, MIN_DAY, WINDOW_DAYS);
}

function hasCompletedResidenceAndStaffedProduction(state: WorldState): boolean {
  const hasResidence = state.buildings.some(
    (b) => b.completed && (b.type === BuildingType.House || b.type === BuildingType.Mansion),
  );
  const hasStaffedProduction = state.buildings.some(
    (b) => b.completed && b.occupants.length > 0 && b.type === BuildingType.Farm,
  );
  return hasResidence && hasStaffedProduction;
}

function rivalName(state: WorldState): string {
  const rivalIndex = storyFlag(state, FLAG_RIVAL);
  const rival = state.rivalSettlements[rivalIndex] ?? state.rivalSettlements[0];
  return rival?.name ?? 'the rival settlement';
}

function relationshipIndex(state: WorldState): number {
  const order: string[] = ['tense', 'competitive', 'neutral', 'friendly'];
  const rivalIndex = storyFlag(state, FLAG_RIVAL);
  const rival = state.rivalSettlements[rivalIndex] ?? state.rivalSettlements[0];
  const idx = rival ? order.indexOf(rival.relationship) : 1;
  return idx < 0 ? 1 : idx;
}

function shiftRelationship(state: WorldState, steps: number): void {
  const order: string[] = ['tense', 'competitive', 'neutral', 'friendly'];
  const rivalIndex = storyFlag(state, FLAG_RIVAL);
  const rival = state.rivalSettlements[rivalIndex] ?? state.rivalSettlements[0];
  if (!rival) return;
  const idx = order.indexOf(rival.relationship);
  const next = Math.max(0, Math.min(order.length - 1, (idx < 0 ? 1 : idx) + steps));
  rival.relationship = order[next] as typeof rival.relationship;
}

export function maybeOfferWeddingDiplomacy(state: WorldState): void {
  if (storyFlag(state, FLAG_OFFERED) > 0) return;
  const colonyDay = getColonyDay(state);
  if (colonyDay < weddingDiplomacyEligibleDay(state.worldMap?.seed)) return;
  if (storyFlag(state, AUTHORED_STORY_COOLDOWN_FLAG) > colonyDay) return;
  if ((state.pendingStoryEvents ?? []).length > 0) return;
  if (!hasCompletedResidenceAndStaffedProduction(state)) return;
  if (state.rivalSettlements.length === 0) return;

  const rival = state.rivalSettlements[0];
  const rivalIndex = state.rivalSettlements.indexOf(rival);
  setStoryFlags(state, {
    [FLAG_OFFERED]: state.tick,
    [FLAG_STATUS]: STATUS.offered,
    [FLAG_RIVAL]: rivalIndex,
    [FLAG_STARTED_DAY]: colonyDay,
    [AUTHORED_STORY_COOLDOWN_FLAG]: colonyDay + AUTHORED_STORY_COOLDOWN_DAYS,
  });

  const envoyAvailable = state.entities.some(
    (e) => e.alive && e.type === EntityType.Human && !e.isJuvenile && e.faction !== 'rival',
  );
  const event: StoryEvent = {
    id: `wedding_stage1_${state.tick}`,
    emoji: '💒',
    storyKey: STORY_KEY,
    title: 'An Invitation Across the River',
    description:
      `${rival.name} has invited the colony to a politically important wedding. Every gift — and every delay — will be read as a statement about the colony's strength.`,
    choices: [
      {
        id: 'gift_practical',
        label: `Send a practical gift (${PRACTICAL_FOOD} food, ${PRACTICAL_WOOD} wood)`,
        detail: 'Respectful but modest.',
      },
      {
        id: 'gift_impressive',
        label: `Send an impressive gift (${IMPRESSIVE_GOLD} gold)`,
        detail: 'Generous — or intimidating.',
      },
      ...(envoyAvailable
        ? [{
            id: 'envoy',
            label: 'Send an envoy',
            detail: 'A settler attends in person; improves the chance of peace.',
          }]
        : []),
      { id: 'decline', label: 'Decline politely', detail: 'No cost — but the rival may take offense.' },
    ],
    createdAtTick: state.tick,
    expiresAtTick: state.tick + TICKS_PER_DAY * CARD_DURATION_DAYS,
  };
  pushStoryCard(state, event);
  addNotification(state, '💒 Wedding invitation', `${rival.name} invites the colony to a wedding.`, 'info');
}

export function resolveWeddingDiplomacy(state: WorldState, choiceId: string): boolean {
  const status = storyFlag(state, FLAG_STATUS);

  if (status === STATUS.offered) {
    return resolveStage1(state, choiceId as Stage1Choice);
  }
  if (status === STATUS.gift_sent || status === STATUS.declined) {
    return resolveStage2(state, choiceId as Stage2Choice);
  }
  return true;
}

function resolveStage1(state: WorldState, choice: Stage1Choice): boolean {
  const colonyDay = getColonyDay(state);
  switch (choice) {
    case 'gift_practical': {
      if (state.resources.food < PRACTICAL_FOOD || state.resources.wood < PRACTICAL_WOOD) {
        addNotification(state, 'Not enough resources', `A practical gift needs ${PRACTICAL_FOOD} food and ${PRACTICAL_WOOD} wood.`, 'warning');
        return false;
      }
      state.resources.food -= PRACTICAL_FOOD;
      state.resources.wood -= PRACTICAL_WOOD;
      setStoryFlags(state, {
        [FLAG_STATUS]: STATUS.gift_sent,
        [FLAG_GIFT]: GIFT.practical,
        [FLAG_RESOLVE_DAY]: colonyDay + 2 + Math.floor(seededRoll(state.worldMap?.seed ?? 1, hashSalt('wedding-delay')) * 3),
      });
      addNotification(state, '💒 Gift sent', 'The practical gift crosses the river.', 'info');
      return true;
    }
    case 'gift_impressive': {
      if (state.resources.gold < IMPRESSIVE_GOLD) {
        addNotification(state, 'Not enough gold', `An impressive gift needs ${IMPRESSIVE_GOLD} gold.`, 'warning');
        return false;
      }
      state.resources.gold -= IMPRESSIVE_GOLD;
      setStoryFlags(state, {
        [FLAG_STATUS]: STATUS.gift_sent,
        [FLAG_GIFT]: GIFT.impressive,
        [FLAG_RESOLVE_DAY]: colonyDay + 2 + Math.floor(seededRoll(state.worldMap?.seed ?? 1, hashSalt('wedding-delay-impressive')) * 3),
      });
      addNotification(state, '💒 Impressive gift sent', 'The rival chief will notice this.', 'info');
      return true;
    }
    case 'envoy': {
      const envoy = state.entities.find(
        (e) => e.alive && e.type === EntityType.Human && !e.isJuvenile && e.faction !== 'rival',
      );
      if (!envoy) {
        addNotification(state, 'No envoy available', 'No adult settler can attend the wedding.', 'warning');
        return false;
      }
      setStoryFlags(state, {
        [FLAG_STATUS]: STATUS.gift_sent,
        [FLAG_GIFT]: GIFT.none,
        [FLAG_ENVOY]: envoy.id,
        [FLAG_RESOLVE_DAY]: colonyDay + 2 + Math.floor(seededRoll(state.worldMap?.seed ?? 1, hashSalt('wedding-delay-envoy')) * 3),
      });
      addNotification(state, '💒 Envoy sent', `${envoy.name ?? 'A settler'} travels to the wedding.`, 'info');
      return true;
    }
    default: {
      setStoryFlags(state, {
        [FLAG_STATUS]: STATUS.declined,
        [FLAG_GIFT]: GIFT.none,
        [FLAG_RESOLVE_DAY]: colonyDay + 3,
      });
      addNotification(state, '💒 Regrets sent', 'The invitation is politely declined.', 'info');
      return true;
    }
  }
}

export function tickWeddingDiplomacy(state: WorldState): void {
  if (storyFlag(state, FLAG_RESOLVED) > 0) return;
  const status = storyFlag(state, FLAG_STATUS);
  if (status !== STATUS.gift_sent && status !== STATUS.declined) return;
  if (storyFlag(state, FLAG_STAGE2) > 0) return;
  const colonyDay = getColonyDay(state);
  const resolveDay = storyFlag(state, FLAG_RESOLVE_DAY);
  if (resolveDay <= 0 || colonyDay < resolveDay) return;

  setStoryFlags(state, { [FLAG_STAGE2]: state.tick });

  const declined = status === STATUS.declined;
  const text = declined
    ? `The rival chief received the regrets. The wedding proceeds — but the slight is noted.`
    : `The rival chief responds to the wedding gift. Now the colony must choose how to finish the matter.`;

  const event: StoryEvent = {
    id: `wedding_stage2_${state.tick}`,
    emoji: '💒',
    storyKey: STORY_KEY,
    title: 'The Wedding Feast',
    description: text,
    choices: [
      { id: 'host_feast', label: `Host a feast (${FEAST_FOOD} food)`, detail: 'Reputation gain, stronger treaty chance.' },
      { id: 'send_delegation', label: `Attend with a delegation (${DELEGATION_FOOD} food)`, detail: 'Smaller cost, social benefit.' },
      { id: 'stay_home_fortify', label: 'Stay home and fortify', detail: 'Security benefit, weaker diplomacy.' },
    ],
    createdAtTick: state.tick,
    expiresAtTick: state.tick + TICKS_PER_DAY * CARD_DURATION_DAYS,
  };
  pushStoryCard(state, event);
  addNotification(state, '💒 The wedding approaches', 'The rival chief awaits a final decision.', 'info');
}

function resolveStage2(state: WorldState, choice: Stage2Choice): boolean {
  const colonyDay = getColonyDay(state);
  if (choice === 'host_feast' && state.resources.food < FEAST_FOOD) {
    addNotification(state, 'Not enough food', `Hosting a feast needs ${FEAST_FOOD} food.`, 'warning');
    return false;
  }
  if (choice === 'send_delegation' && state.resources.food < DELEGATION_FOOD) {
    addNotification(state, 'Not enough food', `A delegation needs ${DELEGATION_FOOD} food.`, 'warning');
    return false;
  }

  const gift = storyFlag(state, FLAG_GIFT);
  const envoy = storyFlag(state, FLAG_ENVOY) > 0;
  const declined = storyFlag(state, FLAG_STATUS) === STATUS.declined;

  const giftScore = gift === GIFT.impressive ? 1 : gift === GIFT.practical ? 0 : -1;
  const envoyScore = envoy ? 1 : 0;
  const finalScore =
    choice === 'host_feast' ? 2 : choice === 'send_delegation' ? 1 : -1;
  const declinePenalty = declined ? -1 : 0;
  const total = relationshipIndex(state) + giftScore + envoyScore + finalScore + declinePenalty;

  let outcome: WeddingOutcome;
  if (total >= 5) outcome = 'alliance';
  else if (total >= 2) outcome = 'uneasy_respect';
  else if (total >= -1) outcome = 'insult';
  else outcome = 'catastrophe';

  if (choice === 'host_feast') state.resources.food -= FEAST_FOOD;
  if (choice === 'send_delegation') state.resources.food -= DELEGATION_FOOD;

  const baseFlags: Record<string, number> = {
    [FLAG_RESOLVED]: state.tick,
    [AUTHORED_STORY_COOLDOWN_FLAG]: colonyDay + AUTHORED_STORY_COOLDOWN_DAYS,
  };

  switch (outcome) {
    case 'alliance':
      shiftRelationship(state, 2);
      bumpVillageReputation(state, 2);
      addBigNews(state, '💒 A peaceful alliance', `The wedding begins a friendship with ${rivalName(state)}.`, 'positive');
      break;
    case 'uneasy_respect':
      shiftRelationship(state, 1);
      bumpVillageReputation(state, 1);
      addBigNews(state, '💒 Uneasy respect', `${rivalName(state)} remains competitive but keeps its distance.`, 'neutral');
      break;
    case 'catastrophe':
      shiftRelationship(state, -2);
      bumpVillageReputation(state, -2);
      addBigNews(state, '💒 Wedding catastrophe', `The feast went badly and ${rivalName(state)} is furious.`, 'negative');
      break;
    default:
      shiftRelationship(state, -1);
      bumpVillageReputation(state, -1);
      addBigNews(state, '💒 Diplomatic insult', `${rivalName(state)} takes the slight personally.`, 'negative');
  }
  setStoryFlags(state, baseFlags);
  logEvent(state, 'event', `Wedding Diplomacy resolved: ${outcome}.`, undefined);
  return true;
}
