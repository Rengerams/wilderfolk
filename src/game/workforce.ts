import type { Building, Entity, WorldState } from './gameTypes';
import {
  BuildingType,
  EntityType,
  BUILDING_CONFIGS,
  BUILDING_JOB_TYPES,
  JobType,
  LEADER_OCCUPATION,
} from './gameTypes';
import { getOccupationForBuilding, ensureEntitySkills, readSkill } from './skills';
import { SPECIES_CONFIG } from './speciesConfig';
import { isWithinAssignableCommute } from './commuteReach';
import { isPlayerHuman } from './playerHuman';
import { humanDisplayName } from './citizenId';
import { assignMissingResidences, restoreCustodyAfterRelease } from './residencyReconciliation';
import { hasWorkAssignment, isImprisoned, isResidenceBuildingType } from './residencyOccupancy';
import { prisonGuardCapacity } from './prisonShifts';
import { logEvent } from './eventLog';
import { addFloatingText, addNotification } from './simEffects';
import { TICKS_PER_DAY } from './dayCycleClock';
import { profileStart, profileEnd } from './performanceProfiler';
import {
  DEFAULT_WORKFORCE_POLICY,
  getWorkforcePolicy,
  jobBuildingPriorityForPolicy,
  type WorkforcePolicy,
} from './workforcePolicy';

/**
 * A settler's display name for these log lines.
 *
 * Delegates to `citizenId.humanDisplayName`, which already owns this exact format (given name, then
 * surname, then title). This was a private copy with its own `'Settler'` fallback while
 * `villageLeadership` carried a second copy falling back to `'Unknown'`, so the same nameless settler
 * was "Settler" in a workforce log and "Unknown" in an election notice while the owner said
 * "A settler" (`tests/settlerNameFallback.singleOwner.test.ts`).
 */
function formatSettlerName(entity: Entity): string {
  return humanDisplayName(entity);
}

/** The one membership rule: is this settler on any unfinished building's crew? One building may be ignored. */
export function isOnConstructionCrew(
  buildings: readonly Building[],
  humanId: number,
  exceptBuildingId?: number,
): boolean {
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    if (!b.completed && b.id !== exceptBuildingId && b.occupants.includes(humanId)) {
      return true;
    }
  }
  return false;
}

/** Only an explicit `manual` keeps the player's own crew out of the auto pass. */
export function isManualStaffingBuilding(building: Pick<Building, 'staffingMode'>): boolean {
  return building.staffingMode === 'manual';
}

/**
 * Auto-staff rank of a job building. The ordering table itself lives in the policy owner
 * (`workforcePolicy.PRESET_BUILDING_ORDER`); this is the workforce side of the seam and
 * defaults to the colony default preset, which reproduces the historical order.
 */
export function jobBuildingPriority(
  type: BuildingType,
  policy: WorkforcePolicy = DEFAULT_WORKFORCE_POLICY,
): number {
  return jobBuildingPriorityForPolicy(policy, type);
}

export function countWorkersAtBuilding(humans: Entity[], buildingId: number): number {
  let count = 0;
  for (let i = 0; i < humans.length; i++) {
    const h = humans[i];
    if (h.alive && isPlayerHuman(h) && h.workerBuildingId === buildingId) {
      count++;
    }
  }
  return count;
}

/**
 * The staffing cap of a completed workplace, and how much of it is taken.
 *
 * A Prison's `occupants` is guards ∪ prisoners, so measuring that list against its cap would let a
 * prisoner consume a guard post and a guard consume a cell. The split is five posts beside four cells,
 * so the posts are counted on their own: `workerBuildingId` is a guard's post and an arrest clears it,
 * which is the distinction `countWorkersAtBuilding` already draws.
 */
export function staffingCapFor(building: Building, humans: Entity[]): { cap: number; staffed: number } {
  const configured = BUILDING_CONFIGS[building.type].maxOccupants;
  if (building.type === BuildingType.Prison) {
    return { cap: prisonGuardCapacity(configured), staffed: countWorkersAtBuilding(humans, building.id) };
  }
  return { cap: configured, staffed: Math.max(building.occupants.length, countWorkersAtBuilding(humans, building.id)) };
}

export function countStaffedWorkersAtType(buildings: Building[], humans: Entity[], type: BuildingType): number {
  let total = 0;
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    if (b.completed && b.type === type && b.faction !== 'rival') {
      total += countWorkersAtBuilding(humans, b.id);
    }
  }
  return total;
}

/**
 * A staffed Blacksmith's boost per worker and the ceiling it runs into.
 *
 * Exported because the inspector's Blacksmith hint promised "+25% per worker" with no ceiling, while
 * this function stops at ×1.5 (+50%): three smiths read +75% in the panel and +50% in the economy
 */
export const SMITH_BONUS_PER_WORKER = 0.25;
export const SMITH_BONUS_CAP = 1.5;

export function getSmithBonus(buildings: Building[], humans: Entity[]): number {
  const workers = countStaffedWorkersAtType(buildings, humans.filter((human) => !isImprisoned(human)), BuildingType.Blacksmith);
  if (workers <= 0) return 1.0;
  return Math.min(SMITH_BONUS_CAP, 1 + workers * SMITH_BONUS_PER_WORKER);
}

export function getChurchStrength(buildings: Building[], humans: Entity[]): number {
  const hasChurch = buildings.some(
    (b) => b.completed && b.type === BuildingType.Church && b.faction !== 'rival',
  );
  if (!hasChurch) return 0;
  const workers = countStaffedWorkersAtType(buildings, humans, BuildingType.Church);
  return workers > 0 ? 1 : 0.5;
}

export function hasStaffedSchool(buildings: Building[]): boolean {
  return buildings.some(
    (b) =>
      b.completed &&
      b.type === BuildingType.School &&
      b.faction !== 'rival' &&
      b.occupants.length > 0,
  );
}

/**
 * Completed player job buildings, ordered by the current workforce preset.
 *
 * This order is exactly the order `staffJobBuildings` serves open slots in, so it is the
 * single place a preset changes which building receives the next idle worker.
 */
export function completedJobBuildings(
  buildings: Building[],
  policy: WorkforcePolicy = DEFAULT_WORKFORCE_POLICY,
): Building[] {
  return buildings
    .filter((b) => {
      if (!b.completed || b.faction === 'rival' || !BUILDING_JOB_TYPES[b.type]) return false;
      return BUILDING_CONFIGS[b.type].maxOccupants > 0;
    })
    .sort((a, b) => {
      const prio = jobBuildingPriority(a.type, policy) - jobBuildingPriority(b.type, policy);
      if (prio !== 0) return prio;
      return a.id - b.id;
    });
}

/** Two 30-day in-game months. Existing saves with no timestamp stay eligible. */
export const AUTO_JOB_TRANSFER_COOLDOWN_TICKS = 60 * TICKS_PER_DAY;

export function canAutoChangeWorkplace(human: Entity, currentTick?: number): boolean {
  // A prisoner's post is reserved, not vacant: no automatic transfer may move it while they serve.
  if (isImprisoned(human)) return false;
  if (currentTick == null || human.lastAutoJobTransferTick == null) return true;
  return currentTick - human.lastAutoJobTransferTick >= AUTO_JOB_TRANSFER_COOLDOWN_TICKS;
}

interface WorkforceAssignmentIndex {
  counts: Map<number, number>;
  movable: Map<number, number>;
}

function buildWorkforceAssignmentIndex(humans: Entity[], currentTick?: number): WorkforceAssignmentIndex {
  const counts = new Map<number, number>();
  const movable = new Map<number, number>();
  for (const human of humans) {
    if (!human.alive || !isPlayerHuman(human)) continue;
    const id = human.workerBuildingId;
    if (id == null) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
    if (!human.isJuvenile && canAutoChangeWorkplace(human, currentTick)) {
      movable.set(id, (movable.get(id) ?? 0) + 1);
    }
  }
  return { counts, movable };
}

/** Keep essential production and guard coverage when automatically borrowing staff. */
function minimumAutoCoverage(building: Building): number {
  const critical = building.type === BuildingType.Quarry
    || building.type === BuildingType.Barracks || building.type === BuildingType.Prison;
  return critical ? Math.min(3, BUILDING_CONFIGS[building.type].maxOccupants) : 1;
}

function pickOverstaffedDonor(
  jobBuildings: Building[],
  index: WorkforceAssignmentIndex,
  excludeBuildingId: number,
  preserveEssentialCoverage = false,
): Building | undefined {
  let best: Building | undefined;
  let smallestCount = Infinity;
  for (const building of jobBuildings) {
    if (building.id === excludeBuildingId || isManualStaffingBuilding(building)) continue;
    const count = index.counts.get(building.id) ?? 0;
    const keep = preserveEssentialCoverage ? minimumAutoCoverage(building) : 1;
    if (count <= keep || (index.movable.get(building.id) ?? 0) === 0) continue;
    if (count < smallestCount) {
      best = building;
      smallestCount = count;
    }
  }
  return best;
}

export function findOverstaffedDonorBuilding(
  jobBuildings: Building[],
  humans: Entity[],
  excludeBuildingId: number,
  currentTick?: number,
): Building | undefined {
  return pickOverstaffedDonor(jobBuildings, buildWorkforceAssignmentIndex(humans, currentTick), excludeBuildingId);
}

export function pickWorkerToTransfer(
  humans: Entity[],
  fromBuilding: Building,
  toBuilding: Building,
  currentTick?: number,
): Entity | undefined {
  const toJob = BUILDING_JOB_TYPES[toBuilding.type];
  const fromJob = BUILDING_JOB_TYPES[fromBuilding.type];
  if (!toJob || !fromJob) return undefined;

  const workers = humans.filter(
    (h) =>
      isPlayerHuman(h) &&
      h.alive &&
      !h.isJuvenile &&
      h.workerBuildingId === fromBuilding.id &&
      canAutoChangeWorkplace(h, currentTick),
  );
  if (workers.length === 0) return undefined;

  const toX = toBuilding.x + toBuilding.width / 2;
  const toY = toBuilding.y + toBuilding.height / 2;

  workers.sort((a, b) => {
    const aFit = readSkill(a, toJob) - readSkill(a, fromJob);
    const bFit = readSkill(b, toJob) - readSkill(b, fromJob);
    if (bFit !== aFit) return bFit - aFit;

    const dxa = a.x - toX;
    const dya = a.y - toY;
    const dxb = b.x - toX;
    const dyb = b.y - toY;
    return dxa * dxa + dya * dya - (dxb * dxb + dyb * dyb);
  });

  return workers[0];
}

// ============ AUTHORITATIVE WORKFORCE MUTATIONS ============

/**
 * Named assignment transition — assign ONE living adult settler to a completed workplace.
 * Single write path for `workerBuildingId`, workplace `occupants`, and `job`/`occupation` properties.
 */
export function assignWorkerTransition(human: Entity, building: Building, currentTick?: number): boolean {
  const job = BUILDING_JOB_TYPES[building.type];
  if (!job || !building.completed || building.faction === 'rival') return false;
  if (!human.alive || !isPlayerHuman(human) || human.isJuvenile) return false;
  if (human.prisonBuildingId != null) return false;
  if (human.workerBuildingId != null && human.workerBuildingId !== building.id) return false;
  const alreadyListed = building.occupants.includes(human.id);
  // A stale roster entry is not a completed assignment: repair the worker
  // pointer and job fields instead of returning with an invariant violation.
  if (alreadyListed && human.workerBuildingId === building.id) return true;

  const keepOffice = human.occupation === LEADER_OCCUPATION;
  if (!alreadyListed) building.occupants.push(human.id);
  human.workerBuildingId = building.id;
  if (currentTick != null) human.lastAutoJobTransferTick = currentTick;
  human.occupation = keepOffice ? LEADER_OCCUPATION : getOccupationForBuilding(building.type);
  human.job = job;
  ensureEntitySkills(human)[job] = readSkill(human, job);
  return true;
}

/**
 * The one door for a settler leaving work: the pointer, the roster entry it pointed at and the job
 * labels. A leader keeps the office title, which is an office rather than a post.
 */
export function clearWorkerAssignment(human: Entity, buildings?: readonly Building[]): void {
  if (buildings && human.workerBuildingId != null) {
    const workplace = buildings.find((building) => building.id === human.workerBuildingId);
    if (workplace) workplace.occupants = workplace.occupants.filter((id) => id !== human.id);
  }
  human.workerBuildingId = undefined;
  human.occupation = human.occupation === LEADER_OCCUPATION ? LEADER_OCCUPATION : 'settler';
  human.job = JobType.Settler;
}

/**
 * A sentence reserves a worker's post but excludes them from a normal workplace's
 * active occupants. When custody ends, restore the reserved roster atomically;
 * waiting for the next workforce pulse breaks the worker/occupants invariant.
 * This is idempotent for prison guards (where the same prison holds both roles).
 */
export function restoreWorkerRosterAfterCustody(human: Entity, buildings: readonly Building[]): void {
  if (!human.alive || !isPlayerHuman(human) || human.prisonBuildingId != null) return;
  const workplaceId = human.workerBuildingId;
  if (workplaceId == null) return;
  const workplace = buildings.find((building) => building.id === workplaceId);
  if (!workplace || !workplace.completed || workplace.faction === 'rival' ||
      BUILDING_JOB_TYPES[workplace.type] == null) return;
  // Custody restoration must also retire stale prison and construction memberships.
  for (const building of buildings) {
    if (building.id === workplaceId || !building.occupants.includes(human.id)) continue;
    if (!building.completed || building.type === BuildingType.Prison) {
      building.occupants = building.occupants.filter((id) => id !== human.id);
    }
  }
  if (!workplace.occupants.includes(human.id)) workplace.occupants.push(human.id);
}

/** Drops the workplace pointer alone; the moon forms keep their saved trade and re-attach it. */
export function detachWorkplaceReference(human: Entity): void {
  human.workerBuildingId = undefined;
}

/** Named removal transition — release a settler from all workplaces/crews and clear the job fields. */
export function removeWorkerTransition(human: Entity, buildings: Building[]): void {
  for (let i = 0; i < buildings.length; i++) {
    const building = buildings[i];
    if (building.completed && !BUILDING_JOB_TYPES[building.type]) continue;
    if (building.occupants.includes(human.id)) {
      building.occupants = building.occupants.filter((id) => id !== human.id);
    }
  }
  clearWorkerAssignment(human);
}

/**
 * Adds an idle settler to an incomplete building's construction crew.
 */
export function addToConstructionCrew(human: Entity, building: Building): boolean {
  if (building.completed || building.faction === 'rival') return false;
  if (!human.alive || !isPlayerHuman(human) || human.isJuvenile) return false;
  if (human.prisonBuildingId != null) return false;
  if (human.workerBuildingId != null) return false; // Must be unassigned from regular jobs first
  if (building.occupants.includes(human.id)) return true;
  building.occupants.push(human.id);
  return true;
}

/**
 * Reassign transition — moves a worker between two completed workplaces while preserving civic titles.
 */
export function transferWorkerBetweenBuildings(
  worker: Entity,
  fromBuilding: Building,
  toBuilding: Building,
  currentTick?: number,
): void {
  const job = BUILDING_JOB_TYPES[toBuilding.type];
  if (!job) return;

  fromBuilding.occupants = fromBuilding.occupants.filter((id) => id !== worker.id);
  if (!toBuilding.occupants.includes(worker.id)) {
    toBuilding.occupants.push(worker.id);
  }

  const keepOffice = worker.occupation === LEADER_OCCUPATION;
  worker.workerBuildingId = toBuilding.id;
  if (currentTick != null) worker.lastAutoJobTransferTick = currentTick;
  worker.occupation = keepOffice ? LEADER_OCCUPATION : getOccupationForBuilding(toBuilding.type);
  worker.job = job;
  ensureEntitySkills(worker)[job] = readSkill(worker, job);
}

export function rebalanceJobWorkers(
  humans: Entity[],
  buildings: Building[],
  policy: WorkforcePolicy = DEFAULT_WORKFORCE_POLICY,
  currentTick?: number,
): void {
  const jobBuildings = completedJobBuildings(buildings, policy);
  const index = buildWorkforceAssignmentIndex(humans, currentTick);

  // Fill empty posts once; established workers keep their job when it already has coverage.
  for (let i = 0; i < jobBuildings.length; i++) {
      const needy = jobBuildings[i];
      if (isManualStaffingBuilding(needy)) continue;
      if (BUILDING_CONFIGS[needy.type].maxOccupants <= 0) continue;
      const staffed = index.counts.get(needy.id) ?? 0;
      const capacity = staffingCapFor(needy, humans).cap;
      if (staffed >= capacity) continue;
      // Essential stone and guard coverage can grow to three posts; others only start.
      if (staffed >= minimumAutoCoverage(needy)) continue;

      const donor = pickOverstaffedDonor(jobBuildings, index, needy.id, true);
      if (!donor) continue;

      const worker = pickWorkerToTransfer(humans, donor, needy, currentTick);
      if (!worker) continue;

      transferWorkerBetweenBuildings(worker, donor, needy, currentTick);
      index.counts.set(donor.id, (index.counts.get(donor.id) ?? 0) - 1);
      index.counts.set(needy.id, staffed + 1);
      index.movable.set(donor.id, (index.movable.get(donor.id) ?? 0) - 1);
      if (canAutoChangeWorkplace(worker, currentTick)) {
        index.movable.set(needy.id, (index.movable.get(needy.id) ?? 0) + 1);
      }
  }
}

export function syncJobBuildingOccupants(humans: Entity[], buildings: Building[]): void {
  // Two bucketing passes replace a full settler-list filter per building — the single-pass
  // shape `residencyReconciliation.syncResidenceOccupants` documents). The building loop below
  // writes only `building.occupants`; it reads `h.alive`, `isPlayerHuman(h)`, `h.workerBuildingId`
  // and `h.prisonBuildingId`, none of which is written inside it, so one pass per predicate answers
  // every building. Each bucket preserves the `humans` order the previous `.filter().map()` emitted:
  // a settler is appended during its own iteration, in visit order.
  const pushId = (index: Map<number, number[]>, key: number, id: number): void => {
    const bucket = index.get(key);
    if (bucket) bucket.push(id);
    else index.set(key, [id]);
  };
  /** Jobs: `workerBuildingId === id && prisonBuildingId == null`. */
  const jobOccupantIds = new Map<number, number[]>();
  /** Prison: `workerBuildingId === id || prisonBuildingId === id` (the original union, deduped). */
  const prisonOccupantIds = new Map<number, number[]>();
  for (const h of humans) {
    if (!h.alive) continue;
    if (!isPlayerHuman(h)) {
      if (h.warCaptive && h.prisonBuildingId != null) pushId(prisonOccupantIds, h.prisonBuildingId, h.id);
      continue;
    }
    const homeId = h.workerBuildingId;
    const prisonId = h.prisonBuildingId;
    if (homeId != null) {
      if (prisonId == null) pushId(jobOccupantIds, homeId, h.id);
      pushId(prisonOccupantIds, homeId, h.id);
    }
    // A settler whose home *is* the prison was already added by the branch above.
    if (prisonId != null && prisonId !== homeId) pushId(prisonOccupantIds, prisonId, h.id);
  }

  for (let i = 0; i < buildings.length; i++) {
    const building = buildings[i];
    if (!building.completed || building.faction === 'rival' || !BUILDING_JOB_TYPES[building.type]) {
      continue;
    }

    if (building.type === BuildingType.Prison) {
      building.occupants = prisonOccupantIds.get(building.id) ?? [];
      continue;
    }

    building.occupants = jobOccupantIds.get(building.id) ?? [];
  }
}

export function assignWorkerInPlace(
  building: Building,
  humans: Entity[],
  buildings: Building[],
  venueSchedules?: Pick<WorldState, 'tavernSchedule' | 'hotelSchedule'> & Partial<Pick<WorldState, 'tick'>>,
  constructionWorkerIds?: Set<number>,
): boolean {
  const job = BUILDING_JOB_TYPES[building.type];
  if (!job || !building.completed || building.faction === 'rival') return false;

  // Auto means fill all available staff positions, including Taverns and Hotels.
  // Opening-hour-based minimum shift coverage is not a staffing limit: leaving
  // vacancies while eligible settlers are idle contradicts the Auto setting.
  const cap = staffingCapFor(building, humans).cap;

  if (countWorkersAtBuilding(humans, building.id) >= cap) return false;

  // Select the best candidate in one pass. Sorting every idle settler for every
  // vacant slot repeated expensive commute checks O(N log N) times.
  const buildingX = building.x + building.width / 2;
  const buildingY = building.y + building.height / 2;
  let worker: Entity | undefined;
  let bestNear = false;
  let bestDistance = Infinity;
  let bestSkill = -Infinity;
  const crewIds = constructionWorkerIds ?? new Set<number>();
  if (!constructionWorkerIds) {
    for (const site of buildings) {
      if (!site.completed) for (const id of site.occupants) crewIds.add(id);
    }
  }
  for (const candidate of humans) {
    if (!isPlayerHuman(candidate) || !candidate.alive || candidate.isJuvenile
      || hasWorkAssignment(candidate) || isImprisoned(candidate)
      || crewIds.has(candidate.id)) continue;
    const near = isWithinAssignableCommute(candidate, building, buildings, SPECIES_CONFIG[EntityType.Human].speed);
    const dx = candidate.x - buildingX;
    const dy = candidate.y - buildingY;
    const distance = dx * dx + dy * dy;
    const skill = readSkill(candidate, job);
    if (worker && (
      (bestNear && !near)
      || (bestNear === near && (distance > bestDistance || (distance === bestDistance && skill <= bestSkill)))
    )) continue;
    worker = candidate;
    bestNear = near;
    bestDistance = distance;
    bestSkill = skill;
  }
  if (!worker) return false;

  return assignWorkerTransition(worker, building, venueSchedules?.tick);
}

function clearJobAssignment(human: Entity, buildings: Building[]): void {
  removeWorkerTransition(human, buildings);
}

export function assignBuilderInPlace(
  building: Building,
  humans: Entity[],
  allBuildings: Building[],
  policy: WorkforcePolicy = DEFAULT_WORKFORCE_POLICY,
  currentTick?: number,
  constructionWorkerIds?: Set<number>,
  buildingById?: ReadonlyMap<number, Building>,
  allowJobTransfers = true,
): boolean {
  if (building.completed || building.faction === 'rival') return false;

  const cap = BUILDING_CONFIGS[building.type].maxOccupants;
  if (building.occupants.length >= cap) return false;

  const freeBuilder = humans.find(
    (h) =>
      isPlayerHuman(h) &&
      h.alive &&
      !h.isJuvenile &&
      !hasWorkAssignment(h) &&
      !isImprisoned(h) &&
      !building.occupants.includes(h.id) &&
      (constructionWorkerIds
        ? !constructionWorkerIds.has(h.id)
        : !allBuildings.some((b) => !b.completed && b.id !== building.id && b.occupants.includes(h.id))),
  );

  if (freeBuilder) {
    building.occupants.push(freeBuilder.id);
    constructionWorkerIds?.add(freeBuilder.id);
    return true;
  }

  // Borrow from an established workplace only when starting an empty site.
  if (!allowJobTransfers) return false;
  const jobHolder = humans
    .filter(
      (h) =>
        isPlayerHuman(h) &&
        h.alive &&
        !h.isJuvenile &&
        hasWorkAssignment(h) &&
        canAutoChangeWorkplace(h, currentTick) &&
        !isImprisoned(h) &&
        !building.occupants.includes(h.id) &&
        !(constructionWorkerIds
          ? constructionWorkerIds.has(h.id)
          : isOnConstructionCrew(allBuildings, h.id)),
    )
    .sort((a, b) => {
      const aPri = jobBuildingPriority(
        (buildingById?.get(a.workerBuildingId!) ?? allBuildings.find((x) => x.id === a.workerBuildingId))?.type ?? BuildingType.Farm,
        policy,
      );
      const bPri = jobBuildingPriority(
        (buildingById?.get(b.workerBuildingId!) ?? allBuildings.find((x) => x.id === b.workerBuildingId))?.type ?? BuildingType.Farm,
        policy,
      );
      return bPri - aPri;
    })
    .find((h) => {
      const site = (buildingById?.get(h.workerBuildingId!) ?? allBuildings.find((b) => b.id === h.workerBuildingId));
      if (!site || !site.completed || isManualStaffingBuilding(site)) return false;
      const staffed = countWorkersAtBuilding(humans, site.id);
      // Construction must not strip the last producer or the protected guard/stone crew.
      // This is the same donor-coverage invariant that job rebalancing applies.
      return staffed > minimumAutoCoverage(site);
    });

  if (!jobHolder) return false;
  clearJobAssignment(jobHolder, allBuildings);
  if (currentTick != null) jobHolder.lastAutoJobTransferTick = currentTick;
  building.occupants.push(jobHolder.id);
  constructionWorkerIds?.add(jobHolder.id);
  return true;
}

export function prepareWorkforce(humans: Entity[], buildings: Building[]): Entity[] {
  const alive = humans.filter((h) => h.alive && isPlayerHuman(h));
  const buildingById = new Map<number, Building>();
  for (let i = 0; i < buildings.length; i++) {
    buildingById.set(buildings[i].id, buildings[i]);
  }

  for (let i = 0; i < alive.length; i++) {
    const human = alive[i];

    if (human.occupation === LEADER_OCCUPATION) {
      if (human.workerBuildingId != null) {
        const workplace = buildingById.get(human.workerBuildingId);
        if (
          !workplace ||
          !workplace.completed ||
          workplace.faction === 'rival' ||
          !BUILDING_JOB_TYPES[workplace.type]
        ) {
          if (workplace) {
            workplace.occupants = workplace.occupants.filter((id) => id !== human.id);
          }
          clearWorkerAssignment(human);
        }
      }
      continue;
    }

    // The single crew-normalization pass below removes jailed builders.
    if (isImprisoned(human)) continue;
    // The explicit null test narrows the id for the lookup below; `hasWorkAssignment` does not.
    if (!hasWorkAssignment(human) || human.workerBuildingId == null) continue;
    const workplace = buildingById.get(human.workerBuildingId);
    if (
      !workplace ||
      !workplace.completed ||
      workplace.faction === 'rival' ||
      !BUILDING_JOB_TYPES[workplace.type]
    ) {
      clearWorkerAssignment(human);
    }
  }

  // Keep incomplete crews limited to unique living, idle, unjailed settlers.
  const eligibleBuilders = new Set(
    alive.filter((human) => !human.isJuvenile && !isImprisoned(human) && !hasWorkAssignment(human))
      .map((human) => human.id),
  );
  const rosteredBuilders = new Set<number>();
  for (const site of buildings) {
    if (site.completed || site.occupants.length === 0) continue;
    const cleaned = site.occupants.filter((id) => {
      if (!eligibleBuilders.has(id) || rosteredBuilders.has(id)) return false;
      rosteredBuilders.add(id);
      return true;
    });
    if (cleaned.length !== site.occupants.length) site.occupants = cleaned;
  }

  syncJobBuildingOccupants(alive, buildings);
  // Repair old saves affected by zero-capacity construction crew transfers.
  // Only completed, non-residential buildings with no job may be cleared;
  // residence and prison occupants have separate owners.
  for (const building of buildings) {
    if (building.completed && !BUILDING_JOB_TYPES[building.type]
      && !isResidenceBuildingType(building.type) && building.occupants.length > 0) {
      building.occupants = [];
    }
  }
  return alive;
}

export function staffConstructionCrews(
  alive: Entity[],
  buildings: Building[],
  policy: WorkforcePolicy = DEFAULT_WORKFORCE_POLICY,
  currentTick?: number,
): void {
  const incomplete = buildings
    // Passive zero-capacity sites (Wildlife Preserve, roads, decor) cannot hold
    // builders. In particular, the donor rebalance below bypasses the normal
    // assignBuilderInPlace capacity check and used to put a worker here anyway.
    .filter((b) => !b.completed && b.faction !== 'rival' && BUILDING_CONFIGS[b.type].maxOccupants > 0)
    .sort((a, b) => {
      const aHouse = isResidenceBuildingType(a.type) ? 0 : 1;
      const bHouse = isResidenceBuildingType(b.type) ? 0 : 1;
      if (aHouse !== bHouse) return aHouse - bHouse;
      return a.id - b.id;
    });

  const constructionWorkerIds = new Set<number>();
  const buildingById = new Map<number, Building>();
  for (const site of buildings) {
    buildingById.set(site.id, site);
    if (!site.completed) for (const id of site.occupants) constructionWorkerIds.add(id);
  }

  // Fill empty sites from unemployed builders before disturbing established jobs.
  for (const site of incomplete) {
    if (site.occupants.length === 0) {
      assignBuilderInPlace(site, alive, buildings, policy, currentTick, constructionWorkerIds, buildingById, false);
    }
  }

  // Share existing crews before considering a transfer out of a workplace.
  for (const needy of incomplete) {
    if (needy.occupants.length > 0) continue;
    const donor = incomplete.find((b) => b.id !== needy.id && b.occupants.length > 1);
    if (!donor) break;
    const moved = donor.occupants.pop();
    if (moved != null) needy.occupants.push(moved);
  }

  // At most one established worker is borrowed to start each still-empty project.
  for (const site of incomplete) {
    if (site.occupants.length === 0) {
      assignBuilderInPlace(site, alive, buildings, policy, currentTick, constructionWorkerIds, buildingById);
    }
  }

  // Extra construction places never trigger another workplace transfer.
  for (const site of incomplete) {
    while (assignBuilderInPlace(site, alive, buildings, policy, currentTick, constructionWorkerIds, buildingById, false)) {
      // Fill crew capacity with unemployed settlers only.
    }
  }
}

export function staffJobBuildings(
  alive: Entity[],
  buildings: Building[],
  includeManualStaff: boolean,
  worldSlices?: Pick<WorldState, 'tavernSchedule' | 'hotelSchedule'> & Partial<Pick<WorldState, 'tick'>>,
  policy: WorkforcePolicy = DEFAULT_WORKFORCE_POLICY,
): void {
  const jobBuildings = completedJobBuildings(buildings, policy);
  const constructionWorkerIds = new Set<number>();
  for (const site of buildings) {
    if (!site.completed) for (const id of site.occupants) constructionWorkerIds.add(id);
  }

  for (let i = 0; i < jobBuildings.length; i++) {
    const building = jobBuildings[i];
    if (!includeManualStaff && isManualStaffingBuilding(building)) continue;
    while (assignWorkerInPlace(building, alive, buildings, worldSlices, constructionWorkerIds)) {
      // Fill job slots
    }
  }

  if (!includeManualStaff) {
    rebalanceJobWorkers(alive, buildings, policy, worldSlices?.tick);
  }
  syncJobBuildingOccupants(alive, buildings);
}

/**
 * The one automatic staffing pass. `worldSlices` supplies the venue auto-staff targets and the
 * colony's `workforcePolicy`; a caller holding a `WorldState` gets the player's preset for free.
 */
export function assignMissingWorkers(
  humans: Entity[],
  buildings: Building[],
  worldSlices?: Pick<
    WorldState,
    'tavernSchedule' | 'hotelSchedule' | 'workforcePolicy'
  > & Partial<Pick<WorldState, 'tick'>>,
): void {
  const prepStart = profileStart();
  const alive = prepareWorkforce(humans, buildings);
  profileEnd('workforce.prepare', prepStart);
  const policy = getWorkforcePolicy(worldSlices ?? {});
  const constructionStart = profileStart();
  staffConstructionCrews(alive, buildings, policy, worldSlices?.tick);
  profileEnd('workforce.construction', constructionStart);
  const jobsStart = profileStart();
  staffJobBuildings(alive, buildings, false, worldSlices, policy);
  profileEnd('workforce.jobs', jobsStart);
}

export function countWorkingAndIdleSettlers(
  humans: Entity[],
  buildings: Building[],
): { working: number; idle: number } {
  const constructionWorkers = new Set<number>();
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    if (!b.completed) {
      for (let j = 0; j < b.occupants.length; j++) {
        constructionWorkers.add(b.occupants[j]);
      }
    }
  }

  let working = 0;
  let idle = 0;

  for (let i = 0; i < humans.length; i++) {
    const e = humans[i];
    if (!e.alive || !isPlayerHuman(e) || e.isJuvenile) continue;
    if (isImprisoned(e)) continue;

    if (hasWorkAssignment(e) || constructionWorkers.has(e.id)) {
      working++;
    } else {
      idle++;
    }
  }

  return { working, idle };
}

export function findHumanWorkplace(
  entity: Entity,
  buildings: Building[],
  opts?: {
    buildingById?: ReadonlyMap<number, Building>;
    constructionByWorkerId?: ReadonlyMap<number, Building>;
  },
): Building | undefined {
  const byId = opts?.buildingById;
  if (hasWorkAssignment(entity) && entity.workerBuildingId != null) {
    const jobSite = byId?.get(entity.workerBuildingId) ?? buildings.find((b) => b.id === entity.workerBuildingId);
    if (jobSite?.completed && jobSite.faction !== 'rival' && BUILDING_JOB_TYPES[jobSite.type]) {
      return jobSite;
    }
  }

  const construction = opts?.constructionByWorkerId?.get(entity.id);
  if (construction && !construction.completed) return construction;
  if (opts?.constructionByWorkerId) return undefined;

  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    if (!b.completed && b.occupants.includes(entity.id)) {
      return b;
    }
  }

  return undefined;
}

export function buildConstructionCrewIndex(buildings: readonly Building[]): Map<number, Building> {
  const map = new Map<number, Building>();
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    if (b.completed || b.faction === 'rival' || b.occupants.length === 0) continue;
    for (let j = 0; j < b.occupants.length; j++) {
      const id = b.occupants[j];
      if (!map.has(id)) map.set(id, b);
    }
  }
  return map;
}

export function releasePrisoners(state: WorldState): void {
  const releasedSettlers: Entity[] = [];

  for (let i = 0; i < state.entities.length; i++) {
    const entity = state.entities[i];
    if (!entity.alive || entity.type !== EntityType.Human) continue;
    if (entity.prisonBuildingId == null || entity.prisonerUntilTick == null) continue;
    if (state.tick < entity.prisonerUntilTick) continue;

    const prison = state.buildings.find((b) => b.id === entity.prisonBuildingId);
    if (prison && entity.workerBuildingId !== prison.id) {
      prison.occupants = prison.occupants.filter((id) => id !== entity.id);
    }

    entity.prisonBuildingId = undefined;
    entity.prisonerUntilTick = undefined;
    entity.prisonSentenceCrime = undefined;
    restoreWorkerRosterAfterCustody(entity, state.buildings);
    entity.flash = 8;

    if (entity.id === state.villageLeaderId) {
      entity.occupation = LEADER_OCCUPATION;
    }

    const name = formatSettlerName(entity);
    // `'prison'`, not `'event'`: the release belongs with the jailing it ends, under the same filter.
    logEvent(state, 'prison', `${name} was released from prison`, name);
    addNotification(state, 'Released', `${name} served their sentence and is free again`, 'success');
    addFloatingText(state, entity.x, entity.y - 18, 'Released', '#22c55e');
    if (isPlayerHuman(entity)) releasedSettlers.push(entity);
  }

  if (releasedSettlers.length > 0) {
    // Only the released settlers, never the whole-village convergence: that pass can move the
    // elected leader out of the protected manor. A held bed normally needs nothing here.
    const homecoming = releasedSettlers.flatMap((parent) =>
      restoreCustodyAfterRelease(parent, state.entities));
    assignMissingResidences([...releasedSettlers, ...homecoming], state.buildings, state.entities, state.tick);
    // Normal workforce pulses will fill newly available staff slots.
  }
}