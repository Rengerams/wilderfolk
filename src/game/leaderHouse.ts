import {
  assignMissingResidences,
  createHousingLedger,
  runHousingPhase,
  standaloneMoveContext,
  relocateHousehold,
  syncResidenceOccupants,
} from './residencyReconciliation';
import type { HousingLedger, HousingMoveContext } from './residencyReconciliation';
import { listPlayerResidences } from './residencySelection';
import {
  EntityType,
  JobType,
  LEADER_OCCUPATION,
  BUILDING_JOB_TYPES,
} from './gameTypes';
import type { Building, Entity, WorldState } from './gameTypes';
import { logEvent } from './eventLog';
import { collectLeaderDescendants, getChildCustodian, isMinorChild } from './householdComposition';
import { isPlayerHuman } from './playerHuman';
import { getResidenceCapacity, isImprisoned, isResidenceOccupantEntity } from './residencyOccupancy';
import { clearWorkerAssignment } from './workforce';
import { leaderHouseBuildings } from './leaderHouseExpansion';

export { LEADER_OCCUPATION };

/** The one completed player-owned Leader's House, if built. */
export function findLeaderHouse(buildings: Building[]): Building | undefined {
  return leaderHouseBuildings(buildings).find((building) => building.completed);
}

function leaderDisplayName(leader: Entity): string {
  if (leader.name) {
    return leader.surname ? `${leader.name} ${leader.surname}` : leader.name;
  }
  return 'The village leader';
}

/**
 * Leader and spouse, their children and grandchildren of any age.
 * Extended relatives remain in their own homes; empty while office is vacant.
 */
export function collectLeaderHousehold(state: WorldState): Entity[] {
  if (state.villageLeaderId == null) return [];
  const leader = state.entities.find(
    (e) => e.id === state.villageLeaderId && e.alive
      && (e.type === EntityType.Human || (e.type === EntityType.Werewolf && e.moonHowlerCursed)),
  );
  if (!leader) return [];
  // Cursed Moon Howlers included: the wolf form is the same settler, and dropping them here unseated
  // the family whose beds depend on them — a relocation at dusk and a move-in at dawn, every night.
  const livingHumans = state.entities.filter((e) => isResidenceOccupantEntity(e));
  return collectLeaderDescendants(leader, livingHumans).filter((member) => !isImprisoned(member));
}

export function applyLeaderOccupation(state: WorldState, prevLeaderId: number | null): void {
  // Step down previous leader
  if (prevLeaderId != null && prevLeaderId !== state.villageLeaderId) {
    const prev = state.entities.find((e) => e.id === prevLeaderId);
    if (prev?.alive && prev.occupation === LEADER_OCCUPATION) {
      prev.occupation = 'settler';
      if (!prev.workerBuildingId) {
        prev.job = JobType.Settler;
      }
    }
  }

  if (state.villageLeaderId == null) return;
  const leader = state.entities.find(
    (e) => e.id === state.villageLeaderId && e.alive && e.type === EntityType.Human,
  );
  if (!leader) return;

  // Preserve valid workplace
  if (leader.workerBuildingId != null) {
    const workplace = state.buildings.find((b) => b.id === leader.workerBuildingId);
    const stale =
      !workplace ||
      !workplace.completed ||
      workplace.faction === 'rival' ||
      !BUILDING_JOB_TYPES[workplace.type];

    if (stale) clearWorkerAssignment(leader, state.buildings);
  }

  leader.occupation = LEADER_OCCUPATION;
}

/** The `leader` phase's decision context: the manor sets the policy, never the bed cap. */
function leaderHousingContext(state: WorldState, ledger: HousingLedger): HousingMoveContext {
  const residents = state.entities.filter((e) => e.alive && isResidenceOccupantEntity(e));
  return standaloneMoveContext(residents, listPlayerResidences(state.buildings), undefined, undefined, ledger);
}

/** The manor's departing residents as households: a minor leaves with their custodian, never alone. */
function evictionHouseholds(departing: Entity[]): Entity[][] {
  const unitOf = new Map<number, Entity[]>(departing.map((member) => [member.id, [member]]));
  for (const member of departing) {
    if (!isMinorChild(member)) continue;
    const custodian = getChildCustodian(member, departing);
    const target = custodian ? unitOf.get(custodian.id) : undefined;
    const own = unitOf.get(member.id);
    if (!target || !own || target === own) continue;
    own.splice(own.indexOf(member), 1);
    target.push(member);
    unitOf.set(member.id, target);
  }
  return [...new Set(unitOf.values())].filter((unit) => unit.length > 0);
}

/** The manor hold's decision; returns the settlers it evicted so a caller can seat them. */
export function applyLeaderHousePhase(state: WorldState, ledger: HousingLedger): Entity[] {
  const house = findLeaderHouse(state.buildings);
  if (!house) return [];
  const manorBuildings = leaderHouseBuildings(state.buildings).filter((building) => building.completed);
  const manorIds = new Set(manorBuildings.map((building) => building.id));
  const annex = manorBuildings.find((building) => building.id !== house.id);

  // Keep the late leader's surviving family in the manor throughout the vacancy.
  // The succession election owns the handover: until a living successor is elected,
  // do not replace the residents with an empty entitlement set.
  const incumbent = state.entities.find((e) => e.id === state.villageLeaderId);
  if (!incumbent?.alive) {
    const entitledIds = new Set(state.pendingLeaderHouseResidentIds ?? manorBuildings.flatMap((building) => building.occupants));
    const context = leaderHousingContext(state, ledger);
    for (const person of state.entities) {
      if (person.alive && isPlayerHuman(person) && !isImprisoned(person) && entitledIds.has(person.id)) {
        relocateHousehold([person], house.id, 'leader', 'leader', context);
      }
    }
    syncResidenceOccupants(state.entities, state.buildings);
    return [];
  }
  state.pendingLeaderHouseResidentIds = undefined;

  const household = collectLeaderHousehold(state);
  // A household reads empty while the office is still held (Moon Howler form, prison sentence), so
  // only a vacant office may evict.
  const officeHeld =
    state.villageLeaderId != null
    && state.entities.some((e) => e.id === state.villageLeaderId && e.alive);
  if (household.length === 0 && officeHeld) return [];

  // A cursed member's own bed belongs to the Moon Howler form switch (cleared on transform, restored
  // on reversion), so the manor reads them as away without unseating the family who stay home.
  const atHome = household.filter((member) => member.type !== EntityType.Werewolf);
  const entitledIds = new Set(atHome.map((m) => m.id));
  let evicted = false;
  let movedIn = false;
  const displaced: Entity[] = [];
  const context = leaderHousingContext(state, ledger);

  //Evict settlers who are no longer part of the official leader's household
  const departing = state.entities.filter(
    (e) => e.alive && isPlayerHuman(e) && !isImprisoned(e)
      && e.residenceBuildingId != null && manorIds.has(e.residenceBuildingId) && !entitledIds.has(e.id),
  );
  for (const unit of evictionHouseholds(departing)) {
    if (!relocateHousehold(unit, undefined, 'leader', 'leader', context)) continue;
    displaced.push(...unit);
    evicted = true;
  }

  // A settled descendant's household keeps its own home: the adult, their co-resident partner and
  // the children whose custodian lives there; the leader's own minors still move in.
  const settledIds = new Set<number>();
  for (const member of atHome) {
    const ownHome = member.residenceBuildingId;
    if (ownHome == null || manorIds.has(ownHome) || isMinorChild(member)) continue;
    if (member.id === state.villageLeaderId || member.partnerId === state.villageLeaderId) continue;
    settledIds.add(member.id);
    const partner = member.partnerId == null ? undefined : atHome.find((m) => m.id === member.partnerId);
    if (partner && partner.residenceBuildingId === ownHome) settledIds.add(partner.id);
  }
  for (const member of atHome) {
    if (!isMinorChild(member) || settledIds.has(member.id)) continue;
    const custodian = getChildCustodian(member, atHome);
    if (!custodian || !settledIds.has(custodian.id)) continue;
    if (custodian.residenceBuildingId != null
      && custodian.residenceBuildingId === member.residenceBuildingId) settledIds.add(member.id);
  }

  // Keep the leader in the original manor; seat overflow in its linked annex when completed.
  const toSeat = atHome.filter((member) => !settledIds.has(member.id))
    .sort((a, b) => {
      const rank = (person: Entity) => person.id === state.villageLeaderId ? 0
        : person.partnerId === state.villageLeaderId ? 1 : 2;
      return rank(a) - rank(b) || a.id - b.id;
    });
  const mainCapacity = getResidenceCapacity(house);
  for (const [index, member] of toSeat.entries()) {
    const destination = annex && index >= mainCapacity ? annex : house;
    if (member.residenceBuildingId !== destination.id) {
      if (relocateHousehold([member], destination.id, 'leader', 'leader', context)) movedIn = true;
    }
  }

  // Update the building's occupants array!
  syncResidenceOccupants(state.entities, state.buildings);

  if (!evicted && !movedIn) return displaced;

  //Chronicle events
  if (evicted) {
    logEvent(state, 'event', `${displaced.length} resident${displaced.length === 1 ? '' : 's'} relocated from the Leader's House`);
  }

  if (movedIn) {
    const leader = household.find((m) => m.id === state.villageLeaderId) ?? household[0];
    const name = leaderDisplayName(leader);
    logEvent(
      state,
      'event',
      `👑 ${name}'s household moved into the Leader's House`,
      name,
    );
  }
  return displaced;
}

/** The `leader` phase alone, for an election, succession or Moon Howler reversion. */
export function syncLeaderHouseResidency(state: WorldState): void {
  const ledger = createHousingLedger();
  const residents = state.entities.filter((e) => e.alive && isResidenceOccupantEntity(e));
  let displaced: Entity[] = [];
  runHousingPhase(ledger, 'leader', residents, () => {
    displaced = applyLeaderHousePhase(state, ledger);
  });
  if (displaced.length > 0) {
    assignMissingResidences(displaced, state.buildings, state.entities, state.tick);
  }
}
