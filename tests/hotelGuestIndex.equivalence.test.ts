/**
 * `tickHotelLodging` builds the entity-by-id map once and repairs all hotel stay pointers in one pass;
 * this differential pins that index against the reference per-hotel prune-and-repair below.
 */
import { describe, expect, it } from 'vitest';
import { BuildingType, EntityType } from '../src/game/gameTypes';
import { HOTEL_GUEST_CAPACITY } from '../src/game/hotelStay';
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
 * Reference implementation, not production code: per hotel, rebuild the alive-visitor id set, filter
 * the guest list with it, then rescan every entity to clear stay pointers that no longer match.
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
 * A fresh fixture per call, so the differential compares two independent worlds: the start tick is
 * neither night nor past 18:00, and every stay is far away, so only the prune and repair run.
 */
function makeFixture(): WorldState {
  const state = initGame({ skipTerrain: true });
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
    // Exported contract: a guest this call drops must also lose its stay pointer.
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
    // Full at the owner's own capacity, whatever it is: the point is where the count comes from,
    // not the number of beds.
    const guestIds = Array.from({ length: HOTEL_GUEST_CAPACITY }, (_, index) => 30 + index);
    const full = initGame({ skipTerrain: true });
    const guests = guestIds.map((id) => visitorEntity(id, { hotelStayBuildingId: HOTEL_A }));
    full.entities = guests;
    full.buildings = [hotel(HOTEL_A, { occupants: [999], hotelGuestIds: [...guestIds] })];
    invalidateEntityByIdMap(full);

    const byId = ensureEntityByIdMap(full);
    expect(hotelHasVacancy(full.buildings[0], full.entities, byId)).toBe(false);

    // Simulate a spawn that reached `state.entities` without being indexed: the map is now missing a
    // live guest. Counting from the map alone would read one short and report a vacancy that is not there.
    byId.delete(guestIds[guestIds.length - 1]);
    expect(hotelHasVacancy(full.buildings[0], full.entities, byId)).toBe(false);
  });
});
