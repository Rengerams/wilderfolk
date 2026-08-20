/**
 * Workforce staffing: auto-assign, rebalance, workplace lookup, prisoner release.
 */
import type { Building, Entity, WorldState } from './gameTypes';
import { BuildingType, EntityType, BUILDING_CONFIGS, BUILDING_JOB_TYPES, JobType, LEADER_OCCUPATION } from './gameTypes';
import { getOccupationForBuilding, ensureEntitySkills, readSkill } from './skills';
import { isPlayerHuman } from './playerHuman';
import { assignMissingResidences, hasWorkAssignment, isImprisoned, isResidenceBuildingType } from './dayCycle';
import { logEvent } from './eventLog';
import { addFloatingText } from './simEffects';

function isOnConstructionCrew(human: Entity, buildings: Building[]): boolean {
  return buildings.some((b) => !b.completed && b.occupants.includes(human.id));
}

const AUTO_JOB_BUILDING_PRIORITY: BuildingType[] = [
  BuildingType.Farm,
  BuildingType.Greenhouse,
  BuildingType.HuntingSpot,
  BuildingType.LumberMill,
  BuildingType.Quarry,
  BuildingType.Mine,
  BuildingType.Blacksmith,
  BuildingType.Workshop,
  BuildingType.Store,
  BuildingType.Market,
  BuildingType.School,
  BuildingType.Hospital,
  BuildingType.TownHall,
  BuildingType.Church,
  BuildingType.Tavern,
  BuildingType.Hotel,
];

/** Job sites the player staffs manually (no auto-fill each tick). */
const MANUAL_STAFF_BUILDINGS = new Set<BuildingType>([
  BuildingType.Church,
  BuildingType.Prison,
  BuildingType.Barracks,
  BuildingType.School,
  BuildingType.TownHall,
]);

export function isManualStaffBuilding(type: BuildingType): boolean {
  return MANUAL_STAFF_BUILDINGS.has(type);
}

export function jobBuildingPriority(type: BuildingType): number {
  const idx = AUTO_JOB_BUILDING_PRIORITY.indexOf(type);
  return idx === -1 ? AUTO_JOB_BUILDING_PRIORITY.length : idx;
}

export function countWorkersAtBuilding(humans: Entity[], buildingId: number): number {
  return humans.filter((h) => h.alive && !h.faction && h.homeBuildingId === buildingId).length;
}

export function countStaffedWorkersAtType(buildings: Building[], humans: Entity[], type: BuildingType): number {
  let total = 0;
  for (const b of buildings) {
    if (b.completed && b.type === type && b.faction !== 'rival') {
      total += countWorkersAtBuilding(humans, b.id);
    }
  }
  return total;
}

export function getSmithBonus(buildings: Building[], humans: Entity[]): number {
  const workers = countStaffedWorkersAtType(buildings, humans, BuildingType.Blacksmith);
  if (workers <= 0) return 1.0;
  return Math.min(1.5, 1 + workers * 0.25);
}

/** 0 = no church, 0.5 = built but unstaffed, 1 = staffed priest on duty */
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
    (b) => b.completed && b.type === BuildingType.School && b.faction !== 'rival' && b.occupants.length > 0,
  );
}

export function completedJobBuildings(buildings: Building[]): Building[] {
  return buildings
    .filter((b) => {
      if (!b.completed || b.faction === 'rival' || !BUILDING_JOB_TYPES[b.type]) return false;
      return BUILDING_CONFIGS[b.type].maxOccupants > 0;
    })
    .sort((a, b) => {
      const prio = jobBuildingPriority(a.type) - jobBuildingPriority(b.type);
      if (prio !== 0) return prio;
      return a.id - b.id;
    });
}

export function findOverstaffedDonorBuilding(
  jobBuildings: Building[],
  humans: Entity[],
  excludeBuildingId: number,
): Building | undefined {
  return jobBuildings
    .filter(
      (b) =>
        b.id !== excludeBuildingId
        && !isManualStaffBuilding(b.type) // never strip Church / Prison / Barracks for farms
        && countWorkersAtBuilding(humans, b.id) >= 2,
    )
    .sort((a, b) => countWorkersAtBuilding(humans, a.id) - countWorkersAtBuilding(humans, b.id))[0];
}

export function pickWorkerToTransfer(
  humans: Entity[],
  fromBuilding: Building,
  toBuilding: Building,
): Entity | undefined {
  const toJob = BUILDING_JOB_TYPES[toBuilding.type];
  const fromJob = BUILDING_JOB_TYPES[fromBuilding.type];
  if (!toJob || !fromJob) return undefined;

  const workers = humans.filter(
    (h) =>
      isPlayerHuman(h)
      && h.alive
      && !h.isJuvenile
      && !h.pregnant
      && h.homeBuildingId === fromBuilding.id,
  );
  if (workers.length === 0) return undefined;

  workers.sort((a, b) => {
    const aFit = readSkill(a, toJob) - readSkill(a, fromJob);
    const bFit = readSkill(b, toJob) - readSkill(b, fromJob);
    return bFit - aFit;
  });
  return workers[0];
}

/**
 * Named assignment transition — assign ONE living adult settler to a completed
 * workplace. This is the single write path for `homeBuildingId`, workplace
 * `occupants`, and workplace `occupation`/`job` consistency (SIMULATION_AUTHORITY
 * §3 workforce row). Callers pick the candidate; this transition owns the write.
 *
 * Guards: completed job site, alive adult non-faction settler, not imprisoned,
 * not pregnant, not already holding a DIFFERENT workplace (duplicate-assignment
 * prevention — the Objective 1 invariant). Re-assigning to the same building is
 * idempotent.
 *
 * Leader-aware: the leader participates in normal workforce assignment like any
 * other settler (authority §5, 2026-08-20) — assigning them keeps
 * `occupation = LEADER_OCCUPATION` (office status survives work).
 */
export function assignWorkerTransition(human: Entity, building: Building): boolean {
  const job = BUILDING_JOB_TYPES[building.type];
  if (!job || !building.completed || building.faction === 'rival') return false;
  if (!human.alive || human.faction || human.isJuvenile) return false;
  if (human.prisonBuildingId != null) return false;
  if (human.pregnant) return false;
  if (human.homeBuildingId != null && human.homeBuildingId !== building.id) return false;
  if (building.occupants.includes(human.id)) return true; // idempotent

  const keepOffice = human.occupation === LEADER_OCCUPATION;
  building.occupants.push(human.id);
  human.homeBuildingId = building.id;
  human.occupation = keepOffice ? LEADER_OCCUPATION : getOccupationForBuilding(building.type);
  human.job = job;
  ensureEntitySkills(human)[job] = readSkill(human, job);
  return true;
}

/**
 * Named removal transition — release a settler from every workplace/crew
 * occupants list and clear their assignment fields. Idempotent for unassigned
 * settlers. Leader-safe: the office occupation survives removal.
 */
export function removeWorkerTransition(human: Entity, buildings: Building[]): void {
  for (const building of buildings) {
    if (building.occupants.includes(human.id)) {
      building.occupants = building.occupants.filter((id) => id !== human.id);
    }
  }
  human.homeBuildingId = undefined;
  human.occupation = human.occupation === LEADER_OCCUPATION ? LEADER_OCCUPATION : 'settler';
  human.job = JobType.Settler;
}

/**
 * Named transition — put a settler on an incomplete building's construction
 * crew (occupants only; crew members hold no `homeBuildingId`). A settler with
 * a job must be released first. The leader may join a crew like any settler.
 */
export function addToConstructionCrew(human: Entity, building: Building): boolean {
  if (building.completed || building.faction === 'rival') return false;
  if (!human.alive || human.faction || human.isJuvenile) return false;
  if (human.prisonBuildingId != null) return false;
  if (human.homeBuildingId != null) return false; // already working — release first
  if (building.occupants.includes(human.id)) return true;
  building.occupants.push(human.id);
  return true;
}

/** Named reassign transition — move a worker between two completed workplaces. */
export function transferWorkerBetweenBuildings(
  worker: Entity,
  fromBuilding: Building,
  toBuilding: Building,
): void {
  const job = BUILDING_JOB_TYPES[toBuilding.type];
  if (!job) return;

  fromBuilding.occupants = fromBuilding.occupants.filter((id) => id !== worker.id);
  if (!toBuilding.occupants.includes(worker.id)) toBuilding.occupants.push(worker.id);

  worker.homeBuildingId = toBuilding.id;
  worker.occupation = getOccupationForBuilding(toBuilding.type);
  worker.job = job;
  ensureEntitySkills(worker)[job] = readSkill(worker, job);
}

export function rebalanceJobWorkers(humans: Entity[], buildings: Building[]): void {
  const jobBuildings = completedJobBuildings(buildings);
  let changed = true;

  while (changed) {
    changed = false;
    for (const needy of jobBuildings) {
      if (isManualStaffBuilding(needy.type)) continue;
      if (BUILDING_CONFIGS[needy.type].maxOccupants <= 0) continue;
      if (countWorkersAtBuilding(humans, needy.id) !== 0) continue;

      const donor = findOverstaffedDonorBuilding(jobBuildings, humans, needy.id);
      if (!donor) continue;

      const worker = pickWorkerToTransfer(humans, donor, needy);
      if (!worker) continue;

      transferWorkerBetweenBuildings(worker, donor, needy);
      changed = true;
    }
  }
}

export function syncJobBuildingOccupants(humans: Entity[], buildings: Building[]): void {
  for (const building of buildings) {
    if (!building.completed || building.faction === 'rival' || !BUILDING_JOB_TYPES[building.type]) continue;
    if (building.type === BuildingType.Prison) {
      // Prison occupants = guards (homeBuildingId) + prisoners (prisonBuildingId).
      // The arrest/scandal owner and the Moon Howler restore both push prisoners
      // into prison.occupants — a rebuild from homeBuildingId alone would wipe
      // them on every assign pass (BUG 2026-08-20-prisoner-occupants-wiped).
      building.occupants = humans
        .filter(
          (h) =>
            h.alive
            && !h.faction
            && (h.homeBuildingId === building.id || h.prisonBuildingId === building.id),
        )
        .map((h) => h.id);
      continue;
    }
    building.occupants = humans
      .filter((h) => h.alive && !h.faction && h.homeBuildingId === building.id && h.prisonBuildingId == null)
      .map((h) => h.id);
  }
}

export function assignWorkerInPlace(building: Building, humans: Entity[], buildings: Building[]): boolean {
  const job = BUILDING_JOB_TYPES[building.type];
  if (!job || !building.completed || building.faction === 'rival') return false;

  const cap = BUILDING_CONFIGS[building.type].maxOccupants;
  if (countWorkersAtBuilding(humans, building.id) >= cap) return false;

  const candidates = humans.filter(
    (h) =>
      isPlayerHuman(h)
      && h.alive
      && !h.isJuvenile
      && !hasWorkAssignment(h)
      && !isImprisoned(h)
      && !h.pregnant
      && !isOnConstructionCrew(h, buildings),
  );
  candidates.sort((a, b) => readSkill(b, job) - readSkill(a, job));
  const worker = candidates[0];
  if (!worker) return false;

  return assignWorkerTransition(worker, building);
}

/** Clear a job assignment so a settler can join a construction crew. */
function clearJobAssignment(human: Entity, buildings: Building[]): void {
  removeWorkerTransition(human, buildings);
}

export function assignBuilderInPlace(
  building: Building,
  humans: Entity[],
  allBuildings: Building[],
): boolean {
  if (building.completed || building.faction === 'rival') return false;

  const cap = BUILDING_CONFIGS[building.type].maxOccupants;
  if (building.occupants.length >= cap) return false;

  const freeBuilder = humans.find(
    (h) =>
      isPlayerHuman(h)
      && h.alive
      && !h.isJuvenile
      && !hasWorkAssignment(h)
      && !isImprisoned(h)
      && !h.pregnant
      && !building.occupants.includes(h.id)
      && !allBuildings.some((b) => !b.completed && b.id !== building.id && b.occupants.includes(h.id)),
  );
  if (freeBuilder) {
    building.occupants.push(freeBuilder.id);
    return true;
  }

  // No idle settlers — pull one from a completed job (keep at least one worker on food jobs).
  // Construction is higher priority than fully staffing secondary buildings.
  const jobHolder = humans
    .filter(
      (h) =>
        isPlayerHuman(h)
        && h.alive
        && !h.isJuvenile
        && hasWorkAssignment(h)
        && !isImprisoned(h)
        && !h.pregnant
        && !building.occupants.includes(h.id)
        && !isOnConstructionCrew(h, allBuildings),
    )
    .sort((a, b) => {
      // Prefer stealing from lower-priority / overstaffed jobs
      const aPri = jobBuildingPriority(
        allBuildings.find((x) => x.id === a.homeBuildingId)?.type ?? BuildingType.Farm,
      );
      const bPri = jobBuildingPriority(
        allBuildings.find((x) => x.id === b.homeBuildingId)?.type ?? BuildingType.Farm,
      );
      return bPri - aPri; // higher priority index = less critical
    })
    .find((h) => {
      const site = allBuildings.find((b) => b.id === h.homeBuildingId);
      if (!site || !site.completed) return false;
      if (isManualStaffBuilding(site.type)) return false;
      const staffed = countWorkersAtBuilding(humans, site.id);
      // Never leave food production empty
      if (
        (site.type === BuildingType.Farm || site.type === BuildingType.Greenhouse)
        && staffed <= 1
      ) {
        return false;
      }
      return staffed >= 1;
    });

  if (!jobHolder) return false;
  clearJobAssignment(jobHolder, allBuildings);
  building.occupants.push(jobHolder.id);
  return true;
}

export function prepareWorkforce(humans: Entity[], buildings: Building[]): Entity[] {
  const alive = humans.filter((h) => h.alive && !h.faction);
  const buildingById = new Map<number, Building>();
  for (const b of buildings) buildingById.set(b.id, b);

  for (const human of alive) {
    // The office does not forbid a workplace (authority: the leader may work
    // while retaining leader status and manor residency). Only repair a
    // STALE leader assignment — missing/demolished/invalid workplace — exactly
    // like any other worker; never repair away a valid one.
    if (human.occupation === LEADER_OCCUPATION) {
      if (human.homeBuildingId != null) {
        const workplace = buildingById.get(human.homeBuildingId);
        if (
          !workplace
          || !workplace.completed
          || workplace.faction === 'rival'
          || !BUILDING_JOB_TYPES[workplace.type]
        ) {
          if (workplace) {
            workplace.occupants = workplace.occupants.filter((id) => id !== human.id);
          }
          human.homeBuildingId = undefined;
          human.job = JobType.Settler;
        }
      }
      continue;
    }
    if (human.prisonBuildingId != null) {
      if (human.homeBuildingId != null) {
        human.homeBuildingId = undefined;
        human.occupation = 'settler';
        human.job = JobType.Settler;
      }
      continue;
    }
    if (!hasWorkAssignment(human) || human.homeBuildingId == null) continue;
    const workplace = buildingById.get(human.homeBuildingId);
    if (
      !workplace
      || !workplace.completed
      || workplace.faction === 'rival'
      || !BUILDING_JOB_TYPES[workplace.type]
    ) {
      human.homeBuildingId = undefined;
      human.occupation = 'settler';
      human.job = JobType.Settler;
    }
  }

  syncJobBuildingOccupants(alive, buildings);
  return alive;
}

export function staffConstructionCrews(alive: Entity[], buildings: Building[]): void {
  const incomplete = buildings
    .filter((b) => !b.completed && b.faction !== 'rival')
    .sort((a, b) => {
      const aHouse = isResidenceBuildingType(a.type) ? 0 : 1;
      const bHouse = isResidenceBuildingType(b.type) ? 0 : 1;
      if (aHouse !== bHouse) return aHouse - bHouse;
      return a.id - b.id;
    });

  // Pass 1: every site gets at least one builder before any site piles on.
  // With 2 pioneers + house + farm, both sites progress in parallel.
  for (const building of incomplete) {
    if (building.occupants.length === 0) {
      assignBuilderInPlace(building, alive, buildings);
    }
  }

  // Rebalance: sites with nobody steal from sites that already have 2+ builders.
  for (const needy of incomplete) {
    if (needy.occupants.length > 0) continue;
    const donor = incomplete.find((b) => b.id !== needy.id && b.occupants.length > 1);
    if (!donor) break;
    const moved = donor.occupants.pop();
    if (moved == null) continue;
    needy.occupants.push(moved);
  }

  // Pass 2: fill remaining slots (idle settlers or soft-steal from jobs).
  for (const building of incomplete) {
    while (assignBuilderInPlace(building, alive, buildings)) {
      // fill construction crews
    }
  }
}

export function staffJobBuildings(alive: Entity[], buildings: Building[], includeManualStaff: boolean): void {
  const jobBuildings = completedJobBuildings(buildings);

  for (const building of jobBuildings) {
    if (!includeManualStaff && isManualStaffBuilding(building.type)) continue;
    while (assignWorkerInPlace(building, alive, buildings)) {
      // fill open job slots
    }
  }

  if (!includeManualStaff) {
    rebalanceJobWorkers(alive, buildings);
  }
  syncJobBuildingOccupants(alive, buildings);
}

/** Auto-staff construction sites and job buildings so settlers work instead of wandering. */
export function assignMissingWorkers(humans: Entity[], buildings: Building[]): void {
  const alive = prepareWorkforce(humans, buildings);
  staffConstructionCrews(alive, buildings);
  staffJobBuildings(alive, buildings, false);
}

/** Headless balance sims — fill every job slot including church, prison, and barracks. */
export function assignAllWorkers(humans: Entity[], buildings: Building[]): void {
  const alive = prepareWorkforce(humans, buildings);
  staffConstructionCrews(alive, buildings);
  staffJobBuildings(alive, buildings, true);
}

export function countWorkingAndIdleSettlers(
  humans: Entity[],
  buildings: Building[],
): { working: number; idle: number } {
  const constructionWorkers = new Set<number>();
  for (const b of buildings) {
    if (!b.completed) {
      for (const id of b.occupants) constructionWorkers.add(id);
    }
  }
  let working = 0;
  let idle = 0;
  for (const e of humans) {
    if (!e.alive || e.faction || e.isJuvenile || e.type !== EntityType.Human) continue;
    if (isImprisoned(e)) continue;
    // The leader works like any other settler (authority §5, 2026-08-20):
    // office alone does not count as working — an idle leader is idle.
    if (hasWorkAssignment(e) || constructionWorkers.has(e.id)) working++;
    else idle++;
  }
  return { working, idle };
}

/**
 * Resolve a settler's workplace (job site or construction crew).
 * Prefer O(1) maps from the tick context when available — buildings arrays are scanned only as fallback.
 */
export function findHumanWorkplace(
  entity: Entity,
  buildings: Building[],
  opts?: {
    buildingById?: ReadonlyMap<number, Building>;
    /** entity id → unfinished building they are helping build */
    constructionByWorkerId?: ReadonlyMap<number, Building>;
  },
): Building | undefined {
  const byId = opts?.buildingById;
  if (hasWorkAssignment(entity) && entity.homeBuildingId != null) {
    const jobSite = byId?.get(entity.homeBuildingId)
      ?? buildings.find((b) => b.id === entity.homeBuildingId);
    if (jobSite?.completed && jobSite.faction !== 'rival' && BUILDING_JOB_TYPES[jobSite.type]) {
      return jobSite;
    }
  }
  const construction = opts?.constructionByWorkerId?.get(entity.id);
  if (construction && !construction.completed) return construction;
  if (opts?.constructionByWorkerId) return undefined;
  // Fallback linear scan (callers without a prebuilt index)
  return buildings.find((b) => !b.completed && b.occupants.includes(entity.id));
}

/** Build entityId → incomplete building for construction crews (one pass per tick). */
export function buildConstructionCrewIndex(buildings: readonly Building[]): Map<number, Building> {
  const map = new Map<number, Building>();
  for (const b of buildings) {
    if (b.completed || b.faction === 'rival' || b.occupants.length === 0) continue;
    for (const id of b.occupants) {
      if (!map.has(id)) map.set(id, b);
    }
  }
  return map;
}

export function releasePrisoners(state: WorldState): void {
  let released = false;
  for (const entity of state.entities) {
    if (!entity.alive || entity.type !== EntityType.Human) continue;
    if (entity.prisonBuildingId == null || entity.prisonerUntilTick == null) continue;
    if (state.tick < entity.prisonerUntilTick) continue;
    const prison = state.buildings.find((b) => b.id === entity.prisonBuildingId);
    if (prison) {
      prison.occupants = prison.occupants.filter((id) => id !== entity.id);
    }
    entity.prisonBuildingId = undefined;
    entity.prisonerUntilTick = undefined;
    entity.prisonSentenceCrime = undefined;
    entity.flash = 8;
    const name = entity.name ? `${entity.name}${entity.surname ? ` ${entity.surname}` : ''}` : 'A settler';
    logEvent(state, 'event', `${name} was released from prison`, name);
    addFloatingText(state, entity.x, entity.y - 18, 'Released', '#22c55e');
    released = true;
  }
  if (released) {
    const villagers = state.entities.filter((e) => e.alive && e.type === EntityType.Human && isPlayerHuman(e));
    assignMissingResidences(villagers, state.buildings, state.entities);
    assignMissingWorkers(villagers, state.buildings);
  }
}


