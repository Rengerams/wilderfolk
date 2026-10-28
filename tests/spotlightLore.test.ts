import { describe, expect, it } from 'vitest';
import { createEntity } from '../src/game/entityFactory';
import { BuildingType, EntityType, PATH_CELL, TerrainType, type Building, type Entity, type SpotlightLoreState } from '../src/game/gameTypes';
import { getAbsoluteCalendarDay, getCalendarDay, isWeekend, TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/game/dayCycleClock';
import { personDayRoll, prefersHomeTonightFor } from '../src/game/humanSchedule';
import { getWorkSchedule } from '../src/game/workSchedule';
import { gameTick } from '../src/game/gameTick';
import { getPathGrid, lineCrossesBlocked } from '../src/game/pathfinding';
import { rebuildEntityByIdMap } from '../src/game/entityIndex';
import { canPursueSecretAffair, hasAffairPartner } from '../src/game/simulation/humanRelationships';
import { invalidateCachedEntityByType } from '../src/game/entityTypeCache';
import { createBuilding, initGame } from '../src/game/worldGen';
import { testWorldMap } from '../src/test/worldMapFixtures';
import {
  finishSpotlightLore, getSpotlightGatherTarget, maybeStartSpotlightLore,
  normalizeSpotlightLoreOnLoad, tickSpotlightGathering,
} from '../src/game/spotlightLore';
import { applyWorkerCommand } from '../src/game/simWorker/commands';
import { extractSimPrep, applySimPrep } from '../src/game/simWorker/simPrep';
import { createFallbackSimTickDelta, applySimTickDelta } from '../src/game/simBuffers/simDelta';
import { buildSaveData, loadGameFromParsedOutcome } from '../src/game/saveLoad';
import { createInitialView } from '../src/game/viewState';

function makeFixture() {
  const world = initGame({ seed: 63231, size: 'medium', width: 960, height: 720 });
  const anchor = world.worldMap?.campSite ?? { x: world.width / 2, y: world.height / 2 };
  const x = anchor.x;
  const y = anchor.y;
  const girl = createEntity(EntityType.Human, x, y, 100001, undefined, true, {
    name: 'Ada', gender: 'female', ageYears: 14, colonyDay: 120,
  });
  const adults = Array.from({ length: 8 }, (_, i) => createEntity(
    EntityType.Human, x + (i - 4) * 4, y + 14, 100002 + i, undefined, false,
    { name: `Villager${i}`, gender: 'male', ageYears: 28, colonyDay: 120 },
  ));
  world.entities = [girl, ...adults];
  world.spotlightLore = null;
  world.spotlightLoreLastDay = undefined;
  return { world, girl, adults };
}

function pickEligibleTick(world: ReturnType<typeof makeFixture>['world']): number {
  const salt = world.nextEntityId + world.width * 37 + world.height * 19;
  for (let day = 90; day < 900; day++) {
    const tick = day * TICKS_PER_DAY + 16 * TICKS_PER_HOUR;
    if (isWeekend(tick) && personDayRoll(salt, tick, 3919) < 0.075) return tick;
  }
  throw new Error('Expected at least one rare daytime opportunity in seeded days 90–900');
}

function readyScene(world: ReturnType<typeof makeFixture>['world'], girl: Entity, adults: Entity[]): SpotlightLoreState {
  const slots = adults.slice(0, 6).map((adult, index) => ({
    humanId: adult.id, x: girl.x + index * 6, y: girl.y + 20,
  }));
  // A ready fixture must be physically ready, not just carry the phase label.
  // Otherwise it hides attendance bugs and makes save-normalization tests unrealistic.
  slots.forEach((slot, index) => {
    adults[index].x = slot.x;
    adults[index].y = slot.y;
  });
  return {
    id: `spotlight:${girl.id}`, heroineId: girl.id, performerIds: adults.slice(0, 6).map((h) => h.id),
    phase: 'ready', startedAtTick: world.tick - 3, readyAtTick: world.tick,
    gatherX: girl.x, gatherY: girl.y, slots,
  };
}

describe('rare spotlight lore — deterministic rule and participant boundaries', () => {
  it('rejects missing population and starts only once on an eligible rare weekend afternoon', () => {
    const { world, girl, adults } = makeFixture();
    const tick = pickEligibleTick(world);
    world.tick = tick;
    world.dayInYear = getCalendarDay(tick);
    expect(getAbsoluteCalendarDay(tick)).toBeGreaterThan(0);
    expect(maybeStartSpotlightLore(world)).toBe(true);
    const scene = world.spotlightLore;
    expect(scene).not.toBeNull();
    expect(scene?.heroineId).toBe(girl.id);
    expect(scene?.performerIds).toHaveLength(adults.length);
    expect(new Set(scene?.performerIds).size).toBe(adults.length);
    expect(scene?.slots).toHaveLength(adults.length);
    for (let i = 0; i < scene!.slots.length; i++) {
      for (let j = i + 1; j < scene!.slots.length; j++) {
        expect(Math.hypot(scene!.slots[i].x - scene!.slots[j].x, scene!.slots[i].y - scene!.slots[j].y)).toBeGreaterThanOrEqual(12);
      }
    }
    expect(maybeStartSpotlightLore(world)).toBe(false);
    expect(getSpotlightGatherTarget(scene!, adults[0].id)).toBeTruthy();
    expect(getSpotlightGatherTarget(scene!, -999)).toBeNull();
    const previousDay = world.spotlightLoreLastDay;
    finishSpotlightLore(world, scene!.id, 'skipped');
    expect(world.spotlightLore).toBeNull();
    expect(world.spotlightLoreLastDay).toBe(previousDay);
    expect(maybeStartSpotlightLore(world)).toBe(false);
  });

  it('will not select an adult heroine, fewer than six chorus members, or a colony in combat', () => {
    const { world, girl, adults } = makeFixture();
    world.tick = pickEligibleTick(world);
    girl.age = 18;
    girl.isJuvenile = false;
    expect(maybeStartSpotlightLore(world)).toBe(false);
    girl.age = 14;
    girl.isJuvenile = true;
    for (const human of adults.slice(0, 3)) human.prisonBuildingId = 3;
    expect(maybeStartSpotlightLore(world)).toBe(false);
    for (const human of adults.slice(0, 3)) human.prisonBuildingId = undefined;
    world.electionCeremony = { phase: 'gathering' } as typeof world.electionCeremony;
    expect(maybeStartSpotlightLore(world)).toBe(false);
  });

  it('waits for every selected chorus member, not only the minimum six', () => {
    const { world, girl, adults } = makeFixture();
    world.tick = TICKS_PER_DAY * 120;
    const slots = adults.map((h, i) => ({ humanId: h.id, x: girl.x + 14 * i, y: girl.y + 45 }));
    world.spotlightLore = {
      id: 'all-chorus-arrive', heroineId: girl.id,
      performerIds: adults.map((h) => h.id),
      phase: 'gathering', startedAtTick: world.tick,
      gatherX: girl.x, gatherY: girl.y, slots,
    };
    for (let i = 0; i < 6; i++) {
      adults[i].x = slots[i].x;
      adults[i].y = slots[i].y;
    }
    const index = new Map(world.entities.map((h) => [h.id, h]));
    tickSpotlightGathering(world, index);
    expect(world.spotlightLore?.phase).toBe('gathering');
    for (let i = 6; i < adults.length; i++) {
      adults[i].x = slots[i].x;
      adults[i].y = slots[i].y;
    }
    tickSpotlightGathering(world, index);
    expect(world.spotlightLore?.phase).toBe('ready');
  });

  it('waits for the heroine to return to the stage before starting', () => {
    const { world, girl, adults } = makeFixture();
    world.tick = TICKS_PER_DAY * 120;
    const scene = readyScene(world, girl, adults);
    scene.phase = 'gathering';
    world.spotlightLore = scene;
    for (const slot of scene.slots) {
      const actor = adults.find((human) => human.id === slot.humanId)!;
      actor.x = slot.x;
      actor.y = slot.y;
    }
    girl.x += 50;
    const index = new Map(world.entities.map((human) => [human.id, human]));
    tickSpotlightGathering(world, index);
    expect(world.spotlightLore?.phase).toBe('gathering');
    girl.x = scene.gatherX;
    tickSpotlightGathering(world, index);
    expect(world.spotlightLore?.phase).toBe('ready');
  });

  it('aborts a ready performance when a singer dies or a festival starts', () => {
    const { world, girl, adults } = makeFixture();
    world.tick = TICKS_PER_DAY * 120;
    const index = new Map(world.entities.map((human) => [human.id, human]));
    world.spotlightLore = readyScene(world, girl, adults);
    adults[0].alive = false;
    tickSpotlightGathering(world, index);
    expect(world.spotlightLore).toBeNull();
    adults[0].alive = true;
    world.spotlightLore = readyScene(world, girl, adults);
    world.festival = { ...world.festival, active: true } as NonNullable<typeof world.festival>;
    tickSpotlightGathering(world, index);
    expect(world.spotlightLore).toBeNull();
  });

  it('aborts a ready performance if a singer or heroine moves away before the pause handoff', () => {
    const { world, girl, adults } = makeFixture();
    world.tick = TICKS_PER_DAY * 120;
    const index = new Map(world.entities.map((human) => [human.id, human]));
    const resourcesBefore = structuredClone(world.resources);
    const eventsBefore = world.eventLog.length;

    world.spotlightLore = readyScene(world, girl, adults);
    adults[0].x += 30;
    tickSpotlightGathering(world, index);
    expect(world.spotlightLore).toBeNull();

    world.spotlightLore = readyScene(world, girl, adults);
    girl.x += 30;
    tickSpotlightGathering(world, index);
    expect(world.spotlightLore).toBeNull();
    expect(world.resources).toEqual(resourcesBefore);
    expect(world.eventLog).toHaveLength(eventsBefore);
  });

  it('idempotently completes once and abandons missing/dead actors without rewards', () => {
    const { world, girl, adults } = makeFixture();
    world.tick = 72 * 200;
    const scene = readyScene(world, girl, adults);
    world.spotlightLore = scene;
    const startResources = structuredClone(world.resources);
    const before = world.eventLog.length;
    expect(finishSpotlightLore(world, scene.id, 'complete')).toBe(true);
    expect(finishSpotlightLore(world, scene.id, 'complete')).toBe(false);
    expect(world.eventLog.length).toBe(before + 1);
    expect(world.resources).toEqual(startResources);
    world.spotlightLore = { ...scene, phase: 'gathering' };
    girl.alive = false;
    tickSpotlightGathering(world, new Map(world.entities.map((h) => [h.id, h])));
    expect(world.spotlightLore).toBeNull();
  });
});

describe('spotlight lore — ordinary human movement must not steal actors', () => {
  it.each(['gathering', 'ready'] as const)('keeps a %s actor walking toward the spotlight, not their house', (phase) => {
    // Run the real game tick. A saved scene is explicitly active; no rare roll is needed.
    const world = initGame({ seed: 63231, size: 'medium', width: 960, height: 720, skipTerrain: true });
    const girl = createEntity(EntityType.Human, 480, 350, 100001, undefined, true, {
      name: 'Ada', gender: 'female', ageYears: 14, colonyDay: 96,
    });
    const adults = Array.from({ length: 8 }, (_, i) => createEntity(
      EntityType.Human, 500 + i * 2, 364, 100002 + i, undefined, false,
      { name: `Audience${i}`, ageYears: 28, colonyDay: 96 },
    ));
    world.entities = [girl, ...adults];
    // initGame already populated its tick-persistent ID/type caches with the
    // founder and wildlife entities. Replacing its entire population in a test
    // must also rebuild the authoritative lookup, otherwise the real tick
    // treats the new heroine as missing and aborts this otherwise valid scene.
    rebuildEntityByIdMap(world);
    invalidateCachedEntityByType(world);
    // 16:00 on a weekend; find a deterministic actor who prefers home.
    let member: Entity | undefined;
    for (let day = 96; day < 160; day++) {
      const currentTick = day * TICKS_PER_DAY + 16 * TICKS_PER_HOUR;
      if (!isWeekend(currentTick)) continue;
      member = adults.find((adult) => prefersHomeTonightFor(getWorkSchedule(world), adult.id, currentTick, 16));
      if (member) {
        world.tick = currentTick - 1;
        world.dayInYear = getCalendarDay(currentTick);
        // This is an afternoon snapshot, not the first tick after founding;
        // do not also run unrelated daily ageing/relationship transitions.
        world.lastProcessedCalendarDay = getAbsoluteCalendarDay(currentTick);
        break;
      }
    }
    expect(member, 'at least one weekend settler should prefer home').toBeDefined();
    const actor = member!;
    const home: Building = {
      id: 901, type: BuildingType.House,
      x: 720, y: 340, width: 48, height: 42, occupants: [actor.id],
      level: 1, constructionProgress: 100, completed: true,
      health: 100, maxHealth: 100, spriteScale: 1, buildAnimTimer: 0,
    };
    world.buildings = [home];
    actor.residenceBuildingId = home.id;
    // Home is far to the right; the spotlight slot is to the left.
    const beforeX = actor.x;
    // A ready scene has already gathered: every actor must actually be on stage.
    // Keep this actor 10 units from its slot (inside the 11-unit ready tolerance,
    // but outside the 9-unit steering stop), so a home-commute override is observable.
    const slots = adults.map((person, i) => {
      const isActor = person.id === actor.id;
      return {
        humanId: person.id,
        x: phase === 'ready' ? person.x - (isActor ? 10 : 0) : (isActor ? 425 : 430 + i * 8),
        y: phase === 'ready' ? person.y : 360,
      };
    });
    world.spotlightLore = {
      id: 'test-commute-priority', heroineId: girl.id,
      performerIds: adults.map((person) => person.id),
      phase, startedAtTick: world.tick, readyAtTick: phase === 'ready' ? world.tick : undefined,
      gatherX: girl.x, gatherY: girl.y, slots,
    };
    gameTick(world);
    expect(world.spotlightLore?.phase).toBe(phase);
    expect(actor.x).toBeLessThan(beforeX);
    expect(actor.indoorBuildingId).toBeUndefined();
  });
});

describe('spotlight lore — established affairs must not steal movement', () => {
  it('keeps a valid established-affair participant walking to the spotlight rather than the distant tryst', () => {
    const world = initGame({ seed: 63231, size: 'medium', width: 960, height: 720, skipTerrain: true });
    const day = 96;
    const at16 = day * TICKS_PER_DAY + 16 * TICKS_PER_HOUR;
    expect(isWeekend(at16)).toBe(true);
    const girl = createEntity(EntityType.Human, 480, 350, 110001, undefined, true, {
      name: 'Ada', gender: 'female', ageYears: 14, colonyDay: day,
    });
    const audience = Array.from({ length: 8 }, (_, i) => createEntity(
      EntityType.Human, 500 + i * 2, 364, 110002 + i, undefined, false,
      { name: `Singer${i}`, gender: 'male', ageYears: 28, colonyDay: day },
    ));
    const lover = createEntity(EntityType.Human, 720, 350, 110020, undefined, false, {
      name: 'Lover', gender: 'female', ageYears: 28, colonyDay: day,
    });
    const actor = audience[0];
    actor.affairPartnerId = lover.id;
    lover.affairPartnerId = actor.id;
    world.entities = [girl, ...audience, lover];
    rebuildEntityByIdMap(world);
    invalidateCachedEntityByType(world);
    world.buildings = [];
    world.tick = at16 - 1;
    world.dayInYear = getCalendarDay(at16);
    world.lastProcessedCalendarDay = getAbsoluteCalendarDay(at16);
    world.spotlightLore = {
      id: 'established-affair-steering', heroineId: girl.id,
      performerIds: audience.map((person) => person.id),
      phase: 'gathering', startedAtTick: world.tick,
      gatherX: girl.x, gatherY: girl.y,
      slots: audience.map((person, i) => ({
        humanId: person.id, x: person.id === actor.id ? 425 : 435 + 8 * i, y: 360,
      })),
    };
    expect(hasAffairPartner(actor, world.entityById!)).toBe(true);
    expect(canPursueSecretAffair(actor, 16, undefined, world.buildings, world.entityById!, at16, getWorkSchedule(world))).toBe(true);
    const before = actor.x;
    gameTick(world);
    expect(world.spotlightLore?.phase).toBe('gathering');
    expect(actor.x, 'ordinary tryst would steer right; spotlight must steer left').toBeLessThan(before);
    expect(actor.indoorBuildingId).toBeUndefined();
  });
});

describe('spotlight lore — actors navigate real obstacles', () => {
  it.each(['wall', 'water'] as const)('routes a stage participant around a completed %s obstacle', (kind) => {
    const world = initGame({ seed: 63231, size: 'medium', width: 960, height: 720, skipTerrain: true });
    const day = 96;
    const at16 = day * TICKS_PER_DAY + 16 * TICKS_PER_HOUR;
    world.worldMap = testWorldMap({
      tilesX: 96, tilesY: 72, seed: 8033,
      tileType: (x, y) => kind === 'water' && x === 50 && y === 35 ? TerrainType.River : undefined,
    });
    const wall = createBuilding(BuildingType.Wall, 505, 355, 901);
    Object.assign(wall, { width: PATH_CELL, height: PATH_CELL, completed: true, constructionProgress: 100 });
    world.buildings = kind === 'wall' ? [wall] : [];

    const girl = createEntity(EntityType.Human, 445, 355, 120001, undefined, true, {
      name: 'Ada', gender: 'female', ageYears: 14, colonyDay: day,
    });
    const audience = Array.from({ length: 8 }, (_, i) => createEntity(
      EntityType.Human, i === 0 ? 485 : 425 + i * 6, i === 0 ? 355 : 385,
      120002 + i, undefined, false,
      { name: `Singer${i}`, gender: 'male', ageYears: 28, colonyDay: day },
    ));
    const actor = audience[0];
    world.entities = [girl, ...audience];
    rebuildEntityByIdMap(world);
    invalidateCachedEntityByType(world);
    world.tick = at16 - 1;
    world.dayInYear = getCalendarDay(at16);
    world.lastProcessedCalendarDay = getAbsoluteCalendarDay(at16);
    world.spotlightLore = {
      id: `obstacle-${kind}`, heroineId: girl.id, performerIds: audience.map((h) => h.id),
      phase: 'gathering', startedAtTick: world.tick, gatherX: girl.x, gatherY: girl.y,
      slots: audience.map((h) => ({ humanId: h.id, x: h.id === actor.id ? 525 : h.x, y: h.y })),
    };

    const grid = getPathGrid(world.worldMap, world.buildings);
    expect(grid.blocked[35 * grid.cols + 50]).toBe(1);
    expect(lineCrossesBlocked(grid, actor.x, actor.y, 525, 355)).toBe(true);

    // A straight-only actor hits the obstacle; the shared route owner must detour and arrive.
    for (let step = 0; step < 40 && world.spotlightLore?.phase === 'gathering'; step++) {
      const before = { x: actor.x, y: actor.y };
      gameTick(world);
      const tileX = Math.floor(actor.x / PATH_CELL);
      const tileY = Math.floor(actor.y / PATH_CELL);
      expect(grid.blocked[tileY * grid.cols + tileX], 'stage walking must never enter blocked ground').toBe(0);
      expect(Math.hypot(actor.x - before.x, actor.y - before.y), 'only one normal walk step per tick').toBeLessThanOrEqual(9.6 + 0.001);
    }
    expect(world.spotlightLore?.phase).toBe('ready');
    expect(Math.hypot(actor.x - 525, actor.y - 355)).toBeLessThanOrEqual(11);
  });
});

describe('spotlight lore — saved state and worker mirrors', () => {
  it('finishes a paused ready scene through the typed worker command exactly once', () => {
    const { world, girl, adults } = makeFixture();
    world.tick = TICKS_PER_DAY * 120;
    world.spotlightLore = readyScene(world, girl, adults);
    world.paused = true;
    const sceneId = world.spotlightLore.id;
    const eventCount = world.eventLog.length;
    const resourceBefore = structuredClone(world.resources);

    expect(applyWorkerCommand(world, { proto: 1, op: 'finishSpotlightLore', sceneId: 'previous-scene', reason: 'complete' }).spotlightLore?.id).toBe(sceneId);
    expect(world.eventLog).toHaveLength(eventCount);
    applyWorkerCommand(world, { proto: 1, op: 'finishSpotlightLore', sceneId, reason: 'complete' });
    expect(world.spotlightLore).toBeNull();
    expect(world.eventLog).toHaveLength(eventCount + 1);
    applyWorkerCommand(world, { proto: 1, op: 'finishSpotlightLore', sceneId, reason: 'complete' });
    expect(world.eventLog).toHaveLength(eventCount + 1);
    expect(world.paused).toBe(true); // React owns restoration, not the worker command.
    expect(world.resources).toEqual(resourceBefore);
  });

  it('preserves compact active state in a worker delta, without sharing mutable slots', () => {
    const { world, girl, adults } = makeFixture();
    world.tick = TICKS_PER_DAY * 120;
    world.spotlightLore = readyScene(world, girl, adults);
    world.spotlightLoreLastDay = 119;
    const delta = createFallbackSimTickDelta(world);
    expect(delta.spotlightLore).toEqual(world.spotlightLore);
    const clone = structuredClone(world);
    clone.spotlightLore = null;
    applySimTickDelta(clone, delta);
    expect(clone.spotlightLore).toEqual(world.spotlightLore);
    const original = world.spotlightLore!.slots[0].x;
    clone.spotlightLore!.slots[0].x += 200;
    expect(world.spotlightLore!.slots[0].x).toBe(original);
  });

  it('restores nested scene state on rollback after an in-place mutation', () => {
    const { world, girl, adults } = makeFixture();
    world.tick = TICKS_PER_DAY * 120;
    world.spotlightLore = readyScene(world, girl, adults);
    const prior = structuredClone(world.spotlightLore);
    const snapshot = extractSimPrep(world);
    world.spotlightLore!.slots[0].x = -123456;
    world.spotlightLore!.performerIds.pop();
    applySimPrep(world, snapshot);
    expect(world.spotlightLore).toEqual(prior);
  });

  it('rejects saved scenes with missing, dead or overlapping participants before presentation', () => {
    const { world, girl, adults } = makeFixture();
    world.tick = TICKS_PER_DAY * 120;
    const scene = readyScene(world, girl, adults);
    for (const heroineId of [999999, adults[0].id]) {
      world.spotlightLore = { ...scene, heroineId };
      normalizeSpotlightLoreOnLoad(world);
      expect(world.spotlightLore).toBeNull();
    }
    adults[0].alive = false;
    world.spotlightLore = structuredClone(scene);
    normalizeSpotlightLoreOnLoad(world);
    expect(world.spotlightLore).toBeNull();
  });

  it('rejects a saved ready scene with a dispersed cast but preserves gathering state', () => {
    const { world, girl, adults } = makeFixture();
    world.tick = TICKS_PER_DAY * 120;

    const ready = readyScene(world, girl, adults);
    adults[0].x += 30;
    world.spotlightLore = ready;
    normalizeSpotlightLoreOnLoad(world);
    expect(world.spotlightLore).toBeNull();

    readyScene(world, girl, adults);
    girl.y += 30;
    world.spotlightLore = ready;
    normalizeSpotlightLoreOnLoad(world);
    expect(world.spotlightLore).toBeNull();

    girl.y -= 30;
    const gathering = readyScene(world, girl, adults);
    gathering.phase = 'gathering';
    gathering.readyAtTick = undefined;
    adults[0].x += 30;
    world.spotlightLore = gathering;
    normalizeSpotlightLoreOnLoad(world);
    expect(world.spotlightLore).toEqual(gathering);
  });

  it('normalizes missing and corrupt data safely; roundtrips a valid active scene', () => {
    const { world, girl, adults } = makeFixture();
    world.tick = TICKS_PER_DAY * 120;
    expect(world.spotlightLore).toBeNull();
    normalizeSpotlightLoreOnLoad(world);
    expect(world.spotlightLore).toBeNull();
    world.spotlightLore = readyScene(world, girl, adults);
    world.spotlightLoreLastDay = 118;
    const payload = buildSaveData(world, createInitialView(world.width, world.height));
    const outcome = loadGameFromParsedOutcome(payload);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.world.spotlightLore).toEqual(world.spotlightLore);
    expect(outcome.world.spotlightLoreLastDay).toBe(118);

    world.spotlightLore = { ...readyScene(world, girl, adults), slots: [{ humanId: 0, x: Number.NaN, y: 1 }] };
    normalizeSpotlightLoreOnLoad(world);
    expect(world.spotlightLore).toBeNull();
  });
});
