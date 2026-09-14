import {
  BuildingType,
  EntityType,
  JobType,
  LEADER_OCCUPATION,
  BUILDING_JOB_TYPES,
} from './gameTypes';
import type { Building, Entity, WorldState } from './gameTypes';
import { logEvent } from './eventLog';
import { collectMinorHousehold } from './householdComposition';
import { assignMissingResidences } from './dayCycle';

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
 * Leader + spouse + dependent children — empty while the office is vacant.
 *
 * Grown children are emancipated for housing (`isMinorChild`), the same rule the
 * couple path in residencyReconciliation uses: including them would drag a married
 * child into the manor every colony day and evict the residents living there.
 */
export function collectLeaderHousehold(state: WorldState): Entity[] {
  if (state.villageLeaderId == null) return [];
  const leader = state.entities.find(
    (e) => e.id === state.villageLeaderId && e.alive && e.type === EntityType.Human,
  );
  if (!leader) return [];
  const livingHumans = state.entities.filter(
    (e) => e.alive && !e.faction && e.type === EntityType.Human,
  );
  return collectMinorHousehold(leader, livingHumans);
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

  const household = collectLeaderHousehold(state);
  if (household.length === 0) return;

  const entitledIds = new Set(household.map((m) => m.id));
  let evicted = false;
  let movedIn = false;

  //Evict settlers who are no longer part of the official leader's household
  for (const e of state.entities) {
    if (!e.alive || e.faction) continue;
    if (e.residenceBuildingId === house.id && !entitledIds.has(e.id)) {
      e.residenceBuildingId = undefined;
      evicted = true;
    }
  }

  //Move in all members of the current leader's household
  for (const member of household) {
    if (member.residenceBuildingId !== house.id) {
      member.residenceBuildingId = house.id;
      movedIn = true;
    }
  }

  // Update the building's occupants array!
  house.occupants = Array.from(entitledIds);

  if (!evicted && !movedIn) return;

  const villagers = state.entities.filter(
    (e) => e.alive && !e.faction && e.type === EntityType.Human,
  );

  //Re-home evicted settlers into general village housing
  assignMissingResidences(villagers, state.buildings, state.entities);

  //Chronicle events
  if (evicted) {
    logEvent(state, 'event', "The former leader's household moved out of the Leader's House");
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