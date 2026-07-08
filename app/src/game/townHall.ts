import type { WorldState, Building, Entity } from './gameTypes';
import { BuildingType, JobType } from './gameTypes';
import { ticksForDays } from './dayCycle';
import { readSkill, rewardProductionSkills } from './skills';
import { addReputation, addFloatingText, addNotification } from './gameEngine';
import { addResource } from './economy';
import { logEvent } from './eventLog';
import { getVillageLeader } from './villageLeadership';

export const TOWN_HALL_FESTIVAL_COOLDOWN_TICKS = ticksForDays(50);
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
  const state = structuredClone(originalState) as WorldState;
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
  state.townHallFestivalCooldownUntilTick = state.tick + TOWN_HALL_FESTIVAL_COOLDOWN_TICKS;
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
    return 'Assign officials (Official job) to collect taxes, grow trade & immigration, and host festivals.';
  }
  return 'Every 3 days: +rep & tax gold · +trade · +immigration · +village efficiency · softer scandals · host festivals below';
}