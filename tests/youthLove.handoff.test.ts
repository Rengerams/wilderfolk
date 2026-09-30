/**
 * Lifecycle/social audit F3 — the youth-love → courtship handoff was unreachable for any real age gap.
 *
 * Ages advance in whole in-game years, so a pair whose birthdays fall in different years reaches
 * (19, 18) on the day the younger partner turns 18. `reconcileYouthLove` cleared the link as soon as
 * the older partner was past 18 (`Math.max(age) > HUMAN_MOVE_OUT_MIN_AGE`), and `advanceYouthLove`
 * runs that reconciliation before the promotion loop — so `promoteYouthLoveToCourtship` fired only for
 * pairs whose 18th birthdays fell inside the same year and every other pair was dropped silently, with
 * no "grew apart" event and no progress carried into adult courtship.
 *
 * The governing feature document (`docs/archive/YOUTH_LOVE_FEATURE.md`) says otherwise: "One is 18 and
 * one is 17 → Keep the valid youth link temporarily. The pair can wait for the younger partner to
 * reach 18" and "Both reach 18 → Hand off to adult courtship." A retained link is therefore bounded by
 * the same age gap that let the pair form, since the younger partner is at most
 * `YOUTH_LOVE_MAX_AGE_GAP` years from the adult floor — and the handoff gate in `advanceYouthLove`
 * promotes the pair on the first pass where both are adults.
 */
import { describe, expect, it } from 'vitest';
import { EntityType, JobType } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import { initGame } from '../src/game/worldGen';
import { TICKS_PER_DAY } from '../src/game/dayCycle';
import {
  YOUTH_LOVE_MAX_AGE_GAP,
  advanceYouthLove,
} from '../src/game/simulation/humanRelationships';

const OLDER_ID = 1;
const YOUNGER_ID = 2;

function settler(id: number, age: number, gender: 'male' | 'female', overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    type: EntityType.Human,
    name: id === OLDER_ID ? 'Rowan' : 'Wren',
    surname: 'Vale',
    gender,
    x: 100,
    y: 100,
    energy: 200,
    maxEnergy: 200,
    age,
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
    isJuvenile: age < 18,
    job: JobType.Settler,
    relationshipStatus: 'single',
    ...overrides,
  } as Entity;
}

/**
 * A mutual youth-love pair at the given ages, inside a real `initGame()` world so the calendar and
 * tick are valid.
 */
function pair(olderAge: number, youngerAge: number): {
  state: WorldState;
  older: Entity;
  younger: Entity;
  ctx: Parameters<typeof advanceYouthLove>[1];
} {
  const state = initGame({ seed: 20260916 });
  const older = settler(OLDER_ID, olderAge, 'male', { youthLovePartnerId: YOUNGER_ID, youthLoveProgress: 40, youthLoveStartedDay: 1 });
  const younger = settler(YOUNGER_ID, youngerAge, 'female', { youthLovePartnerId: OLDER_ID, youthLoveProgress: 40, youthLoveStartedDay: 1 });
  state.entities = [older, younger];
  state.villageLeaderId = null;
  state.tick = TICKS_PER_DAY;
  const entityById = new Map([[OLDER_ID, older], [YOUNGER_ID, younger]]);
  return {
    state,
    older,
    younger,
    ctx: {
      entityById,
      humanSocialGrid: undefined,
      playerHumans: [older, younger],
      width: state.width,
      height: state.height,
    },
  };
}

/** The daily passthrough with a stream that never breaks the pair up. */
function advance(state: WorldState, ctx: Parameters<typeof advanceYouthLove>[1]): void {
  advanceYouthLove(state, ctx, () => 0.99);
}

describe('youth-love → courtship handoff (audit F3)', () => {
  it('keeps the link while only one partner has reached the adult floor', () => {
    const { state, older, younger, ctx } = pair(18, 17);

    advance(state, ctx);

    expect(older.youthLovePartnerId).toBe(YOUNGER_ID);
    expect(younger.youthLovePartnerId).toBe(OLDER_ID);
    expect(older.courtshipPartnerId).toBeUndefined();
    expect(younger.courtshipPartnerId).toBeUndefined();
  });

  it('hands the pair off when the younger partner comes of age (regression: used to be cleared)', () => {
    const { state, older, younger, ctx } = pair(19, 18);

    advance(state, ctx);

    // Mutual adult courtship with the documented carried progress (25–70).
    expect(older.courtshipPartnerId).toBe(YOUNGER_ID);
    expect(younger.courtshipPartnerId).toBe(OLDER_ID);
    expect(older.courtshipProgress).toBeGreaterThanOrEqual(25);
    expect(older.courtshipProgress).toBeLessThanOrEqual(70);
    expect(older.courtshipProgress).toBe(younger.courtshipProgress);
    // The handoff is not a marriage and the youth state is gone.
    expect(older.relationshipStatus).toBe('single');
    expect(older.partnerId).toBeUndefined();
    expect(older.youthLovePartnerId).toBeUndefined();
    expect(younger.youthLovePartnerId).toBeUndefined();
    expect(older.youthLoveProgress).toBeUndefined();
  });

  it('promotes a retained pair once the wait ends, up to the documented age-gap bound', () => {
    const { state, older, younger, ctx } = pair(18 + YOUTH_LOVE_MAX_AGE_GAP, 18);

    advance(state, ctx);

    expect(older.courtshipPartnerId).toBe(YOUNGER_ID);
    expect(younger.courtshipPartnerId).toBe(OLDER_ID);
  });

  it('still clears a link the age-gap rule rejects, so no youth state lingers into adult life', () => {
    const { state, older, younger, ctx } = pair(18 + YOUTH_LOVE_MAX_AGE_GAP + 1, 18);

    advance(state, ctx);

    expect(older.youthLovePartnerId).toBeUndefined();
    expect(younger.youthLovePartnerId).toBeUndefined();
    expect(older.courtshipPartnerId).toBeUndefined();
    expect(younger.courtshipPartnerId).toBeUndefined();
  });

  it('clears the link when one partner is no longer single', () => {
    const { state, older, younger, ctx } = pair(19, 18);
    younger.relationshipStatus = 'married';
    younger.partnerId = 99;

    advance(state, ctx);

    expect(older.youthLovePartnerId).toBeUndefined();
    expect(older.courtshipPartnerId).toBeUndefined();
  });
});
