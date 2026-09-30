/**
 * Audit N-3 — the patrol reveal is a property of the tick, not of the guard looking.
 *
 * `tickHumans` used to call `detectRaidersForPatrol` once per barracks guard on shift, and each call
 * walked the whole human list twice. It now builds `buildPatrolRevealIndex` once and passes it to
 * every guard. These cases pin the observable result of that change: the same groups are revealed and
 * each group is announced exactly once, whichever guard spots it and however many guards are on duty.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { EntityType, MapSize } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import { buildPatrolRevealIndex, detectRaidersForPatrol } from '../src/game/humanPatrolBehavior';

const SPOT_MESSAGE = 'Soldier patrol spotted hostile raiders';

function raider(id: number, x: number, y: number, groupId: string): Entity {
  return {
    id,
    type: EntityType.Human,
    faction: 'rival',
    groupId,
    x,
    y,
    alive: true,
    hiddenFromPlayer: true,
    detectedByPatrol: false,
  } as never as Entity;
}

function guard(id: number, x: number, y: number): Entity {
  return { id, type: EntityType.Human, x, y, alive: true } as never as Entity;
}

function patrolWorld(seed: number, raiders: Entity[]): WorldState {
  const world = initGame({ size: MapSize.Medium, seed });
  world.pendingRaidEvents = [{ rivalId: 'G1' } as never, { rivalId: 'G2' } as never];
  world.entities.push(...raiders);
  return world;
}

function spotLines(world: WorldState): string[] {
  return world.eventLog.filter((e) => e.message.includes(SPOT_MESSAGE)).map((e) => e.message);
}

function revealedGroups(raiders: Entity[]): string[] {
  return raiders.filter((r) => !r.hiddenFromPlayer).map((r) => r.groupId ?? '');
}

describe('patrol reveal index (N-3)', () => {
  it('reveals the same groups with 1 guard and with 3, announcing each group once', () => {
    // Band G1 is split across two members; band G2 is far away and out of every guard's reach.
    const oneGuardRaiders = [
      raider(900, 300, 300, 'G1'),
      raider(901, 380, 300, 'G1'),
      raider(902, 2000, 2000, 'G2'),
    ];
    const manyGuardRaiders = [
      raider(900, 300, 300, 'G1'),
      raider(901, 380, 300, 'G1'),
      raider(902, 2000, 2000, 'G2'),
    ];

    const oneGuardWorld = patrolWorld(7001, oneGuardRaiders);
    const oneGuardIndex = buildPatrolRevealIndex(oneGuardWorld, oneGuardRaiders);
    detectRaidersForPatrol(oneGuardWorld, guard(1, 305, 300), oneGuardIndex);

    const manyGuardWorld = patrolWorld(7002, manyGuardRaiders);
    const manyGuardIndex = buildPatrolRevealIndex(manyGuardWorld, manyGuardRaiders);
    for (const patrol of [guard(1, 305, 300), guard(2, 420, 320), guard(3, 350, 260)]) {
      detectRaidersForPatrol(manyGuardWorld, patrol, manyGuardIndex);
    }

    // Same observable result: the groups a single guard would have found are the groups revealed.
    expect(revealedGroups(manyGuardRaiders)).toEqual(revealedGroups(oneGuardRaiders));
    expect(revealedGroups(oneGuardRaiders)).toEqual(['G1', 'G1']);
    expect(oneGuardRaiders[2]!.hiddenFromPlayer).toBe(true);
    expect(manyGuardRaiders.every((r) => r.detectedByPatrol || r.hiddenFromPlayer)).toBe(true);

    // One announcement per revealed group — a later guard must not repeat it.
    expect(spotLines(oneGuardWorld)).toEqual([`${SPOT_MESSAGE} from G1`]);
    expect(spotLines(manyGuardWorld)).toEqual([`${SPOT_MESSAGE} from G1`]);
  });

  it('ignores a rival band with no marching raid event, and a band outside patrol range', () => {
    const bands = [
      raider(900, 300, 300, 'G1'),
      raider(901, 320, 300, 'G3'), // no matching pendingRaidEvents entry
      raider(902, 900, 900, 'G2'),
    ];
    const world = patrolWorld(7003, bands);
    const index = buildPatrolRevealIndex(world, bands);

    detectRaidersForPatrol(world, guard(1, 305, 300), index);

    expect(bands[0]!.hiddenFromPlayer).toBe(false);
    expect(bands[1]!.hiddenFromPlayer).toBe(true);
    expect(bands[2]!.hiddenFromPlayer).toBe(true);
    expect(spotLines(world)).toEqual([`${SPOT_MESSAGE} from G1`]);
  });
});
