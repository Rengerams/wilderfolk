import type { Building, Entity, GameEventLog, RivalSettlement, WorldState } from './gameTypes';
import { BuildingType, BUILDING_CONFIGS, EntityType } from './gameTypes';
import { isNewCalendarDayTick } from './dayCycle';
import { maybeQueueRaid } from './frontierCombat';
import { indexLivingEntity } from './entityIndex';
import { isRivalAtPeace } from './rivalPeace';
import { applyRivalDailyAction, ensureRivalProfile, selectRivalDailyAction } from './rivalProfiles';

export interface RivalEventCallbacks {
  pushNews: (state: WorldState, title: string, message: string, type: 'positive' | 'negative' | 'neutral') => void;
  pushFloat: (state: WorldState, x: number, y: number, text: string, color: string) => void;
  logEvent: (state: WorldState, type: GameEventLog['type'], message: string, subject?: string) => void;
  tickPendingDiplomacyEvents: (state: WorldState) => void;
  queueDiplomacyEvent: (state: WorldState, rival: RivalSettlement) => void;
  createFactionHuman: (
    state: WorldState,
    x: number,
    y: number,
    faction: 'rival',
    groupId: string,
    surname: string,
  ) => Entity;
  createRivalBuilding: (
    state: WorldState,
    type: BuildingType,
    x: number,
    y: number,
    groupId: string,
    campLabel: string,
  ) => Building;
  killWildGameForPoach: (state: WorldState, animal: Entity) => void;
}

const RIVAL_CAMP_MAX_BUILDINGS = 7;
const RIVAL_EXPAND_SLOTS: { dx: number; dy: number }[] = [
  { dx: 0, dy: 0 },
  { dx: 55, dy: 10 },
  { dx: -40, dy: 25 },
  { dx: 35, dy: -45 },
  { dx: -55, dy: -20 },
  { dx: 70, dy: 40 },
  { dx: -20, dy: 55 },
  { dx: 20, dy: 70 },
];

function buildAliveEntityIndex(allAlive: Entity[]): Map<number, Entity> {
  const index = new Map<number, Entity>();
  for (const entity of allAlive) {
    if (entity.alive) index.set(entity.id, entity);
  }
  return index;
}

function buildAliveDeerList(allAlive: Entity[]): Entity[] {
  return allAlive.filter((entity) => (
    entity.alive && entity.type === EntityType.Deer && entity.tamedBy == null
  ));
}

function makeNextAliveDeer(deerList: Entity[]): () => Entity | undefined {
  let index = 0;
  return () => {
    while (index < deerList.length) {
      const deer = deerList[index];
      if (deer?.alive) return deer;
      index++;
    }
    return undefined;
  };
}

function rivalBuildingTypes(state: WorldState, rival: RivalSettlement): Map<BuildingType, number> {
  const counts = new Map<BuildingType, number>();
  for (const id of rival.buildingIds) {
    const building = state.buildings.find((candidate) => candidate.id === id);
    if (!building) continue;
    counts.set(building.type, (counts.get(building.type) ?? 0) + 1);
  }
  return counts;
}

function pickRivalExpansionType(
  rival: RivalSettlement,
  counts: Map<BuildingType, number>,
): BuildingType | null {
  const houses = counts.get(BuildingType.House) ?? 0;
  const farms = counts.get(BuildingType.Farm) ?? 0;
  const wells = counts.get(BuildingType.Well) ?? 0;
  const towers = counts.get(BuildingType.Watchtower) ?? 0;
  const markets = counts.get(BuildingType.Market) ?? 0;

  if (houses < 2 && rival.population >= 6) return BuildingType.House;
  if (farms < 2 && rival.population >= 5) return BuildingType.Farm;
  if (wells < 1) return BuildingType.Well;
  if (houses < 3 && rival.population >= 9) return BuildingType.House;

  switch (rival.relationship) {
    case 'friendly':
      if (markets < 1) return BuildingType.Market;
      if (houses < 3) return BuildingType.House;
      if (farms < 2) return BuildingType.Farm;
      return null;
    case 'neutral':
      if (houses < 3) return BuildingType.House;
      if (farms < 2) return BuildingType.Farm;
      return null;
    case 'competitive':
      if (farms < 2) return BuildingType.Farm;
      if (towers < 1) return BuildingType.Watchtower;
      if (houses < 2) return BuildingType.House;
      return null;
    case 'tense':
      if (towers < 1) return BuildingType.Watchtower;
      if (towers < 2 && rival.population >= 8) return BuildingType.Watchtower;
      if (houses < 2) return BuildingType.House;
      return null;
    default:
      return null;
  }
}

function findFreeRivalSlot(
  state: WorldState,
  rival: RivalSettlement,
  type: BuildingType,
): { x: number; y: number } | null {
  const config = BUILDING_CONFIGS[type];
  const margin = 12;
  for (const slot of RIVAL_EXPAND_SLOTS) {
    const x = rival.campX + slot.dx - config.width / 2;
    const y = rival.campY + slot.dy - config.height / 2;
    if (
      x < margin || y < margin
      || x + config.width > state.width - margin
      || y + config.height > state.height - margin
    ) continue;

    const overlaps = state.buildings.some((building) => {
      const pad = 8;
      return !(
        x + config.width + pad < building.x
        || building.x + building.width + pad < x
        || y + config.height + pad < building.y
        || building.y + building.height + pad < y
      );
    });
    if (!overlaps) return { x, y };
  }
  return null;
}

function maybeExpandRivalCamp(
  state: WorldState,
  rival: RivalSettlement,
  buildings: Building[],
  callbacks: RivalEventCallbacks,
): void {
  if (rival.buildingIds.length >= RIVAL_CAMP_MAX_BUILDINGS) return;
  if (state.year < rival.foundedYear) return;
  if (state.year === rival.foundedYear && state.dayInYear < 20) return;

  const chance = rival.relationship === 'friendly' ? 0.14
    : rival.relationship === 'neutral' ? 0.10
      : rival.relationship === 'competitive' ? 0.12 : 0.11;
  if (Math.random() > chance) return;

  const type = pickRivalExpansionType(rival, rivalBuildingTypes(state, rival));
  if (!type) return;
  const pos = findFreeRivalSlot(state, rival, type);
  if (!pos) return;

  const building = callbacks.createRivalBuilding(state, type, pos.x, pos.y, rival.id, rival.name);
  buildings.push(building);
  rival.buildingIds.push(building.id);

  const label = BUILDING_CONFIGS[type]?.label ?? type;
  const peaceful = rival.relationship === 'friendly' || rival.relationship === 'neutral';
  callbacks.pushFloat(state, rival.campX, rival.campY - 28, `+${label}`, peaceful ? '#67e8f9' : '#fb923c');
  callbacks.logEvent(
    state,
    'event',
    `${rival.name} raised a ${label.toLowerCase()} at their camp`,
    rival.name,
  );
  if (type === BuildingType.Watchtower || type === BuildingType.Market) {
    callbacks.pushNews(
      state,
      peaceful ? '🏕️ Neighbors grow' : '🏕️ Camp expands',
      `${rival.name} built a ${label.toLowerCase()} (${rival.relationship}).`,
      peaceful ? 'neutral' : 'negative',
    );
  }
}

export function tickRivalSettlements(
  state: WorldState,
  allAlive: Entity[],
  callbacks: RivalEventCallbacks,
): void {
  if (!isNewCalendarDayTick(state)) return;

  callbacks.tickPendingDiplomacyEvents(state);
  const aliveById = buildAliveEntityIndex(allAlive);
  const nextDeer = makeNextAliveDeer(buildAliveDeerList(allAlive));
  const buildings = state.buildings;
  let tenseRepDrainToday = 0;
  const maxTenseRepDrainPerDay = 2;

  for (const rival of state.rivalSettlements) {
    ensureRivalProfile(rival);
    let population = 0;
    for (const id of rival.entityIds) {
      if (aliveById.get(id)?.alive) population++;
    }
    rival.population = population;

    if (rival.raidCooldownDays > 0) rival.raidCooldownDays--;
    if (rival.peaceTreatyDays > 0) {
      rival.peaceTreatyDays--;
      if (rival.peaceTreatyDays === 0) {
        callbacks.logEvent(state, 'event', `Peace treaty with ${rival.name} expired`, rival.name);
      }
    }

    maybeExpandRivalCamp(state, rival, buildings, callbacks);
    rival.daysUntilAction--;
    if (rival.daysUntilAction > 0) continue;
    rival.daysUntilAction = 45 + Math.floor(Math.random() * 45);

    const profile = ensureRivalProfile(rival);
    const action = selectRivalDailyAction(profile, rival.relationship);
    const outcome = applyRivalDailyAction(profile, action);
    profile.lastAction = outcome.changed ? action : 'none';
    profile.lastActionDay = state.year * 360 + state.dayInYear;
    if (outcome.changed) {
      callbacks.logEvent(state, 'event', `${rival.name} ${outcome.summary}`, rival.name);
    }

    if (!isRivalAtPeace(rival)) maybeQueueRaid(state, rival, allAlive);
    if (Math.random() < 0.35) callbacks.queueDiplomacyEvent(state, rival);

    if (rival.relationship === 'friendly' && Math.random() < 0.6) {
      const gold = 12 + Math.floor(Math.random() * 18);
      state.resources.gold = Math.min(state.storageMax.gold, state.resources.gold + gold);
      callbacks.pushFloat(state, rival.campX, rival.campY - 20, `Trade +${gold}g`, '#22d3ee');
      callbacks.logEvent(state, 'trade', `${rival.name} sent a trade gift (+${gold} gold)`, rival.name);
    } else if (rival.relationship === 'competitive') {
      const deer = nextDeer();
      if (deer && Math.random() < 0.5) {
        callbacks.killWildGameForPoach(state, deer);
        callbacks.pushFloat(state, deer.x, deer.y - 15, `${rival.name} hunted`, '#fb923c');
        callbacks.logEvent(state, 'event', `${rival.name} hunters took game from the shared wilds`, rival.name);
      }
      state.pollutionLevel = Math.min(100, state.pollutionLevel + 0.5);
    } else if (
      rival.relationship === 'tense'
      && tenseRepDrainToday < maxTenseRepDrainPerDay
      && Math.random() < 0.4
    ) {
      state.villageReputation = Math.max(0, state.villageReputation - 2);
      tenseRepDrainToday++;
      callbacks.pushNews(state, '⚡ Border Tension', `${rival.name} grumbles about your expansion. Reputation -2.`, 'negative');
    } else if (rival.relationship === 'neutral' && Math.random() < 0.3) {
      callbacks.logEvent(state, 'event', `${rival.name} scouts were seen mapping the river bend`, rival.name);
    }

    if (state.year > rival.foundedYear + 1 && rival.population < 12 && Math.random() < 0.2) {
      const entity = callbacks.createFactionHuman(state, rival.campX, rival.campY, 'rival', rival.id, rival.name);
      rival.entityIds.push(entity.id);
      rival.population++;
      allAlive.push(entity);
      indexLivingEntity(state, entity);
      callbacks.logEvent(state, 'migration', `${rival.name} welcomed a new family`, rival.name);
    }
  }
}
