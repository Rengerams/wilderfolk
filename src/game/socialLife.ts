import { PERSON_DAY_ROLL_SALTS, personDayRoll, personPairDayRoll } from './simRng';
import type { Building, Entity, WorldState } from './gameTypes';
import { BuildingType, WeatherType } from './gameTypes';
import { isMutualMarriage } from './relationships';
import { HUMAN_NEEDS, getHumanStaminaRatio, resolveHumanNeedsIntent } from './simulation/humanPhysiology';
import { needsMedicalCare, medicalUrgency } from './hospitalCare';
import { isStaffedHospital } from './humanHospitalBehavior';
import { getAbsoluteCalendarDay, DAILY_PHASE_HOURS, getTickOfDay } from './dayCycleClock';
import { isCivicAudienceDay, wantsCivicAudience } from './townHall';
import {
  DAYS_PER_YEAR,
  EVENING_START,
  HUMAN_VENERABLE_AGE,
  TICKS_PER_HOUR,
  getHourOfDay,
  getWeekday,
  isWorkDay,
} from './dayCycle';
import { hasResidenceAssignment, hasWorkAssignment } from './housingModel';
import { isDialogueBusy } from './humanChat';
import { hasDialogueSceneOnDay, requestDialogue, type DialogueEventKey } from './dialogueTrees';
import { isOnWorkScheduleShift } from './workSchedule';
import { evaluateAptitudeInfluence } from './personality/traitEvaluation';
import { isFoodAlert } from './resourceUtils';
import { SOCIAL_STAGGER } from './adaptiveSpatialQuery';

/** Ordinary banter chance before the company activity's bounded modifier. */
const BANTER_BASE_CHANCE = 0.08;

/** The one per-person social cadence bucket every ambient scan and social scene gate reads. */
export function isSocialStaggerTick(entity: Pick<Entity, 'id'>, tick: number): boolean {
  return (tick + entity.id) % SOCIAL_STAGGER === 0;
}

/** The one early-morning doorstep window; the caller and the scene owner must agree on it. */
export function isGreetingHour(hour: number): boolean {
  return Number.isFinite(hour) && hour >= 6 && hour <= 9;
}

type SocialMotive =
  | 'sick_day'
  | 'grief'
  | 'bad_weather'
  | 'elder_rest'
  | 'sunday_service'
  | 'market_errand'
  | 'civic_petition'
  | 'care_pregnant'
  | 'hospital_visit'
  | 'comfort_neighbor'
  | 'birthday'
  | 'day_off'
  | 'none';

export interface SocialImpulse {
  motive: SocialMotive;
  /** Optional building to steer toward. */
  building?: Building;
  /** Optional companion to walk with or comfort. */
  company?: Entity;
  /** Suggest staying near home residence. */
  stayHome?: boolean;
  /** Exact outcome-based dialogue content key; prose is owned only by JSON. */
  dialogueEvent?: DialogueEventKey;
  /** Source selection roll, keeping the previous person/day authored-text choice. */
  dialogueRoll?: number;
}

export type SocialBuildingPool = (types: readonly BuildingType[]) => readonly Building[];

const SOCIAL_IMPULSE_CONFIG = {
  // Social help uses the physiology owner's break-recovery target, not a medical diagnosis.
  HARSH_WEATHER_STAY_HOME_CHANCE: 0.62,
  SUNDAY_SERVICE_ATTEND_CHANCE: 0.7,
  /** 0.6 = per-person, per-day chance that a settler with nothing else on spends a day off out. */
  DAY_OFF_GATHERING_CHANCE: 0.6,
  GREETING_MIN_DIST_SQ: 16, // 4px^2
  GREETING_MAX_DIST_SQ: 784, // 28px^2
} as const;

function isHarshWeather(weather: WorldState['weather']): boolean {
  return (
    weather === WeatherType.Storm ||
    weather === WeatherType.Snow ||
    weather === WeatherType.Rain ||
    weather === WeatherType.Drought
  );
}

/** Nearest eligible completed venue; stable ID breaks ties in cached and uncached pools. */
function pickBuilding(entity: Entity, buildings: readonly Building[], types: readonly BuildingType[]): Building | undefined {
  let best: Building | undefined;
  let bestDistance = Infinity;
  for (const building of buildings) {
    if (!building.completed || !types.includes(building.type)) continue;
    if (building.type === BuildingType.Hospital && !isStaffedHospital(building)) continue;
    const distance = (building.x - entity.x) ** 2 + (building.y - entity.y) ** 2;
    if (distance < bestDistance || (distance === bestDistance && best && building.id < best.id)) {
      best = building;
      bestDistance = distance;
    }
  }
  return best;
}

function isGrieving(entity: Entity, tick: number): boolean {
  return (entity.griefUntilTick ?? 0) > tick;
}

function isElder(entity: Entity): boolean {
  return entity.age >= HUMAN_VENERABLE_AGE;
}

function isBirthdayToday(entity: Entity, dayInYear: number): boolean {
  if (entity.birthDay == null || !Number.isFinite(entity.birthDay)) return false;
  const birthDayInYear =
    ((Math.floor(entity.birthDay) % DAYS_PER_YEAR) + DAYS_PER_YEAR) % DAYS_PER_YEAR;
  return birthDayInYear === dayInYear;
}

/**
 * Evaluates and returns the primary social motive for an off-duty settler.
 * Uses deterministic per-person day rolls to ensure behavioral stability across hours.
 */
export function pickSocialImpulse(
  entity: Entity,
  state: WorldState,
  buildings: readonly Building[],
  nearbyAdults: readonly Entity[],
  poolOf?: SocialBuildingPool,
): SocialImpulse {
  if (!entity.alive) return { motive: 'none' };

  const tick = state.tick;
  if (!Number.isFinite(tick)) return { motive: 'none' };

  const hour = getHourOfDay(tick);
  if (!Number.isFinite(hour)) return { motive: 'none' };

  const weekday = getWeekday(tick);
  const onShift = isOnWorkScheduleShift(state, hour);
  const hasHome = hasResidenceAssignment(entity);
  const completedErrands = entity.socialErrands?.day === getAbsoluteCalendarDay(tick) ? entity.socialErrands : undefined;
  const pickSocialBuilding = (types: readonly BuildingType[]) => pickBuilding(entity, poolOf?.(types) ?? buildings, types);

  // 1. Sick / Exhausted — Rest at home (or just rest, if homeless)
  if (resolveHumanNeedsIntent(entity, tick, false, false) === 'takeBreak'
    || (!entity.needs && getHumanStaminaRatio(entity) < HUMAN_NEEDS.STAMINA_CRITICAL / 100)) {
    return {
      motive: 'sick_day',
      stayHome: hasHome,
      dialogueEvent: 'social.impulse.sick_day',
      dialogueRoll: personDayRoll(entity.id, tick, 701),
    };
  }

  // 2. Grief — Quiet days at home or prayer at church
  if (isGrieving(entity, tick)) {
    const church = pickSocialBuilding([BuildingType.Church]);
    if (church && personDayRoll(entity.id, tick, 702) < 0.4 && hour >= 9 && hour < 18) {
      return {
        motive: 'grief',
        building: church,
        dialogueEvent: 'social.impulse.grief.church',
        dialogueRoll: personDayRoll(entity.id, tick, 703),
      };
    }
    return {
      motive: 'grief',
      stayHome: hasHome,
      dialogueEvent: 'social.impulse.grief.home',
    };
  }

  // 3. Bad Weather — Shelter indoors
  if (
    isHarshWeather(state.weather) &&
    hasHome &&
    personDayRoll(entity.id, tick, 704) < SOCIAL_IMPULSE_CONFIG.HARSH_WEATHER_STAY_HOME_CHANCE
  ) {
    const weatherKind = state.weather === WeatherType.Storm ? 'storm'
      : state.weather === WeatherType.Snow ? 'snow'
        : state.weather === WeatherType.Rain ? 'rain' : 'drought';

    return {
      motive: 'bad_weather',
      stayHome: true,
      dialogueEvent: `social.impulse.bad_weather.${weatherKind}` as const,
    };
  }

  // 4. Elder Rest — Senior settlers take porch rest
  if (isElder(entity) && hasHome && personDayRoll(entity.id, tick, 705) < 0.38) {
    return {
      motive: 'elder_rest',
      stayHome: true,
      dialogueEvent: 'social.impulse.elder_rest',
      dialogueRoll: personDayRoll(entity.id, tick, 706) < 0.4 ? 0.25 : 0.75,
    };
  }

  // 5. Partner care is companionship, not a medical referral.
  const spouse = nearbyAdults.find((h) => isMutualMarriage(entity, h));
  if (spouse?.pregnant && personDayRoll(entity.id, tick, 707) < 0.55) {
    return {
      motive: 'care_pregnant',
      company: spouse,
      dialogueEvent: 'social.impulse.care_pregnant.check_spouse',
    };
  }

  if (entity.pregnant && hasHome && hour >= EVENING_START && personDayRoll(entity.id, tick, 709) < 0.45) {
    return { motive: 'care_pregnant', stayHome: true, dialogueEvent: 'social.impulse.care_pregnant.rest' };
  }

  // 6. Sunday Service (Sunday = day 6)
  if (weekday === 6 && hour >= 9 && hour < 13) {
    const church = pickSocialBuilding(
      [BuildingType.Church],
    );
    if (
      church &&
      personDayRoll(entity.id, tick, 710) < SOCIAL_IMPULSE_CONFIG.SUNDAY_SERVICE_ATTEND_CHANCE
    ) {
      return {
        motive: 'sunday_service',
        building: church,
        dialogueEvent: 'social.impulse.sunday_service',
        dialogueRoll: personDayRoll(entity.id, tick, 711),
      };
    }
  }

  // 7. Civic Petition — Visit Town Hall (including post-scandal counseling)
  const hall = pickSocialBuilding([BuildingType.TownHall]);
  if (
    isCivicAudienceDay(tick) &&
    wantsCivicAudience(entity, state) &&
    hall &&
    hall.occupants.length > 0 &&
    hour >= 9 &&
    getTickOfDay(tick) <= DAILY_PHASE_HOURS.production * TICKS_PER_HOUR &&
    personDayRoll(entity.id, tick, 730) < 0.32
  ) {
    const foodAid = isFoodAlert(state);
    return {
      motive: 'civic_petition',
      building: hall,
      dialogueEvent: isGrieving(entity, tick)
        ? 'social.impulse.civic_petition.grief'
        : foodAid ? 'social.impulse.civic_petition.food' : 'social.impulse.civic_petition.general',
    };
  }

  // 8. Hospital Visit (when staffed)
  const hospital = needsMedicalCare(entity, tick) ? pickSocialBuilding([BuildingType.Hospital]) : undefined;
  if (
    hospital &&
    personDayRoll(entity.id, tick, 732) < 0.5 + 0.3 * medicalUrgency(entity, tick)
  ) {
    return {
      motive: 'hospital_visit',
      building: hospital,
      dialogueEvent: entity.pregnant ? 'social.impulse.hospital_visit.midwives' : 'social.impulse.hospital_visit.doctor',
    };
  }

  // 9. Birthday Mood
  if (isBirthdayToday(entity, state.dayInYear) && personDayRoll(entity.id, tick, 712) < 0.65) {
    const tavern = pickSocialBuilding(
      [BuildingType.Tavern, BuildingType.Market],
    );
    return {
      motive: 'birthday',
      building: tavern,
      dialogueEvent: 'social.impulse.birthday',
    };
  }

  // 10. Market & Well Errands (during free daytime)
  if (!completedErrands?.market && !onShift && hour >= 8 && hour <= 18 && personDayRoll(entity.id, tick, 713) < 0.28) {
    const market = pickSocialBuilding(
      [BuildingType.Market, BuildingType.Store, BuildingType.Well],
    );
    if (market) {
      return {
        motive: 'market_errand',
        building: market,
        dialogueEvent: market.type === BuildingType.Well
          ? 'social.impulse.market_errand.well' : 'social.impulse.market_errand.other',
        dialogueRoll: market.type === BuildingType.Well ? undefined : personDayRoll(entity.id, tick, 714),
      };
    }
  }

  // 11. Comfort Neighbor
  const weary = nearbyAdults.find(
    (h) =>
      h.id !== entity.id &&
      h.alive &&
      h.prisonBuildingId == null &&
      getHumanStaminaRatio(h) < HUMAN_NEEDS.STAMINA_BREAK_RECOVERED / 100 &&
      personPairDayRoll(entity.id, h.id, tick, PERSON_DAY_ROLL_SALTS.socialWearyComfort) < 0.5,
  );
  if (weary && personDayRoll(entity.id, tick, 716) < 0.22) {
    return {
      motive: 'comfort_neighbor',
      company: weary,
      dialogueEvent: 'social.impulse.comfort_neighbor',
      dialogueRoll: personDayRoll(entity.id, tick, 717),
    };
  }

  // Day Out — a settler with nowhere to be needs an anchor in this list; without it an idle
  // settler's only destination is home. Resting at home is the fallback, not the plan.
  const idle = !hasWorkAssignment(entity);
  if ((!isWorkDay(tick) || idle) && hour >= 9 && hour < EVENING_START) {
    const haunt = pickSocialBuilding(
      [BuildingType.Tavern, BuildingType.Market, BuildingType.TownHall, BuildingType.Church],
    );
    if (haunt && personDayRoll(entity.id, tick, 736) < SOCIAL_IMPULSE_CONFIG.DAY_OFF_GATHERING_CHANCE) {
      return {
        motive: 'day_off',
        building: haunt,
        dialogueEvent: 'social.impulse.day_off',
        dialogueRoll: personDayRoll(entity.id, tick, 737),
      };
    }
  }

  return { motive: 'none' };
}

/** Midday coworker banter during work shifts. */
export function tryWorkplaceBanter(
  entity: Entity,
  coworkers: readonly Entity[],
  tick: number,
  hour: number,
  onDayShift: boolean,
): void {
  if (!entity.alive || !onDayShift) return;
  if (!Number.isFinite(hour) || hour < 11 || hour > 13) return;
  if (isDialogueBusy(entity)) return;
  if (hasDialogueSceneOnDay(entity, tick)) return;

  const banterChance = Math.min(1, BANTER_BASE_CHANCE * evaluateAptitudeInfluence(entity, 'company').factor);
  if (personDayRoll(entity.id, tick, 720) > banterChance) return;

  const mate = coworkers.find((c) =>
    c.id !== entity.id && c.alive && !isDialogueBusy(c)
    && !hasDialogueSceneOnDay(c, tick));
  if (!mate) {
    requestDialogue({
      eventKey: 'workplace.banter.solo', speaker: entity, tick,
      selectionRoll: personDayRoll(entity.id, tick, 721),
      durationHours: 4 / TICKS_PER_HOUR,
    });
    return;
  }

  // Preserve each person's deterministic choice while giving both actors a
  // single paired session. The two voices alternate, never talk over themselves.
  const startLine = personDayRoll(entity.id, tick, 722) < 0.5 ? 0 : 1;
  const replyLine = personDayRoll(mate.id, tick, 723) < 0.5 ? 0 : 1;
  requestDialogue({
    eventKey: 'workplace.banter', speaker: entity, partner: mate, tick,
    selectionRoll: (startLine * 2 + replyLine + 0.5) / 4,
    durationHours: 4 / TICKS_PER_HOUR,
  });
}

/** Doorstep greeting between neighbors passing near home in the early morning. */
export function tryNeighborGreeting(
  entity: Entity,
  other: Entity | null | undefined,
  tick: number,
  hour: number,
): void {
  if (!entity.alive || !other || !other.alive || other.id === entity.id) return;
  if (!isGreetingHour(hour)) return;
  if (isDialogueBusy(entity) || isDialogueBusy(other)) return;
  if (hasDialogueSceneOnDay(entity, tick)
    || hasDialogueSceneOnDay(other, tick)) return;
  if (personPairDayRoll(entity.id, other.id, tick, PERSON_DAY_ROLL_SALTS.socialGreeting) > 0.12) return;

  const dx = entity.x - other.x;
  const dy = entity.y - other.y;
  const distSq = dx * dx + dy * dy;

  if (
    distSq > SOCIAL_IMPULSE_CONFIG.GREETING_MAX_DIST_SQ ||
    distSq < SOCIAL_IMPULSE_CONFIG.GREETING_MIN_DIST_SQ
  ) {
    return;
  }

  const greeting = personDayRoll(entity.id, tick, 725) < 0.5 ? 0 : 1;
  const reply = personDayRoll(other.id, tick, 726) < 0.5 ? 0 : 1;
  requestDialogue({
    eventKey: 'neighbor.greeting', speaker: entity, partner: other, tick,
    selectionRoll: (greeting * 2 + reply + 0.5) / 4,
    durationHours: 4 / TICKS_PER_HOUR,
  });
}