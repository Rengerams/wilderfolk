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
  isEligibleToCourt,
  reconcileCourtships,
  REMARRIAGE_BAR_TICKS,
  tryCompleteCourtshipMarriage,
} from '../src/game/simulation/humanRelationships';
import { killHuman, reconcileOrphanedMarriages } from '../src/game/humanLifecycleCleanup';
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

describe('a divorced pair may not court again for a year (owner, 2026-10-06)', () => {
  const DIVORCE_TICK = TICKS_PER_DAY * 10;

  function divorcedPair(): { a: Entity; b: Entity } {
    const a = settler(A_ID, 'male');
    const b = settler(B_ID, 'female');
    grantDivorce(a, b, DIVORCE_TICK);
    return { a, b };
  }

  it('stamps the tick the marriage ended on both sides', () => {
    const { a, b } = divorcedPair();

    expect(a.pastPartnerTicks?.[B_ID]).toBe(DIVORCE_TICK);
    expect(b.pastPartnerTicks?.[A_ID]).toBe(DIVORCE_TICK);
  });

  it('refuses to re-select the ex-partner the day after the divorce', () => {
    const { a, b } = divorcedPair();

    const partner = findCourtshipPartner(
      a, false, 120, undefined, new Map(), [a, b], 1200, 900,
      DIVORCE_TICK + 1,
    );

    expect(partner).toBeUndefined();
  });

  it('will not complete the marriage even when both sides are at full courtship', () => {
    const { a, b } = divorcedPair();
    a.courtshipPartnerId = b.id;
    a.courtshipProgress = 100;
    b.courtshipPartnerId = a.id;
    b.courtshipProgress = 100;
    const { state, entityById } = fixture([a, b]);
    state.tick = DIVORCE_TICK + 30;

    const married = tryCompleteCourtshipMarriage(state, a, b, [], [a, b]);

    expect(married).toBe(false);
    expect(a.relationshipStatus).toBe('single');
    expect(a.partnerId).toBeUndefined();
    expect(entityById.size).toBe(2);
  });

  it('lets the same pair court again once the year has passed', () => {
    const { a, b } = divorcedPair();

    const partner = findCourtshipPartner(
      a, false, 120, undefined, new Map(), [a, b], 1200, 900,
      DIVORCE_TICK + REMARRIAGE_BAR_TICKS + 1,
    );

    expect(partner?.id).toBe(B_ID);
  });

  it('does not bar either of them from a different settler', () => {
    const { a, b } = divorcedPair();
    const c = settler(C_ID, 'female');
    const { state } = fixture([a, b, c]);
    state.tick = DIVORCE_TICK + 1;
    a.courtshipPartnerId = c.id;
    a.courtshipProgress = 100;
    c.courtshipPartnerId = a.id;
    c.courtshipProgress = 100;

    const married = tryCompleteCourtshipMarriage(state, a, c, [], [a, b, c]);

    expect(married).toBe(true);
    expect(a.partnerId).toBe(C_ID);
  });
});

describe('a widowed settler may court again (owner, 2026-10-09)', () => {
  it('frees a widower whose wife died before the birth — the expecting status was hers, not his', () => {
    const wife = settler(B_ID, 'female', {
      partnerId: A_ID,
      relationshipStatus: 'expecting',
      pregnant: true,
      pregnancyProgress: 4,
      pregnancyDueProgress: 9,
    });
    const widower = settler(A_ID, 'male', { partnerId: B_ID, relationshipStatus: 'expecting' });
    const free = settler(C_ID, 'female');
    const { entityById } = fixture([wife, widower, free]);

    killHuman(wife, [], entityById, TICKS_PER_DAY);

    expect(widower.partnerId).toBeUndefined();
    expect(widower.relationshipStatus).toBe('single');
    expect(isEligibleToCourt(widower)).toBe(true);
    expect(
      findCourtshipPartner(widower, false, 120, undefined, new Map(), [widower, free], 1200, 900, TICKS_PER_DAY)?.id,
    ).toBe(C_ID);
  });

  it('leaves a pregnant widow expecting, because that pregnancy is still hers', () => {
    const husband = settler(A_ID, 'male', { partnerId: B_ID, relationshipStatus: 'expecting' });
    const widow = settler(B_ID, 'female', {
      partnerId: A_ID,
      relationshipStatus: 'expecting',
      pregnant: true,
      pregnancyProgress: 4,
      pregnancyDueProgress: 9,
    });
    const { entityById } = fixture([husband, widow]);

    killHuman(husband, [], entityById, TICKS_PER_DAY);

    expect(widow.partnerId).toBeUndefined();
    expect(widow.pregnant).toBe(true);
    expect(widow.relationshipStatus).toBe('expecting');
  });

  it('still frees a widow whose marriage ended without a pregnancy', () => {
    const wife = settler(B_ID, 'female', { partnerId: A_ID, relationshipStatus: 'married' });
    const widower = settler(A_ID, 'male', { partnerId: B_ID, relationshipStatus: 'married' });
    const { entityById } = fixture([wife, widower]);

    killHuman(wife, [], entityById, TICKS_PER_DAY);

    expect(widower.relationshipStatus).toBe('single');
    expect(isEligibleToCourt(widower)).toBe(true);
  });

  it('repairs a status left expecting with no partner and no pregnancy of its own', () => {
    const widower = settler(A_ID, 'male', { relationshipStatus: 'expecting' });
    const free = settler(B_ID, 'female');
    const entities = [widower, free];
    fixture(entities);

    reconcileOrphanedMarriages(entities);

    expect(widower.relationshipStatus).toBe('single');
    expect(isEligibleToCourt(widower)).toBe(true);
  });
});
