import {
  BuildingType,
  EntityType,
  JobType,
  LEADER_OCCUPATION,
  BUILDING_JOB_TYPES,
} from './gameTypes';
import type { Building, Entity, WorldState } from './gameTypes';
import { logEvent } from './eventLog';
import { collectLeaderDescendants } from './householdComposition';
import { assignMissingResidences, syncResidenceOccupants } from './residencyReconciliation';
import { isPlayerHuman } from './playerHuman';
import { isImprisoned, isResidenceOccupantEntity } from './residencyOccupancy';

export { LEADER_OCCUPATION };

/** The one completed player-owned Leader's House, if built. */
export function findLeaderHouse(buildings: Building[]): Building | undefined {
  return buildings.find(
    (b) => b.type === BuildingType.LeaderHouse && b.completed && b.faction !== 'rival',
  );
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
      if (!prev.homeBuildingId) {
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
  if (leader.homeBuildingId != null) {
    const workplace = state.buildings.find((b) => b.id === leader.homeBuildingId);
    const stale =
      !workplace ||
      !workplace.completed ||
      workplace.faction === 'rival' ||
      !BUILDING_JOB_TYPES[workplace.type];

    if (stale) {
      if (workplace) {
        workplace.occupants = workplace.occupants.filter((id) => id !== leader.id);
      }
      leader.homeBuildingId = undefined;
      leader.job = JobType.Settler;
    }
  }

  leader.occupation = LEADER_OCCUPATION;
}

export function syncLeaderHouseResidency(state: WorldState): void {
  const house = findLeaderHouse(state.buildings);
  if (!house) return;

  // Keep the late leader's surviving family in the manor throughout the vacancy.
  // The succession election owns the handover: until a living successor is elected,
  // do not replace the residents with an empty entitlement set.
  const incumbent = state.entities.find((e) => e.id === state.villageLeaderId);
  if (!incumbent?.alive) {
    const entitledIds = new Set(state.pendingLeaderHouseResidentIds ?? house.occupants);
    for (const person of state.entities) {
      if (person.alive && isPlayerHuman(person) && !isImprisoned(person) && entitledIds.has(person.id)) {
        person.residenceBuildingId = house.id;
      }
    }
    syncResidenceOccupants(state.entities, state.buildings);
    return;
  }
  state.pendingLeaderHouseResidentIds = undefined;

  const household = collectLeaderHousehold(state);
  // A household reads empty while the office is still held (Moon Howler form, prison sentence), so
  // only a vacant office may evict.
  const officeHeld =
    state.villageLeaderId != null
    && state.entities.some((e) => e.id === state.villageLeaderId && e.alive);
  if (household.length === 0 && officeHeld) return;

  // A cursed member's own bed belongs to the Moon Howler form switch (cleared on transform, restored
  // on reversion), so the manor reads them as away without unseating the family who stay home.
  const atHome = household.filter((member) => member.type !== EntityType.Werewolf);
  const entitledIds = new Set(atHome.map((m) => m.id));
  let evicted = false;
  let movedIn = false;
  const displaced: Entity[] = [];

  //Evict settlers who are no longer part of the official leader's household
  for (const e of state.entities) {
    if (!e.alive || !isPlayerHuman(e)) continue;
    if (e.residenceBuildingId === house.id && !entitledIds.has(e.id)) {
      e.residenceBuildingId = undefined;
      displaced.push(e);
      evicted = true;
    }
  }

  //Move in all members of the current leader's household
  for (const member of atHome) {
    if (member.residenceBuildingId !== house.id) {
      // Release the old home's reserved slot before finding homes for displaced residents.
      const previous = state.buildings.find((b) => b.id === member.residenceBuildingId);
      if (previous) previous.occupants = previous.occupants.filter((id) => id !== member.id);
      member.residenceBuildingId = house.id;
      movedIn = true;
    }
  }

  // Update the building's occupants array!
  house.occupants = Array.from(entitledIds);

  if (!evicted && !movedIn) return;

  // Only the people actually evicted from the manor need emergency housing.
  // Running a whole-village convergence here used to trigger up to 24 passes
  // over thousands of settlers whenever the leader household changed.
  // The periodic assignment layer remains responsible for all other housing.
  // Rebuild occupancy from authoritative residence IDs before vacancy selection, even
  // when the previous leader's household needs emergency rehousing.
  syncResidenceOccupants(state.entities, state.buildings);
  if (displaced.length > 0) {
    assignMissingResidences(displaced, state.buildings, state.entities, state.tick);
  }

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
}