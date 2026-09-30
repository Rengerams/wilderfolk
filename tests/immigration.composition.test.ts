/**
 * Immigration party composition (2026-09-16).
 *
 * Immigrants used to be adults only (18–55). A party is now one of three shapes: a lone youth
 * (12–17), a married couple that may bring 1–2 children, or a single adult. The age bands are the
 * simulation's own (childhood under `HUMAN_CHILDHOOD_DAYS`, youth 12–17, adult from
 * `HUMAN_ADULT_MIN_AGE`/`HUMAN_MOVE_OUT_MIN_AGE`), and a child only ever arrives with both parents.
 */
import { describe, expect, it } from 'vitest';
import { HUMAN_CHILDHOOD_DAYS, HUMAN_ADULT_MIN_AGE } from '../src/game/dayCycle';
import { HUMAN_MOVE_OUT_MIN_AGE } from '../src/game/residencyOccupancy';
import { Immigration } from '../src/game/gameConstants';
import { setSimSeed } from '../src/game/simRng';
import { createImmigrantSettler } from '../src/game/worldGen';
import type { Entity, WorldState } from '../src/game/gameTypes';

/** Minimal world: `createImmigrantSettler` only reads the id counter and the calendar. */
function world(): WorldState {
  return {
    year: 1,
    dayInYear: 1,
    tick: 0,
    nextEntityId: 500,
    entities: [],
  } as unknown as WorldState;
}

/** Every party the generator produces for seeds 1..SEEDS with `maxMembers` free slots. */
function parties(maxMembers: number, seeds = 150): Entity[][] {
  const result: Entity[][] = [];
  for (let seed = 1; seed <= seeds; seed++) {
    setSimSeed(seed);
    result.push(createImmigrantSettler(world(), 100, 100, maxMembers));
  }
  return result;
}

const isChild = (e: Entity) => e.age < HUMAN_CHILDHOOD_DAYS;

describe('immigration party composition', () => {
  it('produces all three party shapes, including youths and families with children', () => {
    const all = parties(4);
    const loneYouth = all.filter((p) => p.length === 1 && p[0].age < Immigration.ADULT_AGE_MIN);
    const withChild = all.filter((p) => p.some(isChild));
    const couples = all.filter((p) => p.length >= 2);

    expect(loneYouth.length, 'youths arriving alone').toBeGreaterThan(0);
    expect(withChild.length, 'families with a child').toBeGreaterThan(0);
    expect(couples.length, 'couples').toBeGreaterThan(0);
    expect(all.some((p) => p.length === 1 && p[0].age >= Immigration.ADULT_AGE_MIN)).toBe(true);
  });

  it('never creates a child without both parents in the same party', () => {
    for (const party of parties(4)) {
      for (const member of party) {
        if (!isChild(member)) continue;
        expect(member.isJuvenile, `${member.name} is a juvenile`).toBe(true);
        expect(member.fatherId, `${member.name} has a father`).not.toBeNull();
        expect(member.motherId, `${member.name} has a mother`).not.toBeNull();
        expect(party.some((p) => p.id === member.fatherId), 'father present').toBe(true);
        expect(party.some((p) => p.id === member.motherId), 'mother present').toBe(true);
      }
    }
  });

  it('keeps children in the family and registers them with both parents', () => {
    const family = parties(4).find((p) => p.some(isChild));
    expect(family).toBeDefined();
    const children = family!.filter(isChild);
    const parents = family!.filter((p) => !isChild(p));
    expect(parents.length).toBe(2);

    for (const child of children) {
      expect(child.surname).toBe(parents[0].surname);
      expect(parents.every((parent) => (parent.childrenIds ?? []).includes(child.id))).toBe(true);
      expect(child.age).toBeGreaterThanOrEqual(Immigration.CHILD_AGE_MIN);
      expect(child.age).toBeLessThanOrEqual(Immigration.CHILD_AGE_MAX);
    }
  });

  it('respects the free-slot budget', () => {
    for (const maxMembers of [1, 2, 3, 4]) {
      for (const party of parties(maxMembers)) {
        expect(party.length).toBeLessThanOrEqual(maxMembers);
        expect(party.length).toBeGreaterThan(0);
      }
    }
  });

  it('never brings children when there is no room for them', () => {
    for (const party of parties(2)) {
      expect(party.some(isChild), 'a 2-slot colony gets a couple, not a family').toBe(false);
    }
  });

  it('keeps every arrival inside a coherent age band', () => {
    for (const party of parties(4)) {
      for (const member of party) {
        expect(member.age).toBeGreaterThanOrEqual(Immigration.CHILD_AGE_MIN);
        expect(member.age).toBeLessThanOrEqual(Immigration.ADULT_AGE_MAX);
        // Nobody arrives married-but-underage, and nobody arrives as a lone juvenile.
        if (member.relationshipStatus === 'married') {
          expect(member.age).toBeGreaterThanOrEqual(Immigration.ADULT_AGE_MIN);
        }
        if (party.length === 1) expect(isChild(member)).toBe(false);
      }
    }
  });

  it('gives a lone youth an age the youth band allows and no partner', () => {
    const youth = parties(4).find((p) => p.length === 1 && p[0].age < Immigration.ADULT_AGE_MIN);
    expect(youth).toBeDefined();
    const member = youth![0];
    expect(member.age).toBeGreaterThanOrEqual(Immigration.YOUTH_AGE_MIN);
    expect(member.age).toBeLessThanOrEqual(Immigration.YOUTH_AGE_MAX);
    expect(member.partnerId).toBeUndefined();
    expect(member.relationshipStatus).toBe('single');
    // A youth is past childhood (graduated) but below the adult floor and the marriage floor.
    expect(member.isJuvenile).toBe(false);
    expect(member.age).toBeGreaterThanOrEqual(Immigration.YOUTH_AGE_MIN);
    expect(member.age).toBeLessThanOrEqual(Immigration.YOUTH_AGE_MAX);
    expect(member.age).toBeLessThan(HUMAN_MOVE_OUT_MIN_AGE);
    expect(member.age).toBeLessThan(HUMAN_ADULT_MIN_AGE);
  });
});
