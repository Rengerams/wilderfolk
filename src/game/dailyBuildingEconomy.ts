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
import { refreshFoodLedgerTotals, rollEconomyLedgerForDay } from './economyLedger';
import { getAvailableStorageHeadroom } from './resourceUtils';
import { canAffordWorkshopRecipe } from './workshops';
import { logEvent } from './eventLog';
import { getForgeQuarryMultiplier, tickVillageForge } from './forge';
import { getHuntFoodMultiplier } from './combat';
import { isProductionTick, PRODUCTION_INTERVAL, TICKS_PER_DAY } from './dayCycle';
import type { TickContext } from './simulation/simulationTypes';
import {
  commitHuntingSpotTarget,
  findLiveAssignedWorker,
  HUNTING_FIGHT_BACK_BITE_ENERGY,
  HUNTING_FIGHT_BACK_CHANCE,
  huntingKillReach,
  huntingSpotTarget,
  isHuntingStrikeLive,
} from './huntingSpot';
import { humanDisplayName } from './citizenId';

/**
 * How close the hunter must be to take the shot, in world pixels (~10 m at the measured 11.76 px/m).
 *
 * Owner: *"to kil it you have stand ne xt to it"*, with looking allowed to 350 (*"the range can be 350
 * where is looking"*). This is the former, and it is deliberately not "bodies touching".
 *
 * The first attempt used the free-roam rule verbatim — `hunter.size + prey.size` ≈ 22 px — and it
 * **stopped the spot producing food at all**: prey wanders, so by the time the production tick runs the
 * animal has drifted out of a 22 px reach (measured directly: a fixture deer was at 30 px, moved to
 * 34.5 px on the tick, against a 22 px reach). A strict adjacency gate is only survivable if the hunter
 * *walks to the animal* — which it now does: see `huntingSpot.ts`, and the pursuit applied in
 * `humanTick`'s work branch. That note predicted this change in as many words.
 */

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
import { grantHospitalIntervalReputation } from './hospitalCare';
import {
  getScheduleLastWorkedHours,
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
 * Adds a building's daily output and makes a **clamped** gain visible, returning what storage took.
 *
 * `addResource` caps at `storageMax` and returns the accepted amount, and every producer below used to
 * throw that return away — so a store sitting at its cap deleted the output in silence and a capped
 * Lumber Mill was indistinguishable from an idle one. Measured: wood sat at exactly 800 (the cap) from
 * ~day 60 to day 290 of `probe-winter.mts` while a staffed mill kept running (`LIVE-FINDINGS-STATUS.md`,
 * F6; the helper that answers "is this store full?", `resourceUtils.isResourceCapped`, had no consumer).
 * A **partial** clamp (5 of 30 accepted) was silent even where a total one was announced, so the float
 * fires whenever any of the output was refused, not only when all of it was.
 *
 * The Fishing Spot and Workshop are deliberately not callers: both already float their own success line
 * at the same (x, y), so they fold the refusal into that message instead of stacking a second float on
 * top of it.
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

/**
 * Food-production multiplier one completed Mill gives the whole village.
 *
 * Exported because the inspector's Mill hint typed "+25%" as prose (audit C2 "Building output/tuning
 * copy"): the tunable number lives here, and the hint reads it.
 */
export const MILL_FOOD_PRODUCTION_MULT = 1.25;

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
          // `entityById` is the map this function already built above and already passes to
          // `getWorkerSkillMultiplier`; without it `gainSkill` (skills.ts) falls back to
          // `state.entities.find(…)`, a linear scan of every living entity per occupant.
          gainSkill(state, building.occupants[o], job, 0.15, entityById);
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
  // The day's food balance is this tick's to own: recompute the ledger's totals now that the day's
  // production has run, so the dashboard and the village panel read stored numbers instead of adding
  // the maps up themselves (`LIVE-FINDINGS-STATUS.md`, F2 — "it should be in dailytick").
  refreshFoodLedgerTotals(state);
}

// ==================== FRONTIER SYSTEMS ====================

/**
 * The living player settler working this building, if any — now owned by `huntingSpot.ts`, which the
 * hunter's movement also reads so the settler who shoots is the settler who walks out.
 */

function tickBuildingProduction(
  state: WorldState,
  ctx: TickContext,
  allAlive: Entity[],
): void {
  const { updatedBuildings, entityById, byType, roadBuildings } = ctx;

  const hasMill = updatedBuildings.some((b) => b.type === BuildingType.Mill && b.completed);
  const millBonus = hasMill ? MILL_FOOD_PRODUCTION_MULT : 1.0;
  const globalEff =
    getMultiplier(state, 'global_efficiency') *
    getTownHallGovernanceEfficiency(state, updatedBuildings);
  const festivalMult = state.festival?.active ? 1.5 : 1.0;

  const playerWorkers = allAlive.filter(isPlayerHuman);

  // The Town Hall branches below need the *living* settlers: `isPlayerHuman` does not test `alive`,
  // and the daily social pass that runs before this layer can kill (so `playerWorkers`, taken from
  // this tick's `allAlive`, may hold a corpse). This was re-filtered once per completed Town Hall
  // inside the building loop; it is now computed on first use and reused, because the branch only
  // runs on a Town Hall production tick (~every 3 days) and hoisting it unconditionally would pay
  // the filter on days the old code paid nothing. The value is loop-invariant: nothing in the loop
  // can kill a settler — the only death path reachable from it is `markWildlifeDead` on the Hunting
  // Spot's `targetPrey`, which is confined to the Deer/Rabbit/Wolf pools.
  let livingPlayerWorkers: Entity[] | undefined;

  // Single-pass building worker count, schedule fatigue, and attendance aggregation.
  //
  // `workedHoursSum` / `workedCount` are the attendance half: the hours each assigned settler was
  // actually on shift over the last settled day (`scheduleLastWorkedHours`, snapshotted by the
  // fatigue pass because it runs before this one and zeroes the tick accumulator). A settler parked
  // at home, asleep, or walking the map contributes 0 — the owner's "the person who is working there
  // should be measured, not a random someone". Before this, output scaled with the *configured
  // window* alone (`getWorkScheduleHours`), so a 23-hour day paid 2.56x while nobody had to be at
  // the building at all.
  const buildingWorkerStats = new Map<
    number,
    { count: number; fatigueSum: number; workedHoursSum: number; workedCount: number }
  >();
  for (let i = 0; i < playerWorkers.length; i++) {
    const h = playerWorkers[i];
    // `playerWorkers` is already the colony-human owner's answer — re-testing `h.faction` here
    // was a second definition of the rule (and it disagreed with the owner on the `'player'`
    // marker the fixtures use). `LIVE-FINDINGS-STATUS.md`, duplication A3.
    if (!h.alive) continue;
    const siteId = h.homeBuildingId;
    if (siteId == null) continue;

    const current = buildingWorkerStats.get(siteId)
      ?? { count: 0, fatigueSum: 0, workedHoursSum: 0, workedCount: 0 };
    current.count += 1;
    current.fatigueSum += getScheduleProductivityMultiplier(h);
    const lastWorkedHours = getScheduleLastWorkedHours(h);
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
    // The configured window still sets the ceiling — a long day is still worth more, which is the
    // owner's "if you need for short time more production". Attendance decides how much of that
    // ceiling is earned. One rule, shared with the workshop estimate through
    // `getWorkplacePresenceShare`, so a preview cannot drift from real output.
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
      isProductionTick(state.tick, PRODUCTION_INTERVAL.huntingSpot)
    ) {
      /**
       * **The hunter hunts, not the building** — owner (2026-09-30): *"the hunung spot cannot hunt its
       * just a spot from where they hunt but they free to walk the people who work there they just
       * should hunt its not a tower that can fire"*.
       *
       * This block used to search for prey around the **building** (`building.x + width/2`, with a
       * hardcoded 320 px reach) and only check afterwards that someone was assigned, so a Hunting Spot
       * killed whatever wandered near the *structure* no matter where its hunter actually stood — the
       * shots the owner saw landing "all over the map" (`BUG_REPORTS/2026-09-30-hunting-yield-unbounded.md`
       * and the earlier `2026-08-28-hunting-projectile-visual.md`). The comment further down already
       * stated the intent ("a work location, not an automatic attack tower") but the targeting did not
       * implement it.
       *
       * Now the **assigned hunter's own position and reach** do the targeting, which is the same rule
       * the free-roam path in `humanHuntingBehavior.ts` applies to a settler hunting for themselves. So
       * a spot with nobody on site hunts nothing, and a hunter who has walked out to the herd is the
       * one who shoots at it. The `1.2` is the assigned-hunter bonus that path already grants.
       */
      const hunter = findLiveAssignedWorker(building, entityById);
      if (hunter) {
      /**
       * Looking and killing are two different distances, and the killer is now the *hunter's* to walk.
       *
       * The owner split them explicitly: *"the range can be 350 where is looking but to kil it you have
       * stand ne xt to it"*, and then ruled out the 120 px that stood in for the second half —
       * *"120 px is way to far, its 1800's they dont have guns"*. So the eyes are 350 px
       * (`HUNTING_SPOT_SEARCH_RADIUS_PX`) and the reach is bodies touching (`huntingKillReach`).
       *
       * A contact reach is only survivable **because the hunter now walks to the animal**
       * (`huntingSpotChaseTarget`, applied in `humanTick`'s work branch). The previous attempt at
       * adjacency was abandoned for exactly that missing half — a standing hunter against wandering prey
       * produced no food at all, and the note left behind said the honest fix was the chase. This is it.
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
         * The reach: bodies touching, both radii.
         *
         * The owner's ruling replaced the 120 px stand-in — *"120 px is way to far, its 1800's they dont
         * have guns"* — so the gate is the same one `humanHuntingBehavior.ts` applies to a settler
         * hunting for themselves (`hunter.size + prey.size`): ~21 px against a deer, ~17 px against a
         * rabbit, roughly 1.5–1.8 m. Inside it the 85 % accuracy roll still decides hit or miss;
         * outside it there is no shot to make, and the hunter is walking there to change that.
         */
        const preyDistance = Math.hypot(targetPrey.x - hunter.x, targetPrey.y - hunter.y);
        // Standing beside the animal *now*, or having been beside it moments ago: the pass samples an
        // instant, and the hunter stalks a wandering animal across many ticks. See
        // `HUNTING_SPOT_STRIKE_GRACE_TICKS` for the measurement that forced this.
        const inReach = preyDistance <= huntingKillReach(hunter, targetPrey) || isHuntingStrikeLive(building, state.tick);
        const success = inReach && !foughtBack && seededRandomForRun(`${huntKey}:success`) < 0.85;

        // The shot is already known to have a live hunter: the targeting above only runs when one is
        // found, and this uses that same settler. It used to re-look-up the worker here and silently
        // skip the projectile when none was found, which is now unreachable.
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
           * The wolf turns on the **hunter**, not the building.
           *
           * Owner, 2026-09-30: *"dont forget animals fight back"*. The rule itself is untouched — the
           * same 35 % roll that was already here, against the wolf only (`HUNTING_FIGHT_BACK_CHANCE`),
           * next to the 85 % accuracy roll that is the hunter's own chance of winning the exchange. What
           * changed is where the bite lands: the old branch took 12 health off the Hunting Spot from an
           * animal the settler was never near, and now that the hunter walks up to it (contact reach,
           * `huntingKillReach`) they are the one in range. `huntingSpot.ts` carries the numbers.
           */
          hunter.energy = Math.max(0, hunter.energy - HUNTING_FIGHT_BACK_BITE_ENERGY);
          hunter.combatTicks = 14;
          hunter.flash = 10;
          addFloatingText(state, hunter.x, hunter.y - 14, 'Wolf fights back! 🐺', '#f87171');
          logEvent(
            state,
            'combat',
            `A wild wolf fought back at the Hunting Spot and bit ${humanDisplayName(hunter)}`,
            humanDisplayName(hunter),
          );
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

          // Record what storage actually accepted, not the nominal catch: the ledger's contract is "food
          // that actually entered storage" (`economyLedger.ts`), and `addProductionOutput` both returns
          // that amount and raises the "Stores full!" float when any of the catch was refused.
          const added = addProductionOutput(state, building, 'food', amount);

          if (added > 0) {
            recordFoodProduced(state, 'hunting', added);
            const preyId = targetPrey.id;
            targetPrey.energy = 0;
            markWildlifeDead(ctx, targetPrey, undefined, state.tick);
            // The 4th argument is the tick's `byType` buckets. `clearHuntersTargetingPrey` sweeps
            // only HUNTER_TYPES when it is given them (simulationEntities.ts), which is the same
            // hunter-bucket scoping the three systems-layer call sites already use; without it this
            // call walked every living entity (`entityById.values()`, ~700-900 incl. grass and
            // trees) once per successful shot.
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
          // Prey was spotted but the hunter is not beside it. Distinct from a miss so the player can
          // tell "nothing out there" from "the animal is over there and nobody has walked to it" —
          // the two read identically before, which is part of why the old behaviour looked like a
          // turret firing at range.
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
      // Same contract as the Hunting Spot above: the ledger and the player-facing lines carry what
      // storage accepted, not the nominal catch (LIVE-FINDINGS-STATUS.md, M5). This site floats its own
      // line, so a refused part is named in it rather than by `addProductionOutput`.
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
      isProductionTick(state.tick, PRODUCTION_INTERVAL.store)
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
      isProductionTick(state.tick, PRODUCTION_INTERVAL.lumber)
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
      isProductionTick(state.tick, PRODUCTION_INTERVAL.quarry)
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
      isProductionTick(state.tick, PRODUCTION_INTERVAL.mine)
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
      isProductionTick(state.tick, PRODUCTION_INTERVAL.market)
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
          // The cycle is all-or-nothing, and the headroom is tested *before* crediting. The recipe's
          // full inputs pay for `amount` gold, so a partial credit would take the whole recipe for a
          // fraction of its output and still announce a whole cycle; and `addResource` cannot be
          // called first to find out, because the part it did accept would stay in the store with
          // nothing consumed — free gold. At gold 19 999 of 20 000 a `furniture` cycle used to deduct
          // 10 wood + 2 stone for 1 gold and report "+1 gold · Furniture (store full)"
          // (`LIVE-FINDINGS-STATUS.md`, E-4). Refusing the whole cycle keeps every announced string
          // honest: `+N gold · <recipe>` always means one full recipe.
          if (getAvailableStorageHeadroom(state, 'gold') < amount) {
            // Gold store at its cap: the recipe inputs are deliberately not consumed, so the workshop
            // must say why it produced nothing — this used to be a completely silent no-op (F6).
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
      isProductionTick(state.tick, PRODUCTION_INTERVAL.hospital)
    ) {
      // The whole grant — the flat staffed amount and the ward round's own — is owned by
      // `hospitalCare` (`LIVE-FINDINGS-STATUS.md`, A15); this layer only decides when it fires.
      grantHospitalIntervalReputation(state, building, playerWorkers);
    }

    // --- Town Hall ---
    if (
      building.completed &&
      staffed &&
      building.type === BuildingType.TownHall &&
      isProductionTick(state.tick, PRODUCTION_INTERVAL.townHall)
    ) {
      // See `livingPlayerWorkers` above: the alive re-check the daily social pass requires is done
      // once per pass, not once per Town Hall.
      livingPlayerWorkers ??= playerWorkers.filter((e) => e.alive);
      tickTownHallCivic(state, building, livingPlayerWorkers);
      tickTownHallAudiences(state, building, livingPlayerWorkers);
    }

    // --- Silo ---
    if (
      building.completed &&
      staffed &&
      building.type === BuildingType.Silo &&
      isProductionTick(state.tick, PRODUCTION_INTERVAL.silo)
    ) {
      const amount = Math.floor(8 * totalMult * millBonus * globalEff);
      recordFoodProduced(state, 'silos', addProductionOutput(state, building, 'food', amount));
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
