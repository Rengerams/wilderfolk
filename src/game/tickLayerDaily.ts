/**
 * Daily layer — once per colony day (`tick % TICKS_PER_DAY === 0`).
 *
 * Grass ecology (growth/spread), static bookkeeping, building production,
 * frontier systems, and daily-gated world events. Trees have no sim tick.
 */
import type { WorldState, Entity, Building, Challenge } from './gameTypes';
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
import { indexEntity } from './entityIndex';
import type { PopulationCounts } from './entityCounts';
import {
  addResource,
  canAffordWorkshopRecipe,
  consumeWorkshopRecipeInputs,
  applyFoodSpoilage,
} from './economy';
import { logEvent } from './eventLog';
import { getForgeQuarryMultiplier, tickVillageForge } from './forge';
import { getLumberMillTreeMultiplier } from './treeProximity';
import {
  isProductionTick,
  PRODUCTION_INTERVAL,
  TICKS_PER_DAY,
  isNewCalendarDayTick,
  getCalendarDay,
  FESTIVAL_CHECK_TICKS,
  IMMIGRATION_CHECK_TICKS,
  getResidenceCapacity,
  assignMissingResidences,
  buildWorkTicks,
  WORK_HOURS_PER_DAY,
} from './dayCycle';
import type { TickContext } from './lifeSimulation';
import { tickGrassDaily } from './lifeSimulation';
import { getMultiplier, addReputation, getPollutionProductionMultiplier } from './simHelpers';
import {
  addFloatingText,
  addBigNews,
  addNotification,
  impulseScreenShake,
  createDeathParticles,
} from './simEffects';
import { getTerrainEfficiencyMultiplier, findHumanSpawnNear } from './terrainSystems';
import {
  gainSkill,
  getJobForBuilding,
  rewardProductionSkills,
  decayIdleSkills,
  getWorkerSkillMultiplier,
} from './skills';
import { assignMissingWorkers, getSmithBonus } from './workforce';
import { isPlayerHuman } from './playerHuman';
import { tickHospitalDailyCare } from './hospitalCare';
import { tickTownHallAudiences } from './townHall';
import {
  tickValleyEcologyStage,
  getValleyHuntYieldMultiplier,
  getValleyFarmYieldMultiplier,
} from './ecologyStage';
import {
  rollYearlyWorldEvent,
  tryFirstWeekVisitor,
  tryMidYearVisitorEvent,
  tickRivalSettlements,
  tickVisitorGroups,
} from './groupEvents';
import {
  tickElectionGossip,
  tickElectionBuildup,
  tickLeaderVacancy,
  tryStartDecennialElectionCeremony,
  tryStartVacancyElectionCeremony,
} from './villageLeadership';
import { trackYearEvent } from './stats';
import {
  getTownHallGovernanceEfficiency,
  tickTownHallCivic,
  getTownHallFestivalCooldownTicks,
  getTownHallImmigrationMultiplier,
} from './townHall';
import {
  tickPendingOutgoingRaidEvents,
  tickPendingRaidEvents,
} from './frontierCombat';
import { pruneFactionWanderStates } from './factionWander';
import { createImmigrantSettler, replenishDepletedWildlife } from './worldGen';
import { isChallengeComplete } from './challenges';
import { addHuntVisual } from './huntvisuals';
import { spawnBuildCompleteParticles } from './juiceEffects';
import { loadJuiceEffectsEnabled } from './preferences';

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

const isPassiveBuild = (type: BuildingType) =>
  type === BuildingType.House || type === BuildingType.Road || type === BuildingType.Well;

/** Construction / repair / winter decay — once per colony day (in this file only). */
function tickBuildingProgress(state: WorldState): void {
  const entityById = new Map<number, Entity>();
  for (const e of state.entities) {
    if (e.alive) entityById.set(e.id, e);
  }

  // Fill crews before progress so unfinished sites always get hands on site this day.
  assignMissingWorkers(
    state.entities.filter((e) => e.alive && isPlayerHuman(e)),
    state.buildings,
  );

  const isWinter = state.season === Season.Winter;
  const globalMult = getMultiplier(state, 'global_efficiency');
  let completedAny = false;

  for (const building of state.buildings) {
    if (!building.completed && building.constructionProgress < 100) {
      const workers = building.occupants.length;
      const buildDays = BUILDING_CONFIGS[building.type].buildTime;
      const totalWorkTicks = buildWorkTicks(buildDays);
      const baseRate = 100 / totalWorkTicks;
      // Unstaffed production buildings crawl; houses/roads/wells still self-build slowly.
      const buildMultiplier = workers > 0
        ? 1 + workers * 0.35
        : isPassiveBuild(building.type) ? 0.55 : 0.22;
      const skillMult = getWorkerSkillMultiplier(state, building, entityById);

      building.constructionProgress += baseRate
        * buildMultiplier
        * globalMult
        * skillMult
        * WORK_HOURS_PER_DAY;
      building.buildAnimTimer += WORK_HOURS_PER_DAY * 0.1;

      if (workers > 0) {
        const job = getJobForBuilding(building.type) ?? JobType.Builder;
        for (const id of building.occupants) gainSkill(state, id, job, 0.15);
      }

      if (building.constructionProgress >= 100) {
        const wasCompleted = building.completed;
        building.constructionProgress = 100;
        building.completed = true;
        building.occupants = [];
        building.spriteScale = 1;
        completedAny = true;
        logEvent(state, 'building', `${BUILDING_CONFIGS[building.type].label} completed`);
        if (building.faction !== 'rival') state.totalBuildingsCompleted++;
        const repGain = building.faction === 'rival' ? 0 : 2;
        if (repGain > 0) addReputation(state, repGain);
        if (building.faction !== 'rival') {
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
            if (repGain > 0) {
              addFloatingText(state, building.x, building.y - 8, `+${repGain}⭐`, '#22c55e', 'brief');
            }
            impulseScreenShake(state, 3.5);
          }
        } else {
          createDeathParticles(state, building.x, building.y, '#ffd700', 12, 'star');
        }
        syncAdjacency(state, building, wasCompleted);
      }
      continue;
    }

    if (building.spriteScale !== 1) building.spriteScale = 1;
    if (!building.completed) continue;

    if (isWinter) {
      building.health = Math.max(10, building.health - 2);
    }

    const aliveRepairWorkers = building.occupants.filter(
      (id) => entityById.get(id)?.alive,
    ).length;
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

  // Newly finished job buildings get workers the same day (production can fire below).
  if (completedAny) {
    assignMissingWorkers(
      state.entities.filter((e) => e.alive && isPlayerHuman(e)),
      state.buildings,
    );
  }
}

// ==================== STATIC / DAILY BOOKKEEPING ====================

function tickStaticDaily(state: WorldState, season: Season): void {
  applyFoodSpoilage(state, season);
  tickElectionGossip(state);
}

// ==================== BUILDING PRODUCTION ====================

function tickBuildingProduction(
  state: WorldState,
  ctx: TickContext,
  allAlive: Entity[],
): void {
  const { updatedBuildings, entityById, byType, roadBuildings } = ctx;

  const hasMill = updatedBuildings.some(
    (b) => b.type === BuildingType.Mill && b.completed,
  );
  const millBonus = hasMill ? 1.25 : 1.0;
  const globalEff = getMultiplier(state, 'global_efficiency')
    * getTownHallGovernanceEfficiency(state, updatedBuildings);
  const festivalMult = state.festival?.active ? 1.5 : 1;
  const playerWorkers = allAlive.filter(isPlayerHuman);
  const workersByBuildingId = new Map<number, number>();
  for (const h of playerWorkers) {
    if (!h.alive || h.faction) continue;
    const siteId = h.homeBuildingId;
    if (siteId == null) continue;
    workersByBuildingId.set(siteId, (workersByBuildingId.get(siteId) ?? 0) + 1);
  }
  const adjacencyIndex = ensureAdjacencyIndex(state);
  const smithBonus = getSmithBonus(updatedBuildings, playerWorkers);

  for (const building of updatedBuildings) {
    const levelMult = building.level || 1;
    const terrainMult = getTerrainEfficiencyMultiplier(state, building);
    const adjacencyMult = buildingUsesAdjacency(building)
      ? getAdjacencyMultiplierFromIndex(adjacencyIndex, building)
      : 1;
    const skillMult = getWorkerSkillMultiplier(state, building, entityById);
    const totalMult = levelMult * terrainMult * adjacencyMult * festivalMult * skillMult;
    const productionJob = getJobForBuilding(building.type);

    const workers = BUILDING_JOB_TYPES[building.type]
      ? (workersByBuildingId.get(building.id) ?? 0)
      : 0;
    const staffed = !BUILDING_JOB_TYPES[building.type] || workers > 0;

    if (building.completed && staffed && building.type === BuildingType.Farm && isProductionTick(state.tick, PRODUCTION_INTERVAL.farm)) {
      const harvestBonus = state.bountifulHarvest ? 2 : 1;
      const farmMult = getMultiplier(state, 'farm_yield');
      const pollutionMult = getPollutionProductionMultiplier(state);
      const valleyFarm = getValleyFarmYieldMultiplier(state);
      const amount = Math.floor(22 * totalMult * harvestBonus * millBonus * farmMult * globalEff * pollutionMult * valleyFarm);
      const added = addResource(state, 'food', amount);
      if (added > 0 && productionJob) {
        for (const id of building.occupants) gainSkill(state, id, productionJob, 0.2);
      }
    }

    if (building.completed && staffed && building.type === BuildingType.HuntingSpot && isProductionTick(state.tick, PRODUCTION_INTERVAL.huntingSpot)) {
      const searchRadius = 320;
      const bx = building.x + building.width / 2;
      const by = building.y + building.height / 2;
      // Closest valid game animal — prefer deer/rabbit over wolves; never tamed stock.
      // (Old code used entities.find → always the first array hit, not the nearest.)
      let targetPrey: Entity | null = null;
      let bestScore = Infinity;
      const preyPool = [
        ...(byType[EntityType.Deer] ?? []),
        ...(byType[EntityType.Rabbit] ?? []),
        ...(byType[EntityType.Wolf] ?? []),
      ];
      for (const e of preyPool) {
        if (!e.alive || e.tamedBy != null) continue;
        if (
          e.type !== EntityType.Deer
          && e.type !== EntityType.Rabbit
          && e.type !== EntityType.Wolf
        ) continue;
        const dist = Math.hypot(e.x - bx, e.y - by);
        if (dist >= searchRadius) continue;
        // Wolves are dangerous side-targets — only take them if no game is closer-ish
        const score = e.type === EntityType.Wolf ? dist + 160 : dist;
        if (score < bestScore) {
          bestScore = score;
          targetPrey = e;
        }
      }

      if (targetPrey) {
        const isWolf = targetPrey.type === EntityType.Wolf;
        const foughtBack = isWolf && Math.random() < 0.35;
        const success = !foughtBack && Math.random() < 0.85;

        const visual = {
          id: `hunt_${state.tick}_${Math.floor(Math.random() * 1000)}`,
          hunterId: building.id,
          preyType: targetPrey.type,
          fromX: building.x,
          fromY: building.y,
          toX: targetPrey.x,
          toY: targetPrey.y,
          startedAtTick: state.tick,
          startedAtMs: Date.now(),
          success,
          foughtBack,
        };

        addHuntVisual(state, visual);

        if (foughtBack) {
          building.health = Math.max(10, building.health - 12);
          addFloatingText(state, building.x, building.y - 12, 'Wolf fights back! 🐺', '#f87171');
          logEvent(state, 'combat', 'A wild wolf fought back at the Hunting Spot!');
        } else if (success) {
          const huntMult = getMultiplier(state, 'hunt_yield');
          const valleyHunt = getValleyHuntYieldMultiplier(state);
          // Deer carcass > rabbit > lean wolf meat
          const carcass =
            targetPrey.type === EntityType.Deer ? 1.35
            : targetPrey.type === EntityType.Wolf ? 0.85
            : 1;
          const amount = Math.floor((12 + workers * 6) * carcass * totalMult * huntMult * globalEff * valleyHunt);

          // Don't kill wildlife if stores are full (no meat banked)
          if (amount <= 0 || addResource(state, 'food', amount) <= 0) {
            addFloatingText(state, building.x + building.width / 2, building.y - 12, 'Stores full!', '#94a3b8', 'brief');
          } else {
            const preyId = targetPrey.id;
            targetPrey.alive = false;
            targetPrey.energy = 0;
            entityById.delete(preyId);
            for (const e of entityById.values()) {
              if (e.huntTargetId === preyId) e.huntTargetId = undefined;
            }
            rewardProductionSkills(state, building, 0.2, entityById);
            addFloatingText(state, targetPrey.x, targetPrey.y - 12, `+${amount} meat`, '#ef4444', 'brief');
            const preyName =
              targetPrey.type === EntityType.Deer ? 'deer'
              : targetPrey.type === EntityType.Wolf ? 'wolf'
              : 'rabbit';
            logEvent(state, 'event', `Hunting Spot bagged a ${preyName} (+${amount} meat)`);
          }
        } else {
          addFloatingText(state, targetPrey.x, targetPrey.y - 12, 'Missed shot!', '#94a3b8', 'brief');
        }
      } else {
        addFloatingText(state, building.x + building.width / 2, building.y - 12, 'No prey in range!', '#ef4444', 'brief');
      }
    }

    if (building.completed && staffed && building.type === BuildingType.Store && isProductionTick(state.tick, PRODUCTION_INTERVAL.store)) {
      const goldMult = getMultiplier(state, 'gold_production');
      const amount = Math.floor(5 * totalMult * goldMult * globalEff);
      if (addResource(state, 'gold', amount) > 0) rewardProductionSkills(state, building, 0.2, entityById);
    }
    if (building.completed && staffed && building.type === BuildingType.LumberMill && isProductionTick(state.tick, PRODUCTION_INTERVAL.lumber)) {
      const lumberMult = getMultiplier(state, 'lumber_yield');
      const treeMult = getLumberMillTreeMultiplier(building, byType[EntityType.Tree] ?? []);
      const amount = Math.floor((12 + workers * 4) * totalMult * smithBonus * lumberMult * treeMult * globalEff);
      if (addResource(state, 'wood', amount) > 0) rewardProductionSkills(state, building, 0.2, entityById);
      state.deathParticles.push({ x: building.x + Math.random() * building.width, y: building.y + Math.random() * building.height, vx: (Math.random() - 0.5) * 0.5, vy: -1 - Math.random(), life: 20, maxLife: 20, color: '#8B7355', size: 2 + Math.random() * 2, type: 'smoke' });
    }
    if (building.completed && staffed && building.type === BuildingType.Quarry && isProductionTick(state.tick, PRODUCTION_INTERVAL.quarry)) {
      const stoneMult = getMultiplier(state, 'quarry_yield') * getForgeQuarryMultiplier(state);
      const amount = Math.floor((8 + workers * 3) * totalMult * smithBonus * stoneMult * globalEff);
      if (addResource(state, 'stone', amount) > 0) rewardProductionSkills(state, building, 0.2, entityById);
      state.deathParticles.push({ x: building.x + Math.random() * building.width, y: building.y + Math.random() * building.height, vx: (Math.random() - 0.5) * 0.3, vy: -0.8 - Math.random() * 0.5, life: 25, maxLife: 25, color: '#808080', size: 2 + Math.random() * 2, type: 'smoke' });
    }
    if (building.completed && staffed && building.type === BuildingType.Mine && isProductionTick(state.tick, PRODUCTION_INTERVAL.mine)) {
      const stoneMult = getMultiplier(state, 'stone_production');
      const amount = Math.floor((12 + workers * 4) * totalMult * smithBonus * stoneMult * globalEff);
      if (addResource(state, 'stone', amount) > 0) rewardProductionSkills(state, building, 0.2, entityById);
      state.deathParticles.push({ x: building.x + Math.random() * building.width, y: building.y + Math.random() * building.height, vx: (Math.random() - 0.5) * 0.4, vy: -1 - Math.random(), life: 30, maxLife: 30, color: '#555555', size: 3 + Math.random() * 2, type: 'smoke' });
    }
    if (building.completed && staffed && building.type === BuildingType.Greenhouse && isProductionTick(state.tick, PRODUCTION_INTERVAL.greenhouse)) {
      const harvestBonus = state.bountifulHarvest ? 2 : 1;
      const farmMult = getMultiplier(state, 'farm_yield');
      const pollutionMult = getPollutionProductionMultiplier(state);
      const valleyFarm = getValleyFarmYieldMultiplier(state);
      const amount = Math.floor((18 + workers * 5) * totalMult * harvestBonus * millBonus * farmMult * globalEff * pollutionMult * valleyFarm);
      if (addResource(state, 'food', amount) > 0) rewardProductionSkills(state, building, 0.2, entityById);
      state.deathParticles.push({ x: building.x + Math.random() * building.width, y: building.y + Math.random() * building.height, vx: (Math.random() - 0.5) * 0.3, vy: -0.8 - Math.random() * 0.5, life: 25, maxLife: 25, color: '#90EE90', size: 2 + Math.random(), type: 'smoke' });
    }
    if (building.completed && staffed && building.type === BuildingType.Market && isProductionTick(state.tick, PRODUCTION_INTERVAL.market)) {
      const goldMult = getMultiplier(state, 'gold_production');
      const amount = Math.floor((8 + workers * 3) * totalMult * goldMult * globalEff);
      if (addResource(state, 'gold', amount) > 0) rewardProductionSkills(state, building, 0.2, entityById);
      state.deathParticles.push({ x: building.x + Math.random() * building.width, y: building.y + Math.random() * building.height, vx: (Math.random() - 0.5) * 0.5, vy: -1.2 - Math.random(), life: 30, maxLife: 30, color: '#ffd700', size: 2 + Math.random() * 2, type: 'star' });
    }
    if (building.completed && building.type === BuildingType.Workshop && isProductionTick(state.tick, PRODUCTION_INTERVAL.workshop)) {
      if (workers === 0) {
        addFloatingText(state, building.x + building.width / 2, building.y - 10, 'Needs worker', '#eab308', 'brief');
      } else {
        const goldMult = getMultiplier(state, 'gold_production');
        const recipe = getWorkshopRecipe(building.workshopRecipeId);
        const outputMult = (1 + workers * 0.5) * totalMult * goldMult * globalEff;
        if (canAffordWorkshopRecipe(state, recipe)) {
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
            state.deathParticles.push({ x: building.x + Math.random() * building.width, y: building.y + Math.random() * building.height, vx: (Math.random() - 0.5) * 0.6, vy: -1 - Math.random(), life: 25, maxLife: 25, color: '#cd7f32', size: 2 + Math.random(), type: 'sparkle' });
          }
        } else {
          addFloatingText(state, building.x + building.width / 2, building.y - 10, 'Need materials', '#f97316', 'brief');
        }
      }
    }
    if (building.completed && staffed && building.type === BuildingType.Hospital && isProductionTick(state.tick, PRODUCTION_INTERVAL.hospital)) {
      addReputation(state, 2);
      tickHospitalDailyCare(
        state,
        building,
        state.entities.filter((e) => e.alive && isPlayerHuman(e)),
      );
    }
    if (building.completed && staffed && building.type === BuildingType.TownHall && isProductionTick(state.tick, PRODUCTION_INTERVAL.townHall)) {
      // Deliberately use state.entities here to match legacy behavior:
      // town-hall civic ran before state.entities was replaced with allAlive.
      const villagers = state.entities.filter(isPlayerHuman);
      tickTownHallCivic(state, building, villagers);
      tickTownHallAudiences(state, building, villagers);
    }
    if (building.completed && staffed && building.type === BuildingType.Silo && isProductionTick(state.tick, PRODUCTION_INTERVAL.silo)) {
      const amount = Math.floor(8 * totalMult * millBonus * globalEff);
      addResource(state, 'food', amount);
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

// ==================== FRONTIER SYSTEMS ====================

function tickFestivals(state: WorldState, counts: PopulationCounts): void {
  const townHallFestivalBoost = state.buildings.some(
    (b) => b.completed && b.type === BuildingType.TownHall && b.faction !== 'rival' && b.occupants.length > 0,
  )
    ? 1.4
    : 1;

  let festivalStartedThisTick = false;
  if (
    !state.festival
    && state.tick >= (state.townHallFestivalCooldownUntilTick ?? 0)
    && state.tick % FESTIVAL_CHECK_TICKS === 0
    && counts.humans >= 6
    && Math.random() < 0.25 * townHallFestivalBoost
  ) {
    const festivalNames = ['Harvest Festival', 'Moonlight Feast', 'Founders Day', 'Spring Revel', 'Trade Fair'];
    const name = festivalNames[Math.floor(Math.random() * festivalNames.length)];
    state.festival = { active: true, name, daysLeft: 20 + Math.floor(Math.random() * 20) };
    state.townHallFestivalCooldownUntilTick = state.tick + getTownHallFestivalCooldownTicks();
    state.villageReputation = Math.min(100, state.villageReputation + 10);
    addBigNews(state, '🎉 Festival!', `${name} has begun! Production, courtship, and immigration are boosted for ${state.festival.daysLeft} days.`, 'positive');
    logEvent(state, 'season', `${name} festival began in the village`);
    festivalStartedThisTick = true;
  }

  // Don't burn a day on the same tick the festival starts
  if (state.festival && !festivalStartedThisTick && state.tick > 0 && state.tick % TICKS_PER_DAY === 0) {
    state.festival.daysLeft--;
    if (state.festival.daysLeft <= 0) {
      addBigNews(state, '🎉 Festival Ended', `${state.festival.name} is over. The village returns to normal.`, 'neutral');
      state.festival = null;
      state.townHallFestivalCooldownUntilTick = state.tick + getTownHallFestivalCooldownTicks();
    }
  }
}

function tickImmigration(
  state: WorldState,
  ctx: TickContext,
  allAlive: Entity[],
  counts: PopulationCounts,
): void {
  const { updatedBuildings, entityById, width, height } = ctx;

  const housingCap = updatedBuildings
    .filter((b) => b.completed && (b.type === BuildingType.House || b.type === BuildingType.Mansion))
    .reduce((sum, b) => sum + getResidenceCapacity(b), 0);
  state.maxHumanPopulation = 5 + housingCap + Math.floor(state.villageReputation / 10);

  const completedHousing = updatedBuildings.filter(
    (b) => b.completed && (b.type === BuildingType.House || b.type === BuildingType.Mansion),
  ).length;
  const immigrationChance = Math.min(
    0.95,
    (0.05 + state.villageReputation / 120 + completedHousing * 0.03)
      * (state.festival?.active ? 1.5 : 1)
      * getTownHallImmigrationMultiplier(updatedBuildings),
  );

  if (
    state.tick > 0
    && state.tick % IMMIGRATION_CHECK_TICKS === 0
    && counts.humans < state.maxHumanPopulation
    && Math.random() < immigrationChance
  ) {
    let spawnX = width / 2;
    let spawnY = height / 2;
    const homes = updatedBuildings.filter(
      (b) => b.completed && (b.type === BuildingType.House || b.type === BuildingType.Mansion),
    );
    if (homes.length > 0) {
      const home = homes[Math.floor(Math.random() * homes.length)];
      spawnX = home.x + home.width / 2;
      spawnY = home.y + home.height / 2;
    }
    const rawSpawnX = spawnX + (Math.random() - 0.5) * 40;
    const rawSpawnY = spawnY + (Math.random() - 0.5) * 40;
    const spawn = findHumanSpawnNear(state, rawSpawnX, rawSpawnY);
    const newcomers = createImmigrantSettler(state, spawn.x, spawn.y);
    for (const newcomer of newcomers) {
      allAlive.push(newcomer);
      indexEntity(entityById, newcomer);
      counts.humans++;
    }
    assignMissingResidences(allAlive.filter(isPlayerHuman), updatedBuildings, allAlive);
    addFloatingText(state, spawnX, spawnY - 18, '+1 Settler arrived', '#22c55e');
  }
}

// ==================== DAILY LAYER ENTRYPOINT ====================

export function tickLayerDaily(
  state: WorldState,
  ctx: TickContext,
  allAlive: Entity[],
  counts: PopulationCounts,
): void {
  // Winter heating runs once in gameTick (sets ctx.canHeat) — do not burn wood again here.

  // Grass growth + spread once per day (trees are static props)
  tickGrassDaily(state, ctx, allAlive);

  // Construction / repair / decay — buildings do not move, once per day only
  tickBuildingProgress(state);

  // Static / daily bookkeeping
  tickStaticDaily(state, ctx.season);

  // Frontier systems
  tickVisitorGroups(state, allAlive);
  tickPendingRaidEvents(state, allAlive, ctx.updatedBuildings);
  tickPendingOutgoingRaidEvents(state);
  tickRivalSettlements(state, allAlive);

  // Remove any entities that died during frontier resolution before counts are reused.
  for (let i = allAlive.length - 1; i >= 0; i--) {
    if (!allAlive[i].alive) allAlive.splice(i, 1);
  }
  pruneFactionWanderStates(allAlive.map((e) => e.id));

  tickFestivals(state, counts);
  tickImmigration(state, ctx, allAlive, counts);

  if (state.tick > 0 && state.tick % (TICKS_PER_DAY * 7) === 0) {
    replenishDepletedWildlife(state);
  }

  // Valley ecology stage (after wildlife counts on state; before production yields)
  tickValleyEcologyStage(state);

  // Building production + forge
  tickBuildingProduction(state, ctx, allAlive);

  // Skill decay (new calendar day)
  if (isNewCalendarDayTick(state)) {
    for (const human of ctx.playerHumans) {
      if (!human.alive || human.isJuvenile) continue;
      decayIdleSkills(human, human.job);
    }
  }

  // Election ceremony advances in realtime (every tick) — see tickLayerRealtime

  // Leader vacancy
  const vacancyNews = tickLeaderVacancy(state);
  if (vacancyNews) {
    addBigNews(state, vacancyNews.title, vacancyNews.message, 'neutral');
    addNotification(state, vacancyNews.title, vacancyNews.message, 'event');
  }

  // Yearly world events
  if (state.dayInYear === 0 && state.year > 0) {
    state.activeEvent = null;
  }

  if (state.year > 0 && state.year % 2 === 0 && state.year !== state.lastEventYear) {
    state.lastEventYear = state.year;
    const rolled = rollYearlyWorldEvent(
      state, allAlive, ctx.updatedBuildings, ctx.width, ctx.height,
      () => state.nextEntityId++,
    );
    state.activeEvent = rolled.event;
    if (rolled.bountifulHarvest) state.bountifulHarvest = true;
    if (state.activeEvent) {
      trackYearEvent(state, state.activeEvent.title);
      addNotification(state, state.activeEvent.title, state.activeEvent.description, state.activeEvent.type === 'positive' ? 'success' : state.activeEvent.type === 'negative' ? 'warning' : 'event');
    }
  }

  // Mid-year visitor
  if (state.dayInYear === 180 && state.year > 0 && state.tick > 0) {
    const midEvent = tryMidYearVisitorEvent(state, allAlive, ctx.updatedBuildings);
    if (midEvent) {
      state.activeEvent = midEvent;
      trackYearEvent(state, midEvent.title);
      addNotification(state, midEvent.title, midEvent.description, 'event');
    }
  }

  // First-week visitor
  if (!state.firstWeekVisitorSpawned) {
    const firstWeekEvent = tryFirstWeekVisitor(state, allAlive, ctx.updatedBuildings);
    if (firstWeekEvent) {
      state.activeEvent = firstWeekEvent;
      trackYearEvent(state, firstWeekEvent.title);
      addNotification(state, firstWeekEvent.title, firstWeekEvent.description, 'success');
    }
  }

  // Bountiful harvest reset on odd years
  if (state.year > 0 && state.year % 2 !== 0) {
    state.bountifulHarvest = false;
  }

  // Election buildup and ceremonies (year rollover)
  const prevCalendarDay = state.tick <= 1 ? 0 : getCalendarDay(state.tick - 1);
  const yearRollover = state.dayInYear === 0 && prevCalendarDay > 0;
  if (yearRollover) {
    const buildupNews = tickElectionBuildup(state, state.year, yearRollover);
    if (buildupNews) {
      addBigNews(state, buildupNews.title, buildupNews.message, 'neutral');
      addNotification(state, buildupNews.title, buildupNews.message, 'event');
    }

    const vacancyCeremony = tryStartVacancyElectionCeremony(state, state.year, state.dayInYear);
    const decennialCeremony = !vacancyCeremony
      && tryStartDecennialElectionCeremony(state, state.year, state.dayInYear);

    if (vacancyCeremony || decennialCeremony) {
      addBigNews(
        state,
        '🗳️ Election Day',
        `Settlers gather for the leadership election (Year ${state.year}). Gossip, tension, then the merit reveal — and a village party after.`,
        'neutral',
      );
      addNotification(
        state,
        '🗳️ Election Day',
        `Year ${state.year} leadership election — villagers gathering now.`,
        'event',
      );
    }
  }

  // Challenges
  const challengeHumanCount = counts.humans;
  const challengeState: WorldState = { ...state, ecoHealthYearsAbove80: state.ecoHealthYearsAbove80 };
  state.challenges = state.challenges.map((c) => {
    if (c.completed) return c;
    const completed = isChallengeComplete(c, challengeState, challengeHumanCount, ctx.updatedBuildings);

    if (completed && c.reward) {
      addResource(state, 'wood', c.reward.wood || 0);
      addResource(state, 'stone', c.reward.stone || 0);
      addResource(state, 'food', c.reward.food || 0);
      addResource(state, 'gold', c.reward.gold || 0);
      addFloatingText(state, state.width / 2, state.height / 2 - 40, `Challenge: ${c.title}!`, '#fbbf24');
      if (c.rewardText) {
        addFloatingText(state, state.width / 2, state.height / 2 - 25, c.rewardText, '#22c55e');
      }
      addNotification(state, 'Challenge Complete!', `${c.title} - ${c.rewardText || 'Rewards granted!'}`, 'success');
      impulseScreenShake(state, 4);
    }

    return { ...c, completed: completed || c.completed };
  });
}
