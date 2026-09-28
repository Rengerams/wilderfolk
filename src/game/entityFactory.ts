import type { Entity, SettlerTrait, WorldState } from './gameTypes';
import { EntityType, JobType } from './gameTypes';
import {
  getColonyDay,
  HUMAN_ADULT_MIN_AGE,
  HUMAN_CHILDHOOD_DAYS,
  PREGNANCY_TICKS,
  setHumanBirthFromAge,
} from './dayCycle';
import { getRandomName, getRandomSurname } from './nameLoader';
import { pickHumanVariant } from './humanSprites';
import { SPECIES_CONFIG } from './speciesConfig';
import { rollSettlerTraits } from './settlerTraits';
import { getSimRng } from './simRng';

/** Deterministic simulation RNG stream for entity factory creation. */
function simRandom(): number {
  return getSimRng('entityFactory')();
}

export interface CreateEntityOptions {
  gender?: 'male' | 'female';
  fatherId?: number;
  motherId?: number;
  generation?: number;
  surname?: string;
  maidenSurname?: string;
  spriteVariant?: number;
  isBastard?: boolean;
  /** Human calendar age — sets birth date via setHumanBirthFromAge. */
  ageYears?: number;
  colonyDay?: number;
  pregnant?: boolean;
  pregnancyProgress?: number;
  pregnantById?: number;
  partnerId?: number;
  relationshipStatus?: 'single' | 'married' | 'expecting' | 'widowed';
  name?: string;
  /** Traits inherited from parents — remaining slots are rolled. */
  inheritedTraits?: SettlerTrait[];
}

export function createEntity(
  type: EntityType,
  x: number,
  y: number,
  id: number,
  energy?: number,
  isJuvenile?: boolean,
  opts?: CreateEntityOptions,
): Entity {
  const isHuman = type === EntityType.Human;
  const config = SPECIES_CONFIG[type] ?? {
    spawnEnergy: 100,
    maxEnergy: 100,
    maxAge: 1000,
    speed: 0,
    size: 16,
  };

  const entGender =
    opts?.gender ?? (isHuman ? (simRandom() > 0.5 ? 'male' : 'female') : undefined);
  const gen = opts?.generation ?? 0;

  // Auto-detect juvenile status if calendar age indicates a child. The threshold is the
  // dayCycle owner's (HUMAN_CHILDHOOD_DAYS), not HUMAN_ADULT_MIN_AGE: setHumanBirthFromAge
  // below recomputes `isJuvenile` from that same 12-year floor, so a 12-15 year old must not
  // be created with an adult `size` that graduation can then never repair.
  const effectiveJuvenile =
    isJuvenile ?? (isHuman && opts?.ageYears !== undefined ? opts.ageYears < HUMAN_CHILDHOOD_DAYS : false);

  let name: string | undefined;
  if (isHuman) {
    name = opts?.name ?? getRandomName(entGender === 'male' ? 'male' : 'female');
  }

  // Personality traits — only settlers receive traits
  const traits = isHuman ? rollSettlerTraits(opts?.inheritedTraits, entGender) : undefined;

  // Derive surnames and maiden surnames safely
  const surname = isHuman ? (opts?.surname?.trim() || getRandomSurname()) : undefined;
  const maidenSurname =
    isHuman && entGender === 'female'
      ? opts?.maidenSurname?.trim() || (opts?.partnerId != null ? getRandomSurname() : surname)
      : undefined;

  // Resolve relationship status
  const relationshipStatus = isHuman
    ? opts?.relationshipStatus ??
      (opts?.partnerId != null
        ? 'married'
        : opts?.pregnant
          ? 'expecting'
          : 'single')
    : undefined;

  const entity: Entity = {
    id,
    type,
    x,
    y,
    energy: energy ?? config.spawnEnergy,
    maxEnergy: config.maxEnergy,
    age: isHuman
      ? opts?.ageYears ?? 0
      : effectiveJuvenile
        ? 0
        : Math.floor(simRandom() * config.maxAge * 0.3),
    birthYear: isHuman ? 0 : -1,
    birthMonth: 0,
    birthDay: 0,
    maxAge: config.maxAge,
    speed: config.speed,
    size: effectiveJuvenile ? config.size * 0.5 : config.size,
    vx: 0,
    vy: 0,
    reproductionCooldown: type === EntityType.Grass || type === EntityType.Tree ? 0 : simRandom() * 100,
    alive: true,
    flash: 0,
    gender: isHuman ? entGender : undefined,
    isJuvenile: effectiveJuvenile,
    pregnant: undefined,
    pregnancyProgress: 0,
    homeBuildingId: undefined,
    residenceBuildingId: undefined,
    occupation: isHuman ? 'settler' : undefined,
    job: isHuman ? JobType.Settler : undefined,
    skills: {},
    traits,
    relationshipStatus,
    childrenIds: [],
    fatherId: opts?.fatherId,
    motherId: opts?.motherId,
    name,
    surname,
    maidenSurname,
    generation: isHuman ? gen : 0,
    partnerId: opts?.partnerId,
    affairPartnerId: undefined,
    affairProgress: 0,
    lastAffairSiteDay: undefined,
    lastAffairSiteX: undefined,
    lastAffairSiteY: undefined,
    scandalCooldownUntilTick: undefined,
    prisonBuildingId: undefined,
    prisonerUntilTick: undefined,
    prisonSentenceCrime: undefined,
    pregnantById: opts?.pregnantById,
    courtshipProgress: 0,
    isBastard: opts?.isBastard,
    adoptiveMotherId: undefined,
    adoptiveFatherId: undefined,
    spriteAngle: simRandom() * Math.PI * 2,
    animFrame: 0,
    combatRollSeed: ((id * 2654435761) ^ 0x9e3779b9) >>> 0,
    spriteVariant:
      isHuman && entGender ? (opts?.spriteVariant ?? pickHumanVariant(id, entGender)) : undefined,
  };

  if (isHuman) {
    if (opts?.ageYears !== undefined) {
      setHumanBirthFromAge(entity, opts.ageYears, opts.colonyDay ?? 0);
      entity.age = opts.ageYears;
    }

    if (opts?.pregnant && entGender === 'female') {
      entity.pregnant = true;
      entity.pregnancyProgress = opts.pregnancyProgress ?? 0;
      entity.pregnancyDueProgress = Math.round(PREGNANCY_TICKS * (0.85 + simRandom() * 0.3));

      const fatherId = opts.pregnantById ?? opts.fatherId ?? opts.partnerId;
      if (fatherId != null) {
        entity.pregnantById = fatherId;
      }
      entity.relationshipStatus = opts.partnerId != null ? 'married' : 'expecting';
    }
  }

  return entity;
}

/** Ensures periodic immigrants/refugees hold valid calendar ages and adult metadata. */
export function finalizeSettlerAge(
  entity: Entity,
  state: Pick<WorldState, 'year' | 'dayInYear' | 'tick'>,
): void {
  const colonyDay = getColonyDay(state);
  const targetAge = Math.max(
    HUMAN_ADULT_MIN_AGE,
    entity.age > 0 ? entity.age : HUMAN_ADULT_MIN_AGE + Math.floor(simRandom() * 20),
  );

  setHumanBirthFromAge(entity, targetAge, colonyDay);
  entity.age = targetAge;
  entity.isJuvenile = false;

  // Preserve Generation 1 founders if already set; default unassigned to Generation 2
  entity.generation = entity.generation && entity.generation > 0 ? entity.generation : 2;
}