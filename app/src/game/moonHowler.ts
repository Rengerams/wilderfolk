import { BuildingType, EntityType, JobType } from './gameTypes';
import type { Building, Entity, EntityByType, WorldState } from './gameTypes';
import {
  WEREWOLF_ATTACK_LINES,
  WEREWOLF_CURE_LINES,
  WEREWOLF_CURSE_LINES,
  WEREWOLF_TRANSFORM_LINES,
  WEREWOLF_TAME_LINES,
} from './gameTypes';
import {
  DAYS_PER_MOON_CYCLE,
  HUMAN_ADULT_MIN_AGE,
  isFullMoonDay,
  isFullMoonNight,
  NIGHT_END,
  NIGHT_START,
} from './dayCycleConstants';
import { syncResidenceOccupants } from './dayCycle';
import { isPlayerHuman } from './playerHuman';
import { buildEntityByType } from './simFocus';
import {
  addBigNews,
  addFloatingText,
  createDeathParticles,
  impulseScreenShake,
} from './simEffects';
import { logEvent } from './eventLog';

/**
 * Night exorcism — only if a Church is **staffed** (priest on duty).
 * No church / unstaffed church → nothing stops the howler: they hunt all night
 * and return next full moon still cursed.
 *
 * One roll, three mutually exclusive outcomes (weights sum to 1):
 *   1. Cured + priest lives
 *   2. Not cured + priest dies
 *   3. Not cured + priest flees (lives)
 *
 * Failed cures (2 & 3) leave moonHowlerCursed = true → transforms again next full moon.
 * Howler may still kill other settlers via wildlife AI while active.
 */
/** Base weights with 1 priest (sum = 1). */
export const MOON_HOWLER_OUTCOME_CURE = 0.35;
export const MOON_HOWLER_OUTCOME_KILL_PRIEST = 0.40;
export const MOON_HOWLER_OUTCOME_FLEE = 0.25;

/** Extra cure weight per priest beyond the first. */
export const MOON_HOWLER_CURE_BONUS_PER_PRIEST = 0.12;
/** Cap on cure weight even with many priests. */
export const MOON_HOWLER_CURE_CHANCE_MAX = 0.78;

/** @deprecated UI compat — base cure with 1 priest */
export const MOON_HOWLER_CHURCH_CURE_CHANCE = MOON_HOWLER_OUTCOME_CURE;
/** @deprecated UI compat — kill share among failures at base weights */
export const MOON_HOWLER_PRIEST_KILL_CHANCE =
  MOON_HOWLER_OUTCOME_KILL_PRIEST / (MOON_HOWLER_OUTCOME_KILL_PRIEST + MOON_HOWLER_OUTCOME_FLEE);

/** How often (in-game hours / ticks) a priest may attempt while the night window is open. */
export const MOON_HOWLER_EXORCISM_INTERVAL_HOURS = 2;

export type MoonHowlerRiteOutcome = 'cured' | 'priest_killed' | 'priest_fled';

export interface MoonHowlerRiteWeights {
  cure: number;
  killPriest: number;
  flee: number;
  priestCount: number;
}

/**
 * More priests on duty (all staffed churches) → higher cure chance.
 * Fail weight shrinks; kill-vs-flee ratio among failures stays the same.
 */
export function moonHowlerRiteWeights(priestCount: number): MoonHowlerRiteWeights {
  const n = Math.max(0, Math.floor(priestCount));
  if (n <= 0) {
    return { cure: 0, killPriest: 0, flee: 0, priestCount: 0 };
  }
  const cure = Math.min(
    MOON_HOWLER_CURE_CHANCE_MAX,
    MOON_HOWLER_OUTCOME_CURE + (n - 1) * MOON_HOWLER_CURE_BONUS_PER_PRIEST,
  );
  const fail = Math.max(0, 1 - cure);
  const failBase = MOON_HOWLER_OUTCOME_KILL_PRIEST + MOON_HOWLER_OUTCOME_FLEE;
  const killPriest = fail * (MOON_HOWLER_OUTCOME_KILL_PRIEST / failBase);
  const flee = fail * (MOON_HOWLER_OUTCOME_FLEE / failBase);
  return { cure, killPriest, flee, priestCount: n };
}

/** Display helper — cure % for N priests (0 if none). */
export function moonHowlerCureChanceForPriests(priestCount: number): number {
  return moonHowlerRiteWeights(priestCount).cure;
}

/** Single weighted roll → one of the three rite outcomes. */
export function rollMoonHowlerRiteOutcome(
  rng: () => number = Math.random,
  priestCount = 1,
): MoonHowlerRiteOutcome {
  const w = moonHowlerRiteWeights(priestCount);
  if (w.priestCount <= 0) return 'priest_fled'; // should not roll without priests
  const r = rng();
  if (r < w.cure) return 'cured';
  if (r < w.cure + w.killPriest) return 'priest_killed';
  return 'priest_fled';
}

const HUMAN_FORM = { maxEnergy: 500, speed: 2.25, size: 10 };
const WEREWOLF_FORM = { maxEnergy: 700, speed: 3.4, size: 14 };

export function countActiveMoonHowlerCurses(entities: Entity[]): number {
  return entities.filter((e) => e.alive && e.moonHowlerCursed).length;
}

export function daysUntilNextFullMoon(colonyDay: number): number {
  const mod = colonyDay % DAYS_PER_MOON_CYCLE;
  return mod === 0 ? 0 : DAYS_PER_MOON_CYCLE - mod;
}

/** New curse when no uncured settler is already carrying the moon (full moon, 8pm). */
export function shouldApplyNewMoonHowlerCurse(
  colonyDay: number,
  hourOfDay: number,
  humanCount: number,
  activeCursed: number,
): boolean {
  return (
    activeCursed === 0
    && humanCount > 5
    && hourOfDay === NIGHT_START
    && isFullMoonNight(colonyDay, hourOfDay)
  );
}

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

/** True while the settler should be in werewolf form (full-moon night through pre-dawn). */
export function shouldMoonHowlerTransform(colonyDay: number, hourOfDay: number): boolean {
  return isFullMoonNight(colonyDay, hourOfDay);
}

/** 8pm on a full-moon colony day — when cursed settlers transform for the hunt. */
export function isMoonHowlerTransformTick(colonyDay: number, hourOfDay: number): boolean {
  return hourOfDay === NIGHT_START && isFullMoonDay(colonyDay);
}

/**
 * 6am — hunt night ends; cursed settlers still in 🌝 form revert to human
 * until the next full moon (curse may remain).
 */
export function isMoonHowlerRevertTick(hourOfDay: number): boolean {
  return hourOfDay === NIGHT_END;
}

/**
 * Cure window: full-moon night only — from transform hour (20) through hours before 06:00.
 * Not available at 7am work start (old bug).
 */
export function isMoonHowlerCureWindow(colonyDay: number, hourOfDay: number): boolean {
  return isFullMoonNight(colonyDay, hourOfDay);
}

/** @deprecated Use isMoonHowlerCureWindow — kept name for call-site clarity in older comments. */
export function isMoonHowlerCureTick(colonyDay: number, hourOfDay: number): boolean {
  return isMoonHowlerCureWindow(colonyDay, hourOfDay);
}

export function isMoonHowlerEligible(entity: Entity): boolean {
  return !entity.isJuvenile && entity.age >= HUMAN_ADULT_MIN_AGE;
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

/** Push the howler out of buildings into the open night. */
export function forceMoonHowlerOutside(
  entity: Entity,
  buildings: Building[],
  mapWidth: number,
  mapHeight: number,
): void {
  // Detach from workplace / residence / prison so AI doesn't commute home mid-hunt.
  if (entity.homeBuildingId != null) {
    const job = buildings.find((b) => b.id === entity.homeBuildingId);
    if (job) job.occupants = job.occupants.filter((id) => id !== entity.id);
    entity.homeBuildingId = undefined;
  }
  if (entity.residenceBuildingId != null) {
    const home = buildings.find((b) => b.id === entity.residenceBuildingId);
    if (home) home.occupants = home.occupants.filter((id) => id !== entity.id);
    // Keep id in moonHowlerSaved for morning restore; clear active residence so they don't path home.
    entity.residenceBuildingId = undefined;
  }
  if (entity.prisonBuildingId != null) {
    const prison = buildings.find((b) => b.id === entity.prisonBuildingId);
    if (prison) prison.occupants = prison.occupants.filter((id) => id !== entity.id);
    entity.prisonBuildingId = undefined;
    entity.prisonerUntilTick = undefined;
    entity.prisonSentenceCrime = undefined;
  }

  // Nudge away from map center-ish open ground (small random walk from current pos).
  const angle = Math.random() * Math.PI * 2;
  const dist = 40 + Math.random() * 50;
  entity.x = Math.max(24, Math.min(mapWidth - 24, entity.x + Math.cos(angle) * dist));
  entity.y = Math.max(24, Math.min(mapHeight - 24, entity.y + Math.sin(angle) * dist));
  entity.vx = Math.cos(angle) * 1.2;
  entity.vy = Math.sin(angle) * 1.2;
  entity.spriteAngle = angle;
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
  // Do not path home during the hunt
  human.homeBuildingId = undefined;
  human.residenceBuildingId = undefined;
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

/** Revert werewolf form on death so save/stats record a human settler, not wildlife. */
export function finalizeMoonHowlerDeath(entity: Entity): void {
  if (!entity.moonHowlerCursed || entity.type !== EntityType.Werewolf) return;
  revertToHumanForm(entity);
}

export interface MoonHowlerCureAttempt {
  cured: Entity[];
  /** Priests slain when the exorcism failed. */
  priestsKilled: Entity[];
  /** Priest left the church for the rite (even if outcome pending/fail without death). */
  priestsDeployed: Entity[];
  attempted: boolean;
  /** Why no rite ran — useful for UI/debug. */
  skippedReason?: 'not_full_moon_night' | 'no_howler' | 'no_staffed_church' | 'rate_limited' | 'no_priest';
  /** Which of the three RNG outcomes landed (only if attempted). */
  outcome?: MoonHowlerRiteOutcome;
  /** Priests on duty this attempt (scales cure odds). */
  priestCount?: number;
  /** Cure weight used for the roll (0–1). */
  cureChance?: number;
}

function findStaffedChurches(buildings: Building[]): Building[] {
  return buildings.filter(
    (b) =>
      b.completed
      && b.type === BuildingType.Church
      && b.faction !== 'rival'
      && b.occupants.length > 0,
  );
}

function isEligiblePriest(e: Entity | undefined): e is Entity {
  return !!e
    && e.alive
    && e.type === EntityType.Human
    && !e.faction
    && !e.moonHowlerCursed;
}

function pickPriest(
  church: Building,
  entityById: Map<number, Entity>,
): Entity | null {
  for (const id of church.occupants) {
    const e = entityById.get(id);
    if (isEligiblePriest(e)) return e;
  }
  return null;
}

/** Living eligible priests on all staffed churches (village-wide count). */
export function countStaffedPriests(
  buildings: Building[],
  entityById: Map<number, Entity>,
): number {
  let n = 0;
  for (const church of findStaffedChurches(buildings)) {
    for (const id of church.occupants) {
      if (isEligiblePriest(entityById.get(id))) n++;
    }
  }
  return n;
}

function humanDisplayName(entity: Entity): string {
  if (entity.name) {
    return entity.surname ? `${entity.name} ${entity.surname}` : entity.name;
  }
  return 'A settler';
}

/**
 * Full-moon night (20:00–06:00) only.
 *
 * **No staffed Church → no attempt.** Howler is not stopped: keeps hunting
 * settlers/wildlife and stays cursed for the next full moon.
 *
 * With a staffed Church: one weighted RNG outcome (see rollMoonHowlerRiteOutcome).
 * Outcomes 2 & 3 never call cureMoonHowler — curse persists.
 */
export function tryMoonHowlerChurchCures(
  state: WorldState,
  entities: Entity[],
  buildings: Building[],
  colonyDay: number,
  hourOfDay: number,
  entityById: Map<number, Entity>,
  rng: () => number = Math.random,
): MoonHowlerCureAttempt {
  const empty = (
    skippedReason: NonNullable<MoonHowlerCureAttempt['skippedReason']>,
  ): MoonHowlerCureAttempt => ({
    cured: [],
    priestsKilled: [],
    priestsDeployed: [],
    attempted: false,
    skippedReason,
  });

  if (!isMoonHowlerCureWindow(colonyDay, hourOfDay)) {
    return empty('not_full_moon_night');
  }

  const howlers = entities.filter(isActiveMoonHowler);
  if (howlers.length === 0) return empty('no_howler');

  // No staffed church ⇒ howler is not opposed tonight.
  const churches = findStaffedChurches(buildings);
  if (churches.length === 0) return empty('no_staffed_church');

  const priestCount = countStaffedPriests(buildings, entityById);
  if (priestCount <= 0) return empty('no_priest');

  const last = state.lastMoonHowlerExorcismTick ?? -9999;
  if (state.tick - last < MOON_HOWLER_EXORCISM_INTERVAL_HOURS) {
    return empty('rate_limited');
  }

  const howler = howlers[Math.floor(rng() * howlers.length)]!;
  const church = churches[Math.floor(rng() * churches.length)]!;
  const priest = pickPriest(church, entityById);
  if (!priest) return empty('no_priest');

  const weights = moonHowlerRiteWeights(priestCount);
  state.lastMoonHowlerExorcismTick = state.tick;

  // Priest leaves the church and approaches the howler.
  church.occupants = church.occupants.filter((id) => id !== priest.id);
  if (priest.homeBuildingId === church.id) {
    priest.homeBuildingId = undefined;
  }
  const approachAngle = Math.atan2(howler.y - church.y, howler.x - church.x);
  priest.x = howler.x - Math.cos(approachAngle) * 28;
  priest.y = howler.y - Math.sin(approachAngle) * 28;
  priest.vx = 0;
  priest.vy = 0;
  priest.spriteAngle = approachAngle;
  priest.flash = 6;

  howler.x = Math.max(24, Math.min(state.width - 24, howler.x));
  howler.y = Math.max(24, Math.min(state.height - 24, howler.y));
  howler.spriteAngle = approachAngle + Math.PI;
  howler.combatTicks = Math.max(howler.combatTicks ?? 0, 8);

  const result: MoonHowlerCureAttempt = {
    cured: [],
    priestsKilled: [],
    priestsDeployed: [priest],
    attempted: true,
    priestCount,
    cureChance: weights.cure,
  };

  const priestName = humanDisplayName(priest);
  const howlerName = humanDisplayName(howler);
  const curePct = Math.round(weights.cure * 100);

  addFloatingText(state, priest.x, priest.y - 18, 'Exorcism!', '#a5b4fc', 'brief');
  if (priestCount > 1) {
    addFloatingText(
      state,
      church.x + church.width / 2,
      church.y - 12,
      `${priestCount} priests · ${curePct}%`,
      '#a5b4fc',
      'brief',
    );
  }
  logEvent(
    state,
    'event',
    `${priestName} left the Church to confront Moon Howler ${howlerName}`
      + (priestCount > 1
        ? ` (${priestCount} priests on duty — ${curePct}% cure chance)`
        : ''),
    priestName,
  );

  const outcome = rollMoonHowlerRiteOutcome(rng, priestCount);
  result.outcome = outcome;

  // ── 1) Cured + priest lives ─────────────────────────────────
  if (outcome === 'cured') {
    cureMoonHowler(howler);
    result.cured.push(howler);
    const line = WEREWOLF_CURE_LINES[Math.floor(rng() * WEREWOLF_CURE_LINES.length)]!;
    addFloatingText(state, howler.x, howler.y - 22, 'Cured!', '#22c55e', 'emphasis');
    addFloatingText(state, priest.x, priest.y - 28, 'Amen', '#c4b5fd', 'brief');
    logEvent(state, 'event', `${howlerName} — ${line}`, howlerName);
    logEvent(state, 'event', `${priestName} survived the rite and returned to the Church`, priestName);
    priest.x = church.x + church.width / 2;
    priest.y = church.y + church.height * 0.9;
    if (!church.occupants.includes(priest.id)) church.occupants.push(priest.id);
    priest.homeBuildingId = church.id;
    priest.job = JobType.Priest;
    priest.occupation = 'priest';
    return result;
  }

  // Failed cures: howler STAYS cursed (moonHowlerCursed untouched) → next full moon again.
  // Howler remains free to hunt other settlers the rest of the night via wildlife AI.

  // ── 2) Not cured + priest dies ──────────────────────────────
  if (outcome === 'priest_killed') {
    const attack = WEREWOLF_ATTACK_LINES[Math.floor(rng() * WEREWOLF_ATTACK_LINES.length)]!(
      howlerName,
      priestName,
    );
    priest.alive = false;
    entityById.delete(priest.id);
    for (const b of buildings) {
      if (b.occupants.includes(priest.id)) {
        b.occupants = b.occupants.filter((id) => id !== priest.id);
      }
    }
    priest.homeBuildingId = undefined;
    priest.residenceBuildingId = undefined;
    priest.prisonBuildingId = undefined;
    if (priest.partnerId != null) {
      const spouse = entityById.get(priest.partnerId);
      if (spouse?.alive && spouse.partnerId === priest.id) {
        spouse.partnerId = undefined;
        spouse.relationshipStatus = spouse.pregnant ? 'expecting' : 'single';
      }
      priest.partnerId = undefined;
    }
    createDeathParticles(state, priest.x, priest.y, '#8B0000', 10);
    impulseScreenShake(state, 5);
    howler.energy = Math.min(howler.maxEnergy, howler.energy + 120);
    howler.combatTicks = 12;
    howler.flash = 10;
    // Explicit: curse remains
    howler.moonHowlerCursed = true;
    result.priestsKilled.push(priest);
    addFloatingText(state, howler.x, howler.y - 20, 'Devoured!', '#ef4444', 'emphasis');
    addFloatingText(state, howler.x, howler.y - 34, 'Still cursed', '#c4b5fd', 'brief');
    logEvent(state, 'death', attack, priestName);
    logEvent(
      state,
      'combat',
      `Moon Howler ${howlerName} killed priest ${priestName} — curse unbroken; will hunt again next full moon`,
      howlerName,
    );
    return result;
  }

  // ── 3) Not cured + priest flees (lives) ─────────────────────
  priest.x = church.x + church.width / 2 + (rng() - 0.5) * 10;
  priest.y = church.y + church.height * 0.95;
  if (!church.occupants.includes(priest.id)) church.occupants.push(priest.id);
  priest.homeBuildingId = church.id;
  priest.job = JobType.Priest;
  priest.occupation = 'priest';
  priest.flash = 8;
  howler.moonHowlerCursed = true;
  howler.flash = 8;
  addFloatingText(state, priest.x, priest.y - 18, 'Fled!', '#fca5a5', 'brief');
  addFloatingText(state, howler.x, howler.y - 18, 'AWOO!', '#c4b5fd', 'brief');
  addFloatingText(state, howler.x, howler.y - 32, 'Still cursed', '#c4b5fd', 'brief');
  logEvent(
    state,
    'event',
    `${priestName} failed to break ${howlerName}'s curse and fled to the Church — howler remains cursed for the next full moon`,
    priestName,
  );
  return result;
}

/** Convert legacy permanent werewolf saves into cursed villagers. */
export function migrateLegacyMoonHowler(entity: Entity, colonyDay: number, hourOfDay: number): void {
  if (entity.type !== EntityType.Werewolf || entity.moonHowlerCursed) return;

  entity.moonHowlerCursed = true;
  entity.surname = entity.surname || 'Moonborn';
  entity.generation = Math.max(entity.generation ?? 0, 1);

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
  buildings?: Building[],
  mapWidth = 1200,
  mapHeight = 900,
): MoonHowlerSyncResult {
  const transformTick = isMoonHowlerTransformTick(colonyDay, hourOfDay);
  const revertTick = isMoonHowlerRevertTick(hourOfDay);
  const transformed: Entity[] = [];
  const reverted: Entity[] = [];

  for (const entity of entities) {
    if (!entity.alive || !entity.moonHowlerCursed || !isMoonHowlerEligible(entity)) continue;

    if (transformTick && entity.type === EntityType.Human) {
      transformToWerewolfForm(entity);
      if (buildings) {
        forceMoonHowlerOutside(entity, buildings, mapWidth, mapHeight);
      }
      transformed.push(entity);
    } else if (revertTick && entity.type === EntityType.Werewolf) {
      revertToHumanForm(entity);
      reverted.push(entity);
    }
  }

  const huntingTonight = entities.some((e) => isActiveMoonHowler(e));

  return {
    transformed,
    reverted,
    nightFall: transformTick && (transformed.length > 0 || huntingTonight),
  };
}

export interface MoonHowlerTickResult {
  byType: EntityByType;
  entityById: Map<number, Entity>;
  changed: boolean;
}

/**
 * Full Moon Howler cycle for one game tick.
 *
 * - Syncs werewolf ↔ human forms at transform/revert hours.
 * - Applies a new curse at full-moon nightfall if no cursed settler exists.
 * - Attempts church cures during the cure window.
 *
 * Mutates `aliveEntities` and `entityById` in place. Returns the rebuilt
 * `byType` index and a flag indicating whether any entity changed form.
 */
export function tickMoonHowlerCycle(
  state: WorldState,
  aliveEntities: Entity[],
  buildings: Building[],
  colonyDay: number,
  hourOfDay: number,
  entityById: Map<number, Entity>,
): MoonHowlerTickResult {
  let byType = buildEntityByType(aliveEntities);
  let changed = false;

  const moonSync = syncMoonHowlerForms(aliveEntities, colonyDay, hourOfDay, buildings, state.width, state.height);
  if (moonSync.transformed.length > 0 || moonSync.reverted.length > 0) {
    byType = buildEntityByType(aliveEntities);
    syncResidenceOccupants(
      aliveEntities.filter((e) => e.alive && e.type === EntityType.Human),
      buildings,
    );
    changed = true;
  }

  if (moonSync.nightFall) {
    addBigNews(state, '🌝 Full Moon!', 'Moon Howlers are abroad. Keep settlers indoors — they hunt tonight.', 'negative');
    logEvent(state, 'event', 'Full moon rose — cursed settlers transformed');
  }

  for (const were of moonSync.transformed) {
    const who = were.name ? `${were.name}${were.surname ? ` ${were.surname}` : ''}` : 'A settler';
    const line = WEREWOLF_TRANSFORM_LINES[Math.floor(Math.random() * WEREWOLF_TRANSFORM_LINES.length)](who);
    addFloatingText(state, were.x, were.y - 20, 'AWOO!', '#c4b5fd');
    logEvent(state, 'event', line, who);
  }

  const activeMoonCurses = countActiveMoonHowlerCurses(aliveEntities);
  const humanPop = aliveEntities.filter((e) => e.alive && isPlayerHuman(e)).length;
  if (shouldApplyNewMoonHowlerCurse(colonyDay, hourOfDay, humanPop, activeMoonCurses)) {
    const candidates = byType[EntityType.Human].filter((h) => isPlayerHuman(h) && canMoonHowlerCurse(h));
    const human = candidates[Math.floor(Math.random() * candidates.length)];
    if (human) {
      const who = human.name ? `${human.name}${human.surname ? ` ${human.surname}` : ''}` : 'A settler';
      curseMoonHowler(human);
      transformToWerewolfForm(human);
      byType = buildEntityByType(aliveEntities);
      changed = true;
      const line = WEREWOLF_CURSE_LINES[Math.floor(Math.random() * WEREWOLF_CURSE_LINES.length)](who);
      addBigNews(state, '🌝 Moon Howler Curse!', line, 'negative');
      addFloatingText(state, human.x, human.y - 20, 'Cursed…', '#c4b5fd');
      logEvent(state, 'event', `${who} was cursed as a Moon Howler`, who);
      const transformLine = WEREWOLF_TRANSFORM_LINES[Math.floor(Math.random() * WEREWOLF_TRANSFORM_LINES.length)](who);
      addFloatingText(state, human.x, human.y - 20, 'AWOO!', '#c4b5fd');
      logEvent(state, 'event', transformLine, who);
      if (!moonSync.nightFall) {
        addBigNews(state, '🌝 Full Moon!', 'Moon Howlers are abroad. Keep settlers indoors — they hunt tonight.', 'negative');
        logEvent(state, 'event', 'Full moon rose — cursed settlers transformed');
      }
    }
  }

  const dawnCures = tryMoonHowlerChurchCures(state, aliveEntities, buildings, colonyDay, hourOfDay, entityById);
  if (dawnCures.cured.length > 0) {
    for (const curedOne of dawnCures.cured) {
      const who = curedOne.name ? `${curedOne.name}${curedOne.surname ? ` ${curedOne.surname}` : ''}` : 'A settler';
      const line = WEREWOLF_TAME_LINES[Math.floor(Math.random() * WEREWOLF_TAME_LINES.length)];
      addBigNews(state, '⛪ Curse Broken!', `${who} — ${line}`, 'positive');
      addFloatingText(state, curedOne.x, curedOne.y - 20, 'Cured!', '#22c55e');
      logEvent(state, 'event', `${who} was cured of the Moon Howler curse`, who);
    }
    byType = buildEntityByType(aliveEntities);
    changed = true;
  }

  return { byType, entityById, changed };
}
