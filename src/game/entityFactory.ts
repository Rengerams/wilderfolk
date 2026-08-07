/**
 * Leaf entity construction — keeps worldGen / groupEvents from mutual-importing
 * just to spawn settlers and wildlife.
 */
import type { Entity, SettlerTrait, WorldState } from './gameTypes';
import { EntityType, JobType } from './gameTypes';
import {
  getColonyDay,
  HUMAN_ADULT_MIN_AGE,
  setHumanBirthFromAge,
} from './dayCycle';
import { getRandomName, getRandomSurname } from './nameLoader';
import { pickHumanVariant } from './humanSprites';
import { SPECIES_CONFIG } from './speciesConfig';
import { rollSettlerTraits } from './settlerTraits';

export function createEntity(
  type: EntityType,
  x: number,
  y: number,
  id: number,
  energy?: number,
  isJuvenile?: boolean,
  opts?: {
    gender?: 'male' | 'female';
    fatherId?: number;
    motherId?: number;
    generation?: number;
    surname?: string;
    spriteVariant?: number;
    isBastard?: boolean;
    /** Human calendar age — sets birth date via setHumanBirthFromAge (avoids stale birthYear=0). */
    ageYears?: number;
    colonyDay?: number;
    pregnant?: boolean;
    pregnancyProgress?: number;
    pregnantById?: number;
    partnerId?: number;
    name?: string;
    /** Traits inherited from a parent (children keep one) — then roll the rest. */
    inheritedTraits?: SettlerTrait[];
  },
): Entity {
  const config = SPECIES_CONFIG[type];
  const isHuman = type === EntityType.Human;
  const entGender = opts?.gender ?? (isHuman ? (Math.random() > 0.5 ? 'male' : 'female') : undefined);
  const gen = opts?.generation ?? 0;
  let name: string | undefined;
  if (isHuman) {
    name = opts?.name ?? getRandomName(entGender === 'male' ? 'male' : 'female');
  }
  // Personality traits — only settlers get them; children keep one parent trait.
  const traits = isHuman ? rollSettlerTraits(opts?.inheritedTraits) : undefined;
  const entity: Entity = {
    id, type, x, y,
    energy: energy ?? config.spawnEnergy,
    maxEnergy: config.maxEnergy,
    age: isHuman
      ? 0
      : isJuvenile
        ? 0
        : Math.floor(Math.random() * config.maxAge * 0.3),
    birthYear: isHuman ? 0 : -1,
    birthMonth: 0,
    birthDay: 0,
    maxAge: config.maxAge,
    speed: config.speed,
    size: isJuvenile ? config.size * 0.5 : config.size,
    vx: 0, vy: 0,
    reproductionCooldown: type === EntityType.Grass ? 0 : Math.random() * 100,
    alive: true,
    flash: 0,
    gender: isHuman ? entGender : undefined,
    isJuvenile: isJuvenile ?? false,
    pregnant: undefined,
    pregnancyProgress: 0,
    homeBuildingId: undefined,
    residenceBuildingId: undefined,
    occupation: isHuman ? 'settler' : undefined,
    job: isHuman ? JobType.Settler : undefined,
    skills: {},
    traits,
    relationshipStatus: isHuman ? 'single' : undefined,
    childrenIds: [],
    fatherId: opts?.fatherId,
    motherId: opts?.motherId,
    name,
    surname: isHuman ? (opts?.surname?.trim() || getRandomSurname()) : undefined,
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
    pregnantById: undefined,
    courtshipProgress: 0,
    isBastard: opts?.isBastard,
    adoptiveMotherId: undefined,
    adoptiveFatherId: undefined,
    lastMetPartner: 0,
    spriteAngle: Math.random() * Math.PI * 2,
    animFrame: 0,
    combatRollSeed: ((id * 2654435761) ^ 0x9e3779b9) >>> 0,
    spriteVariant: isHuman && entGender
      ? (opts?.spriteVariant ?? pickHumanVariant(id, entGender))
      : undefined,
  };

  if (isHuman) {
    if (opts?.ageYears !== undefined) {
      setHumanBirthFromAge(entity, opts.ageYears, opts.colonyDay ?? 0);
    }
    if (opts?.pregnant && entGender === 'female') {
      entity.pregnant = true;
      entity.pregnancyProgress = opts.pregnancyProgress ?? 0;
      const fatherId = opts.pregnantById ?? opts.fatherId ?? opts.partnerId;
      if (fatherId != null) {
        entity.pregnantById = fatherId;
      }
      entity.relationshipStatus = opts.partnerId != null ? 'married' : 'expecting';
    }
  }

  return entity;
}

/** Ensure periodic immigrants/refugees never show as age 0 adults in the UI. */
export function finalizeSettlerAge(entity: Entity, state: Pick<WorldState, 'year' | 'dayInYear' | 'tick'>): void {
  const colonyDay = getColonyDay(state);
  const targetAge = Math.max(
    HUMAN_ADULT_MIN_AGE,
    entity.age > 0 ? entity.age : HUMAN_ADULT_MIN_AGE + Math.floor(Math.random() * 20),
  );
  setHumanBirthFromAge(entity, targetAge, colonyDay);
  entity.isJuvenile = false;
  entity.generation = Math.max(entity.generation ?? 0, 2);
}
