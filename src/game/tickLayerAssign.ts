import type { WorldState } from './gameTypes';
import { EntityType, BuildingType } from './gameTypes';
import { isResidenceBuilding } from './housingModel';
import { HUMAN_ADULT_MIN_AGE } from './daycycleconstants';
import { isPlayerHuman } from './playerHuman';
import type { TickContext } from './simulation/simulationTypes';
import { TICKS_PER_HOUR } from './dayCycle';
import { assignMissingResidences, syncResidenceOccupants } from './housingPipeline';
import { assignMissingWorkers } from './workforce';
import { applyLeaderHousePhase, collectLeaderHousehold, findLeaderHouse } from './leaderHouse';
import { profileStart, profileEnd } from './performanceProfiler';

/**
 * Assignment layer pulse interval — six clock hours (72 ticks at 12 ticks/hour), so housing + job fill
 * sweeps ~4× per calendar day.
 */
export const LAYER_ASSIGN_INTERVAL = 6 * TICKS_PER_HOUR;
/** First assignment sweep is at 03:00; subsequent sweeps recur every six hours. */
export const LAYER_ASSIGN_FIRST_HOUR = 3;
export const LAYER_ASSIGN_PHASE_TICK = LAYER_ASSIGN_FIRST_HOUR * TICKS_PER_HOUR;

/**
 * Cheap housing-change fingerprint for the scheduled sweeps: work and movement do not affect housing,
 * so a few primitives decide whether the full reconciliation runs. A weekly audit is the safety net.
 */
const lastHousingSignature = new WeakMap<WorldState, string>();
/** A change earlier in the day still gets its final commute sweep even after the change is reconciled. */
const housingChangedThisDay = new WeakMap<WorldState, boolean>();

function housingSignature(world: WorldState, humans: readonly WorldState['entities'][number][]): string {
  const parts: (number | string)[] = [];
  for (const building of world.buildings) {
    if (building.faction === 'rival') continue;
    if (!isResidenceBuilding(building) && building.type !== BuildingType.Road
      && building.type !== BuildingType.Bridge) continue;
    parts.push(building.id, building.type, building.completed ? 1 : 0, building.level,
      building.x, building.y);
  }
  for (const h of humans) {
    if (!h.alive || !isPlayerHuman(h)) continue;
    parts.push(h.id, h.residenceBuildingId ?? -1, h.partnerId ?? -1, h.motherId ?? -1,
      h.fatherId ?? -1, h.adoptiveMotherId ?? -1, h.adoptiveFatherId ?? -1,
      h.age >= HUMAN_ADULT_MIN_AGE ? 1 : 0, h.isJuvenile ? 1 : 0, h.prisonBuildingId ?? -1,
      h.workerBuildingId ?? -1, h.schoolBuildingId ?? -1);
  }
  return parts.join(',');
}

/**
 * Assignment layer — residence + workforce bookkeeping, called when
 * `world.tick % LAYER_ASSIGN_INTERVAL === 0`. Realtime interactions and daily mortality live elsewhere.
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
  // Only a standing manor protects the leader's household from reassignment. Without one they are
  // ordinary residents: the housing pass must count their beds and stay free to move them.
  const protectedIds = findLeaderHouse(world.buildings)
    ? new Set([
      ...collectLeaderHousehold(world).map((person) => person.id),
      ...(world.villageLeaderId == null ? world.pendingLeaderHouseResidentIds ?? [] : []),
    ])
    : new Set<number>();
  const eligibleForHousing = protectedIds.size === 0
    ? playerHumans
    : playerHumans.filter((person) => !protectedIds.has(person.id));
  const signatureBefore = housingSignature(world, allHumans);
  const housingChanged = lastHousingSignature.get(world) !== signatureBefore;
  if (housingChanged) housingChangedThisDay.set(world, true);
  const finalDailySweep = ((world.tick % (LAYER_ASSIGN_INTERVAL * 4)) + LAYER_ASSIGN_INTERVAL * 4)
    % (LAYER_ASSIGN_INTERVAL * 4) === LAYER_ASSIGN_PHASE_TICK + LAYER_ASSIGN_INTERVAL * 3;
  // A stable colony does not need the full guardianship/family/commute pipeline every day.
  // Revisit the final bucket after changes earlier today; keep a weekly defensive full sweep.
  const safetyAudit = finalDailySweep && Math.floor(world.tick / (LAYER_ASSIGN_INTERVAL * 4)) % 7 === 0;
  if (housingChanged || (finalDailySweep && housingChangedThisDay.get(world)) || safetyAudit) {
    // The manor hold is the sweep's first phase: one run, one ledger, one write path.
    assignMissingResidences(
      eligibleForHousing, updatedBuildings, allHumans, world.tick, world.genealogyRegistry,
      (ledger) => applyLeaderHousePhase(world, ledger),
    );
    lastHousingSignature.set(world, housingSignature(world, allHumans));
    if (finalDailySweep) housingChangedThisDay.set(world, false);
  }
  profileEnd('assign.assignMissingResidences', startedassignMissingResidences);
  checkLeader('assignMissingResidences');
  // Assigning or relocating residents changes residenceBuildingId after the opening occupant sync, so
  // rebuild the authoritative occupancy lists here, cursed Moon Howlers included.
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
