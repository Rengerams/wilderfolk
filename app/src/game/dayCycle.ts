import { BuildingType, BUILDING_CONFIGS, EntityType } from './gameTypes';
import type { Building, Entity } from './gameTypes';

/** 24 ticks = one in-game day. At 1× speed (~1 tick/s) a day lasts ~24 real seconds. */
export const TICKS_PER_DAY = 24;
export const DAYS_PER_YEAR = 360;
/** Full moon hits every ~2 in-game weeks */
export const DAYS_PER_MOON_CYCLE = 14;

export const GAME_YEAR_OFFSET = 1700;
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export function ticksForDays(days: number): number {
  return Math.round(days * TICKS_PER_DAY);
}

/** Life stages — children mature in ~1 game year; adults gain 1 life-year per game year. */
export const HUMAN_CHILDHOOD_DAYS = 12;

/** Promote a child to adult size/speed once — returns true on the graduation tick. */
export function tryGraduateHumanChild(
  entity: Entity,
  adultSize: number,
  adultSpeed: number,
  onGraduate?: (entity: Entity) => void,
): boolean {
  if (!entity.isJuvenile || entity.age < HUMAN_CHILDHOOD_DAYS) return false;
  entity.isJuvenile = false;
  entity.size = adultSize;
  entity.speed = adultSpeed;
  onGraduate?.(entity);
  return true;
}
export const HUMAN_ADULT_MIN_AGE = 16;
/** Adult children may leave the parental home at this age when a house is free. */
export const HUMAN_MOVE_OUT_MIN_AGE = 18;

/** Female fertility window. Fertility is 1.0 until peak end, then linearly declines to 0. */
export const HUMAN_FERTILITY_START = 16;
export const HUMAN_FERTILITY_PEAK_END = 35;
export const HUMAN_FERTILITY_END = 50;

export function getFemaleFertility(age: number): number {
  if (age < HUMAN_FERTILITY_START || age >= HUMAN_FERTILITY_END) return 0;
  if (age <= HUMAN_FERTILITY_PEAK_END) return 1;
  return 1 - (age - HUMAN_FERTILITY_PEAK_END) / (HUMAN_FERTILITY_END - HUMAN_FERTILITY_PEAK_END);
}

/** Children age faster so they mature in ~1 game year; adults age 1 year per game year. */
export const JUVENILE_DAYS_PER_AGE_YEAR = 30;
export const ADULT_DAYS_PER_AGE_YEAR = DAYS_PER_YEAR;

/** Old-age death thresholds in life-years (1 game year ≈ 1 life-year for adults). */
export const HUMAN_VENERABLE_AGE = 70;
export const HUMAN_MAX_LIFESPAN_YEARS = 90;
/** Upper bound for courtship / affairs — matches life-year lifespan cap. */
export const HUMAN_ADULT_MAX_AGE = HUMAN_MAX_LIFESPAN_YEARS;
/** @deprecated Use HUMAN_MAX_LIFESPAN_YEARS — life-years, not colony days. */
export const HUMAN_MAX_LIFESPAN_DAYS = HUMAN_MAX_LIFESPAN_YEARS;

export function getColonyDay(state: { year: number; dayInYear: number }): number {
  return state.year * DAYS_PER_YEAR + state.dayInYear;
}

export function daysLivedFromAgeYears(ageYears: number): number {
  if (ageYears <= HUMAN_CHILDHOOD_DAYS) {
    return ageYears * JUVENILE_DAYS_PER_AGE_YEAR;
  }
  return HUMAN_CHILDHOOD_DAYS * JUVENILE_DAYS_PER_AGE_YEAR
    + (ageYears - HUMAN_CHILDHOOD_DAYS) * ADULT_DAYS_PER_AGE_YEAR;
}

/** Set birth calendar from a target life-age at a given colony day. */
export function setHumanBirthFromAge(
  entity: Entity,
  ageYears: number,
  colonyDay: number,
  month?: number,
  day?: number,
): void {
  const daysLived = daysLivedFromAgeYears(Math.max(0, ageYears));
  const birthColonyDay = colonyDay - daysLived;
  entity.birthYear = Math.floor(birthColonyDay / DAYS_PER_YEAR);
  entity.birthDay = ((birthColonyDay % DAYS_PER_YEAR) + DAYS_PER_YEAR) % DAYS_PER_YEAR;
  if (day !== undefined) entity.birthDay = day;
  if (month !== undefined) {
    entity.birthMonth = month;
  } else if (day !== undefined) {
    entity.birthMonth = Math.floor(day / 30);
  } else {
    entity.birthMonth = Math.floor(entity.birthDay / 30);
  }
  entity.age = Math.max(0, ageYears);
  entity.isJuvenile = entity.age < HUMAN_CHILDHOOD_DAYS;
  entity.maxAge = HUMAN_MAX_LIFESPAN_YEARS;
}

export function computeHumanAgeYears(
  entity: Entity,
  colonyDay: number,
  options?: { schoolAgeMultiplier?: number },
): number {
  if (!Number.isFinite(entity.birthYear) || !Number.isFinite(entity.birthDay)) {
    return Math.max(0, entity.age);
  }
  const birthColonyDay = entity.birthYear * DAYS_PER_YEAR + entity.birthDay;
  let daysLived = Math.max(0, colonyDay - birthColonyDay);
  const juvenileSpan = HUMAN_CHILDHOOD_DAYS * JUVENILE_DAYS_PER_AGE_YEAR;
  const schoolMult = options?.schoolAgeMultiplier ?? 1;
  if (schoolMult > 1 && daysLived < juvenileSpan) {
    daysLived = Math.min(daysLived * schoolMult, juvenileSpan);
  }
  if (daysLived < juvenileSpan) {
    return Math.floor(daysLived / JUVENILE_DAYS_PER_AGE_YEAR);
  }
  const adultDays = daysLived - juvenileSpan;
  return HUMAN_CHILDHOOD_DAYS + Math.floor(adultDays / ADULT_DAYS_PER_AGE_YEAR);
}

export function syncHumanAgeFromCalendar(
  entity: Entity,
  state: { year: number; dayInYear: number },
  options?: { schoolAgeMultiplier?: number },
): void {
  if (entity.type !== EntityType.Human) return;
  entity.age = computeHumanAgeYears(entity, getColonyDay(state), options);
  entity.maxAge = HUMAN_MAX_LIFESPAN_YEARS;
}

export function getOldAgeDeathChance(age: number): number {
  if (age < HUMAN_VENERABLE_AGE) return 0;
  if (age >= HUMAN_MAX_LIFESPAN_YEARS) return 1;
  return 0.02 + (age - HUMAN_VENERABLE_AGE) / (HUMAN_MAX_LIFESPAN_YEARS - HUMAN_VENERABLE_AGE) * 0.98;
}

/** Small daily chance for an adult to die from illness or accident regardless of age. */
export const HUMAN_DAILY_ILLNESS_CHANCE = 0.00012;

/**
 * Once-per-calendar-day conception rolls (not per tick).
 * Tuned for ~1 birth per married couple per game year when housed together.
 */
export const HUMAN_DAILY_PREGNANCY_CHANCE_HOME = 0.008;
export const HUMAN_DAILY_PREGNANCY_CHANCE_NEAR = 0.003;
export const HUMAN_DAILY_AFFAIR_PREGNANCY_CHANCE = 0.01;

export const PREGNANCY_TICKS = ticksForDays(60);
export const REPRODUCTION_COOLDOWN_TICKS = ticksForDays(150);

/** Building output intervals tied to the day/night calendar. */
export const PRODUCTION_INTERVAL = {
  farm: ticksForDays(1),
  greenhouse: ticksForDays(1),
  lumber: ticksForDays(1),
  quarry: ticksForDays(1),
  mine: ticksForDays(1),
  store: ticksForDays(2),
  market: ticksForDays(2),
  workshop: ticksForDays(2),
  silo: ticksForDays(2),
  townHall: ticksForDays(3),
  hospital: ticksForDays(5),
} as const;

export const IMMIGRATION_CHECK_TICKS = ticksForDays(2);
export const FESTIVAL_CHECK_TICKS = ticksForDays(50);

/** Calendar-aligned event intervals (replace legacy raw tick modulo). */
export const EVENT_INTERVAL = {
  disaster: ticksForDays(40),
  tradeRoute: ticksForDays(8),
  churchCure: ticksForDays(1),
  wolfRecruit: ticksForDays(21),
  tamedHuntAssist: ticksForDays(3),
} as const;

export const NIGHT_START = 20;
export const NIGHT_END = 6;
export const WORK_START = 7;
export const WORK_END = 19;
export const EVENING_START = 19;

/** Work hours per game-day (7am–7pm) — construction only advances during these ticks. */
export const WORK_HOURS_PER_DAY = WORK_END - WORK_START;

/** Total on-site work ticks to finish a building (buildTime in config = game-days). */
export function buildWorkTicks(buildDays: number): number {
  return Math.max(WORK_HOURS_PER_DAY, Math.round(buildDays * WORK_HOURS_PER_DAY));
}

/** Production fires at the start of the work-day, every `interval` ticks. */
export function isProductionTick(tick: number, interval: number): boolean {
  if (tick <= 0 || interval <= 0) return false;
  if (getHourOfDay(tick) !== WORK_START) return false;
  const workDayTick = tick - WORK_START;
  return workDayTick % interval === 0;
}

export function getHourOfDay(tick: number): number {
  return ((tick % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY;
}

export function getCalendarDay(tick: number): number {
  if (tick <= 0) return 0;
  return Math.floor(tick / TICKS_PER_DAY) % 360;
}

/** Monotonic colony day index (never wraps within a save). */
export function getAbsoluteCalendarDay(tick: number): number {
  return Math.floor(tick / TICKS_PER_DAY);
}

/** True once per in-game day; skips reload mid-day and duplicate same-tick calls. */
export function isNewCalendarDayTick(state: import('./gameTypes').WorldState): boolean {
  if (state.tick <= 0 || state.tick % TICKS_PER_DAY !== 0) return false;
  const day = getAbsoluteCalendarDay(state.tick);
  return day > (state.lastProcessedCalendarDay ?? -1);
}

export function markCalendarDayProcessed(state: import('./gameTypes').WorldState): void {
  if (state.tick > 0 && state.tick % TICKS_PER_DAY === 0) {
    state.lastProcessedCalendarDay = getAbsoluteCalendarDay(state.tick);
  }
}

/** Get birth date string from entity birth fields */
export function getBirthDateString(entity: { birthYear: number; birthMonth: number; birthDay: number }): string {
  const realYear = GAME_YEAR_OFFSET + entity.birthYear;
  const monthIndex = Number.isFinite(entity.birthMonth)
    ? entity.birthMonth
    : Math.floor(entity.birthDay / 30);
  const month = ((monthIndex % 12) + 12) % 12;
  const dayOfMonth = (entity.birthDay % 30) + 1;
  return `${MONTH_NAMES[month]} ${dayOfMonth}, ${realYear}`;
}

/** @param colonyDay Absolute colony day (year × DAYS_PER_YEAR + dayInYear), never wrapping per year. */
export function isFullMoonDay(colonyDay: number): boolean {
  return colonyDay % DAYS_PER_MOON_CYCLE === 0;
}

/** Full-moon night spans 8pm on a full-moon day through 6am the next morning. */
export function isFullMoonNight(colonyDay: number, hourOfDay: number): boolean {
  if (!isNightHour(hourOfDay)) return false;
  if (isFullMoonDay(colonyDay)) return true;
  if (hourOfDay < NIGHT_END) {
    return isFullMoonDay(colonyDay - 1);
  }
  return false;
}

export function isNightHour(hour: number): boolean {
  return hour >= NIGHT_START || hour < NIGHT_END;
}

export function isWorkHour(hour: number): boolean {
  return hour >= WORK_START && hour < WORK_END;
}

export function shouldBeAtHome(hour: number): boolean {
  return isNightHour(hour) || hour >= EVENING_START || hour < WORK_START;
}

export function formatHour(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const suffix = h < 12 ? 'am' : 'pm';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}${suffix}`;
}

export function isResidenceBuilding(b: Building): boolean {
  return b.completed && (b.type === BuildingType.House || b.type === BuildingType.Mansion);
}

export function isResidenceBuildingType(type: BuildingType): boolean {
  return type === BuildingType.House || type === BuildingType.Mansion;
}

/** Base occupants + bonus from house/mansion upgrades (+2 slots per level above 1). */
export function getResidenceCapacity(residence: Building): number {
  const base = BUILDING_CONFIGS[residence.type].maxOccupants;
  if (!isResidenceBuildingType(residence.type)) return base;
  const level = residence.level || 1;
  return base + (level - 1) * 2;
}

export function getResidenceUpgradeSlotGain(type: BuildingType): number {
  return isResidenceBuildingType(type) ? 2 : 0;
}

/** Building id 0 is valid — never use bare `!id` for assignment checks. */
export function hasWorkAssignment(human: Entity): boolean {
  return human.homeBuildingId != null;
}

export function hasResidenceAssignment(human: Entity): boolean {
  return human.residenceBuildingId != null;
}

export function isImprisoned(human: Entity): boolean {
  return human.prisonBuildingId != null;
}

export function shareResidence(a: Entity, b: Entity): boolean {
  return (
    hasResidenceAssignment(a)
    && hasResidenceAssignment(b)
    && a.residenceBuildingId === b.residenceBuildingId
  );
}

export function isNearResidence(
  human: Entity,
  buildings: Building[],
  maxDist = 55,
): boolean {
  if (!hasResidenceAssignment(human)) return false;
  const residence = buildings.find(
    (b) => b.id === human.residenceBuildingId && isResidenceBuilding(b),
  );
  if (!residence) return false;
  const cx = residence.x + residence.width / 2;
  const cy = residence.y + residence.height / 2;
  return Math.hypot(human.x - cx, human.y - cy) <= maxDist;
}

/** Evening/night/morning or unemployed — not while on a workplace commute. */
export function allowSocialLife(hour: number, hasWorkplace: boolean): boolean {
  return !(isWorkHour(hour) && hasWorkplace);
}

export function countResidentsInBuilding(humans: Entity[], buildingId: number): number {
  return humans.filter((h) => h.alive && !h.faction && h.residenceBuildingId === buildingId).length;
}

export function residenceHasCapacity(
  residence: Building,
  humans: Entity[],
): boolean {
  const cap = getResidenceCapacity(residence);
  return countResidentsInBuilding(humans, residence.id) < cap;
}

/** Whether this human can occupy the residence (accounts for them already holding a slot). */
export function residenceRoomFor(
  human: Entity,
  residence: Building,
  humans: Entity[],
): boolean {
  const cap = getResidenceCapacity(residence);
  let count = countResidentsInBuilding(humans, residence.id);
  if (human.residenceBuildingId === residence.id) count--;
  return count < cap;
}

interface PickResidenceOptions {
  forbidSinglesOnly?: boolean;
}

function listPlayerResidences(buildings: Building[]): Building[] {
  return buildings.filter((b) => isResidenceBuilding(b) && b.faction !== 'rival');
}

function pickLeastCrowdedResidence(
  humans: Entity[],
  residences: Building[],
  extraSlots = 1,
  options: PickResidenceOptions = {},
): number | undefined {
  let best: Building | undefined;
  let bestCount = Infinity;
  for (const residence of residences) {
    if (options.forbidSinglesOnly && residenceHostsOnlySingles(residence.id, humans)) continue;
    const cap = getResidenceCapacity(residence);
    const count = countResidentsInBuilding(humans, residence.id);
    if (count + extraSlots > cap) continue;
    if (count < bestCount || (count === bestCount && residence.id < (best?.id ?? Infinity))) {
      bestCount = count;
      best = residence;
    }
  }
  return best?.id;
}

function livingHuman(humans: Entity[], id: number | undefined): Entity | undefined {
  if (id === undefined) return undefined;
  return humans.find((h) => h.id === id && h.alive);
}

function humanById(humans: Entity[], id: number | undefined): Entity | undefined {
  if (id == null) return undefined;
  return humans.find((h) => h.id === id);
}

function isMinorChild(child: Entity): boolean {
  return child.isJuvenile || child.age < HUMAN_MOVE_OUT_MIN_AGE;
}

function livingAdoptiveCustodian(child: Entity, humans: Entity[]): Entity | undefined {
  const adoptiveMother = livingHuman(humans, child.adoptiveMotherId);
  if (adoptiveMother) return adoptiveMother;
  return livingHuman(humans, child.adoptiveFatherId);
}

function listVillageCouples(humans: Entity[]): Array<{ mother: Entity; father: Entity }> {
  const alive = humans.filter((h) => h.alive && !h.faction);
  const couples: Array<{ mother: Entity; father: Entity }> = [];
  const seen = new Set<number>();

  for (const human of alive.sort((a, b) => a.id - b.id)) {
    if (seen.has(human.id)) continue;
    const partner = livingHuman(alive, human.partnerId);
    if (!partner) continue;
    seen.add(human.id);
    seen.add(partner.id);
    const mother = human.gender === 'female'
      ? human
      : partner.gender === 'female'
        ? partner
        : human;
    const father = mother.id === human.id ? partner : human;
    couples.push({ mother, father });
  }

  return couples;
}

function pickRandomAdoptiveCouple(
  child: Entity,
  humans: Entity[],
): { mother: Entity; father: Entity } | undefined {
  const couples = listVillageCouples(humans);
  if (couples.length === 0) return undefined;
  const idx = Math.abs(child.id * 7919) % couples.length;
  return couples[idx];
}

function listVillageSingleAdults(humans: Entity[]): Entity[] {
  const alive = humans.filter((h) => h.alive && !h.faction && !h.isJuvenile);
  return alive.filter((h) => {
    const partner = livingHuman(alive, h.partnerId);
    return !partner;
  });
}

/** Stable foster pick when no married couples remain in the village. */
function pickRandomAdoptiveGuardian(child: Entity, humans: Entity[]): Entity | undefined {
  const singles = listVillageSingleAdults(humans).sort((a, b) => a.id - b.id);
  if (singles.length === 0) return undefined;
  return singles[Math.abs(child.id * 7919) % singles.length];
}

/**
 * Who a child lives with: mother first, then father.
 * Bastards with no living mother follow grandmother (maternal, then paternal).
 * If no kin remain, an adoptive village couple (stable random pick per child).
 */
export function getChildCustodian(child: Entity, humans: Entity[]): Entity | undefined {
  const mother = livingHuman(humans, child.motherId);
  if (mother) return mother;

  if (child.isBastard) {
    const motherRecord = humanById(humans, child.motherId);
    if (motherRecord?.motherId != null) {
      const maternalGrandmother = livingHuman(humans, motherRecord.motherId);
      if (maternalGrandmother) return maternalGrandmother;
    }
    const fatherRecord = humanById(humans, child.fatherId);
    if (fatherRecord?.motherId != null) {
      const paternalGrandmother = livingHuman(humans, fatherRecord.motherId);
      if (paternalGrandmother) return paternalGrandmother;
    }
  }

  const father = livingHuman(humans, child.fatherId);
  if (father) return father;

  return livingAdoptiveCustodian(child, humans);
}

function hasLivingNaturalCustodian(child: Entity, humans: Entity[]): boolean {
  if (livingHuman(humans, child.motherId)) return true;

  if (child.isBastard) {
    const motherRecord = humanById(humans, child.motherId);
    if (motherRecord?.motherId != null && livingHuman(humans, motherRecord.motherId)) return true;
    const fatherRecord = humanById(humans, child.fatherId);
    if (fatherRecord?.motherId != null && livingHuman(humans, fatherRecord.motherId)) return true;
  }

  return !!livingHuman(humans, child.fatherId);
}

function pickOrphanResidence(
  child: Entity,
  humans: Entity[],
  residences: Building[],
): number | undefined {
  const alive = humans.filter((h) => h.alive && !h.faction);
  const custodianHome = pickResidenceFromChildCustodian(child, humans, residences);
  if (custodianHome !== undefined) return custodianHome;

  let best: Building | undefined;
  let bestScore = Infinity;
  for (const residence of residences) {
    if (!residenceRoomFor(child, residence, alive)) continue;
    if (residenceHostsOnlySingles(residence.id, alive)) continue;
    const count = countResidentsInBuilding(alive, residence.id);
    let score = count;
    if (count === 0) score -= 100;
    if (residenceHostsCouple(residence.id, alive)) score -= 50;
    if (score < bestScore || (score === bestScore && residence.id < (best?.id ?? Infinity))) {
      bestScore = score;
      best = residence;
    }
  }
  return best?.id;
}

function placeOrphanInHouse(
  child: Entity,
  humans: Entity[],
  residences: Building[],
): boolean {
  const alive = humans.filter((h) => h.alive && !h.faction);
  if (hasResidenceAssignment(child)) {
    const current = residences.find((b) => b.id === child.residenceBuildingId);
    if (current && residenceRoomFor(child, current, alive)) return true;
  }

  const picked = pickOrphanResidence(child, humans, residences)
    ?? pickLeastCrowdedResidence(alive, residences, 1, { forbidSinglesOnly: true });
  if (picked === undefined) return false;

  child.residenceBuildingId = picked;
  return true;
}

/**
 * Mother → grandmas → father; else random adoptive couple.
 * If no married couples exist, place the orphan in any house with room.
 */
export function ensureOrphanAdoption(
  child: Entity,
  humans: Entity[],
  residences: Building[],
): boolean {
  if (!child.alive || child.faction || !isMinorChild(child)) return false;
  if (child.adoptiveMotherId != null || child.adoptiveFatherId != null) {
    if (hasLivingNaturalCustodian(child, humans) || livingAdoptiveCustodian(child, humans)) {
      if (!livingAdoptiveCustodian(child, humans)) {
        child.adoptiveMotherId = undefined;
        child.adoptiveFatherId = undefined;
      }
      return false;
    }
    child.adoptiveMotherId = undefined;
    child.adoptiveFatherId = undefined;
  }

  if (hasLivingNaturalCustodian(child, humans)) return false;

  if (livingAdoptiveCustodian(child, humans)) return false;

  child.adoptiveMotherId = undefined;
  child.adoptiveFatherId = undefined;

  const couple = pickRandomAdoptiveCouple(child, humans);
  if (couple) {
    child.adoptiveMotherId = couple.mother.id;
    child.adoptiveFatherId = couple.father.id;
    if (!couple.mother.childrenIds.includes(child.id)) couple.mother.childrenIds.push(child.id);
    if (!couple.father.childrenIds.includes(child.id)) couple.father.childrenIds.push(child.id);
    return true;
  }

  const guardian = pickRandomAdoptiveGuardian(child, humans);
  if (guardian) {
    if (guardian.gender === 'female') {
      child.adoptiveMotherId = guardian.id;
    } else {
      child.adoptiveFatherId = guardian.id;
    }
    if (!guardian.childrenIds.includes(child.id)) guardian.childrenIds.push(child.id);
    return true;
  }

  return placeOrphanInHouse(child, humans, residences);
}

export function pickResidenceFromChildCustodian(
  child: Entity,
  humans: Entity[],
  residences: Building[],
): number | undefined {
  const custodian = getChildCustodian(child, humans);
  if (!custodian || !hasResidenceAssignment(custodian)) return undefined;
  const residence = residences.find((b) => b.id === custodian.residenceBuildingId);
  if (!residence || !residenceRoomFor(child, residence, humans)) return undefined;
  return custodian.residenceBuildingId;
}

/** Married couples + children form one household; lone settlers are a household of one. */
export function collectFamilyMembers(
  seed: Entity,
  humans: Entity[],
  visited: Set<number>,
): Entity[] {
  const family: Entity[] = [];
  const queue: Entity[] = [seed];

  while (queue.length > 0) {
    const human = queue.pop()!;
    if (visited.has(human.id)) continue;
    visited.add(human.id);
    family.push(human);

    const partner = livingHuman(humans, human.partnerId);
    if (partner && !visited.has(partner.id)) queue.push(partner);

    const mother = livingHuman(humans, human.motherId);
    if (mother && !visited.has(mother.id)) queue.push(mother);

    const father = livingHuman(humans, human.fatherId);
    if (father && !visited.has(father.id)) queue.push(father);

    for (const childId of human.childrenIds) {
      const child = livingHuman(humans, childId);
      if (child && !visited.has(child.id)) queue.push(child);
    }

    for (const other of humans) {
      if (other.motherId === human.id || other.fatherId === human.id) {
        if (!visited.has(other.id)) queue.push(other);
      }
    }
  }

  return family;
}

/** One adult-led home: settler + spouse + their children (not parents or siblings). */
export function collectOwnHousehold(seed: Entity, humans: Entity[]): Entity[] {
  const household: Entity[] = [];
  const add = (human?: Entity) => {
    if (human?.alive && !household.some((m) => m.id === human.id)) household.push(human);
  };

  add(seed);
  const partner = livingHuman(humans, seed.partnerId);
  add(partner);
  for (const childId of seed.childrenIds ?? []) add(livingHuman(humans, childId));
  if (partner) {
    for (const childId of partner.childrenIds ?? []) add(livingHuman(humans, childId));
  }
  return household;
}

/** Housing assignment units — minors follow custodian; adults 18+ form their own household. */
export function buildHousingUnits(humans: Entity[]): Entity[][] {
  const alive = humans.filter((h) => h.alive && !h.faction);
  const visited = new Set<number>();
  const units: Entity[][] = [];
  const childrenByCustodian = new Map<number, Entity[]>();

  for (const child of alive) {
    if (!isMinorChild(child)) continue;
    const custodian = getChildCustodian(child, humans);
    if (!custodian) continue;
    const bucket = childrenByCustodian.get(custodian.id) ?? [];
    bucket.push(child);
    childrenByCustodian.set(custodian.id, bucket);
  }

  for (const [custodianId, children] of childrenByCustodian) {
    const custodian = alive.find((h) => h.id === custodianId);
    if (!custodian) continue;

    const unit: Entity[] = [custodian];
    visited.add(custodian.id);
    const partner = livingHuman(alive, custodian.partnerId);
    if (partner && !visited.has(partner.id)) {
      unit.push(partner);
      visited.add(partner.id);
    }
    for (const child of children.sort((a, b) => a.id - b.id)) {
      if (!visited.has(child.id)) {
        unit.push(child);
        visited.add(child.id);
      }
    }
    units.push(unit);
  }

  for (const human of alive.sort((a, b) => a.id - b.id)) {
    if (visited.has(human.id)) continue;
    const unit = collectOwnHousehold(human, alive);
    for (const member of unit) visited.add(member.id);
    units.push(unit);
  }

  return units;
}

export function isAdultChildAtHome(human: Entity, humans: Entity[]): boolean {
  if (!human.alive || human.faction || human.isJuvenile) return false;
  if (human.age < HUMAN_MOVE_OUT_MIN_AGE) return false;
  if (!hasResidenceAssignment(human)) return false;

  const parents = [livingHuman(humans, human.motherId), livingHuman(humans, human.fatherId)]
    .filter((p): p is Entity => !!p && hasResidenceAssignment(p));

  return parents.some((p) => p.residenceBuildingId === human.residenceBuildingId);
}

export function canMoveOutOfFamilyHome(
  human: Entity,
  humans: Entity[],
  residences: Building[],
): boolean {
  if (!isAdultChildAtHome(human, humans)) return false;
  const household = collectOwnHousehold(human, humans);
  return residences.some(
    (r) =>
      countResidentsInBuilding(humans, r.id) === 0
      && familyFitsInResidence(household, r, humans),
  );
}

export function tryMoveOutOfFamilyHome(
  human: Entity,
  humans: Entity[],
  residences: Building[],
): boolean {
  if (!canMoveOutOfFamilyHome(human, humans, residences)) return false;

  const household = collectOwnHousehold(human, humans);
  const target = residences.find(
    (r) =>
      countResidentsInBuilding(humans, r.id) === 0
      && familyFitsInResidence(household, r, humans),
  );
  if (!target) return false;

  for (const member of household) member.residenceBuildingId = target.id;
  return true;
}

/** When a new empty house appears, adult children still at home may move into their own place. */
export function rebalanceAdultChildrenFromFamilyHomeWhenEmptyAvailable(
  humans: Entity[],
  residences: Building[],
): void {
  const emptyResidences = () =>
    residences.filter((r) => countResidentsInBuilding(humans, r.id) === 0);
  if (emptyResidences().length === 0) return;

  const candidates = humans
    .filter((h) => isAdultChildAtHome(h, humans))
    .sort((a, b) => b.age - a.age || a.id - b.id);

  const moved = new Set<number>();
  for (const adult of candidates) {
    if (moved.has(adult.id)) continue;
    if (emptyResidences().length === 0) return;

    const household = collectOwnHousehold(adult, humans);
    if (household.some((m) => moved.has(m.id))) continue;
    if (!tryMoveOutOfFamilyHome(adult, humans, residences)) continue;

    for (const member of household) moved.add(member.id);
  }
}

/** Keep parent childrenIds in sync with motherId/fatherId on each child. */
/** Rescale legacy per-tick/year ages to the v0.4 day-based calendar. */
export function migrateHumanAges(
  humans: Entity[],
  state?: { year: number; dayInYear: number },
  options?: { forceCalendar?: boolean },
): void {
  const colonyDay = state ? getColonyDay(state) : 0;
  for (const human of humans) {
    if (human.type !== EntityType.Human || human.faction) continue;
    const stored = Math.max(0, human.age);
    const computed = state ? computeHumanAgeYears(human, colonyDay) : stored;
    const looksLikeLegacyFastAge = stored > HUMAN_MAX_LIFESPAN_YEARS + 5;
    // Pre-v0.4.2 bug: +1 life-year every colony day (founder "66" at day 38).
    const looksLikeLegacyPerDayAging =
      colonyDay > 0
      && stored > computed + 5
      && stored > colonyDay * 0.4;

    let ageYears = stored;
    if (options?.forceCalendar || looksLikeLegacyFastAge || looksLikeLegacyPerDayAging) {
      if (computed < stored - 3 && (human.birthYear !== 0 || human.birthDay !== 0)) {
        ageYears = computed;
      } else if (human.generation <= 1 && colonyDay < DAYS_PER_YEAR * 2) {
        ageYears = human.isJuvenile
          ? Math.min(HUMAN_CHILDHOOD_DAYS - 1, Math.floor(colonyDay / JUVENILE_DAYS_PER_AGE_YEAR))
          : Math.min(35, 28 + Math.floor(colonyDay / ADULT_DAYS_PER_AGE_YEAR));
      } else {
        ageYears = Math.min(
          HUMAN_MAX_LIFESPAN_YEARS - 1,
          Math.max(human.isJuvenile ? 0 : HUMAN_ADULT_MIN_AGE, computed),
        );
      }
    } else if (state && Math.abs(computed - stored) <= 2) {
      ageYears = computed;
    }

    if (state) {
      setHumanBirthFromAge(human, ageYears, colonyDay);
    } else {
      human.maxAge = HUMAN_MAX_LIFESPAN_YEARS;
      human.age = ageYears;
    }
    if (human.isJuvenile && human.age >= HUMAN_CHILDHOOD_DAYS) {
      human.isJuvenile = false;
    }
  }
}

export function rebuildChildrenIds(humans: Entity[]): void {
  const childSets = new Map<number, Set<number>>();

  for (const human of humans) {
    if (human.type !== EntityType.Human) continue;
    human.childrenIds = [];
    childSets.set(human.id, new Set());
  }

  for (const child of humans) {
    if (!child.alive || child.type !== EntityType.Human) continue;
    if (child.motherId) childSets.get(child.motherId)?.add(child.id);
    if (child.fatherId) childSets.get(child.fatherId)?.add(child.id);
    if (child.adoptiveMotherId) childSets.get(child.adoptiveMotherId)?.add(child.id);
    if (child.adoptiveFatherId) childSets.get(child.adoptiveFatherId)?.add(child.id);
  }

  for (const human of humans) {
    if (human.type !== EntityType.Human) continue;
    const ids = childSets.get(human.id);
    if (ids && ids.size > 0) human.childrenIds = [...ids];
  }
}

export function buildFamilyGroups(humans: Entity[]): Entity[][] {
  const visited = new Set<number>();
  const families: Entity[][] = [];

  const sorted = [...humans].sort((a, b) => a.id - b.id);
  for (const human of sorted) {
    if (visited.has(human.id)) continue;
    const family = collectFamilyMembers(human, humans, visited);
    families.push(family);
  }

  return families.sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    return Math.min(...a.map((m) => m.id)) - Math.min(...b.map((m) => m.id));
  });
}

function familyAlreadyInResidence(family: Entity[], residenceId: number): number {
  return family.filter((m) => m.residenceBuildingId === residenceId).length;
}

function familyFitsInResidence(
  family: Entity[],
  residence: Building,
  humans: Entity[],
): boolean {
  const cap = getResidenceCapacity(residence);
  const count = countResidentsInBuilding(humans, residence.id);
  const alreadyHere = familyAlreadyInResidence(family, residence.id);
  const outsiders = count - alreadyHere;
  return outsiders + family.length <= cap;
}

function isLoneSettler(family: Entity[], humans: Entity[]): boolean {
  if (family.length !== 1) return false;
  if (family[0].isJuvenile) return false;
  return !livingHuman(humans, family[0].partnerId);
}

function unitResidenceId(unit: Entity[]): number | undefined {
  const ids = new Set(unit.map((m) => m.residenceBuildingId).filter((id): id is number => id != null));
  if (ids.size !== 1) return undefined;
  return [...ids][0];
}

function unitSharesResidenceWithOutsiders(
  unit: Entity[],
  humans: Entity[],
  residenceId: number,
): boolean {
  const unitIds = new Set(unit.map((m) => m.id));
  return humans.some(
    (h) => h.alive && !h.faction && h.residenceBuildingId === residenceId && !unitIds.has(h.id),
  );
}

function hasEmptyResidenceForUnit(
  unit: Entity[],
  humans: Entity[],
  residences: Building[],
): boolean {
  return residences.some(
    (r) => countResidentsInBuilding(humans, r.id) === 0 && familyFitsInResidence(unit, r, humans),
  );
}

/** Another home that fits this lone adult and hosts only singles (or is empty). */
function hasSinglesOnlyResidenceWithRoom(
  unit: Entity[],
  humans: Entity[],
  residences: Building[],
  excludeResidenceId?: number,
): boolean {
  return residences.some((r) => {
    if (excludeResidenceId != null && r.id === excludeResidenceId) return false;
    if (!familyFitsInResidence(unit, r, humans)) return false;
    const count = countResidentsInBuilding(humans, r.id);
    if (count === 0) return true;
    return residenceHostsOnlySingles(r.id, humans);
  });
}

function loneSingleSharesWithFamily(
  unit: Entity[],
  humans: Entity[],
  residenceId: number,
): boolean {
  if (!isLoneSettler(unit, humans)) return false;
  if (!unitSharesResidenceWithOutsiders(unit, humans, residenceId)) return false;
  return residenceHostsCouple(residenceId, humans);
}

/** Household already has a valid home but should take a dedicated empty house instead of sharing. */
export function isUnnecessarilySharingHousing(
  unit: Entity[],
  humans: Entity[],
  residences: Building[],
): boolean {
  if (!isFamilyHousingValid(unit, residences, humans)) return false;
  const homeId = unitResidenceId(unit);
  if (homeId == null) return false;

  if (isLoneSettler(unit, humans)) {
    if (!loneSingleSharesWithFamily(unit, humans, homeId)) return false;
    return (
      hasEmptyResidenceForUnit(unit, humans, residences)
      || hasSinglesOnlyResidenceWithRoom(unit, humans, residences, homeId)
    );
  }

  if (!hasEmptyResidenceForUnit(unit, humans, residences)) return false;
  if (countResidentsInBuilding(humans, homeId) <= unit.length) return false;
  return unitSharesResidenceWithOutsiders(unit, humans, homeId);
}

/** Scan for households sharing a residence while better homes exist. */
export function auditHousingSharingIssues(
  humans: Entity[],
  buildings: Building[],
): string[] {
  const alive = humans.filter((h) => h.alive && !h.faction);
  const residences = buildings.filter(isResidenceBuilding);
  const emptyCount = residences.filter((r) => countResidentsInBuilding(alive, r.id) === 0).length;

  const issues: string[] = [];
  for (const unit of buildHousingUnits(alive)) {
    if (!isUnnecessarilySharingHousing(unit, alive, residences)) continue;
    const homeId = unitResidenceId(unit)!;
    const label = unit.map((m) => m.name ?? `settler#${m.id}`).join(', ');
    if (emptyCount > 0) {
      issues.push(
        `${label} share house #${homeId} while ${emptyCount} empty house(s) are available`,
      );
      continue;
    }
    issues.push(
      `${label} bunk with a family in house #${homeId} while a singles-only house has open beds`,
    );
  }
  return issues;
}

/** Whether a housing unit should leave its current residence and be re-placed. */
export function housingUnitNeedsReassignment(
  unit: Entity[],
  alive: Entity[],
  residences: Building[],
): boolean {
  if (!isFamilyHousingValid(unit, residences, alive)) return true;
  const homeId = unitResidenceId(unit);
  if (homeId == null) return true;

  if (isLoneSettler(unit, alive)) {
    if (!unitSharesResidenceWithOutsiders(unit, alive, homeId)) return false;
    if (hasEmptyResidenceForUnit(unit, alive, residences)) return true;
    if (
      residenceHostsCouple(homeId, alive)
      && hasSinglesOnlyResidenceWithRoom(unit, alive, residences, homeId)
    ) {
      return true;
    }
    return false;
  }

  if (!hasEmptyResidenceForUnit(unit, alive, residences)) return false;
  if (countResidentsInBuilding(alive, homeId) === unit.length) return false;
  return unitSharesResidenceWithOutsiders(unit, alive, homeId);
}

function sortHousingUnitsForAssignment(
  units: Entity[][],
  alive: Entity[],
  residences: Building[],
): Entity[][] {
  return [...units].sort((a, b) => {
    const pri = (u: Entity[]) => (housingUnitNeedsReassignment(u, alive, residences) ? 0 : 1);
    const d = pri(a) - pri(b);
    if (d !== 0) return d;
    return b.length - a.length;
  });
}

function residenceHostsCouple(residenceId: number, humans: Entity[]): boolean {
  const occupants = humans.filter(
    (h) => h.alive && !h.faction && h.residenceBuildingId === residenceId,
  );
  for (const occupant of occupants) {
    if (!occupant.partnerId) continue;
    if (occupants.some((p) => p.id === occupant.partnerId)) return true;
  }
  return false;
}

function residenceHasMinorOccupants(residenceId: number, humans: Entity[]): boolean {
  return humans.some(
    (h) => h.alive && !h.faction && h.residenceBuildingId === residenceId && isMinorChild(h),
  );
}

function residenceHostsOnlySingles(residenceId: number, humans: Entity[]): boolean {
  if (residenceHasMinorOccupants(residenceId, humans)) return false;
  const adults = humans.filter(
    (h) => h.alive && !h.faction && !h.isJuvenile && h.residenceBuildingId === residenceId,
  );
  if (adults.length === 0) return false;
  return !residenceHostsCouple(residenceId, humans);
}

function anyOpenBeds(humans: Entity[], residences: Building[]): boolean {
  return residences.some(
    (r) => countResidentsInBuilding(humans, r.id) < getResidenceCapacity(r),
  );
}

/** Any house that fits the whole household — used when empty homes are gone. */
function pickSharedResidenceForFamily(
  family: Entity[],
  humans: Entity[],
  residences: Building[],
): number | undefined {
  let best: Building | undefined;
  let bestScore = Infinity;

  for (const residence of residences) {
    if (!familyFitsInResidence(family, residence, humans)) continue;

    const count = countResidentsInBuilding(humans, residence.id);
    const alreadyHere = familyAlreadyInResidence(family, residence.id);
    const outsiders = count - alreadyHere;
    const score = outsiders * 10 + count;

    if (score < bestScore || (score === bestScore && residence.id < (best?.id ?? Infinity))) {
      bestScore = score;
      best = residence;
    }
  }

  return best?.id;
}

/** Couples/families prefer their own empty house; lone singles may share with couples or other singles. */
export function pickResidenceForFamily(
  family: Entity[],
  humans: Entity[],
  residences: Building[],
): number | undefined {
  if (residences.length === 0 || family.length === 0) return undefined;

  const loneSingle = isLoneSettler(family, humans);
  const hasMinor = family.some((m) => isMinorChild(m));
  const anyEmptyHouse = residences.some((r) => countResidentsInBuilding(humans, r.id) === 0);
  const housingShortage = !anyEmptyHouse || !anyOpenBeds(humans, residences);

  let best: Building | undefined;
  let bestScore = Infinity;
  for (const residence of residences) {
    if (!familyFitsInResidence(family, residence, humans)) continue;

    const count = countResidentsInBuilding(humans, residence.id);
    const alreadyHere = familyAlreadyInResidence(family, residence.id);
    const outsiders = count - alreadyHere;
    const cap = getResidenceCapacity(residence);
    const largeFamilyBonus = family.length > 4 ? cap * 10 : 0;

    const singlesAlternative = residences.some(
      (r) =>
        r.id !== residence.id
        && familyFitsInResidence(family, r, humans)
        && (countResidentsInBuilding(humans, r.id) === 0
          || residenceHostsOnlySingles(r.id, humans)),
    );

    let score: number;
    if (loneSingle) {
      if (count === 0) {
        score = -100;
      } else if (anyEmptyHouse) {
        // Empty homes available — only use shared housing when every house is occupied.
        score = 1000 + outsiders * 100 + count;
      } else if (residenceHostsOnlySingles(residence.id, humans)) {
        score = alreadyHere > 0 ? 50 + count : count;
      } else if (residenceHostsCouple(residence.id, humans)) {
        if (singlesAlternative) {
          score = 10_000 + outsiders * 100 + count;
        } else {
          score = 100 + outsiders;
        }
      } else if (alreadyHere > 0) {
        score = 50 + count;
      } else {
        score = outsiders * 1000 + count;
      }
    } else if (housingShortage) {
      // No empty homes (or every bed taken) — keep households together in shared houses.
      score = outsiders * 10 + count - largeFamilyBonus;
    } else {
      score = outsiders * 1000 + count - largeFamilyBonus;
    }

    if (hasMinor && residenceHostsOnlySingles(residence.id, humans)) {
      score += 10_000;
    }

    if (score < bestScore || (score === bestScore && residence.id < (best?.id ?? Infinity))) {
      bestScore = score;
      best = residence;
    }
  }
  return best?.id;
}

function isFamilyHousingValid(
  family: Entity[],
  residences: Building[],
  humans: Entity[],
): boolean {
  const assigned = family.filter((m) => m.residenceBuildingId !== undefined);
  if (assigned.length === 0) return false;
  if (assigned.length !== family.length) return false;

  const houseId = assigned[0].residenceBuildingId!;
  if (!assigned.every((m) => m.residenceBuildingId === houseId)) return false;

  const residence = residences.find((b) => b.id === houseId);
  if (!residence) return false;

  return familyFitsInResidence(family, residence, humans);
}

export function pickResidenceForHuman(
  human: Entity,
  humans: Entity[],
  residences: Building[],
): number | undefined {
  if (residences.length === 0) return undefined;

  const household = isMinorChild(human) ? [human] : collectOwnHousehold(human, humans);
  const familyHouse = pickResidenceForFamily(household, humans, residences);
  if (familyHouse !== undefined) return familyHouse;

  if (human.partnerId) {
    const partner = humans.find((h) => h.id === human.partnerId && h.alive);
    if (partner && hasResidenceAssignment(partner)) {
      const partnerResidence = residences.find((b) => b.id === partner.residenceBuildingId);
      if (partnerResidence && residenceRoomFor(human, partnerResidence, humans)) {
        return partner.residenceBuildingId;
      }
    }
  }

  if (isMinorChild(human)) {
    const custodianHome = pickResidenceFromChildCustodian(human, humans, residences);
    if (custodianHome !== undefined) return custodianHome;
  }

  const crowdOpts: PickResidenceOptions = isMinorChild(human) ? { forbidSinglesOnly: true } : {};
  return pickLeastCrowdedResidence(humans, residences, 1, crowdOpts);
}

function pickSharedResidence(
  human: Entity,
  partner: Entity,
  humans: Entity[],
  residences: Building[],
): number | undefined {
  const needed = 2;
  let best: Building | undefined;
  let bestCount = Infinity;
  for (const residence of residences) {
    const cap = getResidenceCapacity(residence);
    let count = countResidentsInBuilding(humans, residence.id);
    let slots = needed;
    if (human.residenceBuildingId === residence.id) {
      count--;
      slots--;
    }
    if (partner.residenceBuildingId === residence.id) {
      count--;
      slots--;
    }
    if (count + slots > cap) continue;
    if (count < bestCount || (count === bestCount && residence.id < (best?.id ?? Infinity))) {
      bestCount = count;
      best = residence;
    }
  }
  return best?.id;
}

/** Evict whole families from overcrowded houses (keeps households together). */
export function rebalanceOvercrowdedResidences(
  humans: Entity[],
  residences: Building[],
): boolean {
  let evicted = false;
  for (const residence of residences) {
    const cap = getResidenceCapacity(residence);
    const occupants = humans.filter(
      (h) => h.alive && !h.faction && h.residenceBuildingId === residence.id,
    );
    if (occupants.length <= cap) continue;

    const visited = new Set<number>();
    const familiesInHouse: Entity[][] = [];
    for (const occupant of occupants.sort((a, b) => a.id - b.id)) {
      if (visited.has(occupant.id)) continue;
      familiesInHouse.push(collectFamilyMembers(occupant, occupants, visited));
    }

    familiesInHouse.sort((a, b) => b.length - a.length);

    const kept = new Set<number>();
    let count = 0;
    for (const family of familiesInHouse) {
      if (count + family.length > cap) continue;
      for (const member of family) kept.add(member.id);
      count += family.length;
    }

    for (const occupant of occupants) {
      if (!kept.has(occupant.id)) {
        occupant.residenceBuildingId = undefined;
        evicted = true;
      }
    }
  }
  return evicted;
}

/** Remove a dead or evicted human from every building occupant list. */
export function removeHumanFromBuildingOccupants(entity: Entity, buildings: Building[]): void {
  if (entity.type !== EntityType.Human) return;
  for (const building of buildings) {
    if (building.occupants.includes(entity.id)) {
      building.occupants = building.occupants.filter((id) => id !== entity.id);
    }
  }
}

/** Clear building assignments when a human dies (work, home, prison). */
export function finalizeHumanDeath(
  entity: Entity,
  buildings: Building[],
  entityById?: ReadonlyMap<number, Entity>,
): void {
  removeHumanFromBuildingOccupants(entity, buildings);
  entity.homeBuildingId = undefined;
  entity.residenceBuildingId = undefined;
  entity.prisonBuildingId = undefined;
  entity.prisonerUntilTick = undefined;
  entity.prisonSentenceCrime = undefined;

  if (entityById && entity.partnerId != null) {
    const partner = entityById.get(entity.partnerId);
    if (partner?.alive) {
      partner.partnerId = undefined;
      if (partner.relationshipStatus === 'married') {
        partner.relationshipStatus = partner.pregnant ? 'expecting' : 'single';
      }
    }
  }
}

/** Player settler eligible for human death cleanup (human or cursed full-moon werewolf form). */
export function isKillableSettlerEntity(entity: Entity): boolean {
  return (
    entity.type === EntityType.Human
    || (entity.type === EntityType.Werewolf && !!entity.moonHowlerCursed)
  );
}

/** Mark a settler dead and run all death cleanup (buildings, spouse widowing). */
export function killHuman(
  entity: Entity,
  buildings: Building[],
  entityById?: ReadonlyMap<number, Entity>,
): void {
  if (!entity.alive || !isKillableSettlerEntity(entity)) return;
  entity.alive = false;
  finalizeHumanDeath(entity, buildings, entityById);
}

/** Keep house/mansion occupants in sync with residenceBuildingId for the UI. */
export function syncResidenceOccupants(humans: Entity[], buildings: Building[]): void {
  for (const building of buildings) {
    if (!isResidenceBuilding(building) || building.faction === 'rival') continue;
    building.occupants = humans
      .filter((h) => h.alive && !h.faction && h.residenceBuildingId === building.id)
      .map((h) => h.id);
  }
}

/** Place a family — keeps children with custodian; only splits when no home fits everyone. */
function assignFamilyToResidence(
  family: Entity[],
  alive: Entity[],
  residences: Building[],
  allHumans: Entity[],
): void {
  const picked = pickResidenceForFamily(family, alive, residences)
    ?? pickSharedResidenceForFamily(family, alive, residences);
  if (picked !== undefined) {
    for (const member of family) member.residenceBuildingId = picked;
    return;
  }

  const adults = family.filter((m) => !m.isJuvenile).sort((a, b) => a.id - b.id);
  const juveniles = family.filter((m) => m.isJuvenile).sort((a, b) => a.id - b.id);

  for (const adult of adults) {
    const house = pickResidenceForHuman(adult, alive, residences);
    if (house !== undefined) adult.residenceBuildingId = house;
  }

  for (const child of juveniles) {
    const custodianHome = pickResidenceFromChildCustodian(child, allHumans, residences);
    if (custodianHome !== undefined) {
      child.residenceBuildingId = custodianHome;
      continue;
    }
    const house = pickResidenceForHuman(child, alive, residences);
    if (house !== undefined) child.residenceBuildingId = house;
  }
}

function fillHomelessAfterEviction(alive: Entity[], residences: Building[]): void {
  for (const human of alive) {
    if (!hasResidenceAssignment(human)) {
      const house = pickResidenceForHuman(human, alive, residences);
      if (house !== undefined) human.residenceBuildingId = house;
    }
  }
}

export function assignMissingResidences(humans: Entity[], buildings: Building[]): void {
  const residences = listPlayerResidences(buildings);
  if (residences.length === 0) return;

  for (const h of humans) {
    if (!h.alive) h.residenceBuildingId = undefined;
  }

  const alive = humans.filter((h) => h.alive && !h.faction);

  rebuildChildrenIds(alive);

  for (const human of alive) {
    if (isMinorChild(human)) ensureOrphanAdoption(human, alive, residences);
  }

  for (const human of alive) {
    if (
      hasResidenceAssignment(human)
      && !residences.some((b) => b.id === human.residenceBuildingId)
    ) {
      human.residenceBuildingId = undefined;
    }
  }

  rebalanceOvercrowdedResidences(alive, residences);
  rebalanceAdultChildrenFromFamilyHomeWhenEmptyAvailable(alive, residences);

  for (let pass = 0; pass < 24; pass++) {
    let reassigned = 0;
    const housingUnits = sortHousingUnitsForAssignment(buildHousingUnits(alive), alive, residences);
    for (const unit of housingUnits) {
      if (!housingUnitNeedsReassignment(unit, alive, residences)) continue;

      for (const member of unit) member.residenceBuildingId = undefined;
      assignFamilyToResidence(unit, alive, residences, humans);
      reassigned++;
    }
    const evicted = rebalanceOvercrowdedResidences(alive, residences);
    if (evicted) fillHomelessAfterEviction(alive, residences);
    if (reassigned === 0 && !evicted) break;
  }

  for (const human of alive) {
    if (!hasResidenceAssignment(human)) {
      const house = pickResidenceForHuman(human, alive, residences);
      if (house !== undefined) human.residenceBuildingId = house;
    }
  }

  syncResidenceOccupants(humans, buildings);
}

/** When settlers partner up, move them into a couple's home (empty house preferred). */
export function syncPartnerResidence(
  human: Entity,
  partner: Entity,
  residences: Building[],
  humans: Entity[],
): void {
  if (residences.length === 0) return;

  human.residenceBuildingId = undefined;
  partner.residenceBuildingId = undefined;

  const couple = [human, partner];
  const shared = pickResidenceForFamily(couple, humans, residences)
    ?? pickSharedResidence(human, partner, humans, residences);
  if (shared === undefined) return;

  human.residenceBuildingId = shared;
  partner.residenceBuildingId = shared;
}