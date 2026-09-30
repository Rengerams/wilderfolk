/**
 * Audit N-5 — the election gather slot without rebuilding the attendee list.
 *
 * `getElectionGatherTarget` ran once per settler per tick while a ceremony is live, and each call
 * rebuilt `state.entities.filter(isEligibleForLeadership).sort(byId)` just to find one index. It now
 * takes that index in a single pass.
 *
 * The attendee set deliberately stays live: `isEligibleForLeadership` reads `alive`, and the very
 * loop that calls this kills settlers between two calls (`killFromExhaustion` on the exhaustion and
 * daily-mortality paths — humanTick.ts:323, 368, 1516). A per-tick memo would therefore hand later
 * settlers the slot of a smaller ring than the one they are walking to. `legacyGetElectionGatherTarget`
 * below is the pre-fix body, kept as the oracle: every case asserts the new pass agrees with it,
 * including across a mid-loop death.
 */
import { describe, expect, it } from 'vitest';
import { EntityType, MapSize } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import { initGame } from '../src/game/worldGen';
import { getColonyDay, killHuman, setHumanBirthFromAge } from '../src/game/dayCycle';
import { getElectionGatherSite, getElectionGatherTarget, isEligibleForLeadership } from '../src/game/villageLeadership';

const FIXTURE_SEED = 20_260_921;
const GATHER_X = 600;
const GATHER_Y = 400;
const SLOTS_PER_RING = 12;
/** Radius of ring 0 — the first constant in the returned target (`22 + ring * 14`). */
const RING_0_RADIUS = 22;
const RING_STEP = 14;

function legacyGetElectionGatherTarget(state: WorldState, entityId: number): { x: number; y: number } {
  const c = state.electionCeremony;
  if (!c) return getElectionGatherSite(state);

  const attendees = state.entities
    .filter((entity) => isEligibleForLeadership(entity, state))
    .sort((a, b) => a.id - b.id);

  const slot = attendees.findIndex((entity) => entity.id === entityId);
  if (slot < 0) {
    const outerRing = Math.ceil(attendees.length / SLOTS_PER_RING);
    const angle = ((entityId * 17) % 360) * (Math.PI / 180);
    const ringRadius = RING_0_RADIUS + outerRing * RING_STEP + 28;
    return {
      x: c.gatherX + Math.cos(angle) * ringRadius,
      y: c.gatherY + Math.sin(angle) * ringRadius,
    };
  }

  const ring = Math.floor(slot / SLOTS_PER_RING);
  const angleSlot = slot % SLOTS_PER_RING;
  const angle = (angleSlot / SLOTS_PER_RING) * Math.PI * 2;
  const ringRadius = RING_0_RADIUS + ring * RING_STEP;

  return {
    x: c.gatherX + Math.cos(angle) * ringRadius,
    y: c.gatherY + Math.sin(angle) * ringRadius,
  };
}

/**
 * A settlers line-up with every eligibility shape the predicate knows: adults, a child, a
 * seventeen-year-old below the adult floor, a prisoner, a foreign rival, and a corpse. Ids are
 * deliberately out of array order so an id-sorted slot cannot accidentally coincide with it.
 */
function gatherWorld(): WorldState {
  const world = initGame({ villageName: 'Gather', size: MapSize.Medium, seed: FIXTURE_SEED });
  const template = world.entities.find((e) => e.type === EntityType.Human);
  if (!template) throw new Error('initGame produced no settler to use as the fixture template');
  const colonyDay = getColonyDay(world);

  const settle = (
    id: number,
    ageYears: number,
    overrides: Partial<Entity> = {},
  ): Entity => {
    const entity: Entity = { ...template, id, ...overrides };
    setHumanBirthFromAge(entity, ageYears, colonyDay);
    entity.age = ageYears;
    entity.isJuvenile = ageYears < 12;
    return entity;
  };

  const humans: Entity[] = [
    settle(29, 41),
    settle(7, 22),
    settle(13, 34),
    settle(2, 19),
    settle(53, 55),
    settle(23, 30),
    settle(5, 27),
    settle(41, 17), // below HUMAN_ADULT_MIN_AGE (18)
    settle(3, 8), // a child
    settle(31, 38),
    settle(11, 45, { prisonBuildingId: 900 }), // imprisoned — excluded
    settle(47, 33, { faction: 'rival', groupId: 'R1' }), // not a player settler
    settle(37, 29, { alive: false }),
    settle(19, 24),
    settle(43, 61),
    settle(59, 26),
    settle(61, 36),
    settle(67, 48),
    settle(71, 20),
    settle(73, 39),
  ];

  world.entities = humans;
  world.electionCeremony = {
    phase: 'gathering',
    phaseTicksLeft: 10,
    gatherX: GATHER_X,
    gatherY: GATHER_Y,
    reason: 'term',
    pendingLeaderId: 7,
    pendingLeaderName: 'Fixture',
    pendingChanged: false,
  };
  return world;
}

/** Ids of the fixture's eligible settlers, ascending — what the old filter+sort produced. */
function eligibleIds(state: WorldState): number[] {
  return state.entities.filter((e) => isEligibleForLeadership(e, state)).map((e) => e.id).sort((a, b) => a - b);
}

describe('election gather slot (N-5)', () => {
  it('puts every id in the slot its position in the id-sorted attendee list gives it', () => {
    const state = gatherWorld();
    const attendees = eligibleIds(state);

    // Fixture sanity: 20 settlers, 15 eligible — past one ring of 12, so the ring maths is exercised.
    expect(attendees).toEqual([2, 5, 7, 13, 19, 23, 29, 31, 43, 53, 59, 61, 67, 71, 73]);

    for (let id = 0; id <= 80; id++) {
      expect(getElectionGatherTarget(state, id)).toEqual(legacyGetElectionGatherTarget(state, id));
    }

    // Slots are pinned, not merely the set: slot 0 sits on +x at ring 0, slot 12 opens ring 1.
    expect(getElectionGatherTarget(state, 2)).toEqual({ x: GATHER_X + RING_0_RADIUS, y: GATHER_Y });
    expect(attendees.indexOf(19)).toBe(4);
    expect(attendees.indexOf(13)).toBe(3);
    expect(getElectionGatherTarget(state, 13)).toEqual({
      x: GATHER_X + RING_0_RADIUS * Math.cos((3 / SLOTS_PER_RING) * Math.PI * 2),
      y: GATHER_Y + RING_0_RADIUS * Math.sin((3 / SLOTS_PER_RING) * Math.PI * 2),
    });
    // Slot 12 is the first seat of ring 1 — the boundary the ring maths turns on.
    expect(attendees.indexOf(61)).toBe(11);
    expect(attendees.indexOf(67)).toBe(12);
    expect(getElectionGatherTarget(state, 67)).toEqual({ x: GATHER_X + RING_0_RADIUS + RING_STEP, y: GATHER_Y });
    expect(getElectionGatherTarget(state, 73)).toEqual({
      x: GATHER_X + (RING_0_RADIUS + RING_STEP) * Math.cos((2 / SLOTS_PER_RING) * Math.PI * 2),
      y: GATHER_Y + (RING_0_RADIUS + RING_STEP) * Math.sin((2 / SLOTS_PER_RING) * Math.PI * 2),
    });
  });

  it('gives the same slot whatever order the attendees sit in `state.entities`', () => {
    const state = gatherWorld();
    const inArrayOrder = [...state.entities];
    const expected = new Map(inArrayOrder.map((e) => [e.id, legacyGetElectionGatherTarget(state, e.id)]));

    state.entities = [...inArrayOrder].reverse();
    for (const entity of inArrayOrder) {
      expect(getElectionGatherTarget(state, entity.id)).toEqual(expected.get(entity.id));
    }

    // A shuffled order too — the sort made the slot a pure function of the surviving set.
    state.entities = [...inArrayOrder].sort((a, b) => (a.id * 7919) % 101 - (b.id * 7919) % 101);
    for (const entity of inArrayOrder) {
      expect(getElectionGatherTarget(state, entity.id)).toEqual(expected.get(entity.id));
    }
  });

  it('follows the attendee set when a settler dies between two calls', () => {
    const state = gatherWorld();
    const seat = (slot: number): { x: number; y: number } => ({
      x: GATHER_X + RING_0_RADIUS * Math.cos((slot / SLOTS_PER_RING) * Math.PI * 2),
      y: GATHER_Y + RING_0_RADIUS * Math.sin((slot / SLOTS_PER_RING) * Math.PI * 2),
    });
    const before = getElectionGatherTarget(state, 53);
    expect(before).toEqual(seat(9));
    expect(before).toEqual(legacyGetElectionGatherTarget(state, 53));
    // Id 2 is the lowest eligible id, so every other attendee sits one slot further out.
    expect(eligibleIds(state).indexOf(53)).toBe(9);
    expect(getElectionGatherTarget(state, 2)).toEqual({ x: GATHER_X + RING_0_RADIUS, y: GATHER_Y });

    // The real mid-loop death path: `tickHumans` calls exactly this for an exhausted settler.
    const victim = state.entities.find((e) => e.id === 2)!;
    killHuman(victim, state.buildings, new Map(state.entities.map((e) => [e.id, e])), state.tick);

    expect(eligibleIds(state).indexOf(53)).toBe(8);
    expect(getElectionGatherTarget(state, 53)).toEqual(seat(8));
    expect(getElectionGatherTarget(state, 53)).not.toEqual(before);
    expect(getElectionGatherTarget(state, 53)).toEqual(legacyGetElectionGatherTarget(state, 53));
    // …and the survivors stay in step with the oracle for every id, not just the probed one.
    for (let id = 0; id <= 80; id++) {
      expect(getElectionGatherTarget(state, id)).toEqual(legacyGetElectionGatherTarget(state, id));
    }
  });

  it('falls back to the outer ring for a non-attendee, counted from the live attendees', () => {
    const state = gatherWorld();
    // 37 is dead and 41 is under the adult floor: both take the outer-ring branch.
    expect(isEligibleForLeadership(state.entities.find((e) => e.id === 37)!, state)).toBe(false);
    expect(isEligibleForLeadership(state.entities.find((e) => e.id === 41)!, state)).toBe(false);

    const outerRing = Math.ceil(eligibleIds(state).length / SLOTS_PER_RING);
    const ringRadius = RING_0_RADIUS + outerRing * RING_STEP + 28;
    const angle37 = ((37 * 17) % 360) * (Math.PI / 180);
    expect(getElectionGatherTarget(state, 37)).toEqual({
      x: GATHER_X + Math.cos(angle37) * ringRadius,
      y: GATHER_Y + Math.sin(angle37) * ringRadius,
    });
    expect(getElectionGatherTarget(state, 41)).toEqual(legacyGetElectionGatherTarget(state, 41));

    // With no ceremony the site itself is the answer — the branch this pass must not change.
    state.electionCeremony = null;
    expect(getElectionGatherTarget(state, 41)).toEqual(getElectionGatherSite(state));
  });

  it('keeps the ceremony-free and empty-world answers', () => {
    const empty = gatherWorld();
    empty.entities = [];
    expect(eligibleIds(empty)).toEqual([]);
    for (const id of [0, 1, 2, 41, 70]) {
      expect(getElectionGatherTarget(empty, id)).toEqual(legacyGetElectionGatherTarget(empty, id));
    }
  });
});
