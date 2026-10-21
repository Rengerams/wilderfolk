import type { Building, WorldState } from './gameTypes';
import { BUILDING_CONFIGS, BuildingType, LEVEL_BENEFIT_BUILDING_TYPES } from './gameTypes';
import { addResource, updateStorageCaps } from './economy';
import { addFloatingText, addNotification, createDeathParticles, impulseScreenShake } from './simEffects';
import { assignMissingWorkers, removeWorkerTransition } from './workforce';
import { unindexAdjacency } from './adjacencyIndex';
import { allPlayerHumans } from './playerHuman';
import { getResidenceCapacity, isResidenceBuildingType } from './residencyOccupancy';
import { assignMissingResidences } from './residencyReconciliation';
import { invalidatePopulationSnapshotCache } from './populationGrowth';

/** The repair owner's materials. Exported so a spender can leave the price of one repair behind. */
export const REPAIR_COST = { wood: 10, stone: 5 } as const;
const BUILDING_REFUND_RATIO = 0.5;
/** Upgrade ceiling: a completed building may reach this level, no further. */
const MAX_BUILDING_LEVEL = 3;

/**
 * The reason string returned for a type whose level buys nothing — the UI reads it as "no upgrade
 * available" and hides the button, the same way `Already level 3` does.
 *
 * Exported so the panel can ask "is this the no-benefit case?" without matching on prose.
 */
export const NO_LEVEL_BENEFIT_REASON = 'This building does not have levels';

/**
 * Whether a level of this building type changes anything at all.
 *
 * Owner's ruling (2026-09-29): *"if a building is not upgradable not show the button upgrade and do
 * like its upgradable"* — i.e. behave exactly like a maxed building, which already hides the button
 * and reads as complete.
 *
 * Membership of `LEVEL_BENEFIT_BUILDING_TYPES` is the whole rule, and that set is the list of types
 * something actually reads `level` for: the production multiplier, the workshop multiplier and
 * residence capacity. "Is a residence or has a job" was the older test, and it offered an upgrade on
 * Church, School, Tavern, Prison, Barracks, Hospital and Town Hall — staffed buildings whose level no
 * code reads, so the button charged real resources for a number that affected nothing.
 */
export function buildingTypeHasLevelBenefit(type: BuildingType): boolean {
  return LEVEL_BENEFIT_BUILDING_TYPES.has(type);
}

/**
 * Whether `repairBuilding` would actually restore this building: it exists,
 * stands complete, is damaged, and its fixed cost is affordable.
 *
 * Single definition of the repair rule — `repairBuilding` refuses to spend
 * anything unless this says `ok`, and the auto-play bot
 * (`virtualPlayer.ts`) proposes a repair only when it does, so the bot can
 * never claim an in-game hour with a command the owner would refuse.
 */
export function getRepairBuildingEligibility(
  state: WorldState,
  buildingId: number,
): { ok: boolean; blockReason?: string } {
  return getRepairBuildingEligibilityFor(state, state.buildings.find((candidate) => candidate.id === buildingId));
}

/** Same repair rule without an O(buildings) ID lookup inside a batch sweep. */
export function getRepairBuildingEligibilityFor(
  state: Pick<WorldState, 'resources'>,
  building: Building | undefined,
): { ok: boolean; blockReason?: string } {
  if (!building) return { ok: false, blockReason: 'No such building' };
  if (!building.completed) return { ok: false, blockReason: 'Still under construction' };
  if (building.health >= building.maxHealth) return { ok: false, blockReason: 'Already at full health' };
  if (state.resources.wood < REPAIR_COST.wood || state.resources.stone < REPAIR_COST.stone) {
    return { ok: false, blockReason: `Need ${REPAIR_COST.wood}w ${REPAIR_COST.stone}s` };
  }
  return { ok: true };
}

function reconcileAssignmentsAfterBuildingRemoval(state: WorldState): void {
  const humans = allPlayerHumans(state.entities);
  assignMissingResidences(humans, state.buildings, state.entities);
  assignMissingWorkers(humans, state.buildings, state);
}

/** Repair a completed damaged building for the established fixed resource cost. */
export function repairBuilding(originalState: WorldState, buildingId: number): WorldState {
  const state = structuredClone(originalState);
  const building = state.buildings.find((candidate) => candidate.id === buildingId);
  if (!building) return state;

  const eligibility = getRepairBuildingEligibility(originalState, buildingId);
  if (!eligibility.ok) {
    // A building that is unfinished or already whole stays silent (the UI never
    // offers the button); a real repair the colony cannot pay for shows the cost.
    const structural = !building.completed || building.health >= building.maxHealth;
    if (!structural) {
      addFloatingText(
        state,
        building.x + building.width / 2,
        building.y,
        eligibility.blockReason ?? 'Cannot repair',
        '#ef4444',
      );
    }
    return state;
  }

  state.resources.wood -= REPAIR_COST.wood;
  state.resources.stone -= REPAIR_COST.stone;
  building.health = building.maxHealth;
  createDeathParticles(state, building.x, building.y, '#22c55e', 10, 'sparkle');
  addFloatingText(state, building.x, building.y - 10, 'Repaired!', '#22c55e');
  return state;
}

/**
 * Repair several damaged structures in one authoritative action. Selection stays with
 * the Virtual Player; the repair owner checks each target and the *remaining* budget.
 * A single world clone and no per-segment particles keep long roads cheap to restore.
 */
export function repairBuildings(originalState: WorldState, buildingIds: readonly number[]): WorldState {
  if (buildingIds.length === 0) return originalState;
  const state = structuredClone(originalState);
  const requested = new Set(buildingIds);
  let repaired = 0;
  let first: Building | undefined;

  for (const building of state.buildings) {
    if (!requested.has(building.id)) continue;
    if (!getRepairBuildingEligibilityFor(state, building).ok) continue;
    state.resources.wood -= REPAIR_COST.wood;
    state.resources.stone -= REPAIR_COST.stone;
    building.health = building.maxHealth;
    repaired++;
    first ??= building;
  }

  if (first && repaired > 0) {
    // One brief effect per batch, not hundreds of notifications or particles.
    addFloatingText(state, first.x, first.y - 10, `Repaired ${repaired} structures`, '#22c55e');
  }
  return state;
}

export function getBuildingUpgradeCost(building: Building): { wood: number; stone: number; gold: number } {
  return {
    wood: 50 * building.level,
    stone: 25 * building.level,
    gold: 50 * building.level,
  };
}

/**
 * Whether `upgradeBuilding` would actually raise this building a level:
 * it exists, stands complete, is below the level ceiling, is not the
 * already-complete Leader's House, and its cost is affordable.
 *
 * Single definition of the upgrade rule, shared with the auto-play bot
 * (`virtualPlayer.ts`) exactly like `getRepairBuildingEligibility`.
 */
export function getBuildingUpgradeEligibility(
  state: WorldState,
  buildingId: number,
): { ok: boolean; blockReason?: string } {
  const building = state.buildings.find((candidate) => candidate.id === buildingId);
  if (!building) return { ok: false, blockReason: 'No such building' };
  if (!building.completed) return { ok: false, blockReason: 'Still under construction' };
  if (building.level >= MAX_BUILDING_LEVEL) {
    return { ok: false, blockReason: `Already level ${MAX_BUILDING_LEVEL}` };
  }
  // A type whose level nothing reads must not offer the upgrade at all (owner's ruling). Reported as
  // `structural` below, so it is silent and the button simply does not render — the same treatment
  // `Already level 3` gets, rather than an error the player has to read.
  if (!buildingTypeHasLevelBenefit(building.type)) {
    return { ok: false, blockReason: NO_LEVEL_BENEFIT_REASON };
  }

  const { wood: costWood, stone: costStone, gold: costGold } = getBuildingUpgradeCost(building);
  if (state.resources.wood < costWood || state.resources.stone < costStone || state.resources.gold < costGold) {
    return { ok: false, blockReason: `Need ${costWood}w ${costStone}s ${costGold}g` };
  }
  return { ok: true };
}

export function upgradeBuilding(originalState: WorldState, buildingId: number): WorldState {
  const state = structuredClone(originalState);
  const building = state.buildings.find((candidate) => candidate.id === buildingId);
  if (!building) return state;

  const eligibility = getBuildingUpgradeEligibility(originalState, buildingId);
  if (!eligibility.ok) {
    // Unfinished or capped stays silent (no button in the UI); an affordable-looking upgrade the
    // colony cannot pay for shows the price.
    const structural =
      !building.completed
      || building.level >= MAX_BUILDING_LEVEL
      || !buildingTypeHasLevelBenefit(building.type);
    if (!structural) {
      addFloatingText(
        state,
        building.x + building.width / 2,
        building.y,
        eligibility.blockReason ?? 'Cannot upgrade',
        '#ef4444',
      );
    }
    return state;
  }

  const { wood: costWood, stone: costStone, gold: costGold } = getBuildingUpgradeCost(building);
  state.resources.wood -= costWood;
  state.resources.stone -= costStone;
  state.resources.gold -= costGold;
  building.level += 1;
  if (building.type === BuildingType.Silo || building.type === BuildingType.WoodStorehouse) {
    updateStorageCaps(state);
  }
  // Bed capacity is level-dependent (`getResidenceCapacity`), and the population snapshot is cached
  // per tick on counts a level change does not touch — so the header, the focus hints and the sim
  // summary kept reporting the pre-upgrade bed count until the next tick. `populationGrowth` names
  // this call ("e.g. after building upgrades") and had no caller.
  invalidatePopulationSnapshotCache(state);

  if (isResidenceBuildingType(building.type)) {
    const capacity = getResidenceCapacity(building);
    assignMissingResidences(allPlayerHumans(state.entities), state.buildings, state.entities);
    addFloatingText(state, building.x, building.y - 15, `Expanded! Fits ${capacity} residents`, '#3b82f6');
    addNotification(
      state,
      'Home expanded',
      `${BUILDING_CONFIGS[building.type].label} now holds ${capacity} family members.`,
      'success',
    );
  } else {
    addFloatingText(state, building.x, building.y - 15, `Upgraded to Lv.${building.level}!`, '#3b82f6');
  }

  createDeathParticles(state, building.x, building.y, '#3b82f6', 15, 'star');
  impulseScreenShake(state, 3);
  return state;
}

/** Clear every assignment which references a building before it leaves authoritative state. */
function clearAssignmentsForDemolishedBuilding(state: WorldState, buildingId: number): void {
  for (const entity of state.entities) {
    // Workforce cleanup through the owner's transition keeps work fields consistent.
    if (entity.homeBuildingId === buildingId) removeWorkerTransition(entity, state.buildings);
    if (entity.residenceBuildingId === buildingId) entity.residenceBuildingId = undefined;
    if (entity.prisonBuildingId === buildingId) {
      entity.prisonBuildingId = undefined;
      entity.prisonerUntilTick = undefined;
      entity.prisonSentenceCrime = undefined;
    }
  }
}

/** The one owner of "a building leaves authoritative state": the completed-building counter, the
 *  adjacency index, its `state.adjacency` shadow and the road cache. Callers own why + assignments. */
export function removeBuildingFromState(state: WorldState, building: Building): void {
  unindexAdjacency(state, building.id);
  state.adjacency = undefined;
  if (building.type === BuildingType.Road) {
    state.roadAvoidance = undefined;
    state.roadAvoidanceStamp = undefined;
  }
  state.buildings = state.buildings.filter((candidate) => candidate.id !== building.id);
  // Keep the denormalized completed-building counter consistent with load-time recomputation.
  if (building.completed && building.faction !== 'rival') {
    state.totalBuildingsCompleted = Math.max(0, state.totalBuildingsCompleted - 1);
  }
}

/**
 * Half a removed building's build cost, credited through the storage-cap owner.
 *
 * One owner for the refund rule, shared by `demolishBuilding` and the strip-replacement path. The
 * gain must go through `addResource` (which clamps to `storageMax`); the placement path used a raw
 * `+=`, so a replacement at the wood cap credited wood the store could not hold and permanently
 * desynchronised the cap. Returns what was **actually** accepted,
 * so an announcing caller can report the truth.
 */
export function refundBuildingCost(
  state: WorldState,
  type: BuildingType,
): { wood: number; stone: number; gold: number } {
  const config = BUILDING_CONFIGS[type];
  const refundWood = Math.floor(config.cost.wood * BUILDING_REFUND_RATIO);
  const refundStone = Math.floor(config.cost.stone * BUILDING_REFUND_RATIO);
  const refundGold = Math.floor(config.cost.gold * BUILDING_REFUND_RATIO);
  return {
    wood: addResource(state, 'wood', refundWood),
    stone: addResource(state, 'stone', refundStone),
    gold: addResource(state, 'gold', refundGold),
  };
}

/**
 * Worker-authoritative demolition. The worker already owns its state, so cloning
 * the entire save (entities, world map and all) for one building is unnecessary.
 * Keep the immutable wrapper below for direct callers and tests.
 */
export function demolishBuildingInPlace(state: WorldState, buildingId: number): WorldState {
  const building = state.buildings.find((candidate) => candidate.id === buildingId);
  if (!building) return state;

  // The refund is capped by the storage owner, so report what was actually added rather than the
  // nominal refund (a full store used to announce a refund it never received).
  const { wood: gotWood, stone: gotStone } = refundBuildingCost(state, building.type);

  clearAssignmentsForDemolishedBuilding(state, buildingId);
  createDeathParticles(
    state,
    building.x,
    building.y,
    '#71717a',
    25,
    'smoke',
  );
  addFloatingText(state, building.x, building.y - 10, `Refunded: ${gotWood}w ${gotStone}s`, '#eab308');
  impulseScreenShake(state, 4);

  removeBuildingFromState(state, building);
  // Demolition changes authoritative capacity immediately, even while paused.
  updateStorageCaps(state);
  invalidatePopulationSnapshotCache(state);
  reconcileAssignmentsAfterBuildingRemoval(state);
  return state;
}

/** Immutable public API used outside the worker-command owner. */
export function demolishBuilding(originalState: WorldState, buildingId: number): WorldState {
  return demolishBuildingInPlace(structuredClone(originalState), buildingId);
}