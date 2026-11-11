/**
 * Daily building economy: construction, repair, storage/bookkeeping, production and regrowth,
 * called by `tickLayerDaily` once per colony day.
 */
import type { WorldState, Entity, Building } from './gameTypes';
import { mineOreForMode } from './buildings';
import {
  BuildingType,
  BUILDING_CONFIGS,
  BUILDING_JOB_TYPES,
  EntityType,
  JobType,
  Season,
  getWorkshopRecipe,
} from './gameTypes';
import {
  buildingUsesAdjacency,
  ensureAdjacencyIndex,
  getAdjacencyMultiplierFromIndex,
  syncAdjacency,
} from './adjacencyIndex';
import {
  addResource,
  consumeWorkshopRecipeInputs,
  applyFoodSpoilage,
  updateStorageCaps,
} from './economy';
import { refreshFoodLedgerTotals, rollEconomyLedgerForDay } from './economyLedger';
import { getAvailableStorageHeadroom } from './resourceUtils';
import { canAffordWorkshopRecipe } from './workshops';
import { logEvent } from './eventLog';
import { getForgeQuarryMultiplier, tickVillageForge } from './forge';
import { getHuntFoodMultiplier } from './combat';
import { isProductionTick, PRODUCTION_INTERVAL, TICKS_PER_DAY, TICKS_PER_HOUR, killHuman } from './dayCycle';
import { formatDeathLog } from './citizenId';
import { logDeath } from './eventLog';
import { ensureEntityByIdMap } from './entityIndex';
import type { TickContext } from './simulation/simulationTypes';
import {
  commitHuntingSpotTarget,
  findLiveAssignedWorker,
  HUNTING_FIGHT_BACK_BITE_ENERGY,
  HUNTING_FIGHT_BACK_CHANCE,
  HUNTING_FIGHT_BACK_MAUL_ENERGY,
  huntingFightBackFate,
  huntingKillReach,
  huntingSpotTarget,
  isHuntingStrikeLive,
} from './huntingSpot';
import { humanDisplayName } from './citizenId';

import {
  syncEntityGrids,
  markWildlifeDead,
  clearHuntersTargetingPrey,
} from './simulation/simulationEntities';
import { getWeatherFarmMultiplier } from './grassEcology';
import {
  getMultiplier,
  addReputation,
  getPollutionProductionMultiplier,
} from './simHelpers';
import {
  addFloatingText,
  impulseScreenShake,
  createDeathParticles,
} from './simEffects';
import { recordFoodProduced } from './economyLedger';
import { tickBlueberryRegrowth } from './blueberryForaging';
import { syncLeaderHouseResidency } from './leaderHouse';
import { getTerrainEfficiencyMultiplier } from './terrainSystems';
import {
  gainSkill,
  getJobForBuilding,
  readSkill,
  rewardProductionSkills,
  rewardBuildingWork,
  getWorkerSkillMultiplier,
  SKILL_CREDIT_INTERVAL_TICKS,
  WORK_SKILL_BUILDING_TYPES,
  WORK_SKILL_PER_SHIFT,
} from './skills';
import { assignMissingWorkers, getSmithBonus } from './workforce';
import { isImprisoned } from './housingModel';
import { isPlayerHuman } from './playerHuman';
import { adjustHumanStaminaFromEnergy, getHumanNeedsWorkMultiplier } from './simulation/humanPhysiology';
import { grantHospitalIntervalReputation } from './hospitalCare';
import {
  getScheduleProductivityMultiplier,
  getWorkplacePresenceShare,
} from './scheduleFatigue';
import {
  getValleyHuntYieldMultiplier,
  getValleyFarmYieldMultiplier,
} from './ecologyStage';
import { tickElectionGossip } from './villageLeadership';
import {
  getTownHallGovernanceEfficiency,
  tickTownHallAudiences,
  tickTownHallCivic,
} from './townHall';
import { addHuntVisual } from './huntvisuals';
import { spawnBuildCompleteParticles } from './juiceEffects';
import { loadJuiceEffectsEnabled } from './preferences';
import {
  getWorkSchedule,
  getWorkScheduleHours,
  getWorkHourProductionMultiplier,
} from './workSchedule';
import { getSimRng, seededRandomForRun } from './simRng';

/**
 * Adds a building's daily output, returns what storage accepted, and floats "Stores full!"
 * when any was refused (`addResource` clamps at `storageMax`); Fishing Spot and Workshop do not call it.
 */
function addProductionOutput(
  state: WorldState,
  building: Building,
  type: keyof WorldState['resources'],
  amount: number,
): number {
  const added = addResource(state, type, amount);
  if (amount > added) {
    addFloatingText(
      state,
      building.x + building.width / 2,
      building.y - 12,
      'Stores full!',
      '#94a3b8',
      'brief',
    );
  }
  return added;
}

/**
 * Winter heating — burns wood once per colony day, stores result on state for the whole day.
 * Call from gameTick only (not from daily layer again).
 */
export function tickWinterHeating(
  state: WorldState,
  humanCount: number,
  isWinter: boolean,
): boolean {
  if (!isWinter) {
    state.villageCanHeat = true;
    return true;
  }
  // Same colony day after the day-start burn: reuse stored flag
  if (state.tick > 0 && state.tick % TICKS_PER_DAY !== 0) {
    return state.villageCanHeat !== false;
  }
  // Day boundary: attempt to heat the village
  let canHeat = true;
  if (state.tick > 0 && humanCount > 0) {
    const woodNeeded = Math.ceil(humanCount / 5);
    if (state.resources.wood >= woodNeeded) {
      state.resources.wood -= woodNeeded;
      canHeat = true;
    } else {
      canHeat = false;
    }
  }
  state.villageCanHeat = canHeat;
  return canHeat;
}

const isPassiveBuild = (type: BuildingType): boolean =>
  type === BuildingType.House || type === BuildingType.Road || type === BuildingType.Well;

/** Food-production multiplier one completed Mill gives the whole village; the inspector's Mill hint reads it. */
export const MILL_FOOD_PRODUCTION_MULT = 1.25;

/**
 * One chronicle line per building label finished today, counting repeats of the same label.
 *
 * The count is typed into the message because the worker's delta merge carries only new entry ids.
 */
function logCompletedBuildings(state: WorldState, completedToday: ReadonlyMap<BuildingType, number>): void {
  for (const [type, count] of completedToday) {
    const label = BUILDING_CONFIGS[type].label;
    logEvent(state, 'building', `${label} completed${count > 1 ? ` ×${count}` : ''}`);
  }
}

/** Construction / repair / winter decay — once per colony day. */
function tickBuildingProgress(state: WorldState): void {
  const entityById = new Map<number, Entity>();
  const livingPlayerHumans: Entity[] = [];

  for (let i = 0; i < state.entities.length; i++) {
    const e = state.entities[i];
    if (e.alive) {
      entityById.set(e.id, e);
      if (isPlayerHuman(e)) {
        livingPlayerHumans.push(e);
      }
    }
  }

  // Fill crews before progress so unfinished sites always get hands on site this day.
  assignMissingWorkers(livingPlayerHumans, state.buildings, state);

  const isWinter = state.season === Season.Winter;
  const globalMult = getMultiplier(state, 'global_efficiency');
  const ordinaryWorkHours = getWorkScheduleHours(getWorkSchedule(state));
  let completedAny = false;
  // Keyed in completion order, which is also the order `logCompletedBuildings` writes the lines in.
  const completedToday = new Map<BuildingType, number>();

  for (let b = 0; b < state.buildings.length; b++) {
    const building = state.buildings[b];

    if (!building.completed && building.constructionProgress < 100) {
      const workers = building.occupants.length;
      const buildDays = BUILDING_CONFIGS[building.type].buildTime;
      const totalWorkHours = Math.max(ordinaryWorkHours, Math.round(buildDays * ordinaryWorkHours));
      const baseRate = 100 / totalWorkHours;

      // Unstaffed production buildings crawl; houses/roads/wells still self-build slowly.
      const buildMultiplier =
        workers > 0 ? 1 + workers * 0.35 : isPassiveBuild(building.type) ? 0.55 : 0.22;
      const skillMult = getWorkerSkillMultiplier(state, building, entityById, 'construction');

      building.constructionProgress +=
        baseRate * buildMultiplier * globalMult * skillMult * ordinaryWorkHours;
      building.buildAnimTimer += ordinaryWorkHours * 0.1;

      if (workers > 0) {
        const job = getJobForBuilding(building.type) ?? JobType.Builder;
        for (let o = 0; o < building.occupants.length; o++) {
          // `entityById` is the map this function already built and passes to
          // `getWorkerSkillMultiplier`; without it `gainSkill` scans every living entity per occupant.
          gainSkill(state, building.occupants[o], job, 0.15, entityById);
          // The crew also earns the standard worked shift for the trade it is raising, so a Builder
          // on a house site learns Building; the site's own job is what the roster records.
          gainSkill(state, building.occupants[o], job, WORK_SKILL_PER_SHIFT, entityById);
        }
      }

      if (building.constructionProgress >= 100) {
        const wasCompleted = building.completed;
        building.constructionProgress = 100;
        building.completed = true;
        building.occupants = [];
        building.spriteScale = 1;
        completedAny = true;
        completedToday.set(building.type, (completedToday.get(building.type) ?? 0) + 1);

        if (building.faction !== 'rival') {
          state.totalBuildingsCompleted++;
          const repGain = 2;
          addReputation(state, repGain);

          if (loadJuiceEffectsEnabled()) {
            spawnBuildCompleteParticles(state, building);
            addFloatingText(
              state,
              building.x,
              building.y - building.height * 0.35,
              '✨ Built!',
              '#fde047',
              'emphasis',
            );
            addFloatingText(state, building.x, building.y - 8, `+${repGain}⭐`, '#22c55e', 'brief');
            impulseScreenShake(state, 3.5);
          }
        } else {
          createDeathParticles(state, building.x, building.y, '#ffd700', 12, 'star');
        }

        syncAdjacency(state, building, wasCompleted);
        if (building.type === BuildingType.LeaderHouse) {
          syncLeaderHouseResidency(state);
        }
      }
      continue;
    }

    if (building.spriteScale !== 1) building.spriteScale = 1;
    if (!building.completed) continue;

    if (isWinter) {
      building.health = Math.max(10, building.health - 2);
    }

    let aliveRepairWorkers = 0;
    for (let o = 0; o < building.occupants.length; o++) {
      if (entityById.get(building.occupants[o])?.alive) {
        aliveRepairWorkers++;
      }
    }

    if (building.health < building.maxHealth && aliveRepairWorkers > 0) {
      const hpNeeded = building.maxHealth - building.health;
      const repairAmount = Math.min(5, hpNeeded);
      const woodCost = hpNeeded <= 1 ? 1 : 2;
      if (state.resources.wood >= woodCost) {
        state.resources.wood -= woodCost;
        building.health = Math.min(building.maxHealth, building.health + repairAmount);
      }
    }
  }

  // Newly finished job buildings get workers assigned the same day
  if (completedAny) {
    logCompletedBuildings(state, completedToday);
    assignMissingWorkers(livingPlayerHumans, state.buildings, state);
  }
}

// ==================== STATIC / DAILY BOOKKEEPING ====================

function tickStaticDaily(state: WorldState, season: Season): void {
  // Recompute storage caps before spoilage; they derive from standing buildings, and today's
  // Barn already counts. Roll the ledger to today before anything records into it.
  rollEconomyLedgerForDay(state);
  updateStorageCaps(state);
  applyFoodSpoilage(state, season);
  if (!state.electionCeremony) {
    tickElectionGossip(state);
  }
}

export function tickDailyBuildingEconomy(
  state: WorldState,
  ctx: TickContext,
  allAlive: Entity[],
): void {
  tickBuildingProgress(state);
  tickStaticDaily(state, ctx.season);
  tickBlueberryRegrowth(state);
  tickBuildingProduction(state, ctx, allAlive);
  // Recompute the ledger's food totals now that the day's production has run, so views read
  // stored numbers instead of adding the maps up themselves.
  refreshFoodLedgerTotals(state);
}

// ==================== FRONTIER SYSTEMS ====================

function tickBuildingProduction(
  state: WorldState,
  ctx: TickContext,
  allAlive: Entity[],
): void {
  const { updatedBuildings, entityById, byType, roadBuildings } = ctx;
  // Production runs after the work window, but isProductionTick is anchored to midnight.
  // Align to the same calendar day's start to preserve weekdays and interval cadence.
  const productionDayTick = state.tick - (state.tick % TICKS_PER_DAY);

  const hasMill = updatedBuildings.some((b) => b.type === BuildingType.Mill && b.completed);
  const millBonus = hasMill ? MILL_FOOD_PRODUCTION_MULT : 1.0;
  const globalEff =
    getMultiplier(state, 'global_efficiency') *
    getTownHallGovernanceEfficiency(state, updatedBuildings);
  const festivalMult = state.festival?.active ? 1.5 : 1.0;

  const playerWorkers = allAlive.filter(isPlayerHuman);

  // Town Hall branches below need living settlers: a daily social pass can kill, so
  // `playerWorkers` (from this tick's `allAlive`) may hold a corpse. Computed lazily and reused.
  let livingPlayerWorkers: Entity[] | undefined;

  // Single-pass building worker count, schedule fatigue, and attendance aggregation.
  // A settler parked at home, asleep, or walking the map contributes 0 worked hours.
  const buildingWorkerStats = new Map<
    number,
    { count: number; fatigueSum: number; workedHoursSum: number; workedCount: number }
  >();
  for (let i = 0; i < playerWorkers.length; i++) {
    const h = playerWorkers[i];
    // `playerWorkers` already applies the colony-human owner's rule; do not re-test `h.faction`.
    if (!h.alive) continue;
    // A jailed settler keeps the reserved post but feeds no crew: they neither work nor attend.
    if (isImprisoned(h)) continue;
    const siteBuilding = h.workerBuildingId == null ? undefined : ctx.buildingById.get(h.workerBuildingId);
    // Hunters are mobile: their shift is the work, not a fixed post.
    const huntingSpot = siteBuilding?.type === BuildingType.HuntingSpot;
    const presentTicks = huntingSpot
      ? (h.scheduleWorkedTicksToday ?? h.schedulePresentTicksToday)
      : (h.schedulePresentTicksToday != null && h.schedulePresentTicksToday > 0
        ? h.schedulePresentTicksToday
        : undefined);
    const workedTicks = presentTicks
      ?? h.scheduleWorkedTicksToday
      ?? ((h.scheduleLastWorkedHours ?? 0) * TICKS_PER_HOUR);
    const lastWorkedHours = workedTicks / TICKS_PER_HOUR;
    if (lastWorkedHours <= 0) continue;
    // Attribute the verified hours to the site they were worked at. `-1` means the
    // settler changed sites; crediting that to the current building would be a guess.
    const workedSiteId = huntingSpot
      ? h.scheduleWorkedSiteIdToday
      : (presentTicks != null
        ? h.schedulePresentSiteIdToday
        : (h.scheduleWorkedSiteIdToday ?? h.scheduleLastWorkedSiteId));
    const siteId = workedSiteId == null ? h.workerBuildingId : workedSiteId;
    if (siteId == null || siteId < 0) continue;

    const current = buildingWorkerStats.get(siteId)
      ?? { count: 0, fatigueSum: 0, workedHoursSum: 0, workedCount: 0 };
    current.count += 1;
    current.fatigueSum += Math.min(getScheduleProductivityMultiplier(h), getHumanNeedsWorkMultiplier(h));
    current.workedHoursSum += lastWorkedHours;
    if (lastWorkedHours > 0) current.workedCount += 1;
    buildingWorkerStats.set(siteId, current);
  }

  const adjacencyIndex = ensureAdjacencyIndex(state);
  const smithBonus = getSmithBonus(updatedBuildings, playerWorkers);

  for (let b = 0; b < updatedBuildings.length; b++) {
    const building = updatedBuildings[b];
    const levelMult = building.level || 1;
    const terrainMult = getTerrainEfficiencyMultiplier(state, building);
    const adjacencyMult = buildingUsesAdjacency(building)
      ? getAdjacencyMultiplierFromIndex(adjacencyIndex, building)
      : 1.0;
    const skillMult = getWorkerSkillMultiplier(state, building, entityById);
    const productionJob = getJobForBuilding(building.type);

    const stats = buildingWorkerStats.get(building.id);
    const workers = BUILDING_JOB_TYPES[building.type] && stats ? stats.count : 0;
    const fatigueMult = workers > 0 && stats ? stats.fatigueSum / workers : 1.0;
    // The configured window sets the ceiling; attendance decides how much of it is earned.
    // Shared with the workshop estimate through `getWorkplacePresenceShare`.
    const scheduleHours = getWorkScheduleHours(getWorkSchedule(state));
    const presenceMult = getWorkplacePresenceShare(
      workers > 0 && stats ? stats.workedHoursSum / workers : 0,
      workers,
      scheduleHours,
      (stats?.workedCount ?? 0) > 0,
    );
    const workHourMult = getWorkHourProductionMultiplier(scheduleHours);

    const totalMult =
      levelMult *
      terrainMult *
      adjacencyMult *
      festivalMult *
      skillMult *
      fatigueMult *
      workHourMult *
      presenceMult;
    const staffed = !BUILDING_JOB_TYPES[building.type] || workers > 0;

    // Work is what teaches: a completed production workplace pays its crew trade skill once per
    // standard cadence, whatever the store accepted. `rewardBuildingWork` still reads the shift.
    if (
      building.completed &&
      WORK_SKILL_BUILDING_TYPES.has(building.type) &&
      isProductionTick(productionDayTick, SKILL_CREDIT_INTERVAL_TICKS)
    ) {
      rewardBuildingWork(state, building, 1, WORK_SKILL_PER_SHIFT, entityById);
    }

    // --- Farm ---
    if (
      building.completed &&
      staffed &&
      building.type === BuildingType.Farm &&
      isProductionTick(productionDayTick, PRODUCTION_INTERVAL.farm)
    ) {
      const harvestBonus = state.bountifulHarvest ? 2 : 1;
      const farmMult = getMultiplier(state, 'farm_yield');
      const pollutionMult = getPollutionProductionMultiplier(state);
      const valleyFarm = getValleyFarmYieldMultiplier(state);
      const weatherFarm = getWeatherFarmMultiplier(state.weather, getMultiplier(state, 'drought_resist'));
      const amount = Math.floor(
        (12 + workers * 5) *
          totalMult *
          harvestBonus *
          millBonus *
          farmMult *
          globalEff *
          pollutionMult *
          valleyFarm *
          weatherFarm,
      );
      const added = addProductionOutput(state, building, 'food', amount);
      recordFoodProduced(state, 'farms', added);
      if (added > 0 && productionJob) {
        for (let o = 0; o < building.occupants.length; o++) {
          // Same contract as the construction-crew site above: pass the tick's id map so
          // `gainSkill` does not fall back to a `state.entities.find` per occupant.
          gainSkill(state, building.occupants[o], productionJob, 0.2, entityById);
        }
      }
    }

    // --- Hunting Spot ---
    if (
      building.completed &&
      staffed &&
      building.type === BuildingType.HuntingSpot &&
      isProductionTick(productionDayTick, PRODUCTION_INTERVAL.huntingSpot)
    ) {
      /**
       * The hunter hunts, not the building: target from the assigned hunter's position and reach,
       * as the free-roam path does. An unstaffed spot hunts nothing.
       */
      const hunter = findLiveAssignedWorker(building, entityById);
      if (hunter) {
      /**
       * Looking and killing use different distances: eyes reach 350 px, the kill reach is
       * bodies touching (`huntingKillReach`), which works because the hunter walks to the prey.
       */
      const targetPrey = huntingSpotTarget(building, hunter, entityById, byType);
      // The spot owns the decision, so it records it: the hunter's walk reads the same commitment.
      commitHuntingSpotTarget(building, targetPrey);

      if (targetPrey) {
        const isWolf = targetPrey.type === EntityType.Wolf;
        // Stateless per shot: whether the prey fights back and whether the shot lands must
        // not depend on how many other draws this module made first.
        const huntKey = `hunt:${building.id}:${state.tick}:${targetPrey.id}`;
        const foughtBack = isWolf && seededRandomForRun(`${huntKey}:fight`) < HUNTING_FIGHT_BACK_CHANCE;
        /**
         * The reach: bodies touching, both radii, the same gate the free-roam hunt applies;
         * inside it the 85 % accuracy roll still decides hit or miss.
         */
        const preyDistance = Math.hypot(targetPrey.x - hunter.x, targetPrey.y - hunter.y);
        // Standing beside the animal now, or moments ago: the pass samples an instant while the
        // hunter stalks across ticks.
        const inReach = preyDistance <= huntingKillReach(hunter, targetPrey) || isHuntingStrikeLive(building, state.tick);
        const success = inReach && !foughtBack && seededRandomForRun(`${huntKey}:success`) < 0.85;

        // The targeting above only runs with a live hunter, so this uses that same settler.
        addHuntVisual(state, {
          id: `hunt_${state.tick}_${Math.floor(getSimRng('dailyBuildingEconomy')() * 1000)}`,
          hunterId: hunter.id,
          preyType: targetPrey.type,
          fromX: hunter.x,
          fromY: hunter.y,
          toX: targetPrey.x,
          toY: targetPrey.y,
          startedAtTick: state.tick,
          startedAtMs: Date.now(),
          success,
          foughtBack,
        });

        if (foughtBack) {
          /**
           * The wolf turns on the hunter, not the building; one roll decides how badly it goes,
           * and the hunter's own trade skill narrows the fatal band (`huntingSpot` owns both).
           */
          const fate = huntingFightBackFate(seededRandomForRun(`${huntKey}:fate`), {
            skill: readSkill(hunter, JobType.Hunter),
          });
          if (fate === 'killed') {
            // A settler's health is its energy, but the wolf kills here, so death goes through
            // the one owner every other death uses, which also runs family/residence/workplace cleanup.
            const killedById = ensureEntityByIdMap(state);
            killHuman(hunter, updatedBuildings, killedById, state.tick, state);
            // The post keeps its roster truthful in the same tick: the dead hunter is not at work.
            building.occupants = building.occupants.filter((id) => id !== hunter.id);
            logDeath(
              state,
              formatDeathLog(hunter, `was killed by a wolf at the ${BUILDING_CONFIGS[building.type].label}`),
              humanDisplayName(hunter),
              { x: hunter.x, y: hunter.y },
            );
            continue;
          }

  const mauled = fate === 'mauled';
          const damage = HUNTING_FIGHT_BACK_BITE_ENERGY + (mauled ? HUNTING_FIGHT_BACK_MAUL_ENERGY : 0);
          if (hunter.needs) {
            adjustHumanStaminaFromEnergy(hunter, -damage);
          } else {
            hunter.energy = Math.max(0, hunter.energy - damage);
          }
          hunter.combatTicks = 14;
          hunter.flash = 10;
          addFloatingText(
            state,
            hunter.x,
            hunter.y - 14,
            mauled ? 'Mauled by a wolf! 🐺' : 'Wolf fights back! 🐺',
            '#f87171',
          );
          logEvent(
            state,
            'combat',
            mauled
              ? `A wild wolf mauled ${humanDisplayName(hunter)} at the Hunting Spot`
              : `A wild wolf fought back at the Hunting Spot and bit ${humanDisplayName(hunter)}`,
            humanDisplayName(hunter),
          );
        } else if (success) {
          // `hunt_food` is the key the hunting research nodes declare (defense_2/4/8);
          // never look it up as `hunt_yield`.
          const huntMult = getHuntFoodMultiplier(state);
          const valleyHunt = getValleyHuntYieldMultiplier(state);
          const carcass =
            targetPrey.type === EntityType.Deer
              ? 1.35
              : targetPrey.type === EntityType.Wolf
                ? 0.85
                : 1.0;
          const amount = Math.floor(
            (12 + workers * 6) * carcass * totalMult * huntMult * globalEff * valleyHunt,
          );

          // Record what storage actually accepted, not the nominal catch: the ledger's contract is
          // "food that actually entered storage", and `addProductionOutput` returns that amount.
          const added = addProductionOutput(state, building, 'food', amount);

          if (added > 0) {
            recordFoodProduced(state, 'hunting', added);
            const preyId = targetPrey.id;
            targetPrey.energy = 0;
            markWildlifeDead(ctx, targetPrey, undefined, state.tick, state);
            // `byType` scopes `clearHuntersTargetingPrey` to HUNTER_TYPES; without it the call
            // walks every living entity once per successful shot.
            clearHuntersTargetingPrey(preyId, entityById, ctx.huntTargetByPreyId, byType);
            syncEntityGrids(ctx, targetPrey);
            rewardProductionSkills(state, building, 0.2, entityById);
            addFloatingText(
              state,
              targetPrey.x,
              targetPrey.y - 12,
              `+${added} meat`,
              '#ef4444',
              'brief',
            );
            const preyName =
              targetPrey.type === EntityType.Deer
                ? 'deer'
                : targetPrey.type === EntityType.Wolf
                  ? 'wolf'
                  : 'rabbit';
            logEvent(state, 'event', `Hunting Spot bagged a ${preyName} (+${added} meat)`);
          }
        } else if (!inReach) {
          // Prey was spotted but the hunter is not beside it: distinct from a miss, so the player
          // can tell "nothing out there" from "the animal is over there".
          addFloatingText(state, hunter.x, hunter.y - 14, 'Too far to shoot', '#94a3b8', 'brief');
        } else {
          addFloatingText(state, targetPrey.x, targetPrey.y - 12, 'Missed shot!', '#94a3b8', 'brief');
        }
      } else {
        addFloatingText(
          state,
          building.x + building.width / 2,
          building.y - 12,
          'No prey in range!',
          '#ef4444',
          'brief',
        );
      }
      }
    }

    // --- Fishing Spot ---
    if (
      building.completed &&
      staffed &&
      building.type === BuildingType.FishingSpot &&
      isProductionTick(productionDayTick, PRODUCTION_INTERVAL.fishingSpot)
    ) {
      const seasonFish =
        state.season === Season.Winter
          ? 0.55
          : state.season === Season.Fall
            ? 1.15
            : state.season === Season.Summer
              ? 0.9
              : 1.0;
      const amount = Math.floor((8 + workers * 4) * totalMult * seasonFish * globalEff);
      // As the Hunting Spot above: the ledger and the player-facing line carry what storage
      // accepted, not the nominal catch.
      const added = addResource(state, 'food', amount);
      if (added <= 0) {
        addFloatingText(
          state,
          building.x + building.width / 2,
          building.y - 12,
          'Stores full!',
          '#94a3b8',
          'brief',
        );
      } else {
        recordFoodProduced(state, 'fishing', added);
        rewardProductionSkills(state, building, 0.2, entityById);
        addFloatingText(
          state,
          building.x + building.width / 2,
          building.y - 12,
          `+${added} fish${amount > added ? ' (store full)' : ''}`,
          '#38bdf8',
          'brief',
        );
        logEvent(state, 'event', `Fishing Spot hauled in ${added} fish from the river`);
      }
    }

    // --- Store ---
    if (
      building.completed &&
      staffed &&
      building.type === BuildingType.Store &&
      isProductionTick(productionDayTick, PRODUCTION_INTERVAL.store)
    ) {
      const goldMult = getMultiplier(state, 'gold_production');
      const amount = Math.floor(5 * totalMult * goldMult * globalEff);
      if (addProductionOutput(state, building, 'gold', amount) > 0) {
        rewardProductionSkills(state, building, 0.2, entityById);
      }
    }

    // --- Lumber Mill ---
    if (
      building.completed &&
      staffed &&
      building.type === BuildingType.LumberMill &&
      isProductionTick(productionDayTick, PRODUCTION_INTERVAL.lumber)
    ) {
      const lumberMult = getMultiplier(state, 'lumber_yield');
      const amount = Math.floor(
        (12 + workers * 4) * totalMult * smithBonus * lumberMult * globalEff,
      );
      if (addProductionOutput(state, building, 'wood', amount) > 0) {
        rewardProductionSkills(state, building, 0.2, entityById);
      }
      for (let i = 0; i < 3; i++) {
        state.deathParticles.push({
          x: building.x + getSimRng('dailyBuildingEconomy')() * building.width,
          y: building.y + getSimRng('dailyBuildingEconomy')() * building.height,
          vx: (getSimRng('dailyBuildingEconomy')() - 0.5) * 1.3,
          vy: -0.5 - getSimRng('dailyBuildingEconomy')() * 0.9,
          life: 16 + getSimRng('dailyBuildingEconomy')() * 10,
          maxLife: 26,
          color: i % 2 === 0 ? '#a16207' : '#d2a95c',
          size: 1.5 + getSimRng('dailyBuildingEconomy')() * 1.4,
          type: 'smoke',
        });
      }
    }

    // --- Quarry ---
    if (
      building.completed &&
      staffed &&
      building.type === BuildingType.Quarry &&
      isProductionTick(productionDayTick, PRODUCTION_INTERVAL.quarry)
    ) {
      const stoneMult = getMultiplier(state, 'quarry_yield') * getForgeQuarryMultiplier(state);
      const amount = Math.floor((8 + workers * 3) * totalMult * smithBonus * stoneMult * globalEff);
      if (addProductionOutput(state, building, 'stone', amount) > 0) {
        rewardProductionSkills(state, building, 0.2, entityById);
      }
      state.deathParticles.push({
        x: building.x + getSimRng('dailyBuildingEconomy')() * building.width,
        y: building.y + getSimRng('dailyBuildingEconomy')() * building.height,
        vx: (getSimRng('dailyBuildingEconomy')() - 0.5) * 0.3,
        vy: -0.8 - getSimRng('dailyBuildingEconomy')() * 0.5,
        life: 25,
        maxLife: 25,
        color: '#808080',
        size: 2 + getSimRng('dailyBuildingEconomy')() * 2,
        type: 'smoke',
      });
    }

    // --- Mine ---
    if (
      building.completed &&
      staffed &&
      building.type === BuildingType.Mine &&
      isProductionTick(productionDayTick, PRODUCTION_INTERVAL.mine)
    ) {
      const stoneMult = getMultiplier(state, 'stone_production');
      const amount = Math.floor((12 + workers * 4) * totalMult * smithBonus * stoneMult * globalEff);
      // Ores only — stone is the Quarry's job. Gold is the premium vein, so it
      // is extracted only when the player picked it; see `mineOreForMode`.
      const ore = mineOreForMode(building.mineMode);
      if (addProductionOutput(state, building, ore, amount) > 0) rewardProductionSkills(state, building, 0.2, entityById);
      state.deathParticles.push({
        x: building.x + getSimRng('dailyBuildingEconomy')() * building.width,
        y: building.y + getSimRng('dailyBuildingEconomy')() * building.height,
        vx: (getSimRng('dailyBuildingEconomy')() - 0.5) * 0.4,
        vy: -1 - getSimRng('dailyBuildingEconomy')(),
        life: 30,
        maxLife: 30,
        color: ore === 'gold' ? '#eab308' : '#a8a29e',
        size: 2 + getSimRng('dailyBuildingEconomy')() * 2,
        type: 'smoke',
      });
    }

    // --- Greenhouse ---
    if (
      building.completed &&
      staffed &&
      building.type === BuildingType.Greenhouse &&
      isProductionTick(productionDayTick, PRODUCTION_INTERVAL.greenhouse)
    ) {
      const harvestBonus = state.bountifulHarvest ? 2 : 1;
      const farmMult = getMultiplier(state, 'farm_yield');
      const pollutionMult = getPollutionProductionMultiplier(state);
      const valleyFarm = getValleyFarmYieldMultiplier(state);
      const weatherFarm = getWeatherFarmMultiplier(state.weather, getMultiplier(state, 'drought_resist'));
      const amount = Math.floor(
        (18 + workers * 5) *
          totalMult *
          harvestBonus *
          millBonus *
          farmMult *
          globalEff *
          pollutionMult *
          valleyFarm *
          weatherFarm,
      );
      // Mirror the farm path: the ledger row is the food that actually entered storage
      // (`added`), not the nominal harvest.
      const added = addProductionOutput(state, building, 'food', amount);
      if (added > 0) {
        recordFoodProduced(state, 'greenhouse', added);
        rewardProductionSkills(state, building, 0.2, entityById);
      }
      state.deathParticles.push({
        x: building.x + getSimRng('dailyBuildingEconomy')() * building.width,
        y: building.y + getSimRng('dailyBuildingEconomy')() * building.height,
        vx: (getSimRng('dailyBuildingEconomy')() - 0.5) * 0.3,
        vy: -0.8 - getSimRng('dailyBuildingEconomy')() * 0.5,
        life: 25,
        maxLife: 25,
        color: '#90EE90',
        size: 2 + getSimRng('dailyBuildingEconomy')(),
        type: 'smoke',
      });
    }

    // --- Market ---
    if (
      building.completed &&
      staffed &&
      building.type === BuildingType.Market &&
      isProductionTick(productionDayTick, PRODUCTION_INTERVAL.market)
    ) {
      const goldMult = getMultiplier(state, 'gold_production');
      const amount = Math.floor((8 + workers * 3) * totalMult * goldMult * globalEff);
      if (addProductionOutput(state, building, 'gold', amount) > 0) {
        rewardProductionSkills(state, building, 0.2, entityById);
      }
      state.deathParticles.push({
        x: building.x + getSimRng('dailyBuildingEconomy')() * building.width,
        y: building.y + getSimRng('dailyBuildingEconomy')() * building.height,
        vx: (getSimRng('dailyBuildingEconomy')() - 0.5) * 0.5,
        vy: -1.2 - getSimRng('dailyBuildingEconomy')(),
        life: 30,
        maxLife: 30,
        color: '#ffd700',
        size: 2 + getSimRng('dailyBuildingEconomy')() * 2,
        type: 'star',
      });
    }

    // --- Workshop ---
    if (
      building.completed &&
      building.type === BuildingType.Workshop &&
      isProductionTick(productionDayTick, PRODUCTION_INTERVAL.workshop)
    ) {
      if (workers === 0) {
        addFloatingText(
          state,
          building.x + building.width / 2,
          building.y - 10,
          'Needs worker',
          '#eab308',
          'brief',
        );
      } else {
        const goldMult = getMultiplier(state, 'gold_production');
        const recipe = getWorkshopRecipe(building.workshopRecipeId);
        const outputMult = (1 + workers * 0.5) * totalMult * goldMult * globalEff;

        if (canAffordWorkshopRecipe(state.resources, recipe)) {
          const amount = Math.max(1, Math.floor(recipe.baseGold * outputMult));
          // The cycle is all-or-nothing: test headroom before crediting, because a partial credit
          // would keep accepted gold with nothing consumed. A full cycle always reports `+N gold`.
          if (getAvailableStorageHeadroom(state, 'gold') < amount) {
            // Gold store at its cap: the recipe inputs are deliberately not consumed, so the
            // workshop must say why it produced nothing.
            addFloatingText(
              state,
              building.x + building.width / 2,
              building.y - 12,
              'Stores full!',
              '#94a3b8',
              'brief',
            );
          } else {
            const added = addResource(state, 'gold', amount);
            consumeWorkshopRecipeInputs(state, recipe);
            rewardProductionSkills(state, building, 0.2, entityById);
            addFloatingText(
              state,
              building.x + building.width / 2,
              building.y - 12,
              `+${added} gold · ${recipe.label}`,
              '#ffd700',
              'brief',
            );
            state.deathParticles.push({
              x: building.x + getSimRng('dailyBuildingEconomy')() * building.width,
              y: building.y + getSimRng('dailyBuildingEconomy')() * building.height,
              vx: (getSimRng('dailyBuildingEconomy')() - 0.5) * 0.6,
              vy: -1 - getSimRng('dailyBuildingEconomy')(),
              life: 25,
              maxLife: 25,
              color: '#cd7f32',
              size: 2 + getSimRng('dailyBuildingEconomy')(),
              type: 'sparkle',
            });
          }
        } else {
          addFloatingText(
            state,
            building.x + building.width / 2,
            building.y - 10,
            'Need materials',
            '#f97316',
            'brief',
          );
        }
      }
    }

    // --- Hospital ---
    if (
      building.completed &&
      staffed &&
      building.type === BuildingType.Hospital &&
      isProductionTick(productionDayTick, PRODUCTION_INTERVAL.hospital)
    ) {
      // The whole grant — flat staffed and ward-round — is owned by `hospitalCare`; this layer
      // only decides when it fires.
      grantHospitalIntervalReputation(state, building, playerWorkers);
    }

    // --- Town Hall ---
    if (
      building.completed &&
      staffed &&
      building.type === BuildingType.TownHall &&
      isProductionTick(productionDayTick, PRODUCTION_INTERVAL.townHall)
    ) {
      // See `livingPlayerWorkers` above: the alive re-check the daily social pass requires is done
      // once per pass, not once per Town Hall.
      livingPlayerWorkers ??= playerWorkers.filter((e) => e.alive);
      tickTownHallCivic(state, building, livingPlayerWorkers);
      tickTownHallAudiences(state, building, livingPlayerWorkers);
    }

    // Silos are storage, not food producers; their food branch multiplied by zero workers.
  }

  tickVillageForge(state, updatedBuildings);

  // Urban Planning: completed roads passively generate reputation (road_bonus research)
  const roadRepMult = getMultiplier(state, 'road_bonus');
  if (roadRepMult > 1 && isProductionTick(productionDayTick, PRODUCTION_INTERVAL.townHall)) {
    const roadCount = roadBuildings.length;
    if (roadCount > 0) {
      const rep = Math.min(5, Math.max(1, Math.floor(roadCount * (roadRepMult - 1) + 1)));
      addReputation(state, rep);
      const camp = updatedBuildings.find(
        (b) => b.completed && (b.type === BuildingType.TownHall || b.type === BuildingType.House),
      );
      if (camp) {
        addFloatingText(
          state,
          camp.x + camp.width / 2,
          camp.y - 12,
          `+${rep} rep (roads)`,
          '#c4b5fd',
          'brief',
        );
      }
    }
  }
}
