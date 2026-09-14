/**
 * Wilderfolk — human simulation tick.
 *
 * Extracted from lifeSimulation.ts: the per-human social / relationship /
 * courtship / commute / leisure pass (`tickHumans`) plus the helpers it
 * exclusively owns. Shared helpers remain in lifeSimulation.ts and are
 * imported here.
 */
import type { WorldState, Entity, Building } from './gameTypes';
import { EntityType, BuildingType, JobType, Season } from './gameTypes';
import { isBarracksGuard } from './defenseStructures';
import { SPECIES_CONFIG } from './speciesConfig';
import { getSimRng, seededRandomForRun } from './simRng';
import { OFFSCREEN_HUMAN_THROTTLE, isInFocus } from './simFocus';
import { addFloatingText } from './simEffects';
import { beautyAt, pickBeautySpot } from './beautyGrid';
import { getChurchStrength, findHumanWorkplace, buildConstructionCrewIndex } from './workforce';

import { isPlayerHuman } from './playerHuman';
import { isSettlerRelationshipEntity } from './moonHowler';
import { getElectionGatherTarget } from './villageLeadership';

import {
  allowSocialLifeFor,
  prefersHomeTonightFor,
  shouldBeAtHomeFor,
} from './humanSchedule';
import { getWorkSchedule, isOnWorkScheduleShift, isWorkScheduleHour } from './workSchedule';
import {
  HUMAN_ADULT_MIN_AGE,
  HUMAN_MAX_LIFESPAN_YEARS,
  tryGraduateHumanChild,
  syncHumanAgeFromCalendar,
  PER_TICK_RATE_SCALE,
  TICKS_PER_HOUR,
  hasResidenceAssignment,
  hasWorkAssignment,
  isOnWorkShift,
  isOnMoonHowlerNightShift,
  isFestivalGatheringHour,
  isWeekend,
  personDayRoll,
  getAbsoluteCalendarDay,
  isNearResidence,
  isResidenceBuilding,
  shareResidence,
  isNewCalendarDayTick,
  EVENING_START,
  isStartOfClockHour,
} from './dayCycle';
import {
  chatHintsFromWorld,
  tickHumanChat,
  tryAmbientRandomDialogue,
  type HumanChatContext,
} from './humanChat';
import { advanceHumanWalkAnim } from './humanSprites';

import { isRenffrGossipActive } from './renffrStar';
import { getHumanFleeSpeedMultiplier } from './combat';
import { isActiveMoonHowler } from './moonHowler';
import { isEntityOnBuilding } from './buildingRotation';

import {
  applyEducationGraduation,
  creditChildSchoolDay,
  findSchoolForChild,
  getSchoolAgeMultiplier,
  recordChildSchoolTick,
} from './education';
import { getPlayerCampCenter, isRaidMarchingForRival } from './frontierCombat';
import { detectRaidersForPatrol } from './humanPatrolBehavior';
import { tickHumanChildLeisure, tickAdultLeisureMotive } from './humanLeisureBehavior';
import { tickHumanHunting } from './humanHuntingBehavior';
import { getCaravanMoveTarget, tryAdvanceCaravanLeg } from './tradeCaravans';
import { tickFactionCampWander } from './factionWander';
import {
  tryNeighborGreeting,
  tryWorkplaceBanter,
} from './socialLife';
import {
  tickHumanDoctorHospitalService,
  tickHumanHospitalPatientCare,
} from './humanHospitalBehavior';
import {
  tickHumanCivicVenueService,
  tickTavernService,
} from './humanVenueBehavior';
import { steerVisitorToHotel } from './hotelStay';
import { setCurrentPathMap } from './pathfinding';
import {
  COMMUTE_SNAP_DISTANCE,
  commuteDistanceToBuilding,
  commuteHumanToBuilding,
  nearestActiveMoonHowler,
  snapHumanToBuilding,
} from './simulation/humanMovement';
import { fract, humanEnergyLoss, tryEatColonyMeal, killFromExhaustion } from './simulation/humanNeeds';
import { simAmbientChatNeighbors, simSettlerChat, simSettlerPairChat } from './simulation/humanSocial';
import { tickPregnancyAndBirth } from './simulation/humanLifecycle';

import { clampToMapBounds } from './mapBounds';
import { buildRoadAvoidanceIndex } from './spatialGrid';
import { buildResidenceOccupantIndex, findClosestEntityInRadius, queryIsNearRoad } from './simQueries';

import { traitMultiplier } from './settlerTraits';
import type { TickContext } from './simulation/simulationTypes';

import {
  findClosestAdaptiveInRadius,
  socialAdaptiveOptions,
  SOCIAL_STAGGER,
  SOCIAL_GREETING_RADIUS,
  SOCIAL_FRIENDSHIP_RADIUS,
  SOCIAL_COURTSHIP_RADIUS,
} from './adaptiveSpatialQuery';
import {
  AFFAIR_SPOUSE_BLOCK_RADIUS,
  canPursueSecretAffair,
  findCourtshipPartner,
  getAffairTrystBuilding,
  getBuildingCenter,
  hasAffairPartner,
  isAtMaritalHome,
  isEligibleToCourt,
  isSpouseNearby,
  isValidAffairTarget,
  isValidAffairTrystSite,
  reconcileAffairPartner,
  shouldLeadAffairPair,
  tryCompleteCourtshipMarriage,
  tryDailyAffairEncounter,
  tryDailyAffairGossip,
  tryDailyAmicableDivorce,
  tryDailyConception,
  tryDailyHumanMortality,
  tryExposeCaughtAffairForPair,
  tryFormSchoolyardBond,
  trySchoolyardGossip,
} from './simulation/humanRelationships';
import { flushRelationshipDiagnostics } from './relationshipDiagnostics';
import { isVenueServiceHour, isVenueScheduleStartTick, isVenueWorkerServiceHour } from './venueSchedule';
import { recordScheduleWorkTick } from './scheduleFatigue';

import { syncEntityGrids } from './simulation/simulationEntities';

/** Live on-screen intimate tryst distance. */
const AFFAIR_INTIMATE_RADIUS = 22;

function getAffairTrystTarget(
  cheater: Entity,
  paramour: Entity,
  buildingById: Map<number, Building>,
): { x: number; y: number } {
  const trystBuilding = getAffairTrystBuilding(cheater, paramour, buildingById);
  if (trystBuilding) return getBuildingCenter(trystBuilding);
  return { x: paramour.x, y: paramour.y };
}

export function tickHumans(state: WorldState, ctx: TickContext): void {
  const {
    width,
    height,
    hourOfDay,
    season,
    canHeat,
    byType,
    newEntities,
    updatedBuildings,
    roadBuildings,
    playerHumans,
    focus,
    entityById,
    buildingById,
    mobileGrid,
    humanSocialGrid,
  } = ctx;

  setCurrentPathMap(state.worldMap, state.buildings);

  const config = SPECIES_CONFIG[EntityType.Human];
  const isWinter = season === Season.Winter;
  const anyActiveHowler = (byType[EntityType.Werewolf] ?? []).some(isActiveMoonHowler);

  const workSchedule = getWorkSchedule(state);
  const goWorkTime = isOnWorkScheduleShift(state, hourOfDay);
  const weekend = isWeekend(state.tick);
  const isNewCalendarDay = isNewCalendarDayTick(state);
  const humanFleeMult = getHumanFleeSpeedMultiplier(state);
  const isTick8 = hourOfDay === 8 && isStartOfClockHour(state.tick);

  const constructionByWorkerId = buildConstructionCrewIndex(updatedBuildings);
  const workplaceOpts = { buildingById, constructionByWorkerId };
  const allHumans: Entity[] = [];
  const humanIds = new Set<number>();

  for (const h of byType[EntityType.Human]) {
    if (!h.alive) continue;
    allHumans.push(h);
    humanIds.add(h.id);
  }
  for (const born of newEntities) {
    if (born.alive && born.type === EntityType.Human && !humanIds.has(born.id)) {
      allHumans.push(born);
      humanIds.add(born.id);
    }
  }

  const workersByWorkplace = new Map<number, Entity[]>();
  for (const h of allHumans) {
    if (!h.alive || !isPlayerHuman(h) || h.isJuvenile) continue;
    const siteId = h.homeBuildingId;
    if (siteId == null) continue;
    const bucket = workersByWorkplace.get(siteId);
    if (bucket) bucket.push(h);
    else workersByWorkplace.set(siteId, [h]);
  }

  const nurturingSettlerCount = allHumans.filter(
    (h) => h.alive && !h.isJuvenile && h.traits?.includes('nurturing'),
  ).length;

  const livingHumanAt = (id: number | null | undefined): Entity | undefined => {
    if (id == null) return undefined;
    const h = entityById.get(id);
    return isSettlerRelationshipEntity(h) ? h : undefined;
  };

  const residenceOccupants = ctx.residenceOccupants ?? buildResidenceOccupantIndex(playerHumans);
  ctx.residenceOccupants = residenceOccupants;
  if (!ctx.roadAvoidance) {
    ctx.roadAvoidance = buildRoadAvoidanceIndex(width, height, roadBuildings);
  }
  const roadAvoidance = ctx.roadAvoidance;
  const churchStrength = getChurchStrength(updatedBuildings, playerHumans);

  if (ctx.hasWell === undefined) {
    ctx.hasWell = updatedBuildings.some((b) => b.type === BuildingType.Well && b.completed);
  }
  if (ctx.hasHospital === undefined) {
    ctx.hasHospital = updatedBuildings.some((b) => b.type === BuildingType.Hospital && b.completed);
  }
  const hasWell = ctx.hasWell;
  const hasHospital = ctx.hasHospital;

  // Corrected: accurately collect player-owned, completed, staffed civic sites
  const staffedHospitals: Building[] = [];
  const staffedTownHalls: Building[] = [];
  for (const b of updatedBuildings) {
    if (!b.completed || b.faction === 'rival' || b.occupants.length === 0) continue;
    if (b.type === BuildingType.Hospital) staffedHospitals.push(b);
    else if (b.type === BuildingType.TownHall) staffedTownHalls.push(b);
  }

  const chatHints = chatHintsFromWorld({
    season,
    weather: state.weather,
    festivalActive: state.festival?.active,
    food: state.resources.food,
  });

  const resolveChatPartner = (id: number): Entity | null => {
    const partner = entityById.get(id);
    return isSettlerRelationshipEntity(partner) ? partner : null;
  };

  const settlerChat = (
    entity: Entity,
    context: HumanChatContext,
    chance: number,
    partner: Entity | null = null,
  ) => simSettlerChat(entity, partner, context, chance, state.tick, chatHints);

  const settlerPairChat = (
    entityA: Entity,
    entityB: Entity,
    context: HumanChatContext,
    chance: number,
  ) => simSettlerPairChat(entityA, entityB, context, chance, state.tick, chatHints);

  const ambientChatNeighbors = (self: Entity): Entity[] =>
    simAmbientChatNeighbors(self, state.tick, humanSocialGrid, allHumans, width, height);

  const schoolReserved = new Map<number, number>();

  for (const entity of allHumans) {
    if (!entity.alive) continue;
    reconcileAffairPartner(entity, entityById);

    // Common updates
    if (isNewCalendarDay) {
      if (entity.isJuvenile && isPlayerHuman(entity)) {
        creditChildSchoolDay(entity);
      }
      const schoolMult =
        entity.isJuvenile && isPlayerHuman(entity)
          ? getSchoolAgeMultiplier(entity, updatedBuildings, nurturingSettlerCount)
          : 1;
      syncHumanAgeFromCalendar(entity, state, {
        schoolAgeMultiplier: schoolMult > 1 ? schoolMult : undefined,
      });
    }

    entity.flash = Math.max(0, entity.flash - 1);
    if (entity.combatTicks && entity.combatTicks > 0) {
      entity.combatTicks--;
      if (entity.combatTicks <= 0) entity.combatTicks = 0;
    }
    if (entity.huntTargetId) {
      const prey = entityById.get(entity.huntTargetId);
      if (!prey?.alive) entity.huntTargetId = undefined;
    }

    if (isNewCalendarDay && tryDailyHumanMortality(state, entity, updatedBuildings, entityById)) {
      syncEntityGrids(ctx, entity);
      continue;
    }

    const isPrisoner = entity.prisonBuildingId != null;
    const atHome = shouldBeAtHomeFor(workSchedule, hourOfDay) && isNearResidence(entity, buildingById);

    entity.reproductionCooldown = Math.max(0, entity.reproductionCooldown - 1);
    if (entity.gender && entity.relationshipStatus === undefined) {
      entity.relationshipStatus = 'single';
      entity.attraction = 50 + getSimRng('humanTick')() * 50;
    }

    let conceivedToday = false;
    if (isNewCalendarDay && !isPrisoner && isPlayerHuman(entity)) {
      conceivedToday = tryDailyConception(state, ctx, entity);
      tryDailyAffairEncounter(
        state,
        entity,
        entityById,
        updatedBuildings,
        buildingById,
        churchStrength,
        hourOfDay,
        humanSocialGrid,
        playerHumans,
        width,
        height,
      );
      tryDailyAffairGossip(
        state,
        entity,
        entityById,
        updatedBuildings,
        buildingById,
        churchStrength,
        playerHumans,
        humanSocialGrid,
        width,
        height,
      );
      tryDailyAmicableDivorce(state, entity, entityById, updatedBuildings, playerHumans);
    }

    tryGraduateHumanChild(entity, config.size, config.speed, (e) => {
      if (isPlayerHuman(e)) applyEducationGraduation(state, e);
    });

    const schoolTarget =
      entity.isJuvenile && isPlayerHuman(entity)
        ? findSchoolForChild(entity, updatedBuildings, schoolReserved)
        : undefined;

    if (schoolTarget) {
      schoolReserved.set(schoolTarget.id, (schoolReserved.get(schoolTarget.id) ?? 0) + 1);
      if (isNewCalendarDay) {
        trySchoolyardGossip(state, entity, entityById, updatedBuildings, playerHumans);
        tryFormSchoolyardBond(state, entity);
      }
    }

    const inFocus = !focus || isInFocus(entity, focus);
    const active =
      !isPrisoner &&
      (inFocus ||
        entity.pregnant ||
        hasAffairPartner(entity, entityById) ||
        (entity.affairProgress ?? 0) >= 20 ||
        (state.tick + entity.id) % OFFSCREEN_HUMAN_THROTTLE === 0);

    const inElectionCeremony = state.electionCeremony != null && isPlayerHuman(entity);

    if (isPrisoner) {
      entity.vx = 0;
      entity.vy = 0;
      const prison = buildingById.get(entity.prisonBuildingId!);
      if (prison) {
        const dx = prison.x - entity.x;
        const dy = prison.y - entity.y;
        const dist = Math.hypot(dx, dy) || 1;
        if (dist > 14) {
          entity.x += (dx / dist) * Math.min(dist, 1.2);
          entity.y += (dy / dist) * Math.min(dist, 1.2);
        }
      }
      syncEntityGrids(ctx, entity);
      continue;
    }

    tickHumanChat(entity, resolveChatPartner);

    if (
      active &&
      isPlayerHuman(entity) &&
      !entity.faction &&
      (entity.chatTicks ?? 0) <= 0 &&
      (state.tick + entity.id) % 3 === 0
    ) {
      tryAmbientRandomDialogue(
        entity,
        ambientChatNeighbors(entity),
        state.tick,
        0.036 * PER_TICK_RATE_SCALE,
        chatHints,
        {
          pregnant: !!entity.pregnant,
          renffr: isRenffrGossipActive(state),
          workHour: goWorkTime,
          night: prefersHomeTonightFor(workSchedule, entity.id, state.tick, hourOfDay),
        },
      );
    }

    if (!active) {
      let minimalEnergyLoss = hasWell ? config.energyLossPerTick * 0.8 : config.energyLossPerTick;
      if (hasHospital) minimalEnergyLoss *= 0.9;
      if (isWinter && !canHeat) minimalEnergyLoss *= 1.5;
      minimalEnergyLoss *= traitMultiplier(entity, 'hardy', 0.85);
      entity.energy -= minimalEnergyLoss;

      tryEatColonyMeal(entity, state, hourOfDay);
      if (isPlayerHuman(entity) && entity.energy <= 0) {
        killFromExhaustion(entity, state, updatedBuildings, entityById);
      }
      syncEntityGrids(ctx, entity);
      continue;
    }

    // Trade-route merchants
    if (entity.faction === 'trade_caravan') {
      const target = getCaravanMoveTarget(state, entity);
      if (target) {
        const dx = target.x - entity.x;
        const dy = target.y - entity.y;
        const dist = Math.hypot(dx, dy) || 1;
        entity.vx = (dx / dist) * config.speed * target.speedMult;
        entity.vy = (dy / dist) * config.speed * target.speedMult;
        entity.x += entity.vx;
        entity.y += entity.vy;
        entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
        tryAdvanceCaravanLeg(state, entity);
      }
      syncEntityGrids(ctx, entity);
      continue;
    }

    // Visitors & rival settlers
    if (entity.faction === 'visitor' || entity.faction === 'rival') {
      const camp =
        entity.faction === 'visitor'
          ? state.visitorGroups.find((g) => g.id === entity.groupId)
          : state.rivalSettlements.find((r) => r.id === entity.groupId);

      if (camp) {
        const marching = entity.faction === 'rival' && entity.groupId && isRaidMarchingForRival(state, entity.groupId);
        if (entity.faction === 'rival') {
          entity.hiddenFromPlayer = Boolean(marching && !entity.detectedByPatrol);
        }
        const playerCenter = marching ? getPlayerCampCenter(state, updatedBuildings) : null;
        const cx = marching && playerCenter ? playerCenter.x : 'campX' in camp ? camp.campX : 0;
        const cy = marching && playerCenter ? playerCenter.y : 'campY' in camp ? camp.campY : 0;

        let speedMult = entity.faction === 'visitor' ? 0.62 : 0.4;
        if (marching) {
          const raidEvt = state.pendingRaidEvents?.find((r) => r.rivalId === entity.groupId);
          const marchTiles = raidEvt?.marchDistanceTiles ?? 30;
          speedMult = Math.max(0.38, 0.92 - marchTiles / 130);
        }

        if (marching) {
          const dx = cx - entity.x;
          const dy = cy - entity.y;
          const dist = Math.hypot(dx, dy) || 1;
          entity.vx = (dx / dist) * config.speed * speedMult;
          entity.vy = (dy / dist) * config.speed * speedMult;
          entity.x += entity.vx;
          entity.y += entity.vy;
          entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
        } else if (
          entity.faction === 'visitor' &&
          steerVisitorToHotel(entity, updatedBuildings, config.speed * speedMult)
        ) {
          // Lodging at hotel
        } else {
          tickFactionCampWander(state, entity, cx, cy, updatedBuildings, config.speed * speedMult);
        }

        const dist = Math.hypot(cx - entity.x, cy - entity.y);
        if (marching && dist < 90) entity.combatTicks = Math.max(entity.combatTicks ?? 0, 8);

        const village = getPlayerCampCenter(state, updatedBuildings);
        const nearVillage = Math.hypot(entity.x - village.x, entity.y - village.y) < 110;
        const chatChance =
          (entity.faction === 'visitor' ? (nearVillage ? 0.055 : 0.03) : 0.025) * PER_TICK_RATE_SCALE;
        settlerChat(entity, entity.faction === 'visitor' ? 'visitor' : 'rival', chatChance);
      }
      syncEntityGrids(ctx, entity);
      continue;
    }

    const energyLoss = humanEnergyLoss(entity, config, {
      hasWell,
      isWinter,
      canHeat,
      hasHospital,
      tick: state.tick,
      hourOfDay,
      buildingById,
    });
    if (isWinter && !canHeat && isTick8) entity.flash = 5;

    entity.energy -= energyLoss;

    const ateMeal = tryEatColonyMeal(entity, state, hourOfDay);

    let suppressIdle = false;
    let onSchedule = false;
    const workplace = findHumanWorkplace(entity, updatedBuildings, workplaceOpts);
    const isInnkeeper =
      entity.job === JobType.Innkeeper && workplace?.type === BuildingType.Tavern && workplace.completed;

    const festivalGathering = isFestivalGatheringHour(hourOfDay, state.festival?.active) && !isInnkeeper;
    const ordinaryWorkplace =
      workplace != null &&
      workplace.type !== BuildingType.Church &&
      workplace.type !== BuildingType.TownHall;
    const onSchoolShift = schoolTarget != null && isOnWorkShift(state.tick, hourOfDay);
    const onDayJobShift =
      !festivalGathering &&
      ((goWorkTime &&
        !isInnkeeper &&
        (ordinaryWorkplace ||
          (entity.job === JobType.Soldier &&
            isBarracksGuard(entity.id, entity.homeBuildingId, updatedBuildings)))) ||
        onSchoolShift);

    const venueWorkerIndex = workplace ? workplace.occupants.indexOf(entity.id) : -1;
    const venueWorkerCount = workplace?.occupants.length ?? 0;
    const usesAutoVenueShifts = workplace?.staffingMode !== 'manual';
    const onTavernShift =
      isInnkeeper &&
      (state.festival?.active === true
        ? isVenueServiceHour(state, 'tavern', hourOfDay, true)
        : venueWorkerIndex >= 0 && usesAutoVenueShifts
          ? isVenueWorkerServiceHour(state, 'tavern', hourOfDay, venueWorkerIndex, venueWorkerCount)
          : isVenueServiceHour(state, 'tavern', hourOfDay));

    const onMoonPriestShift =
      entity.job === JobType.Priest &&
      workplace?.type === BuildingType.Church &&
      workplace.completed &&
      isOnMoonHowlerNightShift(state.tick, hourOfDay);

    const isHotelier =
      entity.job === JobType.Hotelier && workplace?.type === BuildingType.Hotel && workplace.completed;
    const onHotelShift =
      isHotelier &&
      (venueWorkerIndex >= 0 && usesAutoVenueShifts
        ? isVenueWorkerServiceHour(state, 'hotel', hourOfDay, venueWorkerIndex, venueWorkerCount)
        : isVenueServiceHour(state, 'hotel', hourOfDay));

    const onJobShift = onDayJobShift || onTavernShift || onHotelShift || onMoonPriestShift;
    if (onJobShift && isPlayerHuman(entity)) recordScheduleWorkTick(entity);

    const stayIn =
      !festivalGathering &&
      !onTavernShift &&
      !onMoonPriestShift &&
      prefersHomeTonightFor(workSchedule, entity.id, state.tick, hourOfDay);

    const allowFreeRoam = festivalGathering || (!onJobShift && !stayIn);
    const socialBlockedByJob = isInnkeeper
      ? onTavernShift
      : ordinaryWorkplace && isWorkScheduleHour(workSchedule, hourOfDay) && goWorkTime;
    const socialTime =
      (!socialBlockedByJob && allowSocialLifeFor(workSchedule, hourOfDay, false, state.tick)) ||
      (allowFreeRoam && isPlayerHuman(entity));

    const huntingWere = anyActiveHowler
      ? findClosestEntityInRadius(
          mobileGrid,
          entity.x,
          entity.y,
          110,
          isActiveMoonHowler,
          'human_hunt',
          byType[EntityType.Werewolf],
        )
      : undefined;

    if (onMoonPriestShift) {
      suppressIdle = true;
      onSchedule = true;
      const scared = state.tick < (state.moonHowlerPriestsFleeUntil ?? -1);
      const targetWere = nearestActiveMoonHowler(entity, byType[EntityType.Werewolf]);
      if (targetWere) {
        const hdx = targetWere.x - entity.x;
        const hdy = targetWere.y - entity.y;
        const hdist = Math.hypot(hdx, hdy) || 1;
        const dir = scared ? -1 : 1;
        const mult = scared ? 1.35 : 1.1;
        entity.vx = (hdx / hdist) * config.speed * mult * dir;
        entity.vy = (hdy / hdist) * config.speed * mult * dir;
        entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
      } else if (workplace) {
        commuteHumanToBuilding(entity, workplace, config.speed, false, 3.2);
      }
    } else if (huntingWere) {
      const fdx = entity.x - huntingWere.x;
      const fdy = entity.y - huntingWere.y;
      const fdist = Math.sqrt(fdx * fdx + fdy * fdy) || 1;
      const fleeMult = humanFleeMult * traitMultiplier(entity, 'timid', 1.35);
      entity.vx = (fdx / fdist) * config.speed * 1.6 * fleeMult;
      entity.vy = (fdy / fdist) * config.speed * 1.6 * fleeMult;
      entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
      suppressIdle = true;
      onSchedule = true;
      settlerChat(entity, 'fear', 0.14 * PER_TICK_RATE_SCALE);
    } else if (inElectionCeremony && state.electionCeremony) {
      const target = getElectionGatherTarget(state, entity.id);
      const dx = target.x - entity.x;
      const dy = target.y - entity.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist > 10) {
        entity.vx = (dx / dist) * config.speed * 1.15;
        entity.vy = (dy / dist) * config.speed * 1.15;
        entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
      } else {
        entity.vx = 0;
        entity.vy = 0;
      }
      suppressIdle = true;
      onSchedule = true;
    } else if (festivalGathering) {
      const performers = state.visitorGroups.find((group) => group.kind === 'performers' && group.daysLeft > 0);
      const hall = staffedTownHalls.length > 0 ? staffedTownHalls[entity.id % staffedTownHalls.length] : undefined;
      const targetX = performers?.campX ?? (hall ? hall.x + hall.width / 2 : width * 0.5);
      const targetY = performers?.campY ?? (hall ? hall.y + hall.height + 20 : height * 0.5);
      const offsetX = ((entity.id % 7) - 3) * 11;
      const offsetY = ((Math.floor(entity.id / 7) % 5) - 2) * 9;
      const dx = targetX + offsetX - entity.x;
      const dy = targetY + offsetY - entity.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist > 18) {
        entity.vx = (dx / dist) * config.speed * 0.72;
        entity.vy = (dy / dist) * config.speed * 0.72;
        entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
      } else {
        entity.vx = Math.sin(state.tick * 0.04 + entity.id) * config.speed * 0.12;
        entity.vy = Math.cos(state.tick * 0.035 + entity.id) * config.speed * 0.12;
        settlerChat(entity, 'social', 0.12 * PER_TICK_RATE_SCALE);
      }
      suppressIdle = true;
      onSchedule = true;
    }

    // Long commutes: snap at shift start
    if (
      !huntingWere &&
      !inElectionCeremony &&
      !festivalGathering &&
      workplace &&
      isStartOfClockHour(state.tick) &&
      ((hourOfDay === workSchedule.startHour &&
        !isInnkeeper &&
        (hasWorkAssignment(entity) || !workplace.completed)) ||
        (isInnkeeper && isVenueScheduleStartTick(state, 'tavern')) ||
        (isHotelier && isVenueScheduleStartTick(state, 'hotel')))
    ) {
      if (commuteDistanceToBuilding(entity, workplace, false) > COMMUTE_SNAP_DISTANCE) {
        snapHumanToBuilding(entity, workplace, false);
      }
    } else if (
      !huntingWere &&
      !inElectionCeremony &&
      !festivalGathering &&
      hourOfDay === EVENING_START &&
      isStartOfClockHour(state.tick) &&
      stayIn &&
      hasResidenceAssignment(entity)
    ) {
      const eveningHome = buildingById.get(entity.residenceBuildingId!);
      if (
        eveningHome?.completed &&
        commuteDistanceToBuilding(entity, eveningHome, true) > COMMUTE_SNAP_DISTANCE
      ) {
        snapHumanToBuilding(entity, eveningHome, true);
      }
    }

    // Home commute
    if (!huntingWere && !inElectionCeremony && !festivalGathering && !onJobShift && stayIn && hasResidenceAssignment(entity)) {
      const residence = buildingById.get(entity.residenceBuildingId!);
      if (residence?.completed) {
        commuteHumanToBuilding(entity, residence, config.speed, true, 2.5);
        onSchedule = true;
        suppressIdle = true;
      }
    } else if (
      !huntingWere &&
      !inElectionCeremony &&
      !festivalGathering &&
      goWorkTime &&
      workplace &&
      entity.job === JobType.Soldier &&
      isBarracksGuard(entity.id, entity.homeBuildingId, updatedBuildings)
    ) {
      const anchor = getPlayerCampCenter(state, updatedBuildings);
      if (anchor) {
        detectRaidersForPatrol(state, entity, byType[EntityType.Human] ?? []);
        const radius = 95 + (entity.id % 6) * 10;
        const angle = state.tick * 0.028 * PER_TICK_RATE_SCALE + entity.id * 2.1;
        const tx = anchor.x + Math.cos(angle) * radius;
        const ty = anchor.y + Math.sin(angle) * radius * 0.55;
        const pdx = tx - entity.x;
        const pdy = ty - entity.y;
        const pdist = Math.hypot(pdx, pdy) || 1;
        entity.vx = (pdx / pdist) * config.speed * 0.65;
        entity.vy = (pdy / pdist) * config.speed * 0.65;
        entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
        onSchedule = true;
        suppressIdle = true;
      } else if (workplace) {
        commuteHumanToBuilding(entity, workplace, config.speed, workplace.completed && isResidenceBuilding(workplace), 3.5);
        onSchedule = true;
        suppressIdle = true;
      }
    } else if (!huntingWere && !inElectionCeremony && !festivalGathering && onSchoolShift && !isInnkeeper && schoolTarget) {
      commuteHumanToBuilding(entity, schoolTarget, config.speed, false, 3.2);
      onSchedule = true;
      suppressIdle = true;
      recordChildSchoolTick(entity, schoolTarget, hourOfDay, state.tick);
    } else if (
      tickTavernService({
        entity,
        workplace,
        onTavernShift,
        huntingWere: !!huntingWere,
        inElectionCeremony,
        speed: config.speed,
        tick: state.tick,
        onSchedule: () => {
          onSchedule = true;
        },
        onSuppressIdle: () => {
          suppressIdle = true;
        },
        onWorkChat: () => settlerChat(entity, 'work', 0.12),
      })
    ) {
      // Handled
    } else if (!huntingWere && !inElectionCeremony && !festivalGathering && goWorkTime && !isInnkeeper && workplace) {
      commuteHumanToBuilding(entity, workplace, config.speed, workplace.completed && isResidenceBuilding(workplace), 3.5);
      onSchedule = true;
      suppressIdle = true;
    }

    if (!allowFreeRoam && onSchedule && !huntingWere) {
      entity.vx *= 0.85;
      entity.vy *= 0.85;
    }

    const huntingSuppressIdle = tickHumanHunting(
      state,
      ctx,
      entity,
      config,
      allowFreeRoam,
      onSchedule,
      ateMeal,
      festivalGathering,
      byType,
      mobileGrid,
      entityById,
      suppressIdle,
    );
    suppressIdle = huntingSuppressIdle;

    if (
      isPlayerHuman(entity) &&
      entity.gender === 'female' &&
      entity.pregnant &&
      !conceivedToday &&
      entity.pregnancyProgress !== undefined
    ) {
      tickPregnancyAndBirth(state, ctx, entity, { livingHumanAt });
    }

    // Evening out
    if (
      socialTime &&
      allowFreeRoam &&
      isEligibleToCourt(entity) &&
      hourOfDay >= EVENING_START &&
      hourOfDay <= 22 &&
      !suppressIdle &&
      personDayRoll(entity.id, state.tick, 301) > 0.35
    ) {
      const nearbySingle =
        findClosestAdaptiveInRadius(
          humanSocialGrid,
          allHumans,
          entity.x,
          entity.y,
          SOCIAL_COURTSHIP_RADIUS,
          (h) => isEligibleToCourt(h) && h.id !== entity.id && !!h.gender && !!entity.gender && h.gender !== entity.gender,
          socialAdaptiveOptions('social', allHumans.length, width, height),
        ) != null;

      if (!nearbySingle) {
        const tx = width * 0.5 + ((entity.id % 5) - 2) * 35;
        const ty = height * 0.5 + ((entity.id % 7) - 3) * 28;
        const edx = tx - entity.x;
        const edy = ty - entity.y;
        const edist = Math.hypot(edx, edy) || 1;
        if (edist > 12) {
          entity.vx = (edx / edist) * config.speed * 0.45;
          entity.vy = (edy / edist) * config.speed * 0.45;
          entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
          suppressIdle = true;
        }
      }
    }

    // Courtship
    if (socialTime && isEligibleToCourt(entity) && entity.gender && entity.energy > config.reproductionEnergyThreshold * 0.6) {
      const courtRange = atHome ? 120 : 80;
      const closest = findCourtshipPartner(
        entity,
        atHome,
        courtRange,
        humanSocialGrid,
        residenceOccupants,
        allHumans,
        width,
        height,
      );

      if (closest) {
        const dx = closest.x - entity.x;
        const dy = closest.y - entity.y;
        const dist = Math.hypot(dx, dy) || 1;
        const livingTogether = atHome && shareResidence(entity, closest);
        const closeEnough = dist <= 10 || livingTogether;

        if (!closeEnough) {
          const chaseSpeed = atHome ? 0.35 : 0.45;
          entity.vx = (dx / dist) * config.speed * chaseSpeed;
          entity.vy = (dy / dist) * config.speed * chaseSpeed;
          entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
          suppressIdle = true;
        } else {
          entity.vx *= 0.6;
          entity.vy *= 0.6;
          suppressIdle = true;
          entity.courtshipPartnerId = closest.id;
          closest.courtshipPartnerId = entity.id;

          if (seededRandomForRun(`chat-court1:${entity.id}:${state.tick}`) < 0.4 * PER_TICK_RATE_SCALE) {
            settlerPairChat(entity, closest, 'courtship', 0.85);
          } else if (seededRandomForRun(`chat-court2:${entity.id}:${state.tick}`) < 0.5 * PER_TICK_RATE_SCALE) {
            settlerPairChat(entity, closest, 'courtship', 0.1);
          }

          if (entity.id < closest.id) {
            const hasPerformers = state.visitorGroups.some((g) => g.kind === 'performers' && g.daysLeft > 0);
            const courtRate =
              (4 + churchStrength * 2) *
              (state.festival?.active ? 2 : 1) *
              (hasPerformers ? 1.35 : 1) *
              (livingTogether ? 1.5 : 1) *
              traitMultiplier(entity, 'gregarious', 1.4) *
              traitMultiplier(entity, 'timid', 0.7) *
              traitMultiplier(entity, 'graceful', 1.2) *
              PER_TICK_RATE_SCALE;

            entity.courtshipProgress = Math.min(100, (entity.courtshipProgress || 0) + courtRate);
            closest.courtshipProgress = Math.min(100, (closest.courtshipProgress || 0) + courtRate);
          }

          if (getSimRng('humanTick')() < 0.08 * PER_TICK_RATE_SCALE) {
            state.deathParticles.push({
              x: entity.x + (getSimRng('humanTick')() - 0.5) * 15,
              y: entity.y - 8,
              vx: (getSimRng('humanTick')() - 0.5) * 0.3,
              vy: -0.8 - getSimRng('humanTick')() * 0.5,
              life: 25,
              maxLife: 25,
              color: '#ff69b4',
              size: 2 + getSimRng('humanTick')() * 1.5,
              type: 'heart',
            });
          }

          tryCompleteCourtshipMarriage(
            state,
            entity,
            closest,
            updatedBuildings.filter(isResidenceBuilding),
            playerHumans,
          );
        }
      }
    }

    // Married couples proximity
    if (
      socialTime &&
      isPlayerHuman(entity) &&
      entity.gender === 'female' &&
      entity.relationshipStatus === 'married' &&
      !entity.pregnant &&
      entity.partnerId &&
      entity.reproductionCooldown <= 0
    ) {
      const partner = livingHumanAt(entity.partnerId);
      if (partner?.alive) {
        const dx = partner.x - entity.x;
        const dy = partner.y - entity.y;
        const dist = Math.hypot(dx, dy) || 1;
        const together = dist < 22 || (atHome && shareResidence(entity, partner));
        if (!together && dist > 15) {
          entity.vx = (dx / dist) * config.speed * 0.3;
          entity.vy = (dy / dist) * config.speed * 0.3;
          entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
          suppressIdle = true;
        }
      }
    }

    // Secret affairs
    if (
      canPursueSecretAffair(entity, hourOfDay, workplace, updatedBuildings, entityById, state.tick) &&
      isPlayerHuman(entity) &&
      !entity.isJuvenile &&
      !entity.pregnant &&
      entity.gender &&
      entity.age >= HUMAN_ADULT_MIN_AGE &&
      entity.age < HUMAN_MAX_LIFESPAN_YEARS &&
      entity.energy > config.reproductionEnergyThreshold * 0.5 &&
      entity.relationshipStatus === 'married' &&
      !isAtMaritalHome(entity, entityById, buildingById)
    ) {
      const affairRange = 75;
      const paramour = findClosestAdaptiveInRadius(
        humanSocialGrid,
        playerHumans,
        entity.x,
        entity.y,
        affairRange,
        (h) => isValidAffairTarget(entity, h, state.tick) && !isSpouseNearby(h, entityById, AFFAIR_SPOUSE_BLOCK_RADIUS),
        socialAdaptiveOptions('social', playerHumans.length, width, height),
      );

      if (paramour) {
        const trystTarget = getAffairTrystTarget(entity, paramour, buildingById);
        const dx = trystTarget.x - entity.x;
        const dy = trystTarget.y - entity.y;
        const dist = Math.hypot(dx, dy) || 1;
        const intimate = isValidAffairTrystSite(entity, paramour, entityById, buildingById, AFFAIR_INTIMATE_RADIUS);

        if (!intimate) {
          entity.vx = (dx / dist) * config.speed * 0.38;
          entity.vy = (dy / dist) * config.speed * 0.38;
          entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
          suppressIdle = true;
        } else {
          entity.vx *= 0.55;
          entity.vy *= 0.55;
          suppressIdle = true;

          if (shouldLeadAffairPair(entity, paramour)) {
            settlerPairChat(entity, paramour, 'affair', 0.18);

            const churchPenalty = churchStrength > 0 ? 0.72 + (1 - churchStrength) * 0.28 : 1;
            const affairRate = (churchStrength > 0 ? 5 : 8) * (state.festival?.active ? 1.4 : 1) * churchPenalty * PER_TICK_RATE_SCALE;
            entity.affairProgress = Math.min(100, (entity.affairProgress || 0) + affairRate);
            paramour.affairProgress = Math.min(100, (paramour.affairProgress || 0) + affairRate);

            if (getSimRng('humanTick')() < 0.06 * PER_TICK_RATE_SCALE) {
              state.deathParticles.push({
                x: entity.x + (getSimRng('humanTick')() - 0.5) * 10,
                y: entity.y - 6,
                vx: (getSimRng('humanTick')() - 0.5) * 0.2,
                vy: -0.5,
                life: 18,
                maxLife: 18,
                color: '#f472b6',
                size: 2,
                type: 'heart',
              });
            }
          }

          if (
            (entity.affairProgress ?? 0) >= 45 &&
            (paramour.affairProgress ?? 0) >= 45 &&
            hasAffairPartner(entity, entityById) &&
            entity.affairPartnerId === paramour.id
          ) {
            tryExposeCaughtAffairForPair(
              state,
              entity,
              paramour,
              entityById,
              buildingById,
              updatedBuildings,
              playerHumans,
              churchStrength,
              true,
              true,
              hourOfDay,
            );
          }
        }
      }
    }

    // Established affair movement
    if (
      canPursueSecretAffair(entity, hourOfDay, workplace, updatedBuildings, entityById, state.tick) &&
      isPlayerHuman(entity) &&
      !entity.isJuvenile &&
      !entity.pregnant &&
      hasAffairPartner(entity, entityById) &&
      !isAtMaritalHome(entity, entityById, buildingById)
    ) {
      const lover = livingHumanAt(entity.affairPartnerId);
      if (lover?.alive) {
        const trystTarget = getAffairTrystTarget(entity, lover, buildingById);
        const dx = trystTarget.x - entity.x;
        const dy = trystTarget.y - entity.y;
        const dist = Math.hypot(dx, dy) || 1;
        const tryst = isValidAffairTrystSite(entity, lover, entityById, buildingById, AFFAIR_INTIMATE_RADIUS);
        if (!tryst && dist > 14) {
          entity.vx = (dx / dist) * config.speed * 0.32;
          entity.vy = (dy / dist) * config.speed * 0.32;
          entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
          suppressIdle = true;
        } else if (tryst) {
          tryExposeCaughtAffairForPair(
            state,
            entity,
            lover,
            entityById,
            buildingById,
            updatedBuildings,
            playerHumans,
            churchStrength,
            true,
            true,
            hourOfDay,
          );
        }
      }
    }

    // Midday coworker banter
    if (onDayJobShift && workplace && isPlayerHuman(entity) && !entity.isJuvenile && entity.job !== JobType.Innkeeper) {
      const shiftMates = (workersByWorkplace.get(entity.homeBuildingId ?? -1) ?? []).filter((h) => h.id !== entity.id);
      tryWorkplaceBanter(entity, shiftMates, state.tick, hourOfDay, true);
    }

    tickHumanDoctorHospitalService({
      state,
      entity,
      allHumans,
      updatedBuildings,
      onDayJobShift,
    });
    tickHumanCivicVenueService({
      state,
      entity,
      allHumans,
      updatedBuildings,
      buildingById,
      onDayJobShift,
      onHotelShift,
    });
    tickHumanHospitalPatientCare({
      state,
      entity,
      staffedHospitals,
      onJobShift,
      speed: config.speed,
    });
    // Civic petitions are resolved once per colony day by the town-hall owner
    // (`tickTownHallAudiences`), so the realtime path only walks settlers to the hall
    // (leisure motive 5) — see BUG_REPORTS/2026-09-13-civic-petitions-re-award-every-tick-per-day-rolls-are-used.md.

    // Morning greetings
    if (allowFreeRoam && isPlayerHuman(entity) && !entity.isJuvenile && hourOfDay >= 6 && hourOfDay <= 9) {
      if ((state.tick + entity.id) % SOCIAL_STAGGER === 0) {
        const passer = findClosestAdaptiveInRadius(
          humanSocialGrid,
          allHumans,
          entity.x,
          entity.y,
          SOCIAL_GREETING_RADIUS,
          (h) => h.id !== entity.id && h.alive && isPlayerHuman(h) && !h.isJuvenile,
          socialAdaptiveOptions('social', allHumans.length, width, height),
        );
        tryNeighborGreeting(entity, passer, state.tick, hourOfDay);
      }
    }

    // Free time & leisure
    if (
      tickHumanChildLeisure({
        state,
        entity,
        speed: config.speed,
        hourOfDay,
        onSchedule,
        allHumans,
        updatedBuildings,
        buildingById,
        livingHumanAt,
        suppressIdleInitial: suppressIdle,
      })
    ) {
      suppressIdle = true;
    } else if (allowFreeRoam && !suppressIdle && isPlayerHuman(entity) && !entity.isJuvenile) {
      const tick = state.tick;
      const absDay = getAbsoluteCalendarDay(tick);
      const leisureSlotPeriod = 80 * TICKS_PER_HOUR;
      const leisureSlot = Math.floor(tick / leisureSlotPeriod + entity.id * 3);
      const daySpice = Math.floor(personDayRoll(entity.id, tick, 401 + leisureSlot) * 12);
      const quietBias = personDayRoll(entity.id, tick, 202) < 0.35;
      let leisureKind = (leisureSlot * 17 + entity.id * 31 + absDay * 13 + daySpice) % 12;
      if (quietBias && personDayRoll(entity.id, tick, 403 + leisureSlot) < 0.45) {
        leisureKind = leisureKind < 6 ? 10 + (leisureKind % 2) : leisureKind;
      }
      if (weekend && personDayRoll(entity.id, tick, 201) > 0.55 && leisureKind >= 8) {
        leisureKind = (entity.id + leisureSlot + absDay) % 7;
      }
      const phase = entity.id * 0x9e3779b9 + leisureSlot * 0x85ebca6b + absDay;
      let idleVx = 0;
      let idleVy = 0;

      const steerTo = (tx: number, ty: number, speedMult: number, arrive = 14): boolean => {
        const dx = tx - entity.x;
        const dy = ty - entity.y;
        const dist = Math.hypot(dx, dy) || 1;
        if (dist <= arrive) {
          idleVx = Math.sin(tick * 0.04 + entity.id) * config.speed * 0.08;
          idleVy = Math.cos(tick * 0.035 + entity.id) * config.speed * 0.08;
          return true;
        }
        idleVx = (dx / dist) * config.speed * speedMult;
        idleVy = (dy / dist) * config.speed * speedMult;
        return false;
      };

      const pickCompleted = (types: BuildingType[]): Building | undefined => {
        const pool = updatedBuildings.filter((b) => b.completed && b.faction !== 'rival' && types.includes(b.type));
        if (pool.length === 0) return undefined;
        return pool[(entity.id + leisureSlot) % pool.length];
      };

      const adultLeisure = tickAdultLeisureMotive({
        state,
        entity,
        speed: config.speed,
        allHumans,
        updatedBuildings,
        buildingById,
        humanSocialGrid,
        width,
        height,
        livingHumanAt,
        settlerChat,
        settlerPairChat,
        suppressIdleInitial: suppressIdle,
      });
      suppressIdle = adultLeisure.suppressIdle;
      const spouseEarly = adultLeisure.spouseEarly;

      if (!suppressIdle) {
        const spouse = spouseEarly ?? (entity.partnerId != null ? livingHumanAt(entity.partnerId) : undefined);
        const kids = (entity.childrenIds ?? [])
          .map((id) => livingHumanAt(id))
          .filter((k): k is Entity => !!k?.alive && !!k.isJuvenile);
        const coworkers =
          entity.homeBuildingId != null
            ? (workersByWorkplace.get(entity.homeBuildingId) ?? []).filter((h) => h.id !== entity.id)
            : [];

        const sneaking =
          hasAffairPartner(entity, entityById) &&
          canPursueSecretAffair(entity, hourOfDay, workplace, updatedBuildings, entityById, state.tick) &&
          !isAtMaritalHome(entity, entityById, buildingById);

        const bondRoll = personDayRoll(entity.id, tick, 510 + leisureSlot);
        let company: Entity | null = null;
        let companyKind: 'partner' | 'kid' | 'coworker' | null = null;
        if (!sneaking) {
          if (spouse?.alive && bondRoll < 0.4) {
            company = spouse;
            companyKind = 'partner';
          } else if (kids.length > 0 && bondRoll < 0.62) {
            company = kids[(entity.id + leisureSlot) % kids.length]!;
            companyKind = 'kid';
          } else if (coworkers.length > 0 && bondRoll < 0.82) {
            company = coworkers[(leisureSlot + entity.id) % coworkers.length]!;
            companyKind = 'coworker';
          }
        }

        const hangWithCompany = company != null && personDayRoll(entity.id, tick, 520 + leisureSlot) < 0.78;
        if (hangWithCompany && company) {
          const sdx = company.x - entity.x;
          const sdy = company.y - entity.y;
          const sdist = Math.hypot(sdx, sdy) || 1;
          const arrive = companyKind === 'kid' ? 14 : 18;
          if (sdist > arrive) {
            idleVx = (sdx / sdist) * config.speed * 0.48;
            idleVy = (sdy / sdist) * config.speed * 0.48;
          } else if (sdist < 8) {
            idleVx = -(sdx / sdist) * config.speed * 0.1;
            idleVy = -(sdy / sdist) * config.speed * 0.1;
          } else {
            if (state.beautyGrid != null && getSimRng('humanTick')() < 0.35) {
              const pretty = pickBeautySpot(
                state.beautyGrid,
                (entity.x + company.x) / 2,
                (entity.y + company.y) / 2,
                5,
              );
              steerTo(pretty.x, pretty.y, 0.42, 14);
              if (beautyAt(state.beautyGrid, entity.x, entity.y) >= 3 && getSimRng('humanTick')() < 0.04 * PER_TICK_RATE_SCALE) {
                entity.energy = Math.min(entity.maxEnergy, entity.energy + 0.4 * PER_TICK_RATE_SCALE);
                addFloatingText(state, entity.x, entity.y - 26, '💐', '#f9a8d4', 'brief');
              }
            } else {
              const steerToShop = (): void => {
                const shop = pickCompleted([BuildingType.Market, BuildingType.Store]);
                if (shop) steerTo(shop.x + shop.width / 2, shop.y + shop.height * 0.92, 0.42, 20);
                else idleVx = Math.sin(tick * 0.03 + entity.id) * config.speed * 0.1;
              };

              const shared = (Math.min(entity.id, company.id) * 31 + leisureSlot * 17 + absDay) % 6;
              if (shared <= 1) {
                const tavern = pickCompleted([BuildingType.Tavern]);
                if (tavern) {
                  steerTo(tavern.x + tavern.width / 2, tavern.y + tavern.height * 0.92, 0.45, 20);
                } else {
                  steerToShop();
                }
              } else if (shared === 2) {
                steerToShop();
              } else if (shared === 3) {
                const well = pickCompleted([BuildingType.Well]);
                if (well) steerTo(well.x + well.width / 2, well.y + well.height / 2, 0.4, 16);
              } else if (shared === 4) {
                const hall = pickCompleted([BuildingType.TownHall]);
                if (hall) {
                  steerTo(hall.x + hall.width / 2, hall.y + hall.height + 8, 0.42, 22);
                }
              } else {
                idleVx = Math.sin(tick * 0.025 + entity.id) * config.speed * 0.12;
                idleVy = Math.cos(tick * 0.02 + company.id) * config.speed * 0.12;
              }
            }

            if (companyKind === 'partner') {
              settlerPairChat(entity, company, 'home', 0.08);
            } else if (companyKind === 'kid') {
              settlerChat(entity, 'child', 0.06, company);
            } else if (companyKind === 'coworker') {
              settlerPairChat(entity, company, 'social', 0.07);
            }
          }

          entity.vx = entity.vx * 0.45 + idleVx * 0.55;
          entity.vy = entity.vy * 0.45 + idleVy * 0.55;
          if (idleVx !== 0 || idleVy !== 0) {
            entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
          }
          suppressIdle = true;
        } else if (leisureKind <= 2) {
          const tavern = pickCompleted([BuildingType.Tavern]);
          if (tavern) {
            const arrived = steerTo(
              tavern.x + tavern.width / 2 + ((entity.id % 5) - 2) * 6,
              tavern.y + tavern.height * 0.92,
              0.5,
              18,
            );
            if (arrived) {
              entity.energy = Math.min(entity.maxEnergy, entity.energy + 0.45 * PER_TICK_RATE_SCALE);
              settlerChat(entity, 'social', 0.14 * PER_TICK_RATE_SCALE);
              if (getSimRng('humanTick')() < 0.04 * PER_TICK_RATE_SCALE) {
                addFloatingText(state, entity.x, entity.y - 14, '🍺', '#fbbf24');
              }
            }
          } else {
            const shop = pickCompleted([BuildingType.Market, BuildingType.Store]);
            if (shop) {
              steerTo(shop.x + shop.width / 2, shop.y + shop.height * 0.92, 0.48, 16);
            } else {
              steerTo(width * 0.5, height * 0.55, 0.4);
            }
          }
        } else if (leisureKind === 3) {
          const well = pickCompleted([BuildingType.Well]);
          if (well) {
            const arrived = steerTo(well.x + well.width / 2, well.y + well.height / 2, 0.45, 12);
            if (arrived) {
              entity.energy = Math.min(entity.maxEnergy, entity.energy + 0.35 * PER_TICK_RATE_SCALE);
            }
          } else {
            steerTo(
              fract(phase * 0.41) * width * 0.5 + width * 0.25,
              fract(phase * 0.73) * height * 0.5 + height * 0.25,
              0.4,
            );
          }
        } else if (leisureKind === 4) {
          const church = pickCompleted([BuildingType.Church]);
          if (church) {
            steerTo(church.x + church.width / 2, church.y + church.height * 0.95, 0.42, 18);
          } else {
            steerTo(width * 0.45, height * 0.45, 0.38);
          }
        } else if (leisureKind === 5) {
          const hall = pickCompleted([BuildingType.TownHall]);
          if (hall) {
            steerTo(hall.x + hall.width / 2 + ((entity.id % 5) - 2) * 8, hall.y + hall.height + 6, 0.44, 20);
          } else {
            steerTo(width * 0.5, height * 0.5, 0.4);
          }
        } else if (leisureKind === 6) {
          let friend: Entity | null = spouse?.alive ? spouse : null;
          if (!friend && coworkers.length > 0 && personDayRoll(entity.id, tick, 530) < 0.55) {
            friend = coworkers[(entity.id + leisureSlot) % coworkers.length]!;
          }
          if (!friend && (state.tick + entity.id) % SOCIAL_STAGGER === 0) {
            friend =
              findClosestAdaptiveInRadius(
                humanSocialGrid,
                allHumans,
                entity.x,
                entity.y,
                SOCIAL_FRIENDSHIP_RADIUS,
                (h) => h.id !== entity.id && h.alive && isPlayerHuman(h) && !h.isJuvenile && h.id !== entity.affairPartnerId,
                socialAdaptiveOptions('social', allHumans.length, width, height),
              ) ?? null;
          }
          if (friend) {
            const sdx = friend.x - entity.x;
            const sdy = friend.y - entity.y;
            const sdist = Math.hypot(sdx, sdy) || 1;
            if (sdist > 22) {
              idleVx = (sdx / sdist) * config.speed * 0.42;
              idleVy = (sdy / sdist) * config.speed * 0.42;
            } else if (sdist < 9) {
              idleVx = -(sdx / sdist) * config.speed * 0.12;
              idleVy = -(sdy / sdist) * config.speed * 0.12;
              if (friend.id === entity.partnerId) settlerPairChat(entity, friend, 'home', 0.1);
              else settlerPairChat(entity, friend, 'social', 0.08);
            } else {
              idleVx = Math.sin(tick * 0.03 + entity.id) * config.speed * 0.1;
              idleVy = Math.cos(tick * 0.025 + entity.id) * config.speed * 0.1;
            }
          } else {
            steerTo(width * 0.5 + ((entity.id % 5) - 2) * 40, height * 0.5 + ((entity.id % 7) - 3) * 30, 0.4);
          }
        } else if (leisureKind === 7) {
          let gx = width * 0.5;
          let gy = height * 0.5;
          if (state.festival?.active) {
            const hall = pickCompleted([BuildingType.TownHall]);
            if (hall) {
              gx = hall.x + hall.width / 2;
              gy = hall.y + hall.height + 20;
            }
          }
          const performers = state.visitorGroups.find((g) => g.kind === 'performers' && g.daysLeft > 0);
          if (performers) {
            gx = performers.campX;
            gy = performers.campY;
          }
          steerTo(gx + ((entity.id % 6) - 2.5) * 12, gy + ((entity.id % 5) - 2) * 10, 0.5, 22);
        } else if (leisureKind === 8) {
          const tree = findClosestEntityInRadius(
            ctx.treeGrid,
            entity.x,
            entity.y,
            120,
            (t) => t.type === EntityType.Tree && t.alive,
            'social',
            byType[EntityType.Tree],
          );
          if (tree) {
            steerTo(tree.x, tree.y + 8, 0.38, 16);
          } else {
            steerTo(fract(phase * 0.27) * width * 0.55 + width * 0.2, fract(phase * 0.53) * height * 0.55 + height * 0.2, 0.35);
          }
        } else if (leisureKind === 9) {
          const edge = (entity.id + leisureSlot) % 4;
          const tx = edge === 0 ? width * 0.12 : edge === 1 ? width * 0.88 : width * (0.3 + fract(phase) * 0.4);
          const ty = edge === 2 ? height * 0.12 : edge === 3 ? height * 0.88 : height * (0.3 + fract(phase * 1.3) * 0.4);
          steerTo(tx, ty, 0.4, 20);
        } else if (leisureKind === 10) {
          const a = fract(phase * 0.6180339887);
          const b = fract(phase * 0.3819660113);
          const targetX = a * width * 0.7 + width * 0.15;
          const targetY = b * height * 0.7 + height * 0.15;
          steerTo(targetX, targetY, 0.46, 18);
        } else {
          if (hasResidenceAssignment(entity)) {
            const home = buildingById.get(entity.residenceBuildingId!);
            if (home?.completed) {
              steerTo(home.x + home.width / 2 + ((entity.id % 5) - 2) * 6, home.y + home.height * 0.95, 0.4, 12);
            }
          } else {
            steerTo(width * 0.5, height * 0.5, 0.38);
          }
        }

        if (idleVx !== 0 || idleVy !== 0) {
          entity.vx = entity.vx * 0.5 + idleVx * 0.5;
          entity.vy = entity.vy * 0.5 + idleVy * 0.5;
          entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
          suppressIdle = true;
        }
      }
    }

    if (!suppressIdle) {
      entity.vx *= 0.9;
      entity.vy *= 0.9;
      if (Math.hypot(entity.vx, entity.vy) < 0.08) {
        entity.vx = 0;
        entity.vy = 0;
      }
    }

    const nearRoad = queryIsNearRoad(
      roadAvoidance,
      entity.x,
      entity.y,
      roadBuildings,
      (x, y, road) => isEntityOnBuilding(x, y, road, 12),
    );
    const roadMult = nearRoad ? 1.5 : 1.0;

    entity.x += entity.vx * roadMult;
    entity.y += entity.vy * roadMult;

    clampToMapBounds(entity, width, height);

    advanceHumanWalkAnim(entity);

    if (entity.energy <= 0) {
      killFromExhaustion(entity, state, updatedBuildings, entityById);
    }
    syncEntityGrids(ctx, entity);
  }

  if (isNewCalendarDay) {
    const activeHumans = state.entities.filter((e) => e.alive && isPlayerHuman(e));
    const activePregnancies = activeHumans.filter((e) => e.pregnant).length;
    const activeMarriages = activeHumans.filter(
      (e) => e.relationshipStatus === 'married' && e.partnerId != null && e.id < e.partnerId,
    ).length;
    const activeCourtships = activeHumans.filter(
      (e) => e.courtshipPartnerId != null && e.id < e.courtshipPartnerId,
    ).length;
    const activeYouthLovePairs = activeHumans.filter(
      (e) => e.youthLovePartnerId != null && e.id < e.youthLovePartnerId,
    ).length;
    const activeAffairs = activeHumans.filter(
      (e) => e.affairPartnerId != null && e.id < e.affairPartnerId,
    ).length;

    flushRelationshipDiagnostics(state.tick, getAbsoluteCalendarDay(state.tick), activePregnancies, {
      activeMarriages,
      activeCourtships,
      activeYouthLovePairs,
      activeAffairs,
    });
  }
}