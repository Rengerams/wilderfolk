import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { MapSize } from '../src/game/gameTypes';
import { extractSimTickDelta, applySimTickDelta } from '../src/game/simBuffers/simDelta';
import {
  bumpHistoryRevision,
  resetHistoryRevisions,
  snapshotHistoryRevisions,
} from '../src/game/historyRevisions';

describe('sim delta story/campaign transport (audit CRITICAL)', () => {
  it('round-trips storyFlags, pendingStoryEvents, and guidedCampaign', () => {
    const world = initGame({ size: MapSize.Medium, seed: 123 });
    world.storyFlags = { deer_parliament_resolved: 100, animal_care_status: 2 };
    world.pendingStoryEvents = [{
      id: 'deer_parliament_100',
      emoji: '🦌',
      storyKey: 'deer_parliament',
      title: 'Deer Parliament',
      description: 'Test',
      choices: [{ id: 'preserve', label: 'Preserve', detail: '' }],
      createdAtTick: 100,
      expiresAtTick: 200,
    } as never];
    world.guidedCampaign = { completedChapters: ['deer_parliament'] } as never;

    const delta = extractSimTickDelta(world, undefined, { cloneMode: 'isolated' });

    const target = initGame({ size: MapSize.Medium, seed: 123 });
    applySimTickDelta(target, delta, { cloneMode: 'isolated' });

    expect(target.storyFlags).toEqual(world.storyFlags);
    expect(target.pendingStoryEvents).toEqual(world.pendingStoryEvents);
    expect(target.guidedCampaign).toEqual(world.guidedCampaign);
  });

  it('ships election promise records with the tick delta', () => {
    const world = initGame({ size: MapSize.Medium, seed: 123 });
    world.electionPromiseRecords = [{
      electionId: 4, leaderId: 7, year: 2, dueDay: 700, codes: [1, 4], evaluated: false,
    }];

    const delta = extractSimTickDelta(world, undefined, { cloneMode: 'isolated' });
    const target = initGame({ size: MapSize.Medium, seed: 123 });
    applySimTickDelta(target, delta, { cloneMode: 'isolated' });

    expect(target.electionPromiseRecords).toEqual(world.electionPromiseRecords);
  });

  it('includes the story fields in the save allow-list', async () => {
    const { WORLD_STATE_SAVE_KEYS } = await import('../src/game/saveSchema');
    expect(WORLD_STATE_SAVE_KEYS).toContain('storyFlags');
    expect(WORLD_STATE_SAVE_KEYS).toContain('pendingStoryEvents');
    expect(WORLD_STATE_SAVE_KEYS).toContain('guidedCampaign');
  });

  it('buildings diff mode ships only changed/removed buildings', () => {
    const world = initGame({ size: MapSize.Medium, seed: 456 });
    const mkBuilding = (id: number) => ({
      id, type: 'house', x: 0, y: 0, width: 46, height: 40,
      occupants: [], level: 1, constructionProgress: 100, completed: true,
      health: 100, maxHealth: 100, rotation: 0,
    } as never);
    world.buildings.push(mkBuilding(9001), mkBuilding(9002));

    // Initial diff from an empty snapshot ships every building (changedBuildings set).
    const delta1 = extractSimTickDelta(world, undefined, {
      cloneMode: 'isolated',
      prevBuildings: new Map(),
    });
    expect(delta1.changedBuildings?.length).toBe(2);
    expect(delta1.buildings).toBeUndefined();

    // A stable tick with an up-to-date snapshot ships no buildings at all.
    const snapshot = new Map(world.buildings.map((b) => [b.id, JSON.stringify(b)]));
    const delta2 = extractSimTickDelta(world, undefined, {
      cloneMode: 'isolated',
      prevBuildings: snapshot,
    });
    expect(delta2.changedBuildings ?? []).toHaveLength(0);
    expect(delta2.removedBuildingIds ?? []).toHaveLength(0);

    // Mutating one building + removing one building is reflected in the diff.
    const target = initGame({ size: MapSize.Medium, seed: 456 });
    target.buildings.push(mkBuilding(9001), mkBuilding(9002));
    const removedId = 9002;
    world.buildings = world.buildings.filter((b) => b.id !== removedId);
    if (world.buildings[0]) world.buildings[0].health = 42;
    const delta3 = extractSimTickDelta(world, undefined, {
      cloneMode: 'isolated',
      prevBuildings: snapshot,
    });
    expect(delta3.changedBuildings?.some((b) => b.id === world.buildings[0].id && b.health === 42)).toBe(true);
    expect(delta3.removedBuildingIds).toContain(removedId);

    applySimTickDelta(target, delta3, { cloneMode: 'isolated' });
    expect(target.buildings.find((b) => b.id === removedId)).toBeUndefined();
    expect(target.buildings.find((b) => b.id === world.buildings[0].id)?.health).toBe(42);
  });
});

describe('history delta revisions', () => {
  it('preserves unrevised histories, ships bumped edits and transports clears', () => {
    const world = initGame({ size: MapSize.Medium, seed: 123 });
    resetHistoryRevisions(world);
    const target = structuredClone(world);
    const baseline = snapshotHistoryRevisions(world);
    const first = extractSimTickDelta(world, [], {});
    applySimTickDelta(target, structuredClone(first));
    const retained = target.populationHistory;
    const unchanged = extractSimTickDelta(world, [], { prevHistoryRevisions: baseline });
    expect(Object.hasOwn(unchanged, 'populationHistory')).toBe(false);
    expect(Object.hasOwn(unchanged, 'genealogyRegistry')).toBe(false);
    applySimTickDelta(target, structuredClone(unchanged));
    expect(target.populationHistory).toBe(retained);

    world.populationHistory.push({ tick: 1, year: 9, grass: 0, rabbits: 0, deer: 0, wolves: 0, foxes: 0, humans: 42, werewolves: 0, wildkin: 0, buildings: 0 });
    bumpHistoryRevision(world, 'populationHistory');
    const afterPush = snapshotHistoryRevisions(world);
    const changed = extractSimTickDelta(world, [], { prevHistoryRevisions: baseline });
    expect(changed.populationHistory).toEqual(world.populationHistory);
    applySimTickDelta(target, structuredClone(changed));
    expect(target.populationHistory).toEqual(world.populationHistory);

    world.populationHistory.length = 0;
    world.genealogyRegistry = undefined;
    bumpHistoryRevision(world, 'populationHistory');
    bumpHistoryRevision(world, 'genealogyRegistry');
    const cleared = extractSimTickDelta(world, [], { prevHistoryRevisions: afterPush });
    applySimTickDelta(target, structuredClone(cleared));
    expect(target.populationHistory).toEqual([]);
    expect(target.genealogyRegistry).toBeUndefined();
    expect(extractSimTickDelta(world, [], {}).populationHistory).toEqual([]);
  });
});
