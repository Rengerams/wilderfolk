import type {
  WorldState, Entity, Building, GameEvent, VisitorGroup, RivalSettlement, VisitorKind,
  DiplomacyEvent, DiplomacyEventKind, DiplomacyChoice,
} from './gameTypes';
import { EntityType, BuildingType, BUILDING_CONFIGS, JobType } from './gameTypes';
import {
  assignMissingResidences,
  getAbsoluteCalendarDay,
  getColonyDay,
  HUMAN_ADULT_MIN_AGE,
  HUMAN_MAX_LIFESPAN_YEARS,
  syncResidenceOccupants,
  TICKS_PER_DAY,
} from './dayCycle';
import { createEntity } from './worldGen';
import { indexLivingEntity, unindexEntityFromState } from './entityIndex';
import { SPECIES_CONFIG } from './gameEngine';
import { addCappedResource } from './resourceUtils';
import { getRandomSurname } from './nameLoader';
import { hasIronSpears, hasStoneSpears } from './combat';
import { logEvent } from './eventLog';
import {
  cancelPendingOutgoingRaidsForRival,
  cancelPendingRaidsForRival,
  getPlayerCampCenter,
  maybeQueueRaid,
} from './frontierCombat';
import { clearFactionWanderState } from './factionWander';
import { getRefugeeWelcomeBonus } from './townHall';

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

/**
 * Colony settler human — excludes transient faction humans (visitors, rivals, trade-route merchants).
 * `trade_caravan` carriers are real humans on the map but must not count toward population, housing,
 * or village job systems; they are handled in `lifeSimulation` / `tradeCaravans.ts` instead.
 */
export function isPlayerHuman(e: Entity): boolean {
  return e.type === EntityType.Human
    && e.faction !== 'visitor'
    && e.faction !== 'rival'
    && e.faction !== 'trade_caravan';
}

/** Deep-clone world state for player actions that mutate simulation data. */
function cloneWorldStateForAction(originalState: WorldState): WorldState {
  return structuredClone(originalState) as WorldState;
}

export function playerHumanCount(entities: Entity[]): number {
  return entities.filter((e) => e.alive && isPlayerHuman(e)).length;
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
    const angle = Math.random() * Math.PI * 2;
    const dist = minDist + Math.random() * (maxDist - minDist);
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
  const age = HUMAN_ADULT_MIN_AGE + Math.floor(Math.random() * 20);
  const ent = createEntity(
    EntityType.Human,
    x + (Math.random() - 0.5) * 24,
    y + (Math.random() - 0.5) * 24,
    state.nextEntityId++,
    undefined,
    false,
    { surname, ageYears: age, colonyDay: getColonyDay(state) },
  );
  ent.faction = faction;
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
  const prefix = RIVAL_PREFIXES[Math.floor(Math.random() * RIVAL_PREFIXES.length)];
  const suffix = RIVAL_SUFFIXES[Math.floor(Math.random() * RIVAL_SUFFIXES.length)];
  return `${prefix}${suffix}`;
}

export function spawnVisitorGroup(
  state: WorldState,
  allAlive: Entity[],
  buildings: Building[],
  kind: VisitorKind
): GameEvent {
  const template = VISITOR_TEMPLATES[kind];
  const name = template.names[Math.floor(Math.random() * template.names.length)];
  const center = getPlayerCampCenter(state, buildings);
  const avoid = [
    ...state.rivalSettlements.map((r) => ({ x: r.campX, y: r.campY })),
    ...state.visitorGroups.map((v) => ({ x: v.campX, y: v.campY })),
  ];
  const site = pickSite(state, center, 70, 160, avoid);
  const memberCount = template.members[0] + Math.floor(Math.random() * (template.members[1] - template.members[0] + 1));
  const daysLeft = template.days[0] + Math.floor(Math.random() * (template.days[1] - template.days[0] + 1));
  const groupId = `visitor_${state.tick}_${Math.floor(Math.random() * 10000)}`;
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
  logEvent(state, 'migration', `${name} arrived near the village`, name);

  return {
    id: `visitor_${kind}`,
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
  const groupId = `rival_${state.tick}_${Math.floor(Math.random() * 10000)}`;
  const surname = name;
  const pop = 4 + Math.floor(Math.random() * 4);
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

  const relRoll = Math.random();
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
    daysUntilAction: 30 + Math.floor(Math.random() * 30),
    raidCooldownDays: 45 + Math.floor(Math.random() * 30),
    peaceTreatyDays: 0,
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
    id: 'rival_settlement',
    title: `🏕️ ${name} Settles Nearby`,
    description: `Another group has claimed land on the same frontier — ${pop} settlers and a small camp.`,
    emoji: '🏕️',
    effect: `Relationship: ${relationship}`,
    type: relationship === 'tense' ? 'negative' : 'neutral',
  };
}

export function tickVisitorGroups(state: WorldState, allAlive: Entity[]): void {
  const remaining: VisitorGroup[] = [];

  const newCalendarDay = state.tick > 0 && state.tick % TICKS_PER_DAY === 0;
  const calendarDay = getAbsoluteCalendarDay(state.tick);

  for (const group of state.visitorGroups) {
    const arrivedDay = group.spawnedAtCalendarDay ?? calendarDay;
    // daysLeft = midnights after the arrival day; first decrement is end of the next full day.
    if (newCalendarDay && calendarDay > arrivedDay + 1) group.daysLeft--;

    if (newCalendarDay && group.daysLeft > 0) {
      switch (group.kind) {
        case 'traders': {
          const gold = 15 + Math.floor(Math.random() * 25);
          const food = 10 + Math.floor(Math.random() * 20);
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
            state.resources.gold = Math.min(state.storageMax.gold, state.resources.gold + 10);
          }
          group.giftsGiven++;
          break;
        case 'nomads': {
          const wood = 10 + Math.floor(Math.random() * 15);
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
          const deer = allAlive.find((e) => e.alive && e.type === EntityType.Deer);
          const poachChance = group.leaderTalked ? 0.1 : 0.25;
          if (deer && Math.random() < poachChance) {
            deer.alive = false;
            unindexEntityFromState(state, deer.id);
            pushFloat(state, deer.x, deer.y - 15, 'Hunted', '#f97316');
          }
          break;
        }
      }
    }

    if (group.daysLeft <= 0) {
      for (const id of group.entityIds) {
        clearFactionWanderState(id);
        const ent = allAlive.find((e) => e.id === id);
        if (ent?.faction === 'visitor') {
          ent.alive = false;
          unindexEntityFromState(state, ent.id);
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

export function isRivalAtPeace(rival: RivalSettlement): boolean {
  return rival.peaceTreatyDays > 0;
}

const PEACE_TREATY_PLAYER_DAYS = 60;
const PEACE_TREATY_EVENT_DAYS = 45;

export function sendRivalGift(originalState: WorldState, rivalId: string): WorldState {
  const rivalPreview = originalState.rivalSettlements.find((r) => r.id === rivalId);
  if (!rivalPreview) return originalState;

  const foodCost = 25;
  if (rivalPreview.relationship === 'friendly') {
    const state = cloneWorldStateForAction(originalState);
    const rival = state.rivalSettlements.find((r) => r.id === rivalId)!;
    pushFloat(state, rival.campX, rival.campY - 20, 'Already friendly', '#94a3b8');
    return state;
  }
  if (originalState.resources.food < foodCost) {
    const state = cloneWorldStateForAction(originalState);
    const rival = state.rivalSettlements.find((r) => r.id === rivalId)!;
    pushFloat(state, rival.campX, rival.campY - 20, `Need ${foodCost}🍖`, '#f97316');
    return state;
  }

  const state = cloneWorldStateForAction(originalState);
  const rival = state.rivalSettlements.find((r) => r.id === rivalId)!;
  state.resources.food -= foodCost;
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

export function establishRivalTradePact(originalState: WorldState, rivalId: string): WorldState {
  const rivalPreview = originalState.rivalSettlements.find((r) => r.id === rivalId);
  if (!rivalPreview || rivalPreview.relationship === 'tense') {
    if (!rivalPreview) return originalState;
    const state = cloneWorldStateForAction(originalState);
    const rival = state.rivalSettlements.find((r) => r.id === rivalId)!;
    pushFloat(state, rival.campX, rival.campY - 20, 'Relations too tense', '#f97316');
    return state;
  }

  const goldCost = 40;
  if (rivalPreview.relationship === 'friendly') {
    const state = cloneWorldStateForAction(originalState);
    const rival = state.rivalSettlements.find((r) => r.id === rivalId)!;
    pushFloat(state, rival.campX, rival.campY - 20, 'Already friendly', '#94a3b8');
    return state;
  }
  if (originalState.resources.gold < goldCost) {
    const state = cloneWorldStateForAction(originalState);
    const rival = state.rivalSettlements.find((r) => r.id === rivalId)!;
    pushFloat(state, rival.campX, rival.campY - 20, `Need ${goldCost}💰`, '#f97316');
    return state;
  }

  const state = cloneWorldStateForAction(originalState);
  const rival = state.rivalSettlements.find((r) => r.id === rivalId)!;

  state.resources.gold -= goldCost;
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

export function showStrengthToRival(originalState: WorldState, rivalId: string): WorldState {
  const state = cloneWorldStateForAction(originalState);
  const rival = state.rivalSettlements.find((r) => r.id === rivalId);
  if (!rival) return state;

  const armed = hasIronSpears(state) || hasStoneSpears(state);
  if (!armed || state.humanPopulation < 6) {
    pushFloat(
      state,
      rival.campX,
      rival.campY - 20,
      !armed ? 'Need spears' : 'Need 6+ settlers',
      '#f97316',
    );
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

/** Player-initiated peace — halts raids for 60 days. */
export function signPeaceTreaty(originalState: WorldState, rivalId: string): WorldState {
  const state = cloneWorldStateForAction(originalState);
  const rival = state.rivalSettlements.find((r) => r.id === rivalId);
  if (!rival || rival.relationship === 'tense') {
    if (rival) pushFloat(state, rival.campX, rival.campY - 20, 'Relations too tense', '#f97316');
    return state;
  }

  const goldCost = 30;
  const foodCost = 20;
  if (state.resources.gold < goldCost || state.resources.food < foodCost) {
    pushFloat(state, rival.campX, rival.campY - 20, `Need ${goldCost}💰 + ${foodCost}🍖`, '#f97316');
    return state;
  }

  state.resources.gold -= goldCost;
  state.resources.food -= foodCost;
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
  const roll = Math.random();
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
    (e) => state.tick - e.createdAtTick < expireAfter,
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

  switch (event.kind) {
    case 'tribute':
      if (choiceId === 'pay') {
        if (state.resources.food >= 30) {
          state.resources.food -= 30;
          rival.relationship = shiftRelationship(rival.relationship, 1);
          pushFloat(state, rival.campX, rival.campY - 20, 'Tribute paid', '#22c55e');
          logEvent(state, 'trade', `Paid tribute to ${rival.name} — relations improved`, rival.name);
          resolved = true;
        } else {
          pushFloat(state, rival.campX, rival.campY - 20, 'Need 30🍖', '#f97316');
        }
      } else if (choiceId === 'negotiate') {
        if (state.resources.food >= 15) {
          state.resources.food -= 15;
          if (rival.relationship === 'tense') rival.relationship = 'competitive';
          logEvent(state, 'trade', `Negotiated with ${rival.name} — partial tribute`, rival.name);
          resolved = true;
        } else {
          pushFloat(state, rival.campX, rival.campY - 20, 'Need 15🍖', '#f97316');
        }
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
        if (Math.random() < 0.45) rival.relationship = shiftRelationship(rival.relationship, -1);
        state.villageReputation = Math.max(0, state.villageReputation - 3);
        logEvent(state, 'event', `Stood firm against ${rival.name}`, rival.name);
        resolved = true;
      } else if (choiceId === 'militia') {
        const armed = hasIronSpears(state) || hasStoneSpears(state);
        if (armed && state.humanPopulation >= 6) {
          if (rival.relationship === 'tense') rival.relationship = 'competitive';
          else rival.relationship = shiftRelationship(rival.relationship, 1);
          logEvent(state, 'event', `Militia parade settled the dispute with ${rival.name}`, rival.name);
          resolved = true;
        } else {
          pushFloat(
            state,
            rival.campX,
            rival.campY - 20,
            !armed ? 'Need spears' : 'Need 6+ settlers',
            '#f97316',
          );
        }
      }
      break;
    case 'alliance':
      if (choiceId === 'accept') {
        if (state.resources.gold >= 20) {
          state.resources.gold -= 20;
          rival.relationship = 'friendly';
          rival.daysUntilAction = 20;
          pushFloat(state, rival.campX, rival.campY - 20, 'Alliance!', '#22d3ee');
          logEvent(state, 'trade', `Alliance with ${rival.name}`, rival.name);
          resolved = true;
        } else {
          pushFloat(state, rival.campX, rival.campY - 20, 'Need 20💰', '#f97316');
        }
      } else if (choiceId === 'counter') {
        if (state.resources.food >= 25 && state.resources.gold >= 15) {
          state.resources.food -= 25;
          state.resources.gold -= 15;
          rival.relationship = 'friendly';
          rival.daysUntilAction = 25;
          state.villageReputation = Math.min(100, state.villageReputation + 3);
          logEvent(state, 'trade', `Grand counter-pact with ${rival.name}`, rival.name);
          resolved = true;
        } else {
          pushFloat(state, rival.campX, rival.campY - 20, 'Need 25🍖 + 15💰', '#f97316');
        }
      } else if (choiceId === 'decline') {
        state.villageReputation = Math.max(0, state.villageReputation - 1);
        logEvent(state, 'event', `Declined alliance with ${rival.name}`, rival.name);
        resolved = true;
      }
      break;
    case 'peace_treaty':
      if (choiceId === 'sign') {
        if (state.resources.gold >= 15 && state.resources.food >= 10) {
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
        } else {
          pushFloat(state, rival.campX, rival.campY - 20, 'Need 15💰 + 10🍖', '#f97316');
        }
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
        if (Math.random() < 0.35) rival.relationship = shiftRelationship(rival.relationship, -1);
        state.villageReputation = Math.max(0, state.villageReputation - 2);
        logEvent(state, 'event', `Declined peace offer from ${rival.name}`, rival.name);
        resolved = true;
      }
      break;
  }

  if (resolved) {
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

export type VisitorTradeAction = 'buy_food' | 'buy_wood' | 'sell_food';

const VISITOR_TRADE_COSTS = {
  buy_food: { pay: { gold: 25 }, receive: { food: 40 } },
  buy_wood: { pay: { gold: 20 }, receive: { wood: 30 } },
  sell_food: { pay: { food: 30 }, receive: { gold: 25 } },
} as const;

function storageRoom(state: WorldState, type: keyof WorldState['resources']): number {
  return Math.max(0, (state.storageMax[type] as number) - (state.resources[type] as number));
}

function canFitPurchase(state: WorldState, type: keyof WorldState['resources'], amount: number): boolean {
  return storageRoom(state, type) >= amount;
}

function canPayTradeCost(state: WorldState, pay: Partial<Record<keyof WorldState['resources'], number>>): boolean {
  for (const [key, cost] of Object.entries(pay) as [keyof WorldState['resources'], number][]) {
    if ((cost ?? 0) > 0 && (state.resources[key] as number) < cost) return false;
  }
  return true;
}

function applyTradeCost(state: WorldState, pay: Partial<Record<keyof WorldState['resources'], number>>): void {
  for (const [key, cost] of Object.entries(pay) as [keyof WorldState['resources'], number][]) {
    if ((cost ?? 0) > 0) {
      (state.resources[key] as number) = Math.max(0, (state.resources[key] as number) - cost);
    }
  }
}

/** Show trade failure without mutating resources (gold/food unchanged). */
function rejectVisitorTrade(
  state: WorldState,
  group: VisitorGroup,
  hint: string,
  notify?: string,
): WorldState {
  pushFloat(state, group.campX, group.campY - 20, hint, '#f97316');
  if (notify) {
    pushNews(state, 'Trade failed', notify, 'negative');
  }
  return state;
}

export function tradeWithVisitors(
  originalState: WorldState,
  groupId: string,
  action: VisitorTradeAction,
): WorldState {
  const groupPreview = originalState.visitorGroups.find((g) => g.id === groupId);
  if (!groupPreview || groupPreview.kind === 'refugees' || groupPreview.daysLeft <= 0) return originalState;

  const canTrade = groupPreview.kind === 'traders' || groupPreview.kind === 'nomads' || groupPreview.kind === 'hunters';
  if (!canTrade && action !== 'sell_food') return originalState;

  const deal = VISITOR_TRADE_COSTS[action];

  const state = cloneWorldStateForAction(originalState);
  const group = state.visitorGroups.find((g) => g.id === groupId)!;

  if (!canPayTradeCost(state, deal.pay)) {
    const hint = action === 'buy_food' ? 'Need 25💰'
      : action === 'buy_wood' ? 'Need 20💰'
        : 'Need 30🍖';
    return rejectVisitorTrade(state, group, hint);
  }

  for (const [key, amount] of Object.entries(deal.receive) as [keyof WorldState['resources'], number][]) {
    if ((amount ?? 0) > 0 && !canFitPurchase(state, key, amount)) {
      const hint = key === 'food' ? 'Food storage full!'
        : key === 'wood' ? 'Wood storage full!'
          : 'Cannot store more gold';
      const notify = key === 'food'
        ? 'Food storage is full — build a Barn or Silo before buying more.'
        : key === 'wood'
          ? 'Wood storage is full — build a Barn or Store before buying more.'
          : undefined;
      return rejectVisitorTrade(state, group, hint, notify);
    }
  }

  applyTradeCost(state, deal.pay);
  let receivedLabel = '';
  for (const [key, amount] of Object.entries(deal.receive) as [keyof WorldState['resources'], number][]) {
    if ((amount ?? 0) <= 0) continue;
    const added = addCappedResource(state, key, amount);
    if (added < amount) {
      return rejectVisitorTrade(
        state,
        group,
        'Storage full!',
        'Trade cancelled — not enough storage space.',
      );
    }
    if (key === 'food') receivedLabel = `+${added}🍖`;
    else if (key === 'wood') receivedLabel = `+${added}🪵`;
    else if (key === 'gold') receivedLabel = `+${added}💰`;
  }

  pushFloat(state, group.campX, group.campY - 20, receivedLabel, action === 'sell_food' ? '#eab308' : '#22c55e');
  group.tradesCompleted++;
  group.giftsGiven++;
  const tradeDetail = action === 'buy_food' ? 'bought food'
    : action === 'buy_wood' ? 'bought wood'
      : action === 'sell_food' ? 'sold food'
        : 'traded goods';
  logEvent(state, 'trade', `Traded with ${group.name} — ${tradeDetail}`, group.name);
  return state;
}

export type RefugeeChoice = 'welcome' | 'screen' | 'turn_away';

export function negotiateRefugees(
  originalState: WorldState,
  groupId: string,
  choice: RefugeeChoice,
): WorldState {
  const groupPreview = originalState.visitorGroups.find((g) => g.id === groupId);
  if (!groupPreview || groupPreview.kind !== 'refugees' || groupPreview.refugeeResolved) return originalState;

  const state = cloneWorldStateForAction(originalState);
  const group = state.visitorGroups.find((g) => g.id === groupId)!;

  const allAlive = state.entities;

  if (choice === 'turn_away') {
    group.refugeeResolved = true;
    group.daysLeft = 0;
    state.villageReputation = Math.max(0, state.villageReputation - 2);
    logEvent(state, 'migration', `${group.name} turned away from the village`, group.name);
    return state;
  }

  if (choice === 'welcome') {
    if (state.resources.food < 40) {
      pushFloat(state, group.campX, group.campY - 20, 'Need 40🍖', '#f97316');
      return state;
    }
    if (playerHumanCount(allAlive) >= state.maxHumanPopulation) {
      pushFloat(state, group.campX, group.campY - 20, 'Population cap reached', '#f97316');
      return state;
    }
    const joined = admitRefugees(
      state,
      group,
      allAlive,
      2 + getRefugeeWelcomeBonus(state.buildings),
    );
    if (joined === 0) {
      pushFloat(state, group.campX, group.campY - 20, 'No room for refugees', '#f97316');
      return state;
    }
    state.resources.food -= 40;
    group.refugeeResolved = true;
    const villagers = allAlive.filter(isPlayerHuman);
    assignMissingResidences(villagers, state.buildings, allAlive);
    syncResidenceOccupants(villagers, state.buildings);
    pushFloat(state, group.campX, group.campY - 20, `+${joined} settlers`, '#22c55e');
    logEvent(state, 'migration', `Welcomed ${joined} refugee(s) from ${group.name}`, group.name);
    return state;
  }

  if (choice === 'screen') {
    if (state.resources.food < 20) {
      pushFloat(state, group.campX, group.campY - 20, 'Need 20🍖', '#f97316');
      return state;
    }
    if (playerHumanCount(allAlive) >= state.maxHumanPopulation) {
      pushFloat(state, group.campX, group.campY - 20, 'Population cap reached', '#f97316');
      return state;
    }
    const joined = Math.random() < 0.55 ? admitRefugees(state, group, allAlive, 1) : 0;
    group.refugeeResolved = true;
    if (joined > 0) {
      state.resources.food -= 20;
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

function admitRefugees(state: WorldState, group: VisitorGroup, allAlive: Entity[], max: number): number {
  let joined = 0;
  for (let i = 0; i < max; i++) {
    if (playerHumanCount(allAlive) >= state.maxHumanPopulation) break;
    const ent = createFactionHuman(state, group.campX, group.campY, 'visitor', group.id, getRandomSurname());
    ent.faction = undefined;
    ent.occupation = 'settler';
    ent.job = JobType.Settler;
    allAlive.push(ent);
    indexLivingEntity(state, ent);
    joined++;
  }
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

export function tickRivalSettlements(state: WorldState, allAlive: Entity[]): void {
  const newCalendarDay = state.tick > 0 && state.tick % TICKS_PER_DAY === 0;
  if (!newCalendarDay) return;

  tickPendingDiplomacyEvents(state);

  let tenseRepDrainToday = 0;
  const maxTenseRepDrainPerDay = 2;

  for (const rival of state.rivalSettlements) {
    let pop = 0;
    for (const id of rival.entityIds) {
      const ent = allAlive.find((e) => e.id === id);
      if (ent?.alive) pop++;
    }
    rival.population = pop;

    if (rival.raidCooldownDays > 0) rival.raidCooldownDays--;
    if (rival.peaceTreatyDays > 0) {
      rival.peaceTreatyDays--;
      if (rival.peaceTreatyDays === 0) {
        logEvent(state, 'event', `Peace treaty with ${rival.name} expired`, rival.name);
      }
    }

    rival.daysUntilAction--;
    if (rival.daysUntilAction > 0) continue;
    rival.daysUntilAction = 45 + Math.floor(Math.random() * 45);

    if (!isRivalAtPeace(rival)) {
      maybeQueueRaid(state, rival, allAlive);
    }

    if (Math.random() < 0.35) {
      maybeQueueDiplomacyEvent(state, rival);
    }

    if (rival.relationship === 'friendly' && Math.random() < 0.6) {
      const gold = 12 + Math.floor(Math.random() * 18);
      state.resources.gold = Math.min(state.storageMax.gold, state.resources.gold + gold);
      pushFloat(state, rival.campX, rival.campY - 20, `Trade +${gold}g`, '#22d3ee');
      logEvent(state, 'trade', `${rival.name} sent a trade gift (+${gold} gold)`, rival.name);
    } else if (rival.relationship === 'competitive') {
      const deer = allAlive.find((e) => e.alive && e.type === EntityType.Deer);
      if (deer && Math.random() < 0.5) {
        deer.alive = false;
        unindexEntityFromState(state, deer.id);
        pushFloat(state, deer.x, deer.y - 15, `${rival.name} hunted`, '#fb923c');
        logEvent(state, 'event', `${rival.name} hunters took game from the shared wilds`, rival.name);
      }
      state.pollutionLevel = Math.min(100, state.pollutionLevel + 0.5);
    } else if (
      rival.relationship === 'tense'
      && tenseRepDrainToday < maxTenseRepDrainPerDay
      && Math.random() < 0.4
    ) {
      state.villageReputation = Math.max(0, state.villageReputation - 2);
      tenseRepDrainToday++;
      pushNews(state, '⚡ Border Tension', `${rival.name} grumbles about your expansion. Reputation -2.`, 'negative');
    } else if (rival.relationship === 'neutral' && Math.random() < 0.3) {
      logEvent(state, 'event', `${rival.name} scouts were seen mapping the river bend`, rival.name);
    }

    if (state.year > rival.foundedYear + 1 && rival.population < 12 && Math.random() < 0.2) {
      const ent = createFactionHuman(state, rival.campX, rival.campY, 'rival', rival.id, rival.name);
      rival.entityIds.push(ent.id);
      rival.population++;
      allAlive.push(ent);
      indexLivingEntity(state, ent);
      logEvent(state, 'migration', `${rival.name} welcomed a new family`, rival.name);
    }
  }
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
  let roll = Math.random() * totalWeight;
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
        event: { id: 'wolf_migration', title: 'Wolf Pack Migration', description: 'A pack of wolves has migrated into the valley!', emoji: '🐺', effect: '+3 Wolves', type: 'negative' },
        bountifulHarvest,
      };
    }
    case 'bountiful_harvest':
      bountifulHarvest = true;
      return {
        event: { id: 'bountiful_harvest', title: 'Bountiful Harvest', description: 'Optimal weather causes a massive agricultural boom!', emoji: '🌾', effect: 'Farm production doubled', type: 'positive' },
        bountifulHarvest,
      };
    case 'traveling_merchant':
      addCappedResource(state, 'gold', 50);
      pushFloat(state, width / 2, height / 2, '+50 Gold', '#eab308');
      return {
        event: { id: 'traveling_merchant', title: 'Traveling Merchant', description: 'A wealthy merchant caravan passed through!', emoji: '🛒', effect: '+50 Gold', type: 'positive' },
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
        event: { id: 'nature_boom', title: 'Ecological Super-Bloom', description: 'Natural energy revitalizes the valley flora!', emoji: '🌿', effect: '+15 Trees, +30 Grass', type: 'positive' },
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
        event: { id: 'surveyors_crown', title: 'Royal Surveyors', description: 'Crown surveyors mapped your village and filed a favorable report.', emoji: '📜', effect: '+5 Reputation', type: 'positive' },
        bountifulHarvest,
      };
    case 'deer_migration':
      for (let i = 0; i < 4; i++) {
        const deer = spawnDeer(width, height, nextEntityId());
        allAlive.push(deer);
        indexLivingEntity(state, deer);
      }
      return {
        event: { id: 'deer_migration', title: 'Deer Migration', description: 'A herd of deer wandered into the valley!', emoji: '🦌', effect: '+4 Deer', type: 'positive' },
        bountifulHarvest,
      };
    case 'generous_neighbors':
      if (state.rivalSettlements.length > 0) {
        const rival = state.rivalSettlements[Math.floor(Math.random() * state.rivalSettlements.length)];
        const food = 25 + Math.floor(Math.random() * 25);
        state.resources.food = Math.min(state.storageMax.food, state.resources.food + food);
        pushFloat(state, rival.campX, rival.campY - 20, `+${food} food`, '#22c55e');
        return {
          event: { id: 'generous_neighbors', title: 'Neighborly Gift', description: `${rival.name} shared food across the wilds.`, emoji: '🤝', effect: `+${food} Food`, type: 'positive' },
          bountifulHarvest,
        };
      }
      state.resources.food = Math.min(state.storageMax.food, state.resources.food + 40);
      return {
        event: { id: 'generous_neighbors', title: 'Forest Bounty', description: 'Foragers returned with an unusually rich harvest.', emoji: '🍄', effect: '+40 Food', type: 'positive' },
        bountifulHarvest,
      };
    default:
      return { event: null, bountifulHarvest };
  }
}

function spawnWolf(width: number, height: number, id: number): Entity {
  return createEntity(
    EntityType.Wolf,
    Math.random() * width,
    Math.random() * height,
    id,
    SPECIES_CONFIG[EntityType.Wolf].spawnEnergy,
  );
}

function spawnDeer(width: number, height: number, id: number): Entity {
  return createEntity(
    EntityType.Deer,
    Math.random() * width,
    Math.random() * height,
    id,
    SPECIES_CONFIG[EntityType.Deer].spawnEnergy,
  );
}

function spawnTree(width: number, height: number, id: number): Entity {
  return createEntity(
    EntityType.Tree,
    Math.random() * width,
    Math.random() * height,
    id,
    SPECIES_CONFIG[EntityType.Tree].spawnEnergy,
  );
}

function spawnGrass(width: number, height: number, id: number): Entity {
  return createEntity(
    EntityType.Grass,
    Math.random() * width,
    Math.random() * height,
    id,
    SPECIES_CONFIG[EntityType.Grass].spawnEnergy,
  );
}

export function tryMidYearVisitorEvent(state: WorldState, allAlive: Entity[], buildings: Building[]): GameEvent | null {
  if (state.visitorGroups.length > 0) return null;
  if (playerHumanCount(allAlive) < 4) return null;
  if (Math.random() > 0.22) return null;
  const kinds: VisitorKind[] = ['traders', 'pilgrims', 'performers', 'nomads', 'scholars'];
  const kind = kinds[Math.floor(Math.random() * kinds.length)];
  return spawnVisitorGroup(state, allAlive, buildings, kind);
}

/** Once per game: friendly visitors on day 4–7 if the player has shelter and no camp yet. */
export function tryFirstWeekVisitor(
  state: WorldState,
  allAlive: Entity[],
  buildings: Building[],
): GameEvent | null {
  if (state.firstWeekVisitorSpawned) return null;
  if (state.tick < 3 * TICKS_PER_DAY || state.tick >= 7 * TICKS_PER_DAY) return null;

  const hasPlayerHouse = buildings.some(
    (b) =>
      b.completed
      && b.faction !== 'rival'
      && (b.type === BuildingType.House || b.type === BuildingType.Mansion),
  );
  if (!hasPlayerHouse) return null;

  state.firstWeekVisitorSpawned = true;
  const kind: VisitorKind = Math.random() < 0.55 ? 'pilgrims' : 'performers';
  const event = spawnVisitorGroup(state, allAlive, buildings, kind);
  pushNews(
    state,
    '🛖 Neighbors on the trail',
    `Word of ${state.villageName} reached the valley — ${kind} have come to greet your pioneers.`,
    'positive',
  );
  return event;
}