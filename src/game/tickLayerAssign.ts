import type { WorldState } from './gameTypes';
import { EntityType } from './gameTypes';
import type { TickContext } from './simulation/simulationTypes';
import {
  syncResidenceOccupants,
  assignMissingResidences,
  TICKS_PER_HOUR,
} from './dayCycle';
import { assignMissingWorkers } from './workforce';
import { collectLeaderHousehold, syncLeaderHouseResidency } from './leaderHouse';
import { profileStart, profileEnd } from './performanceProfiler';

/**
 * Assignment layer pulse interval (ticks).
 *
 * Housing + job fill — village logistics, not chat/courtship (those are Realtime).
 * Scales to fire ~4× per calendar day (18 ticks @ 3 ticks/hour with 72 ticks/day).
 */
export const LAYER_ASSIGN_INTERVAL = 6 * TICKS_PER_HOUR;

/**
 * Assignment layer — residence + workforce bookkeeping.
 *
 * Realtime interactions (chat, affairs, courtship) run in `tickHumans`.
 * Daily mortality and conception stay under `isNewCalendarDay` in `humanTick`.
 *
 * Called when `world.tick % LAYER_ASSIGN_INTERVAL === 0`.
 */
export function tickLayerAssign(world: WorldState, ctx: TickContext): void {
  const { playerHumans, updatedBuildings, byType, newEntities } = ctx;

  const humanBucket = byType[EntityType.Human];
  const allHumans = humanBucket
    ? humanBucket.filter((e) => e.alive)
    : world.entities.filter((e) => e.alive && e.type === EntityType.Human);

  // Ensure newly arrived immigrants or newborn settlers from this tick are included
  if (newEntities && newEntities.length > 0) {
    const existingIds = new Set(allHumans.map((h) => h.id));
    for (let i = 0; i < newEntities.length; i++) {
      const e = newEntities[i];
      if (e.alive && e.type === EntityType.Human && !existingIds.has(e.id)) {
        allHumans.push(e);
      }
    }
  }

  const leader = import.meta.env?.DEV && world.villageLeaderId != null
    ? allHumans.find((entity) => entity.id === world.villageLeaderId)
    : undefined;
  let leaderResidence = leader?.residenceBuildingId;
  const checkLeader = (stage: string): void => {
    if (!leader) return;
    const next = leader.residenceBuildingId;
    if (leaderResidence === next) return;
    console.warn(
      `[leaderResidence] tick=${world.tick} leader=${leader.id} operation=${stage} residence ${String(leaderResidence)} -> ${String(next)}`,
    );
    leaderResidence = next;
  };

  const startedsyncResidenceOccupants = profileStart();
  syncResidenceOccupants(allHumans, updatedBuildings);
  profileEnd('assign.syncResidenceOccupants', startedsyncResidenceOccupants);
  checkLeader('syncResidenceOccupants');
  // The pulse owns one sweep bucket of the day's reassignment work; the homeless fill inside the
  // pass stays global, so nothing waits for its bucket to come round.
  const startedassignMissingResidences = profileStart();
  // The elected leader's household has a protected manor assignment. Generic housing
  // convergence can otherwise move the entire family to an ordinary house, only
  // for syncLeaderHouseResidency to undo it later in this same tick.
  // Keep everyone in allHumans for genealogy; only remove protected members
  // from the set of people eligible to be reassigned.
  const protectedIds = new Set(collectLeaderHousehold(world).map((person) => person.id));
  const eligibleForHousing = protectedIds.size === 0
    ? playerHumans
    : playerHumans.filter((person) => !protectedIds.has(person.id));
  assignMissingResidences(eligibleForHousing, updatedBuildings, allHumans, world.tick);
  profileEnd('assign.assignMissingResidences', startedassignMissingResidences);
  checkLeader('assignMissingResidences');
  // Housing sweeps run four times per day, after the daily leader-house repair.
  // Restore the leader's protected residence after each sweep, not a day later.
  const startedsyncLeaderHouseResidency = profileStart();
  syncLeaderHouseResidency(world);
  profileEnd('assign.syncLeaderHouseResidency', startedsyncLeaderHouseResidency);
  checkLeader('syncLeaderHouseResidency');
  const startedassignMissingWorkers = profileStart();
  assignMissingWorkers(playerHumans, updatedBuildings, world);
  profileEnd('assign.assignMissingWorkers', startedassignMissingWorkers);
  checkLeader('assignMissingWorkers');
}
