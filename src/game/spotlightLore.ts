import type { Entity, SpotlightLoreState, WorldState } from './gameTypes';
import { BuildingType, EntityType } from './gameTypes';
import { getAbsoluteCalendarDay, getHourOfDay, isStartOfClockHour, isWeekend } from './dayCycleClock';
import { personDayRoll } from './simRng';
import { isPlayerHuman } from './playerHuman';
import { nearestWalkableWorldPoint } from './pathfinding';
import { getBuildingCenter } from './buildingGeometry';
import { logEvent } from './eventLog';
import { getSettlerWorkReason } from './workAbsence';

const SPOTLIGHT_COOLDOWN_DAYS = 90;
const SPOTLIGHT_GATHER_TIMEOUT_TICKS = 65;
const SPOTLIGHT_READY_TIMEOUT_TICKS = 150;
const SPOTLIGHT_ARRIVAL_DISTANCE = 11;
const SPOTLIGHT_MIN_CHORUS = 6;
const SPOTLIGHT_MAX_CHORUS = 10;
/** A settler sprite is ~14 px wide and ~20 px tall; 55 px keeps the ring on the plaza stones and clear of silos. */
const SPOTLIGHT_RING_RADIUS_PX = 55;
const SPOTLIGHT_MIN_SLOT_GAP_PX = 18;

function availableSpotlightActor(entity: Entity): boolean {
  return entity.alive && entity.type === EntityType.Human && isPlayerHuman(entity) &&
    !entity.prisonBuildingId && !entity.raidDeploymentId && !entity.indoorBuildingId &&
    !entity.departedAlive && !entity.warCaptive && !entity.huntTargetId;
}

function eligibleGirl(entity: Entity): boolean {
  return availableSpotlightActor(entity) && entity.gender === 'female' && entity.isJuvenile &&
    entity.age >= 12 && entity.age < 18;
}

function eligibleChorus(entity: Entity): boolean {
  return availableSpotlightActor(entity) && entity.gender === 'male' && !entity.isJuvenile &&
    entity.age >= 18;
}

function buildSpotlightLoreScene(
  state: WorldState,
  girl: Entity,
  chorus: readonly Entity[],
  id: string,
  origin: { x: number; y: number } = { x: girl.x, y: girl.y },
): SpotlightLoreState | null {
  if (!state.worldMap) return null;
  const slots: SpotlightLoreState['slots'] = [];

  const step = (Math.PI * 2) / Math.max(1, chorus.length);
  const startAngle = Math.PI / 2 + step / 2;

  const ringX = Math.min(
    Math.max(origin.x, SPOTLIGHT_RING_RADIUS_PX), state.width - SPOTLIGHT_RING_RADIUS_PX,
  );
  const ringY = Math.min(
    Math.max(origin.y, SPOTLIGHT_RING_RADIUS_PX), state.height - SPOTLIGHT_RING_RADIUS_PX,
  );

  for (let i = 0; i < chorus.length; i++) {
    const angle = startAngle + i * step;
    const candidateX = ringX + Math.cos(angle) * SPOTLIGHT_RING_RADIUS_PX;
    const candidateY = ringY + Math.sin(angle) * SPOTLIGHT_RING_RADIUS_PX;
    const point = nearestWalkableWorldPoint(
      state.worldMap, state.buildings, candidateX, candidateY,
    );
    if (!point || point.x < 0 || point.x >= state.width || point.y < 0 || point.y >= state.height
      || slots.some((slot) => Math.hypot(slot.x - point.x, slot.y - point.y) < SPOTLIGHT_MIN_SLOT_GAP_PX)) {
      return null;
    }
    slots.push({ humanId: chorus[i].id, x: point.x, y: point.y });
  }

  return {
    id,
    heroineId: girl.id,
    performerIds: chorus.map((h) => h.id),
    phase: 'gathering',
    startedAtTick: state.tick,
    gatherX: ringX,
    gatherY: ringY,
    slots,
  };
}

function stageSpotlightLoreCast(
  state: WorldState, scene: SpotlightLoreState, girl: Entity, chorus: readonly Entity[],
): void {
  for (const actor of [girl, ...chorus]) {
    actor.indoorBuildingId = undefined;
    actor.huntTargetId = undefined;
    actor.vx = 0;
    actor.vy = 0;
  }
  girl.x = scene.gatherX;
  girl.y = scene.gatherY;

  for (const slot of scene.slots) {
    const actor = chorus.find((man) => man.id === slot.humanId);
    if (actor) {
      actor.x = slot.x;
      actor.y = slot.y;
      // Laat de zangers naar het centrum (het meisje) kijken:

    }
  }
  scene.phase = 'ready';
  scene.readyAtTick = state.tick;
}

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
  const chorus = state.entities.filter((human) => {
    if (!eligibleChorus(human)) return false;
    if (Math.hypot(human.x - girl.x, human.y - girl.y) > 100) return false;
    const work = getSettlerWorkReason(state, human).code;
    return work !== 'working' && work !== 'walking-to-work';
  }).sort((a, b) => {
    const da = (a.x - girl.x) ** 2 + (a.y - girl.y) ** 2;
    const db = (b.x - girl.x) ** 2 + (b.y - girl.y) ** 2;
    return da - db || a.id - b.id;
  }).slice(0, SPOTLIGHT_MAX_CHORUS);
  if (chorus.length < SPOTLIGHT_MIN_CHORUS) return false;

  const square = state.buildings.find((b) =>
    b.type === BuildingType.Square && b.completed && b.faction !== 'rival');
  const squareCenter = square ? getBuildingCenter(square) : null;

  const squareOrigin = squareCenter
    ? nearestWalkableWorldPoint(state.worldMap, state.buildings, squareCenter.x, squareCenter.y)
    : null;

  const scene = square
    ? squareOrigin && buildSpotlightLoreScene(state, girl, chorus, `${day}:${girl.id}`, squareOrigin)
    : buildSpotlightLoreScene(state, girl, chorus, `${day}:${girl.id}`);
  if (!scene) return false;
  if (square) stageSpotlightLoreCast(state, scene, girl, chorus);
  state.spotlightLore = scene;
  state.spotlightLoreLastDay = day;
  logEvent(state, 'event', square
    ? `A curious cast appeared at the Village Square around ${girl.name ?? 'a young villager'}.`
    : `A curious crowd began gathering around ${girl.name ?? 'a young villager'} for an impromptu performance.`, girl.name);
  return true;
}

export function startSpotlightLoreDebug(state: WorldState): boolean {
  const map = state.worldMap;
  if (state.spotlightLore || !map) return false;
  const girl = state.entities.filter((entity) =>
    entity.alive && entity.type === EntityType.Human && isPlayerHuman(entity) &&
    entity.gender === 'female' && entity.isJuvenile &&
    entity.age >= 12 && entity.age < 18 &&
    !entity.prisonBuildingId && !entity.raidDeploymentId &&
    !entity.warCaptive && !entity.departedAlive
  ).sort((a, b) => a.id - b.id)[0];
  const men = state.entities.filter((entity) =>
    entity.alive && entity.type === EntityType.Human && isPlayerHuman(entity) &&
    entity.gender === 'male' && !entity.isJuvenile && entity.age >= 18 &&
    !entity.prisonBuildingId && !entity.raidDeploymentId &&
    !entity.warCaptive && !entity.departedAlive
  );
  if (!girl || men.length < SPOTLIGHT_MIN_CHORUS) {
    logEvent(state, 'event', 'Spotlight preview needs a 12–17 girl and six adult men.');
    return false;
  }

  const camp = map.campSite ?? { x: state.width / 2, y: state.height / 2 };
  const square = state.buildings.find((b) =>
    b.type === BuildingType.Square && b.completed && b.faction !== 'rival');
  const squareCenter = square ? getBuildingCenter(square) : null;

  const candidates = [
    ...(squareCenter ? [squareCenter] : []),
    { x: girl.x, y: girl.y },
    { x: camp.x, y: camp.y },
    { x: state.width / 2, y: state.height / 2 },
  ];
  for (let gx = 1; gx <= 4; gx++) {
    for (let gy = 1; gy <= 4; gy++) {
      candidates.push({ x: state.width * gx / 5, y: state.height * gy / 5 });
    }
  }
  const tried = new Set<string>();
  for (const candidate of candidates) {
    const key = `${Math.round(candidate.x)}:${Math.round(candidate.y)}`;
    if (tried.has(key)) continue;
    tried.add(key);
    const origin = nearestWalkableWorldPoint(map, state.buildings, candidate.x, candidate.y);
    if (!origin) continue;
    const chorus = men
      .map((man) => ({ man, distance: Math.hypot(man.x - origin.x, man.y - origin.y) }))
      .sort((a, b) => a.distance - b.distance || a.man.id - b.man.id)
      .slice(0, SPOTLIGHT_MAX_CHORUS)
      .map((entry) => entry.man);
    if (chorus.length < SPOTLIGHT_MIN_CHORUS) continue;
    const scene = buildSpotlightLoreScene(
      state, girl, chorus, `demo:${state.tick}:${girl.id}`, origin,
    );
    if (!scene) continue;

    stageSpotlightLoreCast(state, scene, girl, chorus);
    state.spotlightLore = scene;
    state.paused = true;
    logEvent(state, 'event', `A stage-ready Spotlight cast of ${scene.performerIds.length} villagers awaits.`, girl.name);
    return true;
  }

  logEvent(state, 'event', 'Spotlight preview found no clear stage space; try again after the village changes.');
  return false;
}

export function getSpotlightGatherTarget(scene: SpotlightLoreState, humanId: number): { x: number; y: number } | null {
  if (scene.heroineId === humanId) return { x: scene.gatherX, y: scene.gatherY };
  return scene.slots.find((slot) => slot.humanId === humanId) ?? null;
}

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
    !(Math.hypot(heroine.x - s.gatherX, heroine.y - s.gatherY) <= SPOTLIGHT_ARRIVAL_DISTANCE) ||
    s.slots.some((slot) => {
      const actor = actors.get(slot.humanId);
      return !actor || !(Math.hypot(actor.x - slot.x, actor.y - slot.y) <= SPOTLIGHT_ARRIVAL_DISTANCE);
    })
  ))) state.spotlightLore = null;
}