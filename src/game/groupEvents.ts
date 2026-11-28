import type {
  WorldState, Entity, Building, GameEvent, VisitorGroup, VisitorKind,
  VillageRequest, VillageRequestHistoryEntry,
} from './gameTypes';
import { EntityType, JobType } from './gameTypes';
import { getAbsoluteCalendarDay } from './dayCycle';
import { assignMissingResidences, syncResidenceOccupants } from './housingPipeline';
import { createEntity, finalizeSettlerAge } from './entityFactory';
import { establishCitizenIdentity } from './settlerTraits';
import { isPassableWildlifePosition } from './worldGen';
import { isLegalCampSite } from './worldEventSites';
import { randomPointWhere } from './simHelpers';
import { indexLivingEntity } from './entityIndex';
import { pushNewEntity } from './simulation/simulationEntities';
import type { TickContext } from './simulation/simulationTypes';
import { SPECIES_CONFIG } from './speciesConfig';
import {
  addCappedResource,
  canAfford,
  consumeResources,
  getAvailableStorageHeadroom,
} from './resourceUtils';
import { recordFoodProduced, spendFood } from './economyLedger';
import { bumpHistoryRevision } from './historyRevisions';
import { logEvent } from './eventLog';
import { getRefugeeWelcomeBonus } from './townHall';
import { addBigNews, addFloatingText } from './simEffects';
import { addReputation, getReputationBand } from './simHelpers';
import { grantResearchProgress } from './research';
import { formatResourceAmounts, RESOURCE_METAS, type ResourceKey } from './resourceTypes';

// Village Requests — one bounded daily offer system.
export const VILLAGE_REQUEST_PROVISIONS_COST_GOLD = 15;
export const VILLAGE_REQUEST_PROVISIONS_FOOD = 30;
export const VILLAGE_REQUEST_PROVISIONS_REPUTATION = 2;
const VILLAGE_REQUEST_DECLINE_REPUTATION = 1;
const VILLAGE_REQUEST_EXPIRY_DAYS = 3;
const VILLAGE_REQUEST_COOLDOWN_DAYS = 7;
export type VillageRequestChoiceId = 'accept' | 'decline';

function findLiveRequestSource(state: WorldState, request: VillageRequest): VisitorGroup | undefined {
  return state.visitorGroups.find((group) => (
    group.id === request.sourceVisitorGroupId
    && group.kind === 'traders'
    && group.daysLeft > 0
  ));
}

function appendVillageRequestHistory(state: WorldState, entry: VillageRequestHistoryEntry): void {
  const history = state.villageRequestHistory ?? [];
  state.villageRequestHistory = [...history, entry].slice(-20);
  bumpHistoryRevision(state, 'villageRequestHistory');
}

function finishVillageRequest(
  state: WorldState,
  request: VillageRequest,
  outcome: VillageRequestHistoryEntry['outcome'],
  resolvedDay: number,
): void {
  appendVillageRequestHistory(state, {
    id: request.id,
    kind: request.kind,
    sourceName: request.sourceName,
    outcome,
    resolvedDay,
  });
  state.activeVillageRequest = undefined;
  state.villageRequestCooldownUntilDay = resolvedDay + VILLAGE_REQUEST_COOLDOWN_DAYS;
}

function expireVillageRequest(state: WorldState, request: VillageRequest, day: number): void {
  const source = findLiveRequestSource(state, request);
  finishVillageRequest(state, request, 'expired', day);
  const x = source?.campX ?? state.width / 2;
  const y = source?.campY ?? state.height / 2;
  addFloatingText(state, x, y - 18, 'Offer expired', '#f59e0b');
  logEvent(state, 'event', `${request.sourceName}'s provisions offer expired`, request.sourceName);
}

export function tickVillageRequests(state: WorldState): void {
  const day = getAbsoluteCalendarDay(state.tick);
  const active = state.activeVillageRequest;
  if (active) {
    if (day >= active.expiresDay || !findLiveRequestSource(state, active)) {
      expireVillageRequest(state, active, day);
    }
    return;
  }

  if (day < (state.villageRequestCooldownUntilDay ?? 0)) return;
  const trader = state.visitorGroups.find((group) => group.kind === 'traders' && group.daysLeft > 0);
  if (!trader) return;

  state.activeVillageRequest = {
    id: `vreq_caravan_provisions_${trader.id}_${day}`,
    kind: 'caravan_provisions',
    sourceVisitorGroupId: trader.id,
    sourceName: trader.name,
    emoji: '🥣',
    title: 'Caravan Provisions Offer',
    description: `${trader.name} offers preserved food before the road turns harsh.`,
    choices: [
      {
        id: 'accept',
        label: 'Accept provisions',
        detail: `Pay ${VILLAGE_REQUEST_PROVISIONS_COST_GOLD} gold → receive ${VILLAGE_REQUEST_PROVISIONS_FOOD} food and +${VILLAGE_REQUEST_PROVISIONS_REPUTATION} reputation.`,
      },
      {
        id: 'decline',
        label: 'Decline politely',
        detail: `Keep your supplies; lose ${VILLAGE_REQUEST_DECLINE_REPUTATION} reputation.`,
      },
    ],
    expiresDay: day + VILLAGE_REQUEST_EXPIRY_DAYS,
  };
  addBigNews(state, '🥣 Caravan offer', `${trader.name} offers food for a fair price.`, 'neutral');
  logEvent(state, 'event', `${trader.name} offered caravan provisions`, trader.name);
}

export function getVillageRequestEligibility(
  state: WorldState,
  request: VillageRequest,
  choiceId: VillageRequestChoiceId,
): { ok: boolean; blockReason?: string } {
  if (!request.choices.some((choice) => choice.id === choiceId)) {
    return { ok: false, blockReason: 'Unknown answer' };
  }
  if (choiceId !== 'accept') return { ok: true };
  if (state.resources.gold < VILLAGE_REQUEST_PROVISIONS_COST_GOLD) {
    return { ok: false, blockReason: `Need ${VILLAGE_REQUEST_PROVISIONS_COST_GOLD} gold` };
  }
  if (getAvailableStorageHeadroom(state, 'food') < VILLAGE_REQUEST_PROVISIONS_FOOD) {
    return { ok: false, blockReason: 'Food storage full' };
  }
  return { ok: true };
}

export function resolveVillageRequest(
  originalState: WorldState,
  requestId: string,
  choice: VillageRequestChoiceId,
): WorldState {
  const preview = originalState.activeVillageRequest;
  if (!preview || preview.id !== requestId || (choice !== 'accept' && choice !== 'decline')) {
    return originalState;
  }

  const state = structuredClone(originalState);
  const request = state.activeVillageRequest;
  if (!request || request.id !== requestId) return state;
  const day = getAbsoluteCalendarDay(state.tick);
  const source = findLiveRequestSource(state, request);
  if (day >= request.expiresDay || !source) {
    expireVillageRequest(state, request, day);
    return state;
  }

  if (choice === 'decline') {
    addReputation(state, -VILLAGE_REQUEST_DECLINE_REPUTATION);
    finishVillageRequest(state, request, 'declined', day);
    addFloatingText(state, source.campX, source.campY - 18, 'Offer declined', '#94a3b8');
    logEvent(state, 'event', `Declined ${source.name}'s provisions offer`, source.name);
    return state;
  }

  const gate = getVillageRequestEligibility(state, request, choice);
  if (!gate.ok) {
    const reason = gate.blockReason ?? 'Offer unavailable';
    addBigNews(state, 'Offer unavailable', reason, 'negative');
    addFloatingText(state, source.campX, source.campY - 18, reason, '#f97316');
    return state;
  }

  state.resources.gold -= VILLAGE_REQUEST_PROVISIONS_COST_GOLD;
  // The provisions are food bought, so the ledger records the produced side with what storage
  // actually accepted, not the nominal amount.
  recordFoodProduced(state, 'trade', addCappedResource(state, 'food', VILLAGE_REQUEST_PROVISIONS_FOOD));
  addReputation(state, VILLAGE_REQUEST_PROVISIONS_REPUTATION);
  source.tradesCompleted++;
  finishVillageRequest(state, request, 'accepted', day);
  addFloatingText(state, source.campX, source.campY - 18, `-${VILLAGE_REQUEST_PROVISIONS_COST_GOLD} gold +${VILLAGE_REQUEST_PROVISIONS_FOOD} food`, '#22c55e');
  logEvent(state, 'trade', `Accepted ${source.name}'s provisions offer (+${VILLAGE_REQUEST_PROVISIONS_FOOD} food)`, source.name);
  return state;
}

import { isPlayerHuman, playerHumanCount } from './playerHuman';
import { getSimRng, seededRandomForRun } from './simRng';

export interface VisitorLeaderTalkMeta {
  buttonLabel: string;
  hint: string;
  unavailableReason?: string;
}

const VISITOR_LEADER_TALK: Record<VisitorKind, VisitorLeaderTalkMeta> = {
  traders: {
    buttonLabel: '🗣️ Talk to caravan master',
    hint: 'Once per visit: +15💰 and trade gossip (+3 rep).',
  },
  pilgrims: {
    buttonLabel: '🗣️ Speak with the elder pilgrim',
    hint: 'Once per visit: blessing for your village (+8 rep).',
  },
  scholars: {
    buttonLabel: '🗣️ Debate with the head scholar',
    hint: 'Once per visit: +25 research progress (or +15💰 if idle).',
  },
  hunters: {
    buttonLabel: '🗣️ Ask the hunt captain',
    hint: 'Once per visit: trail wisdom (+5 rep, less game poaching today).',
  },
  nomads: {
    buttonLabel: '🗣️ Share fire with the clan head',
    hint: 'Once per visit: +20🪵 and stories (+2 rep).',
  },
  performers: {
    buttonLabel: '🗣️ Toast the troupe leader',
    hint: 'Once per visit: revelry lifts spirits (+6 rep, mini festival 1d).',
  },
  refugees: {
    buttonLabel: '🗣️ Hear the families\' spokesman',
    hint: 'Opens refugee negotiate — use Welcome / Screen / Turn away below.',
  },
};

export function getVisitorLeaderTalkMeta(group: VisitorGroup): VisitorLeaderTalkMeta {
  const meta = VISITOR_LEADER_TALK[group.kind];
  if (group.leaderTalked) {
    return { ...meta, buttonLabel: '✓ Leader already spoken with', hint: 'This caravan will not offer another audience.' };
  }
  if (group.kind === 'refugees' && group.refugeeResolved) {
    return { ...meta, unavailableReason: 'Refugee talks already concluded.' };
  }
  return meta;
}

export function talkToVisitorLeader(originalState: WorldState, groupId: string): WorldState {
  const state = structuredClone(originalState);
  const group = state.visitorGroups.find((g) => g.id === groupId);
  if (!group || group.leaderTalked) return state;

  if (group.kind === 'refugees') {
    group.leaderTalked = true;
    addBigNews(state, '🧳 Refugee spokesman', `${group.name} asks you to decide their fate below.`, 'neutral');
    logEvent(state, 'event', `Spoke with ${group.name} spokesman — negotiate to welcome or turn away`, group.name);
    return state;
  }

  group.leaderTalked = true;

  switch (group.kind) {
    case 'traders':
      addCappedResource(state, 'gold', 15);
      addReputation(state, 3);
      addFloatingText(state, group.campX, group.campY - 20, '+15💰 +Rep', '#eab308');
      logEvent(state, 'trade', `Caravan master of ${group.name} shared market news`, group.name);
      break;
    case 'pilgrims':
      addReputation(state, 8);
      addFloatingText(state, group.campX, group.campY - 20, '+8 Rep', '#22c55e');
      logEvent(state, 'event', `Elder pilgrim blessed ${state.villageName}`, group.name);
      break;
    case 'scholars':
      if (state.activeResearch) {
        grantResearchProgress(state, 25);
        addFloatingText(state, group.campX, group.campY - 20, '+Research', '#8b5cf6');
        logEvent(state, 'research', `Head scholar advanced your active research`, group.name);
      } else {
        addCappedResource(state, 'gold', 15);
        addFloatingText(state, group.campX, group.campY - 20, '+15💰', '#8b5cf6');
        logEvent(state, 'research', `Scholars of ${group.name} left notes and coin`, group.name);
      }
      break;
    case 'hunters':
      addReputation(state, 5);
      addFloatingText(state, group.campX, group.campY - 20, '+5 Rep', '#f97316');
      logEvent(state, 'event', `Hunt captain of ${group.name} marked shared hunting grounds`, group.name);
      break;
    case 'nomads':
      addCappedResource(state, 'wood', 20);
      addReputation(state, 2);
      addFloatingText(state, group.campX, group.campY - 20, '+20🪵', '#d97706');
      logEvent(state, 'event', `Clan head of ${group.name} traded stories and timber`, group.name);
      break;
    case 'performers':
      addReputation(state, 6);
      if (!state.festival) {
        state.festival = { active: true, name: 'Visitor Revelry', daysLeft: 1 };
      } else {
        state.festival.daysLeft = Math.min(4, state.festival.daysLeft + 1);
      }
      addFloatingText(state, group.campX, group.campY - 20, '🎭 Festival!', '#f472b6');
      logEvent(state, 'event', `Troupe leader of ${group.name} led a night of revelry`, group.name);
      break;
    default:
      break;
  }

  return state;
}

export const VISITOR_TRADE_COSTS = {
  buy_food: { pay: { gold: 25 }, receive: { food: 40 } },
  buy_wood: { pay: { gold: 20 }, receive: { wood: 30 } },
  // Stone is a caravan trade good alongside wood and iron.
  buy_stone: { pay: { gold: 20 }, receive: { stone: 25 } },
  buy_iron: { pay: { gold: 35 }, receive: { iron: 12 } },
  sell_food: { pay: { food: 30 }, receive: { gold: 25 } },
  sell_wood: { pay: { wood: 40 }, receive: { gold: 20 } },
  sell_stone: { pay: { stone: 35 }, receive: { gold: 20 } },
  sell_iron: { pay: { iron: 15 }, receive: { gold: 25 } },
} as const;

export type VisitorTradeAction = keyof typeof VISITOR_TRADE_COSTS;

/**
 * Visitor trade price multiplier from the reputation bands its owner declares (`simHelpers`);
 * the pricing itself stays here.
 */
export function getVisitorTradePriceMult(rep: number): number {
  const band = getReputationBand(rep);
  return band === 'friendly' ? 0.8 : band === 'harsh' ? 1.25 : 1;
}

function getVisitorTradeRewardMult(rep: number): number {
  return getReputationBand(rep) === 'friendly' ? 1.15 : 1;
}

function rejectVisitorTrade(state: WorldState, group: VisitorGroup, hint: string, notify?: string): WorldState {
  addFloatingText(state, group.campX, group.campY - 20, hint, '#f97316');
  if (notify) addBigNews(state, 'Trade failed', notify, 'negative');
  return state;
}

export function getVisitorTradeTerms(
  state: WorldState,
  action: VisitorTradeAction,
): {
  effectivePay: Partial<Record<keyof WorldState['resources'], number>>;
  effectiveReceive: Partial<Record<keyof WorldState['resources'], number>>;
} {
  const deal = VISITOR_TRADE_COSTS[action];
  const rep = state.villageReputation ?? 0;
  const priceMult = getVisitorTradePriceMult(rep);
  const rewardMult = getVisitorTradeRewardMult(rep);

  const effectivePay: Partial<Record<keyof WorldState['resources'], number>> = {};
  for (const [key, cost] of Object.entries(deal.pay) as [keyof WorldState['resources'], number][]) {
    effectivePay[key] = key === 'gold' ? Math.ceil((cost ?? 0) * priceMult) : cost;
  }
  const effectiveReceive: Partial<Record<keyof WorldState['resources'], number>> = {};
  for (const [key, amt] of Object.entries(deal.receive) as [keyof WorldState['resources'], number][]) {
    effectiveReceive[key] = key === 'gold' ? Math.floor((amt ?? 0) * rewardMult) : amt;
  }
  return { effectivePay, effectiveReceive };
}

export function getVisitorTradeEligibility(
  state: WorldState,
  groupId: string,
  action: VisitorTradeAction,
): { ok: boolean; blockReason?: string; notify?: string; silent?: boolean } {
  const group = state.visitorGroups.find((g) => g.id === groupId);
  if (!group) return { ok: false, blockReason: 'No such visitor group', silent: true };
  if (group.kind === 'refugees') return { ok: false, blockReason: 'Refugees do not trade', silent: true };
  if (group.daysLeft <= 0) return { ok: false, blockReason: 'The caravan is leaving', silent: true };

  const canTrade = group.kind === 'traders' || group.kind === 'nomads' || group.kind === 'hunters';
  if (!canTrade && action !== 'sell_food') {
    return { ok: false, blockReason: `${group.name} only buys food`, silent: true };
  }

  const { effectivePay, effectiveReceive } = getVisitorTradeTerms(state, action);

  if (!canAfford(state, effectivePay)) {
    const [needKey, needAmount] = (Object.entries(effectivePay) as [ResourceKey, number][])
      .find(([, amount]) => (amount ?? 0) > 0) ?? ['gold', 0];
    const hint = `Need ${needAmount}${RESOURCE_METAS[needKey].emoji}`;
    return { ok: false, blockReason: hint };
  }

  const gainedGold = effectiveReceive.gold ?? 0;
  if (gainedGold > 0 && (group.gold ?? 0) < gainedGold) {
    return {
      ok: false,
      blockReason: 'They are out of gold',
      notify: `${group.name} has no gold left to pay you.`,
    };
  }

  for (const [key, amount] of Object.entries(effectiveReceive) as [keyof WorldState['resources'], number][]) {
    if ((amount ?? 0) > 0 && getAvailableStorageHeadroom(state, key) < amount) {
      const meta = RESOURCE_METAS[key];
      const hint = key === 'gold' ? 'Cannot store more gold' : `${meta.label} storage full!`;
      const notify = key === 'food'
        ? 'Food storage is full — build a Barn or Silo before buying more.'
        : key === 'wood'
          ? 'Wood storage is full — build a Barn or Store before buying more.'
          : key === 'iron'
            ? 'Iron storage is full — free space before buying more.'
            : undefined;
      return { ok: false, blockReason: hint, notify };
    }
  }

  return { ok: true };
}

export function tradeWithVisitors(
  originalState: WorldState,
  groupId: string,
  action: VisitorTradeAction,
): WorldState {
  const eligibility = getVisitorTradeEligibility(originalState, groupId, action);
  if (!eligibility.ok && eligibility.silent) return originalState;

  const state = structuredClone(originalState);
  const group = state.visitorGroups.find((g) => g.id === groupId);
  if (!group) return state;

  if (!eligibility.ok) {
    return rejectVisitorTrade(state, group, eligibility.blockReason ?? 'Cannot trade', eligibility.notify);
  }

  const { effectivePay, effectiveReceive } = getVisitorTradeTerms(state, action);
  // Food is the one resource the ledger tracks, so both sides go through its owners:
  // `spendFood` records the sink, `recordFoodProduced` what storage accepted. Others use the bundle.
  const foodPaid = effectivePay.food ?? 0;
  if (foodPaid > 0) {
    delete effectivePay.food;
    spendFood(state, 'trade', foodPaid);
  }
  consumeResources(state, effectivePay);
  const paidGold = effectivePay.gold ?? 0;
  if (paidGold > 0) group.gold = (group.gold ?? 0) + paidGold;
  // What actually landed, per resource — not the nominal amounts. A gain the cap refused must not
  // appear in the ledger, and the float names every resource the deal carried.
  const received: Partial<Record<keyof WorldState['resources'], number>> = {};
  for (const [key, amount] of Object.entries(effectiveReceive) as [keyof WorldState['resources'], number][]) {
    if ((amount ?? 0) <= 0) continue;
    const added = addCappedResource(state, key, amount);
    if (added <= 0) continue;
    received[key] = added;
    if (key === 'food') {
      recordFoodProduced(state, 'trade', added);
    }
  }
  const gainedGold = effectiveReceive.gold ?? 0;
  if (gainedGold > 0) group.gold = Math.max(0, (group.gold ?? 0) - gainedGold);

  addFloatingText(
    state,
    group.campX,
    group.campY - 20,
    // The resource-formatter owner, so the float's spelling of each key comes from one place
    // (`resourceTypes.formatResourceAmounts`) instead of a local second one.
    formatResourceAmounts(received),
    action.startsWith('buy_') ? '#22c55e' : '#eab308',
  );
  group.tradesCompleted++;
  group.giftsGiven++;
  const tradeDetail = action.replace(/_/g, ' ');
  logEvent(state, 'trade', `Traded with ${group.name} — ${tradeDetail}`, group.name);
  return state;
}

/** Refugee offer prices — exported so the panel's button labels quote the owner's figures. */
const REFUGEE_WELCOME_FOOD = 40;
const REFUGEE_SCREEN_FOOD = 20;

export type RefugeeChoice = 'welcome' | 'screen' | 'turn_away';

export function getRefugeeChoiceEligibility(
  state: WorldState,
  groupId: string,
  choice: RefugeeChoice,
): { ok: boolean; blockReason?: string; silent?: boolean } {
  const group = state.visitorGroups.find((g) => g.id === groupId);
  if (!group) return { ok: false, blockReason: 'No such visitor group', silent: true };
  if (group.kind !== 'refugees') return { ok: false, blockReason: 'Not a refugee group', silent: true };
  if (group.refugeeResolved) {
    return { ok: false, blockReason: 'Refugee talks already concluded', silent: true };
  }
  if (choice === 'turn_away') return { ok: true };

  const foodCost = choice === 'welcome' ? REFUGEE_WELCOME_FOOD : REFUGEE_SCREEN_FOOD;
  if (state.resources.food < foodCost) {
    return { ok: false, blockReason: `Need ${foodCost}🍖` };
  }
  if (playerHumanCount(state.entities) >= state.maxHumanPopulation) {
    return { ok: false, blockReason: 'Population cap reached' };
  }
  return { ok: true };
}

export function negotiateRefugees(
  originalState: WorldState,
  groupId: string,
  choice: RefugeeChoice,
): WorldState {
  const eligibility = getRefugeeChoiceEligibility(originalState, groupId, choice);
  if (!eligibility.ok && eligibility.silent) return originalState;

  const state = structuredClone(originalState);
  const group = state.visitorGroups.find((g) => g.id === groupId);
  if (!group) return state;

  const allAlive = state.entities;

  if (choice === 'turn_away') {
    group.refugeeResolved = true;
    group.daysLeft = 0;
    addReputation(state, -2);
    logEvent(state, 'migration', `${group.name} turned away from the village`, group.name);
    return state;
  }

  if (!eligibility.ok) {
    addFloatingText(state, group.campX, group.campY - 20, eligibility.blockReason ?? 'Cannot settle them', '#f97316');
    return state;
  }

  if (choice === 'welcome') {
    const currentPopulation = playerHumanCount(allAlive);
    const joined = admitRefugees(
      state,
      group,
      allAlive,
      currentPopulation,
      2 + getRefugeeWelcomeBonus(state.buildings),
    );
    if (joined === 0) {
      addFloatingText(state, group.campX, group.campY - 20, 'No room for refugees', '#f97316');
      return state;
    }
    spendFood(state, 'refugees', REFUGEE_WELCOME_FOOD);
    group.refugeeResolved = true;
    const villagers = allAlive.filter(isPlayerHuman);
    assignMissingResidences(villagers, state.buildings, allAlive);
    syncResidenceOccupants(villagers, state.buildings);
    addFloatingText(state, group.campX, group.campY - 20, `+${joined} settlers`, '#22c55e');
    logEvent(state, 'migration', `Welcomed ${joined} refugee(s) from ${group.name}`, group.name);
    return state;
  }

  if (choice === 'screen') {
    const currentPopulation = playerHumanCount(allAlive);
    const joined = seededRandomForRun(`refugee-screen:${group.id}:${state.tick}`) < 0.55 ? admitRefugees(state, group, allAlive, currentPopulation, 1) : 0;
    group.refugeeResolved = true;
    if (joined > 0) {
      spendFood(state, 'refugees', REFUGEE_SCREEN_FOOD);
      const villagers = allAlive.filter(isPlayerHuman);
      assignMissingResidences(villagers, state.buildings, allAlive);
      syncResidenceOccupants(villagers, state.buildings);
      addFloatingText(state, group.campX, group.campY - 20, '+1 refugee', '#22c55e');
      logEvent(state, 'migration', `Screened and admitted a refugee from ${group.name}`, group.name);
    } else {
      logEvent(state, 'migration', `Screened ${group.name} — none qualified to stay`, group.name);
    }
    return state;
  }

  return state;
}

function admitRefugees(
  state: WorldState,
  group: VisitorGroup,
  allAlive: Entity[],
  currentPopulation: number,
  max: number,
): number {
  let joined = 0;
  const stillCamping: number[] = [];
  for (const id of group.entityIds) {
    const ent = allAlive.find((e) => e.id === id && e.alive);
    if (!ent || ent.faction !== 'visitor') continue;
    if (joined >= max || currentPopulation + joined >= state.maxHumanPopulation) {
      stillCamping.push(id);
      continue;
    }
    ent.faction = undefined;
    ent.factionWander = undefined;
    ent.groupId = undefined;
    ent.occupation = 'settler';
    ent.job = JobType.Settler;
    ent.reproductionCooldown = 0;
    // Citizenship is the boundary that establishes permanent identity: a visitor arrives neutral.
    establishCitizenIdentity(ent);
    finalizeSettlerAge(ent, state);
    joined++;
  }
  group.entityIds = stillCamping;
  return joined;
}

type WorldEventId =
  | 'wolf_migration'
  | 'bountiful_harvest'
  | 'traveling_merchant'
  | 'nature_boom'
  | 'surveyors_crown'
  | 'deer_migration'
  | 'generous_neighbors';

const WORLD_EVENTS: { id: WorldEventId; weight: number; minHumans?: number }[] = [
  { id: 'wolf_migration', weight: 10 },
  { id: 'bountiful_harvest', weight: 10 },
  { id: 'traveling_merchant', weight: 8 },
  { id: 'nature_boom', weight: 8 },
  { id: 'surveyors_crown', weight: 5, minHumans: 5 },
  { id: 'deer_migration', weight: 8 },
  { id: 'generous_neighbors', weight: 6, minHumans: 4 },
];

export function rollYearlyWorldEvent(
  state: WorldState,
  allAlive: Entity[],
  _buildings: Building[],
  width: number,
  height: number,
  nextEntityId: () => number,
  /**
   * The tick's context. A spawn must go through `ctx.newEntities`: a bare `allAlive.push` here lands
   * on an array about to be discarded. Optional only for the perf/probe harnesses.
   */
  ctx?: TickContext,
): { event: GameEvent | null; bountifulHarvest: boolean } {
  /**
   * Register one spawned entity through the canonical owner when a context is available. The
   * no-context fallback is the pre-existing behaviour and is never taken in play.
   */
  const register = (entity: Entity | null): void => {
    if (!entity) return;
    if (ctx) pushNewEntity(state, ctx, entity);
    else {
      allAlive.push(entity);
      indexLivingEntity(state, entity);
    }
  };

  const humans = playerHumanCount(allAlive);
  const pool = WORLD_EVENTS.filter((e) => !e.minHumans || humans >= e.minHumans);
  const totalWeight = pool.reduce((s, e) => s + e.weight, 0);
  if (totalWeight <= 0) {
    return { event: null, bountifulHarvest: false };
  }
  let roll = getSimRng('groupEvents')() * totalWeight;
  let picked = pool[0];
  for (const entry of pool) {
    roll -= entry.weight;
    if (roll <= 0) { picked = entry; break; }
  }

  let bountifulHarvest = false;

  switch (picked.id) {
    case 'wolf_migration': {
      for (let i = 0; i < 3; i++) {
        register(spawnWildlife(state, EntityType.Wolf, nextEntityId()));
      }
      return {
        event: { id: `wolf_migration_${state.tick}`, title: 'Wolf Pack Migration', description: 'A pack of wolves has migrated into the valley!', emoji: '🐺', effect: '+3 Wolves', type: 'negative' },
        bountifulHarvest,
      };
    }
    case 'bountiful_harvest':
      bountifulHarvest = true;
      return {
        event: { id: `bountiful_harvest_${state.tick}`, title: 'Bountiful Harvest', description: 'Optimal weather causes a massive agricultural boom!', emoji: '🌾', effect: 'Farm production doubled', type: 'positive' },
        bountifulHarvest,
      };
    case 'traveling_merchant':
      addCappedResource(state, 'gold', 50);
      addFloatingText(state, width / 2, height / 2, '+50 Gold', '#eab308');
      return {
        event: { id: `traveling_merchant_${state.tick}`, title: 'Traveling Merchant', description: 'A wealthy merchant caravan passed through!', emoji: '🛒', effect: '+50 Gold', type: 'positive' },
        bountifulHarvest,
      };
    case 'nature_boom':
      for (let i = 0; i < 15; i++) {
        register(spawnWildlife(state, EntityType.Tree, nextEntityId()));
      }
      for (let i = 0; i < 30; i++) {
        register(spawnWildlife(state, EntityType.Grass, nextEntityId()));
      }
      return {
        event: { id: `nature_boom_${state.tick}`, title: 'Ecological Super-Bloom', description: 'Natural energy revitalizes the valley flora!', emoji: '🌿', effect: '+15 Trees, +30 Grass', type: 'positive' },
        bountifulHarvest,
      };
    case 'surveyors_crown':
      addReputation(state, 5);
      return {
        event: { id: `surveyors_crown_${state.tick}`, title: 'Royal Surveyors', description: 'Crown surveyors mapped your village and filed a favorable report.', emoji: '📜', effect: '+5 Reputation', type: 'positive' },
        bountifulHarvest,
      };
    case 'deer_migration':
      for (let i = 0; i < 4; i++) {
        register(spawnWildlife(state, EntityType.Deer, nextEntityId()));
      }
      return {
        event: { id: `deer_migration_${state.tick}`, title: 'Deer Migration', description: 'A herd of deer wandered into the valley!', emoji: '🦌', effect: '+4 Deer', type: 'positive' },
        bountifulHarvest,
      };
    case 'generous_neighbors':
      recordFoodProduced(state, 'foraging', addCappedResource(state, 'food', 40));
      return {
        event: { id: `generous_neighbors_${state.tick}`, title: 'Forest Bounty', description: 'Foragers returned with an unusually rich harvest.', emoji: '🍄', effect: '+40 Food', type: 'positive' },
        bountifulHarvest,
      };
    default:
      return { event: null, bountifulHarvest };
  }
}

/** Ground a yearly tree or grass patch occupies, validated like any other 32-px prop. */
const YEARLY_PROP_FOOTPRINT_PX = 32;

/** Wildlife keeps this far inside the map edge, so a herd never spawns half off-screen. */
const YEARLY_WILDLIFE_MARGIN_PX = 16;

/**
 * Off-cycle spawns draw from the one random-point owner and pick the domain rule for the type;
 * a fully blocked map spawns nothing.
 */
function spawnWildlife(state: WorldState, type: EntityType, id: number): Entity | null {
  const random = getSimRng('groupEvents');
  const point = type === EntityType.Tree || type === EntityType.Grass
    ? randomPointWhere(state, random, (x, y) => isLegalCampSite(state, x, y, YEARLY_PROP_FOOTPRINT_PX))
    : randomPointWhere(state, random, (x, y) => isPassableWildlifePosition(state, x, y, YEARLY_WILDLIFE_MARGIN_PX));
  if (!point) return null;
  return createEntity(type, point.x, point.y, id, SPECIES_CONFIG[type].spawnEnergy);
}

