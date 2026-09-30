import { describe, it, expect } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { BuildingType, EntityType } from '../src/game/gameTypes';
import type { Building, Entity } from '../src/game/gameTypes';
import {
  tryFormSchoolyardBond,
  findCourtshipPartner,
  trySchoolyardGossip,
} from '../src/game/simulation/humanRelationships';
import { getAbsoluteCalendarDay, TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/game/dayCycle';
import {
  SCHOOL_MAX_CHILDREN,
  findSchoolForChild,
  findStaffedSchools,
  buildSchoolRosters,
  describeSchoolRoster,
  getSchoolRoster,
} from '../src/game/education';
import { assignMissingWorkers, isManualStaffBuilding } from '../src/game/workforce';
import { isOnWorkShift } from '../src/game/humanSchedule';

/**
 * Regression: schoolyard bonds — kids at school befriend classmates, and those
 * childhood bonds follow them into adulthood, nudging who they court (a friend
 * counts as half the distance). Bonds are mutual, capped at 3, and form on
 * school-day milestones.
 */
describe('school.bonds.test.ts', () => {
  function stubHuman(id: number, overrides: Partial<Entity> = {}): Entity {
    return {
      id,
      type: EntityType.Human,
      x: 0,
      y: 0,
      energy: 100,
      maxEnergy: 100,
      age: 25,
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
      generation: 0,
      name: 'Asha',
      surname: 'Reed',
      gender: 'female',
      isJuvenile: false,
      relationshipStatus: 'single',
      ...overrides,
    } as Entity;
  }

  function bondState(children: Entity[]) {
    const state = initGame();
    state.entities = children;
    return state;
  }

  describe('schoolyard bonds', () => {
    it('two classmates become friends mutually at a school-day milestone', () => {
      const child = stubHuman(1, { name: 'Loki', gender: 'male', isJuvenile: true, schoolDays: 5 });
      const pal = stubHuman(2, { name: 'Sigrid', gender: 'female', isJuvenile: true });
      const state = bondState([child, pal]);

      tryFormSchoolyardBond(state, child, () => 0);

      expect(child.childhoodFriendsIds).toContain(2);
      expect(pal.childhoodFriendsIds).toContain(1);
      expect(child.schoolBondDay).toBe(getAbsoluteCalendarDay(state.tick));
    });

    it('a lone child has nobody to befriend', () => {
      const child = stubHuman(1, { name: 'Loki', gender: 'male', isJuvenile: true, schoolDays: 5 });
      const state = bondState([child]);

      tryFormSchoolyardBond(state, child, () => 0);

      expect(child.childhoodFriendsIds ?? []).toHaveLength(0);
    });

    it('no bond before the 5-school-day milestone', () => {
      const child = stubHuman(1, { name: 'Loki', gender: 'male', isJuvenile: true, schoolDays: 3 });
      const pal = stubHuman(2, { name: 'Sigrid', gender: 'female', isJuvenile: true });
      const state = bondState([child, pal]);

      tryFormSchoolyardBond(state, child, () => 0);

      expect(child.childhoodFriendsIds ?? []).toHaveLength(0);
    });

    it('friendships cap at 3', () => {
      const child = stubHuman(1, {
        name: 'Loki', gender: 'male', isJuvenile: true, schoolDays: 10,
        childhoodFriendsIds: [10, 11, 12],
      });
      const pal = stubHuman(2, { name: 'Sigrid', gender: 'female', isJuvenile: true });
      const state = bondState([child, pal]);

      tryFormSchoolyardBond(state, child, () => 0);

      expect(child.childhoodFriendsIds).toHaveLength(3);
      expect(pal.childhoodFriendsIds ?? []).toHaveLength(0);
    });

    it('a childhood friend wins courtship over a physically closer stranger', () => {
      const hero = stubHuman(1, { name: 'Erik', gender: 'male', x: 0, y: 0, childhoodFriendsIds: [2] });
      const friend = stubHuman(2, { name: 'Maren', gender: 'female', x: 120, y: 0 });
      const stranger = stubHuman(3, { name: 'Unn', gender: 'female', x: 65, y: 0 });
      const fallback = [hero, friend, stranger];

      // Friend at 120px counts as ~60px (half distance) → beats the stranger at 65px.
      expect(findCourtshipPartner(hero, false, 200, undefined, new Map(), fallback)?.id).toBe(2);

      // Control: without the bond, the closer stranger wins.
      hero.childhoodFriendsIds = undefined;
      expect(findCourtshipPartner(hero, false, 200, undefined, new Map(), fallback)?.id).toBe(3);
    });
  });
});

/**
 * Regression: schools are manually staffed (the player picks the teacher, whose
 * personality shapes the kids) and each school caps attendance at
 * SCHOOL_MAX_CHILDREN — the 11th child finds no seat, so class sizes stay sane
 * and a second school becomes a real decision.
 */
describe('school.capacity.test.ts', () => {
  function schoolFixture(): { child: Entity; school: Building } {
    const state = initGame();
    const child: Entity = {
      ...state.entities.find((e) => e.type === EntityType.Human && e.alive)!,
      id: 9000,
      name: 'Little',
      surname: 'One',
      isJuvenile: true,
      x: 100,
      y: 100,
    };
    const school: Building = {
      ...state.buildings[0]!,
      id: 8000,
      type: BuildingType.School,
      completed: true,
      occupants: [9001], // one teacher assigned manually
      faction: undefined,
      x: 90,
      y: 90,
      width: 53,
      height: 46,
    };
    return { child, school };
  }

  describe('school manual staffing & capacity', () => {
    it('the School is a manual-staff building — auto-assign never fills it', () => {
      expect(isManualStaffBuilding(BuildingType.School)).toBe(true);
    });

    it('auto-staff leaves an unstaffed school empty even with idle settlers', () => {
      const state = initGame();
      // Idle adult settler, empty completed school.
      const school: Building = {
        ...state.buildings[0]!,
        id: 8002,
        type: BuildingType.School,
        completed: true,
        occupants: [],
        faction: undefined,
        x: 90,
        y: 90,
        width: 53,
        height: 46,
      };
      state.buildings.push(school);
      assignMissingWorkers(
        state.entities.filter((e) => e.alive && e.type === EntityType.Human && !e.faction),
        state.buildings,
      );
      expect(school.occupants).toHaveLength(0);
    });

    it('a child finds the school while seats remain', () => {
      const { child, school } = schoolFixture();
      const reserved = new Map<number, number>([[school.id, SCHOOL_MAX_CHILDREN - 1]]);
      expect(findSchoolForChild(child, [school], reserved)?.id).toBe(school.id);
    });

    it('the 11th child finds no seat — school capacity is 10', () => {
      const { child, school } = schoolFixture();
      const reserved = new Map<number, number>([[school.id, SCHOOL_MAX_CHILDREN]]);
      expect(findSchoolForChild(child, [school], reserved)).toBeUndefined();
    });

    it('a second school still takes overflow children', () => {
      const { child, school } = schoolFixture();
      const school2: Building = { ...school, id: 8001, x: 400, y: 100 };
      const reserved = new Map<number, number>([[school.id, SCHOOL_MAX_CHILDREN]]);
      expect(findSchoolForChild(child, [school, school2], reserved)?.id).toBe(8001);
    });

    it('staffed schools are the only ones children consider', () => {
      const { child, school } = schoolFixture();
      const unstaffed: Building = { ...school, id: 8003, occupants: [] };
      expect(findStaffedSchools([school, unstaffed])).toHaveLength(1);
      expect(findSchoolForChild(child, [school, unstaffed])?.id).toBe(school.id);
    });
  });
});

/**
 * Regression: kids are gossip couriers — a child enrolled in school whose
 * parent carries an established affair may let it slip, exposing the affair
 * as a rumor (the schoolyard does the church's gossip work). One slip per
 * child per day; early flings are not worth blabbing about.
 */
describe('school.gossip.test.ts', () => {
  function stubHuman(id: number, overrides: Partial<Entity> = {}): Entity {
    return {
      id,
      type: EntityType.Human,
      x: 0,
      y: 0,
      energy: 100,
      maxEnergy: 100,
      age: 30,
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
      generation: 0,
      name: 'Asha',
      surname: 'Reed',
      gender: 'female',
      isJuvenile: false,
      ...overrides,
    } as Entity;
  }

  function gossipFixture(parentProgress: number) {
    const state = initGame();
    const parent = stubHuman(1, {
      name: 'Halvard', surname: 'Root', gender: 'male',
      relationshipStatus: 'married', partnerId: 4,
      affairPartnerId: 2, affairProgress: parentProgress,
    });
    const lover = stubHuman(2, {
      name: 'Maren', surname: 'Ash', gender: 'female',
      relationshipStatus: 'married', partnerId: 5,
      affairPartnerId: 1, affairProgress: parentProgress,
    });
    const spouse = stubHuman(4, { name: 'Gudrun', surname: 'Root', gender: 'female', relationshipStatus: 'married', partnerId: 1 });
    const child = stubHuman(3, { name: 'Loki', surname: 'Root', gender: 'male', isJuvenile: true, fatherId: 1 });
    const entities = [parent, lover, spouse, child];
    state.entities = entities;
    const entityById = new Map(entities.map((e) => [e.id, e]));
    return { state, parent, lover, child, entityById, entities };
  }

  describe('schoolyard gossip (kids as gossip couriers)', () => {
    it('a child without parents blabs nothing', () => {
      const { state, parent, child, entityById, entities } = gossipFixture(60);
      child.fatherId = undefined;
      child.motherId = undefined;
      trySchoolyardGossip(state, child, entityById, [], entities, () => 0.1);
      expect(parent.affairPartnerId).toBe(2);
    });

    it('a parent without an affair gives the kids nothing to say', () => {
      const { state, parent, child, entityById, entities } = gossipFixture(60);
      parent.affairPartnerId = undefined;
      trySchoolyardGossip(state, child, entityById, [], entities, () => 0.1);
      expect(parent.affairProgress).toBe(60);
    });

    it('an established affair gets exposed as a rumor when the kid slips', () => {
      const { state, parent, child, entityById, entities } = gossipFixture(60);
      trySchoolyardGossip(state, child, entityById, [], entities, () => 0.1);
      expect(parent.affairPartnerId).toBeUndefined();
      expect(parent.affairProgress).toBe(0);
      expect(child.schoolGossipDay).toBe(getAbsoluteCalendarDay(state.tick));
    });

    it('an early fling (progress < 45) is not worth blabbing about', () => {
      const { state, parent, child, entityById, entities } = gossipFixture(20);
      trySchoolyardGossip(state, child, entityById, [], entities, () => 0.1);
      expect(parent.affairPartnerId).toBe(2);
      expect(parent.affairProgress).toBe(20);
    });

    it('only one slip per child per day — the gate holds even with a fresh secret', () => {
      const { state, parent, child, entityById, entities } = gossipFixture(60);
      // A different secret the same day — but the child already blabbed today.
      child.schoolGossipDay = getAbsoluteCalendarDay(state.tick);
      trySchoolyardGossip(state, child, entityById, [], entities, () => 0.1);
      expect(parent.affairPartnerId).toBe(2);
    });
  });
});

/**
 * School rosters (2026-09-16) — the school inspector's pupil list.
 *
 * The simulation does not store attendance anywhere: every tick each player child is
 * sent to the nearest **staffed** school with a free seat, and seats are handed out in
 * world order through a per-tick reservation map (`humanTick`'s `schoolReserved`). The
 * inspector therefore has to ask the same owner function, which is what
 * `buildSchoolRosters` / `getSchoolRoster` expose — a second, hand-rolled answer would
 * inevitably disagree with where the children actually walk.
 *
 * These cases pin the parts a player would notice as wrong: a roster over capacity, a
 * child listed at a school with no teacher, the wrong children credited after an
 * overflow, and “in class” claimed at midnight.
 */
describe('school.roster.test.ts', () => {
  /** One generated world, shared by the fixtures — generating one per entity is slow. */
  let probeWorld: ReturnType<typeof initGame> | undefined;
  function probe(): ReturnType<typeof initGame> {
    if (!probeWorld) probeWorld = initGame();
    return probeWorld;
  }

  /** A tick that is a workday and inside class hours, found through the owner's rule. */
  function classTick(): number {
    for (let day = 1; day < 10; day++) {
      const tick = day * TICKS_PER_DAY + 10 * TICKS_PER_HOUR;
      if (isOnWorkShift(tick, 10)) return tick;
    }
    throw new Error('no workday class tick found');
  }

  function school(id: number, x: number, y: number, occupants: number[] = [9001]): Building {
    return {
      ...probe().buildings[0]!,
      id,
      type: BuildingType.School,
      completed: true,
      occupants,
      faction: undefined,
      x,
      y,
      width: 53,
      height: 46,
    };
  }

  function child(id: number, x: number, y: number, overrides: Partial<Entity> = {}): Entity {
    return {
      ...probe().entities.find((e) => e.type === EntityType.Human && e.alive)!,
      id,
      name: `Child${id}`,
      surname: 'Test',
      isJuvenile: true,
      alive: true,
      faction: undefined,
      x,
      y,
      ...overrides,
    };
  }

  describe('school rosters', () => {
    it('fills one school to capacity and sends the overflow to the next staffed school', () => {
      const near = school(8000, 100, 100);
      const far = school(8001, 500, 100);
      const children = Array.from({ length: 12 }, (_, index) => child(9000 + index, 110, 100));
      const tick = classTick();

      const rosters = buildSchoolRosters([near, far], children, tick, 10);
      const nearPupils = rosters.get(near.id)?.pupils ?? [];
      const farPupils = rosters.get(far.id)?.pupils ?? [];

      expect(nearPupils).toHaveLength(SCHOOL_MAX_CHILDREN);
      expect(farPupils).toHaveLength(2);
      // World order, first come first served.
      expect(nearPupils.map((pupil) => pupil.id)).toEqual(children.slice(0, 10).map((c) => c.id));
      expect(farPupils.map((pupil) => pupil.id)).toEqual(children.slice(10).map((c) => c.id));
      // Nobody is counted twice, and nobody is lost.
      const all = [...nearPupils, ...farPupils].map((pupil) => pupil.id);
      expect(new Set(all).size).toBe(12);
    });

    it('enrols no more than ten children when one school is the only one', () => {
      const only = school(8000, 100, 100);
      const children = Array.from({ length: 12 }, (_, index) => child(9000 + index, 110, 100));
      const tick = classTick();

      const rosters = buildSchoolRosters([only], children, tick, 10);
      const total = [...rosters.values()].reduce((sum, entry) => sum + entry.pupils.length, 0);
      expect(rosters.get(only.id)?.pupils).toHaveLength(SCHOOL_MAX_CHILDREN);
      expect(total).toBe(SCHOOL_MAX_CHILDREN);
      expect(getSchoolRoster(only, [only], children, tick, 10).pupils).toHaveLength(SCHOOL_MAX_CHILDREN);
    });

    it('lists nobody for an unstaffed school, and nobody at all without a school', () => {
      const unstaffed = school(8000, 100, 100, []);
      const children = [child(9000, 110, 100)];
      const tick = classTick();

      expect(buildSchoolRosters([unstaffed], children, tick, 10).size).toBe(0);
      expect(getSchoolRoster(unstaffed, [unstaffed], children, tick, 10).pupils).toEqual([]);
      expect(getSchoolRoster(school(8002, 100, 100), [], children, tick, 10).pupils).toEqual([]);
    });

    it('enrols only living player children', () => {
      const staffed = school(8000, 100, 100);
      const grownUp = child(9000, 110, 100, { isJuvenile: false });
      const rivalChild = child(9001, 110, 100, { faction: 'rival' });
      const deadChild = child(9002, 110, 100, { alive: false });
      const realChild = child(9003, 110, 100);
      const tick = classTick();

      const entry = getSchoolRoster(
        staffed,
        [staffed],
        [grownUp, rivalChild, deadChild, realChild],
        tick,
        10,
      );
      expect(entry.pupils.map((pupil) => pupil.id)).toEqual([realChild.id]);
    });

    it('marks a pupil "in class" only inside the classroom during class hours', () => {
      const staffed = school(8000, 100, 100);
      const inside = child(9000, 100 + 26, 100 + 23); // school centre
      const outside = child(9001, 600, 700);
      const tick = classTick();

      const during = getSchoolRoster(staffed, [staffed], [inside, outside], tick, 10);
      expect(during.pupils.map((pupil) => pupil.id)).toEqual([inside.id, outside.id]);
      expect(during.inClassNow.map((pupil) => pupil.id)).toEqual([inside.id]);

      // Same world after dark: still enrolled, but nobody is "in class".
      const night = dayTickAt(22);
      const after = getSchoolRoster(staffed, [staffed], [inside, outside], night, 22);
      expect(after.pupils).toHaveLength(2);
      expect(after.inClassNow).toEqual([]);
    });

    it('describes the roster the way the inspector prints it', () => {
      const staffed = school(8000, 100, 100);
      const empty = describeSchoolRoster(
        { schoolId: staffed.id, pupils: [], inClassNow: [] },
        false,
      );
      expect(empty.headline).toBe(`Pupils 0/${SCHOOL_MAX_CHILDREN}`);
      expect(empty.emptyHint).toContain('No teacher assigned');
      expect(empty.classroomFull).toBe(false);

      const staffedButEmpty = describeSchoolRoster({ schoolId: staffed.id, pupils: [], inClassNow: [] }, true);
      expect(staffedButEmpty.emptyHint).toContain('No pupils yet');

      const full = Array.from({ length: SCHOOL_MAX_CHILDREN }, (_, index) => child(9100 + index, 110, 100));
      const occupied = describeSchoolRoster({ schoolId: staffed.id, pupils: full, inClassNow: [] }, true);
      expect(occupied.headline).toBe(`Pupils ${SCHOOL_MAX_CHILDREN}/${SCHOOL_MAX_CHILDREN}`);
      expect(occupied.emptyHint).toBeNull();
      expect(occupied.classroomFull).toBe(true);
    });
  });

  /** A workday tick at a given hour, found through the owner's rule. */
  function dayTickAt(hour: number): number {
    for (let day = 1; day < 10; day++) {
      const tick = day * TICKS_PER_DAY + hour * TICKS_PER_HOUR;
      if (!isOnWorkShift(tick, 10) || isOnWorkShift(tick, hour)) continue;
      return tick;
    }
    throw new Error(`no workday tick found outside class hours at ${hour}:00`);
  }
});
