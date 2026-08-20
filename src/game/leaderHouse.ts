/**
 * Leader's House — the elected village head's official residence.
 *
 * Reserved housing: only the leader's household (leader + spouse + children) lives
 * in the manor, and the general housing balancer never uses its beds (dayCycle.ts
 * guards skip it). Eviction and move-in happen here, at the moment a NEW official
 * leader is confirmed — during a vacancy (leader died, succession election pending)
 * the bereaved household keeps the manor until the successor is revealed.
 *
 * The office also sets `occupation: 'leader'`. The leader participates in
 * normal workforce assignment like any other settler (authority §5, 2026-08-20):
 * office-taking preserves a valid workplace, auto-staff may assign an idle
 * leader, and save-load keeps the assignment. Family members keep normal jobs.
 */
import { BuildingType, EntityType, JobType, LEADER_OCCUPATION, BUILDING_JOB_TYPES } from './gameTypes';
import type { Building, Entity, WorldState } from './gameTypes';
import { logEvent } from './eventLog';
import { assignMissingResidences } from './dayCycle';

export { LEADER_OCCUPATION };

/** The one completed player-owned Leader's House, if built. */
export function findLeaderHouse(buildings: Building[]): Building | undefined {
  return buildings.find(
    (b) => b.type === BuildingType.LeaderHouse && b.completed && b.faction !== 'rival',
  );
}

function leaderDisplayName(leader: Entity): string {
  return leader.name ?? 'The village leader';
}

function collectOwnHousehold(leader: Entity, humans: Entity[]): Entity[] {
  const byId = new Map(humans.filter((h) => h.alive && !h.faction).map((h) => [h.id, h]));
  const ids = new Set<number>([leader.id]);
  if (leader.partnerId != null) ids.add(leader.partnerId);
  for (const childId of leader.childrenIds ?? []) ids.add(childId);
  for (const human of byId.values()) {
    if (
      human.partnerId === leader.id
      || human.fatherId === leader.id
      || human.motherId === leader.id
      || human.adoptiveFatherId === leader.id
      || human.adoptiveMotherId === leader.id
    ) ids.add(human.id);
  }
  return [...ids].map((id) => byId.get(id)).filter((h): h is Entity => h != null);
}

/** Leader + spouse + children — empty while the office is vacant. */
export function collectLeaderHousehold(state: WorldState): Entity[] {
  if (state.villageLeaderId == null) return [];
  const leader = state.entities.find(
    (e) => e.id === state.villageLeaderId && e.alive && e.type === EntityType.Human,
  );
  if (!leader) return [];
  const humans = state.entities.filter((e) => e.type === EntityType.Human);
  return collectOwnHousehold(leader, humans);
}

/**
 * Office -> occupation: the current leader leads. A valid workplace is
 * PRESERVED (the leader works like any other settler — authority §5); only a
 * STALE assignment (missing/demolished/incomplete/rival/non-job workplace) is
 * repaired, mirroring workforce.prepareWorkforce. The living predecessor
 * reverts to 'settler' so they remain employable.
 */
export function applyLeaderOccupation(state: WorldState, prevLeaderId: number | null): void {
  if (prevLeaderId != null && prevLeaderId !== state.villageLeaderId) {
    const prev = state.entities.find((e) => e.id === prevLeaderId);
    if (prev?.alive && prev.occupation === LEADER_OCCUPATION) {
      prev.occupation = 'settler';
      prev.job = JobType.Settler;
    }
  }

  if (state.villageLeaderId == null) return;
  const leader = state.entities.find(
    (e) => e.id === state.villageLeaderId && e.alive && e.type === EntityType.Human,
  );
  if (!leader) return;
  // Preserve a valid workplace — only repair a STALE leader assignment.
  if (leader.homeBuildingId != null) {
    const workplace = state.buildings.find((b) => b.id === leader.homeBuildingId);
    const stale =
      !workplace
      || !workplace.completed
      || workplace.faction === 'rival'
      || !BUILDING_JOB_TYPES[workplace.type];
    if (stale) {
      if (workplace) workplace.occupants = workplace.occupants.filter((id) => id !== leader.id);
      leader.homeBuildingId = undefined;
      leader.job = JobType.Settler;
    }
  }
  leader.occupation = LEADER_OCCUPATION;
}

/**
 * Reconcile the manor's residents with the current office-holder:
 * anyone living there who is not in the leader's household is evicted to normal
 * housing, and missing household members move in. No-op while the office is vacant
 * (household stays until the successor is official) or while no manor exists.
 */
export function syncLeaderHouseResidency(state: WorldState): void {
  const house = findLeaderHouse(state.buildings);
  if (!house) return;
  const household = collectLeaderHousehold(state);
  if (household.length === 0) return;
  const entitled = new Set(household.map((m) => m.id));

  let evicted = false;
  let movedIn = false;
  for (const e of state.entities) {
    if (!e.alive || e.faction) continue;
    if (e.residenceBuildingId === house.id && !entitled.has(e.id)) {
      e.residenceBuildingId = undefined;
      evicted = true;
    }
  }
  for (const member of household) {
    if (member.residenceBuildingId !== house.id) {
      member.residenceBuildingId = house.id;
      movedIn = true;
    }
  }
  if (!evicted && !movedIn) return;

  const villagers = state.entities.filter(
    (e) => e.alive && !e.faction && e.type === EntityType.Human,
  );
  // Re-home the evicted into normal houses + refresh residence occupant lists.
  assignMissingResidences(villagers, state.buildings, state.entities);

  const leader = household[0];
  if (movedIn) {
    logEvent(
      state,
      'event',
      `👑 ${leaderDisplayName(leader)}'s household moved into the Leader's House`,
      leaderDisplayName(leader),
    );
  }
  if (evicted) {
    logEvent(state, 'event', "The former leader's household moved out of the Leader's House");
  }
}
