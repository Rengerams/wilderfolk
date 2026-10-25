import { EntityType, LEADER_OCCUPATION, BuildingType } from './gameTypes';
import type { Building, Entity } from './gameTypes';
import type { GenealogyRegistry } from './genealogyTypes';
import type { ResidenceOccupancy } from './residencyOccupancy';
import { findLivingHuman, collectFamilyMembers, collectMinorHousehold, collectOwnHousehold, indexFamilyRelations, isMinorChild, isAdultChildAtHome, getChildCustodian } from './householdComposition';
import { isResidenceBuilding, isLeaderHouseResidence, getResidenceCapacity, hasResidenceAssignment, buildResidenceOccupancy, occupancyMove, isImprisoned, isResidenceOccupantEntity, residenceRoomFor, countResidentsInBuilding } from './residencyOccupancy';
import { listPlayerResidences, familyFitsInResidence, pickResidenceForFamily, pickResidenceForHuman, pickResidenceFromChildCustodian, buildHousingUnits, housingUnitBucket, housingUnitNeedsReassignment, sortHousingUnitsForAssignment, pickLeastCrowdedResidence, buildResidenceTraits, residenceTraitMove, pickCommuteRelocation, buildCommuteRelocationIndex, MAX_RELOCATIONS_PER_DAY } from './residencySelection';
import type { ResidenceTraitsById } from './residencySelection';
import { beginCommuteRoutePass } from './commuteReach';
import { isPlayerHuman } from './playerHuman';
import { SPECIES_CONFIG } from './speciesConfig';
import { TICKS_PER_DAY } from './dayCycleClock';
import { HUMAN_ADULT_MIN_AGE } from './daycycleconstants';

export type ResidenceMoveReason = 'assignment' | 'family' | 'guardian' | 'commute' | 'leader'
  | 'departure' | 'birth' | 'death' | 'demolition' | 'load' | 'moon-form' | 'divorce' | 'prison' | 'player';

/** Decision order: mandatory corrections before optional improvements; `leader` (the manor hold) first. */
export const HOUSING_PHASE_ORDER = ['leader', 'integrity', 'guardianship', 'capacity', 'homeless', 'adult-child', 'commute'] as const;
export type HousingPhase = (typeof HOUSING_PHASE_ORDER)[number];

const MANDATORY_PHASES: ReadonlySet<HousingPhase> = new Set<HousingPhase>([
  'leader', 'integrity', 'guardianship', 'homeless', 'capacity',
]);

export interface HousingRelocation {
  phase: HousingPhase;
  reason: ResidenceMoveReason;
  members: number[];
  from?: number;
  to?: number;
}

export interface HousingReport {
  relocations: HousingRelocation[];
  /** Optional moves withheld because a mandatory phase already decided that household. */
  protectedUnits: number;
  violations: string[];
}

/** One run's decisions: which phase settled a household, the homes it already held, and the log. */
export interface HousingLedger {
  settled: Map<number, HousingPhase>;
  visited: Map<number, Set<number>>;
  report: HousingReport;
  /** Residence per settler when the running phase began, so its moves can be logged. */
  before: Map<number, number | undefined>;
  /** Destination a recorded household move already logged, so the phase diff does not repeat it. */
  reported: Map<number, number | undefined>;
}

export function createHousingLedger(): HousingLedger {
  return {
    settled: new Map(),
    visited: new Map(),
    report: { relocations: [], protectedUnits: 0, violations: [] },
    before: new Map(),
    reported: new Map(),
  };
}

/** Optional decisions cannot override mandatory repairs or an earlier optional phase in this run. */
export function isHousingUnitProtected(ledger: HousingLedger, unit: readonly Entity[], phase: HousingPhase): boolean {
  if (MANDATORY_PHASES.has(phase)) return false;
  const phaseIndex = HOUSING_PHASE_ORDER.indexOf(phase);
  for (const member of unit) {
    const settledBy = ledger.settled.get(member.id);
    if (settledBy !== undefined
      && (MANDATORY_PHASES.has(settledBy) || HOUSING_PHASE_ORDER.indexOf(settledBy) < phaseIndex)) {
      ledger.report.protectedUnits += 1;
      return true;
    }
  }
  return false;
}

/** Whole-household guard: a minor never lands anywhere their living custodian is not. */
function custodianTravelsAlong(unit: readonly Entity[], toId: number | undefined, humans: Entity[], residences: Building[]): boolean {
  for (const member of unit) {
    if (!isMinorChild(member)) continue;
    const custodian = getChildCustodian(member, humans);
    if (!custodian || unit.some((other) => other.id === custodian.id)) continue;
    if (custodian.residenceBuildingId === toId) continue;
    const destination = residences.find((building) => building.id === toId);
    const custodianHome = residences.find((building) => building.id === custodian.residenceBuildingId);
    if (destination && custodianHome && isLeaderHouseResidence(destination)
      && isLeaderHouseResidence(custodianHome)) continue;
    return false;
  }
  return true;
}

export interface HousingMoveContext {
  alive: Entity[];
  residences: Building[];
  buildings: Building[];
  occupancy: ResidenceOccupancy;
  traits: ResidenceTraitsById;
  ledger: HousingLedger;
}

/** The context a caller outside the pipeline gets: one run of its own over the inputs it holds. */
export function standaloneMoveContext(
  alive: Entity[],
  residences: Building[],
  occupancy?: ResidenceOccupancy,
  traits?: ResidenceTraitsById,
  ledger: HousingLedger = createHousingLedger(),
): HousingMoveContext {
  return {
    alive,
    residences,
    buildings: residences,
    occupancy: occupancy ?? buildResidenceOccupancy(alive),
    traits: traits ?? buildResidenceTraits(alive),
    ledger,
  };
}

const ORDINARY_MOVE_REASONS: ReadonlySet<ResidenceMoveReason> = new Set<ResidenceMoveReason>([
  'assignment', 'family', 'guardian', 'commute', 'player',
]);

/** The residence write's own guard, exposed so a household can be checked member by member. */
function residenceMoveRefused(
  human: Entity,
  toId: number | undefined,
  reason: ResidenceMoveReason,
  buildings?: Building[],
): boolean {
  if (human.residenceBuildingId === toId) return false;
  const previous = buildings?.find((building) => building.id === human.residenceBuildingId);
  const target = buildings?.find((building) => building.id === toId);
  if (previous && isLeaderHouseResidence(previous) && ORDINARY_MOVE_REASONS.has(reason)) return true;
  if (target && (!isResidenceBuilding(target) || target.faction === 'rival')) return true;
  if (target && isLeaderHouseResidence(target) && !['leader', 'birth', 'moon-form'].includes(reason)) return true;
  return false;
}

/** The joint checks every whole-household relocation passes before any member's residence moves. */
function householdMayMove(
  unit: readonly Entity[],
  toId: number | undefined,
  reason: ResidenceMoveReason,
  context: HousingMoveContext,
): boolean {
  if (toId !== undefined) {
    const target = context.residences.find((residence) => residence.id === toId);
    if (!target || !target.completed || target.faction === 'rival') return false;
    if (isLeaderHouseResidence(target) && !['leader', 'birth', 'moon-form'].includes(reason)) return false;
    if (unit.some((member) => context.ledger.visited.get(member.id)?.has(toId))) return false;
    // The manor hold is unconditional: like the capacity rebalance, it never counts the bed cap.
    const manorHold = reason === 'leader' && isLeaderHouseResidence(target);
    if (!manorHold && !familyFitsInResidence([...unit], target, context.alive, context.occupancy)) return false;
  }
  return custodianTravelsAlong(unit, toId, context.alive, context.residences);
}

/** Applies one validated household move through the sole residence write. */
function applyHouseholdMove(
  unit: readonly Entity[],
  toId: number | undefined,
  context: HousingMoveContext,
): void {
  for (const member of unit) {
    writeResidence(member, toId, { occupancy: context.occupancy, traits: context.traits, buildings: context.buildings });
  }
}

/** The only place a housing decision becomes a residence write; a refused move leaves everyone put. */
export function relocateHousehold(
  unit: readonly Entity[],
  toId: number | undefined,
  phase: HousingPhase,
  reason: ResidenceMoveReason,
  context: HousingMoveContext,
): boolean {
  if (unit.length === 0) return false;
  if (isHousingUnitProtected(context.ledger, unit, phase)) return false;
  if (!householdMayMove(unit, toId, reason, context)) return false;
  // All-or-nothing: one member the write would refuse cancels the move before anyone leaves.
  if (unit.some((member) => residenceMoveRefused(member, toId, reason, context.buildings))) return false;
  const relocated = unit.some((member) => member.residenceBuildingId !== toId);
  const fromId = unit.find((member) => member.residenceBuildingId != null)?.residenceBuildingId;
  const homes = unit.map((member) => member.residenceBuildingId);
  applyHouseholdMove(unit, toId, context);
  // A member left behind means a partial write: restore the others instead of reporting a split home.
  if (unit.some((member) => member.residenceBuildingId !== toId)) {
    for (let index = 0; index < unit.length; index += 1) {
      if (unit[index].residenceBuildingId !== homes[index]) writeResidence(unit[index], homes[index], context);
    }
    return false;
  }
  for (const member of unit) {
    const visited = context.ledger.visited.get(member.id) ?? new Set<number>();
    if (fromId !== undefined) visited.add(fromId);
    if (toId !== undefined) visited.add(toId);
    context.ledger.visited.set(member.id, visited);
    context.ledger.settled.set(member.id, phase);
    context.ledger.reported.set(member.id, member.residenceBuildingId);
  }
  // A household already at the destination is settled, not relocated: nothing to report.
  if (relocated) {
    const relocation: HousingRelocation = { phase, reason, members: unit.map((member) => member.id) };
    if (fromId !== undefined) relocation.from = fromId;
    if (toId !== undefined) relocation.to = toId;
    context.ledger.report.relocations.push(relocation);
  }
  return true;
}

function snapshotResidences(alive: readonly Entity[], into: Map<number, number | undefined>): void {
  into.clear();
  for (const settler of alive) into.set(settler.id, settler.residenceBuildingId);
}

/** Opens one phase of the housing pipeline; `endHousingPhase` logs whatever it moved. */
function beginHousingPhase(ledger: HousingLedger, alive: readonly Entity[]): void {
  snapshotResidences(alive, ledger.before);
  ledger.reported.clear();
}

/** Runs one phase through the run's ledger, whether the sweep calls it or an event needs it alone. */
export function runHousingPhase(
  ledger: HousingLedger,
  phase: HousingPhase,
  alive: readonly Entity[],
  run: () => void,
): void {
  beginHousingPhase(ledger, alive);
  run();
  endHousingPhase(ledger, phase, alive);
}

/**
 * Closes a phase: every settler it moved is logged once and marked settled, so a later optional
 * phase cannot undo the decision that placed them.
 */
function endHousingPhase(ledger: HousingLedger, phase: HousingPhase, alive: readonly Entity[]): void {
  const movedByPhase = new Map<string, { from?: number; to?: number; members: number[] }>();
  for (const settler of alive) {
    const from = ledger.before.get(settler.id);
    const to = settler.residenceBuildingId;
    if (from === to) continue;
    // A household decision already logged this settler where they still are.
    if (ledger.reported.get(settler.id) === to) continue;
    const entry = movedByPhase.get(`${from}->${to}`) ?? { members: [] };
    if (from !== undefined) entry.from = from;
    if (to !== undefined) entry.to = to;
    entry.members.push(settler.id);
    movedByPhase.set(`${from}->${to}`, entry);
    const visited = ledger.visited.get(settler.id) ?? new Set<number>();
    if (from !== undefined) visited.add(from);
    if (to !== undefined) visited.add(to);
    ledger.visited.set(settler.id, visited);
    ledger.settled.set(settler.id, phase);
  }
  for (const entry of movedByPhase.values()) {
    const relocation: HousingRelocation = { phase, reason: phase === 'commute' ? 'commute' : 'assignment', members: entry.members };
    if (entry.from !== undefined) relocation.from = entry.from;
    if (entry.to !== undefined) relocation.to = entry.to;
    ledger.report.relocations.push(relocation);
  }
}

/** Unchecked residence write: keeps the occupancy index, traits and occupant rosters consistent. */
function writeResidence(
  human: Entity,
  toId: number | undefined,
  context: { occupancy?: ResidenceOccupancy; traits?: ResidenceTraitsById; buildings?: Building[] } = {},
): void {
  const fromId = human.residenceBuildingId;
  if (fromId === toId) return;
  const previous = context.buildings?.find((building) => building.id === fromId);
  const target = context.buildings?.find((building) => building.id === toId);
  if (context.occupancy) occupancyMove(context.occupancy, fromId, toId);
  if (context.traits) residenceTraitMove(context.traits, human, fromId, toId);
  human.residenceBuildingId = toId;
  if (context.buildings) {
    if (previous && isResidenceBuilding(previous)) previous.occupants = previous.occupants.filter((id) => id !== human.id);
    if (target && isResidenceBuilding(target) && isResidenceOccupantEntity(human) && !target.occupants.includes(human.id)) {
      target.occupants.push(human.id);
    }
  }
}

/** The sole residence write for one settler; refuses what the leader-house and rival rules forbid. */
export function moveResident(
  human: Entity,
  toId: number | undefined,
  reason: ResidenceMoveReason,
  context: { occupancy?: ResidenceOccupancy; traits?: ResidenceTraitsById; buildings?: Building[] } = {},
): void {
  if (human.residenceBuildingId === toId) return;
  if (residenceMoveRefused(human, toId, reason, context.buildings)) return;
  writeResidence(human, toId, context);
}

export function rebuildChildrenIds(humans: Entity[]): void {
  const childSets = new Map<number, Set<number>>();

  for (const human of humans) {
    if (human.type !== EntityType.Human) continue;
    human.childrenIds = [];
    childSets.set(human.id, new Set());
  }

  for (const child of humans) {
    if (!child.alive || child.type !== EntityType.Human) continue;
    if (child.motherId) childSets.get(child.motherId)?.add(child.id);
    if (child.fatherId) childSets.get(child.fatherId)?.add(child.id);
    if (child.adoptiveMotherId) childSets.get(child.adoptiveMotherId)?.add(child.id);
    if (child.adoptiveFatherId) childSets.get(child.adoptiveFatherId)?.add(child.id);
  }

  for (const human of humans) {
    if (human.type !== EntityType.Human) continue;
    const ids = childSets.get(human.id);
    if (ids && ids.size > 0) human.childrenIds = [...ids];
  }
}
/** Homes an eviction may rehouse a household into — never the manor, a rival camp or an unfinished site. */
function evictionTargets(residences: Building[]): Building[] {
  return listPlayerResidences(residences).filter((home) => !isLeaderHouseResidence(home));
}

/** Repair a shortage in order: unrelated residents, whole household, then the father elsewhere. */
export function rebalanceOvercrowdedResidences(
  humans: Entity[],
  residences: Building[],
  ledger: HousingLedger = createHousingLedger(),
): boolean {
  const occupancy = buildResidenceOccupancy(humans);
  // Classify capacity work before building costly household groups and traits.
  if (!residences.some((home) => !isLeaderHouseResidence(home)
    && (occupancy.get(home.id) ?? 0) > getResidenceCapacity(home))) return false;
  const traits = buildResidenceTraits(humans);
  const context = standaloneMoveContext(humans, residences, occupancy, traits, ledger);
  // A prisoner's bed stays reserved: they count for capacity but never move in the rebalance.
  const movable = humans.filter((human) => !isImprisoned(human));
  const units = buildHousingUnits(movable);
  const targets = evictionTargets(residences);
  let moved = false;
  for (const residence of residences) {
    if (isLeaderHouseResidence(residence)) continue;
    const cap = getResidenceCapacity(residence);
    if ((occupancy.get(residence.id) ?? 0) <= cap) continue;
    const alternatives = targets.filter((home) => home.id !== residence.id);
    const occupants = [...(traits.get(residence.id)?.occupants.values() ?? [])]
      .filter((member) => !isImprisoned(member));
    const dependentUnit = units.filter((unit) => unit.some((member) => isMinorChild(member)
      && member.residenceBuildingId === residence.id)).sort((a, b) => b.length - a.length)[0];
    if (dependentUnit) {
      const familyIds = new Set(dependentUnit.map((member) => member.id));
      for (const outsider of occupants.filter((member) => !familyIds.has(member.id))) {
        if (outsider.residenceBuildingId !== residence.id) continue;
        const unit = units.find((candidate) => candidate.includes(outsider)) ?? [outsider];
        const target = pickResidenceForFamily(unit, humans, alternatives, occupancy, traits);
        if (target === undefined) continue;
        if (relocateHousehold(unit, target, 'capacity', 'family', context)) moved = true;
        if ((occupancy.get(residence.id) ?? 0) <= cap) break;
      }
      if ((occupancy.get(residence.id) ?? 0) <= cap) continue;
      const target = pickResidenceForFamily(dependentUnit, humans, alternatives, occupancy, traits);
      if (target !== undefined) {
        if (relocateHousehold(dependentUnit, target, 'capacity', 'family', context)) moved = true;
        continue;
      }
      for (const outsider of occupants.filter((member) => !familyIds.has(member.id))) {
        if (outsider.residenceBuildingId !== residence.id) continue;
        const unit = units.find((candidate) => candidate.includes(outsider)) ?? [outsider];
        const surplus = unit.filter((member) => member.residenceBuildingId === residence.id);
        if (surplus.length === 0) continue;
        if (relocateHousehold(surplus, undefined, 'capacity', 'family', context)) moved = true;
        if ((occupancy.get(residence.id) ?? 0) <= cap) break;
      }
      const before = dependentUnit.map((member) => member.residenceBuildingId);
      assignFamilyToResidence(dependentUnit, humans, targets, humans, 'capacity', context);
      moved ||= dependentUnit.some((member, index) => member.residenceBuildingId !== before[index]);
      continue;
    }
    const visited = new Set<number>();
    const relations = indexFamilyRelations(occupants);
    const groups = occupants.sort((a, b) => a.id - b.id).flatMap((occupant) => visited.has(occupant.id)
      ? [] : [collectFamilyMembers(occupant, occupants, visited, relations)]).sort((a, b) => b.length - a.length);
    let kept = (occupancy.get(residence.id) ?? 0) - occupants.length;
    for (const group of groups) {
      if (kept + group.length <= cap) { kept += group.length; continue; }
      if (relocateHousehold(group, undefined, 'capacity', 'family', context)) moved = true;
    }
  }
  return moved;
}


/** Player settler in human or cursed full-moon werewolf form — counts for residence sync. */
export { isResidenceOccupantEntity } from './residencyOccupancy';

/**
 * Keep house/mansion occupants in sync with residenceBuildingId for the UI.
 *
 * One forward pass over `humans` buckets occupant ids by residence instead of re-scanning the
 * whole array once per residence. The occupant id **order** is unchanged: the per-building
 * `.filter().map()` this replaces emitted ids in `humans` order, and appending to a building's
 * bucket during the single forward pass emits exactly that order
 * (`tests/residencyReconciliation.occupantOrder.test.ts` pins it).
 */
export function syncResidenceOccupants(humans: Entity[], buildings: Building[]): void {
  const occupantsByResidenceId = new Map<number, number[]>();
  for (const human of humans) {
    if (!isResidenceOccupantEntity(human)) continue;
    const residenceId = human.residenceBuildingId;
    if (residenceId == null) continue;
    const occupants = occupantsByResidenceId.get(residenceId);
    if (occupants) occupants.push(human.id);
    else occupantsByResidenceId.set(residenceId, [human.id]);
  }

  for (const building of buildings) {
    if (!isResidenceBuilding(building) || building.faction === 'rival') continue;
    building.occupants = occupantsByResidenceId.get(building.id) ?? [];
  }
}

/** Place a family — keeps children with custodian; only splits when no home fits everyone. */
function assignFamilyToResidence(
  family: Entity[],
  alive: Entity[],
  residences: Building[],
  allHumans: Entity[],
  phase: HousingPhase,
  context: HousingMoveContext,
): void {
  const { occupancy, traits } = context;
  // A family that fits nowhere falls through to the split path below; the old
  // `?? pickSharedResidenceForFamily(...)` fallback re-ran the same fit test over the same
  // residences, so it could never contribute a placement.
  const picked = pickResidenceForFamily(family, alive, residences, occupancy, traits);
  if (picked !== undefined) {
    relocateHousehold(family, picked, phase, 'assignment', context);
    return;
  }

  const children = family.filter(isMinorChild);
  const guardian = children.length > 0 ? getChildCustodian(children[0], allHumans) : undefined;
  if (guardian && family.includes(guardian)) {
    const core = family.filter((member) => member.id === guardian.id || isMinorChild(member));
    const otherAdults = family.filter((member) => !core.includes(member));
    for (const adult of otherAdults) {
      if (adult.residenceBuildingId != null && adult.residenceBuildingId === guardian.residenceBuildingId) {
        relocateHousehold([adult], undefined, phase, 'family', context);
      }
    }
    const existing = residences.find((home) => home.id === guardian.residenceBuildingId && !isLeaderHouseResidence(home));
    const coreHome = (existing && familyFitsInResidence(core, existing, alive, occupancy) ? existing.id : undefined)
      ?? pickResidenceForFamily(core, alive, residences, occupancy, traits);
    // Without a home for the dependent group, keep it together unhoused rather than overfill or split it.
    relocateHousehold(core, coreHome, phase, 'family', context);
    for (const adult of otherAdults) {
      if (hasResidenceAssignment(adult)) continue;
      relocateHousehold([adult], pickResidenceForHuman(adult, alive, residences, occupancy, traits),
        phase, 'family', context);
    }
    return;
  }
  for (const member of family) {
    relocateHousehold([member], pickResidenceForHuman(member, alive, residences, occupancy, traits),
      phase, 'family', context);
  }
}

function fillHomelessAfterEviction(
  alive: Entity[],
  residences: Building[],
  occupancy: ResidenceOccupancy,
  traits: ResidenceTraitsById,
  ledger: HousingLedger,
): void {
  // Avoid rebuilding household relations when there is nobody left to house.
  if (!alive.some((human) => !hasResidenceAssignment(human))) return;
  const context = standaloneMoveContext(alive, residences, occupancy, traits, ledger);
  for (const unit of buildHousingUnits(alive)) {
    if (unit.every(hasResidenceAssignment)) continue;
    assignFamilyToResidence(unit, alive, residences, alive, 'homeless', context);
  }
}

/**
 * Sweep buckets per day — one per assignment pulse.
 *
 * `assignMissingResidences` with a tick sweeps only the units whose bucket that pulse owns, so a day
 * of reassignment work is spread across the day instead of landing whole on the day boundary. It must
 * equal the assignment layer's pulses per day (`TICKS_PER_DAY / LAYER_ASSIGN_INTERVAL`, 72 / 18 = 4)
 * or a bucket would never come round; the guard test pins that coupling.
 */
export const RESIDENCE_SWEEP_BUCKETS = 4;

/** The bucket one assignment pulse owns: the day's pulse index. */
function activeSweepBucket(tick: number): number {
  const tickOfDay = ((tick % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY;
  return Math.floor((tickOfDay * RESIDENCE_SWEEP_BUCKETS) / TICKS_PER_DAY);
}

/**
 * Seat every settler who has no residence, repair every housing unit that is wrongly placed.
 *
 * `allHumansForGenealogy` widens the family pool and the bed count beyond the settlers being seated:
 * a settler who may not move still occupies a bed. With no `sweepTick`
 * the whole colony converges at once — a load, a player command or an event must not wait for a
 * bucket to come round. With one, only that pulse's bucket of already-housed units is swept; the
 * eviction rebalance and the homeless fill below stay global on every call, so a settler who loses a
 * bed is never left outside until the next cycle. `leaderPhase` supplies the manor hold's decision, run
 * as the first phase on this run's ledger so housing stays one ordered process.
 */
export function assignMissingResidences(
  humans: Entity[],
  buildings: Building[],
  allHumansForGenealogy?: Entity[],
  sweepTick?: number,
  genealogy?: GenealogyRegistry,
  leaderPhase?: (ledger: HousingLedger) => void,
): HousingReport {
  const residences = listPlayerResidences(buildings);
  const ledger = createHousingLedger();
  if (residences.length === 0) return ledger.report;

  for (const h of humans) {
    if (!h.alive) moveResident(h, undefined, 'death');
  }

  const alive = humans.filter((h) => h.alive && isPlayerHuman(h) && !isImprisoned(h));
  // A jailed settler keeps a reserved bed, counted here with the residents this call may not move.
  const residents = (allHumansForGenealogy ?? humans).filter(
    (h) => h.alive && isResidenceOccupantEntity(h),
  );
  const genealogyPool = (allHumansForGenealogy ?? humans).filter(
    (h) => h.type === EntityType.Human || isResidenceOccupantEntity(h),
  );

  rebuildChildrenIds(genealogyPool);

  // Phase 1 — leader: the manor hold decides on this sweep's own ledger, before any other phase.
  if (leaderPhase) runHousingPhase(ledger, 'leader', alive, () => leaderPhase(ledger));

  // Phase 2 — integrity: a reference to a home that is gone or was never a home is not an assignment.
  runHousingPhase(ledger, 'integrity', alive, () => {
    const residenceIds = new Set<number>();
    for (const residence of residences) residenceIds.add(residence.id);
    for (const human of alive) {
      const residenceId = human.residenceBuildingId;
      if (residenceId != null && !residenceIds.has(residenceId)) {
        moveResident(human, undefined, 'assignment');
      }
    }
  });

  // Phase 3 — guardianship: a dependent child is placed with a custodian before any optimisation.
  runHousingPhase(ledger, 'guardianship', alive, () => {
    for (const human of alive) {
      if (isMinorChild(human)) ensureOrphanAdoption(human, genealogyPool, residences, undefined, undefined, genealogy, ledger);
    }
  });

  // Phase 4 — capacity: relieve an over-full home before anyone new is seated in the colony.
  runHousingPhase(ledger, 'capacity', alive, () => {
    rebalanceOvercrowdedResidences(residents, residences, ledger);
  });

  // Family structure is static while we converge on residence slots — build the
  // housing units ONCE instead of every pass (was 24× full rebuilds per call).
  const leaderHouseIds = new Set(residences.filter(isLeaderHouseResidence).map((residence) => residence.id));
  const housingUnitsBase = buildHousingUnits(alive).filter((unit) => !unit.some((member) =>
    member.residenceBuildingId != null && leaderHouseIds.has(member.residenceBuildingId),
  ));

  // Phase 5 — homeless: seat every household the colony has beds for, relieving capacity as it goes.
  beginHousingPhase(ledger, alive);
  if (sweepTick === undefined) {
    for (let pass = 0; pass < 24; pass++) {
      let reassigned = 0;
      // One occupancy scan per pass — O(H) then O(1) counts (EK-E2) — and one trait walk beside it,
      // threaded through every pick below instead of rebuilt per pick (F-SIM-9).
      const occupancy = buildResidenceOccupancy(residents);
      const traits = buildResidenceTraits(residents);
      const context = standaloneMoveContext(alive, residences, occupancy, traits, ledger);
      const housingUnits = sortHousingUnitsForAssignment(
        housingUnitsBase,
        alive,
        residences,
        occupancy,
        traits,
      );
      for (const unit of housingUnits) {
        if (!housingUnitNeedsReassignment(unit, alive, residences, occupancy, traits)) continue;

        assignFamilyToResidence(unit, alive, residences, genealogyPool, 'homeless', context);
        reassigned++;
      }
      const evicted = rebalanceOvercrowdedResidences(residents, residences, ledger);
      if (evicted) {
        // Rebalance clears residences without the maps — rebuild both before fill.
        const afterEvict = buildResidenceOccupancy(residents);
        const traitsAfterEvict = buildResidenceTraits(residents);
        fillHomelessAfterEviction(alive, residences, afterEvict, traitsAfterEvict, ledger);
      }
      if (reassigned === 0 && !evicted) break;
    }
  } else {
    // A pulse visits only its own quarter of the housing units. Several units
    // can depend on the same available house, so re-evaluate this bucket after
    // the first round rather than postponing a newly feasible move for a day.
    const bucket = activeSweepBucket(sweepTick);
    const sweepUnits = housingUnitsBase.filter(
      (unit) => housingUnitBucket(unit, RESIDENCE_SWEEP_BUCKETS) === bucket,
    );
    for (let pass = 0; pass < 3; pass++) {
      const occupancy = buildResidenceOccupancy(residents);
      const traits = buildResidenceTraits(residents);
      const context = standaloneMoveContext(alive, residences, occupancy, traits, ledger);
      const orderedUnits = sortHousingUnitsForAssignment(sweepUnits, alive, residences, occupancy, traits);
      let moved = false;
      for (const unit of orderedUnits) {
        if (!housingUnitNeedsReassignment(unit, alive, residences, occupancy, traits)) continue;

        assignFamilyToResidence(unit, alive, residences, genealogyPool, 'homeless', context);
        moved = true;
      }
      if (!moved) break;
    }
    if (rebalanceOvercrowdedResidences(residents, residences, ledger)) {
      const afterEvict = buildResidenceOccupancy(residents);
      const traitsAfterEvict = buildResidenceTraits(residents);
      fillHomelessAfterEviction(alive, residences, afterEvict, traitsAfterEvict, ledger);
    }

    // Earlier buckets can acquire a newly available house only after later
    // buckets release it. At the final daily pulse, revisit those units once
    // against the now-current occupancy. This removes the one-day delay without
    // re-running the expensive 24-pass unsplit allocator every tick.
    if (bucket === RESIDENCE_SWEEP_BUCKETS - 1) {
      const occupancy = buildResidenceOccupancy(residents);
      const traits = buildResidenceTraits(residents);
      const context = standaloneMoveContext(alive, residences, occupancy, traits, ledger);
      const ordered = sortHousingUnitsForAssignment(housingUnitsBase, alive, residences, occupancy, traits);
      for (const unit of ordered) {
        if (!housingUnitNeedsReassignment(unit, alive, residences, occupancy, traits)) continue;
        assignFamilyToResidence(unit, alive, residences, genealogyPool, 'homeless', context);
      }
    }
  }
  endHousingPhase(ledger, 'homeless', alive);

  // Phase 6 — adult-child: an option, never a duty; withheld for a household a mandatory phase settled.
  runHousingPhase(ledger, 'adult-child', alive, () => {
    // Reserved beds count here too: a home a prisoner still holds is not a vacant target.
    rebalanceAdultChildrenFromFamilyHomeWhenEmptyAvailable(
      alive, residences, buildResidenceOccupancy(residents), ledger,
    );
  });

  // Phase 7 — commute: the daily optional improvement, last, thresholded and capped.
  if (sweepTick !== undefined && activeSweepBucket(sweepTick) === RESIDENCE_SWEEP_BUCKETS - 1) {
    runHousingPhase(ledger, 'commute', alive, () => {
      relocateHouseholdsForCommute(
        housingUnitsBase, alive, residences, buildings,
        buildResidenceOccupancy(residents), buildResidenceTraits(residents), ledger,
      );
    });
  }

  fillHomelessAfterEviction(
    alive, residences, buildResidenceOccupancy(residents), buildResidenceTraits(residents), ledger,
  );

  syncResidenceOccupants(
    (allHumansForGenealogy ?? humans).filter(isResidenceOccupantEntity),
    buildings,
  );

  ledger.report.violations = collectHousingInvariantViolations(alive, residents, residences);
  return ledger.report;
}

/** Post-pass invariant audit: what the authoritative boundary promises, checked on its own output. */
function collectHousingInvariantViolations(
  alive: Entity[],
  residents: Entity[],
  residences: Building[],
): string[] {
  const violations: string[] = [];
  const residenceById = new Map(residences.map((residence) => [residence.id, residence]));
  const occupancy = buildResidenceOccupancy(residents);
  for (const settler of residents) {
    const homeId = settler.residenceBuildingId;
    if (homeId != null && !residenceById.has(homeId)) violations.push(`settler #${settler.id} references missing home #${homeId}`);
  }
  for (const residence of residences) {
    if (isLeaderHouseResidence(residence)) continue;
    const count = occupancy.get(residence.id) ?? 0;
    if (count > getResidenceCapacity(residence)) violations.push(`home #${residence.id} holds ${count} over ${getResidenceCapacity(residence)} beds`);
  }
  for (const child of residents) {
    if (!isMinorChild(child)) continue;
    const custodian = getChildCustodian(child, alive);
    if (!custodian || child.residenceBuildingId == null) continue;
    if (custodian.residenceBuildingId !== child.residenceBuildingId
      && !(residences.some((building) => building.id === custodian.residenceBuildingId && isLeaderHouseResidence(building))
        && residences.some((building) => building.id === child.residenceBuildingId && isLeaderHouseResidence(building)))) {
      violations.push(`child #${child.id} lives apart from custodian #${custodian.id}`);
    }
  }
  return violations;
}

/** The daily commute sweep; exposed to the existing population benchmark. */
export function relocateHouseholdsForCommute(
  units: Entity[][],
  alive: Entity[],
  residences: Building[],
  buildings: Building[],
  occupancy: ResidenceOccupancy,
  traits: ResidenceTraitsById,
  ledger?: HousingLedger,
): void {
  const decisions = ledger ?? createHousingLedger();
  // Do not build the route index or price a journey when every unit was already settled.
  const eligibleUnits = units.filter((unit) => !isHousingUnitProtected(decisions, unit, 'commute'));
  if (eligibleUnits.length === 0) return;
  const index = buildCommuteRelocationIndex(residences, buildings, occupancy);
  if (index.vacant.length === 0) return;
  const cache = new Map<string, number>();
  beginCommuteRoutePass();
  const walkSpeed = SPECIES_CONFIG[EntityType.Human].speed;
  const context: HousingMoveContext = { alive, residences, buildings, occupancy, traits, ledger: decisions };
  let relocated = 0;
  for (const unit of eligibleUnits) {
    if (relocated >= MAX_RELOCATIONS_PER_DAY) return;
    const better = pickCommuteRelocation(unit, alive, residences, buildings, occupancy, cache, walkSpeed, index);
    if (better === undefined) continue;
    const previousId = unit[0]?.residenceBuildingId;
    if (!relocateHousehold(unit, better, 'commute', 'commute', context)) continue;
    relocated += 1;
    index.vacant = index.vacant.filter((residence) => residence.id !== better);
    const previous = previousId == null ? undefined : index.residencesById.get(previousId);
    if (previous && (occupancy.get(previous.id) ?? 0) === 0) {
      index.vacant.push(previous);
      index.vacant.sort((a, b) => index.order.get(a.id)! - index.order.get(b.id)!);
    }
  }
}

/** When settlers partner up, move them into a couple's home (empty house preferred). */
export function syncPartnerResidence(
  human: Entity,
  partner: Entity,
  residences: Building[],
  humans: Entity[],
): void {
  if (residences.length === 0) return;

  // Couple + housing-minor kids only — adult children who moved out stay put (EK-E5).
  const household: Entity[] = [human, partner];
  for (const member of collectOwnHousehold(human, humans)) {
    if (member.id === human.id || member.id === partner.id) continue;
    if (!isMinorChild(member)) continue;
    household.push(member);
  }

  const context = standaloneMoveContext(humans, residences);
  const familyHome = pickResidenceForFamily(household, humans, residences);
  if (familyHome !== undefined && relocateHousehold(household, familyHome, 'homeless', 'family', context)) return;

  // No home fits the whole family, so only the couple moves — one mover may already live there.
  const coupleHome = pickLeastCrowdedResidence(humans, residences, 2, {}, undefined, [human, partner]);
  if (coupleHome === undefined) return;
  if (!relocateHousehold([human, partner], coupleHome, 'homeless', 'family', context)) return;

  // A minor child then follows into a home that has room for them, by the child-custodian rule.
  for (const member of household) {
    if (member.residenceBuildingId === coupleHome) continue;
    if (pickResidenceFromChildCustodian(member, humans, residences) !== coupleHome) continue;
    relocateHousehold([member], coupleHome, 'guardianship', 'guardian', context);
  }
}

/** A jailed parent is away, not gone: custody is borrowed until the sentence ends. */
function freeParent(humans: Entity[], id: number | undefined): Entity | undefined {
  const parent = findLivingHuman(humans, id);
  return parent && !isImprisoned(parent) ? parent : undefined;
}

/** A jail sentence borrows custody: on release the parent takes their minors back. */
export function restoreCustodyAfterRelease(parent: Entity, humans: Entity[]): Entity[] {
  if (parent.prisonBuildingId != null) return [];
  const returned: Entity[] = [];
  for (const child of humans) {
    if (!child.alive || !isMinorChild(child)) continue;
    if (child.motherId !== parent.id && child.fatherId !== parent.id) continue;
    // Only a stand-in taken because of the sentence ends here; an adoption after a death stays.
    if (![child.motherId, child.fatherId].every((id) => id == null || findLivingHuman(humans, id))) continue;
    child.adoptiveMotherId = undefined;
    child.adoptiveFatherId = undefined;
    returned.push(child);
  }
  return returned;
}

function livingAdoptiveCustodian(child: Entity, humans: Entity[]): Entity | undefined {
  return [child.adoptiveMotherId, child.adoptiveFatherId].map((id) => findLivingHuman(humans, id))
    .find((guardian) => guardian && isResidenceOccupantEntity(guardian) && !isImprisoned(guardian));
}

/** Ordinary couples eligible to adopt; the sitting leader's couple is never a candidate. */
function listVillageCouples(humans: Entity[]): Array<{ mother?: Entity; father?: Entity; partnerA: Entity; partnerB: Entity }> {
  const alive = humans.filter((h) => h.alive && isPlayerHuman(h) && !isImprisoned(h));
  const couples: Array<{ mother?: Entity; father?: Entity; partnerA: Entity; partnerB: Entity }> = [];
  const seen = new Set<number>();

  for (const human of alive.sort((a, b) => a.id - b.id)) {
    if (seen.has(human.id)) continue;
    const partner = findLivingHuman(alive, human.partnerId);
    if (!partner) continue;
    seen.add(human.id);
    seen.add(partner.id);

    if (human.occupation === LEADER_OCCUPATION || partner.occupation === LEADER_OCCUPATION) continue;

    const mother = human.gender === 'female' ? human : partner.gender === 'female' ? partner : undefined;
    const father = human.gender === 'male' ? human : partner.gender === 'male' ? partner : undefined;
    couples.push({ mother, father, partnerA: human, partnerB: partner });
  }

  return couples;
}

function listVillageSingleAdults(humans: Entity[]): Entity[] {
  const candidates = humans.filter(
    (h) =>
      h.alive
      && isPlayerHuman(h)
      && !h.isJuvenile
      && h.age >= HUMAN_ADULT_MIN_AGE
      && !isImprisoned(h)
      && h.occupation !== LEADER_OCCUPATION,
  );
  // Partner lookup includes the leader, so their spouse cannot appear as a single guardian.
  return candidates.filter((h) => !findLivingHuman(humans, h.partnerId));
}

export function placeOrphanInHouse(
  child: Entity,
  humans: Entity[],
  residences: Building[],
  occupancy?: ResidenceOccupancy,
  traits?: ResidenceTraitsById,
): boolean {
  const alive = humans.filter((h) => h.alive && isPlayerHuman(h));
  if (hasResidenceAssignment(child)) {
    const current = residences.find((b) => b.id === child.residenceBuildingId);
    if (current && !isLeaderHouseResidence(current) && residenceRoomFor(child, current, alive, occupancy)) return true;
  }

  const picked =
    pickResidenceForFamily([child], alive, residences, occupancy, traits) ??
    pickLeastCrowdedResidence(alive, residences, 1, { forbidSinglesOnly: true }, occupancy, [], traits);
  if (picked === undefined) return false;

  return relocateHousehold([child], picked, 'guardianship', 'guardian',
    standaloneMoveContext(alive, residences, occupancy, traits));
}

/** After a death, a minor follows the custodian that now holds a bed for them. */
export function relocateChildToCustodian(
  child: Entity,
  humans: Entity[],
  residences: Building[],
): boolean {
  const home = pickResidenceFromChildCustodian(child, humans, residences);
  if (home === undefined) return false;
  const alive = humans.filter((h) => h.alive && isPlayerHuman(h));
  return relocateHousehold([child], home, 'guardianship', 'guardian',
    standaloneMoveContext(alive, residences));
}

/** Resolve custody once for a sibling set; the housing owner places its complete guardian household. */
export function ensureOrphanAdoption(
  child: Entity,
  humans: Entity[],
  residences: Building[],
  occupancy?: ResidenceOccupancy,
  traits?: ResidenceTraitsById,
  genealogy?: GenealogyRegistry,
  ledger?: HousingLedger,
): boolean {
  if (!child.alive || child.faction || !isMinorChild(child)) return false;
  const parent = [child.motherId, child.fatherId].map((id) => freeParent(humans, id)).find(Boolean);
  if (parent) {
    child.adoptiveMotherId = undefined;
    child.adoptiveFatherId = undefined;
    return false;
  }
  if (livingAdoptiveCustodian(child, humans)) return false;
  const siblings = humans.filter((sibling) => sibling.alive && isPlayerHuman(sibling) && isMinorChild(sibling)
    && (sibling.id === child.id || (child.motherId != null && sibling.motherId === child.motherId)
      || (child.fatherId != null && sibling.fatherId === child.fatherId))
    && ![sibling.motherId, sibling.fatherId].some((id) => freeParent(humans, id)))
    .sort((a, b) => a.id - b.id);
  const alive = humans.filter((human) => isResidenceOccupantEntity(human) && !isImprisoned(human));
  // The Leader's House is not an orphan home, so a manor resident is never a guardian here:
  // naming one would relocate the leader's household out of the manor to seat the child.
  const guardianPool = humans.filter((human) => {
    const homeId = human.residenceBuildingId;
    return homeId == null || !residences.some((home) => home.id === homeId && isLeaderHouseResidence(home));
  });
  const relative = getChildCustodian(child, guardianPool, undefined, genealogy);
  const existing = siblings.map((sibling) => livingAdoptiveCustodian(sibling, guardianPool)).find((guardian) => !!guardian);
  const couples = listVillageCouples(guardianPool);
  const singles = listVillageSingleAdults(guardianPool).sort((a, b) => a.id - b.id);
  const canHouse = (guardian: Entity, currentOnly = false): boolean => {
    const household = [...new Map([...collectMinorHousehold(guardian, alive), ...siblings]
      .map((member) => [member.id, member])).values()];
    const candidates = currentOnly ? residences.filter((home) => home.id === guardian.residenceBuildingId) : residences;
    return pickResidenceForFamily(household, alive, candidates, occupancy, traits) !== undefined;
  };
  const couple = couples.find((candidate) => canHouse(candidate.partnerA, true))
    ?? couples.find((candidate) => canHouse(candidate.partnerA)) ?? couples[0];
  const guardian = relative ?? existing ?? couple?.partnerA ?? singles.find((candidate) => canHouse(candidate, true)) ?? singles.find((candidate) => canHouse(candidate)) ?? singles[0];
  if (!guardian) {
    const picked = pickResidenceForFamily(siblings, alive, residences, occupancy, traits);
    if (picked === undefined) return false;
    relocateHousehold(siblings, picked, 'guardianship', 'guardian', standaloneMoveContext(alive, residences, occupancy, traits, ledger));
    return true;
  }
  const partner = findLivingHuman(alive, guardian.partnerId);
  const guardians = [guardian, partner].filter((human): human is Entity => !!human);
  for (const sibling of siblings) {
    if (livingAdoptiveCustodian(sibling, humans)) continue;
    sibling.adoptiveMotherId = guardians.find((human) => human.gender === 'female')?.id;
    sibling.adoptiveFatherId = guardians.find((human) => human.gender === 'male')?.id;
    if (guardian.surname) sibling.surname = guardian.surname;
    for (const adult of guardians) {
      adult.childrenIds ??= [];
      if (!adult.childrenIds.includes(sibling.id)) adult.childrenIds.push(sibling.id);
    }
  }
  const household = [...new Map([...collectMinorHousehold(guardian, alive), ...siblings]
    .map((member) => [member.id, member])).values()];
  assignFamilyToResidence(household, alive, residences, humans, 'guardianship',
    standaloneMoveContext(alive, residences, occupancy, traits, ledger));
  return true;
}

export function tryMoveOutOfFamilyHome(
  human: Entity,
  humans: Entity[],
  residences: Building[],
  occupancy?: ResidenceOccupancy,
  ledger?: HousingLedger,
): boolean {
  if (!isAdultChildAtHome(human, humans)) return false;

  const household = collectOwnHousehold(human, humans);
  // Select an empty home that fits the complete departing household.
  const target = residences.find(
    (r) =>
      !isLeaderHouseResidence(r) &&
      countResidentsInBuilding(humans, r.id, occupancy) === 0 &&
      familyFitsInResidence(household, r, humans, occupancy),
  );
  if (!target) return false;

  return relocateHousehold(household, target.id, 'adult-child', 'family',
    standaloneMoveContext(humans, residences, occupancy, undefined, ledger));
}

export function rebalanceAdultChildrenFromFamilyHomeWhenEmptyAvailable(
  humans: Entity[],
  residences: Building[],
  occupancy?: ResidenceOccupancy,
  ledger?: HousingLedger,
): void {
  let emptyHomeIds = residences
    .filter(
      (r) =>
        !isLeaderHouseResidence(r) &&
        r.faction !== 'rival' &&
        countResidentsInBuilding(humans, r.id, occupancy) === 0,
    )
    .map((r) => r.id);
  if (emptyHomeIds.length === 0) return;

  const leaderHouseIds = new Set(residences.filter(isLeaderHouseResidence).map((r) => r.id));
  // Reuse parent lookups across the adult-child candidate filter.
  const humansById = new Map<number, Entity>();
  for (let i = 0; i < humans.length; i++) humansById.set(humans[i].id, humans[i]);
  const candidates = humans
    .filter(
      (h) =>
        (!ledger || !ledger.settled.has(h.id)) &&
        isAdultChildAtHome(h, humans, humansById) &&
        (h.residenceBuildingId == null || !leaderHouseIds.has(h.residenceBuildingId)),
    )
    .sort((a, b) => b.age - a.age || a.id - b.id);

  const moved = new Set<number>();
  for (const adult of candidates) {
    if (moved.has(adult.id)) continue;
    if (emptyHomeIds.length === 0) return;

    const household = collectOwnHousehold(adult, humans);
    if (household.some((m) => moved.has(m.id))) continue;
    if (ledger && isHousingUnitProtected(ledger, household, 'adult-child')) continue;
    if (!tryMoveOutOfFamilyHome(adult, humans, residences, occupancy, ledger)) continue;

    const newHomeId = adult.residenceBuildingId;
    if (newHomeId != null) {
      emptyHomeIds = emptyHomeIds.filter((id) => id !== newHomeId);
    }
    for (const member of household) moved.add(member.id);
  }
}


export function reassignDivorcedResidences(
  a: Entity,
  b: Entity,
  buildings: Building[],
  villagers: Entity[],
  preferredCustodian?: Entity,
): void {
  const residences = buildings.filter(isResidenceBuilding);
  // Every write below is one settler's household decision, so it passes the pipeline's checks.
  const context = standaloneMoveContext(villagers, residences);

  const wife = a.gender === 'female' ? a : b.gender === 'female' ? b : null;
  // A sitting leader keeps the manor on divorce, regardless of gender.
  // Generic marital-home rules would otherwise evict the leader until the next
  // leader-house reconciliation pulse and produce a residence bounce.
  const sharedManor = a.residenceBuildingId != null
    && a.residenceBuildingId === b.residenceBuildingId
    && buildings.some((building) => building.id === a.residenceBuildingId
      && building.type === BuildingType.LeaderHouse && building.completed);
  const manorLeader = sharedManor
    ? [a, b].find((person) => person.occupation === LEADER_OCCUPATION)
    : undefined;
  const custodian = manorLeader ?? preferredCustodian ?? wife ?? a;
  const leaver = custodian === a ? b : a;

  const formerHomes = new Set<number>();
  for (const resident of [custodian, leaver]) {
    if (resident.residenceBuildingId != null) {
      formerHomes.add(resident.residenceBuildingId);
    }
  }

  const custodianImprisoned = isImprisoned(custodian);
  if (custodianImprisoned) {
    relocateHousehold([custodian], undefined, 'homeless', 'divorce', context);
  } else {
    const custodianHome = custodian.residenceBuildingId != null
      ? residences.find((building) => building.id === custodian.residenceBuildingId)
      : undefined;
    if (!custodianHome) {
      relocateHousehold([custodian], pickResidenceForHuman(custodian, villagers, residences),
        'homeless', 'divorce', context);
    }
  }

  if (isImprisoned(leaver)) {
    relocateHousehold([leaver], undefined, 'homeless', 'divorce', context);
  } else {
    const excludeHomes = new Set(formerHomes);
    if (custodian.residenceBuildingId != null) {
      excludeHomes.add(custodian.residenceBuildingId);
    }
    const available = residences.filter((home) => !excludeHomes.has(home.id));
    relocateHousehold([leaver], pickResidenceForHuman(leaver, villagers, available),
      'homeless', 'divorce', context);
  }

  if (!custodianImprisoned && custodian.residenceBuildingId != null) {
    const children = villagers.filter(
      (child) =>
        child.alive &&
        isMinorChild(child) &&
        (child.motherId === custodian.id ||
          child.adoptiveMotherId === custodian.id ||
          child.fatherId === custodian.id ||
          child.adoptiveFatherId === custodian.id),
    );
    // A child follows the custodian only into a home with room for them; the assign layer
    // places the rest, exactly as the death path does.
    for (const child of children) relocateChildToCustodian(child, villagers, residences);
  }

  syncResidenceOccupants(villagers, buildings);
}

