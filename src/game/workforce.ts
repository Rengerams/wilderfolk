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
import { getOccupationForBuilding, ensureEntitySkills, readSkill, writableEntitySkills } from './skills';
import { getBuildingConfig } from './buildingConfig';
import { SPECIES_CONFIG } from './speciesConfig';
import {
  beginCommuteRoutePass, isWithinAssignableCommute, wereCommuteRouteChecksDeferred,
  straightLineCommuteLowerBoundHours, MAX_ASSIGNABLE_COMMUTE_HOURS, quoteBuildingCommute,
} from './commuteReach';
import { TICKS_PER_HOUR } from './dayCycleClock';
import { isPlayerHuman } from './playerHuman';
import { buildConstructionCrewIndex } from './workforceSummary';
import { humanDisplayName } from './citizenId';
import { assignMissingResidences, reassignDivorcedResidences, restoreCustodyAfterRelease } from './housingPipeline';
import { hasWorkAssignment, isImprisoned, isResidenceBuildingType } from './housingModel';
import { prisonGuardCapacity } from './prisonShifts';
import { logEvent } from './eventLog';
import { addFloatingText, addNotification } from './simEffects';
import { TICKS_PER_DAY } from './dayCycleClock';
import { HUMAN_ADULT_MIN_AGE } from './daycycleconstants';
import { Human, VirtualPlayer, SCHOOL_MIN_AGE, SCHOOL_CHILDREN_PER_TEACHER } from './gameConstants';
import { isMeasuredFoodDeficit, isProjectedFoodShortfall } from './economyLedger';
import { evaluateWorkerFit } from './careers/workerFit';
import { profileStart, profileEnd } from './performanceProfiler';
import {
  DEFAULT_WORKFORCE_POLICY,
  getWorkforcePolicy,
  jobBuildingPriorityForPolicy,
  getWorkforceFocus,
  workforceSectorForBuilding,
  type WorkforceFocusSector,
  type WorkforcePolicy,
} from './workforcePolicy';

/**
 * Auto-staff rank of a job building; the ordering table lives in the policy owner, and this side
 * defaults to the colony preset.
 */
function jobBuildingPriority(
  type: BuildingType,
  policy: WorkforcePolicy = DEFAULT_WORKFORCE_POLICY,
  focus: readonly WorkforceFocusSector[] = [],
): number {
  return jobBuildingPriorityForPolicy(policy, type, focus);
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
 * Workers who currently fill a post. A jailed settler retains workerBuildingId for eventual release,
 * but the panel and staffing capacity exclude them; an idle worker may backfill the active vacancy.
 */
export function countActiveWorkersAtBuilding(humans: Entity[], buildingId: number): number {
  let count = 0;
  for (let i = 0; i < humans.length; i++) {
    const h = humans[i];
    if (h.alive && isPlayerHuman(h) && h.workerBuildingId === buildingId && !isImprisoned(h)) {
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
  const configured = getBuildingConfig(building.type).maxOccupants;
  // A building with no job type has construction slots only; after completion no post can be filled.
  if (!BUILDING_JOB_TYPES[building.type]) return { cap: 0, staffed: 0 };
  if (building.type === BuildingType.Prison) {
    const cap = prisonGuardCapacity(configured);
    return { cap, staffed: staffed ?? Math.min(cap, countActiveWorkersAtBuilding(humans, building.id)) };
  }
  return {
    cap: configured,
    // Only workers who can actually work the post count as filled; a jailed holder reserves the
    // slot for release but does not make the post staffed.
    staffed: staffed ?? Math.min(configured, countActiveWorkersAtBuilding(humans, building.id)),
  };
}

export function countStaffedWorkersAtType(buildings: Building[], humans: Entity[], type: BuildingType): number {
  let total = 0;
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    if (b.completed && b.type === type) {
      total += countActiveWorkersAtBuilding(humans, b.id);
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
    (b) => b.completed && b.type === BuildingType.Church,
  );
  if (!hasChurch) return 0;
  const workers = countStaffedWorkersAtType(buildings, humans, BuildingType.Church);
  return workers > 0 ? 1 : 0.5;
}

/**
 * Completed player job buildings, ordered by the current workforce preset — the order
 * `staffJobBuildings` serves open slots in.
 */
function completedJobBuildings(
  buildings: Building[],
  policy: WorkforcePolicy = DEFAULT_WORKFORCE_POLICY,
  focus: readonly WorkforceFocusSector[] = [],
): Building[] {
  return buildings
    .filter((b) => {
      if (!b.completed || !BUILDING_JOB_TYPES[b.type]) return false;
      return BUILDING_CONFIGS[b.type].maxOccupants > 0;
    })
    .sort((a, b) => {
      const prio = jobBuildingPriority(a.type, policy, focus) - jobBuildingPriority(b.type, policy, focus);
      if (prio !== 0) return prio;
      return a.id - b.id;
    });
}

/** Prevent job cycling for three in-game days after an actual transfer. Initial hiring is unrestricted. */
export const AUTO_JOB_TRANSFER_COOLDOWN_TICKS = 3 * TICKS_PER_DAY;

export function canAutoChangeWorkplace(human: Entity, currentTick?: number, foodEmergency = false): boolean {
  // A prisoner's post is reserved, not vacant: no automatic transfer may move it while they serve.
  // Bonded apprentices are reserved for training, even during food emergencies.
  if (isImprisoned(human) || human.apprenticeOfId != null) return false;
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
    // Jailed holders reserve the post for release, but they are not coverage for a staffing decision.
    if (!isImprisoned(human)) counts.set(id, (counts.get(id) ?? 0) + 1);
    if (human.age >= HUMAN_ADULT_MIN_AGE && canAutoChangeWorkplace(human, currentTick, foodEmergency)) {
      movable.set(id, (movable.get(id) ?? 0) + 1);
    }
  }
  return { counts, movable };
}

/** The four staffed food producers whose crew the coverage rule protects. */
function isFoodWorkplace(building: Building): boolean {
  return building.type === BuildingType.Farm
    || building.type === BuildingType.Greenhouse
    || building.type === BuildingType.HuntingSpot
    || building.type === BuildingType.FishingSpot;
}

/** Protect food production and guard coverage; stone production has the normal one-worker floor. */
function minimumAutoCoverage(building: Building): number {
  const critical = isFoodWorkplace(building)
    || building.type === BuildingType.Barracks
    || building.type === BuildingType.Prison;
  return critical ? Math.min(3, BUILDING_CONFIGS[building.type].maxOccupants) : 1;
}

/**
 * The least crew a donor keeps when lending one worker. A food workplace may lend down to a single
 * hand to seed another food site — two half-crewed sites out-produce one full site and an idle one —
 * and keeps its own coverage for any other trade.
 */
function donationFloor(donor: Building, recipient: Building | undefined): number {
  const coverage = minimumAutoCoverage(donor);
  if (!recipient || !isFoodWorkplace(donor) || !isFoodWorkplace(recipient)) return coverage;
  return Math.min(coverage, Math.max(1, BUILDING_CONFIGS[donor.type].maxOccupants - 1));
}

function pickOverstaffedDonor(
  jobBuildings: Building[],
  index: WorkforceAssignmentIndex,
  recipient: Building | undefined,
  preserveEssentialCoverage = false,
  rejectedDonors?: ReadonlySet<number>,
): Building | undefined {
  let best: Building | undefined;
  let smallestCount = Infinity;
  // A food site seeding an empty food site is the last resort: an ordinary workplace with a clear
  // surplus donates first, so the established farm is not robbed while a mill sits overstaffed.
  let seed: Building | undefined;
  let smallestSeedCount = Infinity;
  for (const building of jobBuildings) {
    if (building.id === recipient?.id || rejectedDonors?.has(building.id)) continue;
    const count = index.counts.get(building.id) ?? 0;
    const foodSeed = recipient != null && (index.counts.get(recipient.id) ?? 0) === 0
      && isFoodWorkplace(building) && isFoodWorkplace(recipient)
      && count >= BUILDING_CONFIGS[building.type].maxOccupants;
    const keep = preserveEssentialCoverage
      ? (foodSeed ? donationFloor(building, recipient) : minimumAutoCoverage(building))
      : 1;
    if (count <= keep || (index.movable.get(building.id) ?? 0) === 0) continue;

    if (foodSeed) {
      if (count < smallestSeedCount) {
        seed = building;
        smallestSeedCount = count;
      }
      continue;
    }
    if (count < smallestCount) {
      best = building;
      smallestCount = count;
    }
  }
  return best ?? seed;
}

/**
 * Read-only supply for one prospective food workplace: only genuinely movable staff above the same
 * protected minimum that real transfers enforce.
 */
function prospectiveFoodTransferDonors(
  humans: Entity[],
  buildings: Building[],
  currentTick: number,
): { workers: Entity[]; spareSlots: number }[] {
  const workersBySite = new Map<number, Entity[]>();
  for (const human of humans) {
    if (!human.alive || !isPlayerHuman(human) || human.age < HUMAN_ADULT_MIN_AGE
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

/** Read-only food capacity information for planners; no staffing action is proposed. */
export function findUnstaffedFoodProducer(state: WorldState): Building | undefined {
  return state.buildings.find((site) => site.completed && isFoodWorkplace(site)
    && countActiveWorkersAtBuilding(state.entities, site.id) < staffingCapFor(site, state.entities).cap);
}

/** Shared idle employment eligibility, including construction and apprenticeship reservations. */
function isIdleWorkforceCandidate(human: Entity, crewIds: ReadonlySet<number>): boolean {
  return human.alive && isPlayerHuman(human) && human.age >= HUMAN_ADULT_MIN_AGE
    && !hasWorkAssignment(human) && human.apprenticeOfId == null
    && !isImprisoned(human) && !crewIds.has(human.id);
}

/**
 * Read-only construction feasibility: the same employment eligibility, donor floors and commute
 * rules used by the workforce owner. Returns null when current/pending vacancies exhaust supply.
 * The first food site is permitted as a bootstrap. No settler or policy is changed.
 */
export function prospectiveFoodSiteStaffing(state: WorldState): ((spot: { x: number; y: number }) => boolean) | null {
  const sites = state.buildings.filter(isFoodWorkplace);
  if (sites.length === 0) return () => true;
  const crewIds = new Set(buildConstructionCrewIndex(state.buildings).keys());
  const idle = state.entities.filter((human) => isIdleWorkforceCandidate(human, crewIds));
  const donors = hasFoodStaffingPressure(state)
    ? prospectiveFoodTransferDonors(state.entities, state.buildings, state.tick)
    : [];
  const counts = buildWorkforceAssignmentIndex(state.entities).counts;
  const openPosts = sites.reduce((sum, site) => sum + (site.completed
    ? Math.max(0, staffingCapFor(site, state.entities, counts.get(site.id) ?? 0).cap - (counts.get(site.id) ?? 0))
    : BUILDING_CONFIGS[site.type].maxOccupants), 0);
  if (idle.length + donors.reduce((sum, donor) => sum + donor.spareSlots, 0) <= openPosts) return null;
  const origins = new Map<number, Entity>();
  for (const person of [...idle, ...donors.flatMap((donor) => donor.workers)]) {
    const key = person.residenceBuildingId ?? -(person.id + 1);
    if (!origins.has(key)) origins.set(key, person);
  }
  const buildingById = new Map(state.buildings.map((site) => [site.id, site]));
  const walkSpeed = SPECIES_CONFIG[EntityType.Human].speed;
  return (spot) => {
    for (const person of origins.values()) {
      const from = (person.residenceBuildingId == null
        ? undefined : buildingById.get(person.residenceBuildingId)) ?? person;
      if (straightLineCommuteLowerBoundHours(from, spot, walkSpeed) > MAX_ASSIGNABLE_COMMUTE_HOURS) continue;
      if (isWithinAssignableCommute(person, spot, state.buildings, walkSpeed, buildingById, state.worldMap)) return true;
    }
    return false;
  };
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
  const recipient = jobBuildings.find((building) => building.id === excludeBuildingId);
  return pickOverstaffedDonor(
    jobBuildings, buildWorkforceAssignmentIndex(humans, currentTick, foodEmergency),
    recipient, preserveEssentialCoverage, rejectedDonors,
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

  const buildingById = new Map(buildings.map((site) => [site.id, site]));
  const speed = SPECIES_CONFIG[EntityType.Human].speed;
  const toX = toBuilding.x + toBuilding.width / 2;
  const toY = toBuilding.y + toBuilding.height / 2;
  let best: Entity | undefined;
  let bestFit = -Infinity;
  let bestDistance = Infinity;
  // Select in one pass. A sort comparator must not repeatedly price routes, especially
  // when the shared commute budget is close to exhaustion.
  for (const candidate of humans) {
    if (!isPlayerHuman(candidate) || !candidate.alive || candidate.age < HUMAN_ADULT_MIN_AGE
      || candidate.workerBuildingId !== fromBuilding.id || excludedWorkers?.has(candidate.id)
      || !canAutoChangeWorkplace(candidate, currentTick, foodEmergency)) continue;
    const fit = readSkill(candidate, toJob) - readSkill(candidate, fromJob);
    if (fit < bestFit) continue;
    const origin = (candidate.residenceBuildingId == null
      ? undefined : buildingById.get(candidate.residenceBuildingId)) ?? candidate;
    if (straightLineCommuteLowerBoundHours(origin, toBuilding, speed) > MAX_ASSIGNABLE_COMMUTE_HOURS
      || !isWithinAssignableCommute(candidate, toBuilding, buildings, speed, buildingById)) continue;
    const route = quoteBuildingCommute(origin, toBuilding, speed);
    const distance = route.status === 'priced' ? route.travelHours
      : Math.hypot(origin.x - toX, origin.y - toY) / speed / TICKS_PER_HOUR;
    if (best && fit === bestFit && (distance > bestDistance
      || (distance === bestDistance && candidate.id >= best.id))) continue;
    best = candidate;
    bestFit = fit;
    bestDistance = distance;
  }
  return best;
}

// ============ AUTHORITATIVE WORKFORCE MUTATIONS ============

/**
 * Named assignment transition — assign ONE living adult settler to a completed workplace.
 * Single write path for `workerBuildingId`, workplace `occupants`, and `job`/`occupation` properties.
 */
export function assignWorkerTransition(human: Entity, building: Building): boolean {
  const job = BUILDING_JOB_TYPES[building.type];
  if (!job || !building.completed) return false;
  if (!human.alive || !isPlayerHuman(human) || human.age < HUMAN_ADULT_MIN_AGE) return false;
  if (human.prisonBuildingId != null || human.apprenticeOfId != null) return false;
  if (human.workerBuildingId != null && human.workerBuildingId !== building.id) return false;
  const alreadyListed = building.occupants.includes(human.id);
  // A stale roster entry is not a completed assignment: repair the worker
  // pointer and job fields instead of returning with an invariant violation.
  if (alreadyListed && human.workerBuildingId === building.id && human.job === job) return true;

  const keepOffice = human.occupation === LEADER_OCCUPATION;
  if (!alreadyListed) building.occupants.push(human.id);
  human.workerBuildingId = building.id;
  // First employment is not a transfer: do not lock the new employee out of balancing.
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
  if (!workplace || !workplace.completed ||
      BUILDING_JOB_TYPES[workplace.type] == null) return;
  // Custody restoration must also retire stale prison and construction memberships.
  for (const building of buildings) {
    if (building.id === workplaceId || !building.occupants.includes(human.id)) continue;
    if (!building.completed || building.type === BuildingType.Prison) {
      building.occupants = building.occupants.filter((id) => id !== human.id);
    }
  }
  // A substitute may have taken the post while the settler was jailed; only re-post when the post
  // is still open, otherwise leave the settler idle for the next staffing pass (never overfill).
  if (workplace.occupants.includes(human.id)) return;
  const postCap = BUILDING_CONFIGS[workplace.type].maxOccupants;
  if (workplace.occupants.length >= postCap) {
    human.workerBuildingId = undefined;
    return;
  }
  workplace.occupants.push(human.id);
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
  if (building.completed) return false;
  if (!human.alive || !isPlayerHuman(human) || human.age < HUMAN_ADULT_MIN_AGE) return false;
  if (human.prisonBuildingId != null || human.apprenticeOfId != null) return false;
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
  focus: readonly WorkforceFocusSector[] = [],
): void {
  const jobBuildings = completedJobBuildings(buildings, policy, focus);
  const index = buildWorkforceAssignmentIndex(humans, currentTick, foodEmergency);
  const movedThisPass = new Set<number>();

  // The cheapest donor may have no worker who can actually commute here; try each other
  // eligible donor before leaving the vacancy. A donor is skipped for this destination only.
  const fillFromDonors = (needy: Building, target: number): void => {
    let staffed = index.counts.get(needy.id) ?? 0;
    if (staffed >= target) return;
    const baseStaffed = staffed;
    // A guard post must fill even when the only surplus sits in a trade that is ahead of it. An
    // ordinary post only takes from a donor that stays ahead of where this post started, so two
    // sites cannot pull the same worker back and forth.
    const criticalPost = needy.type === BuildingType.Barracks || needy.type === BuildingType.Prison;
    const priorityFood = isFoodWorkplace(needy);
    const rejectedDonors = new Set<number>();
    while (staffed < target) {
      const donor = pickOverstaffedDonor(jobBuildings, index, needy, true, rejectedDonors);
      if (!donor) break;
      // An ordinary low-priority vacancy cannot undo the player's selected focus.
      const donorSector = workforceSectorForBuilding(donor.type);
      if (!criticalPost && !(foodEmergency && priorityFood)
        && donorSector && focus.includes(donorSector)
        && donorSector !== workforceSectorForBuilding(needy.type)) {
        rejectedDonors.add(donor.id);
        continue;
      }
      if (!criticalPost && (index.counts.get(donor.id) ?? 0) - 1 <= baseStaffed) {
        // Donors are ordered from smallest to largest. An insufficient small crew must not
        // hide a larger eligible donor that can still lend safely.
        rejectedDonors.add(donor.id);
        continue;
      }
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
    const relaxedFoodCoverage = isFoodWorkplace(needy) && !foodEmergency
      && (focus.some((sector) => sector !== 'food')
        || jobBuildings.some((site) => site.type === BuildingType.School
          && preferredSchoolStaff(site, humans) > 1))
      && !focus.includes('food');
    fillFromDonors(needy, Math.min(capacity,
      relaxedFoodCoverage ? 1 : minimumAutoCoverage(needy)));
  }

  // Open posts left after coverage are filled up from workplaces holding a clear surplus, so a
  // building can staff fully instead of every site sitting at a single worker.
  for (const needy of jobBuildings) {
    if (BUILDING_CONFIGS[needy.type].maxOccupants <= 0) continue;
    const capacity = staffingCapFor(needy, humans, index.counts.get(needy.id) ?? 0).cap;
    fillFromDonors(needy, capacity);
  }

  fillPriorityStaffing(jobBuildings, index, humans, buildings, focus, currentTick, foodEmergency, movedThisPass);
  swapReachableWorkersIntoVacancies(jobBuildings, index, humans, buildings, currentTick, movedThisPass);
}

/**
 * Staffing demand for an enrolled classroom. Ten pupils exhaust one teacher's seats, so
 * request the second teacher at ten rather than waiting for an eleventh to be turned away.
 */
function preferredSchoolStaff(school: Building, humans: readonly Entity[]): number {
  let pupils = 0;
  for (const person of humans) {
    if (person.alive && isPlayerHuman(person)
      && person.age >= SCHOOL_MIN_AGE && person.age < HUMAN_ADULT_MIN_AGE
      && person.schoolBuildingId === school.id) pupils++;
  }
  return Math.min(BUILDING_CONFIGS[BuildingType.School].maxOccupants,
    Math.max(1, Math.floor(pupils / SCHOOL_CHILDREN_PER_TEACHER) + 1));
}

/**
 * The second pass for player-focused sectors and fully enrolled classrooms. Unlike ordinary
 * equalisation this may move a worker from a lower-priority two-person food crew to a priority
 * vacancy, but never leaves any producer unstaffed or breaks emergency food coverage.
 */
function fillPriorityStaffing(
  jobBuildings: Building[],
  index: WorkforceAssignmentIndex,
  humans: Entity[],
  buildings: Building[],
  focus: readonly WorkforceFocusSector[],
  currentTick: number | undefined,
  foodEmergency: boolean,
  movedThisPass: Set<number>,
): void {
  const targets = jobBuildings.filter((site) => {
    const sector = workforceSectorForBuilding(site.type);
    return (sector != null && focus.includes(sector))
      || (site.type === BuildingType.School && preferredSchoolStaff(site, humans) > 1);
  });

  for (const recipient of targets) {
    const sector = workforceSectorForBuilding(recipient.type);
    const focused = sector != null && focus.includes(sector);
    const target = recipient.type === BuildingType.School
      ? preferredSchoolStaff(recipient, humans)
      : focused ? staffingCapFor(recipient, humans).cap : 1;
    let staffed = index.counts.get(recipient.id) ?? 0;
    if (staffed >= target) continue;

    // Lower-ranked donors are tried first; no donor may lose its last worker.
    for (const donor of [...jobBuildings].reverse()) {
      if (staffed >= target) break;
      if (donor.id === recipient.id) continue;
      const donorSector = workforceSectorForBuilding(donor.type);
      if (donorSector && focus.includes(donorSector) && donorSector !== sector
        && !(foodEmergency && isFoodWorkplace(recipient))) continue;

      // A site in the same sector may lend only workers above its own staffing demand.
      const sameSectorDemand = donorSector != null && donorSector === sector
        ? donor.type === BuildingType.School
          ? preferredSchoolStaff(donor, humans)
          : focused ? staffingCapFor(donor, humans).cap : minimumAutoCoverage(donor)
        : 0;
      const donorFloor = isFoodWorkplace(donor) && !foodEmergency
        && sector !== 'food' && !focus.includes('food')
        ? 1 : minimumAutoCoverage(donor);
      const keep = Math.max(donorFloor, sameSectorDemand);
      while (staffed < target && (index.counts.get(donor.id) ?? 0) > keep) {
        const worker = pickWorkerToTransfer(
          humans, donor, recipient, currentTick, buildings, movedThisPass,
          foodEmergency && isFoodWorkplace(recipient),
        );
        if (!worker) break;
        transferWorkerBetweenBuildings(worker, donor, recipient, currentTick);
        movedThisPass.add(worker.id);
        index.counts.set(donor.id, (index.counts.get(donor.id) ?? 0) - 1);
        index.counts.set(recipient.id, ++staffed);
        index.movable.set(donor.id, (index.movable.get(donor.id) ?? 0) - 1);
      }
    }
  }
}

/** Bounded swap work one rebalance pass may do: two moves, each with its own backfill search. */
const MAX_SWAP_TRANSFERS_PER_PASS = 2;
/** Donor ties a pass may inspect after the ordinary distribution has already been tried. */
const MAX_SWAP_DONOR_CHECKS_PER_PASS = 8;

/**
 * Resolves the greedy trap: a vacancy no idle hand can reach, while a hand who can reach it holds a
 * post an idle hand can cover. Moves that hand and refills the post behind it, so neither is lost.
 */
function swapReachableWorkersIntoVacancies(
  jobBuildings: Building[],
  index: WorkforceAssignmentIndex,
  humans: Entity[],
  buildings: Building[],
  currentTick: number | undefined,
  movedThisPass: Set<number>,
): void {
  // A deferred route verdict is unknown, not a passable road; the next pulse prices it properly.
  if (wereCommuteRouteChecksDeferred()) return;
  const crewIds = new Set(buildConstructionCrewIndex(buildings).keys());
  const idle = humans.filter((human) =>
    isIdleWorkforceCandidate(human, crewIds) && !movedThisPass.has(human.id),
  );
  if (idle.length === 0) return;

  const buildingById = new Map(buildings.map((site) => [site.id, site]));
  let transfersLeft = MAX_SWAP_TRANSFERS_PER_PASS;
  let donorChecksLeft = MAX_SWAP_DONOR_CHECKS_PER_PASS;
  for (const needy of jobBuildings) {
    if (transfersLeft <= 0 || donorChecksLeft <= 0) break;
    if (BUILDING_CONFIGS[needy.type].maxOccupants <= 0) continue;
    const capacity = staffingCapFor(needy, humans, index.counts.get(needy.id) ?? 0).cap;
    const target = Math.min(capacity, minimumAutoCoverage(needy));
    if ((index.counts.get(needy.id) ?? 0) >= target) continue;

    // Least important donor first: the post moved out is the one the colony can most afford to refill.
    for (let d = jobBuildings.length - 1; d >= 0 && donorChecksLeft > 0; d--) {
      const donor = jobBuildings[d];
      // Empty sites and sites with no movable staff cannot supply a swap; do not
      // spend the bounded route-search allowance on them.
      if (donor.id === needy.id || (index.movable.get(donor.id) ?? 0) <= 0) continue;
      donorChecksLeft--;
      // The replacement refills the donor's post, so a donor at its floor can still supply the swap.
      const worker = pickWorkerToTransfer(humans, donor, needy, currentTick, buildings,
        movedThisPass, false);
      if (!worker) continue;
      const replacement = pickIdleWorkerForBuilding(
        donor, idle, buildings, crewIds, buildingById, movedThisPass,
      );
      if (!replacement) continue;

      transferWorkerBetweenBuildings(worker, donor, needy, currentTick);
      movedThisPass.add(worker.id);
      idle.splice(idle.indexOf(replacement), 1);
      assignWorkerTransition(replacement, donor);
      movedThisPass.add(replacement.id);
      index.counts.set(needy.id, (index.counts.get(needy.id) ?? 0) + 1);
      index.movable.set(donor.id, (index.movable.get(donor.id) ?? 0) - 1);
      transfersLeft--;
      break;
    }
  }
}

/**
 * Rebuilds each completed workplace's roster from the living settlers.
 */
export function syncJobBuildingOccupants(
  humans: Entity[],
  buildings: Building[],
): void {
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
    if (!isPlayerHuman(h)) continue;
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
    if (!building.completed || !BUILDING_JOB_TYPES[building.type]) {
      continue;
    }

    if (building.type === BuildingType.Prison) {
      building.occupants = prisonOccupantIds.get(building.id) ?? [];
      continue;
    }

    building.occupants = jobOccupantIds.get(building.id) ?? [];
  }
}

/** Select an eligible idle adult for any new workplace appointment, including swap backfill. */
function pickIdleWorkerForBuilding(
  building: Building,
  humans: readonly Entity[],
  buildings: readonly Building[],
  crewIds: ReadonlySet<number>,
  buildingById?: ReadonlyMap<number, Building>,
  excludedWorkers?: ReadonlySet<number>,
): Entity | undefined {
  const job = BUILDING_JOB_TYPES[building.type];
  if (!job || !building.completed) return undefined;
  const buildingX = building.x + building.width / 2;
  const buildingY = building.y + building.height / 2;
  let worker: Entity | undefined;
  let bestDistance = Infinity;
  let bestSkill = -Infinity;
  for (const candidate of humans) {
    if (!isIdleWorkforceCandidate(candidate, crewIds) || excludedWorkers?.has(candidate.id)) continue;
    const home = candidate.residenceBuildingId == null
      ? undefined
      : buildingById?.get(candidate.residenceBuildingId)
        ?? buildings.find((site) => site.id === candidate.residenceBuildingId);
    const origin = home ?? candidate;
    // Exclude geometrically impossible commutes before spending an A* search allowance.
    if (straightLineCommuteLowerBoundHours(origin, building, SPECIES_CONFIG[EntityType.Human].speed)
      > MAX_ASSIGNABLE_COMMUTE_HOURS) continue;
    if (!isWithinAssignableCommute(
      candidate, building, buildings, SPECIES_CONFIG[EntityType.Human].speed, buildingById,
    )) continue;
    const route = quoteBuildingCommute(origin, building, SPECIES_CONFIG[EntityType.Human].speed);
    const dx = origin.x - buildingX;
    const dy = origin.y - buildingY;
    // One metric for every candidate: travel hours. An unpriced leg falls back to the commute
    // owner's straight-line hours, never to a raw squared distance.
    const distance = route.status === 'priced'
      ? route.travelHours
      // The same unit as a priced leg: plain walk-hours, without the scheduling lead's one-hour
      // floor and rush factor, which would tie every near candidate and let skill outrank distance.
      : Math.hypot(dx, dy) / SPECIES_CONFIG[EntityType.Human].speed / TICKS_PER_HOUR;
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
  return worker;
}

export function assignWorkerInPlace(
  building: Building,
  humans: Entity[],
  buildings: Building[],
  constructionWorkerIds?: Set<number>,
  buildingById?: ReadonlyMap<number, Building>,
  workerCounts?: Map<number, number>,
): boolean {
  const job = BUILDING_JOB_TYPES[building.type];
  if (!job || !building.completed) return false;

  // Auto means fill all available staff positions, including Taverns and Hotels; opening-hour
  // minimum shift coverage is not a staffing limit.
  // A jailed holder's post is reserved but unfilled, so the fill count excludes them.
  const workerCount = workerCounts?.get(building.id) ?? countActiveWorkersAtBuilding(humans, building.id);
  const cap = staffingCapFor(building, humans, workerCount).cap;

  if (workerCount >= cap) return false;

  // Select the best candidate in one pass. Sorting every idle settler for every
  // vacant slot repeated expensive commute checks O(N log N) times.
  const crewIds = constructionWorkerIds ?? new Set(buildConstructionCrewIndex(buildings).keys());
  const worker = pickIdleWorkerForBuilding(building, humans, buildings, crewIds, buildingById);
  if (!worker) return false;

  const assigned = assignWorkerTransition(worker, building);
  if (assigned && workerCounts) workerCounts.set(building.id, workerCount + 1);
  return assigned;
}

function clearJobAssignment(human: Entity, buildings: Building[]): void {
  removeWorkerTransition(human, buildings);
}

function assignBuilderInPlace(
  building: Building,
  humans: Entity[],
  allBuildings: Building[],
  policy: WorkforcePolicy = DEFAULT_WORKFORCE_POLICY,
  currentTick?: number,
  constructionWorkerIds?: Set<number>,
  buildingById?: ReadonlyMap<number, Building>,
  allowJobTransfers = true,
  focus: readonly WorkforceFocusSector[] = [],
): boolean {
  if (building.completed) return false;

  const cap = BUILDING_CONFIGS[building.type].maxOccupants;
  if (building.occupants.length >= cap) return false;
  const crewIds = constructionWorkerIds ?? new Set(buildConstructionCrewIndex(allBuildings).keys());

  const freeBuilder = humans.find(
    (h) =>
      isPlayerHuman(h) &&
      h.alive &&
      h.age >= HUMAN_ADULT_MIN_AGE &&
      !hasWorkAssignment(h) &&
      h.apprenticeOfId == null &&
      !isImprisoned(h) &&
      !building.occupants.includes(h.id) &&
      !crewIds.has(h.id),
  );

  if (freeBuilder) {
    building.occupants.push(freeBuilder.id);
    crewIds.add(freeBuilder.id);
    return true;
  }

  // Borrow from an established workplace only when starting an empty site.
  if (!allowJobTransfers) return false;
  const jobHolder = humans
    .filter(
      (h) =>
        isPlayerHuman(h) &&
        h.alive &&
        h.age >= HUMAN_ADULT_MIN_AGE &&
        hasWorkAssignment(h) &&
        canAutoChangeWorkplace(h, currentTick) &&
        !isImprisoned(h) &&
        !building.occupants.includes(h.id) &&
        !crewIds.has(h.id),
    )
    .sort((a, b) => {
      const aPri = jobBuildingPriority(
        (buildingById?.get(a.workerBuildingId!) ?? allBuildings.find((x) => x.id === a.workerBuildingId))?.type ?? BuildingType.Farm,
        policy, focus,
      );
      const bPri = jobBuildingPriority(
        (buildingById?.get(b.workerBuildingId!) ?? allBuildings.find((x) => x.id === b.workerBuildingId))?.type ?? BuildingType.Farm,
        policy, focus,
      );
      return bPri - aPri;
    })
    .find((h) => {
      const site = (buildingById?.get(h.workerBuildingId!) ?? allBuildings.find((b) => b.id === h.workerBuildingId));
      if (!site || !site.completed) return false;
      if (focus.includes(workforceSectorForBuilding(site.type)!)) return false;
      const staffed = countWorkersAtBuilding(humans, site.id);
      // Construction must not strip the last ordinary producer or protected food/guard crew.
      // This is the same donor-coverage invariant that job rebalancing applies.
      return staffed > minimumAutoCoverage(site);
    });

  if (!jobHolder) return false;
  clearJobAssignment(jobHolder, allBuildings);
  if (currentTick != null) jobHolder.lastAutoJobTransferTick = currentTick;
  building.occupants.push(jobHolder.id);
  crewIds.add(jobHolder.id);
  return true;
}

export function prepareWorkforce(
  humans: Entity[],
  buildings: Building[],
): Entity[] {
  const alive = humans.filter((h) => h.alive && isPlayerHuman(h));
  const buildingById = new Map<number, Building>();
  for (let i = 0; i < buildings.length; i++) {
    buildingById.set(buildings[i].id, buildings[i]);
  }

  for (let i = 0; i < alive.length; i++) {
    const human = alive[i];

    // Existing fishing crews used to share the hunting profession. Keep their post and skills.
    if (human.job === JobType.Hunter && human.workerBuildingId != null) {
      const site = buildingById.get(human.workerBuildingId);
      if (site?.type === BuildingType.FishingSpot && assignWorkerTransition(human, site)) {
        // Fishing earned Hunter skill in old saves; do not overwrite any stronger Fisher skill.
        const earned = readSkill(human, JobType.Hunter);
        if (earned > readSkill(human, JobType.Fisher)) {
          writableEntitySkills(human)[JobType.Fisher] = earned;
        }
        human.huntTargetId = undefined;
      }
    }

    if (human.occupation === LEADER_OCCUPATION) {
      if (human.workerBuildingId != null) {
        const workplace = buildingById.get(human.workerBuildingId);
        if (
          !workplace ||
          !workplace.completed ||
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
      !BUILDING_JOB_TYPES[workplace.type]
    ) {
      clearWorkerAssignment(human);
    }
  }

  // Keep incomplete crews limited to unique living, idle, unjailed settlers.
  const eligibleBuilders = new Set(
    alive.filter((human) => human.age >= HUMAN_ADULT_MIN_AGE && !isImprisoned(human)
      && human.apprenticeOfId == null && !hasWorkAssignment(human))
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
  focus: readonly WorkforceFocusSector[] = [],
): void {
  const incomplete = buildings
    // Passive zero-capacity sites (Wildlife Preserve, roads, decor) cannot hold builders, and the
    // donor rebalance below bypasses the normal capacity check.
    .filter((b) => !b.completed && BUILDING_CONFIGS[b.type].maxOccupants > 0)
    .sort((a, b) => {
      const aHouse = isResidenceBuildingType(a.type) ? 0 : 1;
      const bHouse = isResidenceBuildingType(b.type) ? 0 : 1;
      if (aHouse !== bHouse) return aHouse - bHouse;
      return a.id - b.id;
    });

  const constructionWorkerIds = new Set(buildConstructionCrewIndex(buildings).keys());
  const buildingById = new Map(buildings.map((building) => [building.id, building]));

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
      assignBuilderInPlace(site, alive, buildings, policy, currentTick, constructionWorkerIds, buildingById, true, focus);
    }
  }

  // Extra construction places never trigger another workplace transfer.
  for (const site of incomplete) {
    while (assignBuilderInPlace(site, alive, buildings, policy, currentTick, constructionWorkerIds, buildingById, false)) {
      // Fill crew capacity with unemployed settlers only.
    }
  }
}

/**
 * Reserve the idle pool for the preset's jobs before builders take it: survival fills food production,
 * while every other preset seeds each empty job building with one hand.
 */
function staffJobsBeforeConstruction(
  alive: Entity[],
  buildings: Building[],
  world: WorldState | undefined,
  buildingById: ReadonlyMap<number, Building>,
): void {
  if (!world) return;
  const policy = getWorkforcePolicy(world);
  const focus = getWorkforceFocus(world);
  const jobBuildings = completedJobBuildings(buildings, policy, focus);
  // Survival fills food production; every other preset seeds each empty job building with one hand,
  // so construction cannot consume the whole idle pool before the preset's jobs are staffed.
  const targets = policy === 'survival'
    ? jobBuildings.filter((building) => isFoodWorkplace(building)
      || focus.includes(workforceSectorForBuilding(building.type)!))
    : jobBuildings;
  if (targets.length === 0) return;
  const constructionIds = new Set(buildConstructionCrewIndex(buildings).keys());
  const workerCounts = new Map<number, number>();
  for (const human of alive) {
    if (human.workerBuildingId != null && !isImprisoned(human)) {
      workerCounts.set(human.workerBuildingId, (workerCounts.get(human.workerBuildingId) ?? 0) + 1);
    }
  }
  for (const site of targets) {
    const selected = focus.includes(workforceSectorForBuilding(site.type)!);
    if (policy !== 'survival' && !selected) {
      if ((workerCounts.get(site.id) ?? 0) > 0) continue;
      assignWorkerInPlace(site, alive, buildings, constructionIds, buildingById, workerCounts);
      continue;
    }
    const target = site.type === BuildingType.School
      ? preferredSchoolStaff(site, alive)
      : staffingCapFor(site, alive).cap;
    while ((workerCounts.get(site.id) ?? 0) < target
      && assignWorkerInPlace(site, alive, buildings, constructionIds, buildingById, workerCounts)) {
      // Fill important vacancies before construction crews consume the idle pool.
    }
  }
}

export function staffJobBuildings(
  alive: Entity[],
  buildings: Building[],
  worldSlices?: Pick<WorldState, 'tavernSchedule' | 'hotelSchedule'> & Partial<Pick<WorldState, 'tick' | 'workforceFocus'>>,
  policy: WorkforcePolicy = DEFAULT_WORKFORCE_POLICY,
  buildingIndex?: ReadonlyMap<number, Building>,
): void {
  const focus = getWorkforceFocus(worldSlices ?? {});
  const jobBuildings = completedJobBuildings(buildings, policy, focus);
  const buildingById = buildingIndex ?? new Map(buildings.map((building) => [building.id, building]));
  // One scan for the whole pass: every vacancy would otherwise rescan all settlers.
  const workerCounts = new Map<number, number>();
  for (const human of alive) {
    if (!human.alive || !isPlayerHuman(human) || human.workerBuildingId == null
      || isImprisoned(human)) continue;
    const id = human.workerBuildingId;
    workerCounts.set(id, (workerCounts.get(id) ?? 0) + 1);
  }
  const constructionWorkerIds = new Set(buildConstructionCrewIndex(buildings).keys());

  const staffStart = profileStart();
  for (let i = 0; i < jobBuildings.length; i++) {
    const building = jobBuildings[i];
    while (assignWorkerInPlace(building, alive, buildings, constructionWorkerIds, buildingById, workerCounts)) {
      // Fill job slots
    }
  }
  profileEnd('workforce.staff', staffStart);

  const rebalanceStart = profileStart();
  const world = worldSlices as WorldState | undefined;
  const urgentFood = world?.entities && world.resources && hasFoodStaffingPressure(world);
  rebalanceJobWorkers(alive, buildings, policy, worldSlices?.tick, !!urgentFood, focus);
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
  const focus = getWorkforceFocus(world).join(',');
  const resourceNeeds = `${Number((world.resources?.wood ?? 1) <= 0)}:${Number((world.resources?.stone ?? 1) <= 0)}:${Number(isAcuteFoodStaffingEmergency(world))}:${Number(hasFoodStaffingPressure(world))}`;
  const residenceIds = new Set(world.buildings
    .filter((site) => site.completed && isResidenceBuildingType(site.type))
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
    return `${human.id}:${human.alive ? 1 : 0}:${human.isJuvenile ? 1 : 0}:${human.workerBuildingId ?? ''}:${human.apprenticeOfId ?? ''}:${human.residenceBuildingId ?? ''}:${human.schoolBuildingId ?? ''}:${human.prisonBuildingId ?? ''}:${human.lastAutoJobTransferTick ?? ''}:${transferable ? 1 : 0}:${originCell}:${human.faction ?? ''}`;
  });
  const sites = world.buildings.map((site) =>
    `${site.id}:${site.type}:${site.completed ? 1 : 0}:${site.level ?? 1}:${site.completed ? '' : site.occupants.join(',')}`,
  );
  return `${week}|${priority}|${focus}|${resourceNeeds}|${residents.join(';')}|${sites.join(';')}`;
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
    'tavernSchedule' | 'hotelSchedule' | 'workforcePolicy' | 'workforceFocus'
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
    if (BUILDING_JOB_TYPES[building.type]
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
        site.completed && site.type === type
        && countActiveWorkersAtBuilding(alive, site.id) === 0,
      );
      if (producer) assignWorkerInPlace(producer, alive, buildings, undefined, buildingById);
    }
  }
  // The preset's jobs get their hands before construction can take the whole idle pool.
  staffJobsBeforeConstruction(alive, buildings, world, buildingById);
  const constructionStart = profileStart();
  staffConstructionCrews(alive, buildings, policy, worldSlices?.tick, getWorkforceFocus(worldSlices ?? {}));
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
    if (jobSite?.completed && BUILDING_JOB_TYPES[jobSite.type]) {
      return jobSite;
    }
  }

  const construction = opts?.constructionByWorkerId?.get(entity.id);
  if (construction && !construction.completed) return construction;
  if (opts?.constructionByWorkerId) return undefined;

  return buildConstructionCrewIndex(buildings).get(entity.id);
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
