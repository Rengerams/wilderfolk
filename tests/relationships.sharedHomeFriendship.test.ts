/**
 * F2 of the 2026-09-16 lifecycle/social audit (`docs/private/audits/2026-09-16/sim-lifecycle-social.md`):
 * the daily friendship pass grouped the "shared home" bump by `homeBuildingId`, which is the
 * **workplace** in this codebase — so cohabitants never grew closer while coworkers in one building
 * were counted twice (workplace and job type).
 *
 * The fix keeps the workplace and job-type sources and adds the missing residence source, so the
 * documented rule ("friendships grow from shared work, home and childhood") is implemented without
 * removing the friendship growth that already existed.
 */
import { describe, expect, it } from 'vitest';
import { EntityType, JobType } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import { advanceSocialRelationships, friendshipScore } from '../src/game/relationships';
import { TICKS_PER_DAY } from '../src/game/dayCycle';

function settler(id: number, overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    type: EntityType.Human,
    name: `Settler${id}`,
    alive: true,
    energy: 50,
    maxEnergy: 100,
    ...overrides,
  } as Entity;
}

function state(): WorldState {
  return {
    entities: [],
    buildings: [],
    tick: TICKS_PER_DAY,
    year: 1,
    dayInYear: 1,
    eventLog: [],
    notifications: [],
    bigNews: [],
    storyFlags: {},
    pendingStoryEvents: [],
    resources: {},
    floatingTexts: [],
    nextFloatingTextId: 1,
    villageReputation: 0,
  } as unknown as WorldState;
}

describe('daily friendship sources (F2)', () => {
  it('grows friendship between settlers who share a house', () => {
    const a = settler(1, { residenceBuildingId: 10, homeBuildingId: 20, job: JobType.Farmer });
    const b = settler(2, { residenceBuildingId: 10, homeBuildingId: 30, job: JobType.Lumberjack });
    const world = state();

    advanceSocialRelationships(world, [a, b]);

    expect(friendshipScore(a, b.id)).toBeGreaterThan(0);
    expect(friendshipScore(b, a.id)).toBe(friendshipScore(a, b.id));
  });

  it('still grows friendship between coworkers who share a workplace building', () => {
    const a = settler(1, { residenceBuildingId: 10, homeBuildingId: 20, job: JobType.Farmer });
    const b = settler(2, { residenceBuildingId: 30, homeBuildingId: 20, job: JobType.Lumberjack });
    const world = state();

    advanceSocialRelationships(world, [a, b]);

    expect(friendshipScore(a, b.id)).toBeGreaterThan(0);
  });

  it('leaves settlers who share neither home nor work as strangers', () => {
    const a = settler(1, { residenceBuildingId: 10, homeBuildingId: 20, job: JobType.Farmer });
    const b = settler(2, { residenceBuildingId: 30, homeBuildingId: 40, job: JobType.Lumberjack });
    const world = state();

    advanceSocialRelationships(world, [a, b]);

    expect(friendshipScore(a, b.id)).toBe(0);
  });
});
