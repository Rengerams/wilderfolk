import type { WorldState, RivalSettlement, DiplomacyEvent, DiplomacyEventKind, DiplomacyChoice } from './gameTypes';
import { getSimRng, seededRandomForRun } from './simRng';
import { applyTruceToRival, hasMilitiaWeapons } from './frontierCombat';
import { ensureRivalProfile } from './rivalProfiles';
import { addReputation } from './simHelpers';
import { addBigNews, addFloatingText } from './simEffects';
import { logEvent } from './eventLog';
import { spendFood } from './economyLedger';
import { addCappedResource } from './resourceUtils';
import { TICKS_PER_DAY } from './dayCycle';

function cloneWorldStateForAction(originalState: WorldState): WorldState {
  return structuredClone(originalState);
}

type RivalRelationship = RivalSettlement['relationship'];

const RELATIONSHIP_STEPS: RivalRelationship[] = ['tense', 'competitive', 'neutral', 'friendly'];

function shiftRelationship(rel: RivalRelationship, steps: number): RivalRelationship {
  const idx = RELATIONSHIP_STEPS.indexOf(rel);
  const next = Math.max(0, Math.min(RELATIONSHIP_STEPS.length - 1, idx + steps));
  return RELATIONSHIP_STEPS[next];
}

function relationshipLabel(rel: RivalRelationship): string {
  return { friendly: 'Friendly', neutral: 'Neutral', competitive: 'Competitive', tense: 'Tense' }[rel];
}

const PEACE_TREATY_PLAYER_DAYS = 60;
const PEACE_TREATY_EVENT_DAYS = 45;
/** Truce the tribute answer buys — shorter than a signed treaty. */
const PEACE_TREATY_TRIBUTE_DAYS = 21;
/** Rival diplomacy prices — exported so the panel's button labels quote the owner's figures. */
export const RIVAL_GIFT_FOOD_COST = 25;
export const RIVAL_TRADE_PACT_GOLD_COST = 40;
export const PEACE_TREATY_GOLD_COST = 30;
export const PEACE_TREATY_FOOD_COST = 20;
/** Refugee offer prices — exported so the panel's button labels quote the owner's figures. */
export const REFUGEE_WELCOME_FOOD = 40;
export const REFUGEE_SCREEN_FOOD = 20;

export function getRivalGiftEligibility(
  state: WorldState,
  rivalId: string,
): { ok: boolean; blockReason?: string } {
  const rival = state.rivalSettlements.find((r) => r.id === rivalId);
  if (!rival) return { ok: false, blockReason: 'No such rival' };
  if (rival.relationship === 'friendly') return { ok: false, blockReason: 'Already friendly' };
  if (state.resources.food < RIVAL_GIFT_FOOD_COST) {
    return { ok: false, blockReason: `Need ${RIVAL_GIFT_FOOD_COST}🍖` };
  }
  return { ok: true };
}

export function sendRivalGift(originalState: WorldState, rivalId: string): WorldState {
  const rivalPreview = originalState.rivalSettlements.find((r) => r.id === rivalId);
  if (!rivalPreview) return originalState;

  const eligibility = getRivalGiftEligibility(originalState, rivalId);
  if (!eligibility.ok) {
    const state = cloneWorldStateForAction(originalState);
    const rival = state.rivalSettlements.find((r) => r.id === rivalId);
    if (!rival) return state;
    const color = rivalPreview.relationship === 'friendly' ? '#94a3b8' : '#f97316';
    addFloatingText(state, rival.campX, rival.campY - 20, eligibility.blockReason ?? 'Cannot send a gift', color);
    return state;
  }

  const state = cloneWorldStateForAction(originalState);
  const rival = state.rivalSettlements.find((r) => r.id === rivalId);
  if (!rival) return state;
  spendFood(state, 'gift', RIVAL_GIFT_FOOD_COST);
  rival.giftsGiven = (rival.giftsGiven ?? 0) + 1;
  const before = rival.relationship;
  rival.relationship = shiftRelationship(rival.relationship, 1);
  rival.daysUntilAction = Math.max(rival.daysUntilAction, 14);

  logEvent(
    state,
    'trade',
    `Sent food to ${rival.name} — relations improved (${relationshipLabel(before)} → ${relationshipLabel(rival.relationship)})`,
    rival.name,
  );
  return state;
}

export function getRivalTradePactEligibility(
  state: WorldState,
  rivalId: string,
): { ok: boolean; blockReason?: string } {
  const rival = state.rivalSettlements.find((r) => r.id === rivalId);
  if (!rival) return { ok: false, blockReason: 'No such rival' };
  if (rival.relationship === 'tense') return { ok: false, blockReason: 'Relations too tense' };
  if (rival.relationship === 'friendly') return { ok: false, blockReason: 'Already friendly' };
  if (state.resources.gold < RIVAL_TRADE_PACT_GOLD_COST) {
    return { ok: false, blockReason: `Need ${RIVAL_TRADE_PACT_GOLD_COST}💰` };
  }
  return { ok: true };
}

export function establishRivalTradePact(originalState: WorldState, rivalId: string): WorldState {
  const rivalPreview = originalState.rivalSettlements.find((r) => r.id === rivalId);
  if (!rivalPreview) return originalState;

  const eligibility = getRivalTradePactEligibility(originalState, rivalId);
  if (!eligibility.ok) {
    const state = cloneWorldStateForAction(originalState);
    const rival = state.rivalSettlements.find((r) => r.id === rivalId);
    if (!rival) return state;
    const color = rivalPreview.relationship === 'friendly' ? '#94a3b8' : '#f97316';
    addFloatingText(state, rival.campX, rival.campY - 20, eligibility.blockReason ?? 'Cannot sign a pact', color);
    return state;
  }

  const state = cloneWorldStateForAction(originalState);
  const rival = state.rivalSettlements.find((r) => r.id === rivalId);
  if (!rival) return state;

  state.resources.gold -= RIVAL_TRADE_PACT_GOLD_COST;
  rival.relationship = 'friendly';
  rival.daysUntilAction = 20;

  logEvent(
    state,
    'trade',
    `Trade pact with ${rival.name} — periodic gold gifts while relations stay friendly`,
    rival.name,
  );
  return state;
}

export function getShowStrengthEligibility(
  state: WorldState,
  rivalId: string,
): { ok: boolean; blockReason?: string } {
  const rival = state.rivalSettlements.find((r) => r.id === rivalId);
  if (!rival) return { ok: false, blockReason: 'No such rival' };
  const armed = hasMilitiaWeapons(state);
  if (!armed) return { ok: false, blockReason: 'Need weapons' };
  if (state.humanPopulation < 6) return { ok: false, blockReason: 'Need 6+ settlers' };
  return { ok: true };
}

export function showStrengthToRival(originalState: WorldState, rivalId: string): WorldState {
  const state = cloneWorldStateForAction(originalState);
  const rival = state.rivalSettlements.find((r) => r.id === rivalId);
  if (!rival) return state;

  const eligibility = getShowStrengthEligibility(originalState, rivalId);
  if (!eligibility.ok) {
    addFloatingText(state, rival.campX, rival.campY - 20, eligibility.blockReason ?? 'Cannot show strength', '#f97316');
    return state;
  }

  if (rival.relationship === 'tense') {
    rival.relationship = 'competitive';
    addReputation(state, -3);
    logEvent(
      state,
      'event',
      `Warriors paraded near ${rival.name} — tension eased, reputation -3`,
      rival.name,
    );
  } else if (rival.relationship === 'competitive') {
    rival.relationship = 'neutral';
    logEvent(state, 'event', `${rival.name} acknowledged your strength`, rival.name);
  } else {
    logEvent(state, 'event', `${rival.name} noted your militia`, rival.name);
  }

  rival.daysUntilAction = 30;
  return state;
}

export function getPeaceTreatyEligibility(
  state: WorldState,
  rivalId: string,
): { ok: boolean; blockReason?: string } {
  const rival = state.rivalSettlements.find((r) => r.id === rivalId);
  if (!rival) return { ok: false, blockReason: 'No such rival' };
  if (rival.peaceTreatyDays > 0) return { ok: false, blockReason: 'Peace treaty already active' };
  if (rival.relationship === 'tense') return { ok: false, blockReason: 'Relations too tense' };
  if (state.resources.gold < PEACE_TREATY_GOLD_COST || state.resources.food < PEACE_TREATY_FOOD_COST) {
    return {
      ok: false,
      blockReason: `Need ${PEACE_TREATY_GOLD_COST}💰 + ${PEACE_TREATY_FOOD_COST}🍖`,
    };
  }
  return { ok: true };
}

export function signPeaceTreaty(originalState: WorldState, rivalId: string): WorldState {
  const state = cloneWorldStateForAction(originalState);
  const rival = state.rivalSettlements.find((r) => r.id === rivalId);
  if (!rival) return state;

  const eligibility = getPeaceTreatyEligibility(originalState, rivalId);
  if (!eligibility.ok) {
    addFloatingText(state, rival.campX, rival.campY - 20, eligibility.blockReason ?? 'Cannot sign a treaty', '#f97316');
    return state;
  }

  state.resources.gold -= PEACE_TREATY_GOLD_COST;
  spendFood(state, 'treaty', PEACE_TREATY_FOOD_COST);
  rival.peaceTreatyDays = PEACE_TREATY_PLAYER_DAYS;
  if (rival.relationship === 'competitive') rival.relationship = 'neutral';
  rival.daysUntilAction = Math.max(rival.daysUntilAction, 30);
  applyTruceToRival(state, rivalId, PEACE_TREATY_PLAYER_DAYS);

  addFloatingText(state, rival.campX, rival.campY - 20, '🕊️ Peace', '#22d3ee');
  addBigNews(state, '🕊️ Peace signed', `${rival.name} and ${state.villageName} agreed to 60 days without raids.`, 'positive');
  logEvent(state, 'event', `Peace treaty with ${rival.name} — 60 days`, rival.name);
  return state;
}

/** Diplomacy-card prices — exported so the panel's button labels quote the owner's figures. */
export const DIPLOMACY_TRIBUTE_PAY_FOOD = 30;
export const DIPLOMACY_TRIBUTE_NEGOTIATE_FOOD = 15;
export const DIPLOMACY_ALLIANCE_ACCEPT_GOLD = 20;
export const DIPLOMACY_ALLIANCE_COUNTER_FOOD = 25;
export const DIPLOMACY_ALLIANCE_COUNTER_GOLD = 15;
export const DIPLOMACY_PEACE_SIGN_GOLD = 15;
export const DIPLOMACY_PEACE_SIGN_FOOD = 10;
export const DIPLOMACY_PEACE_TRIBUTE_FOOD = 35;

function diplomacyChoicesFor(kind: DiplomacyEventKind, rivalName: string): DiplomacyChoice[] {
  switch (kind) {
    case 'tribute':
      return [
        { id: 'pay', label: `Pay tribute (${DIPLOMACY_TRIBUTE_PAY_FOOD}🍖)`, hint: 'Relations improve — they leave you in peace.' },
        { id: 'refuse', label: 'Refuse', hint: 'Relations worsen and reputation drops.' },
        { id: 'negotiate', label: `Negotiate (${DIPLOMACY_TRIBUTE_NEGOTIATE_FOOD}🍖)`, hint: 'Split the difference — minor goodwill.' },
      ];
    case 'border_dispute':
      return [
        { id: 'concede', label: 'Offer hunting rights', hint: 'Reputation -5 but relations improve.' },
        { id: 'stand_firm', label: 'Stand firm', hint: 'Hold the line — tense relations may worsen.' },
        { id: 'militia', label: 'Parade militia', hint: 'Needs weapons + 6 pop — backs them down.' },
      ];
    case 'alliance':
      return [
        { id: 'accept', label: `Accept alliance (${DIPLOMACY_ALLIANCE_ACCEPT_GOLD}💰)`, hint: 'Friendly relations and trade gifts.' },
        { id: 'decline', label: 'Politely decline', hint: 'Stay neutral — small reputation hit.' },
        { id: 'counter', label: `Counter-offer (${DIPLOMACY_ALLIANCE_COUNTER_FOOD}🍖 + ${DIPLOMACY_ALLIANCE_COUNTER_GOLD}💰)`, hint: 'Strong friendship if you can afford it.' },
      ];
    case 'peace_treaty':
      return [
        { id: 'sign', label: `Sign peace (${DIPLOMACY_PEACE_SIGN_GOLD}💰 + ${DIPLOMACY_PEACE_SIGN_FOOD}🍖)`, hint: `45 days without raids with ${rivalName}.` },
        { id: 'decline', label: 'Decline truce', hint: 'Relations may worsen — raids still possible.' },
        { id: 'tribute', label: 'Demand tribute for peace', hint: `Short 21-day truce — they pay you ${DIPLOMACY_PEACE_TRIBUTE_FOOD}🍖.` },
      ];
    default:
      return [{ id: 'ack', label: 'Acknowledge', hint: rivalName }];
  }
}

function diplomacyEventMeta(kind: DiplomacyEventKind, rivalName: string): Pick<DiplomacyEvent, 'title' | 'description' | 'emoji'> {
  switch (kind) {
    case 'tribute':
      return {
        emoji: '🪙',
        title: `${rivalName} demands tribute`,
        description: `Envoys from ${rivalName} arrived at your border. They expect food for safe passage through the wilds.`,
      };
    case 'border_dispute':
      return {
        emoji: '⚔️',
        title: `Border dispute with ${rivalName}`,
        description: `${rivalName} claims your hunters crossed into their territory. Tensions are rising.`,
      };
    case 'alliance':
      return {
        emoji: '🤝',
        title: `${rivalName} proposes an alliance`,
        description: `${rivalName}'s leader offers a formal pact — shared trade and mutual respect.`,
      };
    case 'peace_treaty':
      return {
        emoji: '🕊️',
        title: `${rivalName} offers a peace treaty`,
        description: `Envoys from ${rivalName} ask for a formal truce. No war-bands, no raids — for a time.`,
      };
  }
}

function pickDiplomacyKind(rel: RivalRelationship): DiplomacyEventKind | null {
  const roll = getSimRng('groupEvents')();
  if (rel === 'tense') {
    if (roll < 0.45) return 'tribute';
    if (roll < 0.85) return 'border_dispute';
    return null;
  }
  if (rel === 'competitive') {
    if (roll < 0.3) return 'border_dispute';
    if (roll < 0.5) return 'tribute';
    if (roll < 0.68) return 'peace_treaty';
    return null;
  }
  if (rel === 'neutral') {
    if (roll < 0.22) return 'alliance';
    if (roll < 0.38) return 'border_dispute';
    if (roll < 0.52) return 'peace_treaty';
    return null;
  }
  if (rel === 'friendly' && roll < 0.12) return 'alliance';
  return null;
}

export function maybeQueueDiplomacyEvent(state: WorldState, rival: RivalSettlement): void {
  if (!state.pendingDiplomacyEvents) state.pendingDiplomacyEvents = [];
  if (state.pendingDiplomacyEvents.some((e) => e.rivalId === rival.id)) return;
  const kind = pickDiplomacyKind(rival.relationship);
  if (!kind) return;

  const meta = diplomacyEventMeta(kind, rival.name);
  const event: DiplomacyEvent = {
    id: `dip_${rival.id}_${state.tick}`,
    rivalId: rival.id,
    rivalName: rival.name,
    kind,
    ...meta,
    choices: diplomacyChoicesFor(kind, rival.name),
    createdAtTick: state.tick,
    expiresAtTick: getDiplomacyExpiresAtTick({ createdAtTick: state.tick }),
  };
  state.pendingDiplomacyEvents.push(event);
  addBigNews(state, `${meta.emoji} Diplomacy needed`, `${rival.name}: ${meta.title}. Respond in the inspector or event banner.`, 'neutral');
  logEvent(state, 'event', `${rival.name} — ${meta.title}`, rival.name);
}

/** Fallback window for a diplomacy card written before `expiresAtTick` existed. */
const DIPLOMACY_CARD_EXPIRE_AFTER_TICKS = 14 * TICKS_PER_DAY;

/**
 * When a diplomacy card expires. Single owner: the daily sweep and the inspector's "Expires in N
 * days" both read this, so the countdown cannot promise a different deadline than the one that
 * removes the card (`duplication-deadcode` A17 — no caller reads the raw `expiresAtTick` field).
 */
export function getDiplomacyExpiresAtTick(
  event: { createdAtTick: number; expiresAtTick?: number },
): number {
  return event.expiresAtTick ?? event.createdAtTick + DIPLOMACY_CARD_EXPIRE_AFTER_TICKS;
}

export function tickPendingDiplomacyEvents(state: WorldState): void {
  if (!state.pendingDiplomacyEvents?.length) return;
  const before = state.pendingDiplomacyEvents.length;
  state.pendingDiplomacyEvents = state.pendingDiplomacyEvents.filter(
    (e) => state.tick < getDiplomacyExpiresAtTick(e),
  );
  if (state.pendingDiplomacyEvents.length < before) {
    logEvent(state, 'event', 'An unanswered diplomacy message faded — neighbors grew impatient');
  }
}

export function getDiplomacyChoiceEligibility(
  state: WorldState,
  event: DiplomacyEvent,
  choiceId: string,
): { ok: boolean; blockReason?: string } {
  switch (event.kind) {
    case 'tribute':
      if (choiceId === 'pay' && state.resources.food < DIPLOMACY_TRIBUTE_PAY_FOOD) {
        return { ok: false, blockReason: `Need ${DIPLOMACY_TRIBUTE_PAY_FOOD}🍖` };
      }
      if (choiceId === 'negotiate' && state.resources.food < DIPLOMACY_TRIBUTE_NEGOTIATE_FOOD) {
        return { ok: false, blockReason: `Need ${DIPLOMACY_TRIBUTE_NEGOTIATE_FOOD}🍖` };
      }
      break;
    case 'border_dispute':
      if (choiceId === 'militia') {
        const armed = hasMilitiaWeapons(state);
        if (!armed) return { ok: false, blockReason: 'Need spears' };
        if (state.humanPopulation < 6) return { ok: false, blockReason: 'Need 6+ settlers' };
      }
      break;
    case 'alliance':
      if (choiceId === 'accept' && state.resources.gold < DIPLOMACY_ALLIANCE_ACCEPT_GOLD) {
        return { ok: false, blockReason: `Need ${DIPLOMACY_ALLIANCE_ACCEPT_GOLD}💰` };
      }
      if (
        choiceId === 'counter'
        && (state.resources.food < DIPLOMACY_ALLIANCE_COUNTER_FOOD || state.resources.gold < DIPLOMACY_ALLIANCE_COUNTER_GOLD)
      ) {
        return { ok: false, blockReason: `Need ${DIPLOMACY_ALLIANCE_COUNTER_FOOD}🍖 + ${DIPLOMACY_ALLIANCE_COUNTER_GOLD}💰` };
      }
      break;
    case 'peace_treaty':
      if (
        choiceId === 'sign'
        && (state.resources.gold < DIPLOMACY_PEACE_SIGN_GOLD || state.resources.food < DIPLOMACY_PEACE_SIGN_FOOD)
      ) {
        return { ok: false, blockReason: `Need ${DIPLOMACY_PEACE_SIGN_GOLD}💰 + ${DIPLOMACY_PEACE_SIGN_FOOD}🍖` };
      }
      break;
  }
  return { ok: true };
}

export function respondToDiplomacyEvent(
  originalState: WorldState,
  eventId: string,
  choiceId: string,
): WorldState {
  const state = cloneWorldStateForAction(originalState);
  const idx = state.pendingDiplomacyEvents?.findIndex((e) => e.id === eventId) ?? -1;
  if (idx < 0) return state;

  const event = state.pendingDiplomacyEvents[idx];
  const rival = state.rivalSettlements.find((r) => r.id === event.rivalId);
  if (!rival) {
    state.pendingDiplomacyEvents.splice(idx, 1);
    return state;
  }

  const removeEvent = () => {
    state.pendingDiplomacyEvents = state.pendingDiplomacyEvents.filter((e) => e.id !== eventId);
  };

  let resolved = false;

  if (state.tick >= getDiplomacyExpiresAtTick(event)) {
    removeEvent();
    logEvent(state, 'event', `Diplomacy message from ${rival.name} expired`, rival.name);
    return state;
  }

  const gate = getDiplomacyChoiceEligibility(state, event, choiceId);
  if (!gate.ok) {
    addFloatingText(state, rival.campX, rival.campY - 20, gate.blockReason ?? 'Cannot answer', '#f97316');
    return state;
  }

  switch (event.kind) {
    case 'tribute':
      if (choiceId === 'pay') {
        spendFood(state, 'tribute', DIPLOMACY_TRIBUTE_PAY_FOOD);
        rival.relationship = shiftRelationship(rival.relationship, 1);
        addFloatingText(state, rival.campX, rival.campY - 20, 'Tribute paid', '#22c55e');
        logEvent(state, 'trade', `Paid tribute to ${rival.name} — relations improved`, rival.name);
        resolved = true;
      } else if (choiceId === 'negotiate') {
        spendFood(state, 'tribute', DIPLOMACY_TRIBUTE_NEGOTIATE_FOOD);
        if (rival.relationship === 'tense') rival.relationship = 'competitive';
        logEvent(state, 'trade', `Negotiated with ${rival.name} — partial tribute`, rival.name);
        resolved = true;
      } else if (choiceId === 'refuse') {
        rival.relationship = shiftRelationship(rival.relationship, -1);
        addReputation(state, -4);
        addBigNews(state, '⚡ Tribute refused', `${rival.name} is displeased. Reputation -4.`, 'negative');
        logEvent(state, 'event', `Refused tribute to ${rival.name}`, rival.name);
        resolved = true;
      }
      break;
    case 'border_dispute':
      if (choiceId === 'concede') {
        addReputation(state, -5);
        rival.relationship = shiftRelationship(rival.relationship, 1);
        logEvent(state, 'event', `Ceded hunting rights to ${rival.name}`, rival.name);
        resolved = true;
      } else if (choiceId === 'stand_firm') {
        if (seededRandomForRun(`stand-firm:${rival.id}:${state.tick}`) < 0.45) rival.relationship = shiftRelationship(rival.relationship, -1);
        addReputation(state, -3);
        logEvent(state, 'event', `Stood firm against ${rival.name}`, rival.name);
        resolved = true;
      } else if (choiceId === 'militia') {
        if (rival.relationship === 'tense') rival.relationship = 'competitive';
        else rival.relationship = shiftRelationship(rival.relationship, 1);
        logEvent(state, 'event', `Militia parade settled the dispute with ${rival.name}`, rival.name);
        resolved = true;
      }
      break;
    case 'alliance':
      if (choiceId === 'accept') {
        state.resources.gold -= DIPLOMACY_ALLIANCE_ACCEPT_GOLD;
        rival.relationship = 'friendly';
        rival.daysUntilAction = 20;
        addFloatingText(state, rival.campX, rival.campY - 20, 'Alliance!', '#22d3ee');
        logEvent(state, 'trade', `Alliance with ${rival.name}`, rival.name);
        resolved = true;
      } else if (choiceId === 'counter') {
        spendFood(state, 'treaty', DIPLOMACY_ALLIANCE_COUNTER_FOOD);
        state.resources.gold -= DIPLOMACY_ALLIANCE_COUNTER_GOLD;
        rival.relationship = 'friendly';
        rival.daysUntilAction = 25;
        addReputation(state, 3);
        logEvent(state, 'trade', `Grand counter-pact with ${rival.name}`, rival.name);
        resolved = true;
      } else if (choiceId === 'decline') {
        addReputation(state, -1);
        logEvent(state, 'event', `Declined alliance with ${rival.name}`, rival.name);
        resolved = true;
      }
      break;
    case 'peace_treaty':
      if (choiceId === 'sign') {
        state.resources.gold -= DIPLOMACY_PEACE_SIGN_GOLD;
        spendFood(state, 'treaty', DIPLOMACY_PEACE_SIGN_FOOD);
        rival.peaceTreatyDays = PEACE_TREATY_EVENT_DAYS;
        if (rival.relationship === 'competitive') rival.relationship = 'neutral';
        applyTruceToRival(state, rival.id, PEACE_TREATY_EVENT_DAYS);
        addFloatingText(state, rival.campX, rival.campY - 20, '🕊️ Truce', '#22d3ee');
        logEvent(state, 'event', `Peace treaty with ${rival.name} — 45 days`, rival.name);
        resolved = true;
      } else if (choiceId === 'tribute') {
        rival.peaceTreatyDays = PEACE_TREATY_TRIBUTE_DAYS;
        applyTruceToRival(state, rival.id, PEACE_TREATY_TRIBUTE_DAYS);
        const tributeFood = addCappedResource(state, 'food', DIPLOMACY_PEACE_TRIBUTE_FOOD);
        if (tributeFood < DIPLOMACY_PEACE_TRIBUTE_FOOD) {
          addFloatingText(state, rival.campX, rival.campY - 20, `+${tributeFood}🍖 (storage full)`, '#f97316');
        } else {
          addFloatingText(state, rival.campX, rival.campY - 20, `+${DIPLOMACY_PEACE_TRIBUTE_FOOD}🍖 tribute`, '#eab308');
        }
        logEvent(state, 'trade', `Short truce with ${rival.name} — they paid tribute`, rival.name);
        resolved = true;
      } else if (choiceId === 'decline') {
        if (seededRandomForRun(`decline-peace:${rival.id}:${state.tick}`) < 0.35) rival.relationship = shiftRelationship(rival.relationship, -1);
        addReputation(state, -2);
        logEvent(state, 'event', `Declined peace offer from ${rival.name}`, rival.name);
        resolved = true;
      }
      break;
  }

  if (resolved) {
    const profile = ensureRivalProfile(rival);
    profile.contactCount = Math.min(999, profile.contactCount + 1);
    rival.daysUntilAction = Math.max(rival.daysUntilAction, 21);
    removeEvent();
  }
  return state;
}

