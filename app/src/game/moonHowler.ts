import { EntityType, JobType } from './gameTypes';
import type { Entity } from './gameTypes';
import { HUMAN_ADULT_MIN_AGE, isFullMoonNight, NIGHT_START } from './dayCycle';

const HUMAN_FORM = { maxEnergy: 500, speed: 2.25, size: 10 };
const WEREWOLF_FORM = { maxEnergy: 700, speed: 3.4, size: 14 };

export interface MoonHowlerSavedState {
  energy: number;
  maxEnergy: number;
  speed: number;
  size: number;
  job?: Entity['job'];
  occupation?: string;
  homeBuildingId?: number;
  residenceBuildingId?: number;
  relationshipStatus?: Entity['relationshipStatus'];
  partnerId?: number;
  affairPartnerId?: number;
  affairProgress?: number;
  courtshipProgress?: number;
  pregnant?: boolean;
  pregnantById?: number;
  pregnancyProgress?: number;
  huntTargetId?: number;
  combatTicks?: number;
}

export function shouldMoonHowlerTransform(colonyDay: number, hourOfDay: number): boolean {
  return isFullMoonNight(colonyDay, hourOfDay);
}

export function canMoonHowlerCurse(entity: Entity): boolean {
  return (
    entity.alive
    && entity.type === EntityType.Human
    && !entity.isJuvenile
    && entity.age >= HUMAN_ADULT_MIN_AGE
    && !entity.moonHowlerCursed
    && entity.faction !== 'visitor'
    && entity.faction !== 'rival'
  );
}

export function isActiveMoonHowler(entity: Entity): boolean {
  return entity.alive && entity.type === EntityType.Werewolf && !!entity.moonHowlerCursed;
}

/** Human settler or cursed villager temporarily in werewolf form (marriage/social lookups). */
export function isSettlerRelationshipEntity(entity: Entity | undefined): entity is Entity {
  if (!entity?.alive) return false;
  if (entity.type === EntityType.Human) return true;
  return entity.type === EntityType.Werewolf && !!entity.moonHowlerCursed;
}

export function curseMoonHowler(human: Entity): void {
  human.moonHowlerCursed = true;
  human.surname = human.surname || 'Moonborn';
  human.flash = 10;
}

export function transformToWerewolfForm(human: Entity): void {
  const cfg = WEREWOLF_FORM;
  human.moonHowlerSaved = {
    energy: human.energy,
    maxEnergy: human.maxEnergy,
    speed: human.speed,
    size: human.size,
    job: human.job,
    occupation: human.occupation,
    homeBuildingId: human.homeBuildingId,
    residenceBuildingId: human.residenceBuildingId,
    relationshipStatus: human.relationshipStatus,
    partnerId: human.partnerId,
    affairPartnerId: human.affairPartnerId,
    affairProgress: human.affairProgress,
    courtshipProgress: human.courtshipProgress,
    pregnant: human.pregnant,
    pregnantById: human.pregnantById,
    pregnancyProgress: human.pregnancyProgress,
    huntTargetId: human.huntTargetId,
    combatTicks: human.combatTicks,
  };
  human.type = EntityType.Werewolf;
  human.huntTargetId = undefined;
  human.combatTicks = 0;
  if (human.combatRollSeed == null) {
    human.combatRollSeed = ((human.id * 2654435761) ^ 0x9e3779b9) >>> 0;
  }
  human.energy = Math.min(cfg.maxEnergy, human.energy + 80);
  human.maxEnergy = cfg.maxEnergy;
  human.speed = cfg.speed;
  human.size = cfg.size;
  human.flash = 12;
}

export function revertToHumanForm(were: Entity): void {
  const cfg = HUMAN_FORM;
  const saved = were.moonHowlerSaved;
  were.type = EntityType.Human;
  were.maxEnergy = saved?.maxEnergy ?? cfg.maxEnergy;
  were.energy = Math.min(were.maxEnergy, saved?.energy ?? cfg.maxEnergy * 0.55);
  were.speed = saved?.speed ?? cfg.speed;
  were.size = saved?.size ?? cfg.size;
  were.job = saved?.job ?? JobType.Settler;
  were.occupation = saved?.occupation ?? 'settler';
  were.homeBuildingId = saved?.homeBuildingId;
  were.residenceBuildingId = saved?.residenceBuildingId;
  were.relationshipStatus = saved?.relationshipStatus;
  were.partnerId = saved?.partnerId;
  were.affairPartnerId = saved?.affairPartnerId;
  were.affairProgress = saved?.affairProgress ?? 0;
  were.courtshipProgress = saved?.courtshipProgress ?? 0;
  were.pregnant = saved?.pregnant;
  were.pregnantById = saved?.pregnantById;
  were.pregnancyProgress = saved?.pregnancyProgress;
  were.huntTargetId = saved?.huntTargetId;
  were.combatTicks = saved?.combatTicks ?? 0;
  were.moonHowlerSaved = undefined;
  were.flash = 8;
}

export function cureMoonHowler(entity: Entity): void {
  if (entity.type === EntityType.Werewolf) {
    revertToHumanForm(entity);
  }
  entity.moonHowlerCursed = false;
  entity.moonHowlerSaved = undefined;
  entity.tamedBy = undefined;
}

/** Convert legacy permanent werewolf saves into cursed villagers. */
export function migrateLegacyMoonHowler(entity: Entity, colonyDay: number, hourOfDay: number): void {
  if (entity.type !== EntityType.Werewolf || entity.moonHowlerCursed) return;

  entity.moonHowlerCursed = true;
  entity.surname = entity.surname || 'Moonborn';
  entity.generation = Math.max(entity.generation, 1);

  if (!shouldMoonHowlerTransform(colonyDay, hourOfDay)) {
    entity.type = EntityType.Human;
    entity.job = entity.job ?? JobType.Settler;
    entity.occupation = entity.occupation ?? 'settler';
    entity.relationshipStatus = entity.relationshipStatus ?? 'single';
    const cfg = HUMAN_FORM;
    entity.maxEnergy = cfg.maxEnergy;
    entity.energy = Math.min(cfg.maxEnergy, entity.energy);
    entity.speed = cfg.speed;
    entity.size = cfg.size;
  }
}

export interface MoonHowlerSyncResult {
  transformed: Entity[];
  reverted: Entity[];
  nightFall: boolean;
}

export function syncMoonHowlerForms(
  entities: Entity[],
  colonyDay: number,
  hourOfDay: number,
): MoonHowlerSyncResult {
  const transforming = shouldMoonHowlerTransform(colonyDay, hourOfDay);
  const transformed: Entity[] = [];
  const reverted: Entity[] = [];

  for (const entity of entities) {
    if (!entity.alive || !entity.moonHowlerCursed) continue;
    if (entity.isJuvenile || entity.age < HUMAN_ADULT_MIN_AGE) continue;

    if (transforming && entity.type === EntityType.Human) {
      transformToWerewolfForm(entity);
      transformed.push(entity);
    } else if (!transforming && entity.type === EntityType.Werewolf) {
      revertToHumanForm(entity);
      reverted.push(entity);
    }
  }

  return {
    transformed,
    reverted,
    nightFall: transforming && hourOfDay === NIGHT_START && transformed.length > 0,
  };
}