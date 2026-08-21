/**
 * Human-like free-time social impulses — weather, illness, grief, Sunday church,
 * market errands, partner care, kids at play, neighbor comfort.
 * Called from lifeSimulation free-time AI; does not own movement kinematics.
 */
import type { Building, Entity, WorldState } from './gameTypes';
import { BuildingType, WeatherType } from './gameTypes';
import {
  EVENING_START,
  HUMAN_VENERABLE_AGE,
  TICKS_PER_DAY,
  getHourOfDay,
  getWeekday,
  hasResidenceAssignment,
  personDayRoll,
} from './dayCycle';
import { isDialogueBusy, sayHumanChatPhrase } from './humanChat';
import { getWorkSchedule, isWorkScheduleHour } from './workSchedule';

export type SocialMotive =
  | 'sick_day'
  | 'grief'
  | 'bad_weather'
  | 'elder_rest'
  | 'sunday_service'
  | 'market_errand'
  | 'care_pregnant'
  | 'hospital_visit'
  | 'comfort_neighbor'
  | 'kid_play'
  | 'birthday'
  | 'none';

export interface SocialImpulse {
  motive: SocialMotive;
  /** Optional building to steer toward (center-ish handled by caller). */
  building?: Building;
  /** Optional person to walk with / comfort. */
  company?: Entity;
  /** Suggest staying near home porch. */
  stayHome?: boolean;
  /** Floating text / chat flavor */
  bubble?: string;
}

function isHarshWeather(weather: WorldState['weather']): boolean {
  return (
    weather === WeatherType.Storm
    || weather === WeatherType.Snow
    || weather === WeatherType.Rain
    || weather === WeatherType.Drought
  );
}

function completedOf(
  buildings: readonly Building[],
  types: BuildingType[],
): Building[] {
  return buildings.filter(
    (b) => b.completed && b.faction !== 'rival' && types.includes(b.type),
  );
}

function pickBuilding(
  buildings: readonly Building[],
  types: BuildingType[],
  salt: number,
): Building | undefined {
  const pool = completedOf(buildings, types);
  if (pool.length === 0) return undefined;
  return pool[Math.abs(salt) % pool.length];
}

function isGrieving(entity: Entity, tick: number): boolean {
  return (entity.griefUntilTick ?? 0) > tick;
}

function isExhausted(entity: Entity): boolean {
  return entity.energy < entity.maxEnergy * 0.28;
}

function isElder(entity: Entity): boolean {
  return !entity.isJuvenile && entity.age >= HUMAN_VENERABLE_AGE;
}

function medicalish(entity: Entity): boolean {
  if (entity.pregnant) return true;
  return entity.energy < entity.maxEnergy * 0.5;
}

function medicalishBoost(entity: Entity): number {
  if (entity.pregnant) return 0.25;
  if (entity.energy < entity.maxEnergy * 0.3) return 0.3;
  return 0;
}

/** Colony-day birthday (matches birthDay field, 0–359). */
function isBirthdayToday(entity: Entity, dayInYear: number): boolean {
  if (entity.birthDay == null || !Number.isFinite(entity.birthDay)) return false;
  return Math.floor(entity.birthDay) === dayInYear;
}

/**
 * Pick the strongest social motive for this free-time tick.
 * Stable-ish rolls keep people from flipping every hour.
 */
export function pickSocialImpulse(
  entity: Entity,
  state: WorldState,
  buildings: readonly Building[],
  nearbyAdults: readonly Entity[],
  nearbyKids: readonly Entity[],
): SocialImpulse {
  const tick = state.tick;
  const hour = getHourOfDay(tick);
  const weekday = getWeekday(tick);

  // 1) Sick / exhausted — rest at home
  if (isExhausted(entity) && hasResidenceAssignment(entity)) {
    return {
      motive: 'sick_day',
      stayHome: true,
      bubble: personDayRoll(entity.id, tick, 701) < 0.5 ? 'I need rest…' : 'Not feeling well.',
    };
  }

  // 2) Grief — quiet days at home or church
  if (isGrieving(entity, tick)) {
    const church = pickBuilding(buildings, [BuildingType.Church], entity.id + 3);
    if (church && personDayRoll(entity.id, tick, 702) < 0.4 && hour >= 9 && hour < 18) {
      return {
        motive: 'grief',
        building: church,
        bubble: personDayRoll(entity.id, tick, 703) < 0.5 ? 'I miss them…' : 'A quiet prayer.',
      };
    }
    if (hasResidenceAssignment(entity)) {
      return {
        motive: 'grief',
        stayHome: true,
        bubble: 'Leave me a while…',
      };
    }
  }

  // 3) Bad weather — stay in more often
  if (
    isHarshWeather(state.weather)
    && hasResidenceAssignment(entity)
    && personDayRoll(entity.id, tick, 704) < 0.62
  ) {
    return {
      motive: 'bad_weather',
      stayHome: true,
      bubble:
        state.weather === WeatherType.Storm ? 'Awful storm.'
          : state.weather === WeatherType.Snow ? 'Too cold out.'
            : state.weather === WeatherType.Rain ? 'Rain… maybe later.'
              : 'Dust and heat.',
    };
  }

  // 4) Elders rest more in free time
  if (isElder(entity) && hasResidenceAssignment(entity) && personDayRoll(entity.id, tick, 705) < 0.38) {
    return {
      motive: 'elder_rest',
      stayHome: true,
      bubble: personDayRoll(entity.id, tick, 706) < 0.4 ? 'My knees…' : 'Porch is fine.',
    };
  }

  // 5) Care for pregnant partner — walk them gently or to hospital
  const spouse = nearbyAdults.find((h) => h.id === entity.partnerId && h.alive);
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

  // Pregnant self — prefer hospital / home when evening
  if (entity.pregnant && personDayRoll(entity.id, tick, 709) < 0.45) {
    const hospital = pickBuilding(buildings, [BuildingType.Hospital], entity.id + 1);
    if (hospital && hour >= 10 && hour < 17) {
      return { motive: 'hospital_visit', building: hospital, bubble: 'Check-up…' };
    }
    if (hasResidenceAssignment(entity) && hour >= EVENING_START) {
      return { motive: 'care_pregnant', stayHome: true, bubble: 'Need to sit.' };
    }
  }

  // 6) Sunday service (weekday 6) morning/midday
  if (weekday === 6 && hour >= 9 && hour < 13) {
    const church = pickBuilding(buildings, [BuildingType.Church], entity.id + absDaySalt(tick));
    if (church && personDayRoll(entity.id, tick, 710) < 0.7) {
      return {
        motive: 'sunday_service',
        building: church,
        bubble: personDayRoll(entity.id, tick, 711) < 0.5 ? 'Bless this day.' : 'Amen.',
      };
    }
  }

  // 6b) Civic petition — food stress, grief, scandal, or daily errand to the hall
  const hall = pickBuilding(buildings, [BuildingType.TownHall], entity.id + 9);
  if (
    hall
    && hall.occupants.length > 0
    && hour >= 9
    && hour < 18
    && personDayRoll(entity.id, tick, 730) < 0.32
  ) {
    const needAid =
      state.resources.food < Math.max(50, state.humanPopulation * 2.5)
      || isGrieving(entity, tick)
      || (entity.scandalCooldownUntilTick ?? 0) > tick
      || entity.energy < entity.maxEnergy * 0.5;
    if (needAid || personDayRoll(entity.id, tick, 731) < 0.15) {
      return {
        motive: 'market_errand', // reuse building visit path; bubble is civic
        building: hall,
        bubble:
          isGrieving(entity, tick) ? 'I must speak to the hall…'
            : state.resources.food < state.humanPopulation * 2 ? 'We need grain stores…'
              : 'A petition for the officials.',
      };
    }
  }

  // 6c) Stronger hospital pull when staffed and sick/pregnant
  const hospital = pickBuilding(buildings, [BuildingType.Hospital], entity.id + 11);
  if (
    hospital
    && hospital.occupants.length > 0
    && medicalish(entity)
    && personDayRoll(entity.id, tick, 732) < 0.5 + medicalishBoost(entity)
  ) {
    return {
      motive: 'hospital_visit',
      building: hospital,
      bubble: entity.pregnant ? 'The midwives…' : 'I need a doctor.',
    };
  }

  // 7) Birthday mood
  if (isBirthdayToday(entity, state.dayInYear) && personDayRoll(entity.id, tick, 712) < 0.65) {
    const tavern = pickBuilding(buildings, [BuildingType.Tavern, BuildingType.Market], entity.id);
    return {
      motive: 'birthday',
      building: tavern,
      bubble: 'It is my day!',
    };
  }

  // 8) Market errand — stable daily chance in free daylight
  if (
    isWorkScheduleHour(getWorkSchedule(state), hour)
    && hour < getWorkSchedule(state).endHour
    && personDayRoll(entity.id, tick, 713) < 0.28
  ) {
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
          market.type === BuildingType.Well ? 'Need water.'
            : personDayRoll(entity.id, tick, 714) < 0.5 ? 'A few errands.' : 'What is the price?',
      };
    }
  }

  // 9) Comfort a low-energy neighbor
  const weary = nearbyAdults.find(
    (h) =>
      h.id !== entity.id
      && h.alive
      && h.energy < h.maxEnergy * 0.4
      && personDayRoll(entity.id, tick, 715 + h.id) < 0.5,
  );
  if (weary && personDayRoll(entity.id, tick, 716) < 0.22) {
    return {
      motive: 'comfort_neighbor',
      company: weary,
      bubble: personDayRoll(entity.id, tick, 717) < 0.5 ? 'You look tired.' : 'I am here.',
    };
  }

  // 10) Kids want playmates
  if (entity.isJuvenile && nearbyKids.length > 0 && personDayRoll(entity.id, tick, 718) < 0.72) {
    const mate = nearbyKids[(entity.id + Math.floor(tick / 12)) % nearbyKids.length]!;
    return {
      motive: 'kid_play',
      company: mate,
      bubble: personDayRoll(entity.id, tick, 719) < 0.5 ? 'Tag!' : 'Wait for me!',
    };
  }

  return { motive: 'none' };
}

function absDaySalt(tick: number): number {
  return Math.floor(tick / TICKS_PER_DAY) * 17;
}

/** Soft midday chat while on a day job — coworkers share a quiet moment. */
export function tryWorkplaceBanter(
  entity: Entity,
  coworkers: readonly Entity[],
  tick: number,
  hour: number,
  onDayShift: boolean,
): void {
  if (!onDayShift || hour < 11 || hour > 13) return;
  if (isDialogueBusy(entity)) return;
  // Intuitive settlers pick up on the room better — they banter more often.
  const banterChance = entity.traits?.includes('intuitive') ? 0.11 : 0.08;
  if (personDayRoll(entity.id, tick, 720) > banterChance) return;
  const mate = coworkers.find((c) => c.id !== entity.id && !isDialogueBusy(c));
  if (!mate) {
    sayHumanChatPhrase(entity, personDayRoll(entity.id, tick, 721) < 0.5 ? 'Long morning.' : 'Almost midday.', 40);
    return;
  }
  sayHumanChatPhrase(entity, personDayRoll(entity.id, tick, 722) < 0.5 ? 'How is it going?' : 'Steady work.', 50);
  sayHumanChatPhrase(mate, personDayRoll(mate.id, tick, 723) < 0.5 ? 'Same as ever.' : 'Could be worse.', 50);
}

/** Morning doorstep greeting when two free settlers pass near home. */
export function tryNeighborGreeting(
  entity: Entity,
  other: Entity | null | undefined,
  tick: number,
  hour: number,
): void {
  if (!other || other.id === entity.id) return;
  if (hour < 6 || hour > 9) return;
  if (isDialogueBusy(entity) || isDialogueBusy(other)) return;
  if (personDayRoll(entity.id, tick, 724 + other.id) > 0.12) return;
  const dist = Math.hypot(entity.x - other.x, entity.y - other.y);
  if (dist > 28 || dist < 4) return;
  sayHumanChatPhrase(
    entity,
    personDayRoll(entity.id, tick, 725) < 0.5 ? 'Morning!' : 'Good day.',
    36,
  );
}
