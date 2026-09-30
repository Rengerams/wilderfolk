/**
 * N-8 / OPEN-5 (`src/game/hotelStay.ts`) — the per-tick hotel guest index, pinned as a differential.
 *
 * `tickHotelLodging` used to rebuild an alive-visitor `Set` and re-scan every entity once per hotel,
 * and then again for every (visitor × hotel) pair inside `pickHotelForVisitor` — O(visitors × hotels ×
 * entities) every tick. It now builds `entityIndex.ensureEntityByIdMap` **once** for the call and
 * repairs all stay pointers in a single pass over `state.entities`. The 2026-09-20 campaign recorded
 * this row as OPEN-5 rather than shipping it, on the explicit ground that *"shipping unverified
 * memoisation into the tick would be worse than a recorded OPEN"* — so this file supplies the missing
 * verification:
 *
 *   1. the pre-fix prune + pointer repair is kept below **verbatim** as
 *      {@link referencePruneAndRepair}, and the two worlds are then compared field by field;
 *   2. the expected guest lists and pointers are pinned literally, so the file cannot pass merely by
 *      agreeing with itself;
 *   3. the edges the predicate hides are covered: a dead guest, a guest that stopped being a visitor,
 *      a guest id with no entity at all, a pointer to a hotel that is not in the tick's list
 *      (incomplete / demolished), a completed-but-unstaffed hotel, and the map-miss fallback that is
 *      what makes the index safe to use.
 *
 * **Why the single pointer pass is equivalent to the per-hotel one.** An entity carries exactly one
 * `hotelStayBuildingId`, so only the pass belonging to *that* hotel could ever clear it, and such a
 * pass read only its own (already pruned) guest list plus that entity's own liveness/faction. The
 * union pass applies the same three-way predicate to each hotel's already-pruned list, which is why
 * every prune runs before the repair. The old interleaving (prune A, repair A, prune B, repair B, …)
 * and the new one (prune A, prune B, repair all) therefore reach the same state: no repair ever read
 * another hotel's list, and the mutation is idempotent.
 */
import { describe, expect, it } from 'vitest';
import { BuildingType, EntityType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { createBuilding, initGame } from '../src/game/worldGen';
import { createEntity } from '../src/game/entityFactory';
import {
  checkInVisitor,
  hotelHasVacancy,
  tickHotelLodging,
} from '../src/game/hotelStay';
import { ensureEntityByIdMap, invalidateEntityByIdMap } from '../src/game/entityIndex';

const HOTEL_A = 100;
const HOTEL_B = 101;
const HOTEL_UNDER_CONSTRUCTION = 102;
const HOTEL_UNSTAFFED = 104;

/** Guest ids used by the fixture, with the reason each exists. */
const GUEST_LIVE = 1;
const GUEST_DEAD = 2;
const GUEST_SETTLER = 3;
const POINTS_AT_A_WITHOUT_BEING_A_GUEST = 4;
const GUEST_LIVE_B = 5;
const GUEST_DEAD_B = 6;
const POINTS_AT_MISSING_HOTEL = 7;
const GUEST_OF_UNBUILT_HOTEL = 8;
const GUEST_DEAD_UNSTAFFED = 10;
/** In every guest list, backed by no entity at all. */
const GUEST_MISSING_ENTITY = 777;
/** No such building — the "demolished hotel" pointer. */
const MISSING_HOTEL = 999;

const THEIR_TICK_IS_FAR_AWAY = 100_000;

/**
 * REFERENCE IMPLEMENTATION — the pre-N-8 `tickHotelLodging` prune loop, verbatim: per hotel, rebuild
 * the alive-visitor id set, filter the guest list with it, then rescan every entity to clear the stay
 * pointers that no longer match. Not production code; it exists only to be diffed against the owner.
 */
function referencePruneAndRepair(state: WorldState): void {
  const hotels = state.buildings.filter(
    (b) => b.completed && b.type === BuildingType.Hotel && b.faction !== 'rival',
  );
  for (const h of hotels) {
    const aliveIds = new Set(
      state.entities.filter((e) => e.alive && e.faction === 'visitor').map((e) => e.id),
    );
    h.hotelGuestIds = (h.hotelGuestIds ?? []).filter((id) => aliveIds.has(id));
    for (const e of state.entities) {
      if (
        e.hotelStayBuildingId === h.id
        && (!e.alive || e.faction !== 'visitor' || !(h.hotelGuestIds ?? []).includes(e.id))
      ) {
        e.hotelStayBuildingId = undefined;
        e.hotelStayUntilTick = undefined;
      }
    }
  }
}

function hotel(id: number, overrides: Partial<Building> = {}): Building {
  const building = createBuilding(BuildingType.Hotel, 200 + id, 200 + id, id);
  Object.assign(building, { completed: true }, overrides);
  return building;
}

function visitorEntity(id: number, overrides: Partial<Entity> = {}): Entity {
  const entity = createEntity(EntityType.Human, 300 + id, 300, id);
  Object.assign(entity, {
    faction: 'visitor',
    hotelStayUntilTick: THEIR_TICK_IS_FAR_AWAY,
  }, overrides);
  return entity;
}

/** A player settler, never a guest: the hotel's staffer and the negative control for the predicate. */
function settlerEntity(id: number): Entity {
  return createEntity(EntityType.Human, 300 + id, 300, id);
}

/**
 * A fresh fixture per call, so the differential compares two independent worlds. `tickHotelLodging`
 * runs at the world's start tick (08:00), which is neither night nor past 18:00, so it prunes, runs
 * the checkout branch and returns — and every stay is far in the future, so checkout is a no-op and
 * the comparison isolates the prune + repair under test.
 */
function makeFixture(): WorldState {
  const state = initGame();
  const entities: Entity[] = [
    visitorEntity(GUEST_LIVE, { hotelStayBuildingId: HOTEL_A }),
    visitorEntity(GUEST_DEAD, { alive: false, hotelStayBuildingId: HOTEL_A }),
    // A player settler who somehow sits in a guest list: not a visitor, so not a guest.
    visitorEntity(GUEST_SETTLER, { faction: undefined, hotelStayBuildingId: HOTEL_A }),
    // Points at A but is not on A's list — the repair's third clause.
    visitorEntity(POINTS_AT_A_WITHOUT_BEING_A_GUEST, { hotelStayBuildingId: HOTEL_A }),
    visitorEntity(GUEST_LIVE_B, { hotelStayBuildingId: HOTEL_B }),
    visitorEntity(GUEST_DEAD_B, { alive: false, hotelStayBuildingId: HOTEL_B }),
    // A pointer to a hotel that does not exist: left alone by this owner (steerVisitorToHotel clears it).
    visitorEntity(POINTS_AT_MISSING_HOTEL, { hotelStayBuildingId: MISSING_HOTEL }),
    // A guest of a hotel the tick's list does not contain: nothing may touch either side.
    visitorEntity(GUEST_OF_UNBUILT_HOTEL, { hotelStayBuildingId: HOTEL_UNDER_CONSTRUCTION }),
    visitorEntity(GUEST_DEAD_UNSTAFFED, { alive: false, hotelStayBuildingId: HOTEL_UNSTAFFED }),
    settlerEntity(20),
  ];

  state.entities = entities;
  state.buildings = [
    hotel(HOTEL_A, {
      occupants: [20],
      hotelGuestIds: [GUEST_LIVE, GUEST_DEAD, GUEST_SETTLER, GUEST_MISSING_ENTITY],
    }),
    hotel(HOTEL_B, { occupants: [20], hotelGuestIds: [GUEST_LIVE_B, GUEST_DEAD_B] }),
    // Under construction: not a hotel this pass owns.
    hotel(HOTEL_UNDER_CONSTRUCTION, { completed: false, hotelGuestIds: [GUEST_OF_UNBUILT_HOTEL] }),
    // Completed but nobody staffs it: the prune still covers it (the tick's list has no staffing test).
    hotel(HOTEL_UNSTAFFED, { occupants: [], hotelGuestIds: [GUEST_DEAD_UNSTAFFED] }),
  ];
  // The fixture replaced `entities` wholesale, so the canonical id map must be rebuilt from it.
  invalidateEntityByIdMap(state);
  return state;
}

function guestsOf(state: WorldState, hotelId: number): readonly number[] | null {
  return state.buildings.find((b) => b.id === hotelId)?.hotelGuestIds ?? null;
}

function stayOf(state: WorldState, entityId: number): [number | null, number | null] | null {
  const entity = state.entities.find((e) => e.id === entityId);
  if (!entity) return null;
  return [entity.hotelStayBuildingId ?? null, entity.hotelStayUntilTick ?? null];
}

/** Every guest list and every stay pointer the fixture can move. */
function snapshot(state: WorldState) {
  return {
    guests: [
      guestsOf(state, HOTEL_A),
      guestsOf(state, HOTEL_B),
      guestsOf(state, HOTEL_UNDER_CONSTRUCTION),
      guestsOf(state, HOTEL_UNSTAFFED),
    ],
    stays: [1, 2, 3, 4, 5, 6, 7, 8, 10, 20].map((id) => stayOf(state, id)),
  };
}

describe('hotel guest index (N-8) is equivalent to the per-hotel rescan it replaces', () => {
  it('prunes and repairs exactly as the pre-fix loop did, with the expected state pinned', () => {
    const real = makeFixture();
    const reference = makeFixture();

    // Fixture premise: the prune and the repair both have work to do, so neither half can pass vacuously.
    expect(guestsOf(real, HOTEL_A)).toEqual([
      GUEST_LIVE,
      GUEST_DEAD,
      GUEST_SETTLER,
      GUEST_MISSING_ENTITY,
    ]);
    expect(stayOf(real, POINTS_AT_A_WITHOUT_BEING_A_GUEST)).toEqual([
      HOTEL_A,
      THEIR_TICK_IS_FAR_AWAY,
    ]);

    tickHotelLodging(real);
    referencePruneAndRepair(reference);

    expect(snapshot(real)).toEqual(snapshot(reference));
    expect(snapshot(real)).toEqual({
      guests: [
        // The live guest survives; the dead one, the settler and the entity-less id are gone.
        [GUEST_LIVE],
        [GUEST_LIVE_B],
        // Not in the tick's list: untouched on both sides.
        [GUEST_OF_UNBUILT_HOTEL],
        // Completed but unstaffed is still pruned.
        [],
      ],
      stays: [
        [HOTEL_A, THEIR_TICK_IS_FAR_AWAY], // live guest, keeps the pointer
        [null, null], // dead guest
        [null, null], // settler who was listed as a guest
        [null, null], // pointed at A without being on A's list
        [HOTEL_B, THEIR_TICK_IS_FAR_AWAY],
        [null, null],
        [MISSING_HOTEL, THEIR_TICK_IS_FAR_AWAY], // not this owner's pointer to clear
        [HOTEL_UNDER_CONSTRUCTION, THEIR_TICK_IS_FAR_AWAY], // hotel absent from the list
        [null, null],
        [null, null], // the staffer, who was never a guest
      ],
    });
  });

  it('gate: a prune-only implementation would leave the fixture visibly different', () => {
    // Guards the differential above: if the repair half were dropped, `snapshot` must change. This is
    // what makes the equality assertion in the previous case non-vacuous.
    const pruneOnly = makeFixture();
    for (const building of pruneOnly.buildings) {
      if (!building.completed || building.type !== BuildingType.Hotel) continue;
      building.hotelGuestIds = (building.hotelGuestIds ?? []).filter((id) =>
        pruneOnly.entities.some((e) => e.id === id && e.alive && e.faction === 'visitor'),
      );
    }
    expect(snapshot(pruneOnly)).not.toEqual(snapshot(makeFixture()));
  });

  it('checkInVisitor prunes and repairs its own hotel, keeping list order and appending the guest', () => {
    const state = makeFixture();
    const hall = state.buildings.find((b) => b.id === HOTEL_A)!;
    const newcomer = visitorEntity(30);

    expect(checkInVisitor(state, newcomer, hall)).toBe(true);

    expect(guestsOf(state, HOTEL_A)).toEqual([GUEST_LIVE, 30]);
    expect(stayOf(state, GUEST_DEAD)).toEqual([null, null]);
    expect(newcomer.hotelStayBuildingId).toBe(HOTEL_A);
    expect(newcomer.hotelStayUntilTick).not.toBeNull();
    // Hotels this call was not asked about are untouched.
    expect(guestsOf(state, HOTEL_B)).toEqual([GUEST_LIVE_B, GUEST_DEAD_B]);
  });
});

describe('the indexed lookups answer what the entity scans answered', () => {
  it('hotelHasVacancy is the same with and without the index', () => {
    const scanned = makeFixture();
    const indexed = makeFixture();
    const scannedHall = scanned.buildings.find((b) => b.id === HOTEL_A)!;
    const indexedHall = indexed.buildings.find((b) => b.id === HOTEL_A)!;

    const scanAnswer = hotelHasVacancy(scannedHall, scanned.entities);
    const indexAnswer = hotelHasVacancy(indexedHall, indexed.entities, ensureEntityByIdMap(indexed));

    expect(indexAnswer).toBe(scanAnswer);
    expect(indexAnswer).toBe(true); // one live guest of four slots, after the prunes
  });

  it('hotelHasVacancy keeps the exported contract: a guest it drops loses its stay pointer', () => {
    // The pre-N-8 body repaired pointers as part of its prune, and this function is exported, so the
    // drop-and-repair pair has to stay together when a caller other than the tick asks directly.
    const state = makeFixture();
    const hall = state.buildings.find((b) => b.id === HOTEL_A)!;

    expect(stayOf(state, GUEST_DEAD)).toEqual([HOTEL_A, THEIR_TICK_IS_FAR_AWAY]);
    expect(hotelHasVacancy(hall, state.entities, ensureEntityByIdMap(state))).toBe(true);

    expect(guestsOf(state, HOTEL_A)).toEqual([GUEST_LIVE]);
    expect(stayOf(state, GUEST_DEAD)).toEqual([null, null]);
    // Only that hotel: B's dead guest is not this call's to prune.
    expect(guestsOf(state, HOTEL_B)).toEqual([GUEST_LIVE_B, GUEST_DEAD_B]);
  });

  it('a guest missing from the id map still counts — the fallback the index depends on', () => {
    const full = initGame();
    const guests = [30, 31, 32, 33].map((id) => visitorEntity(id, { hotelStayBuildingId: HOTEL_A }));
    full.entities = guests;
    full.buildings = [hotel(HOTEL_A, { occupants: [999], hotelGuestIds: [30, 31, 32, 33] })];
    invalidateEntityByIdMap(full);

    const byId = ensureEntityByIdMap(full);
    expect(hotelHasVacancy(full.buildings[0], full.entities, byId)).toBe(false);

    // Simulate a spawn that reached `state.entities` without being indexed: the map is now missing a
    // live guest. Counting from the map alone would read 3/4 and report a vacancy that does not exist.
    byId.delete(33);
    expect(hotelHasVacancy(full.buildings[0], full.entities, byId)).toBe(false);
  });
});
