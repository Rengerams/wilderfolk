import type {
  WorldState, Entity, Building, GameEvent, VisitorGroup, RivalSettlement, VisitorKind,
  DiplomacyEvent, DiplomacyEventKind, DiplomacyChoice, VillageRequest, VillageRequestHistoryEntry,
} from './gameTypes';
import { EntityType, BuildingType, BUILDING_CONFIGS, JobType } from './gameTypes';
import {
  assignMissingResidences,
  getAbsoluteCalendarDay,
  getColonyDay,
  HUMAN_ADULT_MIN_AGE,
  HUMAN_MAX_LIFESPAN_YEARS,
  isNewCalendarDayTick,
  syncResidenceOccupants,
  TICKS_PER_DAY,
} from './dayCycle';
import { createEntity, finalizeSettlerAge } from './entityFactory';
import { indexLivingEntity, unindexEntityFromState } from './entityIndex';
import { SPECIES_CONFIG } from './speciesConfig';
import {
  addCappedResource,
  canAfford,
  consumeResources,
  getAvailableStorageHeadroom,
} from './resourceUtils';
import { getRandomSurname } from './nameLoader';
import { hasIronSpears, hasStoneSpears } from './combat';
import { maybeStartVisitorQuest } from './visitorQuest';
import { logEvent } from './eventLog';
import {
  cancelPendingOutgoingRaidsForRival,
  cancelPendingRaidsForRival,
  getPlayerCampCenter,
} from './frontierCombat';
import { clearFactionWanderState } from './factionWander';
import { getRefugeeWelcomeBonus } from './townHall';
import { addNotification } from './simEffects';
import { tickRivalSettlements as tickRivalEvents } from './rivalEvents';
import { createRivalProfile, ensureRivalProfile } from './rivalProfiles';

let newsSeq = 0;

function pushNews(state: WorldState, title: string, message: string, type: 'positive' | 'negative' | 'neutral') {
  state.bigNews.push({
    id: `ge_${++newsSeq}_${state.tick}`,
    title,
    message,
    type,
    createdAt: state.tick,
    dismissed: false,
  });
  if (state.bigNews.length > 50) state.bigNews.shift();
}

function pushFloat(state: WorldState, x: number, y: number, text: string, color: string) {
  state.floatingTexts.push({
    id: state.nextFloatingTextId++,
    x, y, text, color,
    life: 24, maxLife: 24, scale: 1,
  });
}

// Village Requests — one bounded daily offer system. This stays in groupEvents
// because it derives from a live caravan and resolves through the same typed
// command/domain boundary as visitor trade. It is deliberately not a generic
// event manager or second economy owner.
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
  pushFloat(state, x, y - 18, 'Offer expired', '#f59e0b');
  logEvent(state, 'event', `${request.sourceName}'s provisions offer expired`, request.sourceName);
}

/** Daily owner: expire stale offers or generate one caravan offer at most. */
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
    createdDay: day,
    expiresDay: day + VILLAGE_REQUEST_EXPIRY_DAYS,
  };
  pushNews(state, '🥣 Caravan offer', `${trader.name} offers food for a fair price.`, 'neutral');
  logEvent(state, 'event', `${trader.name} offered caravan provisions`, trader.name);
}

/**
 * Whether `resolveVillageRequest` would accept this answer right now.
 *
 * Mirrors the guards the resolver applies before it spends gold or fills the
 * granary — the same contract `getDiplomacyChoiceEligibility` and
 * `getRaidChoiceEligibility` provide for their cards — so a consumer can tell an
 * answer that will land from one the resolver refuses. A refused accept leaves the
 * offer open and would burn every auto-play hour, so the bot asks this first.
 */
export function getVillageRequestEligibility(
  state: WorldState,
  request: VillageRequest,
  choiceId: VillageRequestChoiceId,
): { ok: boolean; blockReason?: string } {
  if (choiceId === 'accept' && state.resources.gold < VILLAGE_REQUEST_PROVISIONS_COST_GOLD) {
    return { ok: false, blockReason: `Need ${VILLAGE_REQUEST_PROVISIONS_COST_GOLD} gold` };
  }
  if (choiceId === 'accept' && getAvailableStorageHeadroom(state, 'food') < VILLAGE_REQUEST_PROVISIONS_FOOD) {
    return { ok: false, blockReason: 'Food storage full' };
  }
  return { ok: true };
}

/** Player-command resolution for the sole active Village Request. */
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
    state.villageReputation = Math.max(0, state.villageReputation - VILLAGE_REQUEST_DECLINE_REPUTATION);
    finishVillageRequest(state, request, 'declined', day);
    pushFloat(state, source.campX, source.campY - 18, 'Offer declined', '#94a3b8');
    logEvent(state, 'event', `Declined ${source.name}'s provisions offer`, source.name);
    return state;
  }

  // The offer owner's eligibility rule is the single definition of an acceptable
  // accept — never restate the gold/storage thresholds here.
  const gate = getVillageRequestEligibility(state, request, choice);
  if (!gate.ok) {
    const reason = gate.blockReason ?? 'Offer unavailable';
    pushNews(state, 'Offer unavailable', reason, 'negative');
    pushFloat(state, source.campX, source.campY - 18, reason, '#f97316');
    return state;
  }

  state.resources.gold -= VILLAGE_REQUEST_PROVISIONS_COST_GOLD;
  addCappedResource(state, 'food', VILLAGE_REQUEST_PROVISIONS_FOOD);
  state.villageReputation = Math.min(100, state.villageReputation + VILLAGE_REQUEST_PROVISIONS_REPUTATION);
  source.tradesCompleted++;
  finishVillageRequest(state, request, 'accepted', day);
  pushFloat(state, source.campX, source.campY - 18, `-${VILLAGE_REQUEST_PROVISIONS_COST_GOLD} gold +${VILLAGE_REQUEST_PROVISIONS_FOOD} food`, '#22c55e');
  logEvent(state, 'trade', `Accepted ${source.name}'s provisions offer (+${VILLAGE_REQUEST_PROVISIONS_FOOD} food)`, source.name);
  return state;
}

export { isPlayerHuman, playerHumanCount } from './playerHuman';
import { isPlayerHuman, playerHumanCount } from './playerHuman';
import { getSimRng, seededRandomForRun } from './simRng';

/** Deep-clone world state for player actions that mutate simulation data. */
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

function buildAliveDeerList(allAlive: Entity[]): Entity[] {
  const deer: Entity[] = [];
  for (const e of allAlive) {
    // Never poach colony stock — same rule as free-roam / wildlife hunt
    if (e.alive && e.type === EntityType.Deer && e.tamedBy == null) deer.push(e);
  }
  return deer;
}

/** Kill wild game from visitor/rival actions — unindex + drop hunt chases. */
function killWildGameForPoach(state: WorldState, animal: Entity): void {
  if (!animal.alive) return;
  animal.alive = false;
  unindexEntityFromState(state, animal.id);
  for (const e of state.entities) {
    if (e.huntTargetId === animal.id) e.huntTargetId = undefined;
  }
}

function makeNextAliveDeer(deerList: Entity[]): () => Entity | undefined {
  let idx = 0;
  return () => {
    while (idx < deerList.length) {
      const deer = deerList[idx];
      if (deer?.alive) return deer;
      idx++;
    }
    return undefined;
  };
}

function pickSite(
  state: WorldState,
  anchor: { x: number; y: number },
  minDist: number,
  maxDist: number,
  avoid: { x: number; y: number }[] = []
): { x: number; y: number } {
  const margin = 80;
  for (let attempt = 0; attempt < 40; attempt++) {
    const angle = getSimRng('groupEvents')() * Math.PI * 2;
    const dist = minDist + getSimRng('groupEvents')() * (maxDist - minDist);
    const x = Math.max(margin, Math.min(state.width - margin, anchor.x + Math.cos(angle) * dist));
    const y = Math.max(margin, Math.min(state.height - margin, anchor.y + Math.sin(angle) * dist));
    const tooClose = avoid.some((p) => Math.hypot(p.x - x, p.y - y) < minDist * 0.6);
    if (!tooClose) return { x, y };
  }
  return {
    x: Math.max(margin, Math.min(state.width - margin, anchor.x + minDist)),
    y: Math.max(margin, Math.min(state.height - margin, anchor.y)),
  };
}

function createFactionHuman(
  state: WorldState,
  x: number,
  y: number,
  faction: 'visitor' | 'rival',
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
  ent.faction = faction;
  ent.hiddenFromPlayer = false;
  ent.groupId = groupId;
  ent.occupation = faction === 'visitor' ? 'visitor' : 'settler';
  ent.job = JobType.Settler;
  ent.relationshipStatus = 'single';
  ent.reproductionCooldown = 9999;
  ent.flash = 8;
  ent.maxAge = HUMAN_MAX_LIFESPAN_YEARS;
  return ent;
}

function createRivalBuilding(
  state: WorldState,
  type: BuildingType,
  x: number,
  y: number,
  groupId: string,
  campLabel: string
): Building {
  const config = BUILDING_CONFIGS[type];
  return {
    id: state.nextBuildingId++,
    type, x, y,
    width: config.width,
    height: config.height,
    occupants: [],
    level: 1,
    constructionProgress: 100,
    completed: true,
    health: 100,
    maxHealth: 100,
    spriteScale: 1,
    buildAnimTimer: 0,
    faction: 'rival',
    groupId,
    campLabel,
  };
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

const RIVAL_PREFIXES = ['Oak', 'Mist', 'Iron', 'Silver', 'Ash', 'Cedar', 'Stone', 'Willow', 'Fox', 'Raven'];
const RIVAL_SUFFIXES = ['Hollow', 'Reach', 'Ford', 'Glen', 'Creek', 'Ridge', 'Crossing', 'Haven'];

function randomRivalName(): string {
  const prefix = RIVAL_PREFIXES[Math.floor(getSimRng('groupEvents')() * RIVAL_PREFIXES.length)];
  const suffix = RIVAL_SUFFIXES[Math.floor(getSimRng('groupEvents')() * RIVAL_SUFFIXES.length)];
  return `${prefix}${suffix}`;
}

export function spawnVisitorGroup(
  state: WorldState,
  allAlive: Entity[],
  buildings: Building[],
  kind: VisitorKind
): GameEvent {
  const template = VISITOR_TEMPLATES[kind];
  const name = template.names[Math.floor(getSimRng('groupEvents')() * template.names.length)];
  const center = getPlayerCampCenter(state, buildings);
  const avoid = [
    ...state.rivalSettlements.map((r) => ({ x: r.campX, y: r.campY })),
    ...state.visitorGroups.map((v) => ({ x: v.campX, y: v.campY })),
  ];
  const site = pickSite(state, center, 70, 160, avoid);
  const memberCount = template.members[0] + Math.floor(getSimRng('groupEvents')() * (template.members[1] - template.members[0] + 1));
  const daysLeft = template.days[0] + Math.floor(getSimRng('groupEvents')() * (template.days[1] - template.days[0] + 1));
  const groupId = `visitor_${state.tick}_${Math.floor(getSimRng('groupEvents')() * 10000)}`;
  const surname = getRandomSurname();
  const entityIds: number[] = [];

  for (let i = 0; i < memberCount; i++) {
    const ent = createFactionHuman(state, site.x, site.y, 'visitor', groupId, surname);
    entityIds.push(ent.id);
    allAlive.push(ent);
    indexLivingEntity(state, ent);
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

  pushNews(
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

  // The traveling smith tags along with trader camps (visitor quest, v0.5.2).
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

export function spawnRivalSettlement(
  state: WorldState,
  allAlive: Entity[],
  buildings: Building[]
): GameEvent {
  const name = randomRivalName();
  const center = getPlayerCampCenter(state, buildings);
  const avoid = [
    center,
    ...state.rivalSettlements.map((r) => ({ x: r.campX, y: r.campY })),
    ...state.visitorGroups.map((v) => ({ x: v.campX, y: v.campY })),
  ];
  const site = pickSite(state, center, 180, Math.min(state.width, state.height) * 0.38, avoid);
  const groupId = `rival_${state.tick}_${Math.floor(getSimRng('groupEvents')() * 10000)}`;
  const surname = name;
  const pop = 4 + Math.floor(getSimRng('groupEvents')() * 4);
  const entityIds: number[] = [];
  const buildingIds: number[] = [];

  const offsets = [
    { type: BuildingType.House, dx: 0, dy: 0 },
    { type: BuildingType.Farm, dx: 55, dy: 10 },
    { type: BuildingType.Well, dx: -40, dy: 25 },
  ];
  for (const off of offsets) {
    const b = createRivalBuilding(state, off.type, site.x + off.dx, site.y + off.dy, groupId, name);
    buildings.push(b);
    buildingIds.push(b.id);
  }

  for (let i = 0; i < pop; i++) {
    const ent = createFactionHuman(state, site.x, site.y, 'rival', groupId, surname);
    entityIds.push(ent.id);
    allAlive.push(ent);
    indexLivingEntity(state, ent);
  }

  const relRoll = getSimRng('groupEvents')();
  const relationship: RivalSettlement['relationship'] =
    relRoll < 0.3 ? 'friendly' : relRoll < 0.7 ? 'neutral' : relRoll < 0.95 ? 'competitive' : 'tense';

  state.rivalSettlements.push({
    id: groupId,
    name,
    campX: site.x,
    campY: site.y,
    population: pop,
    entityIds,
    buildingIds,
    relationship,
    foundedYear: state.year,
    daysUntilAction: 30 + Math.floor(getSimRng('groupEvents')() * 30),
    raidCooldownDays: 45 + Math.floor(getSimRng('groupEvents')() * 30),
    peaceTreatyDays: 0,
    profile: createRivalProfile(groupId.length + state.year + pop, relationship),
  });

  const relText = {
    friendly: 'They wave warmly from afar.',
    neutral: 'They keep to themselves for now.',
    competitive: 'They eye your hunting grounds.',
    tense: 'Their leader looks… unamused.',
  }[relationship];

  pushNews(state, '🏕️ New Settlement!', `${name} (${pop} settlers) founded a camp on the map. ${relText}`, relationship === 'tense' ? 'negative' : 'neutral');
  logEvent(state, 'migration', `${name} established a rival settlement on the frontier`, name);

  return {
    id: `rival_settlement_${state.tick}`,
    title: `🏕️ ${name} Settles Nearby`,
    description: `Another group has claimed land on the same frontier — ${pop} settlers and a small camp.`,
    emoji: '🏕️',
    effect: `Relationship: ${relationship}`,
    type: relationship === 'tense' ? 'negative' : 'neutral',
  };
}

export function tickVisitorGroups(state: WorldState, allAlive: Entity[]): void {
  const remaining: VisitorGroup[] = [];
  const aliveById = buildAliveEntityIndex(allAlive);
  const nextDeer = makeNextAliveDeer(buildAliveDeerList(allAlive));

  const newCalendarDay = isNewCalendarDayTick(state);
  const calendarDay = getAbsoluteCalendarDay(state.tick);

  for (const group of state.visitorGroups) {
    const arrivedDay = group.spawnedAtCalendarDay ?? calendarDay;
    // daysLeft = midnights after the arrival day; first decrement is end of the next full day.
    if (newCalendarDay && calendarDay > arrivedDay + 1) group.daysLeft--;

    if (newCalendarDay && group.daysLeft > 0) {
      switch (group.kind) {
        case 'traders': {
          const goldWant = 15 + Math.floor(getSimRng('groupEvents')() * 25);
          const gold = Math.min(group.gold ?? 0, goldWant);
          group.gold = (group.gold ?? 0) - gold;
          const food = 10 + Math.floor(getSimRng('groupEvents')() * 20);
          state.resources.gold = Math.min(state.storageMax.gold, state.resources.gold + gold);
          state.resources.food = Math.min(state.storageMax.food, state.resources.food + food);
          pushFloat(state, group.campX, group.campY - 20, `+${gold}g +${food}f`, '#eab308');
          group.giftsGiven++;
          break;
        }
        case 'pilgrims':
          state.villageReputation = Math.min(100, state.villageReputation + 2);
          pushFloat(state, group.campX, group.campY - 20, '+Rep', '#22c55e');
          group.giftsGiven++;
          break;
        case 'scholars':
          if (state.activeResearch) {
            state.researchProgress = Math.min(100, state.researchProgress + 3);
            pushFloat(state, group.campX, group.campY - 20, '+Research', '#8b5cf6');
          } else {
            const goldGift = Math.min(group.gold ?? 0, 10);
            group.gold = (group.gold ?? 0) - goldGift;
            state.resources.gold = Math.min(state.storageMax.gold, state.resources.gold + goldGift);
          }
          group.giftsGiven++;
          break;
        case 'nomads': {
          const wood = 10 + Math.floor(getSimRng('groupEvents')() * 15);
          state.resources.wood = Math.min(state.storageMax.wood, state.resources.wood + wood);
          pushFloat(state, group.campX, group.campY - 20, `+${wood}w`, '#d97706');
          group.giftsGiven++;
          break;
        }
        case 'performers':
          state.villageReputation = Math.min(100, state.villageReputation + 1);
          pushFloat(state, group.campX, group.campY - 20, '🎭', '#f472b6');
          group.giftsGiven++;
          break;
        case 'refugees':
          break;
        case 'hunters': {
          const deer = nextDeer();
          const poachChance = group.leaderTalked ? 0.1 : 0.25;
          if (deer && seededRandomForRun(`poach:${group.id}:${state.tick}`) < poachChance) {
            killWildGameForPoach(state, deer);
            pushFloat(state, deer.x, deer.y - 15, 'Hunted', '#f97316');
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
      pushNews(state, '👋 Visitors Departed', `${group.name} packed up and left the valley.`, 'neutral');
      logEvent(state, 'migration', `${group.name} departed`);
    } else {
      remaining.push(group);
    }
  }

  state.visitorGroups = remaining;
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

export { isRivalAtPeace } from './rivalPeace';

const PEACE_TREATY_PLAYER_DAYS = 60;
const PEACE_TREATY_EVENT_DAYS = 45;
const RIVAL_GIFT_FOOD_COST = 25;
const RIVAL_TRADE_PACT_GOLD_COST = 40;
const PEACE_TREATY_GOLD_COST = 30;
const PEACE_TREATY_FOOD_COST = 20;
const REFUGEE_WELCOME_FOOD = 40;
const REFUGEE_SCREEN_FOOD = 20;

/**
 * Whether `sendRivalGift` would actually improve relations: the rival exists,
 * is not already friendly, and the colony can spare the food.
 *
 * Single definition of the gift rule, shared with the auto-play bot
 * (`virtualPlayer.ts`), so the bot never claims an in-game hour with a gift the
 * owner would refuse.
 */
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
    // Unchanged feedback: grey when they are already friendly, amber when the
    // gift itself is unaffordable.
    const color = rivalPreview.relationship === 'friendly' ? '#94a3b8' : '#f97316';
    pushFloat(state, rival.campX, rival.campY - 20, eligibility.blockReason ?? 'Cannot send a gift', color);
    return state;
  }

  const state = cloneWorldStateForAction(originalState);
  const rival = state.rivalSettlements.find((r) => r.id === rivalId);
  if (!rival) return state;
  state.resources.food -= RIVAL_GIFT_FOOD_COST;
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

/**
 * Whether `establishRivalTradePact` would actually sign: the rival exists, is
 * neither too tense to talk nor already friendly, and the colony can pay the gold.
 *
 * Single definition of the trade-pact rule, shared with the auto-play bot
 * (`virtualPlayer.ts`), so the bot never claims an in-game hour with a pact the
 * owner would refuse.
 */
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
    // Unchanged feedback: grey when they are already friendly, amber otherwise.
    const color = rivalPreview.relationship === 'friendly' ? '#94a3b8' : '#f97316';
    pushFloat(state, rival.campX, rival.campY - 20, eligibility.blockReason ?? 'Cannot sign a pact', color);
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

/**
 * Whether `showStrengthToRival` would actually overawe them: the rival exists, the
 * colony fields stone or iron spears, and it counts at least six settlers.
 *
 * Single definition of the strength-display rule, shared with the auto-play bot
 * (`virtualPlayer.ts`).
 */
export function getShowStrengthEligibility(
  state: WorldState,
  rivalId: string,
): { ok: boolean; blockReason?: string } {
  const rival = state.rivalSettlements.find((r) => r.id === rivalId);
  if (!rival) return { ok: false, blockReason: 'No such rival' };
  const armed = hasIronSpears(state) || hasStoneSpears(state);
  if (!armed) return { ok: false, blockReason: 'Need spears' };
  if (state.humanPopulation < 6) return { ok: false, blockReason: 'Need 6+ settlers' };
  return { ok: true };
}

export function showStrengthToRival(originalState: WorldState, rivalId: string): WorldState {
  const state = cloneWorldStateForAction(originalState);
  const rival = state.rivalSettlements.find((r) => r.id === rivalId);
  if (!rival) return state;

  const eligibility = getShowStrengthEligibility(originalState, rivalId);
  if (!eligibility.ok) {
    pushFloat(state, rival.campX, rival.campY - 20, eligibility.blockReason ?? 'Cannot show strength', '#f97316');
    return state;
  }

  if (rival.relationship === 'tense') {
    rival.relationship = 'competitive';
    state.villageReputation = Math.max(0, state.villageReputation - 3);
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

/**
 * Whether `signPeaceTreaty` would actually buy a truce: the rival exists, is not
 * too tense to talk, and the colony can pay the gold and food.
 *
 * Single definition of the treaty rule, shared with the auto-play bot
 * (`virtualPlayer.ts`).
 */
export function getPeaceTreatyEligibility(
  state: WorldState,
  rivalId: string,
): { ok: boolean; blockReason?: string } {
  const rival = state.rivalSettlements.find((r) => r.id === rivalId);
  if (!rival) return { ok: false, blockReason: 'No such rival' };
  if (rival.relationship === 'tense') return { ok: false, blockReason: 'Relations too tense' };
  if (state.resources.gold < PEACE_TREATY_GOLD_COST || state.resources.food < PEACE_TREATY_FOOD_COST) {
    return {
      ok: false,
      blockReason: `Need ${PEACE_TREATY_GOLD_COST}💰 + ${PEACE_TREATY_FOOD_COST}🍖`,
    };
  }
  return { ok: true };
}

/** Player-initiated peace — halts raids for 60 days. */
export function signPeaceTreaty(originalState: WorldState, rivalId: string): WorldState {
  const state = cloneWorldStateForAction(originalState);
  const rival = state.rivalSettlements.find((r) => r.id === rivalId);
  if (!rival) return state;

  const eligibility = getPeaceTreatyEligibility(originalState, rivalId);
  if (!eligibility.ok) {
    pushFloat(state, rival.campX, rival.campY - 20, eligibility.blockReason ?? 'Cannot sign a treaty', '#f97316');
    return state;
  }

  state.resources.gold -= PEACE_TREATY_GOLD_COST;
  state.resources.food -= PEACE_TREATY_FOOD_COST;
  rival.peaceTreatyDays = PEACE_TREATY_PLAYER_DAYS;
  rival.raidCooldownDays = Math.max(rival.raidCooldownDays, PEACE_TREATY_PLAYER_DAYS);
  if (rival.relationship === 'competitive') rival.relationship = 'neutral';
  rival.daysUntilAction = Math.max(rival.daysUntilAction, 30);
  if (cancelPendingRaidsForRival(state, rivalId)) {
    logEvent(state, 'event', `Raid called off — truce with ${rival.name}`, rival.name);
  }
  if (cancelPendingOutgoingRaidsForRival(state, rivalId)) {
    logEvent(state, 'event', `War-band recalled — truce with ${rival.name}`, rival.name);
  }

  pushFloat(state, rival.campX, rival.campY - 20, '🕊️ Peace', '#22d3ee');
  pushNews(state, '🕊️ Peace signed', `${rival.name} and ${state.villageName} agreed to 60 days without raids.`, 'positive');
  logEvent(state, 'event', `Peace treaty with ${rival.name} — 60 days`, rival.name);
  return state;
}

function diplomacyChoicesFor(kind: DiplomacyEventKind, rivalName: string): DiplomacyChoice[] {
  switch (kind) {
    case 'tribute':
      return [
        { id: 'pay', label: 'Pay tribute (30🍖)', hint: 'Relations improve — they leave you in peace.' },
        { id: 'refuse', label: 'Refuse', hint: 'Relations worsen and reputation drops.' },
        { id: 'negotiate', label: 'Negotiate (15🍖)', hint: 'Split the difference — minor goodwill.' },
      ];
    case 'border_dispute':
      return [
        { id: 'concede', label: 'Offer hunting rights', hint: 'Reputation -5 but relations improve.' },
        { id: 'stand_firm', label: 'Stand firm', hint: 'Hold the line — tense relations may worsen.' },
        { id: 'militia', label: 'Parade militia', hint: 'Needs spears + 6 pop — backs them down.' },
      ];
    case 'alliance':
      return [
        { id: 'accept', label: 'Accept alliance (20💰)', hint: 'Friendly relations and trade gifts.' },
        { id: 'decline', label: 'Politely decline', hint: 'Stay neutral — small reputation hit.' },
        { id: 'counter', label: 'Counter-offer (25🍖 + 15💰)', hint: 'Strong friendship if you can afford it.' },
      ];
    case 'peace_treaty':
      return [
        { id: 'sign', label: 'Sign peace (15💰 + 10🍖)', hint: `45 days without raids with ${rivalName}.` },
        { id: 'decline', label: 'Decline truce', hint: 'Relations may worsen — raids still possible.' },
        { id: 'tribute', label: 'Demand tribute for peace', hint: 'Short 21-day truce — they pay you 35🍖.' },
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

function maybeQueueDiplomacyEvent(state: WorldState, rival: RivalSettlement): void {
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
    expiresAtTick: state.tick + 14 * TICKS_PER_DAY,
  };
  state.pendingDiplomacyEvents.push(event);
  pushNews(state, `${meta.emoji} Diplomacy needed`, `${rival.name}: ${meta.title}. Respond in the inspector or event banner.`, 'neutral');
  logEvent(state, 'event', `${rival.name} — ${meta.title}`, rival.name);
}

export function tickPendingDiplomacyEvents(state: WorldState): void {
  if (!state.pendingDiplomacyEvents?.length) return;
  const expireAfter = 14 * TICKS_PER_DAY;
  const before = state.pendingDiplomacyEvents.length;
  state.pendingDiplomacyEvents = state.pendingDiplomacyEvents.filter(
    (e) => state.tick < (e.expiresAtTick ?? e.createdAtTick + expireAfter),
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
      if (choiceId === 'pay' && state.resources.food < 30) {
        return { ok: false, blockReason: 'Need 30🍖' };
      }
      if (choiceId === 'negotiate' && state.resources.food < 15) {
        return { ok: false, blockReason: 'Need 15🍖' };
      }
      break;
    case 'border_dispute':
      if (choiceId === 'militia') {
        const armed = hasIronSpears(state) || hasStoneSpears(state);
        if (!armed) return { ok: false, blockReason: 'Need spears' };
        if (state.humanPopulation < 6) return { ok: false, blockReason: 'Need 6+ settlers' };
      }
      break;
    case 'alliance':
      if (choiceId === 'accept' && state.resources.gold < 20) {
        return { ok: false, blockReason: 'Need 20💰' };
      }
      if (choiceId === 'counter' && (state.resources.food < 25 || state.resources.gold < 15)) {
        return { ok: false, blockReason: 'Need 25🍖 + 15💰' };
      }
      break;
    case 'peace_treaty':
      if (choiceId === 'sign' && (state.resources.gold < 15 || state.resources.food < 10)) {
        return { ok: false, blockReason: 'Need 15💰 + 10🍖' };
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

  if (state.tick >= (event.expiresAtTick ?? event.createdAtTick + 14 * TICKS_PER_DAY)) {
    removeEvent();
    logEvent(state, 'event', `Diplomacy message from ${rival.name} expired`, rival.name);
    return state;
  }

  // The card owner's eligibility rule is the single definition of what an
  // affordable answer is — never restate the thresholds here (they used to be
  // duplicated inline and the auto-play bot gates on the same helper).
  const gate = getDiplomacyChoiceEligibility(state, event, choiceId);
  if (!gate.ok) {
    pushFloat(state, rival.campX, rival.campY - 20, gate.blockReason ?? 'Cannot answer', '#f97316');
    return state;
  }

  switch (event.kind) {
    case 'tribute':
      if (choiceId === 'pay') {
        state.resources.food -= 30;
        rival.relationship = shiftRelationship(rival.relationship, 1);
        pushFloat(state, rival.campX, rival.campY - 20, 'Tribute paid', '#22c55e');
        logEvent(state, 'trade', `Paid tribute to ${rival.name} — relations improved`, rival.name);
        resolved = true;
      } else if (choiceId === 'negotiate') {
        state.resources.food -= 15;
        if (rival.relationship === 'tense') rival.relationship = 'competitive';
        logEvent(state, 'trade', `Negotiated with ${rival.name} — partial tribute`, rival.name);
        resolved = true;
      } else if (choiceId === 'refuse') {
        rival.relationship = shiftRelationship(rival.relationship, -1);
        state.villageReputation = Math.max(0, state.villageReputation - 4);
        pushNews(state, '⚡ Tribute refused', `${rival.name} is displeased. Reputation -4.`, 'negative');
        logEvent(state, 'event', `Refused tribute to ${rival.name}`, rival.name);
        resolved = true;
      }
      break;
    case 'border_dispute':
      if (choiceId === 'concede') {
        state.villageReputation = Math.max(0, state.villageReputation - 5);
        rival.relationship = shiftRelationship(rival.relationship, 1);
        logEvent(state, 'event', `Ceded hunting rights to ${rival.name}`, rival.name);
        resolved = true;
      } else if (choiceId === 'stand_firm') {
        if (seededRandomForRun(`stand-firm:${rival.id}:${state.tick}`) < 0.45) rival.relationship = shiftRelationship(rival.relationship, -1);
        state.villageReputation = Math.max(0, state.villageReputation - 3);
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
        state.resources.gold -= 20;
        rival.relationship = 'friendly';
        rival.daysUntilAction = 20;
        pushFloat(state, rival.campX, rival.campY - 20, 'Alliance!', '#22d3ee');
        logEvent(state, 'trade', `Alliance with ${rival.name}`, rival.name);
        resolved = true;
      } else if (choiceId === 'counter') {
        state.resources.food -= 25;
        state.resources.gold -= 15;
        rival.relationship = 'friendly';
        rival.daysUntilAction = 25;
        state.villageReputation = Math.min(100, state.villageReputation + 3);
        logEvent(state, 'trade', `Grand counter-pact with ${rival.name}`, rival.name);
        resolved = true;
      } else if (choiceId === 'decline') {
        state.villageReputation = Math.max(0, state.villageReputation - 1);
        logEvent(state, 'event', `Declined alliance with ${rival.name}`, rival.name);
        resolved = true;
      }
      break;
    case 'peace_treaty':
      if (choiceId === 'sign') {
        state.resources.gold -= 15;
        state.resources.food -= 10;
        rival.peaceTreatyDays = PEACE_TREATY_EVENT_DAYS;
        rival.raidCooldownDays = Math.max(rival.raidCooldownDays, PEACE_TREATY_EVENT_DAYS);
        if (rival.relationship === 'competitive') rival.relationship = 'neutral';
        if (cancelPendingRaidsForRival(state, rival.id)) {
          logEvent(state, 'event', `Raid called off — truce with ${rival.name}`, rival.name);
        }
        if (cancelPendingOutgoingRaidsForRival(state, rival.id)) {
          logEvent(state, 'event', `War-band recalled — truce with ${rival.name}`, rival.name);
        }
        pushFloat(state, rival.campX, rival.campY - 20, '🕊️ Truce', '#22d3ee');
        logEvent(state, 'event', `Peace treaty with ${rival.name} — 45 days`, rival.name);
        resolved = true;
      } else if (choiceId === 'tribute') {
        rival.peaceTreatyDays = 21;
        rival.raidCooldownDays = Math.max(rival.raidCooldownDays, 21);
        if (cancelPendingRaidsForRival(state, rival.id)) {
          logEvent(state, 'event', `Raid called off — truce with ${rival.name}`, rival.name);
        }
        if (cancelPendingOutgoingRaidsForRival(state, rival.id)) {
          logEvent(state, 'event', `War-band recalled — truce with ${rival.name}`, rival.name);
        }
        const tributeFood = addCappedResource(state, 'food', 35);
        if (tributeFood < 35) {
          pushFloat(state, rival.campX, rival.campY - 20, `+${tributeFood}🍖 (storage full)`, '#f97316');
        } else {
          pushFloat(state, rival.campX, rival.campY - 20, '+35🍖 tribute', '#eab308');
        }
        logEvent(state, 'trade', `Short truce with ${rival.name} — they paid tribute`, rival.name);
        resolved = true;
      } else if (choiceId === 'decline') {
        if (seededRandomForRun(`decline-peace:${rival.id}:${state.tick}`) < 0.35) rival.relationship = shiftRelationship(rival.relationship, -1);
        state.villageReputation = Math.max(0, state.villageReputation - 2);
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
    pushNews(state, '🧳 Refugee spokesman', `${group.name} asks you to decide their fate below.`, 'neutral');
    logEvent(state, 'event', `Spoke with ${group.name} spokesman — negotiate to welcome or turn away`, group.name);
    return state;
  }

  group.leaderTalked = true;

  switch (group.kind) {
    case 'traders':
      state.resources.gold = Math.min(state.storageMax.gold, state.resources.gold + 15);
      state.villageReputation = Math.min(100, state.villageReputation + 3);
      pushFloat(state, group.campX, group.campY - 20, '+15💰 +Rep', '#eab308');
      logEvent(state, 'trade', `Caravan master of ${group.name} shared market news`, group.name);
      break;
    case 'pilgrims':
      state.villageReputation = Math.min(100, state.villageReputation + 8);
      pushFloat(state, group.campX, group.campY - 20, '+8 Rep', '#22c55e');
      logEvent(state, 'event', `Elder pilgrim blessed ${state.villageName}`, group.name);
      break;
    case 'scholars':
      if (state.activeResearch) {
        state.researchProgress = Math.min(100, state.researchProgress + 25);
        pushFloat(state, group.campX, group.campY - 20, '+Research', '#8b5cf6');
        logEvent(state, 'research', `Head scholar advanced your active research`, group.name);
      } else {
        state.resources.gold = Math.min(state.storageMax.gold, state.resources.gold + 15);
        pushFloat(state, group.campX, group.campY - 20, '+15💰', '#8b5cf6');
        logEvent(state, 'research', `Scholars of ${group.name} left notes and coin`, group.name);
      }
      break;
    case 'hunters':
      state.villageReputation = Math.min(100, state.villageReputation + 5);
      pushFloat(state, group.campX, group.campY - 20, '+5 Rep', '#f97316');
      logEvent(state, 'event', `Hunt captain of ${group.name} marked shared hunting grounds`, group.name);
      break;
    case 'nomads':
      state.resources.wood = Math.min(state.storageMax.wood, state.resources.wood + 20);
      state.villageReputation = Math.min(100, state.villageReputation + 2);
      pushFloat(state, group.campX, group.campY - 20, '+20🪵', '#d97706');
      logEvent(state, 'event', `Clan head of ${group.name} traded stories and timber`, group.name);
      break;
    case 'performers':
      state.villageReputation = Math.min(100, state.villageReputation + 6);
      if (!state.festival) {
        state.festival = { active: true, name: 'Visitor Revelry', daysLeft: 3 };
      } else {
        state.festival.daysLeft = Math.min(14, state.festival.daysLeft + 2);
      }
      pushFloat(state, group.campX, group.campY - 20, '🎭 Festival!', '#f472b6');
      logEvent(state, 'event', `Troupe leader of ${group.name} led a night of revelry`, group.name);
      break;
    default:
      break;
  }

  return state;
}

/**
 * Visitor trade actions — single source of truth: the action type is derived from
 * the cost table keys so validation allow-lists can never drift from the actions
 * the UI offers (regression: sell_wood was once missing from the worker validator).
 */
export const VISITOR_TRADE_COSTS = {
  buy_food: { pay: { gold: 25 }, receive: { food: 40 } },
  buy_wood: { pay: { gold: 20 }, receive: { wood: 30 } },
  sell_food: { pay: { food: 30 }, receive: { gold: 25 } },
  sell_wood: { pay: { wood: 40 }, receive: { gold: 20 } },
} as const;

export type VisitorTradeAction = keyof typeof VISITOR_TRADE_COSTS;

/** Reputation tier → trade price modifier (≥80 friendly, ≤30 harsh terms). */
export function getVisitorTradePriceMult(rep: number): number {
  return rep >= 80 ? 0.8 : rep <= 30 ? 1.25 : 1;
}

/** High reputation earns better sell prices. */
export function getVisitorTradeRewardMult(rep: number): number {
  return rep >= 80 ? 1.15 : 1;
}

/** Starting gold a visitor group carries — funds gifts and sell-trades. */
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
  pushFloat(state, group.campX, group.campY - 20, hint, '#f97316');
  if (notify) pushNews(state, 'Trade failed', notify, 'negative');
  return state;
}

/** Reputation-adjusted pay/receive terms for one visitor trade action. */
function getVisitorTradeTerms(
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

  // Effective costs/prices with the reputation tier applied (gold only).
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

/**
 * Whether `tradeWithVisitors` would actually complete this deal: the group is
 * present and still trading, its kind offers that action, the colony can pay the
 * reputation-adjusted price, the group can cover any gold it owes, and the
 * received goods fit in storage.
 *
 * Single definition of the visitor-trade rule — `tradeWithVisitors` runs it
 * before touching world state, and the auto-play bot (`virtualPlayer.ts`)
 * proposes a trade only when it says `ok`, so the bot never claims an in-game
 * hour with a deal the owner would refuse. `silent` marks the structural
 * refusals the UI never turns into player feedback.
 */
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
    const goldNeed = effectivePay.gold ?? 0;
    const hint = action === 'buy_food' ? `Need ${goldNeed}💰`
      : action === 'buy_wood' ? `Need ${goldNeed}💰`
        : action === 'sell_food' ? `Need ${effectivePay.food ?? 0}🍖`
          : `Need ${effectivePay.wood ?? 0}🪵`;
    return { ok: false, blockReason: hint };
  }

  // Selling to the group requires them to actually have the gold (no minting).
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
      const hint = key === 'food' ? 'Food storage full!'
        : key === 'wood' ? 'Wood storage full!'
          : 'Cannot store more gold';
      const notify = key === 'food'
        ? 'Food storage is full — build a Barn or Silo before buying more.'
        : key === 'wood'
          ? 'Wood storage is full — build a Barn or Store before buying more.'
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
  // A deal the group cannot even consider leaves the world untouched, exactly as
  // before; an attempted-but-refused deal clones the world to show feedback.
  if (!eligibility.ok && eligibility.silent) return originalState;

  const state = cloneWorldStateForAction(originalState);
  const group = state.visitorGroups.find((g) => g.id === groupId);
  if (!group) return state;

  if (!eligibility.ok) {
    return rejectVisitorTrade(state, group, eligibility.blockReason ?? 'Cannot trade', eligibility.notify);
  }

  const { effectivePay, effectiveReceive } = getVisitorTradeTerms(state, action);
  consumeResources(state, effectivePay);
  const paidGold = effectivePay.gold ?? 0;
  if (paidGold > 0) group.gold = (group.gold ?? 0) + paidGold;
  let receivedLabel = '';
  for (const [key, amount] of Object.entries(effectiveReceive) as [keyof WorldState['resources'], number][]) {
    if ((amount ?? 0) <= 0) continue;
    const added = addCappedResource(state, key, amount);
    if (key === 'food') receivedLabel = `+${added}🍖`;
    else if (key === 'wood') receivedLabel = `+${added}🪵`;
    else if (key === 'gold') receivedLabel = `+${added}💰`;
  }
  const gainedGold = effectiveReceive.gold ?? 0;
  if (gainedGold > 0) group.gold = Math.max(0, (group.gold ?? 0) - gainedGold);

  pushFloat(state, group.campX, group.campY - 20, receivedLabel, action === 'buy_food' || action === 'buy_wood' ? '#22c55e' : '#eab308');
  group.tradesCompleted++;
  group.giftsGiven++;
  const tradeDetail = action === 'buy_food' ? 'bought food'
    : action === 'buy_wood' ? 'bought wood'
      : action === 'sell_food' ? 'sold food'
        : 'sold wood';
  logEvent(state, 'trade', `Traded with ${group.name} — ${tradeDetail}`, group.name);
  return state;
}

export type RefugeeChoice = 'welcome' | 'screen' | 'turn_away';

/**
 * Whether `negotiateRefugees` would actually settle this choice: the group is a
 * live refugee camp, and welcoming or screening has the food and population room
 * it costs. Turning the families away is always available.
 *
 * Single definition of the refugee-offer rule — `negotiateRefugees` applies it
 * before spending anything, and the auto-play bot (`virtualPlayer.ts`) proposes a
 * choice only when it says `ok`. `silent` marks the structural refusals that never
 * produced player feedback.
 */
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
  // A choice the camp cannot even consider leaves the world untouched, exactly as
  // before; an attempted-but-refused offer clones the world to show feedback.
  if (!eligibility.ok && eligibility.silent) return originalState;

  const state = cloneWorldStateForAction(originalState);
  const group = state.visitorGroups.find((g) => g.id === groupId);
  if (!group) return state;

  const allAlive = state.entities;

  if (choice === 'turn_away') {
    group.refugeeResolved = true;
    group.daysLeft = 0;
    state.villageReputation = Math.max(0, state.villageReputation - 2);
    logEvent(state, 'migration', `${group.name} turned away from the village`, group.name);
    return state;
  }

  if (!eligibility.ok) {
    pushFloat(state, group.campX, group.campY - 20, eligibility.blockReason ?? 'Cannot settle them', '#f97316');
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
      pushFloat(state, group.campX, group.campY - 20, 'No room for refugees', '#f97316');
      return state;
    }
    state.resources.food -= REFUGEE_WELCOME_FOOD;
    group.refugeeResolved = true;
    const villagers = allAlive.filter(isPlayerHuman);
    assignMissingResidences(villagers, state.buildings, allAlive);
    syncResidenceOccupants(villagers, state.buildings);
    pushFloat(state, group.campX, group.campY - 20, `+${joined} settlers`, '#22c55e');
    logEvent(state, 'migration', `Welcomed ${joined} refugee(s) from ${group.name}`, group.name);
    return state;
  }

  if (choice === 'screen') {
    const currentPopulation = playerHumanCount(allAlive);
    const joined = seededRandomForRun(`refugee-screen:${group.id}:${state.tick}`) < 0.55 ? admitRefugees(state, group, allAlive, currentPopulation, 1) : 0;
    group.refugeeResolved = true;
    if (joined > 0) {
      state.resources.food -= REFUGEE_SCREEN_FOOD;
      const villagers = allAlive.filter(isPlayerHuman);
      assignMissingResidences(villagers, state.buildings, allAlive);
      syncResidenceOccupants(villagers, state.buildings);
      pushFloat(state, group.campX, group.campY - 20, '+1 refugee', '#22c55e');
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
  // Convert camp members into settlers — do not spawn brand-new humans
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

export type CampHit =
  | { kind: 'rival'; id: string; x: number; y: number; buildingId: number | null }
  | { kind: 'visitor'; id: string; x: number; y: number };

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
  for (const rival of state.rivalSettlements) {
    if (Math.hypot(rival.campX - worldX, rival.campY - worldY) <= hitRadius) {
      const buildingId = rival.buildingIds[0] ?? null;
      return { kind: 'rival', id: rival.id, x: rival.campX, y: rival.campY, buildingId };
    }
  }
  return null;
}

/** World-events schedule entry — wires callbacks into the rivalEvents owner. */
export function tickWorldRivalSettlements(state: WorldState, allAlive: Entity[]): void {
  tickRivalEvents(state, allAlive, {
    pushNews,
    pushFloat,
    logEvent,
    tickPendingDiplomacyEvents,
    queueDiplomacyEvent: maybeQueueDiplomacyEvent,
    createFactionHuman,
    createRivalBuilding,
    killWildGameForPoach,
  });
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
  | 'rival_settlement'
  | 'surveyors_crown'
  | 'deer_migration'
  | 'generous_neighbors';

const WORLD_EVENTS: { id: WorldEventId; weight: number; minHumans?: number; maxRivals?: number; requiresNoVisitors?: boolean }[] = [
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
  { id: 'rival_settlement', weight: 6, minHumans: 6, maxRivals: 2 },
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
  nextEntityId: () => number
): { event: GameEvent | null; bountifulHarvest: boolean } {
  const humans = playerHumanCount(allAlive);
  const pool = WORLD_EVENTS.filter((e) => {
    if (e.minHumans && humans < e.minHumans) return false;
    if (e.maxRivals !== undefined && state.rivalSettlements.length >= e.maxRivals && e.id === 'rival_settlement') return false;
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
        const wolf = spawnWolf(width, height, nextEntityId());
        allAlive.push(wolf);
        indexLivingEntity(state, wolf);
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
      pushFloat(state, width / 2, height / 2, '+50 Gold', '#eab308');
      return {
        event: { id: `traveling_merchant_${state.tick}`, title: 'Traveling Merchant', description: 'A wealthy merchant caravan passed through!', emoji: '🛒', effect: '+50 Gold', type: 'positive' },
        bountifulHarvest,
      };
    case 'nature_boom':
      for (let i = 0; i < 15; i++) {
        const tree = spawnTree(width, height, nextEntityId());
        allAlive.push(tree);
        indexLivingEntity(state, tree);
      }
      for (let i = 0; i < 30; i++) {
        const grass = spawnGrass(width, height, nextEntityId());
        allAlive.push(grass);
        indexLivingEntity(state, grass);
      }
      return {
        event: { id: `nature_boom_${state.tick}`, title: 'Ecological Super-Bloom', description: 'Natural energy revitalizes the valley flora!', emoji: '🌿', effect: '+15 Trees, +30 Grass', type: 'positive' },
        bountifulHarvest,
      };
    case 'visiting_traders':
      return { event: spawnVisitorGroup(state, allAlive, buildings, 'traders'), bountifulHarvest };
    case 'pilgrim_caravan':
      return { event: spawnVisitorGroup(state, allAlive, buildings, 'pilgrims'), bountifulHarvest };
    case 'scholar_expedition':
      return { event: spawnVisitorGroup(state, allAlive, buildings, 'scholars'), bountifulHarvest };
    case 'nomad_hunters':
      return { event: spawnVisitorGroup(state, allAlive, buildings, 'hunters'), bountifulHarvest };
    case 'refugee_family':
      return { event: spawnVisitorGroup(state, allAlive, buildings, 'refugees'), bountifulHarvest };
    case 'wandering_performers':
      return { event: spawnVisitorGroup(state, allAlive, buildings, 'performers'), bountifulHarvest };
    case 'rival_settlement':
      return { event: spawnRivalSettlement(state, allAlive, buildings), bountifulHarvest };
    case 'surveyors_crown':
      state.villageReputation = Math.min(100, state.villageReputation + 5);
      return {
        event: { id: `surveyors_crown_${state.tick}`, title: 'Royal Surveyors', description: 'Crown surveyors mapped your village and filed a favorable report.', emoji: '📜', effect: '+5 Reputation', type: 'positive' },
        bountifulHarvest,
      };
    case 'deer_migration':
      for (let i = 0; i < 4; i++) {
        const deer = spawnDeer(width, height, nextEntityId());
        allAlive.push(deer);
        indexLivingEntity(state, deer);
      }
      return {
        event: { id: `deer_migration_${state.tick}`, title: 'Deer Migration', description: 'A herd of deer wandered into the valley!', emoji: '🦌', effect: '+4 Deer', type: 'positive' },
        bountifulHarvest,
      };
    case 'generous_neighbors':
      if (state.rivalSettlements.length > 0) {
        const rival = state.rivalSettlements[Math.floor(getSimRng('groupEvents')() * state.rivalSettlements.length)];
        const food = 25 + Math.floor(getSimRng('groupEvents')() * 25);
        state.resources.food = Math.min(state.storageMax.food, state.resources.food + food);
        pushFloat(state, rival.campX, rival.campY - 20, `+${food} food`, '#22c55e');
        return {
          event: { id: `generous_neighbors_${state.tick}`, title: 'Neighborly Gift', description: `${rival.name} shared food across the wilds.`, emoji: '🤝', effect: `+${food} Food`, type: 'positive' },
          bountifulHarvest,
        };
      }
      state.resources.food = Math.min(state.storageMax.food, state.resources.food + 40);
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

export function tryMidYearVisitorEvent(state: WorldState, allAlive: Entity[], buildings: Building[]): GameEvent | null {
  if (state.visitorGroups.length > 0) return null;
  if (playerHumanCount(allAlive) < 4) return null;
  if (seededRandomForRun(`mid-year-visitors:${state.tick}`) > 0.22) return null;
  const kinds: VisitorKind[] = ['traders', 'pilgrims', 'performers', 'nomads', 'scholars'];
  const kind = kinds[Math.floor(seededRandomForRun(`mid-year-kind:${state.tick}`) * kinds.length)];
  return spawnVisitorGroup(state, allAlive, buildings, kind);
}

/** Once per game: friendly visitors on days 7-13 (tick < 14 * TICKS_PER_DAY) if the player has a completed House or Mansion; state.firstWeekVisitorSpawned makes it one-shot. */
export function tryFirstWeekVisitor(
  state: WorldState,
  allAlive: Entity[],
  buildings: Building[],
): GameEvent | null {
  if (state.firstWeekVisitorSpawned) return null;
  // No visitors during the founding burst — let the player settle first.
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
  const event = spawnVisitorGroup(state, allAlive, buildings, kind);
  pushNews(
    state,
    '🛖 Neighbors on the trail',
    `Word of ${state.villageName} reached the valley — ${kind} have come to greet your pioneers.`,
    'positive',
  );
  return event;
}
