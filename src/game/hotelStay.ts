/**
 * Hotel lodging — staffed hotels host up to 4 visitors overnight for gold.
 */
import type { Building, Entity, WorldState } from './gameTypes';
import {
  BuildingType,
  HOTEL_GUEST_CAPACITY,
  HOTEL_NIGHTLY_GOLD,
  JobType,
} from './gameTypes';
import {
  PER_TICK_RATE_SCALE,
  getAbsoluteCalendarDay,
  getHourOfDay,
  isNightHour,
  nextTickAtClockHour,
  personDayRoll,
  NIGHT_END,
} from './dayCycle';
import { addResource } from './resourceUtils';
import { addFloatingText, addNotification } from './simEffects';
import { logEvent } from './eventLog';
import { sayHumanChatPhrase } from './humanChat';
import { gainSkill } from './skills';
import { isPlayerHuman } from './playerHuman';

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
  buildings: readonly Building[],
): Building | undefined {
  if (entity.job !== JobType.Hotelier || entity.homeBuildingId == null) return undefined;
  const h = buildings.find((b) => b.id === entity.homeBuildingId);
  if (!h || h.type !== BuildingType.Hotel || !h.completed) return undefined;
  return h;
}

function guestCount(hotel: Building, entities: readonly Entity[]): number {
  const ids = hotel.hotelGuestIds ?? [];
  let n = 0;
  for (const id of ids) {
    const e = entities.find((x) => x.id === id && x.alive && x.faction === 'visitor');
    if (e) n++;
  }
  return n;
}

function pruneHotelGuests(hotel: Building, entities: readonly Entity[]): void {
  const aliveIds = new Set(
    entities.filter((e) => e.alive && e.faction === 'visitor').map((e) => e.id),
  );
  hotel.hotelGuestIds = (hotel.hotelGuestIds ?? []).filter((id) => aliveIds.has(id));
  for (const e of entities) {
    if (
      e.hotelStayBuildingId === hotel.id
      && (!e.alive || e.faction !== 'visitor' || !(hotel.hotelGuestIds ?? []).includes(e.id))
    ) {
      e.hotelStayBuildingId = undefined;
      e.hotelStayUntilTick = undefined;
    }
  }
}

export function hotelHasVacancy(hotel: Building, entities: readonly Entity[]): boolean {
  pruneHotelGuests(hotel, entities);
  return guestCount(hotel, entities) < HOTEL_GUEST_CAPACITY;
}

/** Pick a staffed hotel with free beds (prefer closest to visitor). */
export function pickHotelForVisitor(
  visitor: Entity,
  buildings: readonly Building[],
  entities: readonly Entity[],
): Building | undefined {
  const hotels = findStaffedHotels(buildings)
    .filter((h) => hotelHasVacancy(h, entities))
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
 * Check a visitor into a hotel for the night. Charges gold once.
 * Returns true if lodging started.
 */
export function checkInVisitor(
  state: WorldState,
  visitor: Entity,
  hotel: Building,
): boolean {
  if (visitor.faction !== 'visitor' || !visitor.alive) return false;
  if (!hotel.completed || hotel.occupants.length === 0) return false;
  pruneHotelGuests(hotel, state.entities);
  if ((hotel.hotelGuestIds ?? []).includes(visitor.id)) {
    // Refresh stay window through next morning
    visitor.hotelStayUntilTick = hotelCheckoutTick(state.tick);
    return true;
  }
  if (guestCount(hotel, state.entities) >= HOTEL_GUEST_CAPACITY) return false;

  hotel.hotelGuestIds = [...(hotel.hotelGuestIds ?? []), visitor.id];
  visitor.hotelStayBuildingId = hotel.id;
  visitor.hotelStayUntilTick = hotelCheckoutTick(state.tick);

  const gold = HOTEL_NIGHTLY_GOLD + Math.min(2, hotel.occupants.length); // better staff → slight premium
  addResource(state, 'gold', gold);
  for (const id of hotel.occupants) {
    gainSkill(state, id, JobType.Hotelier, 0.12);
  }

  addFloatingText(
    state,
    hotel.x + hotel.width / 2,
    hotel.y - 12,
    `+${gold}g lodging`,
    '#fde047',
    'brief',
  );
  if ((visitor.chatTicks ?? 0) <= 0) {
    sayHumanChatPhrase(
      visitor,
      Math.random() < 0.5 ? 'A soft bed…' : 'Room for the night.',
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
  for (const h of hotels) pruneHotelGuests(h, state.entities);

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
    const hotel = pickHotelForVisitor(v, state.buildings, state.entities);
    if (!hotel) continue;
    // Prefer check-in near evening once
    if (hour >= 18 && hour <= 22 && personDayRoll(v.id, state.tick, 911) < 0.35) {
      if (checkInVisitor(state, v, hotel)) nightCheckIns++;
    } else if (isNightHour(hour) && personDayRoll(v.id, state.tick, 912) < 0.5) {
      if (checkInVisitor(state, v, hotel)) nightCheckIns++;
    }
  }

  if (nightCheckIns > 0 && getAbsoluteCalendarDay(state.tick) % 2 === 0) {
    addNotification(
      state,
      'Hotel full of guests',
      `${nightCheckIns} visitor${nightCheckIns > 1 ? 's' : ''} paid for a room`,
      'success',
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
    visitor.vx = (dx / dist) * speed * 0.7;
    visitor.vy = (dy / dist) * speed * 0.7;
    visitor.x += visitor.vx;
    visitor.y += visitor.vy;
    visitor.spriteAngle = Math.atan2(visitor.vy, visitor.vx);
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
  if ((hotelier.chatTicks ?? 0) > 0) return;
  const guests = (hotel.hotelGuestIds ?? []).length;
  if (guests <= 0) return;
  if (personDayRoll(hotelier.id, state.tick, 913) > 0.08) return;
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
    return `Assign Hoteliers — then up to ${HOTEL_GUEST_CAPACITY} visitors can sleep for gold.`;
  }
  const n = guestCount(hotel, entities);
  return `Staffed · ${n}/${HOTEL_GUEST_CAPACITY} guests · ${HOTEL_NIGHTLY_GOLD}+g / night`;
}

/** Optional: settlers can also hang around hotels as free-time POI (not sleeping). */
export function isPlayerNearHotel(entity: Entity, buildings: readonly Building[]): Building | undefined {
  if (!isPlayerHuman(entity)) return undefined;
  return buildings.find(
    (b) =>
      b.completed
      && b.type === BuildingType.Hotel
      && b.faction !== 'rival'
      && Math.hypot(entity.x - (b.x + b.width / 2), entity.y - (b.y + b.height / 2)) < 40,
  );
}
