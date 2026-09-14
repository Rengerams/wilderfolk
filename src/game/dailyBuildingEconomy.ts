/**
 * Daily construction, repair, and production owners called by tickLayerDaily.
 *
 * Grass ecology (growth/spread), static bookkeeping, building production,
 * frontier systems, and daily-gated world events. Trees have no sim tick.
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
import { rollEconomyLedgerForDay } from './economyLedger';
import { canAffordWorkshopRecipe } from './workshops';
import { logEvent } from './eventLog';
import { getForgeQuarryMultiplier, tickVillageForge } from './forge';
import { getHuntFoodMultiplier } from './combat';
import { isProductionTick, PRODUCTION_INTERVAL, TICKS_PER_DAY } from './dayCycle';
import type { TickContext } from './simulation/simulationTypes';
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
  rewardProductionSkills,
  getWorkerSkillMultiplier,
} from './skills';
import { assignMissingWorkers, getSmithBonus } from './workforce';
import { isPlayerHuman } from './playerHuman';
import { tickHospitalDailyCare } from './hospitalCare';
import { getScheduleProductivityMultiplier } from './scheduleFatigue';
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
  // Same colony day after morning burn: reuse stored flag
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
      const skillMult = getWorkerSkillMultiplier(state, building, entityById);

      building.constructionProgress +=
        baseRate * buildMultiplier * globalMult * skillMult * ordinaryWorkHours;
      building.buildAnimTimer += ordinaryWorkHours * 0.1;

      if (workers > 0) {
        const job = getJobForBuilding(building.type) ?? JobType.Builder;
        for (let o = 0; o < building.occupants.length; o++) {
          gainSkill(state, building.occupants[o], job, 0.15);
        }
      }

      if (building.constructionProgress >= 100) {
        const wasCompleted = building.completed;
        building.constructionProgress = 100;
        building.completed = true;
        building.occupants = [];
        building.spriteScale = 1;
        completedAny = true;
        logEvent(state, 'building', `${BUILDING_CONFIGS[building.type].label} completed`);

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
    assignMissingWorkers(livingPlayerHumans, state.buildings, state);
  }
}

// ==================== STATIC / DAILY BOOKKEEPING ====================

function tickStaticDaily(state: WorldState, season: Season): void {
  // Storage caps and spoilage are derived from the standing buildings, so they are
  // recomputed once per colony day, before spoilage is applied. `tickBuildingProgress`
  // has already run in this same daily pass, so a Barn/Silo finished today counts today.
  // This call is what makes `updateStorageCaps` live: it previously had no caller at all,
  // so every Barn/Silo/Wood Storehouse/Store bonus and the Silo spoilage cut never reached
  // play (the economy-audit test passed only because it invoked the function by hand).
  // Roll the day ledger to today *before* anything records into it, so consumers that read the
  // raw `state.economyLedger` (dashboardData) never see yesterday's totals, and archive the day
  // that just finished. Idempotent, so the record helpers may still roll lazily.
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
}

// ==================== FRONTIER SYSTEMS ====================

/**
 * The living player settler working this building, if any.
 *
 * Used by the Hunting Spot so its shot can be emitted from the hunter rather than
 * from the building — see `BUG_REPORTS/2026-08-28-hunting-projectile-visual.md`.
 */
function findLiveAssignedWorker(
  building: Building,
  entityById: ReadonlyMap<number, Entity>,
): Entity | undefined {
  for (let i = 0; i < building.occupants.length; i++) {
    const worker = entityById.get(building.occupants[i]);
    if (worker?.alive && isPlayerHuman(worker)) return worker;
  }
  return undefined;
}

function tickBuildingProduction(
  state: WorldState,
  ctx: TickContext,
  allAlive: Entity[],
): void {
  const { updatedBuildings, entityById, byType, roadBuildings } = ctx;

  const hasMill = updatedBuildings.some((b) => b.type === BuildingType.Mill && b.completed);
  const millBonus = hasMill ? 1.25 : 1.0;
  const globalEff =
    getMultiplier(state, 'global_efficiency') *
    getTownHallGovernanceEfficiency(state, updatedBuildings);
  const festivalMult = state.festival?.active ? 1.5 : 1.0;
  const workHourMult = getWorkHourProductionMultiplier(
    getWorkScheduleHours(getWorkSchedule(state)),
  );

  const playerWorkers = allAlive.filter(isPlayerHuman);

  // Single-pass building worker count and schedule fatigue aggregation
  const buildingWorkerStats = new Map<number, { count: number; fatigueSum: number }>();
  for (let i = 0; i < playerWorkers.length; i++) {
    const h = playerWorkers[i];
    if (!h.alive || h.faction) continue;
    const siteId = h.homeBuildingId;
    if (siteId == null) continue;

    const current = buildingWorkerStats.get(siteId) ?? { count: 0, fatigueSum: 0 };
    current.count += 1;
    current.fatigueSum += getScheduleProductivityMultiplier(h);
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

    const totalMult =
      levelMult *
      terrainMult *
      adjacencyMult *
      festivalMult *
      skillMult *
      fatigueMult *
      workHourMult;
    const staffed = !BUILDING_JOB_TYPES[building.type] || workers > 0;

    // --- Farm ---
    if (
      building.completed &&
      staffed &&
      building.type === BuildingType.Farm &&
      isProductionTick(state.tick, PRODUCTION_INTERVAL.farm)
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
      const added = addResource(state, 'food', amount);
      recordFoodProduced(state, 'farms', added);
      if (added > 0 && productionJob) {
        for (let o = 0; o < building.occupants.length; o++) {
          gainSkill(state, building.occupants[o], productionJob, 0.2);
        }
      }
    }

    // --- Hunting Spot ---
    if (
      building.completed &&
      staffed &&
      building.type === BuildingType.HuntingSpot &&
      isProductionTick(state.tick, PRODUCTION_INTERVAL.huntingSpot)
    ) {
      const searchRadius = 320;
      const bx = building.x + building.width / 2;
      const by = building.y + building.height / 2;

      let targetPrey: Entity | null = null;
      let bestScore = Infinity;
      const preyTarget = building.huntingSpotPrey ?? 'auto';

      const targetTypes: EntityType[] = [];
      if (preyTarget === 'auto' || preyTarget === 'deer') targetTypes.push(EntityType.Deer);
      if (preyTarget === 'auto' || preyTarget === 'rabbit') targetTypes.push(EntityType.Rabbit);
      if (preyTarget === 'auto' || preyTarget === 'wolf') targetTypes.push(EntityType.Wolf);

      for (let t = 0; t < targetTypes.length; t++) {
        const pool = byType[targetTypes[t]] ?? [];
        for (let p = 0; p < pool.length; p++) {
          const e = pool[p];
          if (!e.alive || e.tamedBy != null) continue;
          const dist = Math.hypot(e.x - bx, e.y - by);
          if (dist >= searchRadius) continue;
          const score = e.type === EntityType.Wolf ? dist + 160 : dist;
          if (score < bestScore) {
            bestScore = score;
            targetPrey = e;
          }
        }
      }

      if (targetPrey) {
        const isWolf = targetPrey.type === EntityType.Wolf;
        // Stateless per shot: whether the prey fights back and whether the shot lands must
        // not depend on how many other draws this module made first.
        const huntKey = `hunt:${building.id}:${state.tick}:${targetPrey.id}`;
        const foughtBack = isWolf && seededRandomForRun(`${huntKey}:fight`) < 0.35;
        const success = !foughtBack && seededRandomForRun(`${huntKey}:success`) < 0.85;

        // The shot must read as fired by the assigned hunter: a Hunting Spot is a
        // work location, not an automatic attack tower. With no living hunter
        // assigned there is nothing to emit, so the building never fires by itself.
        const hunter = findLiveAssignedWorker(building, entityById);
        if (hunter) {
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
        }

        if (foughtBack) {
          building.health = Math.max(10, building.health - 12);
          addFloatingText(state, building.x, building.y - 12, 'Wolf fights back! 🐺', '#f87171');
          logEvent(state, 'combat', 'A wild wolf fought back at the Hunting Spot!');
        } else if (success) {
          // `hunt_food` is the key the hunting research nodes actually declare (defense_2/4/8);
          // the previous `hunt_yield` lookup matched no node and was a permanent 1.
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

          if (amount <= 0 || addResource(state, 'food', amount) <= 0) {
            addFloatingText(
              state,
              building.x + building.width / 2,
              building.y - 12,
              'Stores full!',
              '#94a3b8',
              'brief',
            );
          } else {
            recordFoodProduced(state, 'hunting', amount);
            const preyId = targetPrey.id;
            targetPrey.energy = 0;
            markWildlifeDead(ctx, targetPrey, undefined, state.tick);
            clearHuntersTargetingPrey(preyId, entityById, ctx.huntTargetByPreyId);
            syncEntityGrids(ctx, targetPrey);
            rewardProductionSkills(state, building, 0.2, entityById);
            addFloatingText(
              state,
              targetPrey.x,
              targetPrey.y - 12,
              `+${amount} meat`,
              '#ef4444',
              'brief',
            );
            const preyName =
              targetPrey.type === EntityType.Deer
                ? 'deer'
                : targetPrey.type === EntityType.Wolf
                  ? 'wolf'
                  : 'rabbit';
            logEvent(state, 'event', `Hunting Spot bagged a ${preyName} (+${amount} meat)`);
          }
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

    // --- Fishing Spot ---
    if (
      building.completed &&
      staffed &&
      building.type === BuildingType.FishingSpot &&
      isProductionTick(state.tick, PRODUCTION_INTERVAL.fishingSpot)
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
      if (amount <= 0 || addResource(state, 'food', amount) <= 0) {
        addFloatingText(
          state,
          building.x + building.width / 2,
          building.y - 12,
          'Stores full!',
          '#94a3b8',
          'brief',
        );
      } else {
        recordFoodProduced(state, 'fishing', amount);
        rewardProductionSkills(state, building, 0.2, entityById);
        addFloatingText(
          state,
          building.x + building.width / 2,
          building.y - 12,
          `+${amount} fish`,
          '#38bdf8',
          'brief',
        );
        logEvent(state, 'event', `Fishing Spot hauled in ${amount} fish from the river`);
      }
    }

    // --- Store ---
    if (
      building.completed &&
      staffed &&
      building.type === BuildingType.Store &&
      isProductionTick(state.tick, PRODUCTION_INTERVAL.store)
    ) {
      const goldMult = getMultiplier(state, 'gold_production');
      const amount = Math.floor(5 * totalMult * goldMult * globalEff);
      if (addResource(state, 'gold', amount) > 0) {
        rewardProductionSkills(state, building, 0.2, entityById);
      }
    }

    // --- Lumber Mill ---
    if (
      building.completed &&
      staffed &&
      building.type === BuildingType.LumberMill &&
      isProductionTick(state.tick, PRODUCTION_INTERVAL.lumber)
    ) {
      const lumberMult = getMultiplier(state, 'lumber_yield');
      const amount = Math.floor(
        (12 + workers * 4) * totalMult * smithBonus * lumberMult * globalEff,
      );
      if (addResource(state, 'wood', amount) > 0) {
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
      isProductionTick(state.tick, PRODUCTION_INTERVAL.quarry)
    ) {
      const stoneMult = getMultiplier(state, 'quarry_yield') * getForgeQuarryMultiplier(state);
      const amount = Math.floor((8 + workers * 3) * totalMult * smithBonus * stoneMult * globalEff);
      if (addResource(state, 'stone', amount) > 0) {
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
      isProductionTick(state.tick, PRODUCTION_INTERVAL.mine)
    ) {
      const stoneMult = getMultiplier(state, 'stone_production');
      const amount = Math.floor((12 + workers * 4) * totalMult * smithBonus * stoneMult * globalEff);
      // Ores only — stone is the Quarry's job. Gold is the premium vein, so it
      // is extracted only when the player picked it; see `mineOreForMode`.
      const ore = mineOreForMode(building.mineMode);
      if (addResource(state, ore, amount) > 0) rewardProductionSkills(state, building, 0.2, entityById);
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
      isProductionTick(state.tick, PRODUCTION_INTERVAL.greenhouse)
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
      // Mirror the farm path: the ledger row is the food that actually entered
      // storage (`added`), not the nominal harvest, so a full store cannot make
      // the ledger disagree with the resources.
      const added = addResource(state, 'food', amount);
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
      isProductionTick(state.tick, PRODUCTION_INTERVAL.market)
    ) {
      const goldMult = getMultiplier(state, 'gold_production');
      const amount = Math.floor((8 + workers * 3) * totalMult * goldMult * globalEff);
      if (addResource(state, 'gold', amount) > 0) {
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
      isProductionTick(state.tick, PRODUCTION_INTERVAL.workshop)
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
          const added = addResource(state, 'gold', amount);
          if (added > 0) {
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
      isProductionTick(state.tick, PRODUCTION_INTERVAL.hospital)
    ) {
      addReputation(state, 2);
      tickHospitalDailyCare(state, building, playerWorkers);
    }

    // --- Town Hall ---
    if (
      building.completed &&
      staffed &&
      building.type === BuildingType.TownHall &&
      isProductionTick(state.tick, PRODUCTION_INTERVAL.townHall)
    ) {
      // `isPlayerHuman` does not test `alive`, and `state.entities` is only replaced with the
      // living list at the end of the tick, so a settler killed earlier in this tick would still
      // be taxed and petitioned. `playerWorkers` is this function's alive-filtered settler list;
      // `alive` is re-checked here because the daily social pass before this layer can also kill.
      const villagers = playerWorkers.filter((e) => e.alive);
      tickTownHallCivic(state, building, villagers);
      tickTownHallAudiences(state, building, villagers);
    }

    // --- Silo ---
    if (
      building.completed &&
      staffed &&
      building.type === BuildingType.Silo &&
      isProductionTick(state.tick, PRODUCTION_INTERVAL.silo)
    ) {
      const amount = Math.floor(8 * totalMult * millBonus * globalEff);
      recordFoodProduced(state, 'silos', addResource(state, 'food', amount));
    }
  }

  tickVillageForge(state, updatedBuildings);

  // Urban Planning: completed roads passively generate reputation (road_bonus research)
  const roadRepMult = getMultiplier(state, 'road_bonus');
  if (roadRepMult > 1 && isProductionTick(state.tick, PRODUCTION_INTERVAL.townHall)) {
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