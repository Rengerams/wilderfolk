import { pickSite } from './worldEventSites';
import { HUMAN_ADULT_MIN_AGE } from './daycycleconstants';
import type {
  WorldState, Entity, Building, GameEvent, VisitorGroup, VisitorKind,
  VillageRequest, VillageRequestHistoryEntry,
} from './gameTypes';
import { EntityType, BuildingType, JobType } from './gameTypes';
import { assignMissingResidences, getAbsoluteCalendarDay, getColonyDay, HUMAN_MAX_LIFESPAN_YEARS, isNewCalendarDayTick, syncResidenceOccupants, TICKS_PER_DAY } from './dayCycle';
import { createEntity, finalizeSettlerAge } from './entityFactory';
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
import { getRandomSurname } from './nameLoader';
import { maybeStartVisitorQuest } from './visitorQuest';
import { logEvent } from './eventLog';
import { getPlayerCampCenter } from './frontierCombat';
import { clearFactionWanderState } from './factionWander';
import { getRefugeeWelcomeBonus } from './townHall';
import { addBigNews, addFloatingText, addNotification } from './simEffects';
import { killWildGameForPoach, makeNextAliveDeer } from './rivalEvents';
import { addReputation, getReputationBand } from './simHelpers';
import { grantResearchProgress } from './research';
import { formatResourceAmounts, RESOURCE_METAS, type ResourceKey } from './resourceTypes';

// Village Requests — one bounded daily offer system.
export const VILLAGE_REQUEST_PROVISIONS_COST_GOLD = 15;
export const VILLAGE_REQUEST_PROVISIONS_FOOD = 30;
export const VILLAGE_REQUEST_PROVISIONS_REPUTATION = 2;
export const VILLAGE_REQUEST_DECLINE_REPUTATION = 1;
export const VILLAGE_REQUEST_EXPIRY_DAYS = 3;
export const VILLAGE_REQUEST_COOLDOWN_DAYS = 7;
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
    if (day > active.expiresDay || !findLiveRequestSource(state, active)) {
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

  const state = cloneWorldStateForAction(originalState);
  const request = state.activeVillageRequest;
  if (!request || request.id !== requestId) return state;
  const day = getAbsoluteCalendarDay(state.tick);
  const source = findLiveRequestSource(state, request);
  if (day > request.expiresDay || !source) {
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
  // The provisions are food *bought*, so the ledger's produced side gets the row — and it gets what
  // storage actually accepted, not the nominal amount (`LIVE-FINDINGS-STATUS.md`, E-2; the same rule
  // as M5's accepted catch).
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

function cloneWorldStateForAction(originalState: WorldState): WorldState {
  return structuredClone(originalState);
}

function buildAliveEntityIndex(allAlive: Entity[]): Map<number, Entity> {
  const index = new Map<number, Entity>();
  for (const e of allAlive) {
    if (e.alive) index.set(e.id, e);
  }
  return index;
}

/** Daily faction-human spawn: `pushNewEntity` when a tick context is present, else the harness fallback. */
function registerSpawnedEntity(
  state: WorldState,
  allAlive: Entity[],
  entity: Entity,
  ctx?: TickContext,
): void {
  if (ctx) {
    pushNewEntity(state, ctx, entity);
    if (!allAlive.includes(entity)) allAlive.push(entity);
    return;
  }
  allAlive.push(entity);
  indexLivingEntity(state, entity);
}

function createVisitorHuman(
  state: WorldState,
  x: number,
  y: number,
  groupId: string,
  surname: string
): Entity {
  const age = HUMAN_ADULT_MIN_AGE + Math.floor(getSimRng('groupEvents')() * 20);
  const ent = createEntity(
    EntityType.Human,
    x + (getSimRng('groupEvents')() - 0.5) * 24,
    y + (getSimRng('groupEvents')() - 0.5) * 24,
    state.nextEntityId++,
    undefined,
    false,
    { surname, ageYears: age, colonyDay: getColonyDay(state) },
  );
  ent.faction = 'visitor';
  ent.hiddenFromPlayer = false;
  ent.groupId = groupId;
  ent.occupation = 'visitor';
  ent.job = JobType.Settler;
  ent.relationshipStatus = 'single';
  ent.reproductionCooldown = 9999;
  ent.flash = 8;
  ent.maxAge = HUMAN_MAX_LIFESPAN_YEARS;
  return ent;
}

const VISITOR_TEMPLATES: Record<VisitorKind, { emoji: string; names: string[]; days: [number, number]; members: [number, number] }> = {
  traders: { emoji: '🛒', names: ['River Traders', 'Wandering Merchants', 'Highland Caravan'], days: [12, 22], members: [3, 5] },
  pilgrims: { emoji: '🕯️', names: ['Pilgrims of the Glen', 'Wayfarer Monks', 'Lantern Pilgrimage'], days: [10, 18], members: [4, 6] },
  scholars: { emoji: '📚', names: ['Royal Surveyors', 'Field Naturalists', 'Cartography Guild'], days: [14, 24], members: [3, 4] },
  hunters: { emoji: '🏹', names: ['Wilderness Hunters', 'Fur Trappers', 'Longbow Company'], days: [8, 16], members: [3, 5] },
  nomads: { emoji: '🐎', names: ['Steppe Nomads', 'Horse Clan', 'Dust Road Kin'], days: [10, 20], members: [4, 7] },
  refugees: { emoji: '🧳', names: ['Road-Weary Families', 'Displaced Kin', 'Valley Refugees'], days: [6, 14], members: [3, 5] },
  performers: { emoji: '🎭', names: ['Traveling Players', 'Bardic Troupe', 'Fire-Jugglers'], days: [8, 15], members: [4, 6] },
};

export function spawnVisitorGroup(
  state: WorldState,
  allAlive: Entity[],
  buildings: Building[],
  kind: VisitorKind,
  ctx?: TickContext,
): GameEvent {
  const template = VISITOR_TEMPLATES[kind];
  const name = template.names[Math.floor(getSimRng('groupEvents')() * template.names.length)];
  const center = getPlayerCampCenter(state, buildings);
  const avoid = [
    ...state.visitorGroups.map((v) => ({ x: v.campX, y: v.campY })),
  ];
  const site = pickSite(state, center, 70, 160, avoid);
  const memberCount = template.members[0] + Math.floor(getSimRng('groupEvents')() * (template.members[1] - template.members[0] + 1));
  const daysLeft = template.days[0] + Math.floor(getSimRng('groupEvents')() * (template.days[1] - template.days[0] + 1));
  const groupId = `visitor_${state.tick}_${Math.floor(getSimRng('groupEvents')() * 10000)}`;
  const surname = getRandomSurname();
  const entityIds: number[] = [];

  for (let i = 0; i < memberCount; i++) {
    const ent = createVisitorHuman(state, site.x, site.y, groupId, surname);
    entityIds.push(ent.id);
    registerSpawnedEntity(state, allAlive, ent, ctx);
  }

  state.visitorGroups.push({
    id: groupId,
    name,
    kind,
    campX: site.x,
    campY: site.y,
    daysLeft,
    spawnedAtCalendarDay: getAbsoluteCalendarDay(state.tick),
    entityIds,
    giftsGiven: 0,
    tradesCompleted: 0,
    gold: seedGroupGold(kind),
    refugeeResolved: kind !== 'refugees',
    leaderTalked: false,
  });

  const effectMap: Record<VisitorKind, string> = {
    traders: 'May trade goods while camped nearby',
    pilgrims: 'Boosts village reputation',
    scholars: 'Shares knowledge with your people',
    hunters: 'Competes for local game',
    nomads: 'Brings exotic stories and gifts',
    refugees: 'May ask to join your village',
    performers: 'Lifts spirits — courtship boosted',
  };

  addBigNews(
    state,
    `${template.emoji} Visitors Arrived!`,
    `${name} (${memberCount}) set camp near ${state.villageName}. They'll stay ${daysLeft} more day${daysLeft === 1 ? '' : 's'} after today.`,
    'neutral',
  );
  addNotification(
    state,
    `${template.emoji} ${name} camped nearby`,
    `Click to find their camp — talk to the ${kind === 'traders' ? 'caravan master' : kind === 'refugees' ? 'spokesman' : 'leader'} or trade while they stay.`,
    'event',
    { x: site.x, y: site.y },
    `visitor:${groupId}`,
  );
  logEvent(state, 'migration', `${name} arrived near the village`, name);

  if (kind === 'traders') maybeStartVisitorQuest(state);

  return {
    id: `visitor_${kind}_${state.tick}`,
    title: `${template.emoji} ${name}`,
    description: `A group of ${memberCount} travelers has set camp near your village.`,
    emoji: template.emoji,
    effect: effectMap[kind],
    type: 'neutral',
  };
}

export function tickVisitorGroups(state: WorldState, allAlive: Entity[]): void {
  // The loop below is the only consumer of both indexes and the only writer is the
  // `state.visitorGroups = remaining` reassignment at the end (this function never spawns a group —
  // `spawnVisitorGroup` is called from the yearly/mid-year event rolls). With the list empty those
  // two passes over `allAlive`, grass and trees included, plus a ~900-entry Map, bought nothing, and
  // they ran unconditionally once per colony day.
  if (state.visitorGroups.length === 0) return;

  const remaining: VisitorGroup[] = [];
  const aliveById = buildAliveEntityIndex(allAlive);
  const nextDeer = makeNextAliveDeer(allAlive);

  const newCalendarDay = isNewCalendarDayTick(state);
  const calendarDay = getAbsoluteCalendarDay(state.tick);

  for (const group of state.visitorGroups) {
    const arrivedDay = group.spawnedAtCalendarDay ?? calendarDay;
    if (newCalendarDay && calendarDay > arrivedDay + 1) group.daysLeft--;

    if (newCalendarDay && group.daysLeft > 0) {
      switch (group.kind) {
        case 'traders': {
          const goldWant = 15 + Math.floor(getSimRng('groupEvents')() * 25);
          const gold = Math.min(group.gold ?? 0, goldWant);
          group.gold = (group.gold ?? 0) - gold;
          const food = 10 + Math.floor(getSimRng('groupEvents')() * 20);
          addCappedResource(state, 'gold', gold);
          addCappedResource(state, 'food', food);
          addFloatingText(state, group.campX, group.campY - 20, `+${gold}g +${food}f`, '#eab308');
          group.giftsGiven++;
          break;
        }
        case 'pilgrims':
          addReputation(state, 2);
          addFloatingText(state, group.campX, group.campY - 20, '+Rep', '#22c55e');
          group.giftsGiven++;
          break;
        case 'scholars':
          if (state.activeResearch) {
            grantResearchProgress(state, 3);
            addFloatingText(state, group.campX, group.campY - 20, '+Research', '#8b5cf6');
          } else {
            const goldGift = Math.min(group.gold ?? 0, 10);
            group.gold = (group.gold ?? 0) - goldGift;
            addCappedResource(state, 'gold', goldGift);
          }
          group.giftsGiven++;
          break;
        case 'nomads': {
          const wood = 10 + Math.floor(getSimRng('groupEvents')() * 15);
          addCappedResource(state, 'wood', wood);
          addFloatingText(state, group.campX, group.campY - 20, `+${wood}w`, '#d97706');
          group.giftsGiven++;
          break;
        }
        case 'performers':
          addReputation(state, 1);
          addFloatingText(state, group.campX, group.campY - 20, '🎭', '#f472b6');
          group.giftsGiven++;
          break;
        case 'refugees':
          break;
        case 'hunters': {
          const deer = nextDeer();
          const poachChance = group.leaderTalked ? 0.1 : 0.25;
          if (deer && seededRandomForRun(`poach:${group.id}:${state.tick}`) < poachChance) {
            killWildGameForPoach(state, deer);
            addFloatingText(state, deer.x, deer.y - 15, 'Hunted', '#f97316');
          }
          break;
        }
      }
    }

    if (group.daysLeft <= 0) {
      for (const id of group.entityIds) {
        clearFactionWanderState(id);
        const ent = aliveById.get(id);
        if (ent?.faction === 'visitor') {
          ent.alive = false;
          unindexEntityFromState(state, ent.id);
          aliveById.delete(id);
        }
      }
      addBigNews(state, '👋 Visitors Departed', `${group.name} packed up and left the valley.`, 'neutral');
      logEvent(state, 'migration', `${group.name} departed`);
    } else {
      remaining.push(group);
    }
  }

  state.visitorGroups = remaining;
}

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
    hint: 'Once per visit: revelry lifts spirits (+6 rep, mini festival 3d).',
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
  const state = cloneWorldStateForAction(originalState);
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
        state.festival = { active: true, name: 'Visitor Revelry', daysLeft: 3 };
      } else {
        state.festival.daysLeft = Math.min(14, state.festival.daysLeft + 2);
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
  // Stone is a building, repair, upgrade, forge and research input everywhere else, and until now it
  // was the one `ResourceKey` a caravan could neither sell nor buy — a colony short of stone had no
  // visitor route to it at all (`tradeRoutes` could import it; the caravan could not). Priced against
  // the two neighbours: as cheap as wood in gold per unit, but the pile is smaller, and it sells for
  // slightly more per unit than wood because the caravan has no cheaper way to get it.
  buy_stone: { pay: { gold: 20 }, receive: { stone: 25 } },
  buy_iron: { pay: { gold: 35 }, receive: { iron: 12 } },
  sell_food: { pay: { food: 30 }, receive: { gold: 25 } },
  sell_wood: { pay: { wood: 40 }, receive: { gold: 20 } },
  sell_stone: { pay: { stone: 35 }, receive: { gold: 20 } },
  sell_iron: { pay: { iron: 15 }, receive: { gold: 25 } },
} as const;

export type VisitorTradeAction = keyof typeof VISITOR_TRADE_COSTS;

/**
 * Visitor trade prices by the reputation bands its owner declares (`simHelpers`, next to
 * `addReputation`). The bands were hand-written here at `>= 80` / `<= 30` while `frontierCombat`
 * hand-wrote the same two numbers again for its raid odds, so retuning one left the other quoting
 * retired bands (audit "Reputation 80/30 bands"). `getVisitorTradePriceMult` below is the trade's
 * own pricing and stays here; only the band boundaries are the owner's.
 */
export function getVisitorTradePriceMult(rep: number): number {
  const band = getReputationBand(rep);
  return band === 'friendly' ? 0.8 : band === 'harsh' ? 1.25 : 1;
}

export function getVisitorTradeRewardMult(rep: number): number {
  return getReputationBand(rep) === 'friendly' ? 1.15 : 1;
}

function seedGroupGold(kind: VisitorKind): number {
  const ranges: Partial<Record<VisitorKind, [number, number]>> = {
    traders: [40, 80],
    hunters: [20, 50],
    nomads: [15, 40],
    scholars: [10, 30],
    pilgrims: [0, 15],
    performers: [0, 20],
  };
  const [lo, hi] = ranges[kind] ?? [0, 20];
  return lo + Math.floor(getSimRng('groupEvents')() * (hi - lo + 1));
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

  const state = cloneWorldStateForAction(originalState);
  const group = state.visitorGroups.find((g) => g.id === groupId);
  if (!group) return state;

  if (!eligibility.ok) {
    return rejectVisitorTrade(state, group, eligibility.blockReason ?? 'Cannot trade', eligibility.notify);
  }

  const { effectivePay, effectiveReceive } = getVisitorTradeTerms(state, action);
  // Food is the one resource the economy ledger tracks, so both of its sides here go through the
  // owners: `spendFood` deducts *and* records the named sink on the way out, and `recordFoodProduced`
  // records what storage actually accepted on the way in. Selling 30 food to a passing caravan used
  // to leave the "Net food flow" panel untouched, which is how the panel could read a positive net on
  // a day the larder fell (`LIVE-FINDINGS-STATUS.md`, E-2). The other resources keep their existing
  // bundle path — the ledger has no row for them.
  const foodPaid = effectivePay.food ?? 0;
  if (foodPaid > 0) {
    delete effectivePay.food;
    spendFood(state, 'trade', foodPaid);
  }
  consumeResources(state, effectivePay);
  const paidGold = effectivePay.gold ?? 0;
  if (paidGold > 0) group.gold = (group.gold ?? 0) + paidGold;
  // What actually landed, per resource — not the nominal amounts. A gain the cap refused must not
  // appear in the ledger as food the colony received (`LIVE-FINDINGS-STATUS.md`, M5), and the float
  // must name every resource the deal carried. Accumulating into a list rather than assigning a
  // single string is the fix for the other half of that: a multi-resource deal (`trade_3` pays gold
  // *and* iron, `trade_7` stone *and* gold) used to overwrite the label each pass, so the float
  // announced only the last key and silently dropped the rest.
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
export const REFUGEE_WELCOME_FOOD = 40;
export const REFUGEE_SCREEN_FOOD = 20;

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

  const state = cloneWorldStateForAction(originalState);
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
    ent.groupId = undefined;
    ent.occupation = 'settler';
    ent.job = JobType.Settler;
    ent.reproductionCooldown = 0;
    finalizeSettlerAge(ent, state);
    joined++;
  }
  group.entityIds = stillCamping;
  return joined;
}

export type CampHit = { kind: 'visitor'; id: string; x: number; y: number };

export function hitTestCamp(
  state: WorldState,
  worldX: number,
  worldY: number,
  hitRadius = 28,
): CampHit | null {
  for (const group of state.visitorGroups) {
    if (Math.hypot(group.campX - worldX, group.campY - worldY) <= hitRadius) {
      return { kind: 'visitor', id: group.id, x: group.campX, y: group.campY };
    }
  }
  return null;
}

export type WorldEventId =
  | 'wolf_migration'
  | 'bountiful_harvest'
  | 'traveling_merchant'
  | 'nature_boom'
  | 'visiting_traders'
  | 'pilgrim_caravan'
  | 'scholar_expedition'
  | 'nomad_hunters'
  | 'refugee_family'
  | 'wandering_performers'
  | 'surveyors_crown'
  | 'deer_migration'
  | 'generous_neighbors';

const WORLD_EVENTS: { id: WorldEventId; weight: number; minHumans?: number; requiresNoVisitors?: boolean }[] = [
  { id: 'wolf_migration', weight: 10 },
  { id: 'bountiful_harvest', weight: 10 },
  { id: 'traveling_merchant', weight: 8 },
  { id: 'nature_boom', weight: 8 },
  { id: 'visiting_traders', weight: 10, minHumans: 4, requiresNoVisitors: true },
  { id: 'pilgrim_caravan', weight: 8, minHumans: 3, requiresNoVisitors: true },
  { id: 'scholar_expedition', weight: 7, minHumans: 5, requiresNoVisitors: true },
  { id: 'nomad_hunters', weight: 6, minHumans: 4, requiresNoVisitors: true },
  { id: 'refugee_family', weight: 5, minHumans: 3, requiresNoVisitors: true },
  { id: 'wandering_performers', weight: 7, minHumans: 4, requiresNoVisitors: true },
  { id: 'surveyors_crown', weight: 5, minHumans: 5 },
  { id: 'deer_migration', weight: 8 },
  { id: 'generous_neighbors', weight: 6, minHumans: 4 },
];

export function rollYearlyWorldEvent(
  state: WorldState,
  allAlive: Entity[],
  buildings: Building[],
  width: number,
  height: number,
  nextEntityId: () => number,
  /**
   * The tick's context. This runs inside the daily layer, i.e. **after**
   * `gameTick`'s `assertSpatialGridInvariants` and **before** `state.entities = allAlive`, so a bare
   * `allAlive.push` + `indexLivingEntity` lands on an array that is about to be discarded: the spawned
   * entity is missing from `ctx.newEntities` and from the spatial grids for the rest of the tick.
   * Optional because the perf/probe harnesses call this without a context; production always passes it.
   */
  ctx?: TickContext,
): { event: GameEvent | null; bountifulHarvest: boolean } {
  /**
   * Register one spawned entity through the canonical owner when a context is available. The
   * no-context fallback is the pre-existing behaviour and is never taken in play.
   */
  const register = (entity: Entity): void => {
    if (ctx) pushNewEntity(state, ctx, entity);
    else {
      allAlive.push(entity);
      indexLivingEntity(state, entity);
    }
  };

  const humans = playerHumanCount(allAlive);
  const pool = WORLD_EVENTS.filter((e) => {
    if (e.minHumans && humans < e.minHumans) return false;
    if (e.requiresNoVisitors && state.visitorGroups.length > 0) return false;
    return true;
  });
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
        register(spawnWolf(width, height, nextEntityId()));
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
        register(spawnTree(width, height, nextEntityId()));
      }
      for (let i = 0; i < 30; i++) {
        register(spawnGrass(width, height, nextEntityId()));
      }
      return {
        event: { id: `nature_boom_${state.tick}`, title: 'Ecological Super-Bloom', description: 'Natural energy revitalizes the valley flora!', emoji: '🌿', effect: '+15 Trees, +30 Grass', type: 'positive' },
        bountifulHarvest,
      };
    case 'visiting_traders':
      return { event: spawnVisitorGroup(state, allAlive, buildings, 'traders', ctx), bountifulHarvest };
    case 'pilgrim_caravan':
      return { event: spawnVisitorGroup(state, allAlive, buildings, 'pilgrims', ctx), bountifulHarvest };
    case 'scholar_expedition':
      return { event: spawnVisitorGroup(state, allAlive, buildings, 'scholars', ctx), bountifulHarvest };
    case 'nomad_hunters':
      return { event: spawnVisitorGroup(state, allAlive, buildings, 'hunters', ctx), bountifulHarvest };
    case 'refugee_family':
      return { event: spawnVisitorGroup(state, allAlive, buildings, 'refugees', ctx), bountifulHarvest };
    case 'wandering_performers':
      return { event: spawnVisitorGroup(state, allAlive, buildings, 'performers', ctx), bountifulHarvest };
    case 'surveyors_crown':
      addReputation(state, 5);
      return {
        event: { id: `surveyors_crown_${state.tick}`, title: 'Royal Surveyors', description: 'Crown surveyors mapped your village and filed a favorable report.', emoji: '📜', effect: '+5 Reputation', type: 'positive' },
        bountifulHarvest,
      };
    case 'deer_migration':
      for (let i = 0; i < 4; i++) {
        register(spawnDeer(width, height, nextEntityId()));
      }
      return {
        event: { id: `deer_migration_${state.tick}`, title: 'Deer Migration', description: 'A herd of deer wandered into the valley!', emoji: '🦌', effect: '+4 Deer', type: 'positive' },
        bountifulHarvest,
      };
    case 'generous_neighbors':
      addCappedResource(state, 'food', 40);
      return {
        event: { id: `generous_neighbors_${state.tick}`, title: 'Forest Bounty', description: 'Foragers returned with an unusually rich harvest.', emoji: '🍄', effect: '+40 Food', type: 'positive' },
        bountifulHarvest,
      };
    default:
      return { event: null, bountifulHarvest };
  }
}

function spawnWolf(width: number, height: number, id: number): Entity {
  return createEntity(
    EntityType.Wolf,
    getSimRng('groupEvents')() * width,
    getSimRng('groupEvents')() * height,
    id,
    SPECIES_CONFIG[EntityType.Wolf].spawnEnergy,
  );
}

function spawnDeer(width: number, height: number, id: number): Entity {
  return createEntity(
    EntityType.Deer,
    getSimRng('groupEvents')() * width,
    getSimRng('groupEvents')() * height,
    id,
    SPECIES_CONFIG[EntityType.Deer].spawnEnergy,
  );
}

function spawnTree(width: number, height: number, id: number): Entity {
  return createEntity(
    EntityType.Tree,
    getSimRng('groupEvents')() * width,
    getSimRng('groupEvents')() * height,
    id,
    SPECIES_CONFIG[EntityType.Tree].spawnEnergy,
  );
}

function spawnGrass(width: number, height: number, id: number): Entity {
  return createEntity(
    EntityType.Grass,
    getSimRng('groupEvents')() * width,
    getSimRng('groupEvents')() * height,
    id,
    SPECIES_CONFIG[EntityType.Grass].spawnEnergy,
  );
}

export function tryMidYearVisitorEvent(
  state: WorldState,
  allAlive: Entity[],
  buildings: Building[],
  ctx?: TickContext,
): GameEvent | null {
  if (state.visitorGroups.length > 0) return null;
  if (playerHumanCount(allAlive) < 4) return null;
  if (seededRandomForRun(`mid-year-visitors:${state.tick}`) > 0.22) return null;
  const kinds: VisitorKind[] = ['traders', 'pilgrims', 'performers', 'nomads', 'scholars'];
  const kind = kinds[Math.floor(seededRandomForRun(`mid-year-kind:${state.tick}`) * kinds.length)];
  return spawnVisitorGroup(state, allAlive, buildings, kind, ctx);
}

export function tryFirstWeekVisitor(
  state: WorldState,
  allAlive: Entity[],
  buildings: Building[],
  ctx?: TickContext,
): GameEvent | null {
  if (state.firstWeekVisitorSpawned) return null;
  if (state.tick < 7 * TICKS_PER_DAY || state.tick >= 14 * TICKS_PER_DAY) return null;

  const hasPlayerHouse = buildings.some(
    (b) =>
      b.completed
      && b.faction !== 'rival'
      && (b.type === BuildingType.House || b.type === BuildingType.Mansion),
  );
  if (!hasPlayerHouse) return null;

  state.firstWeekVisitorSpawned = true;
  const kind: VisitorKind = getSimRng('groupEvents')() < 0.55 ? 'pilgrims' : 'performers';
  const event = spawnVisitorGroup(state, allAlive, buildings, kind, ctx);
  addBigNews(
    state,
    '🛖 Neighbors on the trail',
    `Word of ${state.villageName} reached the valley — ${kind} have come to greet your pioneers.`,
    'positive',
  );
  return event;
}

