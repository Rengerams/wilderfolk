import type { Building, Entity, WorldState } from './gameTypes';
import {
  BuildingType,
  EntityType,
  BUILDING_CONFIGS,
  BUILDING_JOB_TYPES,
  JobType,
  LEADER_OCCUPATION,
  PATH_CELL,
} from './gameTypes';
import { getOccupationForBuilding, ensureEntitySkills, readSkill } from './skills';
import { SPECIES_CONFIG } from './speciesConfig';
import {
  beginCommuteRoutePass, isWithinAssignableCommute, wereCommuteRouteChecksDeferred,
  straightLineCommuteLowerBoundHours, MAX_ASSIGNABLE_COMMUTE_HOURS,
} from './commuteReach';
import { isPlayerHuman } from './playerHuman';
import { humanDisplayName } from './citizenId';
import { assignMissingResidences, reassignDivorcedResidences, restoreCustodyAfterRelease } from './housingPipeline';
import { hasWorkAssignment, isImprisoned, isResidenceBuildingType } from './housingModel';
import { prisonGuardCapacity } from './prisonShifts';
import { logEvent } from './eventLog';
import { addFloatingText, addNotification } from './simEffects';
import { TICKS_PER_DAY } from './dayCycleClock';
import { Human, VirtualPlayer } from './gameConstants';
import { isMeasuredFoodDeficit, isProjectedFoodShortfall } from './economyLedger';
import { evaluateWorkerFit } from './careers/workerFit';
import { profileStart, profileEnd } from './performanceProfiler';
import {
  DEFAULT_WORKFORCE_POLICY,
  getWorkforcePolicy,
  jobBuildingPriorityForPolicy,
  type WorkforcePolicy,
} from './workforcePolicy';

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


/**
 * Auto-staff rank of a job building; the ordering table lives in the policy owner, and this side
 * defaults to the colony preset.
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

/** Posts a completed workplace has, and how many are taken. */
export interface StaffingCapacity {
  cap: number;
  staffed: number;
}

/**
 * The staffing cap of a completed workplace, and how much of it is taken. A Prison's `occupants` is
 * guards ∪ prisoners, so its guard posts are counted on their own.
 */
export function staffingCapFor(
  building: Building,
  humans: Entity[],
  staffed?: number,
): StaffingCapacity {
  const configured = BUILDING_CONFIGS[building.type].maxOccupants;
  if (building.type === BuildingType.Prison) {
    return { cap: prisonGuardCapacity(configured), staffed: staffed ?? countWorkersAtBuilding(humans, building.id) };
  }
  return {
    cap: configured,
    staffed: Math.max(building.occupants.length, staffed ?? countWorkersAtBuilding(humans, building.id)),
  };
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
 * A staffed Blacksmith's boost per worker and the ceiling it runs into — the inspector's Blacksmith
 * hint quotes the same numbers.
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
 * Completed player job buildings, ordered by the current workforce preset — the order
 * `staffJobBuildings` serves open slots in.
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

export function canAutoChangeWorkplace(human: Entity, currentTick?: number, foodEmergency = false): boolean {
  // A prisoner's post is reserved, not vacant: no automatic transfer may move it while they serve.
  if (isImprisoned(human)) return false;
  if (foodEmergency) return true;
  if (currentTick == null || human.lastAutoJobTransferTick == null) return true;
  return currentTick - human.lastAutoJobTransferTick >= AUTO_JOB_TRANSFER_COOLDOWN_TICKS;
}

/** A verified falling food supply with fewer than six days in store warrants urgent staffing. */
export function isAcuteFoodStaffingEmergency(state: WorldState): boolean {
  if (!state.resources || !state.entities) return false;
  const settlers = state.entities.filter((entity) => entity.alive && isPlayerHuman(entity)).length;
  return settlers > 0
    && state.resources.food < settlers * Human.DAILY_FOOD_CONSUMPTION * VirtualPlayer.FOOD_BUFFER_DAYS * 3
    && isMeasuredFoodDeficit(state, VirtualPlayer.FOOD_DEFICIT_TOLERANCE_RATIO);
}

/**
 * Read the same prospective food-demand verdict as auto-play: a food vacancy may borrow a
 * nonessential, cooldown-locked employee before the larder collapses. Only food destinations.
 */
export function hasFoodStaffingPressure(state: WorldState): boolean {
  if (!state.entities || !state.resources) return false;
  const mouths = state.entities.filter((entity) => entity.alive && isPlayerHuman(entity)).length;
  return mouths > 0 && (isMeasuredFoodDeficit(state, VirtualPlayer.FOOD_DEFICIT_TOLERANCE_RATIO)
    || isProjectedFoodShortfall(state, mouths * Human.DAILY_FOOD_CONSUMPTION,
      VirtualPlayer.FOOD_DEFICIT_TOLERANCE_RATIO));
}

interface WorkforceAssignmentIndex {
  counts: Map<number, number>;
  movable: Map<number, number>;
}

function buildWorkforceAssignmentIndex(humans: Entity[], currentTick?: number, foodEmergency = false): WorkforceAssignmentIndex {
  const counts = new Map<number, number>();
  const movable = new Map<number, number>();
  for (const human of humans) {
    if (!human.alive || !isPlayerHuman(human)) continue;
    const id = human.workerBuildingId;
    if (id == null) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
    if (!human.isJuvenile && canAutoChangeWorkplace(human, currentTick, foodEmergency)) {
      movable.set(id, (movable.get(id) ?? 0) + 1);
    }
  }
  return { counts, movable };
}

/** Protect food production and guard coverage; stone production has the normal one-worker floor. */
function minimumAutoCoverage(building: Building): number {
  const critical = building.type === BuildingType.Farm
    || building.type === BuildingType.Greenhouse
    || building.type === BuildingType.HuntingSpot
    || building.type === BuildingType.FishingSpot
    || building.type === BuildingType.Barracks
    || building.type === BuildingType.Prison;
  return critical ? Math.min(3, BUILDING_CONFIGS[building.type].maxOccupants) : 1;
}

function pickOverstaffedDonor(
  jobBuildings: Building[],
  index: WorkforceAssignmentIndex,
  excludeBuildingId: number,
  preserveEssentialCoverage = false,
  rejectedDonors?: ReadonlySet<number>,
  minCount = 0,
): Building | undefined {
  let best: Building | undefined;
  let smallestCount = Infinity;
  for (const building of jobBuildings) {
    if (building.id === excludeBuildingId || rejectedDonors?.has(building.id)) continue;
    const count = index.counts.get(building.id) ?? 0;
    const keep = preserveEssentialCoverage ? minimumAutoCoverage(building) : 1;
    if (count <= keep || (index.movable.get(building.id) ?? 0) === 0) continue;
    if (count < minCount) continue;
    if (count < smallestCount) {
      best = building;
      smallestCount = count;
    }
  }
  return best;
}

/**
 * Read-only supply for one prospective food workplace: only genuinely movable staff above the same
 * protected minimum that real transfers enforce.
 */
export function prospectiveFoodTransferDonors(
  humans: Entity[],
  buildings: Building[],
  currentTick: number,
): { workers: Entity[]; spareSlots: number }[] {
  const workersBySite = new Map<number, Entity[]>();
  for (const human of humans) {
    if (!human.alive || !isPlayerHuman(human) || human.isJuvenile
      || human.workerBuildingId == null
      || !canAutoChangeWorkplace(human, currentTick, true)) continue;
    const assigned = workersBySite.get(human.workerBuildingId) ?? [];
    assigned.push(human);
    workersBySite.set(human.workerBuildingId, assigned);
  }
  const counts = buildWorkforceAssignmentIndex(humans, currentTick, true).counts;
  const donors: { workers: Entity[]; spareSlots: number }[] = [];
  for (const site of completedJobBuildings(buildings, 'survival')) {
    const spareSlots = Math.min(
      Math.max(0, (counts.get(site.id) ?? 0) - minimumAutoCoverage(site)),
      workersBySite.get(site.id)?.length ?? 0,
    );
    if (spareSlots > 0) donors.push({ workers: workersBySite.get(site.id)!, spareSlots });
  }
  return donors;
}

export function findOverstaffedDonorBuilding(
  jobBuildings: Building[],
  humans: Entity[],
  excludeBuildingId: number,
  currentTick?: number,
  preserveEssentialCoverage = false,
  foodEmergency = false,
  rejectedDonors?: ReadonlySet<number>,
): Building | undefined {
  return pickOverstaffedDonor(
    jobBuildings, buildWorkforceAssignmentIndex(humans, currentTick, foodEmergency),
    excludeBuildingId, preserveEssentialCoverage, rejectedDonors,
  );
}

export function pickWorkerToTransfer(
  humans: Entity[],
  fromBuilding: Building,
  toBuilding: Building,
  currentTick?: number,
  buildings: readonly Building[] = [fromBuilding, toBuilding],
  excludedWorkers?: ReadonlySet<number>,
  foodEmergency = false,
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
      !excludedWorkers?.has(h.id) &&
      canAutoChangeWorkplace(h, currentTick, foodEmergency) &&
      isWithinAssignableCommute(h, toBuilding, buildings, SPECIES_CONFIG[EntityType.Human].speed),
  );
  if (workers.length === 0) return undefined;

  const toX = toBuilding.x + toBuilding.width / 2;
  const toY = toBuilding.y + toBuilding.height / 2;

  workers.sort((a, b) => {
    const aFit = readSkill(a, toJob) - readSkill(a, fromJob);
    const bFit = readSkill(b, toJob) - readSkill(b, fromJob);
    if (bFit !== aFit) return bFit - aFit;

    const aHome = buildings.find((site) => site.id === a.residenceBuildingId) ?? a;
    const bHome = buildings.find((site) => site.id === b.residenceBuildingId) ?? b;
    const dxa = aHome.x - toX;
    const dya = aHome.y - toY;
    const dxb = bHome.x - toX;
    const dyb = bHome.y - toY;
    return dxa * dxa + dya * dya - (dxb * dxb + dyb * dyb) || a.id - b.id;
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
 * A sentence reserves a worker's post but excludes them from a normal workplace's active
 * occupants; restore the reserved roster atomically when custody ends. Idempotent for prison guards.
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
  foodEmergency = false,
): void {
  const jobBuildings = completedJobBuildings(buildings, policy);
  const index = buildWorkforceAssignmentIndex(humans, currentTick, foodEmergency);
  const movedThisPass = new Set<number>();

  // The cheapest donor may have no worker who can actually commute here; try each other
  // eligible donor before leaving the vacancy. A donor is skipped for this destination only.
  const fillFromDonors = (needy: Building, target: number, fromClearingSurplus = false): void => {
    let staffed = index.counts.get(needy.id) ?? 0;
    if (staffed >= target) return;
    const priorityFood = needy.type === BuildingType.Farm || needy.type === BuildingType.Greenhouse
      || needy.type === BuildingType.FishingSpot || needy.type === BuildingType.HuntingSpot;
    const rejectedDonors = new Set<number>();
    while (staffed < target) {
      // A capacity top-up only draws from a workplace that keeps more hands than this one gains.
      const donor = pickOverstaffedDonor(
        jobBuildings, index, needy.id, true, rejectedDonors,
        fromClearingSurplus ? staffed + 2 : 0,
      );
      if (!donor) break;
      const worker = pickWorkerToTransfer(humans, donor, needy, currentTick, buildings,
        movedThisPass, foodEmergency && priorityFood);
      if (!worker) {
        // A donor whose eligible roster has already moved cannot supply this vacancy again in the
        // same reconciliation pass.
        rejectedDonors.add(donor.id);
        continue;
      }

      transferWorkerBetweenBuildings(worker, donor, needy, currentTick);
      movedThisPass.add(worker.id);
      index.counts.set(donor.id, (index.counts.get(donor.id) ?? 0) - 1);
      index.counts.set(needy.id, ++staffed);
      index.movable.set(donor.id, (index.movable.get(donor.id) ?? 0) - 1);
      // The new employee is not available as a donor during this pass, even when a unit-level
      // caller has no tick to enforce the cooldown; existing coworkers remain eligible.
    }
  };

  // Finish the bounded minimum-coverage rebalance in this invocation, before `assignMissingWorkers`
  // caches the post-pass fingerprint; a newly transferred employee remains at their new post.
  for (const needy of jobBuildings) {
    if (BUILDING_CONFIGS[needy.type].maxOccupants <= 0) continue;
    const capacity = staffingCapFor(needy, humans, index.counts.get(needy.id) ?? 0).cap;
    fillFromDonors(needy, Math.min(capacity, minimumAutoCoverage(needy)));
  }

  // Open posts left after coverage are filled up from workplaces holding a clear surplus, so a
  // building can staff fully instead of every site sitting at a single worker.
  for (const needy of jobBuildings) {
    if (BUILDING_CONFIGS[needy.type].maxOccupants <= 0) continue;
    const capacity = staffingCapFor(needy, humans, index.counts.get(needy.id) ?? 0).cap;
    fillFromDonors(needy, capacity, true);
  }
}

export function syncJobBuildingOccupants(humans: Entity[], buildings: Building[]): void {
  // Two bucketing passes replace a full settler-list filter per building; each bucket preserves the
  // `humans` order the previous `.filter().map()` emitted, and the building loop writes only occupants.
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
  buildingById?: ReadonlyMap<number, Building>,
  workerCounts?: Map<number, number>,
): boolean {
  const job = BUILDING_JOB_TYPES[building.type];
  if (!job || !building.completed || building.faction === 'rival') return false;

  // Auto means fill all available staff positions, including Taverns and Hotels; opening-hour
  // minimum shift coverage is not a staffing limit.
  const workerCount = workerCounts?.get(building.id) ?? countWorkersAtBuilding(humans, building.id);
  const cap = staffingCapFor(building, humans, workerCount).cap;

  if (workerCount >= cap) return false;

  // Select the best candidate in one pass. Sorting every idle settler for every
  // vacant slot repeated expensive commute checks O(N log N) times.
  const buildingX = building.x + building.width / 2;
  const buildingY = building.y + building.height / 2;
  let worker: Entity | undefined;
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
    const home = candidate.residenceBuildingId == null
      ? undefined
      : buildingById?.get(candidate.residenceBuildingId)
        ?? buildings.find((site) => site.id === candidate.residenceBuildingId);
    const origin = home ?? candidate;
    const dx = origin.x - buildingX;
    const dy = origin.y - buildingY;
    const distance = dx * dx + dy * dy;
    // This bound can only EXCLUDE impossible commutes; the actual route remains the authoritative
    // eligibility check, so distant applicants do not spend A* budget.
    if (straightLineCommuteLowerBoundHours(origin, building, SPECIES_CONFIG[EntityType.Human].speed)
      > MAX_ASSIGNABLE_COMMUTE_HOURS) continue;
    if (!isWithinAssignableCommute(
      candidate, building, buildings, SPECIES_CONFIG[EntityType.Human].speed, buildingById,
    )) continue;
    const skill = readSkill(candidate, job);
    if (worker && (distance > bestDistance || (distance === bestDistance && skill < bestSkill))) continue;
    if (worker && distance === bestDistance && skill === bestSkill) {
      const bestFit = evaluateWorkerFit(worker, job);
      const candidateFit = evaluateWorkerFit(candidate, job);
      if (candidateFit.creditedDays < bestFit.creditedDays
        || (candidateFit.creditedDays === bestFit.creditedDays
          && candidateFit.aptitudeFactor <= bestFit.aptitudeFactor)) continue;
    }
    worker = candidate;
    bestDistance = distance;
    bestSkill = skill;
  }
  if (!worker) return false;

  const assigned = assignWorkerTransition(worker, building, venueSchedules?.tick);
  if (assigned && workerCounts) workerCounts.set(building.id, workerCount + 1);
  return assigned;
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
      if (!site || !site.completed) return false;
      const staffed = countWorkersAtBuilding(humans, site.id);
      // Construction must not strip the last ordinary producer or protected food/guard crew.
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
  // Repair old saves affected by zero-capacity construction crew transfers; only completed,
  // non-residential buildings with no job are cleared, as residence and prison have their own owners.
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
    // Passive zero-capacity sites (Wildlife Preserve, roads, decor) cannot hold builders, and the
    // donor rebalance below bypasses the normal capacity check.
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

/** Under the survival policy, reserve reachable unemployed adults for food production before
 * builders take the same idle pool; established jobs and crews stay put.
 */
function staffFoodJobsBeforeConstruction(
  alive: Entity[],
  buildings: Building[],
  world: WorldState | undefined,
  buildingById: ReadonlyMap<number, Building>,
): void {
  if (!world || getWorkforcePolicy(world) !== 'survival') return;
  const foodJobs = completedJobBuildings(buildings, 'survival').filter((site) =>
    site.type === BuildingType.Farm || site.type === BuildingType.Greenhouse
    || site.type === BuildingType.FishingSpot || site.type === BuildingType.HuntingSpot);
  if (foodJobs.length === 0) return;
  const constructionIds = new Set<number>();
  for (const site of buildings) {
    if (!site.completed) for (const id of site.occupants) constructionIds.add(id);
  }
  const workerCounts = new Map<number, number>();
  for (const human of alive) {
    if (human.workerBuildingId != null) {
      workerCounts.set(human.workerBuildingId, (workerCounts.get(human.workerBuildingId) ?? 0) + 1);
    }
  }
  for (const site of foodJobs) {
    while (assignWorkerInPlace(site, alive, buildings, world, constructionIds, buildingById, workerCounts)) {
      // Only unassigned, reachable adults; leave incumbent jobs untouched.
    }
  }
}

export function staffJobBuildings(
  alive: Entity[],
  buildings: Building[],
  worldSlices?: Pick<WorldState, 'tavernSchedule' | 'hotelSchedule'> & Partial<Pick<WorldState, 'tick'>>,
  policy: WorkforcePolicy = DEFAULT_WORKFORCE_POLICY,
  buildingIndex?: ReadonlyMap<number, Building>,
): void {
  const jobBuildings = completedJobBuildings(buildings, policy);
  const buildingById = buildingIndex ?? new Map(buildings.map((building) => [building.id, building]));
  // One scan for the whole pass: every vacancy would otherwise rescan all settlers.
  const workerCounts = new Map<number, number>();
  for (const human of alive) {
    if (!human.alive || !isPlayerHuman(human) || human.workerBuildingId == null) continue;
    const id = human.workerBuildingId;
    workerCounts.set(id, (workerCounts.get(id) ?? 0) + 1);
  }
  const constructionWorkerIds = new Set<number>();
  for (const site of buildings) {
    if (!site.completed) for (const id of site.occupants) constructionWorkerIds.add(id);
  }

  const staffStart = profileStart();
  for (let i = 0; i < jobBuildings.length; i++) {
    const building = jobBuildings[i];
    while (assignWorkerInPlace(building, alive, buildings, worldSlices, constructionWorkerIds, buildingById, workerCounts)) {
      // Fill job slots
    }
  }
  profileEnd('workforce.staff', staffStart);

  const rebalanceStart = profileStart();
  const world = worldSlices as WorldState | undefined;
  const urgentFood = world?.entities && world.resources && hasFoodStaffingPressure(world);
  rebalanceJobWorkers(alive, buildings, policy, worldSlices?.tick, !!urgentFood);
  profileEnd('workforce.rebalance', rebalanceStart);
  const syncStart = profileStart();
  syncJobBuildingOccupants(alive, buildings);
  profileEnd('workforce.syncOccupants', syncStart);
}

/**
 * Cheap event fingerprint for automatic employment: it changes only when a job, eligibility, home,
 * capacity or survival priority changes — O(player humans + buildings), unlike candidate evaluation.
 */
const lastWorkforceSignature = new WeakMap<WorldState, string>();
function workforceSignature(world: WorldState, humans: readonly Entity[]): string {
  const week = Math.floor(world.tick / (7 * TICKS_PER_DAY));
  const priority = getWorkforcePolicy(world);
  const resourceNeeds = `${Number((world.resources?.wood ?? 1) <= 0)}:${Number((world.resources?.stone ?? 1) <= 0)}:${Number(isAcuteFoodStaffingEmergency(world))}:${Number(hasFoodStaffingPressure(world))}`;
  const residenceIds = new Set(world.buildings
    .filter((site) => site.completed && site.faction !== 'rival' && isResidenceBuildingType(site.type))
    .map((site) => site.id));
  const residents = humans.map((human) => {
    // A timestamp alone cannot invalidate this cache when a transfer cooldown expires, so include
    // the owner's current eligibility verdict.
    const transferable = human.workerBuildingId != null
      && canAutoChangeWorkplace(human, world.tick);
    // Unhoused applicants use their CURRENT position as the commute origin: invalidate on
    // path-cell changes, not every animation step.
    const unhousedApplicant = human.workerBuildingId == null
      && (human.residenceBuildingId == null || !residenceIds.has(human.residenceBuildingId));
    const originCell = unhousedApplicant
      ? `${Math.floor(human.x / PATH_CELL)},${Math.floor(human.y / PATH_CELL)}`
      : '';
    return `${human.id}:${human.alive ? 1 : 0}:${human.isJuvenile ? 1 : 0}:${human.workerBuildingId ?? ''}:${human.residenceBuildingId ?? ''}:${human.prisonBuildingId ?? ''}:${human.lastAutoJobTransferTick ?? ''}:${transferable ? 1 : 0}:${originCell}:${human.faction ?? ''}`;
  });
  const sites = world.buildings.map((site) =>
    `${site.id}:${site.type}:${site.completed ? 1 : 0}:${site.faction ?? ''}:${site.level ?? 1}:${site.completed ? '' : site.occupants.join(',')}`,
  );
  return `${week}|${priority}|${resourceNeeds}|${residents.join(';')}|${sites.join(';')}`;
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
  > & Partial<Pick<WorldState, 'tick' | 'resources'>>,
  forceReconcile = false,
): void {
  // A full WorldState is used by all production callers; the optional slices form
  // keeps unit-level API callers backwards compatible without shared cache state.
  const world = worldSlices as WorldState | undefined;
  const cacheable = world?.entities != null && world.entities.length >= humans.length
    && world.buildings === buildings && world.tick != null;
  if (world && cacheable) {
    const signature = workforceSignature(world, humans);
    if (!forceReconcile && lastWorkforceSignature.get(world) === signature) return;
  }

  // Each actual staffing event has a bounded route-search budget, shared with
  // the canonical commute owner and cached for the current path-grid generation.
  beginCommuteRoutePass();
  const prepStart = profileStart();
  // Old manual flags never displace established employees.
  for (const building of buildings) {
    if (building.faction !== 'rival' && BUILDING_JOB_TYPES[building.type]
      && building.staffingMode === 'manual') building.staffingMode = 'auto';
  }
  const alive = prepareWorkforce(humans, buildings);
  profileEnd('workforce.prepare', prepStart);
  const buildingById = new Map(buildings.map((building) => [building.id, building]));
  const policy = getWorkforcePolicy(worldSlices ?? {});
  // Reserve one idle producer when a core material is exhausted, before builders
  // consume every free hand. Existing jobs remain assigned.
  if (worldSlices?.resources) {
    for (const [resource, type] of [
      ['wood', BuildingType.LumberMill],
      ['stone', BuildingType.Quarry],
    ] as const) {
      if (worldSlices.resources[resource] > 0) continue;
      const producer = buildings.find((site) =>
        site.completed && site.faction !== 'rival' && site.type === type
        && countWorkersAtBuilding(alive, site.id) === 0,
      );
      if (producer) assignWorkerInPlace(producer, alive, buildings, worldSlices, undefined, buildingById);
    }
  }
  // Survival prioritizes future food output before construction, even when the
  // larder is still full; other presets retain the normal construction order.
  staffFoodJobsBeforeConstruction(alive, buildings, world, buildingById);
  const constructionStart = profileStart();
  staffConstructionCrews(alive, buildings, policy, worldSlices?.tick);
  profileEnd('workforce.construction', constructionStart);
  const jobsStart = profileStart();
  staffJobBuildings(alive, buildings, worldSlices, policy, buildingById);
  profileEnd('workforce.jobs', jobsStart);
  if (world && cacheable) {
    if (wereCommuteRouteChecksDeferred()) {
      // No route was proved unreachable: the search budget ran out. Discard even a cached signature
      // so the next scheduled assignment pulse retries these vacancies.
      lastWorkforceSignature.delete(world);
    } else {
      // Only a fully priced pass may be cached. Unchanged future pulses can
      // skip expensive matching without starving deferred applicants.
      lastWorkforceSignature.set(world, workforceSignature(world, humans));
    }
  }
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

    const name = humanDisplayName(entity);
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
    // A released divorcee must not be seated back with the ex by generic homeless placement.
    const villagers = state.entities.filter(isPlayerHuman);
    for (const released of releasedSettlers) {
      const ex = released.formerSpouseId == null
        ? undefined
        : state.entities.find((person) => person.id === released.formerSpouseId && person.alive);
      if (ex && ex.residenceBuildingId != null
        && ex.residenceBuildingId === released.residenceBuildingId) {
        reassignDivorcedResidences(ex, released, state.buildings, villagers, ex);
      }
    }
    // Normal workforce pulses will fill newly available staff slots.
  }
}