import type { Building, Entity, WorldState } from './gameTypes';
import { BUILDING_CONFIGS, BUILDING_JOB_TYPES, BuildingType } from './gameTypes';
import { addResource } from './economy';
import { addFloatingText, addNotification, createDeathParticles, impulseScreenShake } from './simEffects';
import { assignMissingWorkers, removeWorkerTransition } from './workforce';
import { unindexAdjacency } from './adjacencyIndex';
import { isPlayerHuman } from './playerHuman';
import { getResidenceCapacity, isResidenceBuildingType } from './residencyOccupancy';
import { assignMissingResidences } from './residencyReconciliation';
import { invalidatePopulationSnapshotCache } from './populationGrowth';

const REPAIR_COST = { wood: 10, stone: 5 } as const;
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
 * Computed from what actually reads `building.level`, not from a hand-written list (audited with
 * `tmp/level-effect-audit.mts`):
 *
 *  - **Residences** — `getResidenceCapacity` adds +2 occupants per level above 1.
 *  - **Buildings with a job** — `dailyBuildingEconomy` and `workshopEconomy` multiply output by
 *    `building.level || 1`, so every producing building gains.
 *  - **Everything else** — nothing reads `level`. That is 16 of the 38 types (road, wall, wallGate,
 *    bridge, well, barn, silo, woodStorehouse, mill, tamingPost, watchtower, wildlifePreserve,
 *    garden, statue, lamp, fence), and offering them an upgrade charged real resources for a number
 *    that affected nothing.
 *
 * Derived rather than listed so a new producing building is upgradeable automatically, and so this
 * cannot drift from the two multipliers that actually read the field.
 */
export function buildingTypeHasLevelBenefit(type: BuildingType): boolean {
  return isResidenceBuildingType(type) || !!BUILDING_JOB_TYPES[type];
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
  const building = state.buildings.find((candidate) => candidate.id === buildingId);
  if (!building) return { ok: false, blockReason: 'No such building' };
  if (!building.completed) return { ok: false, blockReason: 'Still under construction' };
  if (building.health >= building.maxHealth) return { ok: false, blockReason: 'Already at full health' };
  if (state.resources.wood < REPAIR_COST.wood || state.resources.stone < REPAIR_COST.stone) {
    return { ok: false, blockReason: `Need ${REPAIR_COST.wood}w ${REPAIR_COST.stone}s` };
  }
  return { ok: true };
}

function listPlayerHumans(state: WorldState): Entity[] {
  return state.entities.filter(isPlayerHuman);
}

function reconcileAssignmentsAfterBuildingRemoval(state: WorldState): void {
  const humans = listPlayerHumans(state);
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
  createDeathParticles(state, building.x + building.width / 2, building.y, '#22c55e', 10, 'sparkle');
  addFloatingText(state, building.x, building.y - 10, 'Repaired!', '#22c55e');
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
  if (building.type === BuildingType.LeaderHouse) {
    return { ok: false, blockReason: "The Leader's House is fully built" };
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
    // Unfinished, capped, or the Leader's House stay silent (no button in the UI);
    // an affordable-looking upgrade the colony cannot pay for shows the price.
    const structural =
      !building.completed
      || building.level >= MAX_BUILDING_LEVEL
      || building.type === BuildingType.LeaderHouse
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
  // Bed capacity is level-dependent (`getResidenceCapacity`), and the population snapshot is cached
  // per tick on counts a level change does not touch — so the header, the focus hints and the sim
  // summary kept reporting the pre-upgrade bed count until the next tick. `populationGrowth` names
  // this call ("e.g. after building upgrades") and had no caller (audit B-5).
  invalidatePopulationSnapshotCache(state);

  if (isResidenceBuildingType(building.type)) {
    const capacity = getResidenceCapacity(building);
    assignMissingResidences(listPlayerHumans(state), state.buildings, state.entities);
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

  createDeathParticles(state, building.x + building.width / 2, building.y, '#3b82f6', 15, 'star');
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

/**
 * The one owner of "what it means for a building to leave authoritative state": the denormalized
 * completed-building counter, the adjacency index, its `state.adjacency` shadow, and — for a road —
 * the road-avoidance cache.
 *
 * Callers own *why* the building leaves (a demolition, or a strip replacement that refunds half) and
 * their own assignment cleanup; they no longer restate any of this. The counter used to be adjusted
 * only on demolition, so every Wall→Gate replacement left "Buildings" (Village tab, Statistics, the
 * population-snapshot cache key) one too high until the next load (audit B-1).
 */
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
 * desynchronised the cap (audit E-5, same class as M2/L1). Returns what was **actually** accepted,
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

export function demolishBuilding(originalState: WorldState, buildingId: number): WorldState {
  const state = structuredClone(originalState);
  const building = state.buildings.find((candidate) => candidate.id === buildingId);
  if (!building) return state;

  // The refund is capped by the storage owner, so report what was actually added rather than the
  // nominal refund (a full store used to announce a refund it never received).
  const { wood: gotWood, stone: gotStone } = refundBuildingCost(state, building.type);

  clearAssignmentsForDemolishedBuilding(state, buildingId);
  createDeathParticles(
    state,
    building.x + building.width / 2,
    building.y + building.height / 2,
    '#71717a',
    25,
    'smoke',
  );
  addFloatingText(state, building.x, building.y - 10, `Refunded: ${gotWood}w ${gotStone}s`, '#eab308');
  impulseScreenShake(state, 4);

  removeBuildingFromState(state, building);
  reconcileAssignmentsAfterBuildingRemoval(state);
  return state;
}