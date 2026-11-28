import { MAX_ASSIGNABLE_COMMUTE_HOURS, MAX_COMMUTE_LEAD_HOURS, WORK_COMMUTE_RUSH, quoteBuildingCommute } from './commuteReach';
import type { WorldState, Entity, Building } from './gameTypes';
import { EntityType, BuildingType, BUILDING_JOB_TYPES, JobType, Season, PATH_CELL } from './gameTypes';
import { isBarracksGuard } from './defenseStructures';
import { SPECIES_CONFIG } from './speciesConfig';
import { Relationship } from './gameConstants';
import { getSimRng, seededRandomForRun, personDayRoll } from './simRng';
import { faceVelocity, ROAD_SPEED_MULT } from './simulation/movementSteering';
import { OFFSCREEN_HUMAN_THROTTLE, isInFocus } from './simFocus';
import { getChurchStrength, findHumanWorkplace } from './workforce';
import { resolveShift } from './workAbsence';
import { buildConstructionCrewIndex } from './workforceSummary';
import { getApprenticeTrainingSite } from './apprenticeships';

import { isPlayerHuman } from './playerHuman';
import { deterministicCos, deterministicSin } from './simTrig';
import { isSettlerRelationshipEntity } from './moonHowlerForm';
import { buildCeremonySeatIndex, getElectionGatherTarget, isCeremonyAttendee } from './villageLeadership';
import { getSpotlightGatherTarget } from './spotlightLore';

import {
  isAsleepAtHome,
  isFestivalGatherer,
  prefersHomeTonightFor,
  preShiftSleepPlan,
  shouldBeAtHomeFor,
} from './humanSchedule';
import {
  getWorkSchedule,
  isOnWorkCommuteHours,
  isOnWorkScheduleShift,
  isWithinWorkCommuteLead,
} from './workSchedule';
import { isWorkDay, TICKS_PER_DAY, TICKS_PER_HOUR } from './dayCycleClock';
import { HUMAN_MAX_LIFESPAN_YEARS, tryGraduateHumanChild, syncHumanAgeFromCalendar, PER_TICK_RATE_SCALE, isWeekend, getAbsoluteCalendarDay, isNightHour, isNewCalendarDayTick, EVENING_START, isStartOfClockHour } from './dayCycle';
import { hasResidenceAssignment, isNearResidence, isResidenceBuilding, shareResidence } from './housingModel';
import { HUMAN_ADULT_MIN_AGE } from './daycycleconstants';
import {
  chatHintsFromWorld,
  endAmbientHumanChat,
  tickHumanChat,
  type HumanChatContext,
} from './humanChat';
import { maybeDialogueChat, tryAmbientRandomDialogue } from './dialogueTrees';

import { isRenffrGossipActive } from './renffrStar';
import { getHumanFleeSpeedMultiplier } from './combat';
import { isActiveMoonHowler } from './moonHowler';

import {
  applyEducationGraduation,
  creditChildSchoolDay,
  findStaffedSchools,
  hasTeacherPresent,
  syncSchoolAssignments,
  recordChildSchoolTick,
  isSchoolTime,
  isChildAtSchool,
  SCHOOL_START_HOUR,
} from './education';
import {
  getPlayerCampCenterFromBuildings,
  getPlayerSettlerCenter,
} from './frontierCombat';
import { idleDestination, stopSupersededChildLeisure, tickHumanLeisure } from './humanLeisureBehavior';
import { tickHumanHunting } from './humanHuntingBehavior';
import {
  HUNTING_PURSUIT_SPEED_MULT,
  huntingPursuitPoint,
  huntingSpotChaseTarget,
  huntingSpotTarget,
  isHuntingSpotHunter,
} from './huntingSpot';
import { getCaravanMoveTarget, tryAdvanceCaravanLeg } from './tradeCaravans';
import {
  isGreetingHour,
  isSocialStaggerTick,
  tryNeighborGreeting,
  tryWorkplaceBanter,
} from './socialLife';
import {
  isPregnancyHospitalPriority,
  isStaffedHospital,
  tickHumanDoctorHospitalService,
  tickHumanHospitalPatientCare,
} from './humanHospitalBehavior';
import {
  tickHumanCivicVenueService,
  tickTavernService,
} from './humanVenueBehavior';
import {
  checkoutVisitor,
  createHotelLodgingIndex,
  isSettlerLodgingAtHotel,
  lodgingHotelFor,
} from './hotelStay';
import { doctorHospitalShift } from './hospitalShifts';

import { getReadOnlyPathGrid, isOnWalkableRoadAt, nearestWalkableWorldPoint, setCurrentPathMap, steerWithPath } from './pathfinding';
import { crowdGatherPosition, enterHumanBuilding, applyHumanWalkStep, advanceHumanWalkAnim, clearHumanWalkTarget, commuteDistanceFromResidence, commuteDistanceToBuilding, commuteHumanToBuilding, commuteLeadHoursFor, nearestActiveMoonHowler, resumeHumanWalk, steerHumanToward } from './simulation/humanMovement';
import { buildingAccessPoint, isAtBuildingReach } from './buildingAccess';
import { tryEatColonyMeal, killFromStarvation } from './simulation/humanNeeds';
import { advanceHumanNeeds, getHumanStaminaRatio, hasFatalStarvation, hasNearbyWell, resolveHumanNeedsIntent } from './simulation/humanPhysiology';
import { getPreventiveCareMortalityMultiplier, isRestingHospitalPatient } from './hospitalCare';
import { getCompletedWildlifePreserves } from './wildlifePopulationPolicy';
import { simAmbientChatNeighbors, simSettlerPairChat } from './simulation/humanSocial';
import { tickPregnancyAndBirth } from './simulation/humanLifecycle';

import { clampToMapBounds } from './mapBounds';
import { buildRoadAvoidanceIndex } from './spatialGrid';
import { buildResidenceOccupantIndex, findClosestEntityInRadius } from './simQueries';


import { combinePairFactors, evaluateAptitudeInfluence } from './personality/traitEvaluation';
import type { TickContext } from './simulation/simulationTypes';


import {
  findClosestAdaptiveInRadius,
  socialAdaptiveOptions,
  SOCIAL_GREETING_RADIUS,
  SOCIAL_COURTSHIP_RADIUS,
} from './adaptiveSpatialQuery';
import {
  AFFAIR_SPOUSE_BLOCK_RADIUS,
  bindCourtship,
  canAdvanceCourtship,
  canPursueSecretAffair,
  courtshipRatePerHour,
  findCourtshipPartner,
  getAffairTrystBuilding,
  hasAffairPartner,
  isEligibleToCourt,
  isMaritalHomeOccupiedBySpouse,
  isSpouseNearby,
  isValidAffairTarget,
  isValidAffairTrystSite,
  affairEncounterHourOfDay,
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
import { isMarriedOrExpecting } from './relationships';
import { isHospitalDoctorCommuteTime } from './hospitalShifts';
import { recordPresentWorkTick, recordScheduleWorkTick } from './scheduleFatigue';

import { syncEntityGrids } from './simulation/simulationEntities';

/** A departure is sticky until the watch begins: recalculating lead time from the
 * shrinking remaining distance otherwise switches a guard's commute off mid-journey. */
const prisonGuardCommuteStarted = new WeakMap<Entity, { prisonId: number; shiftStartTick: number }>();

/** Live on-screen intimate tryst distance. */
const AFFAIR_INTIMATE_RADIUS = 22;

function getAffairTrystTarget(
  cheater: Entity,
  paramour: Entity,
  entityById: Map<number, Entity>,
  buildingById: Map<number, Building>,
): { x: number; y: number } {
  const trystBuilding = getAffairTrystBuilding(cheater, paramour, entityById, buildingById);
  // Both lovers walk to the same doorstep. The footprint centre is blocked, so steering at it
  // pressed them against opposite walls and the tryst never became reachable.
  if (trystBuilding) return buildingAccessPoint(trystBuilding);
  return { x: paramour.x, y: paramour.y };
}

/** Route a lover to the tryst door; returns nothing because the human loop applies the walk step. */
function steerAffairApproach(
  entity: Entity,
  partner: Entity,
  target: { x: number; y: number },
  speed: number,
): void {
  const dx = target.x - entity.x;
  const dy = target.y - entity.y;
  const dist = Math.hypot(dx, dy) || 1;
  const route = steerWithPath(
    entity,
    target.x,
    target.y,
    speed,
    `affair_${entity.id}_${partner.id}`,
  );
  if (route === 'direct') {
    entity.vx = (dx / dist) * speed;
    entity.vy = (dy / dist) * speed;
    faceVelocity(entity);
  }
}

/**
 * The human loop's single position integration: road pace, the indoor arrest, the collision-checked
 * walk step, map bounds and the walk animation. Both the full-AI tick and the throttled continuation
 * go through it, so a settler can never be moved by two different rules.
 */
function integrateHumanWalk(entity: Entity, width: number, height: number, roadPace = true): void {
  // Use the same completed-road tiles the route planner prices, not proximity to a road.
  const roadMult = roadPace && isOnWalkableRoadAt(entity.x, entity.y) ? ROAD_SPEED_MULT : 1.0;
  if (entity.indoorBuildingId != null) {
    entity.vx = 0;
    entity.vy = 0;
  }
  applyHumanWalkStep(entity, roadMult);
  clampToMapBounds(entity, width, height);
  advanceHumanWalkAnim(entity);
}

/** Sole tick-level sleep observation; physiology alone owns rest and stamina recovery. */
function observeHumanSleep(entity: Entity, context: {
  hourOfDay: number;
  previousIndoorBuildingId: number | undefined;
  onDuty: boolean;
  recoveringSleep: boolean;
  scheduledSleep: boolean;
  overrideNightSleep: boolean;
  hotels: readonly Building[];
  buildingById: Map<number, Building>;
  overnightTrystIds: ReadonlySet<number>;
  tick: number;
}): { sleeping: boolean; hasHospital: boolean } {
  const { hourOfDay, previousIndoorBuildingId, onDuty, recoveringSleep, scheduledSleep, overrideNightSleep, hotels, buildingById, overnightTrystIds, tick } = context;
  const night = isNightHour(hourOfDay);
  // Soldiers sleeping at their field camp still use the one physiology recovery owner.
  if (entity.raidDeploymentId) return { sleeping: night, hasHospital: false };
  if (entity.prisonBuildingId != null) {
    const cell = buildingById.get(entity.prisonBuildingId);
    return {
      sleeping: Boolean(cell?.completed && night && Math.hypot(entity.x - cell.x, entity.y - cell.y) <= 18),
      hasHospital: false,
    };
  }
  if (onDuty) return { sleeping: false, hasHospital: false };

  const home = entity.residenceBuildingId == null ? undefined : buildingById.get(entity.residenceBuildingId);
  const atHome = !!home && isResidenceBuilding(home)
    && previousIndoorBuildingId === home.id;
  const atHotel = entity.hotelStayBuildingId != null
    && previousIndoorBuildingId === entity.hotelStayBuildingId
    && isSettlerLodgingAtHotel(entity, buildingById, hourOfDay, hotels);
  const ward = previousIndoorBuildingId == null ? undefined : buildingById.get(previousIndoorBuildingId);
  const hasHospital = isRestingHospitalPatient(entity, ward, tick, previousIndoorBuildingId);


  return {
    sleeping: (atHome && (scheduledSleep || recoveringSleep || (night && !overrideNightSleep)))
      || atHotel || hasHospital || overnightTrystIds.has(entity.id),
    hasHospital,
  };
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
  const onWorkCommuteHours = isWorkDay(state.tick) && isOnWorkCommuteHours(workSchedule, hourOfDay);
  const weekend = isWeekend(state.tick);
  const isNewCalendarDay = isNewCalendarDayTick(state);
  const mortalityMultiplier = isNewCalendarDay ? getPreventiveCareMortalityMultiplier(state, updatedBuildings, entityById) : 1;
  const wildlifePreserves = getCompletedWildlifePreserves(updatedBuildings);
  const humanFleeMult = getHumanFleeSpeedMultiplier(state);
  const spotlightGather = state.spotlightLore ?? null;
  const spotlightActorIds = spotlightGather
    ? new Set([spotlightGather.heroineId, ...spotlightGather.performerIds])
    : null;
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

  // Sleep and shift observations become available as each settler is ticked. A pair can
  // interact when its second member is processed; neither person's unobserved sleep
  // state may be guessed from the clock or from whether the other one is awake.
  const courtshipReadiness = new Map<number, {
    sleeping: boolean;
    onDuty: boolean;
    workplaceId: number | undefined;
    atWorkplace: boolean;
    socialTime: boolean;
    contactOnly: boolean;
  }>();
  const advancedCourtshipIds = new Set<number>();

  const workersByWorkplace = new Map<number, Entity[]>();
  const workerIndexById = new Map<number, number>();
  for (const h of allHumans) {
    if (!h.alive || !isPlayerHuman(h) || h.age < HUMAN_ADULT_MIN_AGE) continue;
    const siteId = h.workerBuildingId;
    if (siteId == null) continue;
    const bucket = workersByWorkplace.get(siteId);
    if (bucket) {
      workerIndexById.set(h.id, bucket.length);
      bucket.push(h);
    } else {
      workersByWorkplace.set(siteId, [h]);
      workerIndexById.set(h.id, 0);
    }
  }

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
  const churchStrength = getChurchStrength(updatedBuildings, playerHumans);

  // Nearby completed player wells are cached once per tick, not scanned from every building per settler.
  const nearbyWells = updatedBuildings.filter((b) => b.type === BuildingType.Well
    && b.completed);

  const staffedHospitals: Building[] = [];
  const staffedTownHalls: Building[] = [];
  /**
   * The village's leisure venues, gathered once per tick: a tick-stable fact handed to the
   * behaviour instead of rescanning every building for every idle settler.
   */
  const idleVenues: Building[] = [];
  for (const b of updatedBuildings) {
    if (!b.completed) continue;
    if (
      b.type === BuildingType.Tavern ||
      b.type === BuildingType.Market ||
      b.type === BuildingType.TownHall ||
      b.type === BuildingType.Church
    ) {
      idleVenues.push(b);
    }
  }
  for (const b of updatedBuildings) {
    if (isStaffedHospital(b)) staffedHospitals.push(b);
    else if (b.type === BuildingType.TownHall && b.completed && b.occupants.length > 0) {
      staffedTownHalls.push(b);
    }
  }

  // Residences and leisure-venue pools are frame-constant (only the daily layer completes
  // buildings), so build each lazily on first use and reuse it for the rest of the tick.
  let playerResidences: Building[] | undefined;
  const playerResidencesFor = (): Building[] =>
    (playerResidences ??= updatedBuildings.filter(isResidenceBuilding));
  const completedPoolByKey = new Map<string, Building[]>();
  const completedPoolOf = (types: readonly BuildingType[]): Building[] => {
    const key = types.join(',');
    let pool = completedPoolByKey.get(key);
    if (pool === undefined) {
      pool = updatedBuildings.filter(
        (b) => b.completed && types.includes(b.type),
      );
      completedPoolByKey.set(key, pool);
    }
    return pool;
  };

  const chatHints = chatHintsFromWorld({
    season,
    weather: state.weather,
    festivalActive: state.festival?.active,
    food: state.resources.food,
  });

  // All partner lookups share the live-settler predicate; chat callers require null on a miss.
  const resolveChatPartner = (id: number): Entity | null => livingHumanAt(id) ?? null;

  const settlerChat = (
    entity: Entity,
    context: HumanChatContext,
    chance: number,
    partner: Entity | null = null,
  ) => maybeDialogueChat(entity, partner, context, state.tick, chance, chatHints);

  const settlerPairChat = (
    entityA: Entity,
    entityB: Entity,
    context: HumanChatContext,
    chance: number,
  ) => simSettlerPairChat(entityA, entityB, context, chance, state.tick, chatHints);

  const ambientChatNeighbors = (self: Entity): Entity[] =>
    simAmbientChatNeighbors(self, state.tick, humanSocialGrid, allHumans, width, height);

  const schoolAssignments = syncSchoolAssignments(allHumans, updatedBuildings, isNewCalendarDay, config.speed);

  // A school day needs its teacher in the classroom too: sample that presence once for the tick.
  const schoolsWithTeacherPresent = new Set<number>();
  for (const school of findStaffedSchools(updatedBuildings)) {
    if (hasTeacherPresent(school, entityById)) schoolsWithTeacherPresent.add(school.id);
  }

  // Only the building half of the camp anchor is tick-stable: entities move in this loop, so the
  // settler half is always re-read. `null` means no hall and no house; `undefined` means unresolved.
  let buildingCampAnchor: { x: number; y: number } | null | undefined;
  const getCampAnchor = (): { x: number; y: number } => {
    if (buildingCampAnchor === undefined) {
      buildingCampAnchor = getPlayerCampCenterFromBuildings(updatedBuildings);
    }
    return buildingCampAnchor ?? getPlayerSettlerCenter(state);
  };

  const advancePregnancy = (entity: Entity, conceivedToday: boolean): void => {
    if (
      entity.alive &&
      isPlayerHuman(entity) &&
      entity.gender === 'female' &&
      entity.pregnant &&
      !conceivedToday
    ) {
      tickPregnancyAndBirth(state, ctx, entity, { livingHumanAt });
    }
  };

  // Lodging runs for every settler each tick; build the hotel list and bed counts once so a
  // candidate hotel never rescans every entity for each settler.
  const hotelLodging = createHotelLodgingIndex(updatedBuildings, allHumans, buildingById, entityById);
  // Ceremony seats are the same id-sorted ranks for every settler; build them once per tick.
  const ceremonySeats = state.electionCeremony ? buildCeremonySeatIndex(state) : undefined;

  // The festival square is a tick-stable fact, indexed once rather than per settler.
  const festivalSquare = updatedBuildings.find(
    (b) => b.type === BuildingType.Square && b.completed,
  );

  // Observe both lovers before any actor can clear or replace their indoor presence.
  const overnightTrystIds = new Set<number>();
  for (const human of allHumans) {
    if (human.affairPartnerId == null || human.indoorBuildingId == null) continue;
    if (!isNightHour(hourOfDay) && (human.needs?.sleepRecoveryUntilTick ?? 0) <= state.tick) continue;
    const lover = entityById.get(human.affairPartnerId);
    if (!lover?.alive || !isSettlerRelationshipEntity(lover) || !hasAffairPartner(human, entityById)) continue;
    const site = getAffairTrystBuilding(human, lover, entityById, buildingById);
    if (site && human.indoorBuildingId === site.id && lover.indoorBuildingId === site.id
      && isValidAffairTrystSite(human, lover, entityById, buildingById, 55, hourOfDay)) {
      overnightTrystIds.add(human.id);
    }
  }

  for (const entity of allHumans) {
    if (!entity.alive) continue;
    const previousIndoorBuildingId = entity.indoorBuildingId;
    entity.indoorBuildingId = undefined;
    reconcileAffairPartner(entity, entityById);

    // Common updates
    if (isNewCalendarDay) {
      if (entity.age < HUMAN_ADULT_MIN_AGE && isPlayerHuman(entity)) {
        creditChildSchoolDay(entity);
      }
      syncHumanAgeFromCalendar(entity, state);
    }

    entity.flash = Math.max(0, entity.flash - 1);
    if (entity.combatTicks && entity.combatTicks > 0) {
      entity.combatTicks--;
      if (entity.combatTicks <= 0) entity.combatTicks = 0;
    }
    // Children cannot pursue prey, including stale targets carried by old saves.
    if (entity.age < HUMAN_ADULT_MIN_AGE) {
      entity.huntTargetId = undefined;
    } else if (entity.huntTargetId) {
      const prey = entityById.get(entity.huntTargetId);
      if (!prey?.alive) entity.huntTargetId = undefined;
    }

    if (isNewCalendarDay && tryDailyHumanMortality(state, entity, updatedBuildings, entityById, mortalityMultiplier)) {
      syncEntityGrids(ctx, entity);
      continue;
    }

    const isPrisoner = entity.prisonBuildingId != null;

    entity.reproductionCooldown = Math.max(0, entity.reproductionCooldown - 1);
    if (entity.gender && entity.relationshipStatus === undefined) {
      entity.relationshipStatus = 'single';
    }

    let conceivedToday = false;
    if (isNewCalendarDay && !isPrisoner && isPlayerHuman(entity)) {
      conceivedToday = tryDailyConception(state, ctx, entity);
      tryDailyAmicableDivorce(state, entity, entityById, updatedBuildings, playerHumans);
    }

    tryGraduateHumanChild(entity, config.size, config.speed, (e) => {
      if (isPlayerHuman(e)) applyEducationGraduation(state, e);
    });

    const schoolTarget = schoolAssignments.get(entity.id);

    if (schoolTarget) {
      // Schoolyard rumours and new bonds run once per day at noon, when an awake child is at school.
      if (
        hourOfDay === 12 &&
        isSchoolTime(state.tick, hourOfDay) &&
        isChildAtSchool(entity, schoolTarget) &&
        schoolsWithTeacherPresent.has(schoolTarget.id) &&
        isStartOfClockHour(state.tick) &&
        !isAsleepAtHome(entity, buildingById, hourOfDay)
      ) {
        trySchoolyardGossip(state, entity, entityById, updatedBuildings, playerHumans);
        tryFormSchoolyardBond(state, entity);
      }
    }

    const regularWorkplace = findHumanWorkplace(entity, updatedBuildings, workplaceOpts);
    const apprenticeSite = regularWorkplace ? null : getApprenticeTrainingSite(entity, entityById, buildingById);
    const workplace = regularWorkplace ?? apprenticeSite ?? undefined;
    const isInnkeeper =
      entity.job === JobType.Innkeeper && workplace?.type === BuildingType.Tavern && workplace.completed;

    const shift = resolveShift(state, entity, workplace, hourOfDay);
    const isHospitalDoctor = entity.job === JobType.Doctor
      && workplace?.type === BuildingType.Hospital && workplace.completed;
    const onHospitalShift = isHospitalDoctor && shift.onShift;
    const hospitalCommuteDue = !!(isHospitalDoctor && isHospitalDoctorCommuteTime(
      workplace,
      state.tick,
      entity.id,
      commuteLeadHoursFor(commuteDistanceToBuilding(entity, workplace), config.speed),
    ));
    const onSchoolShift = schoolTarget != null && isSchoolTime(state.tick, hourOfDay);
    const schoolResidence = entity.residenceBuildingId == null
      ? undefined : buildingById.get(entity.residenceBuildingId);
    const schoolQuote = schoolTarget
      ? quoteBuildingCommute(schoolResidence ?? entity, schoolTarget, config.speed)
      : null;
    // Existing pupils depart conservatively while new route evidence is pending.
    const schoolLeadHours = schoolQuote?.status === 'priced'
      ? Math.min(MAX_ASSIGNABLE_COMMUTE_HOURS, Math.ceil(schoolQuote.leadHours))
      : schoolTarget ? MAX_ASSIGNABLE_COMMUTE_HOURS : 0;
    const schoolCommuteDue = schoolTarget != null && isWorkDay(state.tick)
      && hourOfDay >= SCHOOL_START_HOUR - schoolLeadHours && hourOfDay < SCHOOL_START_HOUR;
    const onDayJobShift = (goWorkTime && shift.next.kind === 'day' && shift.onShift) || onSchoolShift;
    const venueWorkerIndex = workplace ? workplace.occupants.indexOf(entity.id) : -1;
    const onTavernShift = isInnkeeper && shift.onShift;
    const isHotelier =
      entity.job === JobType.Hotelier && workplace?.type === BuildingType.Hotel && workplace.completed;
    const onHotelShift = isHotelier && shift.onShift;
    const onMoonPriestShift = shift.moonPriestDuty === true;
    const isPrisonGuardAtPost =
      entity.job === JobType.PrisonGuard && workplace?.type === BuildingType.Prison && workplace.completed;
    const prisonDuty = shift.prisonDuty ?? null;
    const prisonShift = prisonDuty?.shift ?? null;
    const onPrisonShift = prisonDuty?.onShift === true;
    const prisonShiftStartHour = prisonShift?.startHour ?? workSchedule.startHour;
    // Absolute shift starts preserve last night's watch through midnight and let a new
    // week's morning guard depart on Sunday. Quoted detours use the same commute owner
    // as work/school, rather than planning an unrealistically short straight-line walk.
    const previousPrisonCommute = prisonGuardCommuteStarted.get(entity);
    const alreadyDeparted = previousPrisonCommute != null
      && previousPrisonCommute.prisonId === workplace?.id
      && previousPrisonCommute.shiftStartTick === prisonDuty?.startTick;
    const prisonRoute = workplace && prisonDuty && !onPrisonShift && !alreadyDeparted
      ? quoteBuildingCommute(entity, workplace, config.speed) : null;
    const estimatedPrisonHours = prisonRoute?.status === 'priced'
      ? prisonRoute.leadHours
      : workplace ? commuteLeadHoursFor(commuteDistanceToBuilding(entity, workplace), config.speed) : 0;
    // The route quote assumes full rush speed, but the final building approach eases
    // to a walking pace. Leave two hours for that approach and minor route detours:
    // the replacement must reach the post before its own start, not rely on overlap.
    const prisonCommuteLeadHours = Math.min(MAX_COMMUTE_LEAD_HOURS, estimatedPrisonHours + 2);
    const prisonCommuteDue = prisonDuty != null && (
      onPrisonShift || alreadyDeparted
      || (state.tick < prisonDuty.startTick
        && state.tick >= prisonDuty.startTick - prisonCommuteLeadHours * TICKS_PER_HOUR)
    );
    if (!prisonCommuteDue || onPrisonShift || prisonDuty == null) {
      prisonGuardCommuteStarted.delete(entity);
    } else if (workplace) {
      prisonGuardCommuteStarted.set(entity, {
        prisonId: workplace.id, shiftStartTick: prisonDuty.startTick,
      });
    }

    // Duty owns the next bedtime: finish sleeping before the commute, not at shift start.
    let nextShiftStartTick: number | null = null;
    const todayStartTick = getAbsoluteCalendarDay(state.tick) * TICKS_PER_DAY;
    if (isPrisonGuardAtPost) {
      if (prisonDuty && !prisonDuty.onShift && prisonDuty.startTick > state.tick) {
        nextShiftStartTick = prisonDuty.startTick;
      }
    } else if (isHospitalDoctor && workplace) {
      // A midnight doctor shift belongs to tomorrow's roster even tonight.
      for (let dayOffset = 0; dayOffset < 2; dayOffset++) {
        const dayStartTick = todayStartTick + dayOffset * TICKS_PER_DAY;
        const shift = doctorHospitalShift(workplace, dayStartTick, entity.id);
        const start = shift && dayStartTick + shift.startHour * TICKS_PER_HOUR;
        if (start != null && start > state.tick) { nextShiftStartTick = start; break; }
      }
    } else if ((isInnkeeper || isHotelier) && workplace && venueWorkerIndex >= 0) {
      const todayStart = todayStartTick + shift.next.hour * TICKS_PER_HOUR;
      nextShiftStartTick = todayStart > state.tick ? todayStart : todayStart + TICKS_PER_DAY;
    } else if (workplace?.completed && isPlayerHuman(entity)) {
      for (let dayOffset = 0; dayOffset < 8; dayOffset++) {
        const start = todayStartTick + dayOffset * TICKS_PER_DAY
          + workSchedule.startHour * TICKS_PER_HOUR;
        if (start > state.tick && isWorkDay(start)) { nextShiftStartTick = start; break; }
      }
    }
    const residenceForSleep = entity.residenceBuildingId == null
      ? undefined : buildingById.get(entity.residenceBuildingId);
    const distanceFromHome = workplace
      ? commuteDistanceFromResidence(entity, residenceForSleep, workplace) : 0;
    const scheduledCommuteHours = workplace
      ? Math.min(MAX_ASSIGNABLE_COMMUTE_HOURS,
        Math.max(commuteLeadHoursFor(distanceFromHome, config.speed),
          isPrisonGuardAtPost ? estimatedPrisonHours : 0))
        + (isPrisonGuardAtPost ? 0.5 : 0) : 0;
    // Children have a mandatory home/sleep window even without a workplace. School commute
    // is still protected by the existing duty gates below.
    const childBedtime = isPlayerHuman(entity) && entity.age < HUMAN_ADULT_MIN_AGE;
    const childWakeTick = todayStartTick + (hourOfDay >= 6 ? TICKS_PER_DAY : 0) + 6 * TICKS_PER_HOUR;
    const preShiftSleep = childBedtime
      ? preShiftSleepPlan(state.tick, childWakeTick, 0)
      : preShiftSleepPlan(state.tick, nextShiftStartTick, scheduledCommuteHours);

    // Attendance is a schedule fact, not a viewport one: crediting it above the off-screen throttle
    // is what stops a workplace's output from tracking where the camera happens to be.
    const onJobShift = shift.onShift || onSchoolShift;
    const commuteStartHour = isPrisonGuardAtPost ? prisonShiftStartHour : workSchedule.startHour;
    const commuteLeadHours = workplace
      ? commuteLeadHoursFor(commuteDistanceToBuilding(entity, workplace), config.speed)
      : 0;
    const venueWork = (isInnkeeper || isHotelier) && workplace != null;
    const venueCommuteDue = venueWork && nextShiftStartTick != null
      && state.tick >= nextShiftStartTick - commuteLeadHours * TICKS_PER_HOUR;
    const workCommuteDue = venueWork ? onTavernShift || onHotelShift || venueCommuteDue
      : isHospitalDoctor ? hospitalCommuteDue || onHospitalShift
      : isPrisonGuardAtPost ? prisonCommuteDue : workplace != null
        && isWorkDay(state.tick)
        && (goWorkTime || onWorkCommuteHours
          || isWithinWorkCommuteLead(state.tick, commuteStartHour, commuteLeadHours));

    // Work wins over revelry: the festival gathering is the free-time case (see `isFestivalGatherer`).
    const recoveringSleep = (entity.needs?.sleepRecoveryUntilTick ?? 0) > state.tick;
    const festivalGathering = isFestivalGatherer(
      hourOfDay,
      state.festival?.active,
      onJobShift || workCommuteDue || hospitalCommuteDue || prisonCommuteDue || schoolCommuteDue
        || preShiftSleep.headHome || recoveringSleep,
      isInnkeeper,
    );
    const atPost = workplace != null && isAtBuildingReach(entity, workplace);
    const wasInsideWorkplace = workplace != null && previousIndoorBuildingId === workplace.id;
    // Hunters work away from the spot; every other scheduled trade must be at its post or inside it.
    const hunterInField = entity.job === JobType.Hunter && entity.huntTargetId != null;
    // Pregnancy hospital priority outranks the shift: the settler still owes the duty hours, but
    // standing at a post they are leaving is not verified work.
    const goingToHospital = isPregnancyHospitalPriority(entity, staffedHospitals.length > 0);
    if (isPlayerHuman(entity) && !entity.raidDeploymentId && (onJobShift)) {
      // A construction crew has no regular workerBuildingId. Its resolved workplace supplies
      // the witnessed site and trade through the existing attendance recorders.
      const attendedJob = apprenticeSite
        ? (BUILDING_JOB_TYPES[apprenticeSite.type] ?? JobType.Settler)
        : workplace && !workplace.completed
          ? (BUILDING_JOB_TYPES[workplace.type] ?? JobType.Builder)
          : (entity.job ?? null);
      recordScheduleWorkTick(entity, 1, workplace?.id, attendedJob);
      if (!goingToHospital && (atPost || wasInsideWorkplace || hunterInField)) {
        recordPresentWorkTick(entity, 1, workplace?.id);
      }
    }


    const inFocus = !focus || isInFocus(entity, focus);
    // An off-screen employee must leave the interior at shift end immediately, not wait
    // up to a full decision-throttle interval before appearing outside again.
    const leavingWork = workplace != null && previousIndoorBuildingId === workplace.id
      && !onJobShift;
    const active =
      !isPrisoner &&
      (spotlightActorIds?.has(entity.id) || inFocus || leavingWork ||
        ((recoveringSleep || preShiftSleep.headHome) && !onJobShift) ||
        (entity.needs?.breakUntilRecovered === true && !onJobShift) ||
        hospitalCommuteDue ||
        schoolCommuteDue || onSchoolShift ||
        prisonCommuteDue ||
        entity.pregnant ||
        (isStartOfClockHour(state.tick) && hourOfDay === affairEncounterHourOfDay(entity.id, state.tick)) ||
        hasAffairPartner(entity, entityById) ||
        (entity.affairProgress ?? 0) >= 20 ||
        (state.tick + entity.id) % OFFSCREEN_HUMAN_THROTTLE === 0);

    // A ceremony holds its **attendees**, not the whole village: the owner's *"they again in a circle"*
    // was a thousand settlers sharing sixty ring slots. Everyone else keeps their day.
    const inElectionCeremony =
      !onJobShift && !workCommuteDue && !schoolCommuteDue && !goingToHospital &&
      !prisonCommuteDue && !preShiftSleep.headHome && !recoveringSleep && state.electionCeremony != null && isPlayerHuman(entity) && isCeremonyAttendee(state, entity.id, ceremonySeats);
    // Only the selected actors receive exclusive gathering movement; everyone else
    // keeps the normal commute, social and work priority rules.
    const inSpotlightGathering = spotlightActorIds?.has(entity.id) === true
      && !onJobShift && !workCommuteDue && !schoolCommuteDue && !goingToHospital
      && !preShiftSleep.headHome && !recoveringSleep;

    const onDutyForSleep = onJobShift || workCommuteDue
      || schoolCommuteDue || hospitalCommuteDue || prisonCommuteDue;
    const sleep = observeHumanSleep(entity, {
      hourOfDay, previousIndoorBuildingId, onDuty: onDutyForSleep, recoveringSleep,
      scheduledSleep: preShiftSleep.sleep, overrideNightSleep: preShiftSleep.overrideNight,
      hotels: hotelLodging.hotels, buildingById, overnightTrystIds, tick: state.tick,
    });
    const sleepingForNeeds = sleep.sleeping;
    const courtshipPresence = {
      sleeping: sleepingForNeeds,
      onDuty: onJobShift,
      workplaceId: workplace?.id,
      atWorkplace: atPost || wasInsideWorkplace,
      socialTime: false,
      contactOnly: false,
    };
    let ateMeal = false;
    if (isPlayerHuman(entity)) {
      advanceHumanNeeds(entity, {
        tick: state.tick, sleeping: sleepingForNeeds,
        working: !entity.raidDeploymentId
          && (onJobShift)
          && (entity.workerBuildingId != null || apprenticeSite != null),
        nightDuty: !entity.raidDeploymentId
          && (onJobShift) && isNightHour(hourOfDay),
        // The on-map body is frozen during deployment, but the war-band marches by day.
        // Price it as normal movement, not a fictional local work shift.
        moving: entity.raidDeploymentId
          ? !sleepingForNeeds && hourOfDay >= 8 && hourOfDay < 17
          : Math.hypot(entity.vx, entity.vy) > 0.1,
        // The needs break is a real off-duty stationary pause, not all idle leisure.
        resting: entity.needs?.breakUntilRecovered === true
          && !onDutyForSleep && !goingToHospital && !inSpotlightGathering
          && !inElectionCeremony && !festivalGathering && !entity.raidDeploymentId
          && Math.hypot(entity.vx, entity.vy) <= 0.1,
        hasWell: hasNearbyWell(entity, nearbyWells),
        hasHospital: sleep.hasHospital,
        unheatedWinter: isWinter && !canHeat,
      });
      // Only the scheduled clock-hour pulse attempts a meal; the meal owner owns eligibility.
      if (isStartOfClockHour(state.tick) && (!sleepingForNeeds || sleep.hasHospital)) {
        ateMeal = tryEatColonyMeal(entity, state);
      }
      if (hasFatalStarvation(entity)) {
        killFromStarvation(entity, state, updatedBuildings, entityById);
        syncEntityGrids(ctx, entity);
        continue;
      }
    }

    if (isPrisoner) {
      clearHumanWalkTarget(entity);
      entity.vx = 0;
      entity.vy = 0;
      const prison = buildingById.get(entity.prisonBuildingId!);
      if (prison) {
        const door = buildingAccessPoint(prison);
        if (previousIndoorBuildingId === prison.id || isAtBuildingReach(entity, prison)) {
          enterHumanBuilding(entity, prison);
          entity.x = prison.x;
          entity.y = prison.y;
        } else {
          // The cell door is outside the walls; route around them instead of into them.
          steerHumanToward(entity, door.x, door.y, 1.2, 1, `prison_${prison.id}_${entity.id}`);
        }
      }
      integrateHumanWalk(entity, width, height, false);
      tickHumanChat(entity, resolveChatPartner);
      advancePregnancy(entity, conceivedToday);
      syncEntityGrids(ctx, entity);
      continue;
    }

    if (entity.raidDeploymentId) {
      entity.vx = 0;
      entity.vy = 0;
      advancePregnancy(entity, conceivedToday);
      syncEntityGrids(ctx, entity);
      continue;
    }

    // Verified sleep suppresses ambient speech; scripted dialogue remains owned by the dialogue tree.
    tickHumanChat(entity, resolveChatPartner);
    if (sleepingForNeeds) endAmbientHumanChat(entity);

    if (
      active &&
      !sleepingForNeeds &&
      isPlayerHuman(entity) &&
      !entity.faction &&
      (entity.chatTicks ?? 0) <= 0 &&
      isSocialStaggerTick(entity, state.tick)
    ) {
      const expectantSpouse = entity.partnerId == null ? null : resolveChatPartner(entity.partnerId);
      tryAmbientRandomDialogue(
        entity,
        () => ambientChatNeighbors(entity),
        state.tick,
        0.036 * PER_TICK_RATE_SCALE,
        chatHints,
        {
          pregnant: !!entity.pregnant,
          expectingPartner: Boolean(expectantSpouse?.pregnant && expectantSpouse.partnerId === entity.id),
          renffr: isRenffrGossipActive(state),
          workHour: goWorkTime,
          night: prefersHomeTonightFor(workSchedule, entity.id, state.tick, hourOfDay),
        },
      );
    }

    // A crew larger than three shifts takes days off in turn; a resting guard is off the colony work
    // day and must not still walk to the prison.
    const offDutyPrisonGuard = isPrisonGuardAtPost && prisonShift == null;

    // A resting settler takes an actual off-duty pause, not merely a status label.
    // On-duty and emergency movement remain owned by their existing systems.
    const takingNeedsBreak = isPlayerHuman(entity) && !onJobShift &&
      !workCommuteDue && !hospitalCommuteDue && !prisonCommuteDue && !schoolCommuteDue &&
      resolveHumanNeedsIntent(entity, state.tick, sleepingForNeeds, false) === 'takeBreak';


    const stayIn =
      !goingToHospital &&
      !inSpotlightGathering &&
      !festivalGathering &&
      !onJobShift &&
      !workCommuteDue &&
      (preShiftSleep.headHome
        || (!preShiftSleep.overrideNight && prefersHomeTonightFor(workSchedule, entity.id, state.tick, hourOfDay))
        || (recoveringSleep && !onJobShift));

    const socialTime = !goingToHospital && !inSpotlightGathering && !inElectionCeremony
      && !onDutyForSleep && !takingNeedsBreak && !sleepingForNeeds && !recoveringSleep;
    const allowFreeRoam = socialTime && (festivalGathering || !stayIn);

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

    // The festival destination is shared by the readiness and movement decisions.
    const festivalStand = festivalGathering ? crowdGatherPosition(
      festivalSquare ? festivalSquare.x + festivalSquare.width / 2 : (staffedTownHalls[entity.id % staffedTownHalls.length]?.x ?? width * 0.5),
      festivalSquare ? festivalSquare.y + festivalSquare.height / 2 : (staffedTownHalls[entity.id % staffedTownHalls.length]?.y ?? height * 0.5),
      entity.id,
    ) : undefined;
    const atFestival = festivalStand != null && Math.hypot(festivalStand.x - entity.x, festivalStand.y - entity.y) <= 18;
    const home = entity.residenceBuildingId == null ? undefined : buildingById.get(entity.residenceBuildingId);
    const homeLeisure = stayIn && !preShiftSleep.headHome && !recoveringSleep
      && (!hasResidenceAssignment(entity) || (!!home?.completed && isAtBuildingReach(entity, home)));
    const contactOnly = atFestival || homeLeisure;
    courtshipPresence.socialTime = socialTime && !takingNeedsBreak && (!stayIn || homeLeisure) && !inElectionCeremony
      && !workCommuteDue && !huntingWere && (!festivalGathering || atFestival);
    courtshipPresence.contactOnly = contactOnly;
    if (!goingToHospital && !inSpotlightGathering && !inElectionCeremony && !huntingWere) {
      courtshipReadiness.set(entity.id, courtshipPresence);
    } else {
      courtshipPresence.atWorkplace = false;
    }

    // A close established pair can advance on the later participant's tick,
    // even when that participant's normal offscreen decision is throttled.
    // Do not wake sleeping settlers or activate distant courtship searches.
    const closeCourtshipPartner = !active && entity.courtshipPartnerId != null
      ? entityById.get(entity.courtshipPartnerId) : undefined;
    const closeCourtshipPresence = closeCourtshipPartner
      ? courtshipReadiness.get(closeCourtshipPartner.id) : undefined;
    const closeCourtshipDue = !!closeCourtshipPartner && !!closeCourtshipPresence
      && closeCourtshipPartner.courtshipPartnerId === entity.id
      && courtshipReadiness.has(entity.id)
      && isEligibleToCourt(entity) && isEligibleToCourt(closeCourtshipPartner)
      && getHumanStaminaRatio(entity) * 100 > Relationship.COURTSHIP_MIN_STAMINA
      && getHumanStaminaRatio(closeCourtshipPartner) * 100 > Relationship.COURTSHIP_MIN_STAMINA
      && canAdvanceCourtship(courtshipPresence, closeCourtshipPresence,
        Math.hypot(closeCourtshipPartner.x - entity.x, closeCourtshipPartner.y - entity.y),
        courtshipPresence.socialTime && closeCourtshipPresence.socialTime);

    // School, sleep and other fixed obligations outrank voluntary child leisure,
    // even for children without a completed residence or off-screen decision tick.
    const childMandatoryActivity = entity.age < HUMAN_ADULT_MIN_AGE && (
      schoolCommuteDue || onSchoolShift || preShiftSleep.headHome
      || sleepingForNeeds || onDutyForSleep || recoveringSleep || takingNeedsBreak
      || goingToHospital || inSpotlightGathering || inElectionCeremony
      || festivalGathering || !allowFreeRoam
    );
    // Before the off-screen throttle, cancel invalid follow/play movement without a destination.
    // Preserve school, home, hospital, and emergency routes already selected.
    const orphanedChildLeisure = !active && childMandatoryActivity
      && entity.age < HUMAN_ADULT_MIN_AGE && !home?.completed
      && !schoolCommuteDue && !hospitalCommuteDue && !goingToHospital
      && !inSpotlightGathering && !inElectionCeremony && !festivalGathering && !huntingWere;
    if (entity.age < HUMAN_ADULT_MIN_AGE
      && (entity.childLeisureActivity === 'following' || orphanedChildLeisure)) {
      stopSupersededChildLeisure(
        state, entity, entityById, buildingById, hourOfDay,
        childMandatoryActivity, orphanedChildLeisure,
      );
    }

    if (!active && !closeCourtshipDue) {
      if (previousIndoorBuildingId != null && buildingById.get(previousIndoorBuildingId)?.completed) {
        entity.indoorBuildingId = previousIndoorBuildingId;
      }
      // The throttle rests the decisions, not the walk: the route the settler was already commanded
      // to take carries them at the same pace, so camera focus cannot change travel time.
      resumeHumanWalk(entity);
      integrateHumanWalk(entity, width, height);
      syncEntityGrids(ctx, entity);
      continue;
    }

    // A decision tick starts with no commanded walk: whatever it steers records the one walk a
    // throttled tick may resume, and a tick that only flees or stops leaves none behind.
    clearHumanWalkTarget(entity);

    // Trade-route merchants
    if (entity.faction === 'trade_caravan') {
      const target = getCaravanMoveTarget(state, entity);
      if (target) {
        steerHumanToward(
          entity, target.x, target.y, config.speed, target.speedMult, `caravan_${entity.id}`,
        );
        integrateHumanWalk(entity, width, height, false);
        tryAdvanceCaravanLeg(state, entity);
      }
      syncEntityGrids(ctx, entity);
      continue;
    }
    if (isWinter && !canHeat && isTick8) entity.flash = 5;

    let suppressIdle = false;
    let onSchedule = false;
    // A walk to work is priced at the undamped commute pace by `commuteLeadHoursFor`.
    let commuting = false;


    // Cross-map lodging: a walk home too long for the hours left before the sleep hour takes a
    // reserved hotel bed instead, including the time spent walking there.
    const lodgingHotel =
      stayIn &&
      !onJobShift &&
      !huntingWere &&
      !inElectionCeremony &&
      !inSpotlightGathering &&
      !festivalGathering &&
      hasResidenceAssignment(entity)
        ? lodgingHotelFor(entity, updatedBuildings, allHumans, state.tick, hotelLodging)
        : undefined;

    if (!lodgingHotel && isPlayerHuman(entity) && entity.hotelStayBuildingId != null) {
      hotelLodging.release(entity.hotelStayBuildingId);
      checkoutVisitor(entity);
    }

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
        faceVelocity(entity);
      } else if (workplace) {
        if (commuteHumanToBuilding(entity, workplace, config.speed, WORK_COMMUTE_RUSH)) enterHumanBuilding(entity, workplace);
      }
    } else if (huntingWere) {
      const fdx = entity.x - huntingWere.x;
      const fdy = entity.y - huntingWere.y;
      const fdist = Math.sqrt(fdx * fdx + fdy * fdy) || 1;
      const fleeMult = humanFleeMult * evaluateAptitudeInfluence(entity, 'escape').factor;
      entity.vx = (fdx / fdist) * config.speed * 1.6 * fleeMult;
      entity.vy = (fdy / fdist) * config.speed * 1.6 * fleeMult;
      faceVelocity(entity);
      suppressIdle = true;
      onSchedule = true;
      settlerChat(entity, 'fear', 0.14 * PER_TICK_RATE_SCALE);
    } else if (spotlightGather && inSpotlightGathering) {
      const target = getSpotlightGatherTarget(spotlightGather, entity.id);
      if (target) {
        const dx = target.x - entity.x;
        const dy = target.y - entity.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 9) {
          // Route steering writes velocity only; the normal human walk applies one collision-safe step.
          const route = steerWithPath(entity, target.x, target.y, config.speed * 1.2, `spotlight_${spotlightGather.id}_${entity.id}`);
          if (route === 'direct') {
            entity.vx = (dx / dist) * config.speed * 1.2;
            entity.vy = (dy / dist) * config.speed * 1.2;
            faceVelocity(entity);
          }
        } else {
          entity.vx = 0;
          entity.vy = 0;
        }
        suppressIdle = true;
        onSchedule = true;
      }
    } else if (inElectionCeremony && state.electionCeremony) {
      const target = getElectionGatherTarget(state, entity.id, ceremonySeats);
      const dist = Math.hypot(target.x - entity.x, target.y - entity.y);
      if (dist > 10) {
        steerHumanToward(entity, target.x, target.y, config.speed, 1.15,
          `election_${state.electionCeremony.electionId ?? 'gather'}_${entity.id}`);
      } else {
        entity.vx = 0;
        entity.vy = 0;
      }
      suppressIdle = true;
      onSchedule = true;
    } else if (festivalGathering) {
      const stand = festivalStand!;
      const dx = stand.x - entity.x;
      const dy = stand.y - entity.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist > 18) {
        steerHumanToward(entity, stand.x, stand.y, config.speed, 0.72,
          `festival_${entity.id}`);
      } else {
        entity.vx = deterministicSin(state.tick * 0.04 + entity.id) * config.speed * 0.12;
        entity.vy = deterministicCos(state.tick * 0.035 + entity.id) * config.speed * 0.12;
        settlerChat(entity, 'social', 0.12 * PER_TICK_RATE_SCALE);
      }
      suppressIdle = true;
      onSchedule = true;
    }

    // Home commute — or, for a settler the walk home would strand, the hotel bed instead.
    if (!huntingWere && !inElectionCeremony && !inSpotlightGathering && !festivalGathering && !onJobShift && !hospitalCommuteDue && !prisonCommuteDue && !schoolCommuteDue && stayIn && hasResidenceAssignment(entity)) {
      const residence = buildingById.get(entity.residenceBuildingId!);
      if (lodgingHotel) {
        if (commuteHumanToBuilding(entity, lodgingHotel, config.speed, WORK_COMMUTE_RUSH)) enterHumanBuilding(entity, lodgingHotel);
        commuting = true;
        onSchedule = true;
        suppressIdle = true;
      } else if (residence?.completed) {
        const arrived = commuteHumanToBuilding(entity, residence, config.speed, WORK_COMMUTE_RUSH);
        if (arrived) enterHumanBuilding(entity, residence);
        commuting = !arrived || !homeLeisure;
        onSchedule = true;
        suppressIdle = true;
      }
    } else if (
      hospitalCommuteDue && workplace &&
      !huntingWere && !inElectionCeremony && !inSpotlightGathering && !festivalGathering
    ) {
      // Doctors travel for their own shift, including the evening before a midnight duty; never pull
      // an off-duty doctor to the hospital merely because the village works.
      if (commuteHumanToBuilding(entity, workplace, config.speed, WORK_COMMUTE_RUSH)) enterHumanBuilding(entity, workplace);
      onSchedule = true;
      suppressIdle = true;
    } else if (
      !huntingWere &&
      !inElectionCeremony &&
      !inSpotlightGathering &&
      !festivalGathering &&
      goWorkTime &&
      workplace &&
      entity.job === JobType.Soldier &&
      isBarracksGuard(entity.id, entity.workerBuildingId, updatedBuildings)
    ) {
      const anchor = getCampAnchor();
      if (anchor) {
        const radius = 95 + (entity.id % 6) * 10;
        const angle = state.tick * 0.028 * PER_TICK_RATE_SCALE + entity.id * 2.1;
        const tx = anchor.x + deterministicCos(angle) * radius;
        const ty = anchor.y + deterministicSin(angle) * radius * 0.55;
        steerHumanToward(entity,
          (Math.floor(tx / PATH_CELL) + 0.5) * PATH_CELL,
          (Math.floor(ty / PATH_CELL) + 0.5) * PATH_CELL,
          config.speed, 0.65, `patrol_${entity.id}`);
        onSchedule = true;
        suppressIdle = true;
      } else if (workplace) {
        if (commuteHumanToBuilding(entity, workplace, config.speed, WORK_COMMUTE_RUSH)) enterHumanBuilding(entity, workplace);
        onSchedule = true;
        suppressIdle = true;
      }
    } else if (!huntingWere && !inElectionCeremony && !inSpotlightGathering && !festivalGathering && (onSchoolShift || schoolCommuteDue) && !isInnkeeper && schoolTarget) {
      if (commuteHumanToBuilding(entity, schoolTarget, config.speed, WORK_COMMUTE_RUSH)) enterHumanBuilding(entity, schoolTarget);
      commuting = true;
      onSchedule = true;
      suppressIdle = true;
      recordChildSchoolTick(
        entity,
        schoolTarget,
        hourOfDay,
        schoolsWithTeacherPresent.has(schoolTarget.id),
        state.tick,
      );
    } else if (
      tickTavernService({
        entity,
        workplace,
        onTavernShift: onTavernShift || (isInnkeeper && venueCommuteDue),
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
    } else if (
      !huntingWere &&
      !inElectionCeremony &&
      !inSpotlightGathering &&
      !festivalGathering &&
      (goWorkTime || onWorkCommuteHours) &&
      workplace?.type === BuildingType.HuntingSpot &&
      entity.age >= HUMAN_ADULT_MIN_AGE &&
      isHuntingSpotHunter(workplace, entity, entityById)
    ) {
      /**
       * The move-to-prey order: the Hunting Spot's hunter walks to the animal the spot is committed to
       * shoot and holds beside it, because a contact-distance reach takes nothing from the post.
       */
      const spotPrey = huntingSpotTarget(workplace, entity, entityById, byType, wildlifePreserves);
      const chase = spotPrey ? huntingSpotChaseTarget(workplace, entity, entityById, byType, wildlifePreserves) : null;
      // Who is after what: the map's dashed hunt line and the prey's flee rule both read this field.
      entity.huntTargetId = spotPrey ? spotPrey.id : undefined;
      if (chase) {
        // Aim where the animal is going, not where it is (`huntingPursuitPoint`), at a pace that can
        // actually close: prey do not flee, but they wander faster than a damped working walk.
        const aim = huntingPursuitPoint(chase);
        steerHumanToward(entity, aim.x, aim.y, config.speed * HUNTING_PURSUIT_SPEED_MULT, 1,
          `hunt_${entity.id}_${chase.id}`);
      } else if (spotPrey) {
        // Beside the animal, or waiting for the shot: hold, because walking back to the post would open
        // the gap the contact reach needs.
        entity.vx = 0;
        entity.vy = 0;
      } else {
        // Nothing in sight: wait at the post like every other worker.
        if (commuteHumanToBuilding(entity, workplace, config.speed, WORK_COMMUTE_RUSH)) enterHumanBuilding(entity, workplace);
      }
      onSchedule = true;
      suppressIdle = true;
    } else if (
      !huntingWere &&
      !inElectionCeremony &&
      !inSpotlightGathering &&
      !festivalGathering &&
      !offDutyPrisonGuard &&
      (workCommuteDue || prisonShift != null) &&
      !isInnkeeper &&
      !isHospitalDoctor &&
      workplace
    ) {
      // A prison guard works his roster shift and nothing else: the colony window is not his day, so
      // `goWorkTime` must not put a resting guard back on the post he is taking the day off from.
      const wantsToWork = isPrisonGuardAtPost
        ? prisonShift != null && (onPrisonShift || prisonCommuteDue)
        : workCommuteDue;
      if (wantsToWork) {
        if (commuteHumanToBuilding(entity, workplace, config.speed, WORK_COMMUTE_RUSH)) {
          // Hide stationary outdoor workers only during their shift.
          // Hunters and patrolling soldiers remain visible and mobile.
          // Apprentices stay visible outside their mentor's workplace rather than vanishing into it.
          if (!apprenticeSite) enterHumanBuilding(entity, workplace, onJobShift);
        }
        commuting = true;
        onSchedule = true;
        suppressIdle = true;
      }
    }

    // A commute is paced by `commuteLeadHoursFor` at the full WORK_COMMUTE_RUSH; damping it after
    // planning makes that prediction optimistic and leaves the post empty at shift start.
    if (!commuting && !inSpotlightGathering && !allowFreeRoam && onSchedule && !huntingWere && !prisonCommuteDue) {
      entity.vx *= 0.85;
      entity.vy *= 0.85;
    }

    const huntingSuppressIdle = inSpotlightGathering
      ? suppressIdle
      : tickHumanHunting(
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
      wildlifePreserves,
    );
    suppressIdle = huntingSuppressIdle;
    // Do not advertise leisure availability while another movement owner is active.
    courtshipPresence.socialTime = courtshipPresence.socialTime && (!suppressIdle || contactOnly) && !commuting && !huntingWere;

    advancePregnancy(entity, conceivedToday);

    const atHome = shouldBeAtHomeFor(workSchedule, hourOfDay) && isNearResidence(entity, buildingById);

    // Evening out
    if (
      socialTime &&
      allowFreeRoam &&
      isEligibleToCourt(entity) &&
      entity.courtshipPartnerId == null &&
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
        // Somewhere real to be: `idleDestination` picks home, a venue or a pretty spot.
        const dest = idleDestination(state, entity, idleVenues, buildingById);
        const tx = dest.x;
        const ty = dest.y;
        const edist = Math.hypot(tx - entity.x, ty - entity.y);
        if (edist > 12) {
          steerHumanToward(entity, tx, ty, config.speed, 0.45, `evening_${entity.id}`);
          suppressIdle = true;
        }
      }
    }

    // Courtship: only two observed, awake people may interact. An on-duty pair may
    // progress only if both are actually at their *same* workplace and within 10 px.
    // Other workers do not abandon their jobs to chase dates.
    if (!sleepingForNeeds && (((!suppressIdle || contactOnly) && courtshipPresence.socialTime) || courtshipPresence.onDuty) &&
      isEligibleToCourt(entity) && entity.gender &&
      getHumanStaminaRatio(entity) * 100 > Relationship.COURTSHIP_MIN_STAMINA) {
      // Never stop an unobserved partner's movement: they might be asleep,
      // working, exhausted, or otherwise unavailable. The pair's actual
      // close-contact branch below owns stopping only after both are observed.
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
        state.tick,
        entityById,
        (candidate) => {
          const presence = courtshipReadiness.get(candidate.id);
          if (!presence || presence.sleeping || getHumanStaminaRatio(candidate) * 100 <= Relationship.COURTSHIP_MIN_STAMINA) return false;
          if (courtshipPresence.onDuty || presence.onDuty) {
            return canAdvanceCourtship(courtshipPresence, presence, Math.hypot(candidate.x - entity.x, candidate.y - entity.y), socialTime);
          }
          return courtshipPresence.socialTime && presence.socialTime
            && (!(contactOnly || presence.contactOnly) || Math.hypot(candidate.x - entity.x, candidate.y - entity.y) <= 10);
        },
      );

      // A candidate that has not been ticked yet may still be asleep. Wait for
      // that person's own sleep observation, instead of inventing one here.
      const otherPresence = closest && courtshipReadiness.get(closest.id);
      // Eligibility must be symmetric: a well-rested caller cannot advance a tired partner.
      if (closest && otherPresence && !otherPresence.sleeping &&
        getHumanStaminaRatio(closest) * 100 > Relationship.COURTSHIP_MIN_STAMINA) {
        const dx = closest.x - entity.x;
        const dy = closest.y - entity.y;
        const dist = Math.hypot(dx, dy);
        const livingTogether = atHome && shareResidence(entity, closest)
          && isNearResidence(closest, buildingById);
        const closeEnough = dist <= 10;

        if (!closeEnough) {
          if (!courtshipPresence.onDuty && !otherPresence.onDuty && !contactOnly && !otherPresence.contactOnly && courtshipPresence.socialTime && otherPresence.socialTime) {
            // Keep established dates stable, but do not lock two strangers into an
            // exclusive relationship until they actually meet. An unreachable route
            // must not create a permanent zero-progress courtship.
            // Binding remains owned by the close-contact branch below.
            const chaseSpeed = atHome ? 0.35 : 0.45;
            steerHumanToward(entity, closest.x, closest.y, config.speed, chaseSpeed,
              `courtship_${entity.id}_${closest.id}`);
            suppressIdle = true;
          }
        } else if (canAdvanceCourtship(courtshipPresence, otherPresence, dist, courtshipPresence.socialTime && otherPresence.socialTime)) {
          // Leisure dates stop at contact instead of resuming an old walk target.
          // Coworkers keep their work movement and attendance untouched.
          if (!courtshipPresence.onDuty && !otherPresence.onDuty && !contactOnly && !otherPresence.contactOnly) {
            entity.vx = 0;
            entity.vy = 0;
            clearHumanWalkTarget(entity);
            // The observed partner has already integrated this tick.
            // Stop its residual leisure route, without moving it a second time.
            closest.vx = 0;
            closest.vy = 0;
            clearHumanWalkTarget(closest);
            suppressIdle = true;
          }
          // The relationship owner decides how a pair is bound (new partner → progress starts at zero).
          bindCourtship(entity, closest);

          // Either partner may be processed second. Credit this pair at most once
          // this tick, irrespective of entity iteration order or ID.
          // Fully progressed pairs (including loaded saves) need the marriage
          // transition, not another aptitude calculation, dialogue or heart roll.
          if (((entity.courtshipProgress ?? 0) < 100 || (closest.courtshipProgress ?? 0) < 100)
            && !advancedCourtshipIds.has(entity.id) && !advancedCourtshipIds.has(closest.id)) {
            advancedCourtshipIds.add(entity.id);
            advancedCourtshipIds.add(closest.id);

            // A stable speaker and seed make dialogue independent of which partner was processed last.
            const speaker = entity.id < closest.id ? entity : closest;
            const listener = speaker === entity ? closest : entity;
            if (seededRandomForRun(`chat-court1:${speaker.id}:${state.tick}`) < 0.4 * PER_TICK_RATE_SCALE) {
              settlerPairChat(speaker, listener, 'courtship', 0.85);
            } else if (seededRandomForRun(`chat-court2:${speaker.id}:${state.tick}`) < 0.5 * PER_TICK_RATE_SCALE) {
              settlerPairChat(speaker, listener, 'courtship', 0.1);
            }

            // Symmetric pair rule: both people's courtship aptitudes average into one rate.
            const courtshipFactor = combinePairFactors(
              evaluateAptitudeInfluence(entity, 'courtship').factor,
              evaluateAptitudeInfluence(closest, 'courtship').factor,
            );
            const courtRate =
              courtshipRatePerHour(!courtshipPresence.onDuty && !otherPresence.onDuty) *
              (state.festival?.active ? 2 : 1) *
              (livingTogether ? 1.5 : 1) *
              courtshipFactor *
              PER_TICK_RATE_SCALE;

            entity.courtshipProgress = Math.min(100, (entity.courtshipProgress || 0) + courtRate);
            closest.courtshipProgress = Math.min(100, (closest.courtshipProgress || 0) + courtRate);

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
          }
          tryCompleteCourtshipMarriage(
            state,
            entity,
            closest,
            playerResidencesFor(),
            playerHumans,
          );
        }
      }
    }

    // A free-time spouse approach must never replace a home/hotel commute or an exhausted
    // settler's recovery break, even when the ordinary social window is still open.
    if (
      !onJobShift && !onSchedule && !commuting && !stayIn && !takingNeedsBreak &&
      socialTime &&
      isPlayerHuman(entity) &&
      entity.gender === 'female' &&
      isMarriedOrExpecting(entity) &&
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
          steerHumanToward(entity, partner.x, partner.y, config.speed, 0.3,
            `spouse_${entity.id}_${partner.id}`);
          suppressIdle = true;
        }
      }
    }

    // Work and its commute own movement; neither kind of affair may steal their steering.
    const offDutyForAffair = !onDutyForSleep && !goingToHospital && !huntingWere
      && !inElectionCeremony && !inSpotlightGathering && !festivalGathering;
    const availableForAffair = offDutyForAffair && !stayIn && !sleepingForNeeds && !recoveringSleep && !takingNeedsBreak;

    // The affair encounter needs the settler away from the spouse, so it is sampled at a per-settler
    // waking hour but stays one roll per colony day (`personDayRoll` is day-keyed).
    if (
      availableForAffair && !isPrisoner &&
      !entity.raidDeploymentId &&
      isPlayerHuman(entity) &&
      // Compare clock hours with clock hours: the owner's stagger is an hour (waking hours), not a
      // tick-of-day.
      hourOfDay === affairEncounterHourOfDay(entity.id, state.tick) &&
      isStartOfClockHour(state.tick) &&
      !isAsleepAtHome(entity, buildingById, hourOfDay) &&
      !isSettlerLodgingAtHotel(entity, buildingById, hourOfDay, hotelLodging.hotels)
    ) {
      // Gossip is a daytime interaction, not an automatic midnight rumour.
      tryDailyAffairGossip(
        state,
        entity,
        entityById,
        updatedBuildings,
        buildingById,
        churchStrength,
        playerHumans,
      );
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
    }

    // Secret affairs: pregnancy itself does not block eligible encounters or catching.
    const hasActiveMarriage =
      isMarriedOrExpecting(entity) &&
      entity.partnerId != null;

    if (
      availableForAffair &&
      !inSpotlightGathering &&
      !goingToHospital &&
      canPursueSecretAffair(entity, hourOfDay, workplace, updatedBuildings, entityById, state.tick, workSchedule) &&
      isPlayerHuman(entity) &&
      entity.gender &&
      entity.age >= HUMAN_ADULT_MIN_AGE &&
      entity.age < HUMAN_MAX_LIFESPAN_YEARS &&
      getHumanStaminaRatio(entity) * 100 > Relationship.AFFAIR_MIN_STAMINA &&
      hasActiveMarriage &&
      // An empty marital home is a valid tryst site: only a spouse right there blocks it, at the
      // affair gates' 22 px — the wider 55 px arrival window is the walk-in that catches them.
      !isMaritalHomeOccupiedBySpouse(entity, entityById, buildingById, AFFAIR_SPOUSE_BLOCK_RADIUS)
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
        const trystTarget = getAffairTrystTarget(entity, paramour, entityById, buildingById);
        const intimate = isValidAffairTrystSite(entity, paramour, entityById, buildingById, AFFAIR_INTIMATE_RADIUS);

        if (!intimate) {
          entity.indoorBuildingId = undefined;
          steerAffairApproach(entity, paramour, trystTarget, config.speed * 0.38);
          suppressIdle = true;
        } else {
          entity.vx *= 0.55;
          entity.vy *= 0.55;
          suppressIdle = true;

          if (shouldLeadAffairPair(entity, paramour)) {
            // One staggered attempt per game hour, not a roll every realtime tick.
            // 11.4% per hour preserves roughly the former 1%-per-tick hourly odds.
            // Progress is owned by the daily relationship encounter; retain visual feedback only.
            if ((state.tick + entity.id) % TICKS_PER_HOUR === 0) {
              settlerPairChat(entity, paramour, 'affair', 0.114);
            }


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
            );
          }
        }
      }
    }

    // Established affairs can also use an already-reached overnight tryst house.
    // Only ordinary free time permits pursuit; bedtime must not trigger a new commute.
    if (
      offDutyForAffair &&
      !inSpotlightGathering &&
      !goingToHospital &&
      canPursueSecretAffair(entity, hourOfDay, workplace, updatedBuildings, entityById, state.tick, workSchedule) &&
      isPlayerHuman(entity) &&
      entity.age >= HUMAN_ADULT_MIN_AGE &&
      hasAffairPartner(entity, entityById) &&
      !isMaritalHomeOccupiedBySpouse(entity, entityById, buildingById, AFFAIR_SPOUSE_BLOCK_RADIUS)
    ) {
      const lover = livingHumanAt(entity.affairPartnerId);
      if (lover?.alive) {
        const trystTarget = getAffairTrystTarget(entity, lover, entityById, buildingById);
        const dist = Math.hypot(trystTarget.x - entity.x, trystTarget.y - entity.y) || 1;
        const tryst = isValidAffairTrystSite(entity, lover, entityById, buildingById, AFFAIR_INTIMATE_RADIUS);
        const site = tryst ? getAffairTrystBuilding(entity, lover, entityById, buildingById) : undefined;
        const overnight = !!site && isNightHour(hourOfDay) && !onDutyForSleep
          && !preShiftSleep.headHome && !takingNeedsBreak && (!recoveringSleep || sleepingForNeeds);
        if (availableForAffair && !tryst && dist > 14) {
          entity.indoorBuildingId = undefined;
          steerAffairApproach(entity, lover, trystTarget, config.speed * 0.32);
          suppressIdle = true;
        } else if (tryst && (availableForAffair || overnight)) {
          // Real indoor presence allows the physiology owner to observe sleep on the next tick.
          if (overnight && site) enterHumanBuilding(entity, site);
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
          );
        }
      }
    }

    // Midday coworker banter
    if (onDayJobShift && workplace && isPlayerHuman(entity) && entity.age >= HUMAN_ADULT_MIN_AGE && entity.job !== JobType.Innkeeper) {
      const workplaceWorkers = workersByWorkplace.get(entity.workerBuildingId ?? -1) ?? [];
      tryWorkplaceBanter(entity, workplaceWorkers, state.tick, hourOfDay, onDayJobShift);
    }

    tickHumanDoctorHospitalService({
      state,
      entity,
      allHumans,
      updatedBuildings,
      staffedHospitals,
      onHospitalShift,
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
    if (!huntingWere && !inElectionCeremony && !inSpotlightGathering && !festivalGathering) {
      tickHumanHospitalPatientCare({
        state,
        entity,
        staffedHospitals,
        speed: config.speed,
      });
      // Hospital travel is the destination for the rest of the tick: no idle wander may replace it.
      if (goingToHospital) suppressIdle = true;
    }

    if (entity.indoorBuildingId != null) suppressIdle = true;

    // Morning greetings
    if (allowFreeRoam && isPlayerHuman(entity) && entity.age >= HUMAN_ADULT_MIN_AGE && isGreetingHour(hourOfDay)) {
      if (isSocialStaggerTick(entity, state.tick)) {
        const passer = findClosestAdaptiveInRadius(
          humanSocialGrid,
          allHumans,
          entity.x,
          entity.y,
          SOCIAL_GREETING_RADIUS,
          (h) => h.id !== entity.id && h.alive && isPlayerHuman(h) && h.age >= HUMAN_ADULT_MIN_AGE,
          socialAdaptiveOptions('social', allHumans.length, width, height),
        );
        tryNeighborGreeting(entity, passer, state.tick, hourOfDay);
      }
    }

    // Scheduling, physiology and the single final walk step stay in this tick owner.
    // All child/adult free-time motives and leisure movement belong to humanLeisureBehavior.
    suppressIdle = tickHumanLeisure({
      state,
      entity,
      speed: config.speed,
      hourOfDay,
      onSchedule,
      allowFreeRoam,
      inSpotlightGathering,
      allHumans,
      entityById,
      updatedBuildings,
      buildingById,
      humanSocialGrid,
      width,
      height,
      livingHumanAt,
      suppressIdleInitial: suppressIdle,
      mandatoryChildActivity: childMandatoryActivity,
      settlerChat,
      settlerPairChat,
      completedPoolOf,
      workersByWorkplace,
      workerIndexById,
      workplace,
      workSchedule,
      idleVenues,
      treeGrid: ctx.treeGrid,
      trees: byType[EntityType.Tree],
      weekend,
    });

    if (!suppressIdle) {
      entity.vx *= 0.9;
      entity.vy *= 0.9;
      if (Math.hypot(entity.vx, entity.vy) < 0.08) {
        entity.vx = 0;
        entity.vy = 0;
      }
    }

    // Idle stamina recovery requires an actual stationary break; keep danger,
    // scheduled duty and ceremonies free to override it.
    if (takingNeedsBreak && !onSchedule && !inSpotlightGathering && !huntingWere && !inElectionCeremony && !festivalGathering &&
      !hospitalCommuteDue && !prisonCommuteDue && !schoolCommuteDue && !entity.raidDeploymentId) {
      entity.vx = 0;
      entity.vy = 0;
    }

    // The single integration for every walk, and the only place water and walls are enforced: the
    // steerers set a velocity without checking what it points into (see `applyHumanWalkStep`).
    integrateHumanWalk(entity, width, height);

    syncEntityGrids(ctx, entity);
  }

  // Some branches assign a final position directly, so repair those after the human pass: nobody
  // may be left in water, reserved decor, or a completed wall.
  if (state.worldMap) {
    const walkGrid = getReadOnlyPathGrid(state.worldMap, state.buildings);
    for (const entity of allHumans) {
      if (!entity.alive) continue;
      const tx = Math.floor(entity.x / 10);
      const ty = Math.floor(entity.y / 10);
      if (tx < 0 || ty < 0 || tx >= walkGrid.cols || ty >= walkGrid.rows) continue;
      if (walkGrid.blocked[ty * walkGrid.cols + tx] === 0) continue;
      const safe = nearestWalkableWorldPoint(state.worldMap, state.buildings, entity.x, entity.y);
      if (!safe) continue;
      entity.x = safe.x;
      entity.y = safe.y;
      entity.vx = 0;
      entity.vy = 0;
    }
  }

  if (isNewCalendarDay) {
    const activeHumans = state.entities.filter((e) => e.alive && isPlayerHuman(e));
    const activePregnancies = activeHumans.filter((e) => e.pregnant).length;
    const activeMarriages = activeHumans.filter(
      (e) =>
        isMarriedOrExpecting(e) &&
        e.partnerId != null &&
        e.id < e.partnerId,
    ).length;
 // A courtship is mutual by definition, so count a pair here only when both sides name
    // each other — a one-sided link left by a break must not be reported as an active courtship.
    const courtshipById = new Map(activeHumans.map((e) => [e.id, e]));
    const activeCourtships = activeHumans.filter(
      (e) =>
        e.courtshipPartnerId != null
        && e.id < e.courtshipPartnerId
        && courtshipById.get(e.courtshipPartnerId)?.courtshipPartnerId === e.id,
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
