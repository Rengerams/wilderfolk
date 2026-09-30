/**
 * Lifecycle/social audit F5 — courtship links were neither exclusive nor cleaned up.
 *
 * Three defects, one pair bond. `isCourtshipCandidate` had no exclusivity test, so a third settler
 * could be pointed at someone already in a mutual courtship while `humanTick` overwrote that
 * target's link — orphaning the previous partner's half, which then failed the mutuality test in
 * `findCourtshipPartner` and was never repaired. `courtshipProgress` is a per-settler field, so the
 * orphan's progress (and the renderer's 💕 badge) survived a courtship that no longer existed, and a
 * *new* pair inherited the abandoned pair's progress. Nothing cleared a link or its progress when a
 * courtship ended without marriage — death cleanup, divorce and the orphan path all left it behind.
 *
 * Ruling: a courtship is a mutual pair bond, so the first mutual pair is locked until marriage or a
 * repair — the same one-route-at-a-time rule youth love, affairs and marriage already follow.
 */
import { describe, expect, it } from 'vitest';
import { EntityType, JobType } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import { initGame } from '../src/game/worldGen';
import { TICKS_PER_DAY } from '../src/game/dayCycle';
import {
  bindCourtship,
  findCourtshipPartner,
  reconcileCourtships,
} from '../src/game/simulation/humanRelationships';
import { killHuman } from '../src/game/humanLifecycleCleanup';
import { grantDivorce } from '../src/game/nameLoader';

const A_ID = 1;
const B_ID = 2;
const C_ID = 3;

function settler(id: number, gender: 'male' | 'female', overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    type: EntityType.Human,
    name: `Settler${id}`,
    surname: 'Vale',
    gender,
    x: 100 + id * 4,
    y: 100,
    energy: 200,
    maxEnergy: 200,
    age: 24,
    birthYear: 0,
    birthMonth: 0,
    birthDay: 0,
    alive: true,
    size: 10,
    speed: 2,
    vx: 0,
    vy: 0,
    flash: 0,
    animFrame: 0,
    spriteAngle: 0,
    childrenIds: [],
    generation: 1,
    isJuvenile: false,
    job: JobType.Settler,
    relationshipStatus: 'single',
    ...overrides,
  } as Entity;
}

function fixture(entities: Entity[]): { state: WorldState; entityById: Map<number, Entity> } {
  const state = initGame({ seed: 20260916 });
  state.entities = entities;
  state.villageLeaderId = null;
  state.tick = TICKS_PER_DAY;
  return { state, entityById: new Map(entities.map((entity) => [entity.id, entity])) };
}

function context(entityById: Map<number, Entity>, entities: Entity[]): Parameters<typeof reconcileCourtships>[0] {
  return { entityById, playerHumans: entities };
}

describe('courtship exclusivity and cleanup (audit F5)', () => {
  it('does not offer a settler who is already in a mutual courtship to a third settler', () => {
    const a = settler(A_ID, 'male', { courtshipPartnerId: B_ID, courtshipProgress: 60 });
    const b = settler(B_ID, 'female', { courtshipPartnerId: A_ID, courtshipProgress: 60 });
    const c = settler(C_ID, 'male');
    fixture([a, b, c]);

    const partner = findCourtshipPartner(c, false, 120, undefined, new Map(), [a, b, c], 1200, 900);

    expect(partner).toBeUndefined();
  });

  it('still re-selects the caller’s own mutual partner every tick', () => {
    const a = settler(A_ID, 'male', { courtshipPartnerId: B_ID, courtshipProgress: 60 });
    const b = settler(B_ID, 'female', { courtshipPartnerId: A_ID, courtshipProgress: 60 });
    fixture([a, b]);

    const partner = findCourtshipPartner(a, false, 120, undefined, new Map(), [a, b], 1200, 900);

    expect(partner?.id).toBe(B_ID);
  });

  it('starts a new courtship at zero instead of inheriting the previous partner’s progress', () => {
    const a = settler(A_ID, 'male', { courtshipPartnerId: B_ID, courtshipProgress: 60 });
    const c = settler(C_ID, 'female');

    bindCourtship(a, c);

    expect(a.courtshipPartnerId).toBe(C_ID);
    expect(a.courtshipProgress).toBe(0);
    expect(c.courtshipPartnerId).toBe(A_ID);
    expect(c.courtshipProgress).toBe(0);

    // Re-binding the same pair must not wipe the progress they have built.
    a.courtshipProgress = 42;
    c.courtshipProgress = 42;
    bindCourtship(a, c);
    expect(a.courtshipProgress).toBe(42);
    expect(c.courtshipProgress).toBe(42);
  });

  it('dissolves a courtship whose partner moved on, on both sides and with its progress', () => {
    const a = settler(A_ID, 'male', { courtshipPartnerId: B_ID, courtshipProgress: 60 });
    const b = settler(B_ID, 'female', {
      courtshipPartnerId: A_ID,
      courtshipProgress: 60,
      relationshipStatus: 'married',
      partnerId: 99,
    });
    const { entityById } = fixture([a, b]);

    reconcileCourtships(context(entityById, [a, b]));

    expect(a.courtshipPartnerId).toBeUndefined();
    expect(a.courtshipProgress).toBe(0);
    expect(b.courtshipPartnerId).toBeUndefined();
    expect(b.courtshipProgress).toBe(0);
  });

  it('keeps a valid mutual courtship untouched', () => {
    const a = settler(A_ID, 'male', { courtshipPartnerId: B_ID, courtshipProgress: 60 });
    const b = settler(B_ID, 'female', { courtshipPartnerId: A_ID, courtshipProgress: 60 });
    const { entityById } = fixture([a, b]);

    reconcileCourtships(context(entityById, [a, b]));

    expect(a.courtshipPartnerId).toBe(B_ID);
    expect(a.courtshipProgress).toBe(60);
    expect(b.courtshipPartnerId).toBe(A_ID);
  });

  it('clears the survivor’s half of a courtship when the partner dies', () => {
    const a = settler(A_ID, 'male', { courtshipPartnerId: B_ID, courtshipProgress: 60 });
    const b = settler(B_ID, 'female', { courtshipPartnerId: A_ID, courtshipProgress: 60 });
    const { entityById } = fixture([a, b]);

    killHuman(b, [], entityById, TICKS_PER_DAY);

    expect(b.courtshipPartnerId).toBeUndefined();
    expect(b.courtshipProgress).toBe(0);
    expect(a.courtshipPartnerId).toBeUndefined();
    expect(a.courtshipProgress).toBe(0);
  });

  it('clears a stale courtship link when a marriage is dissolved', () => {
    const wife = settler(A_ID, 'female', { courtshipPartnerId: C_ID, courtshipProgress: 30 });
    const husband = settler(B_ID, 'male');

    grantDivorce(wife, husband);

    expect(wife.courtshipPartnerId).toBeUndefined();
    expect(wife.courtshipProgress).toBe(0);
  });
});
