import { describe, expect, it } from 'vitest';
import { createEntity } from '../src/game/entityFactory';
import { EntityType, type Entity, type SpotlightLoreState } from '../src/game/gameTypes';
import { getAbsoluteCalendarDay, getCalendarDay, isWeekend, TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/game/dayCycleClock';
import { personDayRoll } from '../src/game/humanSchedule';
import { initGame } from '../src/game/worldGen';
import {
  finishSpotlightLore, getSpotlightGatherTarget, maybeStartSpotlightLore,
  normalizeSpotlightLoreOnLoad, tickSpotlightGathering,
} from '../src/game/spotlightLore';
import { extractSimPrep, applySimPrep } from '../src/game/simWorker/simPrep';
import { createFallbackSimTickDelta, applySimTickDelta } from '../src/game/simBuffers/simDelta';
import { buildSaveData, loadGameFromParsedOutcome } from '../src/game/saveLoad';
import { createInitialView } from '../src/game/viewState';

function makeFixture() {
  const world = initGame({ seed: 63231, size: 'small' });
  const anchor = world.worldMap?.campSite ?? { x: world.width / 2, y: world.height / 2 };
  const x = anchor.x;
  const y = anchor.y;
  const girl = createEntity(EntityType.Human, x, y, 100001, undefined, true, {
    name: 'Ada', gender: 'female', ageYears: 14,
  });
  const adults = Array.from({ length: 8 }, (_, i) => createEntity(
    EntityType.Human, x + (i - 4) * 4, y + 14, 100002 + i, undefined, false,
    { name: `Villager${i}`, gender: 'male', ageYears: 28 },
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

describe('spotlight lore — saved state and worker mirrors', () => {
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
