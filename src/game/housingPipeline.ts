import { EntityType, LEADER_OCCUPATION, BuildingType } from './gameTypes';
import type { Building, Entity } from './gameTypes';
import type { GenealogyRegistry } from './genealogyTypes';
import type { ResidenceOccupancy } from './housingModel';
import { findLivingHuman, collectFamilyMembers, collectMinorHousehold, collectOwnHousehold, indexFamilyRelations, isAdult, isMinorChild, isAdultChildAtHome, getChildCustodian, unitIsKinOf, unitKinIndex, type UnitKinIndex } from './housingModel';
import { isResidenceBuilding, isLeaderHouseResidence, getResidenceCapacity, hasResidenceAssignment, buildResidenceOccupancy, buildPlayerResidenceOccupancy, occupancyMove, isImprisoned, isResidenceOccupantEntity, residenceRoomFor, countResidentsInBuilding, isAssignableHome } from './housingModel';
import { beginCommuteRoutePass, estimatedCommuteHours, MAX_ASSIGNABLE_COMMUTE_HOURS, straightLineCommuteLowerBoundHours } from './commuteReach';
import { isPlayerHuman } from './playerHuman';
import { SPECIES_CONFIG } from './speciesConfig';
import { TICKS_PER_DAY } from './dayCycleClock';
import { recordHousingRelocation } from './housingRelocationMonitor';

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

/** Why a household is being planned; manor seating is event-driven, never a housing-phase need. */
export type RelocationNeed =
  | 'homeless'
  | 'custody'
  | 'custodian'
  | 'capacity'
  | 'surplus'
  | 'leave-home'
  | 'couple'
  | 'commute';

/** The one answer: no move means stay — no write, no report line, no retry. */
export interface RelocationPlan {
  readonly move: boolean;
  /** True when every member is housed and the phase sweep has nothing to do. */
  readonly settled?: boolean;
  /** True when a member is unhoused but the stable-shortage guard suppresses the sweep's split. */
  readonly shortage?: boolean;
  /** Omitted only for `surplus`: there is no bed and the household is unhoused. */
  readonly to?: number;
  readonly reason: ResidenceMoveReason;
  /** One label for the report: "settled", "homeless placement", "no accepted destination". */
  readonly why: string;
}

/** Run counters: passes over the homeless work list, and plans considered, moved or stayed. */
export interface HousingStats {
  passes: number;
  considered: number;
  moved: number;
  stayed: number;
}

export interface HousingReport {
  relocations: HousingRelocation[];
  /** Optional moves withheld because a mandatory phase already decided that household. */
  protectedUnits: number;
  violations: string[];
  stats: HousingStats;
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
    report: {
      relocations: [],
      protectedUnits: 0,
      violations: [],
      stats: { passes: 0, considered: 0, moved: 0, stayed: 0 },
    },
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
  /** Player-human residents, maintained on every move for the outsider check. */
  playerOccupancy?: ResidenceOccupancy;
  /** Called after each residence write, so a pass can tell real progress from a refused assignment. */
  onMove?: () => void;
  /** Commute pricing inputs; present only during the commute phase. */
  commute?: { cache: Map<string, number>; walkSpeed: number; index: CommuteRelocationIndex };
}

/** Counts residence writes so a pass can tell real progress from a refused assignment. */
function moveCounter(): { onMove: () => void; moves: () => number } {
  let moves = 0;
  return {
    onMove: () => {
      moves++;
    },
    moves: () => moves,
  };
}

/** The context a caller outside the pipeline gets: one run of its own over the inputs it holds. */
export function standaloneMoveContext(
  alive: Entity[],
  residences: Building[],
  occupancy?: ResidenceOccupancy,
  traits?: ResidenceTraitsById,
  ledger: HousingLedger = createHousingLedger(),
  playerOccupancy?: ResidenceOccupancy,
): HousingMoveContext {
  return {
    alive,
    residences,
    buildings: residences,
    occupancy: occupancy ?? buildResidenceOccupancy(alive),
    traits: traits ?? buildResidenceTraits(alive),
    ledger,
    playerOccupancy,
  };
}

const ORDINARY_MOVE_REASONS: ReadonlySet<ResidenceMoveReason> = new Set<ResidenceMoveReason>([
  'assignment', 'family', 'guardian', 'commute', 'player',
]);

/** Reasons allowed into the Leader's House; every other reason is refused there. */
const MANOR_MOVE_REASONS: ReadonlySet<ResidenceMoveReason> = new Set<ResidenceMoveReason>([
  'leader', 'birth', 'moon-form',
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
  if (target && !isAssignableHome(target)) return true;
  if (target && isLeaderHouseResidence(target) && !MANOR_MOVE_REASONS.has(reason)) return true;
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
    if (!target || !isAssignableHome(target)) return false;
    if (isLeaderHouseResidence(target) && !MANOR_MOVE_REASONS.has(reason)) return false;
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
  if (isHousingUnitProtected(context.ledger, unit, phase)) {
    context.ledger.report.protectedUnits += 1;
    return false;
  }
  if (!householdMayMove(unit, toId, reason, context)) return false;
  // All-or-nothing: one member the write would refuse cancels the move before anyone leaves.
  if (unit.some((member) => residenceMoveRefused(member, toId, reason, context.buildings))) return false;
  const relocated = unit.some((member) => member.residenceBuildingId !== toId);
  const fromId = unit.find((member) => member.residenceBuildingId != null && member.residenceBuildingId !== toId)?.residenceBuildingId;
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
    if (fromId !== undefined && toId !== undefined) visited.add(fromId);
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
    recordHousingRelocation({
      phase,
      reason,
      members: unit,
      ...(fromId !== undefined ? { from: fromId } : {}),
      ...(toId !== undefined ? { to: toId } : {}),
    });
  }
  return true;
}

/** The one decision: does this household move, and where? Planning never writes or counts. */
export function planRelocation(
  unit: readonly Entity[],
  need: RelocationNeed,
  context: HousingMoveContext,
  residences: Building[] = context.residences,
): RelocationPlan {
  switch (need) {
    case 'homeless': return planPlacement(unit, context, 'assignment', 'homeless placement', residences);
    case 'custody': return planPlacement(unit, context, 'guardian', 'custodian placement', residences);
    case 'custodian': return planCustodian(unit, context);
    case 'capacity': return planPlacement(unit, context, 'family', 'capacity placement', residences);
    case 'surplus': return planSurplus(unit, context, residences);
    case 'leave-home': return planLeaveHome(unit, context);
    case 'commute': return planCommutePlacement(unit, context);
    case 'couple': return planPlacement(unit, context, 'family', 'couple placement', residences);
    default: {
      const unreachable: never = need;
      return { move: false, reason: 'assignment', why: `${String(unreachable)} is unknown` };
    }
  }
}

/** Applies a plan through the sole household writer; undefined when it stayed, was refused, or was a no-op. */
export function applyRelocation(
  unit: readonly Entity[],
  plan: RelocationPlan,
  phase: HousingPhase,
  context: HousingMoveContext,
): HousingRelocation | undefined {
  if (!plan.move) return undefined;
  const stats = context.ledger.report.stats;
  const before = context.ledger.report.relocations.length;
  if (!relocateHousehold(unit, plan.to, phase, plan.reason, context)) {
    stats.stayed += 1;
    return undefined;
  }
  if (context.ledger.report.relocations.length > before) stats.moved += 1;
  else stats.stayed += 1;
  return context.ledger.report.relocations[before];
}

/** Homeless phase step: apply the plan, or fall back to the custodian split when none fits. */
function placeHomelessUnit(
  unit: Entity[],
  alive: Entity[],
  residences: Building[],
  allHumans: Entity[],
  context: HousingMoveContext,
): void {
  const stats = context.ledger.report.stats;
  stats.considered += 1;

  const plan = planRelocation(unit, 'homeless', context);
  if (plan.move) {
    applyRelocation(unit, plan, 'homeless', context);
  } else if (!plan.settled && !plan.shortage) {
    const before = context.ledger.report.relocations.length;
    assignFamilyToResidence(unit, alive, residences, allHumans, 'homeless', context);
    if (context.ledger.report.relocations.length > before) stats.moved += 1;
    else stats.stayed += 1;
  } else {
    stats.stayed += 1;
  }
}

function planPlacement(
  unit: readonly Entity[],
  context: HousingMoveContext,
  reason: ResidenceMoveReason,
  why: string,
  residences: Building[],
): RelocationPlan {
  const members = [...unit];
  if (members.length === 0) return { move: false, settled: true, reason, why: 'empty household' };
  const needsMove = unitNeedsMove(
    members, context.alive, context.residences, context.occupancy, context.traits, context.playerOccupancy,
  );
  if (!needsMove) {
    const fullyHoused = members.every((member) => member.residenceBuildingId != null);
    return fullyHoused
      ? { move: false, settled: true, reason, why: 'settled' }
      : { move: false, shortage: true, reason, why: 'stable shortage' };
  }

  const picked = findAcceptedDestination(members, context.alive, context, residences, reason);
  return picked === undefined
    ? { move: false, reason, why: 'no accepted destination' }
    : { move: true, to: picked, reason, why };
}

/** The next-best home the writer accepts, or undefined when the ranking is exhausted. */
function findAcceptedDestination(
  members: Entity[],
  alive: Entity[],
  context: HousingMoveContext,
  residences: Building[],
  reason: ResidenceMoveReason,
): number | undefined {
  const refused = new Set<number>();
  for (let attempt = 0; attempt <= residences.length; attempt += 1) {
    const picked = pickResidenceForFamily(
      members, alive, residences, context.occupancy, context.traits, refused,
    );
    if (picked === undefined) return undefined;
    if (destinationRefusedByWriter(members, picked, context, reason)) {
      refused.add(picked);
      continue;
    }
    return picked;
  }
  return undefined;
}

/** Unhouse only when no destination exists; a unit that could move is not surplus. */
function planSurplus(
  unit: readonly Entity[],
  context: HousingMoveContext,
  residences: Building[],
): RelocationPlan {
  const members = [...unit];
  if (members.length === 0) return { move: false, settled: true, reason: 'family', why: 'empty household' };
  const current = members.find((member) => member.residenceBuildingId != null)?.residenceBuildingId;
  const pool = current === undefined ? residences : residences.filter((home) => home.id !== current);
  if (findAcceptedDestination(members, context.alive, context, pool, 'family') !== undefined) {
    return { move: false, reason: 'family', why: 'a destination exists' };
  }
  return { move: true, to: undefined, reason: 'family', why: 'surplus leaves the overfull home' };
}

/** Leave-home only targets a completely empty home, never the manor. */
function planLeaveHome(unit: readonly Entity[], context: HousingMoveContext): RelocationPlan {
  const members = [...unit];
  if (members.length === 0) return { move: false, settled: true, reason: 'family', why: 'empty household' };
  const empty = context.residences.filter((home) => !isLeaderHouseResidence(home)
    && countResidentsInBuilding(context.alive, home.id, context.occupancy) === 0);
  const picked = findAcceptedDestination(members, context.alive, context, empty, 'family');
  return picked === undefined
    ? { move: false, reason: 'family', why: 'no empty home' }
    : { move: true, to: picked, reason: 'family', why: 'leave-home placement' };
}

function destinationRefusedByWriter(
  unit: readonly Entity[],
  toId: number,
  context: HousingMoveContext,
  reason: ResidenceMoveReason,
): boolean {
  if (!householdMayMove(unit, toId, reason, context)) return true;
  return unit.some((member) => residenceMoveRefused(member, toId, reason, context.buildings));
}

/** Custody repair: the minor moves to the custodian's bed; not gated on the current fit. */
function planCustodian(unit: readonly Entity[], context: HousingMoveContext): RelocationPlan {
  const members = [...unit];
  const child = members.find((member) => isMinorChild(member));
  if (!child) return { move: false, settled: true, reason: 'guardian', why: 'no minor' };
  const homeId = pickResidenceFromChildCustodian(child, context.alive, context.residences, context.occupancy);
  if (homeId === undefined) return { move: false, reason: 'guardian', why: 'no custodian bed' };
  if (child.residenceBuildingId === homeId) return { move: false, settled: true, reason: 'guardian', why: 'already with custodian' };
  if (destinationRefusedByWriter(members, homeId, context, 'guardian')) {
    return { move: false, reason: 'guardian', why: 'custodian home refused' };
  }
  return { move: true, to: homeId, reason: 'guardian', why: 'custodian placement' };
}

/** Commute: move only when the route owner names a cheaper home for the household. */
function planCommutePlacement(unit: readonly Entity[], context: HousingMoveContext): RelocationPlan {
  const commute = context.commute;
  if (!commute) return { move: false, reason: 'commute', why: 'no commute index' };
  const target = pickCommuteRelocation(
    [...unit], context.alive, context.residences, context.buildings, context.occupancy,
    commute.cache, commute.walkSpeed, commute.index,
  );
  return target === undefined
    ? { move: false, reason: 'commute', why: 'no better commute' }
    : { move: true, to: target, reason: 'commute', why: 'commute saving' };
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
  context: {
    occupancy?: ResidenceOccupancy;
    playerOccupancy?: ResidenceOccupancy;
    traits?: ResidenceTraitsById;
    buildings?: Building[];
    onMove?: () => void;
  } = {},
): void {
  const fromId = human.residenceBuildingId;
  if (fromId === toId) return;
  const previous = context.buildings?.find((building) => building.id === fromId);
  const target = context.buildings?.find((building) => building.id === toId);
  if (context.occupancy) occupancyMove(context.occupancy, fromId, toId);
  if (context.playerOccupancy && human.alive && isPlayerHuman(human)) {
    occupancyMove(context.playerOccupancy, fromId, toId);
  }
  if (context.traits && isResidenceOccupantEntity(human)) residenceTraitMove(context.traits, human, fromId, toId);
  human.residenceBuildingId = toId;
  if (context.buildings) {
    if (previous && isResidenceBuilding(previous)) previous.occupants = previous.occupants.filter((id) => id !== human.id);
    if (target && isResidenceBuilding(target) && isResidenceOccupantEntity(human) && !target.occupants.includes(human.id)) {
      target.occupants.push(human.id);
    }
  }
  context.onMove?.();
}

/** The sole residence write for one settler; refuses what the leader-house and rival rules forbid. */
export function moveResident(
  human: Entity,
  toId: number | undefined,
  reason: ResidenceMoveReason,
  context: {
    occupancy?: ResidenceOccupancy;
    playerOccupancy?: ResidenceOccupancy;
    traits?: ResidenceTraitsById;
    buildings?: Building[];
    onMove?: () => void;
  } = {},
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

/**
 * The members an overfull home can shed safely: adults first, singles before partners, never a
 * minor or the custodian a remaining minor still needs. Undefined when the excess has no safe pick.
 */
function selectSurplusMembers(
  group: readonly Entity[],
  count: number,
  humans: Entity[],
): Entity[] | undefined {
  const custodians = new Set<number>();
  for (const member of group) {
    if (!isMinorChild(member)) continue;
    const custodian = getChildCustodian(member, humans);
    if (custodian) custodians.add(custodian.id);
  }
  const candidates = group.filter((member) => !isMinorChild(member) && !custodians.has(member.id));
  if (candidates.length < count) return undefined;
  const partnered = new Set<number>();
  for (const member of candidates) {
    if (candidates.some((other) => other.id === member.partnerId)) partnered.add(member.id);
  }
  return [...candidates]
    .sort((a, b) => Number(partnered.has(a.id)) - Number(partnered.has(b.id)) || a.id - b.id)
    .slice(0, count);
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
  const movePlanned = (unit: Entity[], need: RelocationNeed, pool: Building[]): boolean => {
    const plan = planRelocation(unit, need, context, pool);
    return plan.move && applyRelocation(unit, plan, 'capacity', context) !== undefined;
  };
  for (const residence of residences) {
    if (!isAssignableHome(residence) || isLeaderHouseResidence(residence)) continue;
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
        if (movePlanned(unit, 'capacity', alternatives)) moved = true;
        if ((occupancy.get(residence.id) ?? 0) <= cap) break;
      }
      if ((occupancy.get(residence.id) ?? 0) <= cap) continue;
      if (movePlanned(dependentUnit, 'capacity', alternatives)) {
        moved = true;
        continue;
      }
      for (const outsider of occupants.filter((member) => !familyIds.has(member.id))) {
        if (outsider.residenceBuildingId !== residence.id) continue;
        const unit = units.find((candidate) => candidate.includes(outsider)) ?? [outsider];
        const surplus = unit.filter((member) => member.residenceBuildingId === residence.id);
        if (surplus.length === 0) continue;
        const excess = Math.max(1, (occupancy.get(residence.id) ?? 0) - cap);
        const leaving = selectSurplusMembers(surplus, excess, humans) ?? surplus;
        if (movePlanned(leaving, 'capacity', alternatives)
          || movePlanned(leaving, 'surplus', alternatives)) moved = true;
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
      if (movePlanned(group, 'capacity', alternatives)) { moved = true; continue; }
      // No home fits the whole group: shed only the excess, never the whole household.
      const excess = Math.min(group.length, Math.max(1, kept + group.length - cap));
      const leaving = selectSurplusMembers(group, excess, humans) ?? group;
      if (movePlanned(leaving, 'capacity', alternatives)
        || movePlanned(leaving, 'surplus', alternatives)) {
        moved = true;
        kept += group.length - leaving.length;
      }
    }
  }
  return moved;
}



/**
 * Keep house/mansion occupants in sync with residenceBuildingId for the UI.
 *
 * One forward pass over `humans` buckets occupant ids by residence instead of re-scanning the
 * whole array once per residence. The occupant id **order** is unchanged: the per-building
 * `.filter().map()` this replaces emitted ids in `humans` order, and appending to a building's
 * bucket during the single forward pass emits exactly that order
 * (`tests/housingPipeline.occupantOrder.test.ts` pins it).
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
    if (!isAssignableHome(building)) continue;
    building.occupants = occupantsByResidenceId.get(building.id) ?? [];
  }
}

/** Rank, place, and retry past a refused destination before falling back to the split path. */
function relocateFamily(
  family: Entity[],
  alive: Entity[],
  residences: Building[],
  phase: HousingPhase,
  context: HousingMoveContext,
): boolean {
  const picked = findAcceptedDestination(family, alive, context, residences, 'assignment');
  return picked !== undefined && relocateHousehold(family, picked, phase, 'assignment', context);
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
  if (relocateFamily(family, alive, residences, phase, context)) return;

  const dependentGroups = new Map<number, Entity[]>();
  for (const child of family.filter(isMinorChild)) {
    const custodian = getChildCustodian(child, allHumans);
    if (!custodian || !family.includes(custodian)) continue;
    const group = dependentGroups.get(custodian.id) ?? [custodian];
    group.push(child);
    dependentGroups.set(custodian.id, group);
  }
  if (dependentGroups.size > 0) {
    const dependentIds = new Set([...dependentGroups.values()].flatMap((group) => group.map((member) => member.id)));
    for (const adult of family) {
      if (isMinorChild(adult) || dependentIds.has(adult.id)) continue;
      if ([...dependentGroups.values()].some((group) => adult.residenceBuildingId != null
        && adult.residenceBuildingId === group[0].residenceBuildingId)) {
        relocateHousehold([adult], undefined, phase, 'family', context);
      }
    }
    for (const group of dependentGroups.values()) {
      const custodian = group[0];
      const existing = residences.find((home) => home.id === custodian.residenceBuildingId && !isLeaderHouseResidence(home));
      const homeId = (existing && familyFitsInResidence(group, existing, alive, occupancy) ? existing.id : undefined)
        ?? pickResidenceForFamily(group, alive, residences, occupancy, traits);
      relocateHousehold(group, homeId, phase, 'family', context);
    }
    for (const adult of family) {
      if (isMinorChild(adult) || dependentIds.has(adult.id) || hasResidenceAssignment(adult)) continue;
      const homeId = pickResidenceForHuman(adult, alive, residences, occupancy, traits);
      if (homeId !== undefined) relocateHousehold([adult], homeId, phase, 'family', context);
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
  const stats = ledger.report.stats;
  for (const unit of buildHousingUnits(alive)) {
    if (unit.every(hasResidenceAssignment)) continue;
    // The repair pass seats any partially housed unit, whatever the phase sweep decided.
    stats.considered += 1;
    const before = ledger.report.relocations.length;
    assignFamilyToResidence(unit, alive, residences, alive, 'homeless', context);
    if (ledger.report.relocations.length > before) stats.moved += 1;
    else stats.stayed += 1;
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
  /** Resume with an existing run ledger; production always starts a fresh one. */
  existingLedger?: HousingLedger,
): HousingReport {
  const residences = listPlayerResidences(buildings);
  const ledger = existingLedger ?? createHousingLedger();
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
      ledger.report.stats.passes += 1;
      let reassigned = 0;
      // One occupancy scan per pass — O(H) then O(1) counts (EK-E2) — and one trait walk beside it,
      // threaded through every pick below instead of rebuilt per pick (F-SIM-9).
      const occupancy = buildResidenceOccupancy(residents);
      const playerOccupancy = buildPlayerResidenceOccupancy(alive);
      const traits = buildResidenceTraits(residents);
      const context = standaloneMoveContext(alive, residences, occupancy, traits, ledger, playerOccupancy);
      const moves = moveCounter();
      context.onMove = moves.onMove;
      const housingUnits = sortHousingUnitsForAssignment(
        housingUnitsBase,
        alive,
        residences,
        occupancy,
        traits,
        playerOccupancy,
      );
      for (const unit of housingUnits) {
        const before = moves.moves();
        placeHomelessUnit(unit, alive, residences, genealogyPool, context);
        if (moves.moves() > before) reassigned++;
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
      ledger.report.stats.passes += 1;
      const occupancy = buildResidenceOccupancy(residents);
      const playerOccupancy = buildPlayerResidenceOccupancy(alive);
      const traits = buildResidenceTraits(residents);
      const context = standaloneMoveContext(alive, residences, occupancy, traits, ledger, playerOccupancy);
      const moves = moveCounter();
      context.onMove = moves.onMove;
      const orderedUnits = sortHousingUnitsForAssignment(sweepUnits, alive, residences, occupancy, traits, playerOccupancy);
      let moved = false;
      for (const unit of orderedUnits) {
        const before = moves.moves();
        placeHomelessUnit(unit, alive, residences, genealogyPool, context);
        if (moves.moves() > before) moved = true;
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
      ledger.report.stats.passes += 1;
      const occupancy = buildResidenceOccupancy(residents);
      const playerOccupancy = buildPlayerResidenceOccupancy(alive);
      const traits = buildResidenceTraits(residents);
      const context = standaloneMoveContext(alive, residences, occupancy, traits, ledger, playerOccupancy);
      const ordered = sortHousingUnitsForAssignment(housingUnitsBase, alive, residences, occupancy, traits, playerOccupancy);
      for (const unit of ordered) {
        placeHomelessUnit(unit, alive, residences, genealogyPool, context);
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
    if (!isAssignableHome(residence) || isLeaderHouseResidence(residence)) continue;
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
  const cache = new Map<string, number>();
  beginCommuteRoutePass();
  const walkSpeed = SPECIES_CONFIG[EntityType.Human].speed;
  const context: HousingMoveContext = {
    alive, residences, buildings, occupancy, traits, ledger: decisions,
    commute: { cache, walkSpeed, index },
  };
  let relocated = 0;
  for (const unit of eligibleUnits) {
    if (relocated >= MAX_RELOCATIONS_PER_DAY) break;
    const plan = planRelocation(unit, 'commute', context);
    if (!plan.move || plan.to === undefined) continue;
    const previousId = unit[0]?.residenceBuildingId;
    if (applyRelocation(unit, plan, 'commute', context) === undefined) continue;
    relocated += 1;
    index.vacant = index.vacant.filter((residence) => residence.id !== plan.to);
    const previous = previousId == null ? undefined : index.residencesById.get(previousId);
    if (previous && (occupancy.get(previous.id) ?? 0) === 0) {
      index.vacant.push(previous);
      index.vacant.sort((a, b) => index.order.get(a.id)! - index.order.get(b.id)!);
    }
  }
  if (relocated < MAX_RELOCATIONS_PER_DAY) {
    relocateCommuteSwaps(
      eligibleUnits, alive, occupancy, cache, walkSpeed, index, context, relocated,
    );
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
  const familyPlan = planRelocation(household, 'couple', context);
  if (familyPlan.move && applyRelocation(household, familyPlan, 'homeless', context)) return;

  // No home fits the whole family, so only the couple moves — one mover may already live there.
  const couplePlan = planRelocation([human, partner], 'couple', context);
  if (!couplePlan.move || couplePlan.to === undefined) return;
  if (applyRelocation([human, partner], couplePlan, 'homeless', context) === undefined) return;
  const coupleHome = couplePlan.to;

  // A minor child then follows into a home that has room for them, by the child-custodian rule.
  for (const member of household) {
    if (member.residenceBuildingId === coupleHome) continue;
    if (pickResidenceFromChildCustodian(member, humans, residences) !== coupleHome) continue;
    const childPlan = planRelocation([member], 'custodian', context);
    if (childPlan.move) applyRelocation([member], childPlan, 'guardianship', context);
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
    // Only reverse a temporary guardian assignment; never sweep children already
    // living with their natural custodian into the released parent's housing bucket.
    if (child.adoptiveMotherId == null && child.adoptiveFatherId == null) continue;
    child.adoptiveMotherId = undefined;
    child.adoptiveFatherId = undefined;
    // An available natural custodian keeps the child in their existing home.
    const otherParentId = child.motherId === parent.id ? child.fatherId : child.motherId;
    const otherParent = freeParent(humans, otherParentId);
    if (otherParent && otherParent.residenceBuildingId === child.residenceBuildingId) continue;
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
      && isAdult(h)
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

  const context = standaloneMoveContext(alive, residences, occupancy, traits);
  const plan = planRelocation([child], 'custody', context);
  if (!plan.move) return false;
  return applyRelocation([child], plan, 'guardianship', context) !== undefined;
}

/** After a death, a minor follows the custodian that now holds a bed for them. */
export function relocateChildToCustodian(
  child: Entity,
  humans: Entity[],
  residences: Building[],
): boolean {
  const alive = humans.filter((h) => h.alive && isPlayerHuman(h));
  const context = standaloneMoveContext(alive, residences);
  const plan = planRelocation([child], 'custodian', context);
  if (!plan.move) return false;
  return applyRelocation([child], plan, 'guardianship', context) !== undefined;
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
  const residents = humans.filter((human) => isResidenceOccupantEntity(human));
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
    return pickResidenceForFamily(household, residents, candidates, occupancy, traits) !== undefined;
  };
  const couple = couples.find((candidate) => canHouse(candidate.partnerA, true))
    ?? couples.find((candidate) => canHouse(candidate.partnerA)) ?? couples[0];
  const guardian = relative ?? existing ?? couple?.partnerA ?? singles.find((candidate) => canHouse(candidate, true)) ?? singles.find((candidate) => canHouse(candidate)) ?? singles[0];
  if (!guardian) {
    const context = standaloneMoveContext(residents, residences, occupancy, traits, ledger);
    const plan = planRelocation(siblings, 'custody', context);
    if (plan.settled) return true;
    if (!plan.move) return false;
    return applyRelocation(siblings, plan, 'guardianship', context) !== undefined;
  }
  const partner = findLivingHuman(alive, guardian.partnerId);
  const guardians = [guardian, partner].filter((human): human is Entity => !!human);
  const household = [...new Map([...collectMinorHousehold(guardian, alive), ...siblings]
    .map((member) => [member.id, member])).values()];
  const context = standaloneMoveContext(residents, residences, occupancy, traits, ledger);
  const plan = planRelocation(household, 'custody', context);
  if (!plan.move && !plan.settled) return false;
  const previous = siblings.map((sibling) => ({
    sibling,
    motherId: sibling.adoptiveMotherId,
    fatherId: sibling.adoptiveFatherId,
    surname: sibling.surname,
  }));
  const childrenBefore = guardians.map((adult) => ({ adult, ids: [...(adult.childrenIds ?? [])] }));
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
  if (plan.settled || (plan.to !== undefined && household.every((member) => member.residenceBuildingId === plan.to))) return true;
  if (applyRelocation(household, plan, 'guardianship', context)) return true;
  for (const entry of previous) {
    entry.sibling.adoptiveMotherId = entry.motherId;
    entry.sibling.adoptiveFatherId = entry.fatherId;
    entry.sibling.surname = entry.surname;
  }
  for (const entry of childrenBefore) entry.adult.childrenIds = entry.ids;
  return false;
}

export function tryMoveOutOfFamilyHome(
  human: Entity,
  humans: Entity[],
  residences: Building[],
  occupancy?: ResidenceOccupancy,
  ledger?: HousingLedger,
): boolean {
  if (!isAdultChildAtHome(human, humans)) return false;

  const household = collectMinorHousehold(human, humans);
  const context = standaloneMoveContext(humans, residences, occupancy, undefined, ledger);
  const plan = planRelocation(household, 'leave-home', context);
  if (!plan.move) return false;
  return applyRelocation(household, plan, 'adult-child', context) !== undefined;
}

export function rebalanceAdultChildrenFromFamilyHomeWhenEmptyAvailable(
  humans: Entity[],
  residences: Building[],
  occupancy?: ResidenceOccupancy,
  ledger?: HousingLedger,
): void {
  const listEmptyHomeIds = (): number[] => residences
    .filter((r) => !isLeaderHouseResidence(r) && isAssignableHome(r)
      && countResidentsInBuilding(humans, r.id, occupancy) === 0)
    .map((r) => r.id);
  let emptyHomeIds = listEmptyHomeIds();
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

    const household = collectMinorHousehold(adult, humans);
    if (household.some((m) => moved.has(m.id))) continue;
    if (ledger && isHousingUnitProtected(ledger, household, 'adult-child')) continue;
    if (!tryMoveOutOfFamilyHome(adult, humans, residences, occupancy, ledger)) continue;

    emptyHomeIds = listEmptyHomeIds();
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
  const context = standaloneMoveContext(villagers, residences);
  const sharedManor = a.residenceBuildingId != null
    && a.residenceBuildingId === b.residenceBuildingId
    && buildings.some((home) => home.id === a.residenceBuildingId
      && home.type === BuildingType.LeaderHouse && home.completed);
  const leader = sharedManor
    ? [a, b].find((person) => person.occupation === LEADER_OCCUPATION)
    : undefined;
  const wife = a.gender === 'female' ? a : b.gender === 'female' ? b : undefined;
  // The betrayed spouse is passed as the preferred custodian: the cheater leaves.
  const keeper = leader ?? preferredCustodian ?? wife ?? a;
  const leaver = keeper.id === a.id ? b : a;
  const formerHome = keeper.residenceBuildingId == null
    ? undefined : residences.find((home) => home.id === keeper.residenceBuildingId);
  // A betrayed keeper keeps the children; an amicable split follows the custody hash.
  const dependentChildren = villagers.filter((child) => child.alive && isMinorChild(child)
    && getChildCustodian(child, villagers)?.id === leaver.id
    && [child.motherId, child.fatherId, child.adoptiveMotherId, child.adoptiveFatherId].includes(leaver.id));
  const leavingUnit = preferredCustodian ? [leaver] : [leaver, ...dependentChildren];
  const keeperChildren = villagers.filter((child) =>
    child.alive && isMinorChild(child)
    && getChildCustodian(child, villagers)?.id === keeper.id
    && [child.motherId, child.fatherId, child.adoptiveMotherId, child.adoptiveFatherId].includes(keeper.id),
  );
  // Retaining parent's dependent unit must get first access to scarce family-sized housing.
  if (!isImprisoned(keeper) && !hasResidenceAssignment(keeper)) {
    const target = pickResidenceForFamily([keeper, ...keeperChildren], villagers, residences,
      context.occupancy, context.traits);
    if (target != null) relocateHousehold([keeper, ...keeperChildren], target, 'homeless', 'divorce', context);
  }
  const blockedIds = new Set([a.residenceBuildingId, b.residenceBuildingId].filter(
    (id): id is number => id != null,
  ));
  const candidates = residences.filter((home) =>
    isAssignableHome(home)
    && !isLeaderHouseResidence(home) && !blockedIds.has(home.id)
    && countResidentsInBuilding(villagers, home.id, context.occupancy) === 0
    && familyFitsInResidence(leavingUnit, home, villagers, context.occupancy),
  );
  const sharedCandidates = residences.filter((home) =>
    isAssignableHome(home)
    && !isLeaderHouseResidence(home) && !blockedIds.has(home.id)
    && countResidentsInBuilding(villagers, home.id, context.occupancy) > 0
    && familyFitsInResidence(leavingUnit, home, villagers, context.occupancy),
  );
  candidates.push(...sharedCandidates);
  candidates.sort((left, right) => {
    const leftVacant = countResidentsInBuilding(villagers, left.id, context.occupancy) === 0;
    const rightVacant = countResidentsInBuilding(villagers, right.id, context.occupancy) === 0;
    if (leftVacant !== rightVacant) return leftVacant ? -1 : 1;
    const leftDistance = formerHome
      ? (left.x - formerHome.x) ** 2 + (left.y - formerHome.y) ** 2 : 0;
    const rightDistance = formerHome
      ? (right.x - formerHome.x) ** 2 + (right.y - formerHome.y) ** 2 : 0;
    return rightDistance - leftDistance || left.id - right.id;
  });

  // The release pass needs the ex id because a jailed cheater keeps no bed and would
  // otherwise be seated in the shared home again by generic homeless placement.
  leaver.formerSpouseId = keeper.id;
  if (!isImprisoned(leaver)) {
    for (const home of candidates) {
      if (relocateHousehold(leavingUnit, home.id, 'homeless', 'divorce', context)) break;
    }
  }
  for (const child of keeperChildren) {
    if (child.residenceBuildingId !== keeper.residenceBuildingId) {
      relocateChildToCustodian(child, villagers, residences);
    }
  }
  syncResidenceOccupants(villagers, buildings);
}

// ——— Ranking, traits and commute selection ———

const HOUSING_SCORES = {
  EMPTY_HOUSE_BONUS: -100,
  COUPLE_HOST_BONUS: -50,
  SINGLES_ALREADY_HOSTED: 50,
  COUPLE_HOST_PENALTY: 100,
  OUTSIDER_MULTIPLIER_NORMAL: 1000,
  OUTSIDER_MULTIPLIER_SHORTAGE: 10,
  MINOR_IN_SINGLES_PENALTY: 10_000,
  SINGLES_ALTERNATIVE_PENALTY: 10_000,
  /** Between two otherwise equal homes, a couple never picks the one holding another couple. */
  OTHER_COUPLE_PENALTY: 20,
} as const;

interface PickResidenceOptions {
  forbidSinglesOnly?: boolean;
}

export function listPlayerResidences(buildings: Building[]): Building[] {
  return buildings.filter(isAssignableHome);
}

/** The one least-crowded-residence rule; every couple pick asks this owner for its verdict. */
export function pickLeastCrowdedResidence(
  humans: Entity[],
  residences: Building[],
  extraSlots = 1,
  options: PickResidenceOptions = {},
  occupancy?: ResidenceOccupancy,
  /**
   * Movers already counted as residents: moving together into a home one of them lives in counts
   * them once, not twice.
   */
  movingTogether: readonly Entity[] = [],
  traits?: ResidenceTraitsById,
): number | undefined {
  let best: Building | undefined;
  let bestCount = Infinity;
  for (const residence of residences) {
    if (!isAssignableHome(residence) || isLeaderHouseResidence(residence)) continue;
    if (options.forbidSinglesOnly && residenceHostsOnlySingles(residence.id, humans, traits)) continue;
    const cap = getResidenceCapacity(residence);
    const residents = countResidentsInBuilding(humans, residence.id, occupancy);
    let alreadyHere = 0;
    for (const mover of movingTogether) {
      if (mover.residenceBuildingId === residence.id) alreadyHere++;
    }
    // The home holds its current residents plus every mover that is not one of them — a mover
    // already living there is discounted once, from the count or from the slots, never both.
    if (residents + extraSlots - alreadyHere > cap) continue;
    const count = residents - alreadyHere;
    if (count < bestCount || (count === bestCount && residence.id < (best?.id ?? Infinity))) {
      bestCount = count;
      best = residence;
    }
  }
  return best?.id;
}

export function pickResidenceFromChildCustodian(
  child: Entity,
  humans: Entity[],
  residences: Building[],
  occupancy?: ResidenceOccupancy,
): number | undefined {
  const custodian = getChildCustodian(child, humans);
  if (!custodian || !hasResidenceAssignment(custodian)) return undefined;
  const residence = residences.find((b) => b.id === custodian.residenceBuildingId);
  if (!residence || !residenceRoomFor(child, residence, humans, occupancy)) return undefined;
  return custodian.residenceBuildingId;
}

export function buildHousingUnits(humans: Entity[]): Entity[][] {
  const alive = humans.filter((h) => h.alive && isPlayerHuman(h));
  const visited = new Set<number>();
  const units: Entity[][] = [];
  const childrenByCustodian = new Map<number, Entity[]>();

  for (const child of alive) {
    if (!isMinorChild(child)) continue;
    const custodian = getChildCustodian(child, humans);
    if (!custodian) continue;
    const bucket = childrenByCustodian.get(custodian.id) ?? [];
    bucket.push(child);
    childrenByCustodian.set(custodian.id, bucket);
  }

  // A settler may appear in exactly one unit. Custodians are visited in bucket order, and a
  // settler can be the custodian of one bucket *and* the partner (or a member) of another —
  // for example a widower adding his late partner's child, and his new partner adding hers.
  // The old loop had no guard, so the second bucket re-added the already-visited settler and
  // produced two units claiming one person: each unit's reassignment invalidated the other,
  // `reassigned` never reached 0 and the convergence loop burned all its passes 4×/day,
  // leaving that settler housed away from one half of the family.
  const unitByMember = new Map<number, Entity[]>();
  const claim = (unit: Entity[], member: Entity) => {
    unit.push(member);
    visited.add(member.id);
    unitByMember.set(member.id, unit);
  };

  for (const [custodianId, children] of childrenByCustodian) {
    const custodian = alive.find((h) => h.id === custodianId);
    if (!custodian) continue;

    // Reuse the unit that already holds this custodian (if any) so their children join
    // their parent's household instead of forming a competing unit — or being dropped.
    let unit = unitByMember.get(custodian.id);
    if (!unit) {
      unit = [];
      claim(unit, custodian);
      const partner = findLivingHuman(alive, custodian.partnerId);
      if (partner && !visited.has(partner.id)) claim(unit, partner);
      units.push(unit);
    }
    for (const child of children.sort((a, b) => a.id - b.id)) {
      if (!visited.has(child.id)) claim(unit, child);
    }
  }

  for (const human of alive.sort((a, b) => a.id - b.id)) {
    if (visited.has(human.id)) continue;
    // The fallback unit is the settler, a living partner and their *minor* children.
    // `collectOwnHousehold` also walks `childrenIds` with no age filter, so a parent whose
    // children had all grown up formed a unit spanning two houses; `isFamilyHousingValid`
    // then failed and the convergence loop re-homed the whole unit together, silently
    // undoing the adult-child move-out on every pass (it could never persist).
    const unit = collectMinorHousehold(human, alive).filter((member) => !visited.has(member.id));
    if (unit.length === 0) continue;
    for (const member of unit) visited.add(member.id);
    units.push(unit);
  }

  return units;
}

function familyAlreadyInResidence(family: Entity[], residenceId: number): number {
  return family.filter((m) => m.residenceBuildingId === residenceId).length;
}

export function familyFitsInResidence(
  family: Entity[],
  residence: Building,
  humans: Entity[],
  occupancy?: ResidenceOccupancy,
): boolean {
  const cap = getResidenceCapacity(residence);
  const count = countResidentsInBuilding(humans, residence.id, occupancy);
  const alreadyHere = familyAlreadyInResidence(family, residence.id);
  const outsiders = count - alreadyHere;
  return outsiders + family.length <= cap;
}

function isLoneSettler(family: Entity[], humans: Entity[]): boolean {
  if (family.length !== 1) return false;
  if (family[0].isJuvenile) return false;
  return !findLivingHuman(humans, family[0].partnerId);
}

function unitResidenceId(unit: Entity[]): number | undefined {
  const ids = new Set(
    unit.map((m) => m.residenceBuildingId).filter((id): id is number => id != null),
  );
  if (ids.size !== 1) return undefined;
  return [...ids][0];
}

function unitSharesResidenceWithOutsiders(
  unit: Entity[],
  humans: Entity[],
  residenceId: number,
  playerOccupancy?: ResidenceOccupancy,
): boolean {
  if (playerOccupancy) {
    const residents = playerOccupancy.get(residenceId) ?? 0;
    if (residents === 0) return false;
    let here = 0;
    for (const member of unit) if (member.residenceBuildingId === residenceId) here++;
    return residents - here > 0;
  }
  const unitIds = new Set(unit.map((m) => m.id));
  return humans.some(
    (h) => h.alive && isPlayerHuman(h) && h.residenceBuildingId === residenceId && !unitIds.has(h.id),
  );
}

function hasEmptyResidenceForUnit(
  unit: Entity[],
  humans: Entity[],
  residences: Building[],
  occupancy?: ResidenceOccupancy,
): boolean {
  return residences.some(
    (r) =>
      !isLeaderHouseResidence(r) &&
      countResidentsInBuilding(humans, r.id, occupancy) === 0 &&
      familyFitsInResidence(unit, r, humans, occupancy),
  );
}

function hasSinglesOnlyResidenceWithRoom(
  unit: Entity[],
  humans: Entity[],
  residences: Building[],
  excludeResidenceId?: number,
  occupancy?: ResidenceOccupancy,
  traitsIn?: ResidenceTraitsById,
): boolean {
  const traits = traitsFor(humans, traitsIn);
  return residences.some((r) => {
    if (isLeaderHouseResidence(r)) return false;
    if (excludeResidenceId != null && r.id === excludeResidenceId) return false;
    if (!familyFitsInResidence(unit, r, humans, occupancy)) return false;
    const count = countResidentsInBuilding(humans, r.id, occupancy);
    if (count === 0) return true;
    return residenceHostsOnlySingles(r.id, humans, traits);
  });
}

/** Lowest current member ID: deterministic regardless of input order, but not persistent across deaths or household splits. */
function lowestMemberId(unit: readonly Entity[]): number {
  let lowest = Infinity;
  for (const member of unit) if (member.id < lowest) lowest = member.id;
  return Number.isFinite(lowest) ? lowest : 0;
}

/**
 * Deterministic CURRENT sweep bucket, not a persisted household identity. When the
 * lowest-ID member leaves or dies, the remaining unit can move to another bucket.
 * That is safe: each day's four pulses cover all buckets, and the final pulse
 * revisits every housing unit against current occupancy. Mandatory homelessness,
 * custody and capacity repairs are also handled independently of this hash.
 * Persisting a separate household ID would create save/migration state without
 * fixing any missed relocation in the existing bounded daily sweep.
 */
export function housingUnitBucket(unit: Entity[], buckets: number): number {
  return lowestMemberId(unit) % buckets;
}

/** Determines if a unit should vacate its current residence in favour of a better option. */
function unitNeedsMove(
  unit: Entity[],
  alive: Entity[],
  residences: Building[],
  occupancy?: ResidenceOccupancy,
  traits?: ResidenceTraitsById,
  playerOccupancy?: ResidenceOccupancy,
): boolean {
  const homeId = unitResidenceId(unit);
  const home = residences.find((residence) => residence.id === homeId);
  if (home && isLeaderHouseResidence(home) && unit.every((member) => member.residenceBuildingId === homeId)) return false;
  if (!isFamilyHousingValid(unit, residences, alive, occupancy)) {
    const child = unit.find(isMinorChild);
    const guardian = child ? getChildCustodian(child, alive) : undefined;
    const core = guardian ? unit.filter((member) => member.id === guardian.id || isMinorChild(member)) : [];
    const coreTogether = core.length > 1 && core.every((member) => member.residenceBuildingId === guardian?.residenceBuildingId);
    const guardianKeepsBed = guardian?.residenceBuildingId != null;
    // The core is anchored when its guardian has a bed, or when no home can take the core.
    const coreHasNoAlternative = !guardianKeepsBed
      && pickResidenceForFamily(core, alive, residences, occupancy, traits) === undefined;
    const coreIsAnchored = guardianKeepsBed || coreHasNoAlternative;
    const stableShortage = coreTogether && coreIsAnchored
      && pickResidenceForFamily(unit, alive, residences, occupancy, traits) === undefined;
    return !stableShortage;
  }
  if (homeId == null) return true;

  if (isLoneSettler(unit, alive)) {
    if (!unitSharesResidenceWithOutsiders(unit, alive, homeId, playerOccupancy)) return false;
    if (hasEmptyResidenceForUnit(unit, alive, residences, occupancy)) return true;
    if (
      residenceHostsCouple(homeId, alive, traits) &&
      hasSinglesOnlyResidenceWithRoom(unit, alive, residences, homeId, occupancy, traits)
    ) {
      return true;
    }
    return false;
  }

  // A couple sharing with an unrelated couple moves in with its own family, empty house or not.
  if (residenceHostsUnrelatedCouple(unit, homeId, alive, traits)) {
    const kinHome = pickResidenceForFamily(unit, alive, residences, occupancy, traits);
    if (kinHome !== undefined && kinHome !== homeId
      && residenceHostsKin(unit, kinHome, alive, traits)
      && !residenceHostsUnrelatedCouple(unit, kinHome, alive, traits)) {
      return true;
    }
  }

  if (!hasEmptyResidenceForUnit(unit, alive, residences, occupancy)) return false;
  if (countResidentsInBuilding(alive, homeId, occupancy) === unit.length) return false;
  return unitSharesResidenceWithOutsiders(unit, alive, homeId, playerOccupancy);
}

/** Family shortages are derived, so the warning disappears as soon as the household reunites. */
export function collectFamilyHousingShortages(humans: Entity[], buildings: Building[]): Entity[][] {
  const alive = humans.filter((human) => human.alive && isPlayerHuman(human) && !isImprisoned(human));
  const residences = listPlayerResidences(buildings);
  const occupancy = buildResidenceOccupancy(alive);
  return buildHousingUnits(alive).filter((unit) => unit.some(isMinorChild)
    && !unit.some((member) => residences.some((home) => isLeaderHouseResidence(home) && home.id === member.residenceBuildingId))
    && !isFamilyHousingValid(unit, residences, alive, occupancy));
}

function isUnnecessarilySharingHousing(
  unit: Entity[],
  humans: Entity[],
  residences: Building[],
  occupancy?: ResidenceOccupancy,
  traits?: ResidenceTraitsById,
): boolean {
  return unitNeedsMove(unit, humans, residences, occupancy, traits);
}

export function auditHousingSharingIssues(humans: Entity[], buildings: Building[]): string[] {
  const alive = humans.filter((h) => h.alive && isPlayerHuman(h));
  // Player housing only, and never the Leader's House: rival-camp houses count 0 *player*
  // residents and the manor is never a placement target, so counting either as an "empty
  // house available" reported sharing that no picker could actually resolve.
  const residences = buildings.filter(
    (b) => isAssignableHome(b) && !isLeaderHouseResidence(b),
  );
  const emptyCount = residences.filter((r) => countResidentsInBuilding(alive, r.id) === 0).length;

  const issues: string[] = [];
  const traits = buildResidenceTraits(alive);
  for (const unit of buildHousingUnits(alive)) {
    if (!isUnnecessarilySharingHousing(unit, alive, residences)) continue;
    const homeId = unitResidenceId(unit);
    if (homeId == null) continue;
    const label = unit.map((m) => m.name ?? `settler#${m.id}`).join(', ');
    if (emptyCount > 0) {
      issues.push(
        `${label} share house #${homeId} while ${emptyCount} empty house(s) are available`,
      );
      continue;
    }
    if (residenceHostsUnrelatedCouple(unit, homeId, alive, traits)) {
      issues.push(`${label} share house #${homeId} with an unrelated couple`);
      continue;
    }
    issues.push(
      `${label} bunk with a family in house #${homeId} while a singles-only house has open beds`,
    );
  }
  return issues;
}

export function sortHousingUnitsForAssignment(
  units: Entity[][],
  alive: Entity[],
  residences: Building[],
  occupancy?: ResidenceOccupancy,
  traits?: ResidenceTraitsById,
  playerOccupancy?: ResidenceOccupancy,
): Entity[][] {
  const needReassign = units.map((u) =>
    unitNeedsMove(u, alive, residences, occupancy, traits, playerOccupancy),
  );
  return units
    .map((unit, i) => ({ unit, need: needReassign[i] ? 0 : 1, len: unit.length, key: lowestMemberId(unit) }))
    .sort((a, b) => a.need - b.need || b.len - a.len || a.key - b.key)
    .map((x) => x.unit);
}

/** A commute move must save the household this many hours a day before it is worth making. */
export const RELOCATION_MIN_SAVED_HOURS = 0.5;
/** …and beat the current home by this fraction, so two near-equal homes never trade the household. */
export const RELOCATION_MIN_IMPROVEMENT_RATIO = 0.25;
/** No member's own daily travel may worsen by more than this, whatever the household total does. */
export const RELOCATION_MAX_MEMBER_REGRESSION_HOURS = 0.25;
/** Most household moves a colony makes in one day, so a new row of houses cannot reshuffle it at once. */
export const MAX_RELOCATIONS_PER_DAY = 8;

/** Per-sweep lookups and vacant candidates; the reconciliation owner updates vacancies after each move. */
export interface CommuteRelocationIndex {
  buildingsById: ReadonlyMap<number, Building>;
  residencesById: ReadonlyMap<number, Building>;
  order: ReadonlyMap<number, number>;
  vacant: Building[];
  roads: readonly Building[];
}

export function buildCommuteRelocationIndex(
  residences: Building[],
  buildings: readonly Building[],
  occupancy: ResidenceOccupancy,
): CommuteRelocationIndex {
  return {
    buildingsById: new Map(buildings.map((building) => [building.id, building])),
    residencesById: new Map(residences.map((residence) => [residence.id, residence])),
    order: new Map(residences.map((residence, index) => [residence.id, index])),
    roads: buildings.filter((building) => building.type === BuildingType.Road || building.type === BuildingType.Bridge),
    vacant: residences.filter((residence) => !isLeaderHouseResidence(residence)
      && isAssignableHome(residence) && (occupancy.get(residence.id) ?? 0) === 0),
  };
}

/** One member's daily travel: the trip to work plus the trip to school. */
function memberCommuteHours(
  member: Entity,
  home: Building,
  buildings: readonly Building[],
  walkSpeed: number,
  cache: Map<string, number>,
  buildingsById?: ReadonlyMap<number, Building>,
): number {
  let total = 0;
  if (member.workerBuildingId != null) {
    total += cachedCommuteHours(home, member.workerBuildingId, buildings, walkSpeed, cache, buildingsById);
  }
  if (member.schoolBuildingId != null) {
    total += cachedCommuteHours(home, member.schoolBuildingId, buildings, walkSpeed, cache, buildingsById);
  }
  return total;
}

/** One home's daily travel burden: every worker's trip to work plus every pupil's trip to school. */
function householdCommuteHours(
  unit: Entity[],
  home: Building,
  buildings: readonly Building[],
  walkSpeed: number,
  cache: Map<string, number>,
  buildingsById?: ReadonlyMap<number, Building>,
): number {
  let total = 0;
  for (const member of unit) {
    total += memberCommuteHours(member, home, buildings, walkSpeed, cache, buildingsById);
  }
  return total;
}

/** Cheap floor used before any route search: never higher than the real home→work/school time. */
function householdCommuteLowerBound(
  unit: Entity[],
  home: Building,
  walkSpeed: number,
  buildingsById?: ReadonlyMap<number, Building>,
): number {
  if (!buildingsById) return 0;
  let total = 0;
  for (const member of unit) {
    for (const destinationId of [member.workerBuildingId, member.schoolBuildingId]) {
      if (destinationId == null) continue;
      const destination = buildingsById.get(destinationId);
      if (!destination) return 0;
      total += straightLineCommuteLowerBoundHours(home, destination, walkSpeed);
    }
  }
  return total;
}

/** Per-pass travel time for one home→destination leg, keyed so a sweep prices each leg once. */
function cachedCommuteHours(
  home: Building,
  destinationId: number,
  buildings: readonly Building[],
  walkSpeed: number,
  cache: Map<string, number>,
  buildingsById?: ReadonlyMap<number, Building>,
): number {
  const destination = buildingsById ? buildingsById.get(destinationId) : buildings.find((b) => b.id === destinationId);
  if (!destination) return 0;
  const key = `${home.id}:${destination.id}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const hours = estimatedCommuteHours(home, destination, buildings, walkSpeed);
  cache.set(key, hours);
  return hours;
}

/** Whether every pupil in the unit still reaches their school from `home` inside the reach rule. */
function pupilsKeepSchoolReach(
  unit: Entity[],
  home: Building,
  buildings: readonly Building[],
  walkSpeed: number,
  cache: Map<string, number>,
  buildingsById?: ReadonlyMap<number, Building>,
): boolean {
  for (const member of unit) {
    if (member.schoolBuildingId == null) continue;
    const hours = cachedCommuteHours(home, member.schoolBuildingId, buildings, walkSpeed, cache, buildingsById);
    if (hours > MAX_ASSIGNABLE_COMMUTE_HOURS) return false;
  }
  return true;
}

/** §12 commute move: the vacant home that most shortens the household's daily travel, and never back. */
export function pickCommuteRelocation(
  unit: Entity[],
  alive: Entity[],
  residences: Building[],
  buildings: readonly Building[],
  occupancy: ResidenceOccupancy | undefined,
  cache: Map<string, number>,
  walkSpeed: number,
  index?: CommuteRelocationIndex,
): number | undefined {
  const homeId = unitResidenceId(unit);
  if (homeId == null) return undefined;
  const candidates = index?.vacant ?? residences;
  if (candidates.length === 0) return undefined;
  const buildingsById = index?.buildingsById;
  const commuteBuildings = index?.roads ?? buildings;
  const home = index ? index.residencesById.get(homeId) : residences.find((r) => r.id === homeId);
  if (!home || isLeaderHouseResidence(home)) return undefined;

  const current = householdCommuteHours(unit, home, commuteBuildings, walkSpeed, cache, buildingsById);
  if (current <= 0) return undefined;

  // A household total can improve while one member's own day worsens; no candidate may do that.
  const before = unit.map((member) => memberCommuteHours(member, home, commuteBuildings, walkSpeed, cache, buildingsById));
  let best: Building | undefined;
  let bestHours = current;
  for (const residence of candidates) {
    if (residence.id === homeId || !isAssignableHome(residence) || isLeaderHouseResidence(residence)) continue;
    if (countResidentsInBuilding(alive, residence.id, occupancy) !== 0) continue;
    if (!familyFitsInResidence(unit, residence, alive, occupancy)) continue;
    if (householdCommuteLowerBound(unit, residence, walkSpeed, buildingsById) >= bestHours) continue;
    if (!pupilsKeepSchoolReach(unit, residence, commuteBuildings, walkSpeed, cache, buildingsById)) continue;
    const hours = householdCommuteHours(unit, residence, commuteBuildings, walkSpeed, cache, buildingsById);
    if (hours > bestHours || (hours === bestHours && (best === undefined || residence.id >= best.id))) continue;
    const after = unit.map((member) => memberCommuteHours(member, residence, commuteBuildings, walkSpeed, cache, buildingsById));
    if (after.some((memberHours, index) => memberHours - before[index] > RELOCATION_MAX_MEMBER_REGRESSION_HOURS)) continue;
    bestHours = hours;
    best = residence;
  }
  if (!best) return undefined;
  if (current - bestHours < RELOCATION_MIN_SAVED_HOURS) return undefined;
  if (bestHours > current * (1 - RELOCATION_MIN_IMPROVEMENT_RATIO)) return undefined;
  return best.id;
}

/** A mutual home swap: both households must already be the sole occupants of their homes. */
function commuteSwapIsWorthwhile(
  a: Entity[],
  b: Entity[],
  homeA: Building,
  homeB: Building,
  alive: Entity[],
  occupancy: ResidenceOccupancy,
  cache: Map<string, number>,
  walkSpeed: number,
  index: CommuteRelocationIndex,
): boolean {
  if (getResidenceCapacity(homeA) < b.length || getResidenceCapacity(homeB) < a.length) return false;
  if (countResidentsInBuilding(alive, homeA.id, occupancy) !== a.length) return false;
  if (countResidentsInBuilding(alive, homeB.id, occupancy) !== b.length) return false;

  const commuteBuildings = index.roads;
  const beforeA = householdCommuteHours(a, homeA, commuteBuildings, walkSpeed, cache, index.buildingsById);
  const beforeB = householdCommuteHours(b, homeB, commuteBuildings, walkSpeed, cache, index.buildingsById);
  if (beforeA <= 0 || beforeB <= 0) return false;
  if (householdCommuteLowerBound(a, homeB, walkSpeed, index.buildingsById) >= beforeA) return false;
  if (householdCommuteLowerBound(b, homeA, walkSpeed, index.buildingsById) >= beforeB) return false;
  if (!pupilsKeepSchoolReach(a, homeB, commuteBuildings, walkSpeed, cache, index.buildingsById)) return false;
  if (!pupilsKeepSchoolReach(b, homeA, commuteBuildings, walkSpeed, cache, index.buildingsById)) return false;

  const afterA = householdCommuteHours(a, homeB, commuteBuildings, walkSpeed, cache, index.buildingsById);
  const afterB = householdCommuteHours(b, homeA, commuteBuildings, walkSpeed, cache, index.buildingsById);
  if (afterA >= beforeA || afterB >= beforeB) return false;
  const totalBefore = beforeA + beforeB;
  const totalSaved = totalBefore - afterA - afterB;
  if (totalSaved < RELOCATION_MIN_SAVED_HOURS) return false;
  if (totalBefore - totalSaved > totalBefore * (1 - RELOCATION_MIN_IMPROVEMENT_RATIO)) return false;

  const beforeMembers = [
    ...a.map((member) => memberCommuteHours(member, homeA, commuteBuildings, walkSpeed, cache, index.buildingsById)),
    ...b.map((member) => memberCommuteHours(member, homeB, commuteBuildings, walkSpeed, cache, index.buildingsById)),
  ];
  const afterMembers = [
    ...a.map((member) => memberCommuteHours(member, homeB, commuteBuildings, walkSpeed, cache, index.buildingsById)),
    ...b.map((member) => memberCommuteHours(member, homeA, commuteBuildings, walkSpeed, cache, index.buildingsById)),
  ];
  return afterMembers.every((hours, i) => hours - beforeMembers[i] <= RELOCATION_MAX_MEMBER_REGRESSION_HOURS);
}

/** Writes both halves of a validated swap and logs each household where it landed. */
function applyCommuteSwap(
  a: Entity[],
  b: Entity[],
  homeA: Building,
  homeB: Building,
  context: HousingMoveContext,
): void {
  const moves: Array<{ unit: Entity[]; from: Building; to: Building }> = [
    { unit: a, from: homeA, to: homeB },
    { unit: b, from: homeB, to: homeA },
  ];
  for (const move of moves) {
    applyHouseholdMove(move.unit, move.to.id, context);
    context.ledger.report.stats.considered += 1;
    context.ledger.report.stats.moved += 1;
    const relocation: HousingRelocation = {
      phase: 'commute', reason: 'commute',
      members: move.unit.map((member) => member.id),
      from: move.from.id, to: move.to.id,
    };
    context.ledger.report.relocations.push(relocation);
    recordHousingRelocation({ phase: 'commute', reason: 'commute', members: move.unit, from: move.from.id, to: move.to.id });
    for (const member of move.unit) {
      const visited = context.ledger.visited.get(member.id) ?? new Set<number>();
      visited.add(move.from.id);
      visited.add(move.to.id);
      context.ledger.visited.set(member.id, visited);
      context.ledger.settled.set(member.id, 'commute');
      context.ledger.reported.set(member.id, move.to.id);
    }
  }
}

/** The full-village half of the commute phase: exchange two occupied homes when both improve. */
function relocateCommuteSwaps(
  units: Entity[][],
  alive: Entity[],
  occupancy: ResidenceOccupancy,
  cache: Map<string, number>,
  walkSpeed: number,
  index: CommuteRelocationIndex,
  context: HousingMoveContext,
  alreadyMoved: number,
): number {
  const candidates: Array<{ unit: Entity[]; home: Building }> = [];
  for (const unit of units) {
    if (isHousingUnitProtected(context.ledger, unit, 'commute')) continue;
    const homeId = unitResidenceId(unit);
    const home = homeId == null ? undefined : index.residencesById.get(homeId);
    if (!home || !isAssignableHome(home) || isLeaderHouseResidence(home)) continue;
    if (countResidentsInBuilding(alive, home.id, occupancy) !== unit.length) continue;
    candidates.push({ unit, home });
  }

  const used = new Set<number>();
  let moved = 0;
  for (let i = 0; i < candidates.length; i++) {
    if (alreadyMoved + moved + 2 > MAX_RELOCATIONS_PER_DAY) break;
    const a = candidates[i];
    if (used.has(a.unit[0].id)) continue;
    for (let j = i + 1; j < candidates.length; j++) {
      const b = candidates[j];
      if (used.has(b.unit[0].id)) continue;
      if (!commuteSwapIsWorthwhile(a.unit, b.unit, a.home, b.home, alive, occupancy, cache, walkSpeed, index)) continue;
      applyCommuteSwap(a.unit, b.unit, a.home, b.home, context);
      used.add(a.unit[0].id);
      used.add(b.unit[0].id);
      moved += 2;
      break;
    }
  }
  return moved;
}

/**
 * Per-residence facts the pickers ask about, built in **one** walk over `humans` and then kept
 * current by `residenceTraitMove` beside every occupancy move — threading it through is what makes
 * a pick O(residences) instead of O(residences × humans).
 */
export interface ResidenceTraits {
  adults: number;
  minors: number;
  /** Occupants whose partner is a housemate; above zero is the "hosts a couple" predicate. */
  pairs: number;
  occupants: Map<number, Entity>;
}
export type ResidenceTraitsById = Map<number, ResidenceTraits>;

function addResidenceOccupant(traits: ResidenceTraitsById, residenceId: number, human: Entity): void {
  let entry = traits.get(residenceId);
  if (!entry) {
    entry = { adults: 0, minors: 0, pairs: 0, occupants: new Map() };
    traits.set(residenceId, entry);
  }
  entry.occupants.set(human.id, human);
  if (!human.isJuvenile) entry.adults += 1;
  if (isMinorChild(human)) entry.minors += 1;
  if (human.partnerId != null && entry.occupants.has(human.partnerId)) entry.pairs += 1;
}

function removeResidenceOccupant(traits: ResidenceTraitsById, residenceId: number, human: Entity): void {
  const entry = traits.get(residenceId);
  if (!entry) return;
  entry.occupants.delete(human.id);
  if (!human.isJuvenile) entry.adults -= 1;
  if (isMinorChild(human)) entry.minors -= 1;
  if (human.partnerId != null && entry.occupants.has(human.partnerId)) entry.pairs -= 1;
  if (entry.occupants.size === 0) traits.delete(residenceId);
}

/** One walk over the colony; a house with no occupant gets no entry. */
export function buildResidenceTraits(humans: readonly Entity[]): ResidenceTraitsById {
  const traits: ResidenceTraitsById = new Map();
  for (const human of humans) {
    if (!human.alive || !isResidenceOccupantEntity(human)) continue;
    const residenceId = human.residenceBuildingId;
    if (residenceId == null) continue;
    addResidenceOccupant(traits, residenceId, human);
  }
  return traits;
}

/**
 * Applies one move to a threaded trait map, exactly as a fresh `buildResidenceTraits` would read it
 * at that moment. Every residence write inside an assignment pass must call this beside
 * `occupancyMove`, or the threaded map drifts from the live world.
 */
export function residenceTraitMove(
  traits: ResidenceTraitsById,
  human: Entity,
  fromId: number | undefined,
  toId: number | undefined,
): void {
  if (fromId === toId) return;
  if (fromId != null) removeResidenceOccupant(traits, fromId, human);
  if (toId != null) addResidenceOccupant(traits, toId, human);
}

function traitsFor(humans: Entity[], traits?: ResidenceTraitsById): ResidenceTraitsById {
  return traits ?? buildResidenceTraits(humans);
}

function residenceHostsCouple(
  residenceId: number,
  humans: Entity[],
  traits?: ResidenceTraitsById,
): boolean {
  return (traitsFor(humans, traits).get(residenceId)?.pairs ?? 0) > 0;
}

function residenceHostsOnlySingles(
  residenceId: number,
  humans: Entity[],
  traits?: ResidenceTraitsById,
): boolean {
  const entry = traitsFor(humans, traits).get(residenceId);
  if (!entry || entry.minors > 0 || entry.pairs > 0) return false;
  return entry.adults > 0;
}

/** Visit a residence's occupants who are not members of the unit; stop when `matches` hits. */
function hostsNonKinOccupant(
  unit: Entity[],
  residenceId: number,
  humans: Entity[],
  traits: ResidenceTraitsById | undefined,
  matches: (occupant: Entity, partner: Entity | undefined, kin: UnitKinIndex) => boolean,
): boolean {
  const entry = traitsFor(humans, traits).get(residenceId);
  if (!entry) return false;
  const kin = unitKinIndex(unit);
  for (const occupant of entry.occupants.values()) {
    if (kin.ids.has(occupant.id)) continue;
    const partner = occupant.partnerId == null ? undefined : entry.occupants.get(occupant.partnerId);
    if (matches(occupant, partner, kin)) return true;
  }
  return false;
}

/** A couple in the residence that no member of the unit is related to. */
function residenceHostsUnrelatedCouple(
  unit: Entity[],
  residenceId: number,
  humans: Entity[],
  traits?: ResidenceTraitsById,
): boolean {
  return hostsNonKinOccupant(unit, residenceId, humans, traits, (occupant, partner, kin) =>
    !!partner && !kin.ids.has(partner.id) && !unitIsKinOf(kin, occupant) && !unitIsKinOf(kin, partner));
}

/** A residence holding the unit's own family — the household it would rather move back in with. */
function residenceHostsKin(
  unit: Entity[],
  residenceId: number,
  humans: Entity[],
  traits?: ResidenceTraitsById,
): boolean {
  return hostsNonKinOccupant(unit, residenceId, humans, traits, (occupant, _partner, kin) => unitIsKinOf(kin, occupant));
}

/** A household's own home first, then its own family, then whoever else will take it in. */
function residencePreferenceTier(
  unit: Entity[],
  residenceId: number,
  outsiders: number,
  hasMinor: boolean,
  humans: Entity[],
  traits?: ResidenceTraitsById,
): number {
  if (outsiders === 0) return 0;
  if (!residenceHostsKin(unit, residenceId, humans, traits)) return 2;
  if (hasMinor && residenceHostsOnlySingles(residenceId, humans, traits)) return 2;
  return 1;
}

function anyOpenBeds(
  humans: Entity[],
  residences: Building[],
  occupancy?: ResidenceOccupancy,
  excluded?: ReadonlySet<number>,
): boolean {
  return residences.some(
    (r) =>
      isAssignableHome(r) &&
      !isLeaderHouseResidence(r) &&
      !excluded?.has(r.id) &&
      countResidentsInBuilding(humans, r.id, occupancy) < getResidenceCapacity(r),
  );
}

export function pickResidenceForFamily(
  family: Entity[],
  humans: Entity[],
  residences: Building[],
  occupancy?: ResidenceOccupancy,
  traitsIn?: ResidenceTraitsById,
  excluded?: ReadonlySet<number>,
): number | undefined {
  if (residences.length === 0 || family.length === 0) return undefined;

  const loneSingle = isLoneSettler(family, humans);
  const hasMinor = family.some((m) => isMinorChild(m));
  
  // A threaded map is the pass's own; without one, one walk over the colony answers every
  // per-residence question below by lookup.
  const traits = traitsFor(humans, traitsIn);

  let emptyHouseCount = 0;
  const singlesFriendlyHouseIds = new Set<number>();

  for (const r of residences) {
    if (!isAssignableHome(r) || isLeaderHouseResidence(r) || excluded?.has(r.id)) continue;
    const count = countResidentsInBuilding(humans, r.id, occupancy);
    if (count === 0) {
      emptyHouseCount++;
    }
    if (familyFitsInResidence(family, r, humans, occupancy) && (count === 0 || residenceHostsOnlySingles(r.id, humans, traits))) {
      singlesFriendlyHouseIds.add(r.id);
    }
  }

  const anyEmptyHouse = emptyHouseCount > 0;
  const housingShortage = !anyEmptyHouse || !anyOpenBeds(humans, residences, occupancy, excluded);

  let best: Building | undefined;
  let bestScore = Infinity;
  let bestTier = Infinity;

  for (const residence of residences) {
    if (!isAssignableHome(residence) || isLeaderHouseResidence(residence)) continue;
    if (excluded?.has(residence.id)) continue;
    if (!familyFitsInResidence(family, residence, humans, occupancy)) continue;

    const count = countResidentsInBuilding(humans, residence.id, occupancy);
    const alreadyHere = familyAlreadyInResidence(family, residence.id);
    const outsiders = count - alreadyHere;
    const cap = getResidenceCapacity(residence);
    const largeFamilyBonus = family.length > 4 ? cap * 10 : 0;

    // O(1) singles alternative check via pre-aggregated Set
    const hasOtherSinglesFriendlyHouse = singlesFriendlyHouseIds.size > (singlesFriendlyHouseIds.has(residence.id) ? 1 : 0);

    let score: number;
    if (loneSingle) {
      if (count === 0) {
        score = HOUSING_SCORES.EMPTY_HOUSE_BONUS;
      } else if (anyEmptyHouse) {
        score = HOUSING_SCORES.OUTSIDER_MULTIPLIER_NORMAL + outsiders * 100 + count;
      } else if (residenceHostsOnlySingles(residence.id, humans, traits)) {
        score = alreadyHere > 0 ? HOUSING_SCORES.SINGLES_ALREADY_HOSTED + count : count;
      } else if (residenceHostsCouple(residence.id, humans, traits)) {
        if (hasOtherSinglesFriendlyHouse) {
          score = HOUSING_SCORES.SINGLES_ALTERNATIVE_PENALTY + outsiders * 100 + count;
        } else {
          score = HOUSING_SCORES.COUPLE_HOST_PENALTY + outsiders;
        }
      } else if (alreadyHere > 0) {
        score = HOUSING_SCORES.SINGLES_ALREADY_HOSTED + count;
      } else {
        score = outsiders * HOUSING_SCORES.OUTSIDER_MULTIPLIER_NORMAL + count;
      }
    } else if (housingShortage) {
      score = outsiders * HOUSING_SCORES.OUTSIDER_MULTIPLIER_SHORTAGE + count - largeFamilyBonus;
    } else {
      score = outsiders * HOUSING_SCORES.OUTSIDER_MULTIPLIER_NORMAL + count - largeFamilyBonus;
    }

    if (hasMinor && residenceHostsOnlySingles(residence.id, humans, traits)) {
      score += HOUSING_SCORES.MINOR_IN_SINGLES_PENALTY;
    }

    // Between two otherwise equal homes, a couple never picks the one holding another couple.
    if (!loneSingle && outsiders > 0
      && residenceHostsUnrelatedCouple(family, residence.id, humans, traits)) {
      score += HOUSING_SCORES.OTHER_COUPLE_PENALTY;
    }

    const tier = loneSingle ? 0
      : residencePreferenceTier(family, residence.id, outsiders, hasMinor, humans, traits);
    if (tier < bestTier || (tier === bestTier
      && (score < bestScore || (score === bestScore && residence.id < (best?.id ?? Infinity))))) {
      bestTier = tier;
      bestScore = score;
      best = residence;
    }
  }

  return best?.id;
}

function isFamilyHousingValid(
  family: Entity[],
  residences: Building[],
  humans: Entity[],
  occupancy?: ResidenceOccupancy,
): boolean {
  const assigned = family.filter((m) => m.residenceBuildingId !== undefined);
  if (assigned.length === 0 || assigned.length !== family.length) return false;

  const houseId = assigned[0].residenceBuildingId!;
  if (!assigned.every((m) => m.residenceBuildingId === houseId)) return false;

  const residence = residences.find((b) => b.id === houseId);
  if (!residence) return false;

  return familyFitsInResidence(family, residence, humans, occupancy);
}

export function pickResidenceForHuman(
  human: Entity,
  humans: Entity[],
  residences: Building[],
  occupancy?: ResidenceOccupancy,
  traits?: ResidenceTraitsById,
): number | undefined {
  if (residences.length === 0) return undefined;

  const household = isMinorChild(human) ? [human] : collectOwnHousehold(human, humans);
  const familyHouse = pickResidenceForFamily(household, humans, residences, occupancy, traits);
  if (familyHouse !== undefined) return familyHouse;

  if (human.partnerId) {
    const partner = findLivingHuman(humans, human.partnerId);
    if (partner && hasResidenceAssignment(partner)) {
      const partnerResidence = residences.find((b) => b.id === partner.residenceBuildingId);
      if (partnerResidence && residenceRoomFor(human, partnerResidence, humans, occupancy)) {
        return partner.residenceBuildingId;
      }
    }
  }

  if (isMinorChild(human)) {
    const custodianHome = pickResidenceFromChildCustodian(human, humans, residences, occupancy);
    if (custodianHome !== undefined) return custodianHome;
  }

  const crowdOpts: PickResidenceOptions = isMinorChild(human) ? { forbidSinglesOnly: true } : {};
  return pickLeastCrowdedResidence(humans, residences, 1, crowdOpts, occupancy, [], traits);
}
