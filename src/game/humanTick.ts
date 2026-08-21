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
import { OFFSCREEN_HUMAN_THROTTLE, isInFocus } from './simFocus';
import {
  addFloatingText,
  addNotification,
  createDeathParticles,
  impulseScreenShake,
} from './simEffects';
import { beautyAt, pickBeautySpot } from './beautyGrid';
import { getChurchStrength, findHumanWorkplace, buildConstructionCrewIndex } from './workforce';
import { addResource } from './economy';

import { isPlayerHuman } from './playerHuman';
import { isSettlerRelationshipEntity } from './moonHowler';
import { getElectionGatherTarget } from './villageLeadership';
import { valleyStageIndex } from './ecologyStage';
import { getWorkSchedule, isOnWorkScheduleShift, isWorkScheduleHour } from './workSchedule';
import {   HUMAN_ADULT_MIN_AGE, HUMAN_MAX_LIFESPAN_YEARS, HUMAN_MOVE_OUT_MIN_AGE, tryGraduateHumanChild, syncHumanAgeFromCalendar, PER_TICK_RATE_SCALE, TICKS_PER_HOUR, PREGNANCY_TICKS, allowSocialLife, hasResidenceAssignment, hasWorkAssignment, isOnWorkShift, isOnMoonHowlerNightShift, isFestivalGatheringHour, isWeekend, prefersHomeTonight, personDayRoll, getAbsoluteCalendarDay, isNearResidence, isResidenceBuilding, killHuman, getChildCustodian, shareResidence, shouldBeAtHome, syncPartnerResidence, isNewCalendarDayTick, EVENING_START, isStartOfClockHour } from './dayCycle';
import {
  chatHintsFromWorld,
  sayHumanChatPhrase,
  tickHumanChat,
  tryAmbientRandomDialogue,
  type HumanChatContext,
} from './humanChat';
import { advanceHumanWalkAnim } from './humanSprites';
import { formatCitizenName, formatDeathLog } from './citizenId';
import { syncMarriageSurnames } from './nameLoader';
import { isRenffrGossipActive } from './renffrStar';
import { getHumanHuntRange, getHumanFleeSpeedMultiplier } from './combat';
import { isActiveMoonHowler } from './moonHowler';
import { isEntityOnBuilding } from './buildingRotation';
import { logEvent } from './eventLog';

import {
  applyEducationGraduation,
  creditChildSchoolDay,
  findSchoolForChild,
  getSchoolAgeMultiplier,
  recordChildSchoolTick,
} from './education';
import { getPlayerCampCenter, isRaidMarchingForRival } from './frontierCombat';
import { getCaravanMoveTarget, tryAdvanceCaravanLeg } from './tradeCaravans';
import { tickFactionCampWander } from './factionWander';
import {
  pickSocialImpulse,
  tryNeighborGreeting,
  tryWorkplaceBanter,
} from './socialLife';
import { doctorTreatNearby, isDoctorAtHospital, needsMedicalCare, pickHospitalWalkTarget, treatPatientAtHospital } from './hospitalCare';
import {
  isOfficialAtHall,
  officialHandlePetitioners,
  resolveCivicPetition,
  wantsCivicAudience,
} from './townHall';
import {
  hotelierGreetGuests,
  isHotelierAtHotel,
  steerVisitorToHotel,
} from './hotelStay';
import { setCurrentPathMap } from './pathfinding';
import {
  COMMUTE_SNAP_DISTANCE, commuteDistanceToBuilding, commuteHumanToBuilding, nearestActiveMoonHowler, snapHumanToBuilding,
} from './simulation/humanMovement';
import { fract, freeHuntFoodGain, humanEnergyLoss, isMealWindow } from './simulation/humanNeeds';
import { simAmbientChatNeighbors, simSettlerChat, simSettlerPairChat } from './simulation/humanSocial';
import { tickPregnancyAndBirth } from './simulation/humanLifecycle';
import { tryTickBlueberryForaging } from './blueberryForaging';
import { recordFoodConsumed } from './economyLedger';
import type { EntitySpatialGrid } from './spatialGrid';
import { buildRoadAvoidanceIndex } from './spatialGrid';
import { buildResidenceOccupantIndex, findClosestEntityInRadius, findClosestInEntityGrid, queryIsNearRoad, getLivingEntity } from './simQueries';


import { addHuntVisual } from './huntvisuals';
import { traitMultiplier } from './settlerTraits';
import type { TickContext } from './simulation/simulationTypes';
import { isValidHuntPrey } from './simulation/simulationEntities';
import { forEachAdaptiveInRadius, findClosestAdaptiveInRadius, socialAdaptiveOptions, SOCIAL_STAGGER, SOCIAL_GREETING_RADIUS, SOCIAL_FRIENDSHIP_RADIUS, SOCIAL_COURTSHIP_RADIUS, SOCIAL_AFFAIR_RADIUS } from './adaptiveSpatialQuery';
import { AFFAIR_BUILDING_NEAR_RADIUS, AFFAIR_DAILY_TRYST_RADIUS, AFFAIR_SPOUSE_BLOCK_RADIUS, findCourtshipPartner, getAffairTrystBuilding, getBuildingCenter, hasAffairPartner, isAtMaritalHome, isEligibleToCourt, isNearBuilding, isSpouseNearby, isValidAffairTarget, isValidAffairTrystSite, onScandalCooldown, reconcileAffairPartner, recordAffairTrystSite, shouldLeadAffairPair, tryDailyAffairGossip, tryDailyConception, tryDailyHumanMortality, tryExposeCaughtAffairForPair, tryFormSchoolyardBond, trySchoolyardGossip } from './simulation/humanRelationships';
import { humanDisplayName } from './citizenId';
import { flushRelationshipDiagnostics, recordRelationshipDiagnostic, setRelationshipDiagnosticsEnabled } from './relationshipDiagnostics';
import { isVenueServiceHour, isVenueScheduleStartTick } from './venueSchedule';
import { recordScheduleWorkTick } from './scheduleFatigue';

// Temporary controlled-test instrumentation; disable after comparing the July cadence.
setRelationshipDiagnosticsEnabled(true);
import { clearHuntersTargetingPrey, markWildlifeDead, syncEntityGrids } from './simulation/simulationEntities';

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

/** Affairs can run off-duty or during work when spouses are at separate job sites. */
function canPursueSecretAffair(
  entity: Entity,
  hourOfDay: number,
  workplace: Building | undefined,
  buildings: Building[],
  entityById: Map<number, Entity>,
  tick: number,
  workSchedule = getWorkSchedule({ workSchedule: undefined }),
): boolean {
  if (onScandalCooldown(entity, tick)) return false;
  // Tight radius — a whole compact village fits inside 52 units, which blocked all affairs.
  if (isSpouseNearby(entity, entityById, AFFAIR_SPOUSE_BLOCK_RADIUS)) return false;
  if (allowSocialLife(hourOfDay, workplace != null)) return true;
  if (!isWorkScheduleHour(workSchedule, hourOfDay) || entity.partnerId == null) return false;

  const spouse = getLivingEntity(entity.partnerId, entityById);
  if (!spouse) return true;
  if (!hasWorkAssignment(spouse)) return true;

  // Affairs path is rare — linear building scan is fine here.
  const spouseJob = findHumanWorkplace(spouse, buildings);
  if (!spouseJob) return true;
  if (workplace && spouseJob.id !== workplace.id) return true;
  return Math.hypot(spouse.x - entity.x, spouse.y - entity.y) > 58;
}

/** Once-per-day affair drift — runs even when settlers are off-screen (no movement sim). */
export function tryDailyAffairEncounter(
  state: WorldState,
  entity: Entity,
  entityById: Map<number, Entity>,
  buildings: Building[],
  buildingById: Map<number, Building>,
  churchStrength: number,
  hourOfDay: number,
  humanSocialGrid?: EntitySpatialGrid,
  playerHumans?: readonly Entity[],
  width?: number,
  height?: number,
): void {
  const config = SPECIES_CONFIG[EntityType.Human];
  recordRelationshipDiagnostic('affairChecks');
  if (!isPlayerHuman(entity)) return;
  if (entity.prisonBuildingId != null) return;
  if (entity.relationshipStatus !== 'married' || entity.pregnant || entity.isJuvenile) return;
  if (!entity.gender || entity.age < HUMAN_ADULT_MIN_AGE || entity.age >= HUMAN_MAX_LIFESPAN_YEARS) return;
  if (entity.energy <= config.reproductionEnergyThreshold * 0.5) return;
  if (onScandalCooldown(entity, state.tick)) return;
  const workplace = findHumanWorkplace(entity, buildings, { buildingById });
  if (!canPursueSecretAffair(entity, hourOfDay, workplace, buildings, entityById, state.tick, getWorkSchedule(state))) return;

  if (isAtMaritalHome(entity, entityById, buildingById)) return;

  if (entity.affairPartnerId != null) {
    const established = getLivingEntity(entity.affairPartnerId, entityById);
    if (
      established
      && established.affairPartnerId === entity.id
      && shouldLeadAffairPair(entity, established)
      && isValidAffairTrystSite(entity, established, entityById, buildingById, AFFAIR_DAILY_TRYST_RADIUS)
    ) {
      recordAffairTrystSite(entity, established, state, buildingById);
    }
  }

  let paramour: Entity | undefined;
  let bestDistSq = 120 * 120;
  const considerParamour = (candidate: Entity, distSq: number) => {
    if (!isValidAffairTarget(entity, candidate, state.tick)) return;
    if (distSq >= bestDistSq) return;
    if (isSpouseNearby(candidate, entityById, AFFAIR_SPOUSE_BLOCK_RADIUS)) return;
    bestDistSq = distSq;
    paramour = candidate;
  };
  forEachAdaptiveInRadius(
    humanSocialGrid,
    playerHumans ?? [],
    entity.x,
    entity.y,
    SOCIAL_AFFAIR_RADIUS,
    (human, distSq) => {
      if (human.type !== EntityType.Human || !isPlayerHuman(human)) return;
      considerParamour(human, distSq);
    },
    socialAdaptiveOptions('social', playerHumans?.length ?? 0, width ?? 0, height ?? 0),
  );
  if (!paramour) return;
  if (!isValidAffairTrystSite(entity, paramour, entityById, buildingById, AFFAIR_DAILY_TRYST_RADIUS)) return;
  if (!shouldLeadAffairPair(entity, paramour)) return;

  const churchPenalty = churchStrength > 0 ? 0.72 + (1 - churchStrength) * 0.28 : 1;
  const hasPerformers = state.visitorGroups.some((g) => g.kind === 'performers' && g.daysLeft > 0);
  const festivalMult = state.festival?.active ? 1.4 : 1;
  const performerMult = hasPerformers ? 1.35 : 1;
  const trystBuilding = getAffairTrystBuilding(entity, paramour, buildingById);
  const atParamourHome = trystBuilding != null
    && isNearBuilding(entity, trystBuilding, AFFAIR_BUILDING_NEAR_RADIUS)
    && isNearBuilding(paramour, trystBuilding, AFFAIR_BUILDING_NEAR_RADIUS);
  const cohabitMult = atParamourHome ? 1.55 : 1;
  const socialMult = festivalMult * performerMult * cohabitMult;
  const dailyChance = (churchStrength > 0 ? 0.14 : 0.2) * churchPenalty * socialMult;
  if (Math.random() >= dailyChance) return;

  const bump = Math.round((16 + Math.floor(Math.random() * 12)) * socialMult);
  entity.affairProgress = Math.min(100, (entity.affairProgress || 0) + bump);
  paramour.affairProgress = Math.min(100, (paramour.affairProgress || 0) + bump);
  recordRelationshipDiagnostic('affairProgressGains');
  recordAffairTrystSite(entity, paramour, state, buildingById);

  if ((entity.affairProgress ?? 0) >= 100 && (paramour.affairProgress ?? 0) >= 100) {
    entity.affairPartnerId = paramour.id;
    paramour.affairPartnerId = entity.id;
    entity.affairProgress = 100;
    paramour.affairProgress = 100;
    recordRelationshipDiagnostic('affairsEstablished');
  }
}

export function tickHumans(state: WorldState, ctx: TickContext): void {
  const {
    width, height, hourOfDay, season, canHeat,
    byType, newEntities, updatedBuildings, roadBuildings, playerHumans, focus,
    entityById, buildingById, mobileGrid, humanSocialGrid,
  } = ctx;

  // Current terrain for pathfinding (routing around water/mountains).
  setCurrentPathMap(state.worldMap);

  const config = SPECIES_CONFIG[EntityType.Human];
  const isWinter = season === Season.Winter;

  // Moon-Howler fear scan only matters while a cursed werewolf is active —
  // otherwise skip the per-human radius query entirely (saves ~1 query +
  // 25 cells per human on every non-howler tick).
  const anyActiveHowler = (byType[EntityType.Werewolf] ?? []).some(isActiveMoonHowler);

  // Clock buckets (not per-person yet — refined per human below).
  const workSchedule = getWorkSchedule(state);
  const goWorkTime = isOnWorkScheduleShift(state, hourOfDay);
  const weekend = isWeekend(state.tick);
  const isNewCalendarDay = isNewCalendarDayTick(state);
  const humanFleeMult = getHumanFleeSpeedMultiplier(state);
  const isTick8 = hourOfDay === 8 && isStartOfClockHour(state.tick);
  // One pass: construction crew lookup O(1) per human instead of O(buildings) each.
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
  // One workplace index per tick — shift-mates / coworker lookups below stay O(1)
  // instead of an O(H) filter per human (O(H²) per tick at 200+ pop).
  const workersByWorkplace = new Map<number, Entity[]>();
  for (const h of allHumans) {
    if (!h.alive || !isPlayerHuman(h) || h.isJuvenile) continue;
    const siteId = h.homeBuildingId;
    if (siteId == null) continue;
    const bucket = workersByWorkplace.get(siteId);
    if (bucket) bucket.push(h);
    else workersByWorkplace.set(siteId, [h]);
  }
  // Nurturing settlers boost every child's maturation this tick.
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
  // Staffed civic sites once per tick — avoid O(buildings) find per human for hospital/hall.
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
  // Thin adapters over simulation/humanSocial (logic moved there, behavior unchanged).
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

  /** Nearby humans for random pair banter — prefer partner, kids, coworkers. */
  const ambientChatNeighbors = (self: Entity): Entity[] =>
    simAmbientChatNeighbors(self, state.tick, humanSocialGrid, allHumans, width, height);

  // School enrollment is capped per school (SCHOOL_MAX_CHILDREN) — reserve seats
  // as children pick schools this pass so the first 10 get in.
  const schoolReserved = new Map<number, number>();

  for (const entity of allHumans) {
    if (!entity.alive) continue;
    reconcileAffairPartner(entity, entityById);

    // Common updates
    if (isNewCalendarDay) {
      if (entity.isJuvenile && isPlayerHuman(entity)) {
        creditChildSchoolDay(entity);
      }
      const schoolMult = entity.isJuvenile && isPlayerHuman(entity)
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
    const atHome = shouldBeAtHome(hourOfDay) && isNearResidence(entity, buildingById);

    entity.reproductionCooldown = Math.max(0, entity.reproductionCooldown - 1);
    if (entity.gender && entity.relationshipStatus === undefined) {
      entity.relationshipStatus = 'single';
      entity.attraction = 50 + Math.random() * 50;
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
    }

    tryGraduateHumanChild(entity, config.size, config.speed, (e) => {
      if (isPlayerHuman(e)) applyEducationGraduation(state, e);
    });
    const schoolTarget = entity.isJuvenile && isPlayerHuman(entity)
      ? findSchoolForChild(entity, updatedBuildings, schoolReserved)
      : undefined;
    if (schoolTarget) {
      schoolReserved.set(schoolTarget.id, (schoolReserved.get(schoolTarget.id) ?? 0) + 1);
      // Kids let family secrets slip at school — once per day, while enrolled.
      if (isNewCalendarDay) {
        trySchoolyardGossip(state, entity, entityById, updatedBuildings, playerHumans);
        tryFormSchoolyardBond(state, entity);
      }
    }
    const inFocus = !focus || isInFocus(entity, focus);
    const active = !isPrisoner && (
      inFocus
      || entity.pregnant
      || hasAffairPartner(entity, entityById)
      || (entity.affairProgress ?? 0) >= 20
      || (state.tick + entity.id) % OFFSCREEN_HUMAN_THROTTLE === 0
    );

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

    // Always advance speech/dialogue timers — even off-screen — so bubbles don't
    // freeze until the camera pans back (cheap: only decrements chatTicks).
    tickHumanChat(entity, resolveChatPartner);

    // Ambient random dialogue (any time) — not gated to work/evening/arrival.
    // ~1.2% per clock-hour tick (legacy 24-tick day); scale so longer days stay chatty, not spammy.
    if (
      active
      && isPlayerHuman(entity)
      && !entity.faction
      && (entity.chatTicks ?? 0) <= 0
      // v0.6 perf: stagger the ambient-chat grid scan 3× (flavor-only; the chance
      // below is tripled so the expected dialogue rate stays identical).
      && (state.tick + entity.id) % 3 === 0
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
          night: prefersHomeTonight(entity.id, state.tick, hourOfDay),
        },
      );
    }

    if (!active) {
      let minimalEnergyLoss = hasWell ? config.energyLossPerTick * 0.8 : config.energyLossPerTick;
      if (hasHospital) minimalEnergyLoss *= 0.9;
      if (isWinter && !canHeat) minimalEnergyLoss *= 1.5;
      // Hardy settlers burn energy slower.
      minimalEnergyLoss *= traitMultiplier(entity, 'hardy', 0.85);
      entity.energy -= minimalEnergyLoss;
      // Colony larder meals are player settlers only (visitors/rivals must not drain food)
      if (
        isPlayerHuman(entity)
        && isMealWindow(hourOfDay)
        && isStartOfClockHour(state.tick)
        && state.resources.food >= 1
        && entity.energy < entity.maxEnergy * 0.9
      ) {
        state.resources.food -= 1;
        recordFoodConsumed(state, 'meals', 1);
        entity.energy = Math.min(entity.maxEnergy, entity.energy + 65);
      }
      if (isPlayerHuman(entity) && entity.energy <= 0) {
        killHuman(entity, updatedBuildings, entityById, state.tick);
        createDeathParticles(state, entity.x, entity.y, '#8B0000', 8);
        logEvent(state, 'death', formatDeathLog(entity, 'succumbed to exhaustion'), formatCitizenName(entity));
      }
      syncEntityGrids(ctx, entity);
      continue;
    }

    // Trade-route merchants — walk export leg to partner, return with imports
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

    // Visitors & rival settlers — visitors tour village POIs; rivals camp / raid march
    if (entity.faction === 'visitor' || entity.faction === 'rival') {
      const camp = entity.faction === 'visitor'
        ? state.visitorGroups.find((g) => g.id === entity.groupId)
        : state.rivalSettlements.find((r) => r.id === entity.groupId);
      if (camp) {
        const marching = entity.faction === 'rival' && entity.groupId && isRaidMarchingForRival(state, entity.groupId);
        const playerCenter = marching ? getPlayerCampCenter(state, updatedBuildings) : null;
        const cx = marching && playerCenter ? playerCenter.x : ('campX' in camp ? camp.campX : 0);
        const cy = marching && playerCenter ? playerCenter.y : ('campY' in camp ? camp.campY : 0);
        // Visitors walk purposefully into town; rivals linger slower at camp
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
          entity.faction === 'visitor'
          && steerVisitorToHotel(entity, updatedBuildings, config.speed * speedMult)
        ) {
          // Sleeping at the hotel tonight — skip camp wander
        } else {
          tickFactionCampWander(
            state,
            entity,
            cx,
            cy,
            updatedBuildings,
            config.speed * speedMult,
          );
        }
        const dist = Math.hypot(cx - entity.x, cy - entity.y);
        if (marching && dist < 90) entity.combatTicks = Math.max(entity.combatTicks ?? 0, 8);
        // Visitors chat more when near the village center (looks "busy")
        const village = getPlayerCampCenter(state, updatedBuildings);
        const nearVillage = Math.hypot(entity.x - village.x, entity.y - village.y) < 110;
        const chatChance = (entity.faction === 'visitor'
          ? (nearVillage ? 0.055 : 0.03)
          : 0.025) * PER_TICK_RATE_SCALE;
        settlerChat(entity, entity.faction === 'visitor' ? 'visitor' : 'rival', chatChance);
      }
      syncEntityGrids(ctx, entity);
      continue;
    }

    const energyLoss = humanEnergyLoss(entity, config, {
      hasWell, isWinter, canHeat, hasHospital, tick: state.tick, hourOfDay, buildingById,
    });
    if (isWinter && !canHeat && isTick8) entity.flash = 5;


    
    entity.energy -= energyLoss;

    let ateMeal = false;

    // Meals twice per day (8–10am & 6–8pm) — once per clock hour, 1 food ≈ 65 energy
    if (
      isMealWindow(hourOfDay)
      && isStartOfClockHour(state.tick)
      && state.resources.food >= 1
      && entity.energy < entity.maxEnergy * 0.9
    ) {
      state.resources.food -= 1;
      recordFoodConsumed(state, 'meals', 1);
      entity.energy = Math.min(entity.maxEnergy, entity.energy + 65);
      ateMeal = true;
    }

    let suppressIdle = false;
    let onSchedule = false;
    const workplace = findHumanWorkplace(entity, updatedBuildings, workplaceOpts);
    const isInnkeeper = entity.job === JobType.Innkeeper
      && workplace?.type === BuildingType.Tavern
      && workplace.completed;

    // Innkeepers, schools, churches, and Town Halls retain their existing fixed schedules.
    const festivalGathering = isFestivalGatheringHour(hourOfDay, state.festival?.active)
      && !isInnkeeper;
    const ordinaryWorkplace = workplace != null
      && workplace.type !== BuildingType.Church
      && workplace.type !== BuildingType.TownHall;
    const onSchoolShift = schoolTarget != null && isOnWorkShift(state.tick, hourOfDay);
    const onDayJobShift = !festivalGathering && (
      (goWorkTime && !isInnkeeper && (ordinaryWorkplace
        || (entity.job === JobType.Guard && isBarracksGuard(entity.id, entity.homeBuildingId, updatedBuildings))))
      || onSchoolShift
    );
    const onTavernShift = isInnkeeper && isVenueServiceHour(state, 'tavern', hourOfDay, state.festival?.active === true);
    // Priests work the exorcism shift on full-moon nights — they leave home to hunt the Moon Howler.
    const onMoonPriestShift = entity.job === JobType.Priest
      && workplace?.type === BuildingType.Church
      && workplace.completed
      && isOnMoonHowlerNightShift(state.tick, hourOfDay);
    const isHotelier = entity.job === JobType.Hotelier
      && workplace?.type === BuildingType.Hotel
      && workplace.completed;
    const onHotelShift = isHotelier && isVenueServiceHour(state, 'hotel', hourOfDay);
    const onJobShift = onDayJobShift || onTavernShift || onHotelShift || onMoonPriestShift;
    if (onJobShift && isPlayerHuman(entity)) recordScheduleWorkTick(entity);

    // Per-person daily mood: some evenings out, some nights in; weekends lazy or busy.
    // Innkeepers on duty ignore "stay in" — the pub needs them.
    const stayIn = !festivalGathering && !onTavernShift && !onMoonPriestShift
      && prefersHomeTonight(entity.id, state.tick, hourOfDay);
    // Free roam when not on the job and not choosing a quiet home stretch.
    const allowFreeRoam = festivalGathering || (!onJobShift && !stayIn);
    // Day-job holders aren't "free" during work hours; innkeepers only lock evenings.
    const socialBlockedByJob = isInnkeeper
      ? onTavernShift
      : (ordinaryWorkplace && isWorkScheduleHour(workSchedule, hourOfDay) && goWorkTime);
    const socialTime = (!socialBlockedByJob && allowSocialLife(hourOfDay, false, state.tick))
      || (allowFreeRoam && isPlayerHuman(entity));

    // Flee from dangerous Moon Howlers on full-moon nights
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
    // Priests on the exorcism shift: come out and actively hunt the Moon Howler —
    // or retreat to the Church if a comrade just fell.
    if (onMoonPriestShift) {
      suppressIdle = true;
      onSchedule = true;
      const scared = state.tick < (state.moonHowlerPriestsFleeUntil ?? -1);
      const targetWere = nearestActiveMoonHowler(entity, byType[EntityType.Werewolf]);
      if (targetWere) {
        const hdx = targetWere.x - entity.x;
        const hdy = targetWere.y - entity.y;
        const hdist = Math.hypot(hdx, hdy) || 1;
        const dir = scared ? -1 : 1; // scared → away from the howler
        const mult = scared ? 1.35 : 1.1;
        entity.vx = (hdx / hdist) * config.speed * mult * dir;
        entity.vy = (hdy / hdist) * config.speed * mult * dir;
        entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
      } else if (workplace) {
        // No howler abroad — hold the night shift at the Church.
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
      // Festival creation and expiry belong to the daily layer. The realtime
      // human owner only turns that authoritative state into a visible daily
      // gathering, with danger and Moon-Howler duties retaining higher priority.
      const performers = state.visitorGroups.find((group) => group.kind === 'performers' && group.daysLeft > 0);
      const hall = staffedTownHalls.length > 0
        ? staffedTownHalls[entity.id % staffedTownHalls.length]
        : undefined;
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

    // Long commutes: snap at shift start so workers aren't walking all day
    if (
      !huntingWere
      &&       !inElectionCeremony
      && !festivalGathering
      && workplace
      && isStartOfClockHour(state.tick)
      && (
        // Day jobs + construction at 7am
        (hourOfDay === workSchedule.startHour && !isInnkeeper && (hasWorkAssignment(entity) || !workplace.completed))
        // Venue staff snap to their independently configured service start.
        || (isInnkeeper && isVenueScheduleStartTick(state, 'tavern'))
        || (isHotelier && isVenueScheduleStartTick(state, 'hotel'))
      )
    ) {
      if (commuteDistanceToBuilding(entity, workplace, false) > COMMUTE_SNAP_DISTANCE) {
        snapHumanToBuilding(entity, workplace, false);
      }
    } else if (
      !huntingWere
      &&       !inElectionCeremony
      && !festivalGathering
      && hourOfDay === EVENING_START
      && isStartOfClockHour(state.tick)
      && stayIn
      && hasResidenceAssignment(entity)
    ) {
      // Only snap home if this person is staying in tonight (not going out).
      const eveningHome = buildingById.get(entity.residenceBuildingId!);
      if (
        eveningHome?.completed
        && commuteDistanceToBuilding(entity, eveningHome, true) > COMMUTE_SNAP_DISTANCE
      ) {
        snapHumanToBuilding(entity, eveningHome, true);
      }
    }

    // Home when they choose a quiet stretch (varies by person/day); work still overrides below.
    if (
      !huntingWere
      &&       !inElectionCeremony
      && !festivalGathering
      && !onJobShift
      && stayIn
      && hasResidenceAssignment(entity)
    ) {
      const residence = buildingById.get(entity.residenceBuildingId!);
      if (residence?.completed) {
        commuteHumanToBuilding(entity, residence, config.speed, true, 2.5);
        onSchedule = true;
        suppressIdle = true;
      }
    } else if (
      !huntingWere
      &&       !inElectionCeremony
      && !festivalGathering
      && goWorkTime
      && workplace
      && entity.job === JobType.Guard
      && isBarracksGuard(entity.id, entity.homeBuildingId, updatedBuildings)
    ) {
      const anchor = getPlayerCampCenter(state, updatedBuildings);
      if (anchor) {
        const radius = 95 + (entity.id % 6) * 10;
        // Legacy 0.028 rad/tick assumed 1 tick = 1 hour; scale so patrol speed is calendar-stable.
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
        commuteHumanToBuilding(
          entity,
          workplace,
          config.speed,
          workplace.completed && isResidenceBuilding(workplace),
          3.5,
        );
        onSchedule = true;
        suppressIdle = true;
      }
    } else if (!huntingWere && !inElectionCeremony && !festivalGathering && onSchoolShift && !isInnkeeper && schoolTarget) {
      commuteHumanToBuilding(entity, schoolTarget, config.speed, false, 3.2);
      onSchedule = true;
      suppressIdle = true;
      recordChildSchoolTick(entity, schoolTarget, hourOfDay, state.tick);
    } else if (!huntingWere && !inElectionCeremony && onTavernShift && workplace) {
      // Innkeeper tends the bar evenings (weekdays + weekends)
      commuteHumanToBuilding(entity, workplace, config.speed, false, 3.2);
      onSchedule = true;
      suppressIdle = true;
      if (Math.random() < 0.04 * PER_TICK_RATE_SCALE) settlerChat(entity, 'work', 0.12);
    } else if (!huntingWere && !inElectionCeremony && !festivalGathering && goWorkTime && !isInnkeeper && workplace) {
      commuteHumanToBuilding(
        entity,
        workplace,
        config.speed,
        workplace.completed && isResidenceBuilding(workplace),
        3.5,
      );
      onSchedule = true;
      suppressIdle = true;
    }

    if (!allowFreeRoam && onSchedule && !huntingWere) {
      entity.vx *= 0.85;
      entity.vy *= 0.85;
    }

    // Free-roam hunting — player settlers only (visitors/rivals do not farm the valley).
    // Hunters chase game when moderately hungry; other jobs only when starving.
    const isJobHunter = entity.job === JobType.Hunter;
    // Famine overrides: with no food in stores a hungry settler hunts whatever
    // nature offers, even off-schedule — hunger wins over the daily routine.
    const famine = state.resources.food <= 0;
    const freeHuntHungry = isJobHunter
      ? entity.energy < entity.maxEnergy * 0.85
      : famine
        ? entity.energy < entity.maxEnergy * 0.6
        : entity.energy < entity.maxEnergy * 0.38;
    const blueberryForaging = !isJobHunter && tryTickBlueberryForaging(state, ctx, entity, {
      freeTime: allowFreeRoam && !onSchedule,
      ateMeal,
      festivalGathering,
      famine,
      speed: config.speed,
    });

    if (
      !blueberryForaging
      && !festivalGathering
      && (allowFreeRoam || famine)
      && isPlayerHuman(entity)
      && !ateMeal
      && !entity.isJuvenile
      && freeHuntHungry
    ) {
      const preyTypes = new Set<EntityType>(famine
        ? [EntityType.Deer, EntityType.Rabbit, EntityType.Fox, EntityType.Wolf]
        : [EntityType.Deer, EntityType.Rabbit]);
      // Assigned hunters range farther; everyone else is opportunistic
      const huntRange = getHumanHuntRange(
        state,
        config.huntRange * (isJobHunter ? 1.2 : 0.75) * traitMultiplier(entity, 'brave', 1.25),
      );
      let closestPrey: Entity | null = null;
      let closestDist = Infinity;

      const preyFallback = famine
        ? [
            ...byType[EntityType.Deer],
            ...byType[EntityType.Rabbit],
            ...byType[EntityType.Fox],
            ...byType[EntityType.Wolf],
          ]
        : [
            ...byType[EntityType.Deer],
            ...byType[EntityType.Rabbit],
          ];
      const huntHit = findClosestInEntityGrid(
        mobileGrid,
        entity.x,
        entity.y,
        huntRange,
        (prey) => preyTypes.has(prey.type) && isValidHuntPrey(prey, prey.type, entity.id),
        'hunt',
        preyFallback,
      );
      if (huntHit) {
        closestPrey = huntHit.entity;
        closestDist = Math.sqrt(huntHit.distSq);
      }

      if (closestPrey?.alive && closestDist < config.size + closestPrey.size) {
        const preyId = closestPrey.id;
        markWildlifeDead(ctx, closestPrey);
        clearHuntersTargetingPrey(preyId, entityById, ctx.huntTargetByPreyId);
        createDeathParticles(state, closestPrey.x, closestPrey.y, '#8a2a2a', 10);
        syncEntityGrids(ctx, closestPrey);
        // Arrow flight for free-roam hunting too (same FX as Hunting Spots)
        addHuntVisual(state, {
          hunterId: entity.id,
          preyType: closestPrey.type,
          fromX: entity.x,
          fromY: entity.y,
          toX: closestPrey.x,
          toY: closestPrey.y,
          startedAtTick: state.tick,
          startedAtMs: Date.now(),
          success: true,
          foughtBack: false,
        });
        const energyBite = config.energyGain[closestPrey.type] ?? (closestPrey.type === EntityType.Deer ? 350 : 150);
        entity.energy = Math.min(entity.maxEnergy, entity.energy + energyBite);
        entity.flash = 10;
        entity.combatTicks = 16;
        entity.huntTargetId = undefined;
        const foodGain = freeHuntFoodGain(closestPrey.type, state);
        addResource(state, 'food', foodGain);
        // BUG-2: label each prey type — Fox/Wolf kills were shown as 'Rabbit'
        const preyLabel = closestPrey.type === EntityType.Deer
          ? 'Deer'
          : closestPrey.type === EntityType.Fox
            ? 'Fox'
            : closestPrey.type === EntityType.Wolf
              ? 'Wolf'
              : 'Rabbit';
        addFloatingText(state, closestPrey.x, closestPrey.y - 14, `Hunted ${preyLabel}! +${foodGain}`, '#f97316');
        entity.vx = 0;
        entity.vy = 0;
        impulseScreenShake(state, 2);
      } else if (closestPrey?.alive) {
        entity.huntTargetId = closestPrey.id;
        const dx = closestPrey.x - entity.x;
        const dy = closestPrey.y - entity.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        // Hunters pursue faster; casual foragers jog; brave settlers push harder
        const chaseMult = (isJobHunter ? 0.72 : 0.5) * traitMultiplier(entity, 'brave', 1.2);
        entity.vx = (dx / dist) * config.speed * chaseMult;
        entity.vy = (dy / dist) * config.speed * chaseMult;
        entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
        suppressIdle = true;
        // Strained+ valley: rare chatter so yield dips don't read as pure RNG
        if (
          valleyStageIndex(state.valleyStage ?? 'stable') >= 1
          && isJobHunter
          && personDayRoll(entity.id, state.tick, 811) < 0.012
        ) {
          sayHumanChatPhrase(entity, "Game's getting scarce…", 48);
        }
      } else {
        entity.huntTargetId = undefined;
        if (
          valleyStageIndex(state.valleyStage ?? 'stable') >= 1
          && isJobHunter
          && personDayRoll(entity.id, state.tick, 812) < 0.02
        ) {
          sayHumanChatPhrase(entity, 'Thin trails today…', 40);
        }
      }
    } else if (
      !allowFreeRoam
      || ateMeal
      || !isPlayerHuman(entity)
      || entity.isJuvenile
      || !freeHuntHungry
    ) {
      entity.huntTargetId = undefined;
    }

    if (
      isPlayerHuman(entity)
      && entity.gender === 'female'
      && entity.pregnant
      && !conceivedToday
      && entity.pregnancyProgress !== undefined
    ) {
      tickPregnancyAndBirth(state, ctx, entity, { livingHumanAt });
    }

    // Evening out — some singles (incl. divorced), some nights.
    if (
      socialTime
      && allowFreeRoam
      && isEligibleToCourt(entity)
      && hourOfDay >= EVENING_START
      && hourOfDay <= 22
      && !suppressIdle
      && personDayRoll(entity.id, state.tick, 301) > 0.35
    ) {
      const nearbySingle = findClosestAdaptiveInRadius(
        humanSocialGrid,
        allHumans,
        entity.x,
        entity.y,
        SOCIAL_COURTSHIP_RADIUS,
        (h) =>
          isEligibleToCourt(h)
          && h.id !== entity.id
          && !!h.gender
          && !!entity.gender
          && h.gender !== entity.gender,
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

    // Courtship / remarriage — singles (incl. divorced) when free to socialize
    if (
      socialTime
      && isEligibleToCourt(entity)
      && entity.gender
      && entity.energy > config.reproductionEnergyThreshold * 0.6
    ) {
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
            if (Math.random() < 0.4 * PER_TICK_RATE_SCALE) {
              settlerPairChat(entity, closest, 'courtship', 0.85);
            } else if (Math.random() < 0.5 * PER_TICK_RATE_SCALE) {
              settlerPairChat(entity, closest, 'courtship', 0.1);
            }
            // Only the lower-id partner applies progress (avoids 2× when both tick)
            if (entity.id < closest.id) {
              const hasPerformers = state.visitorGroups.some((g) => g.kind === 'performers' && g.daysLeft > 0);
              const courtRate = (4 + churchStrength * 2)
                * (state.festival?.active ? 2 : 1)
                * (hasPerformers ? 1.35 : 1)
                * (livingTogether ? 1.5 : 1)
                // Gregarious settlers court faster; timid ones hold back.
                * traitMultiplier(entity, 'gregarious', 1.4)
                * traitMultiplier(entity, 'timid', 0.7)
                // Graceful settlers charm a little faster too.
                * traitMultiplier(entity, 'graceful', 1.2)
                * PER_TICK_RATE_SCALE;
              entity.courtshipProgress = Math.min(100, (entity.courtshipProgress || 0) + courtRate);
              closest.courtshipProgress = Math.min(100, (closest.courtshipProgress || 0) + courtRate);
            }

            if (Math.random() < 0.08 * PER_TICK_RATE_SCALE) {
              state.deathParticles.push({
                x: entity.x + (Math.random() - 0.5) * 15,
                y: entity.y - 8,
                vx: (Math.random() - 0.5) * 0.3,
                vy: -0.8 - Math.random() * 0.5,
                life: 25,
                maxLife: 25,
                color: '#ff69b4',
                size: 2 + Math.random() * 1.5,
                type: 'heart',
              });
            }

            if (
              entity.id < closest.id
              && entity.gender
              && closest.gender
              && entity.gender !== closest.gender
              && (entity.courtshipProgress ?? 0) >= 100
              && (closest.courtshipProgress ?? 0) >= 100
              && entity.age >= HUMAN_MOVE_OUT_MIN_AGE
              && closest.age >= HUMAN_MOVE_OUT_MIN_AGE
              && isEligibleToCourt(entity)
              && isEligibleToCourt(closest)
            ) {
              entity.relationshipStatus = 'married';
              entity.partnerId = closest.id;
              entity.courtshipPartnerId = undefined;
              entity.courtshipProgress = 0;
              entity.affairPartnerId = undefined;
              entity.affairProgress = 0;
              closest.relationshipStatus = 'married';
              closest.partnerId = entity.id;
              closest.courtshipPartnerId = undefined;
              closest.courtshipProgress = 0;
              closest.affairPartnerId = undefined;
              closest.affairProgress = 0;
              createDeathParticles(
                state,
                (entity.x + closest.x) / 2,
                (entity.y + closest.y) / 2 - 15,
                '#ffd700',
                15,
                'heart',
              );
              addFloatingText(
                state,
                (entity.x + closest.x) / 2,
                (entity.y + closest.y) / 2 - 25,
                'Married!',
                '#ffd700',
              );
              syncMarriageSurnames(entity, closest);
              const married1 = humanDisplayName(entity);
              const married2 = humanDisplayName(closest);
              logEvent(state, 'marriage', `${married1} and ${married2} got married`, married1);
              addNotification(state, 'Marriage', `${married1} & ${married2} are now married`, 'success');
              sayHumanChatPhrase(entity, 'Yes!', 120);
              sayHumanChatPhrase(closest, 'Yes!', 120);
              syncPartnerResidence(
                entity,
                closest,
                updatedBuildings.filter(isResidenceBuilding),
                playerHumans,
              );
            }
          }
      }
    }

    // Married couples — nudge toward partner when daily conception window missed (off-screen / apart)
    if (
      socialTime
      && isPlayerHuman(entity)
      && entity.gender === 'female'
      && entity.relationshipStatus === 'married'
      && !entity.pregnant
      && entity.partnerId
      && entity.reproductionCooldown <= 0
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

    // Secret affairs — when the spouse isn't watching (including separate workplaces by day)
    if (
      canPursueSecretAffair(entity, hourOfDay, workplace, updatedBuildings, entityById, state.tick)
      && isPlayerHuman(entity)
      && !entity.isJuvenile
      && !entity.pregnant
      && entity.gender
      && entity.age >= HUMAN_ADULT_MIN_AGE
      && entity.age < HUMAN_MAX_LIFESPAN_YEARS
      && entity.energy > config.reproductionEnergyThreshold * 0.5
      && entity.relationshipStatus === 'married'
      && !isAtMaritalHome(entity, entityById, buildingById)
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
              const affairRate = (churchStrength > 0 ? 4 : 6)
                * (state.festival?.active ? 1.4 : 1)
                * churchPenalty
                * PER_TICK_RATE_SCALE;
              entity.affairProgress = Math.min(100, (entity.affairProgress || 0) + affairRate);
              paramour.affairProgress = Math.min(100, (paramour.affairProgress || 0) + affairRate);

              if (Math.random() < 0.06 * PER_TICK_RATE_SCALE) {
                state.deathParticles.push({
                  x: entity.x + (Math.random() - 0.5) * 10,
                  y: entity.y - 6,
                  vx: (Math.random() - 0.5) * 0.2,
                  vy: -0.5,
                  life: 18,
                  maxLife: 18,
                  color: '#f472b6',
                  size: 2,
                  type: 'heart',
                });
              }

              // Affair ESTABLISHMENT is the new-calendar-day owner's decision
              // (SIMULATION_AUTHORITY §3/§4, BUG 2026-08-20-affair-establishment-dual-cadence):
              // the staggered path advances tryst progress only and never writes
              // affairPartnerId. The daily tryDailyAffairEncounter establishes
              // once both sides reach 100.
            }

            if (
              (entity.affairProgress ?? 0) >= 45
              && (paramour.affairProgress ?? 0) >= 45
              && hasAffairPartner(entity, entityById)
              && entity.affairPartnerId === paramour.id
            ) {
              // Scandal exposure requires an ESTABLISHED affair (architecture
              // checklist) — unestablished flirtation never rolls a scandal.
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

    // Affair lovers — move toward tryst when apart; spouse can catch them in the act
    if (
      canPursueSecretAffair(entity, hourOfDay, workplace, updatedBuildings, entityById, state.tick)
      && isPlayerHuman(entity)
      && !entity.isJuvenile
      && !entity.pregnant
      && hasAffairPartner(entity, entityById)
      && !isAtMaritalHome(entity, entityById, buildingById)
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

    // Midday coworker banter while on a day job (not innkeepers)
    if (
      onDayJobShift
      && workplace
      && isPlayerHuman(entity)
      && !entity.isJuvenile
      && entity.job !== JobType.Innkeeper
    ) {
      const shiftMates = (workersByWorkplace.get(entity.homeBuildingId ?? -1) ?? [])
        .filter((h) => h.id !== entity.id);
      tryWorkplaceBanter(entity, shiftMates, state.tick, hourOfDay, true);
    }

    // Doctor on duty — treat sick / pregnant settlers near the hospital
    if (onDayJobShift && isPlayerHuman(entity) && entity.job === JobType.Doctor) {
      const ward = isDoctorAtHospital(entity, updatedBuildings);
      if (ward) {
        doctorTreatNearby(state, entity, ward, allHumans);
      }
    }

    // Official on duty — hear petitioners at the town hall
    if (onDayJobShift && isPlayerHuman(entity) && entity.job === JobType.Official) {
      const hall = isOfficialAtHall(entity, updatedBuildings);
      if (hall) {
        officialHandlePetitioners(state, entity, hall, allHumans);
      }
    }

    // Hotelier on duty — greet guests / tend front desk
    if (onHotelShift && isPlayerHuman(entity) && entity.job === JobType.Hotelier) {
      const hotel = isHotelierAtHotel(entity, buildingById);
      if (hotel) {
        hotelierGreetGuests(state, entity, hotel);
      }
    }


    // Pregnant settlers walk to the nearest staffed hospital — check-ups in free
    // time, and near labor (>85%) they head to the ward even during work hours.
    if (
      entity.pregnant
      && isPlayerHuman(entity)
      && staffedHospitals.length > 0
      && (!onJobShift || (entity.pregnancyProgress ?? 0) > PREGNANCY_TICKS * 0.85)
    ) {
      const best = pickHospitalWalkTarget(entity, staffedHospitals);
      if (best) {
        const dx = best.x + best.width / 2 - entity.x;
        const dy = best.y + best.height / 2 - entity.y;
        const dist = Math.hypot(dx, dy) || 1;
        entity.vx = (dx / dist) * config.speed * 0.55;
        entity.vy = (dy / dist) * config.speed * 0.55;
        entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
        entity.x += entity.vx;
        entity.y += entity.vy;
      }
    }

    // Patient arrived at hospital — free time, or a needy settler who took a
    // work-hours clinic visit (matched by the walk-to-hospital gate above).
    if (
      (needsMedicalCare(entity) || entity.pregnant || !onJobShift)
      && isPlayerHuman(entity)
      && (entity.energy < entity.maxEnergy * 0.5 || entity.pregnant)
      && staffedHospitals.length > 0
    ) {
      const hospital = staffedHospitals.find(
        (b) => Math.hypot(entity.x - (b.x + b.width / 2), entity.y - (b.y + b.height / 2)) < 36,
      );
      if (hospital && personDayRoll(entity.id, state.tick, 840) < 0.2) {
        treatPatientAtHospital(state, entity, hospital);
      }
    }

    // Settler petitioning at town hall (free time near hall)
    if (
      allowFreeRoam
      && isPlayerHuman(entity)
      && !entity.isJuvenile
      && wantsCivicAudience(entity, state)
      && staffedTownHalls.length > 0
    ) {
      const hall = staffedTownHalls.find(
        (b) => Math.hypot(entity.x - (b.x + b.width / 2), entity.y - (b.y + b.height / 2)) < 40,
      );
      if (hall && personDayRoll(entity.id, state.tick, 841) < 0.18) {
        resolveCivicPetition(state, entity, hall);
      }
    }

    // Morning greetings when free settlers pass near each other
    if (
      allowFreeRoam
      && isPlayerHuman(entity)
      && !entity.isJuvenile
      && hourOfDay >= 6
      && hourOfDay <= 9
    ) {
      if ((state.tick + entity.id) % SOCIAL_STAGGER === 0) {
        const passer = findClosestAdaptiveInRadius(
          humanSocialGrid,
          allHumans,
          entity.x,
          entity.y,
          SOCIAL_GREETING_RADIUS,
          (h) =>
            h.id !== entity.id
            && h.alive
            && isPlayerHuman(h)
            && !h.isJuvenile,
          socialAdaptiveOptions('social', allHumans.length, width, height),
        );
        tryNeighborGreeting(entity, passer, state.tick, hourOfDay);
      }
    }

    // === FREE-TIME / LEISURE — small-world bonds (family, coworkers) ===
    // Affairs/courtship above already set suppressIdle when active — we never override those.
    // Cheating stays intact: secret trysts run first; this is open-village life around them.
    if (!onSchedule && entity.isJuvenile && isPlayerHuman(entity)) {
      // Kids: play with other kids first, then free parent, then home.
      const playmates = allHumans.filter(
        (h) => h.alive && h.isJuvenile && h.id !== entity.id && isPlayerHuman(h),
      );
      const kidImpulse = pickSocialImpulse(entity, state, updatedBuildings, [], playmates);
      if (kidImpulse.motive === 'kid_play' && kidImpulse.company?.alive) {
        const play = kidImpulse.company;
        const pdx = play.x - entity.x;
        const pdy = play.y - entity.y;
        const pdist = Math.hypot(pdx, pdy) || 1;
        if (pdist > 16) {
          entity.vx = (pdx / pdist) * config.speed * 0.7;
          entity.vy = (pdy / pdist) * config.speed * 0.7;
        } else {
          // Circle / tag weave
          entity.vx = Math.sin(state.tick * 0.2 + entity.id) * config.speed * 0.45;
          entity.vy = Math.cos(state.tick * 0.18 + play.id) * config.speed * 0.45;
          if (kidImpulse.bubble && Math.random() < 0.06 * PER_TICK_RATE_SCALE) {
            sayHumanChatPhrase(entity, kidImpulse.bubble, 40);
          }
        }
        entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
        suppressIdle = true;
      } else {
        const mother = entity.motherId != null ? livingHumanAt(entity.motherId) : undefined;
        const father = entity.fatherId != null ? livingHumanAt(entity.fatherId) : undefined;
        const freeParent = [mother, father].find(
          (p) => p?.alive && isPlayerHuman(p) && !prefersHomeTonight(p.id, state.tick, hourOfDay)
            && !isOnWorkScheduleShift(state, hourOfDay),
        ) ?? [mother, father].find((p) => p?.alive);
        const follow = freeParent ?? getChildCustodian(entity, allHumans);
        if (follow?.alive && personDayRoll(entity.id, state.tick, 601) > 0.22) {
          const pdx = follow.x - entity.x;
          const pdy = follow.y - entity.y;
          const pdist = Math.hypot(pdx, pdy) || 1;
          if (pdist > 22) {
            entity.vx = (pdx / pdist) * config.speed * 0.55;
            entity.vy = (pdy / pdist) * config.speed * 0.55;
            entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
          } else if (pdist > 8) {
            entity.vx = (pdx / pdist) * config.speed * 0.18;
            entity.vy = (pdy / pdist) * config.speed * 0.18;
          }
          suppressIdle = true;
        } else if (hasResidenceAssignment(entity)) {
          const residence = buildingById.get(entity.residenceBuildingId!);
          if (residence?.completed) {
            commuteHumanToBuilding(entity, residence, config.speed, true);
            suppressIdle = true;
          }
        }
      }
    } else if (allowFreeRoam && !suppressIdle && isPlayerHuman(entity) && !entity.isJuvenile) {
      const tick = state.tick;
      const absDay = getAbsoluteCalendarDay(tick);
      // Legacy slot was 80 ticks (~3.3 days at 24 tpd); scale with day length.
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
        const pool = updatedBuildings.filter(
          (b) => b.completed && b.faction !== 'rival' && types.includes(b.type),
        );
        if (pool.length === 0) return undefined;
        return pool[(entity.id + leisureSlot) % pool.length];
      };

      // --- Human motives (sick, grief, weather, Sunday, errands, care…) ---
      // Grid query instead of an O(H) distance filter per free-roaming human.
      // v0.6 perf: radius 1.5x → 1.1x socialScanRadius (4.4 cells) — the nearby pool
      // stays rich at village density; the visited area at clustered scale drops ~1.8x.
      const nearbyAdults: Entity[] = [];
      if ((state.tick + entity.id) % SOCIAL_STAGGER === 0) {
        forEachAdaptiveInRadius(
          humanSocialGrid,
          allHumans,
          entity.x,
          entity.y,
          SOCIAL_FRIENDSHIP_RADIUS,
          (h) => {
            if (h.alive && isPlayerHuman(h) && !h.isJuvenile) nearbyAdults.push(h);
          },
          socialAdaptiveOptions('social', allHumans.length, width, height),
        );
      }
      // Ensure spouse is considered even if slightly farther
      const spouseEarly = entity.partnerId != null ? livingHumanAt(entity.partnerId) : undefined;
      if (spouseEarly?.alive && !nearbyAdults.some((h) => h.id === spouseEarly.id)) {
        nearbyAdults.push(spouseEarly);
      }
      const impulse = pickSocialImpulse(
        entity,
        state,
        updatedBuildings,
        nearbyAdults,
        [],
      );
      if (impulse.motive !== 'none') {
        if (impulse.bubble && Math.random() < 0.08 * PER_TICK_RATE_SCALE) {
          sayHumanChatPhrase(entity, impulse.bubble, 55);
        }
        if (impulse.stayHome && hasResidenceAssignment(entity)) {
          const home = buildingById.get(entity.residenceBuildingId!);
          if (home?.completed) {
            commuteHumanToBuilding(entity, home, config.speed * (impulse.motive === 'sick_day' ? 0.7 : 0.9), true, 2.2);
            if (impulse.motive === 'sick_day') {
              entity.energy = Math.min(entity.maxEnergy, entity.energy + 0.25 * PER_TICK_RATE_SCALE);
            }
            suppressIdle = true;
          }
        } else if (impulse.company?.alive && impulse.building) {
          const b = impulse.building;
          const cx = b.x + b.width / 2;
          const cy = b.y + b.height * 0.92;
          // Walk with company toward a place of care
          const midX = (impulse.company.x + cx) / 2;
          const midY = (impulse.company.y + cy) / 2;
          const dx = midX - entity.x;
          const dy = midY - entity.y;
          const dist = Math.hypot(dx, dy) || 1;
          if (dist > 16) {
            entity.vx = (dx / dist) * config.speed * 0.48;
            entity.vy = (dy / dist) * config.speed * 0.48;
            entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
          } else {
            settlerPairChat(entity, impulse.company, 'home', 0.1);
          }
          suppressIdle = true;
        } else if (impulse.company?.alive) {
          const c = impulse.company;
          const dx = c.x - entity.x;
          const dy = c.y - entity.y;
          const dist = Math.hypot(dx, dy) || 1;
          if (dist > 16) {
            entity.vx = (dx / dist) * config.speed * 0.5;
            entity.vy = (dy / dist) * config.speed * 0.5;
            entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
          } else if (impulse.motive === 'comfort_neighbor') {
            settlerPairChat(entity, c, 'social', 0.12);
            c.energy = Math.min(c.maxEnergy, c.energy + 0.15 * PER_TICK_RATE_SCALE);
          } else if (impulse.motive === 'care_pregnant') {
            settlerPairChat(entity, c, 'home', 0.12);
          }
          suppressIdle = true;
        } else if (impulse.building) {
          const b = impulse.building;
          const arrived = Math.hypot(
            entity.x - (b.x + b.width / 2),
            entity.y - (b.y + b.height * 0.92),
          ) < 20;
          if (!arrived) {
            commuteHumanToBuilding(entity, b, config.speed * 0.5, false, 2.8);
          } else if (impulse.motive === 'sunday_service' || impulse.motive === 'grief') {
            entity.vx *= 0.2;
            entity.vy *= 0.2;
            if (Math.random() < 0.05 * PER_TICK_RATE_SCALE) settlerChat(entity, 'social', 0.1);
          } else if (impulse.motive === 'market_errand' || impulse.motive === 'birthday') {
            entity.energy = Math.min(entity.maxEnergy, entity.energy + 0.2 * PER_TICK_RATE_SCALE);
            settlerChat(entity, 'social', 0.1);
          }
          suppressIdle = true;
        }
      }

      if (!suppressIdle) {
      // --- Bonds: partner, kids, coworkers (same workplace) ---
      const spouse = spouseEarly ?? (entity.partnerId != null ? livingHumanAt(entity.partnerId) : undefined);
      const kids = (entity.childrenIds ?? [])
        .map((id) => livingHumanAt(id))
        .filter((k): k is Entity => !!k?.alive && !!k.isJuvenile);
      const coworkers = entity.homeBuildingId != null
        ? (workersByWorkplace.get(entity.homeBuildingId) ?? []).filter((h) => h.id !== entity.id)
        : [];
      // Active affair lover is NOT open free-time company — tryst AI owns that.
      const sneaking =
        hasAffairPartner(entity, entityById)
        && canPursueSecretAffair(
          entity,
          hourOfDay,
          workplace,
          updatedBuildings,
          entityById,
          state.tick,
        )
        && !isAtMaritalHome(entity, entityById, buildingById);

      const bondRoll = personDayRoll(entity.id, tick, 510 + leisureSlot);
      let company: Entity | null = null;
      let companyKind: 'partner' | 'kid' | 'coworker' | null = null;
      if (!sneaking) {
        if (spouse?.alive && bondRoll < 0.40) {
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

      // Walk with company — couples, parents with kids, workmates off the clock.
      const hangWithCompany = company != null
        && personDayRoll(entity.id, tick, 520 + leisureSlot) < 0.78;
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
          // Drift together toward a shared village spot (tavern is a favorite).
          // Phase 3.2 — sometimes the prettiest spot in the neighborhood wins.
          if (state.beautyGrid != null && Math.random() < 0.35) {
            const pretty = pickBeautySpot(
              state.beautyGrid,
              (entity.x + company.x) / 2,
              (entity.y + company.y) / 2,
              5,
            );
            steerTo(pretty.x, pretty.y, 0.42, 14);
            if (beautyAt(state.beautyGrid, entity.x, entity.y) >= 3 && Math.random() < 0.04 * PER_TICK_RATE_SCALE) {
              entity.energy = Math.min(entity.maxEnergy, entity.energy + 0.4 * PER_TICK_RATE_SCALE);
              addFloatingText(state, entity.x, entity.y - 26, '💐', '#f9a8d4', 'brief');
            }
          } else {
            const shared = (Math.min(entity.id, company.id) * 31 + leisureSlot * 17 + absDay) % 6;
          if (shared <= 1) {
            const tavern = pickCompleted([BuildingType.Tavern]);
            if (tavern) {
              steerTo(tavern.x + tavern.width / 2, tavern.y + tavern.height * 0.92, 0.45, 20);
            } else {
              const shop = pickCompleted([BuildingType.Market, BuildingType.Store]);
              if (shop) steerTo(shop.x + shop.width / 2, shop.y + shop.height * 0.92, 0.42, 20);
              else idleVx = Math.sin(tick * 0.03 + entity.id) * config.speed * 0.1;
            }
          } else if (shared === 2) {
            const shop = pickCompleted([BuildingType.Market, BuildingType.Store]);
            if (shop) steerTo(shop.x + shop.width / 2, shop.y + shop.height * 0.92, 0.42, 20);
            else idleVx = Math.sin(tick * 0.03 + entity.id) * config.speed * 0.1;
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
        // 0–2  Tavern first (beer & banter), else market
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
            if (Math.random() < 0.04 * PER_TICK_RATE_SCALE) {
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
            (fract(phase * 0.41) * width * 0.5) + width * 0.25,
            (fract(phase * 0.73) * height * 0.5) + height * 0.25,
            0.4,
          );
        }
      } else if (leisureKind === 4) {
        const church = pickCompleted([BuildingType.Church]);
        if (church) {
          steerTo(
            church.x + church.width / 2,
            church.y + church.height * 0.95,
            0.42,
            18,
          );
        } else {
          steerTo(width * 0.45, height * 0.45, 0.38);
        }
      } else if (leisureKind === 5) {
        const hall = pickCompleted([BuildingType.TownHall]);
        if (hall) {
          steerTo(
            hall.x + hall.width / 2 + ((entity.id % 5) - 2) * 8,
            hall.y + hall.height + 6,
            0.44,
            20,
          );
        } else {
          steerTo(width * 0.5, height * 0.5, 0.4);
        }
      } else if (leisureKind === 6) {
        // Visit bond first (partner / coworker / friend), not a random stranger.
        let friend: Entity | null = spouse?.alive ? spouse : null;
        if (!friend && coworkers.length > 0 && personDayRoll(entity.id, tick, 530) < 0.55) {
          friend = coworkers[(entity.id + leisureSlot) % coworkers.length]!;
        }
        if (!friend && (state.tick + entity.id) % SOCIAL_STAGGER === 0) {
          friend = findClosestAdaptiveInRadius(
            humanSocialGrid,
            allHumans,
            entity.x,
            entity.y,
            SOCIAL_FRIENDSHIP_RADIUS,
            (h) =>
              h.id !== entity.id
              && h.alive
              && isPlayerHuman(h)
              && !h.isJuvenile
              && h.id !== entity.affairPartnerId,
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
          steerTo(
            width * 0.5 + ((entity.id % 5) - 2) * 40,
            height * 0.5 + ((entity.id % 7) - 3) * 30,
            0.4,
          );
        }
      } else if (leisureKind === 7) {
        // Festival / village green
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
        steerTo(
          gx + ((entity.id % 6) - 2.5) * 12,
          gy + ((entity.id % 5) - 2) * 10,
          0.5,
          22,
        );
      } else if (leisureKind === 8) {
        // Static tree index (built lazily per world, see tickLayerRealtime) —
        // replaces the naive full-array scan over every tree per human.
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
          steerTo(
            (fract(phase * 0.27) * width * 0.55) + width * 0.2,
            (fract(phase * 0.53) * height * 0.55) + height * 0.2,
            0.35,
          );
        }
      } else if (leisureKind === 9) {
        // Edge of settlement — watch wildlife / scenery
        const edge = (entity.id + leisureSlot) % 4;
        const tx = edge === 0 ? width * 0.12 : edge === 1 ? width * 0.88 : width * (0.3 + fract(phase) * 0.4);
        const ty = edge === 2 ? height * 0.12 : edge === 3 ? height * 0.88 : height * (0.3 + fract(phase * 1.3) * 0.4);
        steerTo(tx, ty, 0.4, 20);
      } else if (leisureKind === 10) {
        // Long wander between two map landmarks
        const a = fract(phase * 0.6180339887);
        const b = fract(phase * 0.3819660113);
        const targetX = a * width * 0.7 + width * 0.15;
        const targetY = b * height * 0.7 + height * 0.15;
        steerTo(targetX, targetY, 0.46, 18);
      } else {
        // Rest near home porch
        if (hasResidenceAssignment(entity)) {
          const home = buildingById.get(entity.residenceBuildingId!);
          if (home?.completed) {
            steerTo(
              home.x + home.width / 2 + ((entity.id % 5) - 2) * 6,
              home.y + home.height * 0.95,
              0.4,
              12,
            );
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
      } // end generic leisure (!suppressIdle after social motive)
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

    if (entity.x < 0) entity.x = 0;
    if (entity.x > width) entity.x = width;
    if (entity.y < 0) entity.y = 0;
    if (entity.y > height) entity.y = height;

    advanceHumanWalkAnim(entity);

    if (entity.energy <= 0) {
      killHuman(entity, updatedBuildings, entityById, state.tick);
      createDeathParticles(state, entity.x, entity.y, '#8B0000', 8);
      logEvent(state, 'death', formatDeathLog(entity, 'succumbed to exhaustion'), formatCitizenName(entity));
    }
    syncEntityGrids(ctx, entity);
  }
  if (isNewCalendarDay) {
    // Active pregnancies are computed from the authoritative state at flush —
    // never inferred from pregnanciesStartedThisInterval (Objective 8).
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
