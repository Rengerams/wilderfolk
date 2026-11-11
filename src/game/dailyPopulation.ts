import { applyLeaderHousePhase } from './leaderHouse';
/**
 * Daily population reconciliation owner called by tickLayerDaily — once per colony day.
 * Manages immigration rolls, housing capacities, dead entity pruning, and residence assignment.
 */
import type { WorldState, Entity, Building } from './gameTypes';
import type { PopulationCounts } from './entityCounts';
import { BuildingType } from './gameTypes';
import { indexLivingEntity } from './entityIndex';
import { getOpenPlayerBeds } from './populationGrowth';
import { getResidenceCapacity } from './housingModel';
import { HUMAN_ADULT_MIN_AGE } from './daycycleconstants';
import { assignMissingResidences } from './housingPipeline';
import { createImmigrantSettler } from './worldGen';
import { findHumanSpawnNear } from './terrainSystems';
import { isPlayerHuman } from './playerHuman';
import { getTownHallImmigrationMultiplier } from './townHall';
import { addFloatingText, addNotification } from './simEffects';
import { logEvent } from './eventLog';
import type { TickContext } from './simulation/simulationTypes';
import { pruneFactionWanderStates } from './factionWander';
import { getSimRng } from './simRng';
import { Human, Immigration, VirtualPlayer } from './gameConstants';
import { getProjectedFoodSupply, isMeasuredFoodDeficit, isProjectedFoodShortfall } from './economyLedger';
import { pushNewEntity } from './simulation/simulationEntities';

/**
 * Automatic immigration needs real completed-day production to cover the projected need; sparse
 * startup history still bootstraps, but stored food must leave a documented runway untouched.
 */
export function canSupportImmigration(
  state: Pick<WorldState, 'tick' | 'foodHistory'> & Partial<Pick<WorldState, 'resources'>>,
  population: number,
  openSlots: number,
): boolean {
  if (openSlots <= 0) return false;
  const largestParty = Math.min(openSlots, 2 + Immigration.FAMILY_MAX_CHILDREN);
  const upcomingDailyNeed = (population + largestParty) * Human.DAILY_FOOD_CONSUMPTION;
  if (isMeasuredFoodDeficit(state, VirtualPlayer.FOOD_DEFICIT_TOLERANCE_RATIO)) return false;
  if (!isProjectedFoodShortfall(state, upcomingDailyNeed,
    VirtualPlayer.FOOD_DEFICIT_TOLERANCE_RATIO)) return true;

  // A forecast gap is not today's deficit: founding colonies may welcome a family while observed
  // harvest plus stores cover sixty days of the gap, with two further weeks untouched.
  const outlook = getProjectedFoodSupply(state, upcomingDailyNeed);
  const stocked = state.resources?.food ?? 0;
  if (!outlook || !Number.isFinite(stocked)) return false;
  const gapPerDay = Math.max(0, outlook.projectedNeedPerDay - outlook.producedPerDay);
  return stocked - gapPerDay * 60 >= upcomingDailyNeed * 14;
}

function tickImmigration(
  state: WorldState,
  ctx: TickContext,
  allAlive: Entity[],
  counts: PopulationCounts,
): void {
  const { updatedBuildings, width, height } = ctx;

  // Single-pass scan for completed player housing
  let housingCap = 0;
  const homes: Building[] = [];

  for (let i = 0; i < updatedBuildings.length; i++) {
    const b = updatedBuildings[i];
    if (
      b.completed &&
      b.faction !== 'rival' &&
      (b.type === BuildingType.House || b.type === BuildingType.Mansion || b.type === BuildingType.Villa)
    ) {
      housingCap += getResidenceCapacity(b);
      homes.push(b);
    }
  }

  const reputation = state.villageReputation ?? 0;
  state.maxHumanPopulation = 5 + housingCap + Math.floor(reputation / 10);

  const completedHousingCount = homes.length;
  const festivalMultiplier = state.festival?.active ? 1.5 : 1.0;
  const townHallMultiplier = getTownHallImmigrationMultiplier(updatedBuildings);

  const immigrationChance = Math.min(
    0.95,
    (0.05 + reputation / 120 + completedHousingCount * 0.03) *
      festivalMultiplier *
      townHallMultiplier,
  );

  // The reputation cap is not a bed count. Immigrants must fit real assignable residences,
  // excluding the Leader's House, whose beds belong to the leader's household.
  const openSlots = Math.max(0, Math.min(state.maxHumanPopulation - counts.humans, getOpenPlayerBeds(state)));

  // Admit a smaller party when the colony can feed one newcomer but not the largest family.
  // Each affordable size is checked against the same projected meal demand and stored-food guard.
  let affordableSlots = 0;
  for (let size = 1; size <= Math.min(openSlots, 2 + Immigration.FAMILY_MAX_CHILDREN); size++) {
    if (!canSupportImmigration(state, counts.humans, size)) break;
    affordableSlots = size;
  }

  // Once per colony day: `tickLayerDaily` is the only caller, and a second roll would admit
  // another family from the same seeded `dailyPopulation` stream.
  const rng = getSimRng('dailyPopulation');
  if (
    state.tick > 0 &&
    affordableSlots > 0 &&
    rng() < immigrationChance
  ) {
    let spawnX = width / 2;
    let spawnY = height / 2;

    if (homes.length > 0) {
      const home = homes[Math.floor(rng() * homes.length)];
      spawnX = home.x + home.width / 2;
      spawnY = home.y + home.height / 2;
    }

    const rawSpawnX = spawnX + (rng() - 0.5) * 40;
    const rawSpawnY = spawnY + (rng() - 0.5) * 40;
    const spawn = findHumanSpawnNear(state, rawSpawnX, rawSpawnY);
    const newcomers = createImmigrantSettler(state, spawn.x, spawn.y, affordableSlots, rng);
    let admitted = 0;

    for (let i = 0; i < newcomers.length; i++) {
      const newcomer = newcomers[i];
      if (counts.humans >= state.maxHumanPopulation) break;

      // 1. Authoritative world entity array
      state.entities.push(newcomer);

      // 2. Living entities array for current frame
      allAlive.push(newcomer);

      // 3. Canonical spawn bookkeeping: ctx.newEntities, entityById and the spatial grids, so
      // this tick's social and hunt queries can see the newcomer.
      pushNewEntity(state, ctx, newcomer);

      // 4. id → living map used by the optimistic display path
      indexLivingEntity(state, newcomer);

      counts.humans++;
      admitted++;
    }

    if (admitted > 0) {
      state.humanPopulation = counts.humans;

      const villagers = allAlive.filter(isPlayerHuman);
      // Newcomers arrive homeless, so the pass's own global fill seats them on this call whatever the
      // sweep bucket is; the tick only spreads the already-housed reassignment work.
      assignMissingResidences(villagers, updatedBuildings, allAlive, state.tick, state.genealogyRegistry,
        (ledger) => applyLeaderHousePhase(state, ledger));

      const label = admitted === 1
        ? (newcomers[0].age < HUMAN_ADULT_MIN_AGE ? 'A young settler arrived' : '+1 Settler arrived')
        : (admitted >= 3 ? `A settler family arrived (${admitted})` : `+${admitted} Settlers arrived`);
      addFloatingText(state, spawnX, spawnY - 18, label, '#22c55e');
      logEvent(state, 'migration', label);
      addNotification(state, 'New Settler', label, 'success', { x: spawnX, y: spawnY });
    }
  }
}

export function tickDailyPopulation(
  state: WorldState,
  ctx: TickContext,
  allAlive: Entity[],
  counts: PopulationCounts,
): void {
  // Prune dead entities backwards from allAlive
  for (let i = allAlive.length - 1; i >= 0; i--) {
    if (!allAlive[i].alive) {
      allAlive.splice(i, 1);
    }
  }

  const livingIds: number[] = new Array(allAlive.length);
  for (let i = 0; i < allAlive.length; i++) {
    livingIds[i] = allAlive[i].id;
  }
  pruneFactionWanderStates(livingIds);

  tickImmigration(state, ctx, allAlive, counts);
}