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
import { isPlayerHuman } from './playerHuman';
import {
  assignMissingResidences,
  hasWorkAssignment,
  isImprisoned,
  isResidenceBuildingType,
} from './residency';
import { logEvent } from './eventLog';
import { addFloatingText } from './simEffects';
import { getVenueAutoStaffingTarget } from './venueSchedule';

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

/** Workplaces that require manual player staffing by default. */
const MANUAL_STAFF_BUILDINGS = new Set<BuildingType>([
  BuildingType.Church,
  BuildingType.Prison,
  BuildingType.Barracks,
  BuildingType.School,
  BuildingType.TownHall,
]);

function formatSettlerName(entity: Entity): string {
  const base = entity.name || 'Settler';
  const full = entity.surname ? `${base} ${entity.surname}` : base;
  return entity.title ? `${full} ${entity.title}` : full;
}

function isOnConstructionCrew(human: Entity, buildings: Building[]): boolean {
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    if (!b.completed && b.occupants.includes(human.id)) {
      return true;
    }
  }
  return false;
}

export function isManualStaffBuilding(type: BuildingType): boolean {
  return MANUAL_STAFF_BUILDINGS.has(type);
}

/** Per-building staffing mode check with fallback to building-type defaults. */
export function isManualStaffingBuilding(building: Pick<Building, 'type' | 'staffingMode'>): boolean {
  return (
    building.staffingMode === 'manual' ||
    (building.staffingMode == null && isManualStaffBuilding(building.type))
  );
}

export function jobBuildingPriority(type: BuildingType): number {
  const idx = AUTO_JOB_BUILDING_PRIORITY.indexOf(type);
  return idx === -1 ? AUTO_JOB_BUILDING_PRIORITY.length : idx;
}

export function countWorkersAtBuilding(humans: Entity[], buildingId: number): number {
  let count = 0;
  for (let i = 0; i < humans.length; i++) {
    const h = humans[i];
    if (h.alive && !h.faction && h.homeBuildingId === buildingId) {
      count++;
    }
  }
  return count;
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

export function getSmithBonus(buildings: Building[], humans: Entity[]): number {
  const workers = countStaffedWorkersAtType(buildings, humans, BuildingType.Blacksmith);
  if (workers <= 0) return 1.0;
  return Math.min(1.5, 1 + workers * 0.25);
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
        b.id !== excludeBuildingId &&
        !isManualStaffingBuilding(b) &&
        countWorkersAtBuilding(humans, b.id) >= 2,
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
      isPlayerHuman(h) &&
      h.alive &&
      !h.isJuvenile &&
      !h.pregnant &&
      h.homeBuildingId === fromBuilding.id,
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
 * Single write path for `homeBuildingId`, workplace `occupants`, and `job`/`occupation` properties.
 */
export function assignWorkerTransition(human: Entity, building: Building): boolean {
  const job = BUILDING_JOB_TYPES[building.type];
  if (!job || !building.completed || building.faction === 'rival') return false;
  if (!human.alive || human.faction || human.isJuvenile) return false;
  if (human.prisonBuildingId != null) return false;
  if (human.pregnant) return false;
  if (human.homeBuildingId != null && human.homeBuildingId !== building.id) return false;
  if (building.occupants.includes(human.id)) return true; // Idempotent

  const keepOffice = human.occupation === LEADER_OCCUPATION;
  building.occupants.push(human.id);
  human.homeBuildingId = building.id;
  human.occupation = keepOffice ? LEADER_OCCUPATION : getOccupationForBuilding(building.type);
  human.job = job;
  ensureEntitySkills(human)[job] = readSkill(human, job);
  return true;
}

/**
 * Named removal transition — release a settler from all workplaces/crews and clear job fields.
 * Preserves `LEADER_OCCUPATION`.
 */
export function removeWorkerTransition(human: Entity, buildings: Building[]): void {
  for (let i = 0; i < buildings.length; i++) {
    const building = buildings[i];
    if (building.occupants.includes(human.id)) {
      building.occupants = building.occupants.filter((id) => id !== human.id);
    }
  }
  human.homeBuildingId = undefined;
  human.occupation = human.occupation === LEADER_OCCUPATION ? LEADER_OCCUPATION : 'settler';
  human.job = JobType.Settler;
}

/**
 * Adds an idle settler to an incomplete building's construction crew.
 */
export function addToConstructionCrew(human: Entity, building: Building): boolean {
  if (building.completed || building.faction === 'rival') return false;
  if (!human.alive || human.faction || human.isJuvenile) return false;
  if (human.prisonBuildingId != null) return false;
  if (human.homeBuildingId != null) return false; // Must be unassigned from regular jobs first
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
): void {
  const job = BUILDING_JOB_TYPES[toBuilding.type];
  if (!job) return;

  fromBuilding.occupants = fromBuilding.occupants.filter((id) => id !== worker.id);
  if (!toBuilding.occupants.includes(worker.id)) {
    toBuilding.occupants.push(worker.id);
  }

  const keepOffice = worker.occupation === LEADER_OCCUPATION;
  worker.homeBuildingId = toBuilding.id;
  worker.occupation = keepOffice ? LEADER_OCCUPATION : getOccupationForBuilding(toBuilding.type);
  worker.job = job;
  ensureEntitySkills(worker)[job] = readSkill(worker, job);
}

export function rebalanceJobWorkers(humans: Entity[], buildings: Building[]): void {
  const jobBuildings = completedJobBuildings(buildings);
  let changed = true;
  let passes = 0;
  const maxPasses = jobBuildings.length * 2;

  while (changed && passes < maxPasses) {
    changed = false;
    passes++;
    for (let i = 0; i < jobBuildings.length; i++) {
      const needy = jobBuildings[i];
      if (isManualStaffingBuilding(needy)) continue;
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
  for (let i = 0; i < buildings.length; i++) {
    const building = buildings[i];
    if (!building.completed || building.faction === 'rival' || !BUILDING_JOB_TYPES[building.type]) {
      continue;
    }

    if (building.type === BuildingType.Prison) {
      // Prison occupants = guards (homeBuildingId) + prisoners (prisonBuildingId)
      building.occupants = humans
        .filter(
          (h) =>
            h.alive &&
            !h.faction &&
            (h.homeBuildingId === building.id || h.prisonBuildingId === building.id),
        )
        .map((h) => h.id);
      continue;
    }

    building.occupants = humans
      .filter(
        (h) =>
          h.alive &&
          !h.faction &&
          h.homeBuildingId === building.id &&
          h.prisonBuildingId == null,
      )
      .map((h) => h.id);
  }
}

export function assignWorkerInPlace(
  building: Building,
  humans: Entity[],
  buildings: Building[],
  venueSchedules?: Pick<WorldState, 'tavernSchedule' | 'hotelSchedule'>,
): boolean {
  const job = BUILDING_JOB_TYPES[building.type];
  if (!job || !building.completed || building.faction === 'rival') return false;

  const configuredCap = BUILDING_CONFIGS[building.type].maxOccupants;
  const isAutoBuilding = !isManualStaffingBuilding(building);
  const venueKind =
    building.type === BuildingType.Tavern
      ? 'tavern'
      : building.type === BuildingType.Hotel
        ? 'hotel'
        : undefined;

  const cap =
    venueKind && isAutoBuilding
      ? getVenueAutoStaffingTarget(
          venueSchedules ?? { tavernSchedule: undefined, hotelSchedule: undefined },
          venueKind,
          configuredCap,
        )
      : configuredCap;

  if (countWorkersAtBuilding(humans, building.id) >= cap) return false;

  const candidates = humans.filter(
    (h) =>
      isPlayerHuman(h) &&
      h.alive &&
      !h.isJuvenile &&
      !hasWorkAssignment(h) &&
      !isImprisoned(h) &&
      !h.pregnant &&
      !isOnConstructionCrew(h, buildings),
  );

  const buildingX = building.x + building.width / 2;
  const buildingY = building.y + building.height / 2;

  candidates.sort((a, b) => {
    const dxa = a.x - buildingX;
    const dya = a.y - buildingY;
    const dxb = b.x - buildingX;
    const dyb = b.y - buildingY;
    const distDiff = dxa * dxa + dya * dya - (dxb * dxb + dyb * dyb);
    if (distDiff !== 0) return distDiff;
    return readSkill(b, job) - readSkill(a, job);
  });

  const worker = candidates[0];
  if (!worker) return false;

  return assignWorkerTransition(worker, building);
}

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
      isPlayerHuman(h) &&
      h.alive &&
      !h.isJuvenile &&
      !hasWorkAssignment(h) &&
      !isImprisoned(h) &&
      !h.pregnant &&
      !building.occupants.includes(h.id) &&
      !allBuildings.some((b) => !b.completed && b.id !== building.id && b.occupants.includes(h.id)),
  );

  if (freeBuilder) {
    building.occupants.push(freeBuilder.id);
    return true;
  }

  // Soft-steal from lower priority jobs if needed
  const jobHolder = humans
    .filter(
      (h) =>
        isPlayerHuman(h) &&
        h.alive &&
        !h.isJuvenile &&
        hasWorkAssignment(h) &&
        !isImprisoned(h) &&
        !h.pregnant &&
        !building.occupants.includes(h.id) &&
        !isOnConstructionCrew(h, allBuildings),
    )
    .sort((a, b) => {
      const aPri = jobBuildingPriority(
        allBuildings.find((x) => x.id === a.homeBuildingId)?.type ?? BuildingType.Farm,
      );
      const bPri = jobBuildingPriority(
        allBuildings.find((x) => x.id === b.homeBuildingId)?.type ?? BuildingType.Farm,
      );
      return bPri - aPri;
    })
    .find((h) => {
      const site = allBuildings.find((b) => b.id === h.homeBuildingId);
      if (!site || !site.completed || isManualStaffingBuilding(site)) return false;
      const staffed = countWorkersAtBuilding(humans, site.id);
      if ((site.type === BuildingType.Farm || site.type === BuildingType.Greenhouse) && staffed <= 1) {
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
  for (let i = 0; i < buildings.length; i++) {
    buildingById.set(buildings[i].id, buildings[i]);
  }

  for (let i = 0; i < alive.length; i++) {
    const human = alive[i];

    if (human.occupation === LEADER_OCCUPATION) {
      if (human.homeBuildingId != null) {
        const workplace = buildingById.get(human.homeBuildingId);
        if (
          !workplace ||
          !workplace.completed ||
          workplace.faction === 'rival' ||
          !BUILDING_JOB_TYPES[workplace.type]
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
      !workplace ||
      !workplace.completed ||
      workplace.faction === 'rival' ||
      !BUILDING_JOB_TYPES[workplace.type]
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

  // Pass 1: ensure every active site has at least one builder
  for (let i = 0; i < incomplete.length; i++) {
    const building = incomplete[i];
    if (building.occupants.length === 0) {
      assignBuilderInPlace(building, alive, buildings);
    }
  }

  // Rebalance: move builders from over-crewed sites to empty ones
  for (let i = 0; i < incomplete.length; i++) {
    const needy = incomplete[i];
    if (needy.occupants.length > 0) continue;
    const donor = incomplete.find((b) => b.id !== needy.id && b.occupants.length > 1);
    if (!donor) break;
    const moved = donor.occupants.pop();
    if (moved == null) continue;
    needy.occupants.push(moved);
  }

  // Pass 2: fill remaining slots
  for (let i = 0; i < incomplete.length; i++) {
    const building = incomplete[i];
    while (assignBuilderInPlace(building, alive, buildings)) {
      // Fill crew capacity
    }
  }
}

export function staffJobBuildings(
  alive: Entity[],
  buildings: Building[],
  includeManualStaff: boolean,
  venueSchedules?: Pick<WorldState, 'tavernSchedule' | 'hotelSchedule'>,
): void {
  const jobBuildings = completedJobBuildings(buildings);

  for (let i = 0; i < jobBuildings.length; i++) {
    const building = jobBuildings[i];
    if (!includeManualStaff && isManualStaffingBuilding(building)) continue;
    while (assignWorkerInPlace(building, alive, buildings, venueSchedules)) {
      // Fill job slots
    }
  }

  if (!includeManualStaff) {
    rebalanceJobWorkers(alive, buildings);
  }
  syncJobBuildingOccupants(alive, buildings);
}

export function assignMissingWorkers(
  humans: Entity[],
  buildings: Building[],
  venueSchedules?: Pick<WorldState, 'tavernSchedule' | 'hotelSchedule'>,
): void {
  const alive = prepareWorkforce(humans, buildings);
  staffConstructionCrews(alive, buildings);
  staffJobBuildings(alive, buildings, false, venueSchedules);
}

export function assignAllWorkers(humans: Entity[], buildings: Building[]): void {
  const alive = prepareWorkforce(humans, buildings);
  staffConstructionCrews(alive, buildings);
  staffJobBuildings(alive, buildings, true, undefined);
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
    if (!e.alive || e.faction || e.isJuvenile || e.type !== EntityType.Human) continue;
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
  if (hasWorkAssignment(entity) && entity.homeBuildingId != null) {
    const jobSite = byId?.get(entity.homeBuildingId) ?? buildings.find((b) => b.id === entity.homeBuildingId);
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
  let released = false;

  for (let i = 0; i < state.entities.length; i++) {
    const entity = state.entities[i];
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

    const name = formatSettlerName(entity);
    logEvent(state, 'event', `${name} was released from prison`, name);
    addFloatingText(state, entity.x, entity.y - 18, 'Released', '#22c55e');
    released = true;
  }

  if (released) {
    const villagers = state.entities.filter(
      (e) => e.alive && e.type === EntityType.Human && isPlayerHuman(e),
    );
    assignMissingResidences(villagers, state.buildings, state.entities);
    assignMissingWorkers(villagers, state.buildings);
  }
}
