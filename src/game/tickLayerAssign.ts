import type { WorldState } from './gameTypes';
import { EntityType } from './gameTypes';
import { isResidenceBuilding } from './residencyOccupancy';
import { isPlayerHuman } from './playerHuman';
import { HUMAN_ADULT_MIN_AGE } from './daycycleconstants';
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
/** First assignment sweep is at 03:00; subsequent sweeps recur every six hours. */
export const LAYER_ASSIGN_FIRST_HOUR = 3;
export const LAYER_ASSIGN_PHASE_TICK = LAYER_ASSIGN_FIRST_HOUR * TICKS_PER_HOUR;

/**
 * Cheap housing-change fingerprint for the scheduled sweeps. Work and movement
 * do not affect housing, so checking a few primitive fields is much cheaper
 * than rebuilding all household units four times a day. A full reconciliation
 * still runs at the final sweep every day as a safety net.
 */
const lastHousingSignature = new WeakMap<WorldState, string>();

function housingSignature(world: WorldState, humans: readonly WorldState['entities'][number][]): string {
  const parts: (number | string)[] = [];
  for (const building of world.buildings) {
    if (building.faction === 'rival') continue;
    if (!isResidenceBuilding(building)) continue;
    parts.push(building.id, building.completed ? 1 : 0, building.level);
  }
  for (const h of humans) {
    if (!h.alive || !isPlayerHuman(h)) continue;
    parts.push(h.id, h.residenceBuildingId ?? -1, h.partnerId ?? -1, h.motherId ?? -1,
      h.fatherId ?? -1, h.adoptiveMotherId ?? -1, h.adoptiveFatherId ?? -1,
      h.age >= HUMAN_ADULT_MIN_AGE ? 1 : 0, h.isJuvenile ? 1 : 0, h.prisonBuildingId ?? -1);
  }
  return parts.join(',');
}

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
  const protectedIds = new Set([
    ...collectLeaderHousehold(world).map((person) => person.id),
    ...(world.villageLeaderId == null ? world.pendingLeaderHouseResidentIds ?? [] : []),
  ]);
  const eligibleForHousing = protectedIds.size === 0
    ? playerHumans
    : playerHumans.filter((person) => !protectedIds.has(person.id));
  const signatureBefore = housingSignature(world, allHumans);
  const finalDailySweep = ((world.tick % (LAYER_ASSIGN_INTERVAL * 4)) + LAYER_ASSIGN_INTERVAL * 4)
    % (LAYER_ASSIGN_INTERVAL * 4) === LAYER_ASSIGN_PHASE_TICK + LAYER_ASSIGN_INTERVAL * 3;
  if (finalDailySweep || lastHousingSignature.get(world) !== signatureBefore) {
    assignMissingResidences(eligibleForHousing, updatedBuildings, allHumans, world.tick);
    lastHousingSignature.set(world, housingSignature(world, allHumans));
  }
  profileEnd('assign.assignMissingResidences', startedassignMissingResidences);
  checkLeader('assignMissingResidences');
  // Housing sweeps run four times per day, after the daily leader-house repair.
  // Restore the leader's protected residence after each sweep, not a day later.
  const startedsyncLeaderHouseResidency = profileStart();
  syncLeaderHouseResidency(world);
  profileEnd('assign.syncLeaderHouseResidency', startedsyncLeaderHouseResidency);
  checkLeader('syncLeaderHouseResidency');
  // Assigning or relocating residents changes residenceBuildingId after the opening
  // occupant sync. Rebuild the authoritative occupancy lists once more at the end
  // of the housing pass so snapshots and invariants cannot see stale beds.
  // Include cursed Moon Howlers, whose human residence survives their temporary form.
  const residentEntities = [
    ...allHumans,
    ...(byType[EntityType.Werewolf] ?? []).filter((entity) => entity.alive && entity.moonHowlerCursed),
  ];
  const finalOccupancySync = profileStart();
  syncResidenceOccupants(residentEntities, updatedBuildings);
  profileEnd('assign.syncResidenceOccupantsFinal', finalOccupancySync);
  const startedassignMissingWorkers = profileStart();
  assignMissingWorkers(playerHumans, updatedBuildings, world);
  profileEnd('assign.assignMissingWorkers', startedassignMissingWorkers);
  checkLeader('assignMissingWorkers');
}
