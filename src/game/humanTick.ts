import { MAX_ASSIGNABLE_COMMUTE_HOURS, MAX_COMMUTE_LEAD_HOURS, WORK_COMMUTE_RUSH, quoteBuildingCommute } from './commuteReach';
import type { WorldState, Entity, Building, VisitorGroup, RivalSettlement } from './gameTypes';
import { EntityType, BuildingType, JobType, Season, PATH_CELL } from './gameTypes';
import { isBarracksGuard } from './defenseStructures';
import { SPECIES_CONFIG } from './speciesConfig';
import { getSimRng, seededRandomForRun, personDayRoll } from './simRng';
import { faceVelocity, ROAD_SPEED_MULT, steerEntityToward } from './simulation/movementSteering';
import { OFFSCREEN_HUMAN_THROTTLE, isInFocus } from './simFocus';
import { getChurchStrength, findHumanWorkplace, buildConstructionCrewIndex } from './workforce';

import { isPlayerHuman } from './playerHuman';
import { isSettlerRelationshipEntity } from './moonHowlerForm';
import { buildCeremonySeatIndex, getElectionGatherTarget, isCeremonyAttendee } from './villageLeadership';
import { getSpotlightGatherTarget } from './spotlightLore';

import {
  allowSocialLifeFor,
  isAsleepAtHome,
  isFestivalGatherer,
  prefersHomeTonightFor,
  shouldBeAtHomeFor,
} from './humanSchedule';
import {
  getWorkSchedule,
  isOnWorkCommuteHours,
  isOnWorkScheduleShift,
  isWithinWorkCommuteLead,
  isWorkScheduleHour,
} from './workSchedule';
import { isWorkDay, TICKS_PER_HOUR } from './dayCycleClock';
import { HUMAN_MAX_LIFESPAN_YEARS, tryGraduateHumanChild, syncHumanAgeFromCalendar, PER_TICK_RATE_SCALE, isOnMoonHowlerNightShift, isWeekend, getAbsoluteCalendarDay, isNightHour, isNewCalendarDayTick, EVENING_START, isStartOfClockHour } from './dayCycle';
import { hasResidenceAssignment, isNearResidence, isResidenceBuilding, shareResidence } from './housingModel';
import { HUMAN_ADULT_MIN_AGE } from './daycycleconstants';
import {
  chatHintsFromWorld,
  endAmbientHumanChat,
  type HumanChatContext,
} from './humanChat';
import { maybeDialogueChat, tickDialogue, tryAmbientRandomDialogue } from './dialogueTrees';
import { advanceHumanWalkAnim } from './humanSprites';

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
  SCHOOL_START_HOUR,
} from './education';
import {
  buildIncomingRaidIndex,
  getPlayerCampCenterFromBuildings,
  getPlayerSettlerCenter,
} from './frontierCombat';
import { buildPatrolRevealIndex, detectRaidersForPatrol, type PatrolRevealIndex } from './humanPatrolBehavior';
import { idleDestination, tickHumanLeisure } from './humanLeisureBehavior';
import { tickHumanHunting } from './humanHuntingBehavior';
import {
  HUNTING_PURSUIT_SPEED_MULT,
  huntingKillReach,
  huntingPursuitPoint,
  huntingSpotChaseTarget,
  huntingSpotTarget,
  isHuntingSpotHunter,
} from './huntingSpot';
import { getCaravanMoveTarget, tryAdvanceCaravanLeg } from './tradeCaravans';
import { tickFactionCampWander } from './factionWander';
import {
  tryNeighborGreeting,
  tryWorkplaceBanter,
  type SocialBuildingPicker,
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
  steerVisitorToHotel,
} from './hotelStay';
import { prisonGuardIds } from './prisonGuardDuty';
import { prisonDutyForGuard } from './prisonShifts';

import { getReadOnlyPathGrid, isOnWalkableRoadAt, nearestWalkableWorldPoint, setCurrentPathMap, steerWithPath } from './pathfinding';
import { crowdGatherPosition, enterHumanBuilding, applyHumanWalkStep, commuteDistanceToBuilding, commuteHumanToBuilding, commuteLeadHoursFor, nearestActiveMoonHowler, steerHumanToward } from './simulation/humanMovement';
import { buildingAccessPoint, isAtBuildingReach } from './buildingAccess';
import { tryEatColonyMeal, killFromStarvation } from './simulation/humanNeeds';
import { advanceHumanNeeds, hasFatalStarvation, hasNearbyWell, resolveHumanNeedsIntent } from './simulation/humanPhysiology';
import { isRestingHospitalPatient } from './hospitalCare';
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
  SOCIAL_STAGGER,
  SOCIAL_GREETING_RADIUS,
  SOCIAL_COURTSHIP_RADIUS,
} from './adaptiveSpatialQuery';
import {
  AFFAIR_SPOUSE_BLOCK_RADIUS,
  bindCourtship,
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
import { isVenueServiceHour, isVenueWorkerServiceHour } from './venueSchedule';
import { isHospitalDoctorOnShift, isHospitalDoctorCommuteTime } from './hospitalShifts';
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

/** Sole tick-level sleep observation; physiology alone owns rest and stamina recovery. */
function observeHumanSleep(entity: Entity, context: {
  hourOfDay: number;
  previousIndoorBuildingId: number | undefined;
  onDuty: boolean;
  recoveringSleep: boolean;
  hotels: readonly Building[];
  buildingById: Map<number, Building>;
  entityById: Map<number, Entity>;
  tick: number;
}): { sleeping: boolean; hasHospital: boolean } {
  const { hourOfDay, previousIndoorBuildingId, onDuty, recoveringSleep, hotels, buildingById, entityById, tick } = context;
  if (entity.raidDeploymentId) return { sleeping: false, hasHospital: false };
  const night = isNightHour(hourOfDay);
  if (entity.prisonBuildingId != null) {
    const cell = buildingById.get(entity.prisonBuildingId);
    return {
      sleeping: Boolean(cell?.completed && night && Math.hypot(entity.x - cell.x, entity.y - cell.y) <= 18),
      hasHospital: false,
    };
  }
  if (onDuty) return { sleeping: false, hasHospital: false };

  const home = entity.residenceBuildingId == null ? undefined : buildingById.get(entity.residenceBuildingId);
  const atHome = !!home && home.faction !== 'rival' && isResidenceBuilding(home)
    && previousIndoorBuildingId === home.id;
  const atHotel = entity.hotelStayBuildingId != null
    && previousIndoorBuildingId === entity.hotelStayBuildingId
    && isSettlerLodgingAtHotel(entity, buildingById, hourOfDay, hotels);
  const ward = previousIndoorBuildingId == null ? undefined : buildingById.get(previousIndoorBuildingId);
  const hasHospital = isRestingHospitalPatient(entity, ward, tick, previousIndoorBuildingId);

  const lover = entity.affairPartnerId == null ? undefined : entityById.get(entity.affairPartnerId);
  const site = lover?.alive && isSettlerRelationshipEntity(lover) && hasAffairPartner(entity, entityById)
    ? getAffairTrystBuilding(entity, lover, entityById, buildingById) : undefined;
  const atLover = !!site && !!lover && (night || recoveringSleep)
    && previousIndoorBuildingId === site.id && lover?.indoorBuildingId === site.id
    && isValidAffairTrystSite(entity, lover, entityById, buildingById, 55, hourOfDay);

  return {
    sleeping: (atHome && (night || recoveringSleep)) || atHotel || hasHospital || atLover,
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
    && b.completed && b.faction !== 'rival');

  const staffedHospitals: Building[] = [];
  const staffedTownHalls: Building[] = [];
  /**
   * The village's leisure venues, gathered once per tick: a tick-stable fact handed to the
   * behaviour instead of rescanning every building for every idle settler.
   */
  const idleVenues: Building[] = [];
  for (const b of updatedBuildings) {
    if (!b.completed || b.faction === 'rival') continue;
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
    else if (b.type === BuildingType.TownHall && b.completed && b.faction !== 'rival' && b.occupants.length > 0) {
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
        (b) => b.completed && b.faction !== 'rival' && types.includes(b.type),
      );
      completedPoolByKey.set(key, pool);
    }
    return pool;
  };
  const pickSocialBuilding: SocialBuildingPicker = (types, salt) => {
    const pool = completedPoolOf(types);
    if (pool.length === 0) return undefined;
    const safeSalt = Number.isFinite(salt) ? Math.abs(Math.floor(salt)) : 0;
    return pool[safeSalt % pool.length];
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

  // Marching-raider groups for patrol reveal depend on the tick's raid state, not on the guard
  // looking, so the first barracks watch on shift builds the index and the rest reuse it.
  let patrolRevealIndex: PatrolRevealIndex | undefined;

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

  // Camps, war-bands and festival places are tick-stable facts: index them once, never per settler.
  const visitorGroupById = new Map<string, VisitorGroup>();
  for (const group of state.visitorGroups ?? []) visitorGroupById.set(group.id, group);
  const rivalSettlementById = new Map<string, RivalSettlement>();
  for (const rival of state.rivalSettlements ?? []) rivalSettlementById.set(rival.id, rival);
  const incomingRaids = buildIncomingRaidIndex(state);
  const festivalPerformers = (state.visitorGroups ?? [])
    .find((group) => group.kind === 'performers' && group.daysLeft > 0);
  const festivalSquare = updatedBuildings.find(
    (b) => b.type === BuildingType.Square && b.completed && b.faction !== 'rival',
  );

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

    if (isNewCalendarDay && tryDailyHumanMortality(state, entity, updatedBuildings, entityById)) {
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

    // The affair encounter needs the settler away from the spouse, so it is sampled at a per-settler
    // waking hour but stays one roll per colony day (`personDayRoll` is day-keyed).
    if (
      !isPrisoner &&
      isPlayerHuman(entity) &&
      // Compare clock hours with clock hours: the owner's stagger is an hour (06:00–19:00), not a
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

    tryGraduateHumanChild(entity, config.size, config.speed, (e) => {
      if (isPlayerHuman(e)) applyEducationGraduation(state, e);
    });

    const schoolTarget = schoolAssignments.get(entity.id);

    if (schoolTarget) {
      // Schoolyard rumours and new bonds run once per day at noon, when an awake child is at school.
      if (
        hourOfDay === 12 &&
        isStartOfClockHour(state.tick) &&
        !isAsleepAtHome(entity, buildingById, hourOfDay)
      ) {
        trySchoolyardGossip(state, entity, entityById, updatedBuildings, playerHumans);
        tryFormSchoolyardBond(state, entity);
      }
    }

    const workplace = findHumanWorkplace(entity, updatedBuildings, workplaceOpts);
    const isInnkeeper =
      entity.job === JobType.Innkeeper && workplace?.type === BuildingType.Tavern && workplace.completed;

    const ordinaryWorkplace =
      workplace != null &&
      workplace.type !== BuildingType.Church &&
      workplace.type !== BuildingType.TownHall &&
      workplace.type !== BuildingType.Prison &&
      workplace.type !== BuildingType.Hospital;
    const isHospitalDoctor = entity.job === JobType.Doctor
      && workplace?.type === BuildingType.Hospital && workplace.completed;
    const onHospitalShift = !!(isHospitalDoctor && isHospitalDoctorOnShift(workplace, state.tick, entity.id));
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
    const onDayJobShift =
      (goWorkTime &&
        !isInnkeeper &&
        (ordinaryWorkplace ||
          (entity.job === JobType.Soldier &&
            isBarracksGuard(entity.id, entity.workerBuildingId, updatedBuildings)))) ||
      onSchoolShift;
    const onOfficialShift =
      entity.job === JobType.Official &&
      workplace?.type === BuildingType.TownHall &&
      workplace.completed &&
      goWorkTime;

    const venueWorkerIndex = workplace ? workplace.occupants.indexOf(entity.id) : -1;
    const venueWorkerCount = workplace?.occupants.length ?? 0;
    // A festival keeps the Tavern open to visitors, but that is venue availability, not the
    // Innkeeper's duty — paying it pins every innkeeper at maximum fatigue.
    const onTavernShift =
      isInnkeeper &&
      (venueWorkerIndex >= 0
        ? isVenueWorkerServiceHour(state, 'tavern', hourOfDay, venueWorkerIndex, venueWorkerCount)
        : isVenueServiceHour(state, 'tavern', hourOfDay));

    const isHotelier =
      entity.job === JobType.Hotelier && workplace?.type === BuildingType.Hotel && workplace.completed;
    const onHotelShift =
      isHotelier && (venueWorkerIndex >= 0
        ? isVenueWorkerServiceHour(state, 'hotel', hourOfDay, venueWorkerIndex, venueWorkerCount)
        : isVenueServiceHour(state, 'hotel', hourOfDay));

    const onMoonPriestShift =
      entity.job === JobType.Priest &&
      workplace?.type === BuildingType.Church &&
      workplace.completed &&
      isOnMoonHowlerNightShift(state.tick, hourOfDay);
    // Ordinary service: the church is a day-shift post too, so the priest works the colony's window
    // (`ordinaryWorkplace` excludes the church because this predicate, not the generic one, owns it).
    const onPriestShift =
      entity.job === JobType.Priest &&
      workplace?.type === BuildingType.Church &&
      workplace.completed &&
      (goWorkTime || onMoonPriestShift);

    const isPrisonGuardAtPost =
      entity.job === JobType.PrisonGuard && workplace?.type === BuildingType.Prison && workplace.completed;
    const prisonDuty = isPrisonGuardAtPost
      ? prisonDutyForGuard(entity.id, prisonGuardIds(state, workplace.occupants ?? []), state.tick)
      : null;
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
    // Half an hour of travel reserve means the one-hour handover is a real overlap,
    // not the only thing keeping the prison covered while the replacement arrives.
    const prisonCommuteLeadHours = Math.min(MAX_COMMUTE_LEAD_HOURS, estimatedPrisonHours + 0.5);
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

    // Attendance is a schedule fact, not a viewport one: crediting it above the off-screen throttle
    // is what stops a workplace's output from tracking where the camera happens to be.
    const onJobShift =
      onDayJobShift || onTavernShift || onHotelShift || onHospitalShift || onMoonPriestShift || onPrisonShift;
    // Work wins over revelry: the festival gathering is the free-time case (see `isFestivalGatherer`).
    const festivalGathering = isFestivalGatherer(
      hourOfDay,
      state.festival?.active,
      onJobShift || onOfficialShift || hospitalCommuteDue || prisonCommuteDue || schoolCommuteDue,
      isInnkeeper,
    );
    const atPost = workplace != null && isAtBuildingReach(entity, workplace);
    const wasInsideWorkplace = workplace != null && previousIndoorBuildingId === workplace.id;
    // Hunters work away from the spot; every other scheduled trade must be at its post or inside it.
    const hunterInField = entity.job === JobType.Hunter && entity.huntTargetId != null;
    // Pregnancy hospital priority outranks the shift: the settler still owes the duty hours, but
    // standing at a post they are leaving is not verified work.
    const goingToHospital = isPregnancyHospitalPriority(entity, staffedHospitals.length > 0);
    if (isPlayerHuman(entity) && (onJobShift || onOfficialShift || onPriestShift)) {
      recordScheduleWorkTick(entity);
      if (!goingToHospital && (atPost || wasInsideWorkplace || hunterInField)) recordPresentWorkTick(entity);
    }

    const recoveringSleep = (entity.needs?.sleepRecoveryUntilTick ?? 0) > state.tick;
    const inFocus = !focus || isInFocus(entity, focus);
    const active =
      !isPrisoner &&
      (spotlightActorIds?.has(entity.id) || inFocus ||
        (recoveringSleep && !onJobShift) ||
        (entity.needs?.breakUntilRecovered === true && !onJobShift) ||
        hospitalCommuteDue ||
        schoolCommuteDue || onSchoolShift ||
        prisonCommuteDue ||
        entity.pregnant ||
        hasAffairPartner(entity, entityById) ||
        (entity.affairProgress ?? 0) >= 20 ||
        (state.tick + entity.id) % OFFSCREEN_HUMAN_THROTTLE === 0);

    // A ceremony holds its **attendees**, not the whole village: the owner's *"they again in a circle"*
    // was a thousand settlers sharing sixty ring slots. Everyone else keeps their day.
    const inElectionCeremony =
      !prisonCommuteDue && state.electionCeremony != null && isPlayerHuman(entity) && isCeremonyAttendee(state, entity.id, ceremonySeats);
    // Only the selected actors receive exclusive gathering movement; everyone else
    // keeps the normal commute, social and work priority rules.
    const inSpotlightGathering = spotlightActorIds?.has(entity.id) === true;

    const onDutyForSleep = onJobShift || onOfficialShift || onPriestShift || schoolCommuteDue;
    const sleep = observeHumanSleep(entity, {
      hourOfDay, previousIndoorBuildingId, onDuty: onDutyForSleep, recoveringSleep,
      hotels: hotelLodging.hotels, buildingById, entityById, tick: state.tick,
    });
    const sleepingForNeeds = sleep.sleeping;
    let ateMeal = false;
    if (isPlayerHuman(entity)) {
      advanceHumanNeeds(entity, {
        tick: state.tick, sleeping: sleepingForNeeds,
        working: (onJobShift || onOfficialShift || onPriestShift) && entity.workerBuildingId != null,
        nightDuty: (onJobShift || onOfficialShift || onPriestShift) && isNightHour(hourOfDay),
        moving: Math.hypot(entity.vx, entity.vy) > 0.1,
        hasWell: hasNearbyWell(entity, nearbyWells),
        hasHospital: sleep.hasHospital,
        unheatedWinter: isWinter && !canHeat,
      });
      if (resolveHumanNeedsIntent(entity, state.tick, sleepingForNeeds && !sleep.hasHospital) === 'eat') {
        ateMeal = tryEatColonyMeal(entity, state, hourOfDay);
      }
      if (hasFatalStarvation(entity)) {
        killFromStarvation(entity, state, updatedBuildings, entityById);
        syncEntityGrids(ctx, entity);
        continue;
      }
    }

    // Imprisoned foreigners do not work or roam: no fictional metabolism/exhaustion.
    if (entity.warCaptive && !isPlayerHuman(entity)) {
      tryEatColonyMeal(entity, state, hourOfDay);
    }

    if (isPrisoner) {
      entity.vx = 0;
      entity.vy = 0;
      const prison = buildingById.get(entity.prisonBuildingId!);
      if (prison) {
        const door = buildingAccessPoint(prison);
        if (entity.indoorBuildingId === prison.id || isAtBuildingReach(entity, prison)) {
          enterHumanBuilding(entity, prison);
          entity.x = prison.x;
          entity.y = prison.y;
        } else {
          // The cell door is outside the walls; route around them instead of into them.
          steerHumanToward(entity, door.x, door.y, 1.2, 1, `prison_${prison.id}_${entity.id}`);
          applyHumanWalkStep(entity, 1);
        }
      }
      tickDialogue(entity, resolveChatPartner);
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
    tickDialogue(entity, resolveChatPartner);
    if (sleepingForNeeds) endAmbientHumanChat(entity);

    if (
      active &&
      !sleepingForNeeds &&
      isPlayerHuman(entity) &&
      !entity.faction &&
      (entity.chatTicks ?? 0) <= 0 &&
      (state.tick + entity.id) % SOCIAL_STAGGER === 0
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

    if (!active) {
      if (previousIndoorBuildingId != null && buildingById.get(previousIndoorBuildingId)?.completed) {
        entity.indoorBuildingId = previousIndoorBuildingId;
      }
      syncEntityGrids(ctx, entity);
      continue;
    }

    // Trade-route merchants
    if (entity.faction === 'trade_caravan') {
      const target = getCaravanMoveTarget(state, entity);
      if (target) {
        steerHumanToward(
          entity, target.x, target.y, config.speed, target.speedMult, `caravan_${entity.id}`,
        );
        applyHumanWalkStep(entity, 1);
        tryAdvanceCaravanLeg(state, entity);
      }
      syncEntityGrids(ctx, entity);
      continue;
    }
    // Visitors & rival settlers
    if (entity.faction === 'visitor' || entity.faction === 'rival') {
      const camp = entity.groupId == null
        ? undefined
        : entity.faction === 'visitor'
          ? visitorGroupById.get(entity.groupId)
          : rivalSettlementById.get(entity.groupId);

      if (camp) {
        const marching = entity.faction === 'rival' && entity.groupId != null && incomingRaids.has(entity.groupId);
        if (entity.faction === 'rival') {
          entity.hiddenFromPlayer = Boolean(marching && !entity.detectedByPatrol);
        }
        const playerCenter = marching ? getCampAnchor() : null;
        const cx = marching && playerCenter ? playerCenter.x : 'campX' in camp ? camp.campX : 0;
        const cy = marching && playerCenter ? playerCenter.y : 'campY' in camp ? camp.campY : 0;

        let speedMult = entity.faction === 'visitor' ? 0.62 : 0.4;
        if (marching) {
          const raidEvt = entity.groupId == null ? undefined : incomingRaids.get(entity.groupId);
          const marchTiles = raidEvt?.marchDistanceTiles ?? 30;
          speedMult = Math.max(0.38, 0.92 - marchTiles / 130);
        }

        if (marching) {
          steerEntityToward(entity, cx, cy, config.speed, speedMult);
          applyHumanWalkStep(entity, 1);
        } else if (
          entity.faction === 'visitor' &&
          steerVisitorToHotel(entity, buildingById, config.speed * speedMult)
        ) {
          // Hotel lodging owns its single walk step, including the road-speed multiplier.
        } else {
          tickFactionCampWander(state, entity, cx, cy, updatedBuildings, config.speed * speedMult);
        }

        const dist = Math.hypot(cx - entity.x, cy - entity.y);
        if (marching && dist < 90) entity.combatTicks = Math.max(entity.combatTicks ?? 0, 8);

        const village = getCampAnchor();
        const nearVillage = Math.hypot(entity.x - village.x, entity.y - village.y) < 110;
        const chatChance =
          (entity.faction === 'visitor' ? (nearVillage ? 0.055 : 0.03) : 0.025) * PER_TICK_RATE_SCALE;
        settlerChat(entity, entity.faction === 'visitor' ? 'visitor' : 'rival', chatChance);
      }
      syncEntityGrids(ctx, entity);
      continue;
    }

    if (isWinter && !canHeat && isTick8) entity.flash = 5;

    let suppressIdle = false;
    let onSchedule = false;


    // A crew larger than three shifts takes days off in turn; a resting guard is off the colony work
    // day and must not still walk to the prison.
    const offDutyPrisonGuard = isPrisonGuardAtPost && prisonShift == null;

    // A resting settler takes an actual off-duty pause, not merely a status label.
    // On-duty and emergency movement remain owned by their existing systems.
    const takingNeedsBreak = isPlayerHuman(entity) && !onJobShift &&
      !onOfficialShift && !onPriestShift && !schoolCommuteDue &&
      resolveHumanNeedsIntent(entity, state.tick, sleepingForNeeds) === 'takeBreak';

    const commuteStartHour = isPrisonGuardAtPost ? prisonShiftStartHour : workSchedule.startHour;
    const commuteLeadHours = workplace
      ? commuteLeadHoursFor(commuteDistanceToBuilding(entity, workplace), config.speed)
      : 0;
    const workCommuteDue = isPrisonGuardAtPost ? prisonCommuteDue : workplace != null
      && isWorkDay(state.tick)
      && (goWorkTime || onWorkCommuteHours
        || isWithinWorkCommuteLead(state.tick, commuteStartHour, commuteLeadHours));

    const stayIn =
      !goingToHospital &&
      !inSpotlightGathering &&
      !festivalGathering &&
      !onTavernShift &&
      !onMoonPriestShift &&
      !workCommuteDue &&
      (prefersHomeTonightFor(workSchedule, entity.id, state.tick, hourOfDay)
        || (recoveringSleep && !onJobShift));

    const allowFreeRoam = !goingToHospital && !inSpotlightGathering && !takingNeedsBreak && (festivalGathering || (!onJobShift && !hospitalCommuteDue && !prisonCommuteDue && !schoolCommuteDue && !stayIn));
    const socialBlockedByJob = isInnkeeper
      ? onTavernShift
      : ordinaryWorkplace && isWorkScheduleHour(workSchedule, hourOfDay) && goWorkTime;
    const socialTime =
      !goingToHospital && !inSpotlightGathering && !hospitalCommuteDue && !prisonCommuteDue && !schoolCommuteDue && (
        (!socialBlockedByJob && allowSocialLifeFor(workSchedule, hourOfDay, false, state.tick)) ||
        (allowFreeRoam && isPlayerHuman(entity))
      );

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
      const performers = festivalPerformers;
      const hall = staffedTownHalls.length > 0 ? staffedTownHalls[entity.id % staffedTownHalls.length] : undefined;
      const square = festivalSquare;
      const targetX = square ? square.x + square.width / 2 : (performers?.campX ?? (hall ? hall.x : width * 0.5));
      const targetY = square ? square.y + square.height / 2 : (performers?.campY ?? (hall ? hall.y : height * 0.5));
      // A real place per festival-goer: `crowdGatherPosition` spreads the crowd around the target.
      const stand = crowdGatherPosition(targetX, targetY, entity.id);
      const dx = stand.x - entity.x;
      const dy = stand.y - entity.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist > 18) {
        steerHumanToward(entity, stand.x, stand.y, config.speed, 0.72,
          `festival_${entity.id}`);
      } else {
        entity.vx = Math.sin(state.tick * 0.04 + entity.id) * config.speed * 0.12;
        entity.vy = Math.cos(state.tick * 0.035 + entity.id) * config.speed * 0.12;
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
        onSchedule = true;
        suppressIdle = true;
      } else if (residence?.completed) {
        if (commuteHumanToBuilding(entity, residence, config.speed, WORK_COMMUTE_RUSH)) enterHumanBuilding(entity, residence);
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
        patrolRevealIndex ??= buildPatrolRevealIndex(state, byType[EntityType.Human] ?? []);
        detectRaidersForPatrol(state, entity, patrolRevealIndex);
        const radius = 95 + (entity.id % 6) * 10;
        const angle = state.tick * 0.028 * PER_TICK_RATE_SCALE + entity.id * 2.1;
        const tx = anchor.x + Math.cos(angle) * radius;
        const ty = anchor.y + Math.sin(angle) * radius * 0.55;
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
      const spotPrey = huntingSpotTarget(workplace, entity, entityById, byType);
      const chase = spotPrey ? huntingSpotChaseTarget(workplace, entity, entityById, byType) : null;
      // Who is after what: the map's dashed hunt line and the prey's flee rule both read this field.
      entity.huntTargetId = spotPrey ? spotPrey.id : undefined;
      // Record the contact while it is happening: the spot's production pass samples an instant and would
      // otherwise never see the hunter beside the animal (`HUNTING_SPOT_STRIKE_GRACE_TICKS`).
      if (spotPrey && Math.hypot(spotPrey.x - entity.x, spotPrey.y - entity.y) <= huntingKillReach(entity, spotPrey)) {
        workplace.huntingSpotInReachTick = state.tick;
      }
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
      (goWorkTime || onWorkCommuteHours || prisonShift != null) &&
      !isInnkeeper &&
      !isHospitalDoctor &&
      workplace
    ) {
      // Leave early enough to arrive at work when the shift starts; the lead grows with the settler's
      // own commute distance.
      const commuteLeadHours = commuteLeadHoursFor(
        commuteDistanceToBuilding(entity, workplace),
        config.speed,
      );
      const needsToLeaveForWork = isPrisonGuardAtPost
        ? prisonCommuteDue
        : isWorkDay(state.tick) && isWithinWorkCommuteLead(state.tick, prisonShiftStartHour, commuteLeadHours);
      // A prison guard works his roster shift and nothing else: the colony window is not his day, so
      // `goWorkTime` must not put a resting guard back on the post he is taking the day off from.
      const wantsToWork = isPrisonGuardAtPost
        ? prisonShift != null && (onPrisonShift || needsToLeaveForWork)
        : goWorkTime || onWorkCommuteHours || needsToLeaveForWork;
      if (wantsToWork) {
        if (commuteHumanToBuilding(entity, workplace, config.speed, WORK_COMMUTE_RUSH)) enterHumanBuilding(entity, workplace);
        onSchedule = true;
        suppressIdle = true;
      }
    }

    // A prison watch is paced by commuteLeadHoursFor using the full WORK_COMMUTE_RUSH.
    // Damping the scheduled velocity by 15% *after* planning silently makes that
    // prediction too optimistic and leaves the night post empty at handover.
    if (!inSpotlightGathering && !allowFreeRoam && onSchedule && !huntingWere && !prisonCommuteDue) {
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
    );
    suppressIdle = huntingSuppressIdle;

    advancePregnancy(entity, conceivedToday);

    const atHome = shouldBeAtHomeFor(workSchedule, hourOfDay) && isNearResidence(entity, buildingById);

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

    // Courtship
    if (!onJobShift && socialTime && isEligibleToCourt(entity) && entity.gender && entity.energy > config.reproductionEnergyThreshold * 0.6) {
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
      );

      if (closest) {
        const dx = closest.x - entity.x;
        const dy = closest.y - entity.y;
        const dist = Math.hypot(dx, dy) || 1;
        const livingTogether = atHome && shareResidence(entity, closest);
        const closeEnough = dist <= 10 || livingTogether;

        if (!closeEnough) {
          const chaseSpeed = atHome ? 0.35 : 0.45;
          steerHumanToward(entity, closest.x, closest.y, config.speed, chaseSpeed,
            `courtship_${entity.id}_${closest.id}`);
          suppressIdle = true;
        } else {
          entity.vx *= 0.6;
          entity.vy *= 0.6;
          suppressIdle = true;
          // The relationship owner decides how a pair is bound (new partner → progress starts at zero).
          bindCourtship(entity, closest);

          if (seededRandomForRun(`chat-court1:${entity.id}:${state.tick}`) < 0.4 * PER_TICK_RATE_SCALE) {
            settlerPairChat(entity, closest, 'courtship', 0.85);
          } else if (seededRandomForRun(`chat-court2:${entity.id}:${state.tick}`) < 0.5 * PER_TICK_RATE_SCALE) {
            settlerPairChat(entity, closest, 'courtship', 0.1);
          }

          if (entity.id < closest.id) {
            const hasPerformers = state.visitorGroups.some((g) => g.kind === 'performers' && g.daysLeft > 0);
            // Symmetric pair rule: both people's courtship aptitudes average into one rate.
            const courtshipFactor = combinePairFactors(
              evaluateAptitudeInfluence(entity, 'courtship').factor,
              evaluateAptitudeInfluence(closest, 'courtship').factor,
            );
            const courtRate =
              courtshipRatePerHour(socialTime) *
              (state.festival?.active ? 2 : 1) *
              (hasPerformers ? 1.35 : 1) *
              (livingTogether ? 1.5 : 1) *
              courtshipFactor *
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
            playerResidencesFor(),
            playerHumans,
          );
        }
      }
    }

    // Married couples proximity — free time only: a settler on a shift keeps the post his work
    // commute gave him (a Prison is not an `ordinaryWorkplace`, so `socialTime` is true on a guard's shift).
    if (
      !onJobShift &&
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

    // Secret affairs: pregnancy or expecting status does not block encounters or catching.
    const hasActiveMarriage =
      isMarriedOrExpecting(entity) &&
      entity.partnerId != null;

    if (
      !inSpotlightGathering &&
      !goingToHospital &&
      canPursueSecretAffair(entity, hourOfDay, workplace, updatedBuildings, entityById, state.tick, workSchedule) &&
      isPlayerHuman(entity) &&
      entity.gender &&
      entity.age >= HUMAN_ADULT_MIN_AGE &&
      entity.age < HUMAN_MAX_LIFESPAN_YEARS &&
      entity.energy > config.reproductionEnergyThreshold * 0.5 &&
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
            );
          }
        }
      }
    }

    // Established affairs still happen in normal free time, but cannot steal
    // spotlight participants' movement after the gathering vector is assigned.
    if (
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
        if (!tryst && dist > 14) {
          entity.indoorBuildingId = undefined;
          steerAffairApproach(entity, lover, trystTarget, config.speed * 0.32);
          suppressIdle = true;
        } else if (tryst) {
          // Genuine overnight tryst: enter the existing tryst building rather than
          // granting any indoor/sleep state for an outdoor romantic encounter.
          if (isNightHour(hourOfDay) && !onDutyForSleep) {
            const site = getAffairTrystBuilding(entity, lover, entityById, buildingById);
            if (site) enterHumanBuilding(entity, site);
          }
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
      tryWorkplaceBanter(entity, workplaceWorkers, state.tick, hourOfDay, true);
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
      onDayJobShift: onDayJobShift || onOfficialShift,
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
    if (allowFreeRoam && isPlayerHuman(entity) && entity.age >= HUMAN_ADULT_MIN_AGE && hourOfDay >= 6 && hourOfDay <= 9) {
      if ((state.tick + entity.id) % SOCIAL_STAGGER === 0) {
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
      pickSocialBuilding,
      updatedBuildings,
      buildingById,
      humanSocialGrid,
      width,
      height,
      livingHumanAt,
      suppressIdleInitial: suppressIdle,
      settlerChat,
      settlerPairChat,
      completedPoolOf,
      workersByWorkplace,
      workerIndexById,
      workplace,
      workSchedule,
      idleVenues,
      festivalPerformers,
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

    // Use the same completed-road tiles the route planner prices, not proximity to a road.
    const roadMult = isOnWalkableRoadAt(entity.x, entity.y) ? ROAD_SPEED_MULT : 1.0;

    // The single integration for every walk, and the only place water and walls are enforced: the
    // steerers set a velocity without checking what it points into (see `applyHumanWalkStep`).
    if (entity.indoorBuildingId != null) {
      entity.vx = 0;
      entity.vy = 0;
    }
    applyHumanWalkStep(entity, roadMult);

    clampToMapBounds(entity, width, height);

    advanceHumanWalkAnim(entity);

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
