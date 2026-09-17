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
  HUMAN_ADULT_MIN_AGE,
  isFullMoonDay,
  isFullMoonNight,
  NIGHT_END,
  NIGHT_START,
} from './dayCycleConstants';
import {
  assignMissingResidences,
  isStartOfClockHour,
  killHuman,
  syncResidenceOccupants,
  TICKS_PER_HOUR,
} from './dayCycle';
import { isPlayerHuman } from './playerHuman';
import { buildEntityByType } from './simFocus';
import {
  addBigNews,
  addFloatingText,
  createDeathParticles,
  impulseScreenShake,
} from './simEffects';
import { logDeath, logEvent } from './eventLog';
import { assignMissingWorkers } from './workforce';
import { isBarracksGuard } from './defenseStructures';
import { getSimRng } from './simRng';
import { HUMAN_FORM, revertToHumanForm } from './moonHowlerForm';
import type { RevertToHumanFormOptions } from './moonHowlerForm';

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
/** Maximum cure weight for the unique Church's four-priest capacity. */
export const MOON_HOWLER_CURE_CHANCE_MAX = 0.71;

/** @deprecated UI compat — kill share among failures at base weights */
export const MOON_HOWLER_PRIEST_KILL_CHANCE =
  MOON_HOWLER_OUTCOME_KILL_PRIEST / (MOON_HOWLER_OUTCOME_KILL_PRIEST + MOON_HOWLER_OUTCOME_FLEE);

/** How often (in-game clock hours) a priest may attempt while the night window is open. */
export const MOON_HOWLER_EXORCISM_INTERVAL_HOURS = 2;

/** The priest must be within this distance (world px) of the howler to attempt the rite. */
export const MOON_HOWLER_EXORCISM_RANGE = 200;

/** Barracks guards within this distance (world px) of the priest can roll to save them. */
export const MOON_HOWLER_GUARD_PROTECT_RANGE = 220;

/** Per-guard save chance when a failed rite would kill the priest (extra roll, not guaranteed). */
export const MOON_HOWLER_GUARD_SAVE_CHANCE = 0.5;

/**
 * Chance that a full moon with NO active curse creates a REPLACEMENT Howler.
 * SIMULATION_AUTHORITY §5: "A replacement Howler appears only through a rare
 * replacement roll" — a full moon must NOT guarantee a new Howler. Survivor
 * returns are handled by the return path; only a quiet moon after a kill/cure
 * reaches this roll (~1-2 replacements per year, down from every full moon).
 */
export const MOON_HOWLER_REPLACEMENT_CHANCE = 0.15;

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
  rng: () => number = getSimRng('moonHowler'),
  priestCount = 1,
): MoonHowlerRiteOutcome {
  const w = moonHowlerRiteWeights(priestCount);
  if (w.priestCount <= 0) return 'priest_fled';
  const r = rng();
  if (r < w.cure) return 'cured';
  if (r < w.cure + w.killPriest) return 'priest_killed';
  return 'priest_fled';
}

const WEREWOLF_FORM = { maxEnergy: 700, speed: 3.4, size: 14 };

export function countActiveMoonHowlerCurses(entities: readonly Entity[]): number {
  return entities.filter((e) => e.alive && e.moonHowlerCursed).length;
}

export function canBeginMoonHowlerCurse(entities: readonly Entity[]): boolean {
  return countActiveMoonHowlerCurses(entities) === 0;
}

export function shouldApplyNewMoonHowlerCurse(
  colonyDay: number,
  hourOfDay: number,
  humanCount: number,
  activeCursed: number,
  rng: () => number = getSimRng('moonHowler'),
): boolean {
  return (
    activeCursed === 0
    && humanCount > 5
    && hourOfDay === NIGHT_START
    && isFullMoonNight(colonyDay, hourOfDay)
    && rng() < MOON_HOWLER_REPLACEMENT_CHANCE
  );
}

export interface MoonHowlerSavedState
  extends Pick<Entity,
    'relationshipStatus'
    | 'partnerId'
    | 'affairPartnerId'
    | 'affairProgress'
    | 'courtshipProgress'
    | 'youthLovePartnerId'
    | 'youthLoveProgress'
    | 'youthLoveStartedDay'
    | 'pregnant'
    | 'pregnantById'
    | 'pregnancyProgress'
    | 'pregnancyDueProgress'
    | 'huntTargetId'
    | 'combatTicks'
  > {
  energy: number;
  maxEnergy: number;
  speed: number;
  size: number;
  job?: Entity['job'];
  occupation?: string;
  homeBuildingId?: number;
  residenceBuildingId?: number;
  prisonBuildingId?: number;
  prisonerUntilTick?: number;
  prisonSentenceCrime?: Entity['prisonSentenceCrime'];
}

function detachEntityFromBuildingOccupants(buildings: Building[], buildingId: number | undefined, entityId: number): void {
  if (buildingId == null) return;
  const b = buildings.find((x) => x.id === buildingId);
  if (b) b.occupants = b.occupants.filter((id) => id !== entityId);
}

export function shouldMoonHowlerTransform(colonyDay: number, hourOfDay: number): boolean {
  return isFullMoonNight(colonyDay, hourOfDay);
}

export function isMoonHowlerTransformTick(colonyDay: number, hourOfDay: number): boolean {
  return hourOfDay === NIGHT_START && isFullMoonDay(colonyDay);
}

export function isMoonHowlerRevertTick(hourOfDay: number): boolean {
  return hourOfDay === NIGHT_END;
}

export function isMoonHowlerCureWindow(colonyDay: number, hourOfDay: number): boolean {
  return shouldMoonHowlerTransform(colonyDay, hourOfDay);
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

export function curseMoonHowler(human: Entity): void {
  human.moonHowlerCursed = true;
  human.surname = human.surname || 'Moonborn';
  human.flash = 10;
}

export function forceMoonHowlerOutside(
  entity: Entity,
  buildings: Building[],
  mapWidth: number,
  mapHeight: number,
): void {
  const saved = entity.moonHowlerSaved;
  const jobId = entity.homeBuildingId ?? saved?.homeBuildingId;
  const residenceId = entity.residenceBuildingId ?? saved?.residenceBuildingId;
  const prisonId = entity.prisonBuildingId ?? saved?.prisonBuildingId;

  detachEntityFromBuildingOccupants(buildings, jobId, entity.id);
  detachEntityFromBuildingOccupants(buildings, residenceId, entity.id);
  detachEntityFromBuildingOccupants(buildings, prisonId, entity.id);

  if (entity.homeBuildingId != null) entity.homeBuildingId = undefined;
  if (entity.residenceBuildingId != null) entity.residenceBuildingId = undefined;

  if (
    entity.prisonBuildingId != null
    && saved
    && (saved.prisonBuildingId != null || saved.prisonerUntilTick != null)
  ) {
    entity.prisonBuildingId = undefined;
    entity.prisonerUntilTick = undefined;
    entity.prisonSentenceCrime = undefined;
  }

  const angle = getSimRng('moonHowler')() * Math.PI * 2;
  const dist = 40 + getSimRng('moonHowler')() * 50;
  entity.x = Math.max(24, Math.min(mapWidth - 24, entity.x + Math.cos(angle) * dist));
  entity.y = Math.max(24, Math.min(mapHeight - 24, entity.y + Math.sin(angle) * dist));
  entity.vx = Math.cos(angle) * 1.2;
  entity.vy = Math.sin(angle) * 1.2;
  entity.spriteAngle = angle;
}

export function transformToWerewolfForm(human: Entity, buildings: Building[]): void {
  const cfg = WEREWOLF_FORM;
  const liveJobId = human.homeBuildingId;
  const liveResidenceId = human.residenceBuildingId;
  const livePrisonId = human.prisonBuildingId;

  human.moonHowlerSaved = {
    energy: human.energy,
    maxEnergy: human.maxEnergy,
    speed: human.speed,
    size: human.size,
    job: human.job,
    occupation: human.occupation,
    homeBuildingId: liveJobId,
    residenceBuildingId: liveResidenceId,
    prisonBuildingId: livePrisonId,
    prisonerUntilTick: human.prisonerUntilTick,
    prisonSentenceCrime: human.prisonSentenceCrime,
    relationshipStatus: human.relationshipStatus,
    partnerId: human.partnerId,
    affairPartnerId: human.affairPartnerId,
    affairProgress: human.affairProgress,
    courtshipProgress: human.courtshipProgress,
    youthLovePartnerId: human.youthLovePartnerId,
    youthLoveProgress: human.youthLoveProgress,
    youthLoveStartedDay: human.youthLoveStartedDay,
    pregnant: human.pregnant,
    pregnantById: human.pregnantById,
    pregnancyProgress: human.pregnancyProgress,
    huntTargetId: human.huntTargetId,
    combatTicks: human.combatTicks,
  };

  detachEntityFromBuildingOccupants(buildings, liveJobId, human.id);
  detachEntityFromBuildingOccupants(buildings, liveResidenceId, human.id);
  detachEntityFromBuildingOccupants(buildings, livePrisonId, human.id);

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
  human.homeBuildingId = undefined;
  human.residenceBuildingId = undefined;
  human.prisonBuildingId = undefined;
  human.prisonerUntilTick = undefined;
  human.prisonSentenceCrime = undefined;
}

export function cureMoonHowler(entity: Entity, opts?: RevertToHumanFormOptions): void {
  if (entity.type === EntityType.Werewolf) {
    revertToHumanForm(entity, opts);
  }
  entity.moonHowlerCursed = false;
  entity.moonHowlerSaved = undefined;
  entity.tamedBy = undefined;
}

export interface MoonHowlerCureAttempt {
  cured: Entity[];
  priestsKilled: Entity[];
  priestsDeployed: Entity[];
  attempted: boolean;
  skippedReason?: 'not_full_moon_night' | 'no_howler' | 'no_staffed_church' | 'rate_limited' | 'no_priest' | 'priests_scared' | 'priest_too_far';
  outcome?: MoonHowlerRiteOutcome;
  priestCount?: number;
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

function guardsNearPriest(priest: Entity, entities: Entity[], buildings: Building[]): Entity[] {
  const rangeSq = MOON_HOWLER_GUARD_PROTECT_RANGE * MOON_HOWLER_GUARD_PROTECT_RANGE;
  const guards: Entity[] = [];
  for (const e of entities) {
    if (!e.alive || e.type !== EntityType.Human || e.job !== JobType.Soldier) continue;
    if (!isBarracksGuard(e.id, e.homeBuildingId, buildings)) continue;
    const dx = e.x - priest.x;
    const dy = e.y - priest.y;
    if (dx * dx + dy * dy <= rangeSq) guards.push(e);
  }
  return guards;
}

function humanDisplayName(entity: Entity): string {
  if (entity.name) {
    return `${entity.name}${entity.surname ? ` ${entity.surname}` : ''}${entity.title ? ` ${entity.title}` : ''}`;
  }
  return 'A settler';
}

export function tryMoonHowlerChurchCures(
  state: WorldState,
  entities: Entity[],
  buildings: Building[],
  colonyDay: number,
  hourOfDay: number,
  entityById: Map<number, Entity>,
  rng: () => number = getSimRng('moonHowler'),
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

  if (state.tick < (state.moonHowlerPriestsFleeUntil ?? -1)) {
    return empty('priests_scared');
  }

  const howlers = entities.filter(isActiveMoonHowler);
  if (howlers.length === 0) return empty('no_howler');

  const churches = findStaffedChurches(buildings);
  if (churches.length === 0) return empty('no_staffed_church');

  const priestCount = countStaffedPriests(buildings, entityById);
  if (priestCount <= 0) return empty('no_priest');

  const last = state.lastMoonHowlerExorcismTick ?? -9999;
  const riteCooldownTicks = MOON_HOWLER_EXORCISM_INTERVAL_HOURS * TICKS_PER_HOUR;
  if (state.tick - last < riteCooldownTicks) {
    return empty('rate_limited');
  }

  const howler = howlers[Math.floor(rng() * howlers.length)]!;
  const church = churches[Math.floor(rng() * churches.length)]!;
  const priest = pickPriest(church, entityById);
  if (!priest) return empty('no_priest');

  const ddx = howler.x - priest.x;
  const ddy = howler.y - priest.y;
  if (Math.sqrt(ddx * ddx + ddy * ddy) > MOON_HOWLER_EXORCISM_RANGE) {
    return empty('priest_too_far');
  }

  const weights = moonHowlerRiteWeights(priestCount);
  state.lastMoonHowlerExorcismTick = state.tick;

  church.occupants = church.occupants.filter((id) => id !== priest.id);
  if (priest.homeBuildingId === church.id) {
    priest.homeBuildingId = undefined;
  }
  const approachAngle = Math.atan2(howler.y - priest.y, howler.x - priest.x);
  priest.vx = 0;
  priest.vy = 0;
  priest.spriteAngle = approachAngle;
  priest.flash = 6;

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

  let outcome = rollMoonHowlerRiteOutcome(rng, priestCount);
  result.outcome = outcome;

  if (outcome === 'cured') {
    const humans = entities.filter((e) => e.alive && e.type === EntityType.Human);
    cureMoonHowler(howler, { buildings, humans, tick: state.tick, villageLeaderId: state.villageLeaderId });
    if (!humans.includes(howler)) humans.push(howler);
    result.cured.push(howler);
    const line = WEREWOLF_CURE_LINES[Math.floor(rng() * WEREWOLF_CURE_LINES.length)]!;
    addFloatingText(state, howler.x, howler.y - 22, 'Cured!', '#22c55e', 'emphasis');
    addFloatingText(state, priest.x, priest.y - 28, 'Amen', '#c4b5fd', 'brief');
    if (!priest.title) {
      priest.title = 'Howlerbane';
      addFloatingText(state, priest.x, priest.y - 34, 'Howlerbane!', '#fbbf24', 'brief');
      logEvent(state, 'event', `${priestName} broke the curse and earned the title Howlerbane`, priestName);
    }
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

  if (outcome === 'priest_killed') {
    let guarded = false;
    for (const _guard of guardsNearPriest(priest, entities, buildings)) {
      if (rng() < MOON_HOWLER_GUARD_SAVE_CHANCE) {
        guarded = true;
        break;
      }
    }
    if (guarded) {
      outcome = 'priest_fled';
      result.outcome = outcome;
      addFloatingText(state, priest.x, priest.y - 26, '🛡️ Guarded!', '#38bdf8', 'brief');
      logEvent(
        state,
        'combat',
        `A Barracks guard covered priest ${priestName} — the Moon Howler's strike was turned, curse unbroken`,
        priestName,
      );
    } else {
      const attack = WEREWOLF_ATTACK_LINES[Math.floor(rng() * WEREWOLF_ATTACK_LINES.length)]!(
        howlerName,
        priestName,
      );
      killHuman(priest, buildings, entityById, state.tick);
      createDeathParticles(state, priest.x, priest.y, '#8B0000', 10);
      impulseScreenShake(state, 5);
      howler.energy = Math.min(howler.maxEnergy, howler.energy + 120);
      howler.combatTicks = 12;
      howler.flash = 10;
      howler.moonHowlerCursed = true;
      result.priestsKilled.push(priest);
      state.moonHowlerPriestsFleeUntil = state.tick + MOON_HOWLER_EXORCISM_INTERVAL_HOURS * TICKS_PER_HOUR;
      addFloatingText(state, howler.x, howler.y - 20, 'Devoured!', '#ef4444', 'emphasis');
      addFloatingText(state, howler.x, howler.y - 34, 'Still cursed', '#c4b5fd', 'brief');
      logDeath(state, attack, priestName, { x: priest.x, y: priest.y });
      logEvent(
        state,
        'combat',
        `Moon Howler ${howlerName} killed priest ${priestName} — curse unbroken; will hunt again next full moon`,
        howlerName,
      );
      return result;
    }
  }

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
  buildings: Building[],
  mapWidth = 1200,
  mapHeight = 900,
  tick?: number,
  villageLeaderId?: number | null,
): MoonHowlerSyncResult {
  const wantWerewolf = shouldMoonHowlerTransform(colonyDay, hourOfDay);
  const transformTick = isMoonHowlerTransformTick(colonyDay, hourOfDay);
  const transformed: Entity[] = [];
  const reverted: Entity[] = [];
  const humans = entities.filter((e) => e.alive && e.type === EntityType.Human);
  const revertOpts: RevertToHumanFormOptions = { buildings, humans, tick, villageLeaderId };

  for (const entity of entities) {
    if (!entity.alive || !entity.moonHowlerCursed || !isMoonHowlerEligible(entity)) continue;

    if (wantWerewolf && entity.type === EntityType.Human) {
      transformToWerewolfForm(entity, buildings);
      forceMoonHowlerOutside(entity, buildings, mapWidth, mapHeight);
      transformed.push(entity);
    } else if (!wantWerewolf && entity.type === EntityType.Werewolf) {
      revertToHumanForm(entity, revertOpts);
      if (!humans.includes(entity)) humans.push(entity);
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

export function tickMoonHowlerCycle(
  state: WorldState,
  aliveEntities: Entity[],
  buildings: Building[],
  colonyDay: number,
  hourOfDay: number,
  entityById: Map<number, Entity>,
  initialByType?: EntityByType,
  rng: () => number = getSimRng('moonHowler'),
): MoonHowlerTickResult {
  let byType = initialByType ?? buildEntityByType(aliveEntities);
  let changed = false;

  const moonSync = syncMoonHowlerForms(
    aliveEntities,
    colonyDay,
    hourOfDay,
    buildings,
    state.width,
    state.height,
    state.tick,
    state.villageLeaderId,
  );
  if (moonSync.transformed.length > 0 || moonSync.reverted.length > 0) {
    byType = buildEntityByType(aliveEntities);
    syncResidenceOccupants(
      aliveEntities.filter((e) => e.alive && e.type === EntityType.Human),
      buildings,
    );
    if (moonSync.reverted.length > 0) {
      const villagers = aliveEntities.filter((e) => e.alive && e.type === EntityType.Human && isPlayerHuman(e));
      assignMissingResidences(villagers, buildings, aliveEntities);
      assignMissingWorkers(villagers, buildings);
    }
    changed = true;
  }

  const firstTickOfHour = isStartOfClockHour(state.tick);
  if (moonSync.nightFall && (firstTickOfHour || moonSync.transformed.length > 0)) {
    addBigNews(state, '🌝 Full Moon!', 'Moon Howlers are abroad. Keep settlers indoors — they hunt tonight.', 'negative');
    logEvent(state, 'event', 'Full moon rose — cursed settlers transformed');
  }

  for (const were of moonSync.transformed) {
    const who = were.name ? `${were.name}${were.surname ? ` ${were.surname}` : ''}` : 'A settler';
    const line = WEREWOLF_TRANSFORM_LINES[Math.floor(getSimRng('moonHowler')() * WEREWOLF_TRANSFORM_LINES.length)](who);
    addFloatingText(state, were.x, were.y - 20, 'AWOO!', '#c4b5fd');
    logEvent(state, 'event', line, who);
  }

  if (isMoonHowlerCureWindow(colonyDay, hourOfDay)) {
    for (const were of aliveEntities) {
      if (!isActiveMoonHowler(were)) continue;
      const inside = buildings.some(
        (b) =>
          b.completed
          && were.x >= b.x
          && were.x <= b.x + b.width
          && were.y >= b.y
          && were.y <= b.y + b.height,
      );
      if (inside) {
        forceMoonHowlerOutside(were, buildings, state.width, state.height);
        changed = true;
      }
    }
  }

  const replacementDecisionTick = firstTickOfHour && hourOfDay === NIGHT_START;
  const activeMoonCurses = replacementDecisionTick ? countActiveMoonHowlerCurses(aliveEntities) : 0;
  const humanPop = replacementDecisionTick
    ? aliveEntities.filter((e) => e.alive && isPlayerHuman(e)).length
    : 0;
  if (replacementDecisionTick && shouldApplyNewMoonHowlerCurse(colonyDay, hourOfDay, humanPop, activeMoonCurses, rng)) {
    const candidates = byType[EntityType.Human].filter((h) => isPlayerHuman(h) && canMoonHowlerCurse(h));
    const human = candidates[Math.floor(rng() * candidates.length)];
    if (human) {
      const who = human.name ? `${human.name}${human.surname ? ` ${human.surname}` : ''}` : 'A settler';
      curseMoonHowler(human);
      transformToWerewolfForm(human, buildings);
      forceMoonHowlerOutside(human, buildings, state.width, state.height);
      byType = buildEntityByType(aliveEntities);
      syncResidenceOccupants(
        aliveEntities.filter((e) => e.alive && e.type === EntityType.Human),
        buildings,
      );
      changed = true;
      const line = WEREWOLF_CURSE_LINES[Math.floor(getSimRng('moonHowler')() * WEREWOLF_CURSE_LINES.length)](who);
      addBigNews(state, '🌝 Moon Howler Curse!', line, 'negative');
      addFloatingText(state, human.x, human.y - 20, 'Cursed…', '#c4b5fd');
      logEvent(state, 'event', `${who} was cursed as a Moon Howler`, who);
      const transformLine = WEREWOLF_TRANSFORM_LINES[Math.floor(getSimRng('moonHowler')() * WEREWOLF_TRANSFORM_LINES.length)](who);
      addFloatingText(state, human.x, human.y - 20, 'AWOO!', '#c4b5fd');
      logEvent(state, 'event', transformLine, who);
      if (!moonSync.nightFall) {
        addBigNews(state, '🌝 Full Moon!', 'Moon Howlers are abroad. Keep settlers indoors — they hunt tonight.', 'negative');
        logEvent(state, 'event', 'Full moon rose — cursed settlers transformed');
      }
    }
  }

  const dawnCures = tryMoonHowlerChurchCures(state, aliveEntities, buildings, colonyDay, hourOfDay, entityById, rng);
  if (dawnCures.cured.length > 0) {
    for (const curedOne of dawnCures.cured) {
      const who = curedOne.name ? `${curedOne.name}${curedOne.surname ? ` ${curedOne.surname}` : ''}` : 'A settler';
      const line = WEREWOLF_TAME_LINES[Math.floor(getSimRng('moonHowler')() * WEREWOLF_TAME_LINES.length)];
      addBigNews(state, '⛪ Curse Broken!', `${who} — ${line}`, 'positive');
      addFloatingText(state, curedOne.x, curedOne.y - 20, 'Cured!', '#22c55e');
      logEvent(state, 'event', `${who} was cured of the Moon Howler curse`, who);
    }
    byType = buildEntityByType(aliveEntities);
    const humansAfterCure = aliveEntities.filter((e) => e.alive && e.type === EntityType.Human);
    syncResidenceOccupants(humansAfterCure, buildings);
    const villagers = humansAfterCure.filter((e) => isPlayerHuman(e));
    assignMissingResidences(villagers, buildings, aliveEntities);
    assignMissingWorkers(villagers, buildings);
    changed = true;
  }

  return { byType, entityById, changed };
}