/**
 * F4 of the 2026-09-16 lifecycle/social audit (`docs/private/audits/2026-09-16/sim-lifecycle-social.md`):
 * the feud pass deletes the record of a counterpart who is gone, but that deletion sat **below** the
 * "lower id takes responsibility" guard — so when the lower-id settler died, the survivor kept
 * `feud_<deadId>` forever: never decayed, never deleted, and unable to log "settled their feud".
 * The friendship pass it claims to mirror prunes for both sides.
 */
import { describe, expect, it } from 'vitest';
import { EntityType } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import { advanceSocialRelationships, startFeud } from '../src/game/relationships';
import { TICKS_PER_DAY } from '../src/game/dayCycle';

function settler(id: number, overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    type: EntityType.Human,
    name: `Settler${id}`,
    alive: true,
    energy: 100,
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

describe('feud cleanup when a counterpart is gone (F4)', () => {
  it('prunes the feud of a removed settler for the surviving higher id', () => {
    const world = state();
    const lower = settler(1);
    const survivor = settler(2);
    // A third settler keeps the daily pass running — it returns early for fewer than two people.
    const bystander = settler(9);
    startFeud(world, lower, survivor, 30);
    expect(survivor.feuds?.['feud_1']).toBe(30);

    // `lower` is removed from the living set (death / permanent removal).
    advanceSocialRelationships(world, [survivor, bystander]);

    expect(survivor.feuds?.['feud_1']).toBeUndefined();
  });

  it('prunes it when the higher id is the one removed, exactly as before', () => {
    const world = state();
    const survivor = settler(1);
    const higher = settler(2);
    const bystander = settler(9);
    startFeud(world, survivor, higher, 30);

    advanceSocialRelationships(world, [survivor, bystander]);

    expect(survivor.feuds?.['feud_2']).toBeUndefined();
  });

  it('still decays a live feud once per day', () => {
    const world = state();
    const a = settler(1);
    const b = settler(2);
    startFeud(world, a, b, 30);

    advanceSocialRelationships(world, [a, b]);

    expect(a.feuds?.['feud_2']).toBeCloseTo(29.6, 6);
    expect(b.feuds?.['feud_1']).toBeCloseTo(29.6, 6);
  });

  it('keeps the record of a settler who is alive but outside this pass', () => {
    const world = state();
    const a = settler(1);
    const b = settler(2);
    const bystander = settler(9);
    startFeud(world, a, b, 30);

    // `b` is still living, merely not covered by this narrower pass: that is not a death, so the
    // record must survive for the pass that does include them.
    advanceSocialRelationships(world, [a, b, bystander], [a, bystander]);

    expect(a.feuds?.['feud_2']).toBeDefined();
  });
});
