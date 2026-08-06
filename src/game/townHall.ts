import type { WorldState, Building, Entity } from './gameTypes';
import { BuildingType, JobType } from './gameTypes';
import { ticksForDays, personDayRoll, TICKS_PER_DAY, getHourOfDay, isWorkHour } from './dayCycle';
import { readSkill, rewardProductionSkills, gainSkill } from './skills';
import { addReputation, addFloatingText, addNotification } from './gameEngine';
import { addResource } from './economy';
import { logEvent } from './eventLog';
import { getVillageLeader } from './villageLeadership';
import { sayHumanChatPhrase } from './humanChat';
import { isPlayerHuman } from './playerHuman';

export function getTownHallFestivalCooldownTicks(): number {
  return ticksForDays(50);
}
export const TOWN_HALL_FESTIVAL_COST = { food: 25, gold: 20 };
export const TOWN_HALL_FESTIVAL_DAYS = 14;

export function findPlayerTownHall(buildings: Building[]): Building | undefined {
  return buildings.find(
    (b) => b.completed && b.type === BuildingType.TownHall && b.faction !== 'rival',
  );
}

export function isTownHallStaffed(buildings: Building[]): boolean {
  const hall = findPlayerTownHall(buildings);
  return !!hall && hall.occupants.length > 0;
}

export function getTownHallOfficialSkillAvg(state: WorldState, hall: Building): number {
  if (hall.occupants.length === 0) return 0;
  let total = 0;
  let count = 0;
  for (const id of hall.occupants) {
    const official = state.entities.find((e) => e.id === id && e.alive);
    if (!official) continue;
    total += readSkill(official, JobType.Official);
    count++;
  }
  return count > 0 ? total / count : 0;
}

/** Active trade routes yield more when civic clerks keep ledgers. */
export function getTownHallTradeMultiplier(state: WorldState, buildings: Building[]): number {
  const hall = findPlayerTownHall(buildings);
  if (!hall || hall.occupants.length === 0) return 1;
  const skill = getTownHallOfficialSkillAvg(state, hall);
  return 1 + Math.min(0.3, hall.occupants.length * 0.06 + skill * 0.0015);
}

/** Immigration rolls are more likely with an open town hall. */
export function getTownHallImmigrationMultiplier(buildings: Building[]): number {
  return isTownHallStaffed(buildings) ? 1.35 : 1;
}

/** Village-wide production efficiency when officials govern. */
export function getTownHallGovernanceEfficiency(state: WorldState, buildings: Building[]): number {
  const hall = findPlayerTownHall(buildings);
  if (!hall || hall.occupants.length === 0) return 1;
  let mult = 1.05 + hall.occupants.length * 0.02;
  const leader = getVillageLeader(state);
  if (leader && hall.occupants.includes(leader.id)) {
    mult += 0.05;
  }
  return Math.min(1.18, mult);
}

/** Scandals hurt less when the village has functioning civic leadership. */
export function dampScandalReputationLoss(delta: number, buildings: Building[]): number {
  if (!isTownHallStaffed(buildings) || delta >= 0) return delta;
  return Math.round(delta * 0.65);
}

/** Extra refugees admitted on a full welcome when the town hall is staffed. */
export function getRefugeeWelcomeBonus(buildings: Building[]): number {
  return isTownHallStaffed(buildings) ? 1 : 0;
}

export function tickTownHallCivic(
  state: WorldState,
  building: Building,
  playerHumans: Entity[],
): void {
  const officials = building.occupants.length;
  const skill = getTownHallOfficialSkillAvg(state, building);
  addReputation(state, 3 + Math.max(0, officials - 1));

  const adults = playerHumans.filter((h) => !h.isJuvenile).length;
  const taxGold = Math.max(1, Math.floor((adults * 0.4 + officials * 2) * (1 + skill / 80)));
  const added = addResource(state, 'gold', taxGold);
  if (added > 0) {
    addFloatingText(
      state,
      building.x + building.width / 2,
      building.y - 12,
      `+${added} gold (taxes)`,
      '#eab308',
      'brief',
    );
  }
  rewardProductionSkills(state, building, 0.25);
}

export function canHostTownFestival(
  state: WorldState,
  building: Building,
): { ok: boolean; reason?: string } {
  if (building.type !== BuildingType.TownHall || !building.completed) {
    return { ok: false, reason: 'Not a town hall' };
  }
  if (building.occupants.length === 0) {
    return { ok: false, reason: 'Assign an official first' };
  }
  if (state.festival?.active) {
    return { ok: false, reason: 'A festival is already running' };
  }
  if (state.tick < (state.townHallFestivalCooldownUntilTick ?? 0)) {
    return { ok: false, reason: 'Town festival on cooldown' };
  }
  if (state.resources.food < TOWN_HALL_FESTIVAL_COST.food) {
    return { ok: false, reason: `Need ${TOWN_HALL_FESTIVAL_COST.food} food` };
  }
  if (state.resources.gold < TOWN_HALL_FESTIVAL_COST.gold) {
    return { ok: false, reason: `Need ${TOWN_HALL_FESTIVAL_COST.gold} gold` };
  }
  return { ok: true };
}

export function hostTownFestival(originalState: WorldState, buildingId: number): WorldState {
  const state = structuredClone(originalState);
  const building = state.buildings.find((b) => b.id === buildingId);
  if (!building) return originalState;

  const check = canHostTownFestival(state, building);
  if (!check.ok) {
    addNotification(state, 'Cannot host festival', check.reason ?? 'Unavailable', 'warning');
    return state;
  }

  state.resources.food -= TOWN_HALL_FESTIVAL_COST.food;
  state.resources.gold -= TOWN_HALL_FESTIVAL_COST.gold;
  state.festival = { active: true, name: 'Town Hall Festival', daysLeft: TOWN_HALL_FESTIVAL_DAYS };
  state.villageReputation = Math.min(100, state.villageReputation + 6);
  state.townHallFestivalCooldownUntilTick = state.tick + getTownHallFestivalCooldownTicks();
  addNotification(
    state,
    'Town Festival',
    `Officials hosted ${TOWN_HALL_FESTIVAL_DAYS} days of revelry — production & immigration boosted`,
    'success',
  );
  logEvent(state, 'season', 'Town Hall hosted a village festival');
  return state;
}

export function describeTownHallPerks(building: Building): string {
  if (building.occupants.length === 0) {
    return 'Assign officials (Official job) to collect taxes, grow trade & immigration, and host festivals. Settlers petition the hall for aid & audiences.';
  }
  return 'Every 3 days: +rep & tax gold · trade · immigration · efficiency · softer scandals · petitions & leader audiences · host festivals below';
}

export function isOfficialAtHall(
  entity: Entity,
  buildings: readonly Building[],
): Building | undefined {
  if (entity.job !== JobType.Official || entity.homeBuildingId == null) return undefined;
  const hall = buildings.find((b) => b.id === entity.homeBuildingId);
  if (!hall || hall.type !== BuildingType.TownHall || !hall.completed) return undefined;
  return hall;
}

/** Settler wants civic attention (dispute, aid, gossip, leader). */
export function wantsCivicAudience(entity: Entity, state: WorldState): boolean {
  if (!isPlayerHuman(entity) || entity.isJuvenile) return false;
  if (entity.job === JobType.Official) return false;
  if ((entity.griefUntilTick ?? 0) > state.tick) return true;
  if (state.resources.food < Math.max(40, state.humanPopulation * 2) && entity.energy < entity.maxEnergy * 0.55) {
    return true;
  }
  if ((entity.scandalCooldownUntilTick ?? 0) > state.tick) return true;
  return personDayRoll(entity.id, state.tick, 820) < 0.18;
}

export type CivicPetitionResult =
  | { kind: 'aid_food'; amount: number }
  | { kind: 'aid_gold'; amount: number }
  | { kind: 'heard'; }
  | { kind: 'leader_audience' }
  | { kind: 'none' };

/**
 * Settler petitions a staffed town hall — small aid, comfort, or leader audience.
 * Call when the settler is near the hall during free time or civic hours.
 */
export function resolveCivicPetition(
  state: WorldState,
  petitioner: Entity,
  hall: Building,
): CivicPetitionResult {
  if (!hall.completed || hall.occupants.length === 0) return { kind: 'none' };
  if (!isPlayerHuman(petitioner) || petitioner.isJuvenile) return { kind: 'none' };

  const hx = hall.x + hall.width / 2;
  const hy = hall.y + hall.height * 0.9;
  if (Math.hypot(petitioner.x - hx, petitioner.y - hy) > 52) return { kind: 'none' };

  // At most one meaningful petition per person per few days
  const day = Math.floor(state.tick / TICKS_PER_DAY);
  if (personDayRoll(petitioner.id, state.tick, 821 + day) > 0.4) return { kind: 'none' };

  const leader = getVillageLeader(state);
  const leaderHere =
    leader
    && hall.occupants.includes(leader.id)
    && Math.hypot(leader.x - hx, leader.y - hy) < 50;

  const hour = getHourOfDay(state.tick);
  const openHours = isWorkHour(hour) || (hour >= 16 && hour < 19);

  if (!openHours && !leaderHere) return { kind: 'none' };

  for (const id of hall.occupants) {
    gainSkill(state, id, JobType.Official, 0.06);
  }

  // Food hardship → small food relief
  if (
    state.resources.food >= 8
    && state.resources.food < state.humanPopulation * 3
    && petitioner.energy < petitioner.maxEnergy * 0.5
    && personDayRoll(petitioner.id, state.tick, 822) < 0.45
  ) {
    const amount = Math.min(4, Math.floor(state.resources.food * 0.02) + 1);
    state.resources.food -= amount;
    petitioner.energy = Math.min(petitioner.maxEnergy, petitioner.energy + 12 + amount * 4);
    addFloatingText(state, petitioner.x, petitioner.y - 14, `+${amount} food (aid)`, '#86efac', 'brief');
    sayHumanChatPhrase(
      petitioner,
      Math.random() < 0.5 ? 'The hall will help us.' : 'Thank the officials.',
      50,
    );
    addReputation(state, 1);
    return { kind: 'aid_food', amount };
  }

  // Scandal / grief → being heard
  if (
    ((petitioner.griefUntilTick ?? 0) > state.tick
      || (petitioner.scandalCooldownUntilTick ?? 0) > state.tick)
    && personDayRoll(petitioner.id, state.tick, 823) < 0.55
  ) {
    petitioner.energy = Math.min(petitioner.maxEnergy, petitioner.energy + 6);
    sayHumanChatPhrase(
      petitioner,
      Math.random() < 0.5 ? 'They listened…' : 'The record is noted.',
      52,
    );
    addFloatingText(state, hall.x + hall.width / 2, hall.y - 10, '📜 Petition heard', '#93c5fd', 'brief');
    addReputation(state, 1);
    return { kind: 'heard' };
  }

  // Leader audience
  if (leaderHere && personDayRoll(petitioner.id, state.tick, 824) < 0.35) {
    sayHumanChatPhrase(
      petitioner,
      Math.random() < 0.5 ? 'A word with the leader.' : 'I trust our chief.',
      48,
    );
    if ((leader.chatTicks ?? 0) <= 0) {
      sayHumanChatPhrase(
        leader,
        Math.random() < 0.5 ? 'Speak freely.' : 'We will see it done.',
        48,
      );
    }
    addReputation(state, 1);
    return { kind: 'leader_audience' };
  }

  // Generic civic visit — small gold stipend for very poor days
  if (
    state.resources.gold >= 5
    && personDayRoll(petitioner.id, state.tick, 825) < 0.2
    && petitioner.energy < petitioner.maxEnergy * 0.6
  ) {
    const amount = 1;
    state.resources.gold -= amount;
    petitioner.energy = Math.min(petitioner.maxEnergy, petitioner.energy + 5);
    addFloatingText(state, petitioner.x, petitioner.y - 12, '🪙 Stipend', '#fde047', 'brief');
    sayHumanChatPhrase(petitioner, 'A coin for the road.', 40);
    return { kind: 'aid_gold', amount };
  }

  if (personDayRoll(petitioner.id, state.tick, 826) < 0.25) {
    sayHumanChatPhrase(
      petitioner,
      Math.random() < 0.5 ? 'Busy halls today.' : 'Papers and plans…',
      40,
    );
    return { kind: 'heard' };
  }

  return { kind: 'none' };
}

/** Official on duty greets / handles the nearest petitioner. */
export function officialHandlePetitioners(
  state: WorldState,
  official: Entity,
  hall: Building,
  villagers: readonly Entity[],
): boolean {
  const hx = hall.x + hall.width / 2;
  const hy = hall.y + hall.height * 0.9;
  if (Math.hypot(official.x - hx, official.y - hy) > 48) return false;

  const petitioners = villagers.filter(
    (v) =>
      v.id !== official.id
      && v.alive
      && isPlayerHuman(v)
      && !v.isJuvenile
      && Math.hypot(v.x - hx, v.y - hy) < 55
      && wantsCivicAudience(v, state),
  );
  if (petitioners.length === 0) return false;

  const pick = petitioners[Math.floor(personDayRoll(official.id, state.tick, 827) * petitioners.length)]!;
  const result = resolveCivicPetition(state, pick, hall);
  if (result.kind === 'none') return false;
  if ((official.chatTicks ?? 0) <= 0 && Math.random() < 0.4) {
    sayHumanChatPhrase(
      official,
      Math.random() < 0.5 ? 'Next, please.' : 'The village hears you.',
      44,
    );
  }
  return true;
}

/**
 * Daily civic pulse beyond taxes — clear a few petitions symbolically for villagers near hall.
 */
export function tickTownHallAudiences(
  state: WorldState,
  hall: Building,
  playerHumans: Entity[],
): void {
  if (!hall.completed || hall.occupants.length === 0) return;
  let handled = 0;
  const adults = playerHumans.filter((h) => h.alive && !h.isJuvenile);
  for (const h of adults) {
    if (handled >= 2) break;
    if (!wantsCivicAudience(h, state)) continue;
    const r = resolveCivicPetition(state, h, hall);
    if (r.kind !== 'none') handled++;
  }
  if (handled > 0 && Math.random() < 0.5) {
    logEvent(state, 'event', `Town Hall heard ${handled} petition${handled > 1 ? 's' : ''}`);
  }
}