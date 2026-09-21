import type { Building, Entity, WorldState } from './gameTypes';
import { BuildingType, WeatherType } from './gameTypes';
import {
  DAYS_PER_YEAR,
  EVENING_START,
  HUMAN_VENERABLE_AGE,
  TICKS_PER_DAY,
  getHourOfDay,
  getWeekday,
  hasResidenceAssignment,
  personDayRoll,
} from './dayCycle';
import { isDialogueBusy, sayHumanChatPhrase } from './humanChat';
import { isOnWorkScheduleShift } from './workSchedule';

export type SocialMotive =
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
  | 'kid_play'
  | 'birthday'
  | 'none';

export interface SocialImpulse {
  motive: SocialMotive;
  /** Optional building to steer toward. */
  building?: Building;
  /** Optional companion to walk with or comfort. */
  company?: Entity;
  /** Suggest staying near home residence. */
  stayHome?: boolean;
  /** Floating chat bubble text. */
  bubble?: string;
}

const SOCIAL_IMPULSE_CONFIG = {
  EXHAUSTED_ENERGY_RATIO: 0.28,
  WEARY_ENERGY_RATIO: 0.4,
  HARSH_WEATHER_STAY_HOME_CHANCE: 0.62,
  SUNDAY_SERVICE_ATTEND_CHANCE: 0.7,
  GREETING_MIN_DIST_SQ: 16, // 4px^2
  GREETING_MAX_DIST_SQ: 784, // 28px^2
  /** Realistic chat bubble duration in ticks (3 ticks = 1 in-game hour). */
  CHAT_BUBBLE_TICKS_SHORT: 4,
  CHAT_BUBBLE_TICKS_NORMAL: 6,
} as const;

function isHarshWeather(weather: WorldState['weather']): boolean {
  return (
    weather === WeatherType.Storm ||
    weather === WeatherType.Snow ||
    weather === WeatherType.Rain ||
    weather === WeatherType.Drought
  );
}

function pickBuilding(
  buildings: readonly Building[],
  types: readonly BuildingType[],
  salt: number,
): Building | undefined {
  let count = 0;
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    if (b.completed && b.faction !== 'rival' && types.includes(b.type)) {
      count++;
    }
  }

  if (count === 0) return undefined;
  const targetIdx = Math.abs(Math.floor(salt)) % count;
  let currentIdx = 0;

  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    if (b.completed && b.faction !== 'rival' && types.includes(b.type)) {
      if (currentIdx === targetIdx) {
        return b;
      }
      currentIdx++;
    }
  }

  return undefined;
}

function isGrieving(entity: Entity, tick: number): boolean {
  return (entity.griefUntilTick ?? 0) > tick;
}

function isExhausted(entity: Entity): boolean {
  return entity.energy < entity.maxEnergy * SOCIAL_IMPULSE_CONFIG.EXHAUSTED_ENERGY_RATIO;
}

function isElder(entity: Entity): boolean {
  return !entity.isJuvenile && entity.age >= HUMAN_VENERABLE_AGE;
}

function isMedicallyVulnerable(entity: Entity): boolean {
  return !!entity.pregnant || entity.energy < entity.maxEnergy * 0.5;
}

function medicalVulnerabilityBoost(entity: Entity): number {
  if (entity.pregnant) return 0.25;
  if (entity.energy < entity.maxEnergy * 0.3) return 0.3;
  return 0;
}

function isBirthdayToday(entity: Entity, dayInYear: number): boolean {
  if (entity.birthDay == null || !Number.isFinite(entity.birthDay)) return false;
  const birthDayInYear = ((Math.floor(entity.birthDay) % DAYS_PER_YEAR) + DAYS_PER_YEAR) % DAYS_PER_YEAR;
  return birthDayInYear === dayInYear;
}

function absDaySalt(tick: number): number {
  return Math.floor(tick / TICKS_PER_DAY) * 17;
}

function isActivelyMarried(entity: Entity): boolean {
  return entity.relationshipStatus === 'married' || entity.relationshipStatus === 'expecting';
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
  nearbyKids: readonly Entity[],
): SocialImpulse {
  if (!entity.alive) return { motive: 'none' };

  const tick = state.tick;
  const hour = getHourOfDay(tick);
  const weekday = getWeekday(tick);
  const onShift = isOnWorkScheduleShift(state, hour);

  // 1. Sick / Exhausted — Rest at home
  if (isExhausted(entity) && hasResidenceAssignment(entity)) {
    return {
      motive: 'sick_day',
      stayHome: true,
      bubble: personDayRoll(entity.id, tick, 701) < 0.5 ? 'I need rest…' : 'Not feeling well.',
    };
  }

  // 2. Grief — Quiet days at home or prayer at church
  if (isGrieving(entity, tick)) {
    const church = pickBuilding(buildings, [BuildingType.Church], entity.id + 3);
    if (church && personDayRoll(entity.id, tick, 702) < 0.4 && hour >= 9 && hour < 18) {
      return {
        motive: 'grief',
        building: church,
        bubble: personDayRoll(entity.id, tick, 703) < 0.5 ? 'I miss them…' : 'A quiet prayer.',
      };
    }
    return {
      motive: 'grief',
      stayHome: hasResidenceAssignment(entity),
      bubble: 'Leave me a while…',
    };
  }

  // 3. Bad Weather — Shelter indoors
  if (
    isHarshWeather(state.weather) &&
    hasResidenceAssignment(entity) &&
    personDayRoll(entity.id, tick, 704) < SOCIAL_IMPULSE_CONFIG.HARSH_WEATHER_STAY_HOME_CHANCE
  ) {
    let weatherBubble = 'Dust and heat.';
    if (state.weather === WeatherType.Storm) weatherBubble = 'Awful storm.';
    else if (state.weather === WeatherType.Snow) weatherBubble = 'Too cold out.';
    else if (state.weather === WeatherType.Rain) weatherBubble = 'Rain… maybe later.';

    return {
      motive: 'bad_weather',
      stayHome: true,
      bubble: weatherBubble,
    };
  }

  // 4. Elder Rest — Senior settlers take porch rest
  if (isElder(entity) && hasResidenceAssignment(entity) && personDayRoll(entity.id, tick, 705) < 0.38) {
    return {
      motive: 'elder_rest',
      stayHome: true,
      bubble: personDayRoll(entity.id, tick, 706) < 0.4 ? 'My knees…' : 'Porch is fine.',
    };
  }

  // 5. Partner Care (Pregnant Spouse) — Active marriage only
  const spouse = isActivelyMarried(entity) && entity.partnerId != null
    ? nearbyAdults.find((h) => h.id === entity.partnerId && h.alive && isActivelyMarried(h))
    : undefined;

  if (spouse?.pregnant && personDayRoll(entity.id, tick, 707) < 0.55) {
    const hospital = pickBuilding(buildings, [BuildingType.Hospital], entity.id);
    if (hospital && personDayRoll(entity.id, tick, 708) < 0.35) {
      return {
        motive: 'care_pregnant',
        building: hospital,
        company: spouse,
        bubble: 'Easy now…',
      };
    }
    return {
      motive: 'care_pregnant',
      company: spouse,
      bubble: 'How are you feeling?',
    };
  }

  // Pregnant self care
  if (entity.pregnant && personDayRoll(entity.id, tick, 709) < 0.45) {
    const hospital = pickBuilding(buildings, [BuildingType.Hospital], entity.id + 1);
    if (hospital && hour >= 10 && hour < 17) {
      return { motive: 'hospital_visit', building: hospital, bubble: 'Check-up…' };
    }
    if (hasResidenceAssignment(entity) && hour >= EVENING_START) {
      return { motive: 'care_pregnant', stayHome: true, bubble: 'Need to sit.' };
    }
  }

  // 6. Sunday Service (Sunday = day 6)
  if (weekday === 6 && hour >= 9 && hour < 13) {
    const church = pickBuilding(buildings, [BuildingType.Church], entity.id + absDaySalt(tick));
    if (church && personDayRoll(entity.id, tick, 710) < SOCIAL_IMPULSE_CONFIG.SUNDAY_SERVICE_ATTEND_CHANCE) {
      return {
        motive: 'sunday_service',
        building: church,
        bubble: personDayRoll(entity.id, tick, 711) < 0.5 ? 'Bless this day.' : 'Amen.',
      };
    }
  }

  // 7. Civic Petition — Visit Town Hall (including post-scandal counseling)
  const hall = pickBuilding(buildings, [BuildingType.TownHall], entity.id + 9);
  if (hall && hall.occupants.length > 0 && hour >= 9 && hour < 18 && personDayRoll(entity.id, tick, 730) < 0.32) {
    const needAid =
      state.resources.food < Math.max(50, state.humanPopulation * 2.5) ||
      isGrieving(entity, tick) ||
      (entity.scandalCooldownUntilTick ?? 0) > tick ||
      entity.energy < entity.maxEnergy * 0.5;

    if (needAid || personDayRoll(entity.id, tick, 731) < 0.15) {
      return {
        motive: 'civic_petition',
        building: hall,
        bubble: isGrieving(entity, tick)
          ? 'I must speak to the hall…'
          : state.resources.food < state.humanPopulation * 2
            ? 'We need grain stores…'
            : 'A petition for the officials.',
      };
    }
  }

  // 8. Hospital Visit (when staffed)
  const hospital = pickBuilding(buildings, [BuildingType.Hospital], entity.id + 11);
  if (
    hospital &&
    hospital.occupants.length > 0 &&
    isMedicallyVulnerable(entity) &&
    personDayRoll(entity.id, tick, 732) < 0.5 + medicalVulnerabilityBoost(entity)
  ) {
    return {
      motive: 'hospital_visit',
      building: hospital,
      bubble: entity.pregnant ? 'The midwives…' : 'I need a doctor.',
    };
  }

  // 9. Birthday Mood
  if (isBirthdayToday(entity, state.dayInYear) && personDayRoll(entity.id, tick, 712) < 0.65) {
    const tavern = pickBuilding(buildings, [BuildingType.Tavern, BuildingType.Market], entity.id);
    return {
      motive: 'birthday',
      building: tavern,
      bubble: 'It is my day!',
    };
  }

  // 10. Market & Well Errands (during free daytime)
  if (!onShift && hour >= 8 && hour <= 18 && personDayRoll(entity.id, tick, 713) < 0.28) {
    const market = pickBuilding(
      buildings,
      [BuildingType.Market, BuildingType.Store, BuildingType.Well],
      entity.id + absDaySalt(tick),
    );
    if (market) {
      return {
        motive: 'market_errand',
        building: market,
        bubble:
          market.type === BuildingType.Well
            ? 'Need water.'
            : personDayRoll(entity.id, tick, 714) < 0.5
              ? 'A few errands.'
              : 'What is the price?',
      };
    }
  }

  // 11. Comfort Neighbor
  const weary = nearbyAdults.find(
    (h) =>
      h.id !== entity.id &&
      h.alive &&
      h.prisonBuildingId == null &&
      h.energy < h.maxEnergy * SOCIAL_IMPULSE_CONFIG.WEARY_ENERGY_RATIO &&
      personDayRoll(entity.id, tick, 715 + h.id) < 0.5,
  );
  if (weary && personDayRoll(entity.id, tick, 716) < 0.22) {
    return {
      motive: 'comfort_neighbor',
      company: weary,
      bubble: personDayRoll(entity.id, tick, 717) < 0.5 ? 'You look tired.' : 'I am here.',
    };
  }

  // 12. Kids Play (strictly with another living child)
  if (entity.isJuvenile) {
    const playmates = nearbyKids.filter((k) => k.id !== entity.id && k.alive);
    if (playmates.length > 0 && personDayRoll(entity.id, tick, 718) < 0.72) {
      const mate = playmates[(entity.id + Math.floor(tick / 12)) % playmates.length]!;
      return {
        motive: 'kid_play',
        company: mate,
        bubble: personDayRoll(entity.id, tick, 719) < 0.5 ? 'Tag!' : 'Wait for me!',
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
  if (!entity.alive || !onDayShift || hour < 11 || hour > 13) return;
  if (isDialogueBusy(entity)) return;

  const banterChance = entity.traits?.includes('intuitive') ? 0.11 : 0.08;
  if (personDayRoll(entity.id, tick, 720) > banterChance) return;

  const mate = coworkers.find((c) => c.id !== entity.id && c.alive && !isDialogueBusy(c));
  if (!mate) {
    sayHumanChatPhrase(
      entity,
      personDayRoll(entity.id, tick, 721) < 0.5 ? 'Long morning.' : 'Almost midday.',
      SOCIAL_IMPULSE_CONFIG.CHAT_BUBBLE_TICKS_SHORT,
    );
    return;
  }

  sayHumanChatPhrase(
    entity,
    personDayRoll(entity.id, tick, 722) < 0.5 ? 'How is it going?' : 'Steady work.',
    SOCIAL_IMPULSE_CONFIG.CHAT_BUBBLE_TICKS_NORMAL,
  );
  sayHumanChatPhrase(
    mate,
    personDayRoll(mate.id, tick, 723) < 0.5 ? 'Same as ever.' : 'Could be worse.',
    SOCIAL_IMPULSE_CONFIG.CHAT_BUBBLE_TICKS_NORMAL,
  );
}

/** Doorstep greeting between neighbors passing near home. */
export function tryNeighborGreeting(
  entity: Entity,
  other: Entity | null | undefined,
  tick: number,
  hour: number,
): void {
  if (!entity.alive || !other || !other.alive || other.id === entity.id) return;
  if (hour < 6 || hour > 9) return;
  if (isDialogueBusy(entity) || isDialogueBusy(other)) return;
  if (personDayRoll(entity.id, tick, 724 + other.id) > 0.12) return;

  const dx = entity.x - other.x;
  const dy = entity.y - other.y;
  const distSq = dx * dx + dy * dy;

  if (
    distSq > SOCIAL_IMPULSE_CONFIG.GREETING_MAX_DIST_SQ ||
    distSq < SOCIAL_IMPULSE_CONFIG.GREETING_MIN_DIST_SQ
  ) {
    return;
  }

  sayHumanChatPhrase(
    entity,
    personDayRoll(entity.id, tick, 725) < 0.5 ? 'Morning!' : 'Good day.',
    SOCIAL_IMPULSE_CONFIG.CHAT_BUBBLE_TICKS_SHORT,
  );
}