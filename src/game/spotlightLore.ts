import type { Entity, SpotlightLoreState, WorldState } from './gameTypes';
import { EntityType, JobType } from './gameTypes';
import { getAbsoluteCalendarDay, getHourOfDay, isStartOfClockHour, isWeekend } from './dayCycleClock';
import { personDayRoll } from './humanSchedule';
import { isPlayerHuman } from './playerHuman';
import { nearestWalkableWorldPoint } from './pathfinding';
import { logEvent } from './eventLog';

const SPOTLIGHT_COOLDOWN_DAYS = 90;
const SPOTLIGHT_GATHER_TIMEOUT_TICKS = 65;
const SPOTLIGHT_READY_TIMEOUT_TICKS = 150;
const SPOTLIGHT_ARRIVAL_DISTANCE = 11;
const SPOTLIGHT_MIN_CHORUS = 6;
const SPOTLIGHT_MAX_CHORUS = 10;

/** A non-romantic village performance, never a source of gameplay rewards. */
function eligibleGirl(entity: Entity): boolean {
  return entity.alive && entity.type === EntityType.Human && isPlayerHuman(entity) &&
    entity.gender === 'female' && entity.isJuvenile && entity.age >= 12 && entity.age < 18 &&
    !entity.prisonBuildingId && !entity.raidDeploymentId && !entity.indoorBuildingId &&
    !entity.departedAlive && !entity.warCaptive && !entity.huntTargetId;
}

function eligibleChorus(entity: Entity): boolean {
  return entity.alive && entity.type === EntityType.Human && isPlayerHuman(entity) &&
    !entity.isJuvenile && entity.age >= 18 && !entity.prisonBuildingId &&
    !entity.raidDeploymentId && !entity.departedAlive && !entity.warCaptive &&
    !entity.indoorBuildingId && !entity.huntTargetId &&
    entity.job !== JobType.Doctor && entity.job !== JobType.PrisonGuard &&
    entity.job !== JobType.Soldier && entity.job !== JobType.Innkeeper &&
    entity.job !== JobType.Hotelier && entity.job !== JobType.Priest;
}

/** Called from the existing realtime pulse; the inactive path is O(1). */
export function maybeStartSpotlightLore(state: WorldState): boolean {
  if (state.spotlightLore || state.paused || !state.worldMap ||
      state.electionCeremony || state.festival?.active ||
      state.pendingRaidEvents.length > 0 || state.pendingOutgoingRaidEvents.length > 0 ||
      !isWeekend(state.tick) || getHourOfDay(state.tick) !== 19 ||
      !isStartOfClockHour(state.tick)) return false;
  const day = getAbsoluteCalendarDay(state.tick);
  if (day - (state.spotlightLoreLastDay ?? -100000) < SPOTLIGHT_COOLDOWN_DAYS) return false;
  const salt = state.nextEntityId + state.width * 37 + state.height * 19;
  if (personDayRoll(salt, state.tick, 3919) >= 0.075) return false;

  const girls = state.entities.filter(eligibleGirl).sort((a, b) => a.id - b.id);
  if (girls.length === 0) return false;
  const girl = girls[Math.floor(personDayRoll(salt, state.tick, 3920) * girls.length)];
  if (!girl) return false;
  const chorus = state.entities.filter((human) =>
    eligibleChorus(human) && Math.hypot(human.x - girl.x, human.y - girl.y) <= 100
  ).sort((a, b) => {
    const da = (a.x - girl.x) ** 2 + (a.y - girl.y) ** 2;
    const db = (b.x - girl.x) ** 2 + (b.y - girl.y) ** 2;
    return da - db || a.id - b.id;
  }).slice(0, SPOTLIGHT_MAX_CHORUS);
  if (chorus.length < SPOTLIGHT_MIN_CHORUS) return false;

  const slots: SpotlightLoreState['slots'] = [];
  for (let i = 0; i < chorus.length; i++) {
    const angle = Math.PI * (0.12 + 0.76 * i / Math.max(1, chorus.length - 1));
    const radius = 27 + (i % 2) * 9;
    const candidateX = Math.max(0, Math.min(state.width - 1, girl.x + Math.cos(angle) * radius));
    const candidateY = Math.max(0, Math.min(state.height - 1, girl.y + Math.sin(angle) * radius));
    const point = nearestWalkableWorldPoint(
      state.worldMap, state.buildings, candidateX, candidateY,
    );
    if (!point || point.x < 0 || point.x >= state.width || point.y < 0 || point.y >= state.height
      || slots.some((slot) => Math.hypot(slot.x - point.x, slot.y - point.y) < 12)) {
      return false;
    }
    slots.push({ humanId: chorus[i].id, x: point.x, y: point.y });
  }
  const scene: SpotlightLoreState = {
    id: `${day}:${girl.id}`,
    heroineId: girl.id,
    performerIds: chorus.map((h) => h.id),
    phase: 'gathering',
    startedAtTick: state.tick,
    gatherX: girl.x,
    gatherY: girl.y,
    slots,
  };
  state.spotlightLore = scene;
  state.spotlightLoreLastDay = day;
  logEvent(state, 'event', `A curious crowd began gathering around ${girl.name ?? 'a young villager'} for an impromptu performance.`, girl.name);
  return true;
}

/** Bounded lookup, not another human/AI movement implementation. */
export function getSpotlightGatherTarget(scene: SpotlightLoreState, humanId: number): { x: number; y: number } | null {
  if (scene.heroineId === humanId) return { x: scene.gatherX, y: scene.gatherY };
  return scene.slots.find((slot) => slot.humanId === humanId) ?? null;
}

/** Resolve <=10 real actors after the normal human movement tick. */
export function tickSpotlightGathering(state: WorldState, entityById: ReadonlyMap<number, Entity>): void {
  const scene = state.spotlightLore;
  if (!scene) return;
  const heroine = entityById.get(scene.heroineId);
  if (!heroine || !eligibleGirl(heroine) || state.electionCeremony || state.festival?.active ||
      state.pendingRaidEvents.length > 0 || state.pendingOutgoingRaidEvents.length > 0) {
    finishSpotlightLore(state, scene.id, 'aborted');
    return;
  }
  let arrived = 0;
  for (const slot of scene.slots) {
    const actor = entityById.get(slot.humanId);
    if (!actor || !eligibleChorus(actor)) {
      finishSpotlightLore(state, scene.id, 'aborted');
      return;
    }
    if (Math.hypot(actor.x - slot.x, actor.y - slot.y) <= SPOTLIGHT_ARRIVAL_DISTANCE) arrived++;
  }
  const heroineArrived = Math.hypot(heroine.x - scene.gatherX, heroine.y - scene.gatherY) <= SPOTLIGHT_ARRIVAL_DISTANCE;
  if (scene.phase === 'ready') {
    // Emergency steering may move an actor off stage during worker/React pause handoff.
    // Never freeze a half-empty performance: danger keeps priority, but the scene aborts.
    if (arrived !== scene.slots.length || !heroineArrived ||
        state.tick - (scene.readyAtTick ?? state.tick) > SPOTLIGHT_READY_TIMEOUT_TICKS) {
      finishSpotlightLore(state, scene.id, 'aborted');
    }
    return;
  }
  if (arrived === scene.slots.length && heroineArrived) {
    scene.phase = 'ready';
    scene.readyAtTick = state.tick;
  } else if (state.tick - scene.startedAtTick > SPOTLIGHT_GATHER_TIMEOUT_TICKS) {
    finishSpotlightLore(state, scene.id, 'aborted');
  }
}

/** Idempotent scene completion, shared by UI command and headless timeout. */
export function finishSpotlightLore(
  state: WorldState,
  sceneId: string,
  reason: 'complete' | 'skipped' | 'aborted',
): boolean {
  const scene = state.spotlightLore;
  if (!scene || scene.id !== sceneId) return false;
  if (reason === 'complete') {
    const heroine = state.entities.find((entity) => entity.id === scene.heroineId);
    logEvent(state, 'event', `The whole village agreed: ${heroine?.name ?? 'the young star'} has the look. Nobody could explain what that meant.`, heroine?.name);
  }
  state.spotlightLore = null;
  return true;
}

/** Save-load validation never consumes RNG or invents earlier events. */
export function normalizeSpotlightLoreOnLoad(state: WorldState): void {
  const day = state.spotlightLoreLastDay;
  if (day != null && (!Number.isSafeInteger(day) || day < 0 ||
      day > getAbsoluteCalendarDay(state.tick))) state.spotlightLoreLastDay = undefined;

  const s = state.spotlightLore;
  if (!s) {
    state.spotlightLore = null;
    return;
  }
  const finite = (n: number) => typeof n === 'number' && Number.isFinite(n);
  const idsValid = Array.isArray(s.performerIds) && s.performerIds.length >= SPOTLIGHT_MIN_CHORUS &&
    s.performerIds.length <= SPOTLIGHT_MAX_CHORUS &&
    s.performerIds.every((id) => Number.isSafeInteger(id) && id > 0) &&
    new Set(s.performerIds).size === s.performerIds.length;
  const valid = typeof s.id === 'string' && s.id.length > 0 && s.id.length <= 60 &&
    (s.phase === 'gathering' || s.phase === 'ready') &&
    Number.isSafeInteger(s.heroineId) && s.heroineId > 0 &&
    Number.isSafeInteger(s.startedAtTick) && s.startedAtTick >= 0 && s.startedAtTick <= state.tick &&
    finite(s.gatherX) && finite(s.gatherY) &&
    s.gatherX >= 0 && s.gatherX <= state.width &&
    s.gatherY >= 0 && s.gatherY <= state.height && idsValid && !s.performerIds.includes(s.heroineId) &&
    Array.isArray(s.slots) && s.slots.length === s.performerIds.length &&
    s.slots.every((v) => v && Number.isSafeInteger(v.humanId) &&
      s.performerIds.includes(v.humanId) && finite(v.x) && finite(v.y) &&
      v.x >= 0 && v.x <= state.width && v.y >= 0 && v.y <= state.height) &&
    new Set(s.slots.map((v) => v.humanId)).size === s.slots.length &&
    (s.phase !== 'ready' || (Number.isSafeInteger(s.readyAtTick) &&
      s.readyAtTick! >= s.startedAtTick && s.readyAtTick! <= state.tick));
  if (!valid) {
    state.spotlightLore = null;
    return;
  }
  const participants = new Set([s.heroineId, ...s.performerIds]);
  const actors = new Map(state.entities.filter((entity) => participants.has(entity.id)).map((entity) => [entity.id, entity]));
  const heroine = actors.get(s.heroineId);
  if (!heroine || !eligibleGirl(heroine) || s.performerIds.some((id) => {
    const actor = actors.get(id);
    return !actor || !eligibleChorus(actor);
  }) || (s.phase === 'ready' && (
    // A save must not resume a ready performance with a dispersed cast.
    !(Math.hypot(heroine.x - s.gatherX, heroine.y - s.gatherY) <= SPOTLIGHT_ARRIVAL_DISTANCE) ||
    s.slots.some((slot) => {
      const actor = actors.get(slot.humanId);
      return !actor || !(Math.hypot(actor.x - slot.x, actor.y - slot.y) <= SPOTLIGHT_ARRIVAL_DISTANCE);
    })
  ))) state.spotlightLore = null;
}
