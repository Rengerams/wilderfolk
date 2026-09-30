/**
 * Hotel lodging — staffed hotels host visitors overnight, free of charge (the hotelier gains work
 * experience for tending them; nothing is charged).
 */
import type { Building, Entity, WorldState } from './gameTypes';
import {
  BuildingType,
  HOTEL_GUEST_CAPACITY,
  JobType,
} from './gameTypes';
import {
  PER_TICK_RATE_SCALE,
  getHourOfDay,
  isNightHour,
  isStartOfClockHour,
  nextTickAtClockHour,
  personDayRoll,
  NIGHT_END,
} from './dayCycle';
import { addFloatingText, addNotification } from './simEffects';
import { steerWithPath } from './pathfinding';
import { logEvent } from './eventLog';
import { ensureEntityByIdMap } from './entityIndex';
import { isDialogueBusy, sayHumanChatPhrase } from './humanChat';
import { gainSkill } from './skills';
import { seededRandomForRun } from './simRng';
import { faceVelocity } from './simulation/movementSteering';

export function findStaffedHotels(buildings: readonly Building[]): Building[] {
  return buildings.filter(
    (b) =>
      b.completed
      && b.type === BuildingType.Hotel
      && b.faction !== 'rival'
      && b.occupants.length > 0,
  );
}

export function isHotelierAtHotel(
  entity: Entity,
  buildings: readonly Building[] | ReadonlyMap<number, Building>,
): Building | undefined {
  if (entity.job !== JobType.Hotelier || entity.homeBuildingId == null) return undefined;
  const id = entity.homeBuildingId;
  const h = 'get' in buildings
    ? (buildings as ReadonlyMap<number, Building>).get(id)
    : (buildings as readonly Building[]).find((b) => b.id === id);
  if (!h || h.type !== BuildingType.Hotel || !h.completed) return undefined;
  return h;
}

/**
 * Id → entity for the tick's guest lookups (`entityIndex.ensureEntityByIdMap`), built **once** per
 * `tickHotelLodging` call instead of once per hotel per visitor.
 *
 * The entity array travels alongside it on purpose: a spawn that reached `state.entities` without
 * being indexed is a map miss, and the caller's array stays the authority for it, so every lookup
 * falls back to the linear scan the pre-fix code always performed. Equivalent by construction — the
 * predicate (`alive && faction === 'visitor'`) and the entity objects are the same either way.
 */
export type HotelGuestIndex = ReadonlyMap<number, Entity>;

function findGuest(
  id: number,
  entities: readonly Entity[],
  byId?: HotelGuestIndex,
): Entity | undefined {
  return byId?.get(id) ?? entities.find((x) => x.id === id);
}

function isLiveVisitor(entity: Entity | undefined): boolean {
  return !!entity && entity.alive && entity.faction === 'visitor';
}

function guestCount(hotel: Building, entities: readonly Entity[], byId?: HotelGuestIndex): number {
  const ids = hotel.hotelGuestIds ?? [];
  let n = 0;
  for (const id of ids) {
    if (isLiveVisitor(findGuest(id, entities, byId))) n++;
  }
  return n;
}

/** Drop guests that died or stopped being visitors. List order is preserved, as the old filter did. */
function pruneHotelGuests(
  hotel: Building,
  entities: readonly Entity[],
  byId?: HotelGuestIndex,
): void {
  const guests = hotel.hotelGuestIds ?? [];
  if (guests.length === 0) return;
  const live = guests.filter((id) => isLiveVisitor(findGuest(id, entities, byId)));
  if (live.length !== guests.length) hotel.hotelGuestIds = live;
}

/**
 * Clear `hotelStayBuildingId` on entities whose stay no longer names them a guest of that hotel — the
 * second half of the old `pruneHotelGuests`, split out so a tick can repair every hotel in **one**
 * pass (`repairAllHotelStayPointers`) instead of one full entity scan per hotel.
 */
function repairHotelStayPointers(hotel: Building, entities: readonly Entity[]): void {
  const guests = new Set(hotel.hotelGuestIds ?? []);
  for (const e of entities) {
    if (e.hotelStayBuildingId !== hotel.id) continue;
    if (!isLiveVisitor(e) || !guests.has(e.id)) {
      e.hotelStayBuildingId = undefined;
      e.hotelStayUntilTick = undefined;
    }
  }
}

/**
 * `repairHotelStayPointers` for every hotel the tick owns, in a single pass over `state.entities`.
 *
 * Equivalence with the per-hotel loop it replaces: an entity carries exactly one
 * `hotelStayBuildingId`, so only the pass belonging to *that* hotel could ever clear it, and that pass
 * read only its own (already pruned) guest list plus the entity's own liveness/faction. This pass
 * applies the same three-way predicate against a snapshot of each hotel's pruned list, taken after
 * every prune has run — which is why the prunes all happen first. Pointers to hotels outside `hotels`
 * (demolished, rival, or otherwise absent) are left alone exactly as before; `steerVisitorToHotel`
 * remains the owner that clears those.
 */
function repairAllHotelStayPointers(state: WorldState, hotels: readonly Building[]): void {
  if (hotels.length === 0) return;
  const guestsByHotel = new Map<number, ReadonlySet<number>>();
  for (const h of hotels) guestsByHotel.set(h.id, new Set(h.hotelGuestIds ?? []));
  for (const e of state.entities) {
    const hotelId = e.hotelStayBuildingId;
    if (hotelId == null) continue;
    const guests = guestsByHotel.get(hotelId);
    if (!guests) continue;
    if (!isLiveVisitor(e) || !guests.has(e.id)) {
      e.hotelStayBuildingId = undefined;
      e.hotelStayUntilTick = undefined;
    }
  }
}

/**
 * A hotel with a free bed. Drops any guest that is no longer a live visitor, and — because this
 * function is exported and its pre-N-8 body repaired the pointers as part of that prune — clears the
 * dropped guests' own `hotelStayBuildingId` in the same call **when the prune actually dropped
 * something**. Inside `tickHotelLodging` the list is already pruned for the whole tick before this
 * runs, so the repair never fires there and the visitor × hotel loop stays O(guests) per hotel.
 */
export function hotelHasVacancy(
  hotel: Building,
  entities: readonly Entity[],
  byId?: HotelGuestIndex,
): boolean {
  const before = (hotel.hotelGuestIds ?? []).length;
  pruneHotelGuests(hotel, entities, byId);
  if ((hotel.hotelGuestIds ?? []).length !== before) repairHotelStayPointers(hotel, entities);
  return guestCount(hotel, entities, byId) < HOTEL_GUEST_CAPACITY;
}

/** Pick a staffed hotel with free beds (prefer closest to visitor). */
export function pickHotelForVisitor(
  visitor: Entity,
  buildings: readonly Building[],
  entities: readonly Entity[],
  byId?: HotelGuestIndex,
): Building | undefined {
  const hotels = findStaffedHotels(buildings)
    .filter((h) => hotelHasVacancy(h, entities, byId))
    .sort((a, b) => {
      const da = Math.hypot(visitor.x - a.x, visitor.y - a.y);
      const db = Math.hypot(visitor.x - b.x, visitor.y - b.y);
      return da - db;
    });
  return hotels[0];
}

/**
 * Checkout at next morning ({@link NIGHT_END}:00), not a full calendar day later.
 * Uses {@link nextTickAtClockHour} so day-length constants stay in dayCycle only.
 */
export function hotelCheckoutTick(fromTick: number): number {
  return nextTickAtClockHour(fromTick, NIGHT_END);
}

/**
 * Check a visitor into a hotel for the night. Lodging is free — the hotelier gains work experience
 * for tending guests — so this charges nothing. Returns true if lodging started.
 */
export function checkInVisitor(
  state: WorldState,
  visitor: Entity,
  hotel: Building,
): boolean {
  if (visitor.faction !== 'visitor' || !visitor.alive) return false;
  if (!hotel.completed || hotel.occupants.length === 0) return false;
  // This hotel alone: prune its guest list, then repair the stay pointers that no longer match it.
  // The old `pruneHotelGuests` did both; the tick path now splits the second half out so it can
  // repair every hotel in one pass (`repairAllHotelStayPointers`).
  const byId = ensureEntityByIdMap(state);
  pruneHotelGuests(hotel, state.entities, byId);
  repairHotelStayPointers(hotel, state.entities);
  if ((hotel.hotelGuestIds ?? []).includes(visitor.id)) {
    // Refresh stay window through next morning
    visitor.hotelStayUntilTick = hotelCheckoutTick(state.tick);
    return true;
  }
  if (guestCount(hotel, state.entities, byId) >= HOTEL_GUEST_CAPACITY) return false;

  // Free lodging for now — hoteliers still gain work experience for tending guests.
  hotel.hotelGuestIds = [...(hotel.hotelGuestIds ?? []), visitor.id];
  visitor.hotelStayBuildingId = hotel.id;
  visitor.hotelStayUntilTick = hotelCheckoutTick(state.tick);

  for (const id of hotel.occupants) {
    gainSkill(state, id, JobType.Hotelier, 0.12);
  }

  addFloatingText(
    state,
    hotel.x + hotel.width / 2,
    hotel.y - 12,
    'Guest checked in',
    '#a5f3fc',
    'brief',
  );
  // `isDialogueBusy`, not a raw counter: a guest whose line has ended but whose paired session is
  // still live reads as free to a `chatTicks` test, and the forced line below would abandon that
 // pair.
  if (!isDialogueBusy(visitor)) {
    // A stateless roll keyed on the guest and the tick, matching the chat convention used
    // elsewhere (`humanChat`), so the greeting is reproducible instead of seedless.
    sayHumanChatPhrase(
      visitor,
      seededRandomForRun(`hotel-greeting:${visitor.id}:${state.tick}`) < 0.5
        ? 'A soft bed…'
        : 'Room for the night.',
      50,
    );
  }
  return true;
}

export function checkoutVisitor(visitor: Entity, hotel?: Building): void {
  if (hotel?.hotelGuestIds) {
    hotel.hotelGuestIds = hotel.hotelGuestIds.filter((id) => id !== visitor.id);
  }
  visitor.hotelStayBuildingId = undefined;
  visitor.hotelStayUntilTick = undefined;
}

/** Evening/night: pull free visitors into hotels; daytime: clear expired stays. */
export function tickHotelLodging(state: WorldState): void {
  const hour = getHourOfDay(state.tick);
  const hotels = state.buildings.filter(
    (b) => b.completed && b.type === BuildingType.Hotel && b.faction !== 'rival',
  );
 // One guest index for the whole call: the prune below,
  // `pickHotelForVisitor` and every `checkInVisitor` in the loop used to rebuild an alive-visitor Set
  // and re-scan `state.entities` per hotel per visitor. The pointer repair is one pass for all hotels.
  const byId = ensureEntityByIdMap(state);
  for (const h of hotels) pruneHotelGuests(h, state.entities, byId);
  repairAllHotelStayPointers(state, hotels);

  // Checkout expired
  for (const e of state.entities) {
    if (e.faction !== 'visitor' || e.hotelStayBuildingId == null) continue;
    if (e.hotelStayUntilTick != null && state.tick >= e.hotelStayUntilTick) {
      const hotel = state.buildings.find((b) => b.id === e.hotelStayBuildingId);
      checkoutVisitor(e, hotel);
    }
  }

  // Offer rooms at dusk / night when hotels staffed
  if (!isNightHour(hour) && hour < 18) return;

  const visitors = state.entities.filter(
    (e) => e.alive && e.faction === 'visitor' && e.hotelStayBuildingId == null,
  );
  if (visitors.length === 0) return;

  let nightCheckIns = 0;
  for (const v of visitors) {
    // Stable chance per visitor per night so not everyone piles in same tick
    if (personDayRoll(v.id, state.tick, 910) > 0.55) continue;
    const hotel = pickHotelForVisitor(v, state.buildings, state.entities, byId);
    if (!hotel) continue;
    // Prefer check-in near evening once
    if (hour >= 18 && hour <= 22 && personDayRoll(v.id, state.tick, 911) < 0.35) {
      if (checkInVisitor(state, v, hotel)) nightCheckIns++;
    } else if (isNightHour(hour) && personDayRoll(v.id, state.tick, 912) < 0.5) {
      if (checkInVisitor(state, v, hotel)) nightCheckIns++;
    }
  }

  // Notify only when at least one hotel's worth of guests checked in — otherwise
  // a nightly "Hotel full of guests" toast would fire for a single guest.
  if (nightCheckIns >= HOTEL_GUEST_CAPACITY) {
    const firstHotel = hotels[0];
    addNotification(
      state,
      'Hotel full of guests',
      `${nightCheckIns} visitors rested at the hotel`,
      'success',
      firstHotel ? { x: firstHotel.x + firstHotel.width / 2, y: firstHotel.y + firstHotel.height / 2 } : undefined,
    );
    logEvent(state, 'trade', `Hotel lodging: ${nightCheckIns} guest(s) checked in`);
  }
}

/** Visitors checked in walk to / rest at the hotel. */
export function steerVisitorToHotel(
  visitor: Entity,
  buildings: readonly Building[],
  speed: number,
): boolean {
  if (visitor.hotelStayBuildingId == null) return false;
  const hotel = buildings.find((b) => b.id === visitor.hotelStayBuildingId);
  if (!hotel?.completed) {
    checkoutVisitor(visitor);
    return false;
  }
  const tx = hotel.x + hotel.width / 2 + ((visitor.id % 5) - 2) * 8;
  const ty = hotel.y + hotel.height * 0.9;
  const dx = tx - visitor.x;
  const dy = ty - visitor.y;
  const dist = Math.hypot(dx, dy) || 1;
  if (dist > 14) {
    // Route around water/mountains on the camp→hotel walk.
    // BUG-8: include origin so different visitors don't reuse one cached path.
    const handled = steerWithPath(visitor, tx, ty, speed * 0.7, `h_${hotel.id}_${Math.round(visitor.x)}_${Math.round(visitor.y)}`);
    // 'path' only sets the velocity — the stepper never moves an entity, so the walk applies this
    // tick's step here (exactly once).
    if (handled === 'path') {
      visitor.x += visitor.vx;
      visitor.y += visitor.vy;
      return true;
    }
    if (handled === 'arrived') return true;
    visitor.vx = (dx / dist) * speed * 0.7;
    visitor.vy = (dy / dist) * speed * 0.7;
    visitor.x += visitor.vx;
    visitor.y += visitor.vy;
    faceVelocity(visitor);
  } else {
    visitor.vx = 0;
    visitor.vy = 0;
    // Rest — recover energy while lodging (scaled for multi-tick hours)
    visitor.energy = Math.min(visitor.maxEnergy, visitor.energy + 0.8 * PER_TICK_RATE_SCALE);
  }
  return true;
}

/** Day-shift hotelier banter when guests are present. */
export function hotelierGreetGuests(
  state: WorldState,
  hotelier: Entity,
  hotel: Building,
): void {
  if (isDialogueBusy(hotelier)) return;
  const guests = (hotel.hotelGuestIds ?? []).length;
  if (guests <= 0) return;
  // Once per clock hour — not every sub-hour tick (avoids greeting spam after day stretch)
  if (!isStartOfClockHour(state.tick)) return;
  if (personDayRoll(hotelier.id, state.tick, 913 + getHourOfDay(state.tick)) > 0.35) return;
  sayHumanChatPhrase(
    hotelier,
    guests >= 3 ? 'Busy night — rooms nearly full.' : 'Welcome, traveler.',
    44,
  );
}

export function describeHotelStatus(
  hotel: Building,
  entities: readonly Entity[],
): string {
  if (!hotel.completed) return 'Under construction';
  if (hotel.occupants.length === 0) {
    return `Assign Hoteliers — then up to ${HOTEL_GUEST_CAPACITY} visitors can rest here.`;
  }
  const n = guestCount(hotel, entities);
  return `Staffed · ${n}/${HOTEL_GUEST_CAPACITY} guests · free lodging`;
}
