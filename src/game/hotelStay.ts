/**
 * Hotel lodging — hotels host visitors and, overnight, settlers whose walk home is too long for
 * the hours left before their sleep hour. Lodging is free of charge (the hotelier gains work
 * experience for tending guests; nothing is charged).
 */
import { enterHumanBuilding } from './simulation/humanMovement';
import type { Building, Entity, WorldState } from './gameTypes';
import {
  BuildingType,
  EntityType,
  JobType,
} from './gameTypes';
import {
  PER_TICK_RATE_SCALE,
  getColonyDay,
  getHourOfDay,
  isNightHour,
  isStartOfClockHour,
  nextTickAtClockHour,
  personDayRoll,
  NIGHT_END,
  NIGHT_START,
} from './dayCycle';
import { commuteLeadHoursFor, MAX_ASSIGNABLE_COMMUTE_HOURS } from './commuteReach';
import { isPlayerHuman } from './playerHuman';
import { hasResidenceAssignment } from './residencyOccupancy';
import { SPECIES_CONFIG } from './speciesConfig';
import { addFloatingText, addNotification } from './simEffects';
import { isOnWalkableRoadAt, steerWithPath } from './pathfinding';
import { applyHumanWalkStep } from './simulation/humanMovement';
import { logEvent } from './eventLog';
import { ensureEntityByIdMap } from './entityIndex';
import { isDialogueBusy } from './humanChat';
import { requestDialogue, dialogueHoursFromNominalTicks } from './dialogueTrees';
import { gainSkill } from './skills';
import { seededRandomForRun } from './simRng';
import { faceVelocity, ROAD_SPEED_MULT } from './simulation/movementSteering';
import { isVenueServiceHour } from './venueSchedule';

/** Max sleepers at one staffed hotel overnight; visitors and settlers share beds. */
export const HOTEL_GUEST_CAPACITY = 8;

/** Walk-home time, in hours, below which a settler never looks for a hotel bed. */
export const LODGING_MIN_COMMUTE_HOURS = 1.5;

/** Distance from a reserved hotel bed, in world px, at which a settler can rest. */
export const HOTEL_LODGING_RADIUS_PX = 40;

/** Energy, per in-game hour of rest, restored by a night in a hotel bed. */
export const HOTEL_REST_ENERGY_PER_HOUR = 0.8;

/** Colony day whose lodging summary has already been announced, so one night reports once. */
const HOTEL_LODGING_NOTICE_DAY_FLAG = 'hotel_lodging_notice_day';

/** Species walk speed the nightly lodging reach is measured with. */
const HUMAN_WALK_SPEED = SPECIES_CONFIG[EntityType.Human].speed;

function buildingFrom(
  buildings: readonly Building[] | ReadonlyMap<number, Building>,
  id: number,
): Building | undefined {
  return 'get' in buildings
    ? (buildings as ReadonlyMap<number, Building>).get(id)
    : (buildings as readonly Building[]).find((b) => b.id === id);
}

function centreDistance(entity: Entity, building: Building): number {
  return Math.hypot(
    building.x + building.width / 2 - entity.x,
    building.y + building.height / 2 - entity.y,
  );
}

/** Hours left before the settler must be asleep; zero once the night window is open. */
function hoursUntilSleep(hour: number): number {
  return isNightHour(hour) ? 0 : NIGHT_START - hour;
}

/**
 * A settler's walk home is too long for the hours left before their sleep hour.
 */
export function needsHotelBed(
  entity: Entity,
  buildings: readonly Building[] | ReadonlyMap<number, Building>,
  hour: number,
): boolean {
  if (!entity.alive || !isPlayerHuman(entity) || !hasResidenceAssignment(entity)) return false;
  const home = buildingFrom(buildings, entity.residenceBuildingId!);
  if (!home?.completed) return false;
  const homeHours = commuteLeadHoursFor(centreDistance(entity, home), HUMAN_WALK_SPEED);
  if (homeHours < LODGING_MIN_COMMUTE_HOURS) return false;
  return hoursUntilSleep(hour) < homeHours;
}

/** Completed player hotels this settler could reach tonight and that are no further than home, nearest first. */
export function lodgingHotelsFor(
  entity: Entity,
  buildings: readonly Building[],
  hour: number,
): Building[] {
  if (!needsHotelBed(entity, buildings, hour)) return [];
  const home = buildingFrom(buildings, entity.residenceBuildingId!);
  const homeHours = home
    ? commuteLeadHoursFor(centreDistance(entity, home), HUMAN_WALK_SPEED)
    : 0;
  const hotels: Building[] = [];
  for (const b of buildings) {
    if (!b.completed || b.type !== BuildingType.Hotel || b.faction === 'rival') continue;
    const hours = commuteLeadHoursFor(centreDistance(entity, b), HUMAN_WALK_SPEED);
    if (hours > MAX_ASSIGNABLE_COMMUTE_HOURS || hours > homeHours) continue;
    hotels.push(b);
  }
  hotels.sort((a, b) => centreDistance(entity, a) - centreDistance(entity, b));
  return hotels;
}

/** A living settler's assigned bed, including the walk to the hotel. */
function holdsSettlerHotelBed(entity: Entity, hotelId: number): boolean {
  return entity.alive && isPlayerHuman(entity)
    && entity.hotelStayBuildingId === hotelId && entity.hotelStayUntilTick != null;
}

/** Reserved settler beds, including guests who have not arrived yet. */
export function countHotelSettlerLodgers(hotel: Building, entities: readonly Entity[]): number {
  let lodgers = 0;
  for (const entity of entities) {
    if (holdsSettlerHotelBed(entity, hotel.id)) lodgers++;
  }
  return lodgers;
}

/** Settler reservations per hotel for the visitor capacity check. */
export function buildHotelSettlerLodgerCounts(
  hotels: readonly Building[],
  entities: readonly Entity[],
): Map<number, number> {
  const counts = new Map<number, number>();
  for (const hotel of hotels) counts.set(hotel.id, countHotelSettlerLodgers(hotel, entities));
  return counts;
}

/** True when a settler has arrived at their reserved hotel bed during the night. */
export function isSettlerLodgingAtHotel(
  entity: Entity,
  buildings: readonly Building[],
  hour: number,
): boolean {
  if (!isNightHour(hour) || !needsHotelBed(entity, buildings, hour)) return false;
  for (const b of buildings) {
    if (!b.completed || b.type !== BuildingType.Hotel || b.faction === 'rival') continue;
    if (holdsSettlerHotelBed(entity, b.id) && centreDistance(entity, b) <= HOTEL_LODGING_RADIUS_PX) return true;
  }
  return false;
}

/** Keep or reserve a free bed before the settler starts walking; otherwise walk home. */
export function lodgingHotelFor(
  entity: Entity,
  buildings: readonly Building[],
  entities: readonly Entity[],
  tick: number,
): Building | undefined {
  const hotels = lodgingHotelsFor(entity, buildings, getHourOfDay(tick));
  const reserved = hotels.find((hotel) => holdsSettlerHotelBed(entity, hotel.id));
  if (reserved && tick < entity.hotelStayUntilTick!) return reserved;
  checkoutVisitor(entity);
  for (const hotel of hotels) {
    if (!hotelHasVacancy(hotel, entities)) continue;
    entity.hotelStayBuildingId = hotel.id;
    entity.hotelStayUntilTick = hotelCheckoutTick(tick);
    return hotel;
  }
  return undefined;
}

/** A night of hotel rest restores energy at the same rate for visitors and settling lodgers. */
export function restAtHotel(entity: Entity): void {
  entity.energy = Math.min(entity.maxEnergy, entity.energy + HOTEL_REST_ENERGY_PER_HOUR * PER_TICK_RATE_SCALE);
}

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
  if (entity.job !== JobType.Hotelier || entity.workerBuildingId == null) return undefined;
  const id = entity.workerBuildingId;
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

/** Clear stale visitor pointers while preserving assigned settler beds. */
function repairHotelStayPointers(hotel: Building, entities: readonly Entity[]): void {
  const guests = new Set(hotel.hotelGuestIds ?? []);
  for (const e of entities) {
    if (e.hotelStayBuildingId !== hotel.id || holdsSettlerHotelBed(e, hotel.id)) continue;
    if (!isLiveVisitor(e) || !guests.has(e.id)) {
      e.hotelStayBuildingId = undefined;
      e.hotelStayUntilTick = undefined;
    }
  }
}

/** Repair hotel stay pointers in one entity pass, preserving settler reservations. */
function repairAllHotelStayPointers(state: WorldState, hotels: readonly Building[]): void {
  if (hotels.length === 0) return;
  const guestsByHotel = new Map<number, ReadonlySet<number>>();
  for (const h of hotels) guestsByHotel.set(h.id, new Set(h.hotelGuestIds ?? []));
  for (const e of state.entities) {
    const hotelId = e.hotelStayBuildingId;
    if (hotelId == null) continue;
    const guests = guestsByHotel.get(hotelId);
    if (!guests) continue;
    if (holdsSettlerHotelBed(e, hotelId)) continue;
    if (!isLiveVisitor(e) || !guests.has(e.id)) {
      e.hotelStayBuildingId = undefined;
      e.hotelStayUntilTick = undefined;
    }
  }
}

/**
 * A hotel with a free bed. Drops any guest that is no longer a live visitor, and — because this
 * function is exported and its body repaired the pointers as part of that prune — clears the
 * dropped guests' own `hotelStayBuildingId` in the same call **when the prune actually dropped
 * something**. Inside `tickHotelLodging` the list is already pruned for the whole tick before this
 * runs, so the repair never fires there and the visitor × hotel loop stays O(guests) per hotel.
 *
 * `settlerLodgers` is the derived count of settlers holding beds here tonight
 * (`countHotelSettlerLodgers`). Visitors and settlers share `HOTEL_GUEST_CAPACITY`, so the two
 * counts are added and only the total is compared with the cap.
 */
export function hotelHasVacancy(
  hotel: Building,
  entities: readonly Entity[],
  byId?: HotelGuestIndex,
  settlerLodgers = countHotelSettlerLodgers(hotel, entities),
): boolean {
  const before = (hotel.hotelGuestIds ?? []).length;
  pruneHotelGuests(hotel, entities, byId);
  if ((hotel.hotelGuestIds ?? []).length !== before) repairHotelStayPointers(hotel, entities);
  return guestCount(hotel, entities, byId) + settlerLodgers < HOTEL_GUEST_CAPACITY;
}

/** Pick a staffed hotel with free beds (prefer closest to visitor). */
export function pickHotelForVisitor(
  visitor: Entity,
  buildings: readonly Building[],
  entities: readonly Entity[],
  byId?: HotelGuestIndex,
  settlerLodgersByHotel?: ReadonlyMap<number, number>,
): Building | undefined {
  const hotels = findStaffedHotels(buildings)
    .filter((h) => hotelHasVacancy(h, entities, byId, settlerLodgersByHotel?.get(h.id) ?? countHotelSettlerLodgers(h, entities)))
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
 *
 * `settlerLodgers` is the derived settler count for this hotel; visitors and settlers share
 * `HOTEL_GUEST_CAPACITY`, so a settler's bed is never silently taken by a visitor.
 */
export function checkInVisitor(
  state: WorldState,
  visitor: Entity,
  hotel: Building,
  settlerLodgers = countHotelSettlerLodgers(hotel, state.entities),
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
  if (guestCount(hotel, state.entities, byId) + settlerLodgers >= HOTEL_GUEST_CAPACITY) return false;

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
    requestDialogue({ eventKey: 'hotel.arrival', speaker: visitor, tick: state.tick, durationHours: dialogueHoursFromNominalTicks(50), selectionRoll: seededRandomForRun(`hotel-greeting:${visitor.id}:${state.tick}`) });
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

  // One pass clears expired stays and collects the visitors looking for a room; the checkout must land
  // first, and rooms are only offered while the desk is on shift, so the hotel's own schedule gates it.
  const windowOpen = (isNightHour(hour) || hour >= 18) && isVenueServiceHour(state, 'hotel', hour);
  const visitors: Entity[] = [];
  for (const e of state.entities) {
    if (isPlayerHuman(e) && e.hotelStayBuildingId != null) {
      const hotel = buildingFrom(hotels, e.hotelStayBuildingId);
      if (!e.alive || !hotel || e.hotelStayUntilTick == null
        || e.prisonBuildingId != null || !!e.raidDeploymentId
        || state.tick >= e.hotelStayUntilTick || !needsHotelBed(e, state.buildings, hour)) {
        checkoutVisitor(e);
      }
      continue;
    }
    if (e.faction !== 'visitor') continue;
    if (e.hotelStayBuildingId != null) {
      if (e.hotelStayUntilTick == null || state.tick < e.hotelStayUntilTick) continue;
      checkoutVisitor(e, buildingFrom(state.buildings, e.hotelStayBuildingId));
    }
    if (windowOpen && e.alive) visitors.push(e);
  }

  // Offer rooms at dusk / night when hotels staffed
  const settlerLodgersByHotel = buildHotelSettlerLodgerCounts(hotels, state.entities);
  for (const v of windowOpen ? visitors : []) {
    // Stable chance per visitor per night so not everyone piles in same tick
    if (personDayRoll(v.id, state.tick, 910) > 0.55) continue;
    const hotel = pickHotelForVisitor(v, state.buildings, state.entities, byId, settlerLodgersByHotel);
    if (!hotel) continue;
    const settlerLodgers = settlerLodgersByHotel.get(hotel.id) ?? 0;
    // Prefer check-in near evening once
    if (hour >= 18 && hour <= 22 && personDayRoll(v.id, state.tick, 911) < 0.35) {
      checkInVisitor(state, v, hotel, settlerLodgers);
    } else if (isNightHour(hour) && personDayRoll(v.id, state.tick, 912) < 0.5) {
      checkInVisitor(state, v, hotel, settlerLodgers);
    }
  }

  // A hotel holding every bed, counting the settlers asleep in it, is the threshold; the day stamp
  // makes that one summary per night rather than one per tick.
  const colonyDay = getColonyDay(state);
  const fullHotel = hotels.find(
    (h) =>
      guestCount(h, state.entities, byId) + (settlerLodgersByHotel.get(h.id) ?? 0) >= HOTEL_GUEST_CAPACITY,
  );
  if (fullHotel && (state.storyFlags?.[HOTEL_LODGING_NOTICE_DAY_FLAG] ?? -1) !== colonyDay) {
    state.storyFlags = { ...state.storyFlags, [HOTEL_LODGING_NOTICE_DAY_FLAG]: colonyDay };
    // Report the entire city's occupied beds, not a single hotel's eight-bed cap.
    // Visitors and settlers share beds; use the same counts as room assignment.
    const occupiedBeds = hotels.reduce(
      (total, hotel) => total + guestCount(hotel, state.entities, byId)
        + (settlerLodgersByHotel.get(hotel.id) ?? 0),
      0,
    );
    const totalBeds = hotels.length * HOTEL_GUEST_CAPACITY;
    const fullHotels = hotels.filter(
      (hotel) => guestCount(hotel, state.entities, byId)
        + (settlerLodgersByHotel.get(hotel.id) ?? 0) >= HOTEL_GUEST_CAPACITY,
    ).length;
    const summary = `${occupiedBeds}/${totalBeds} beds occupied across ${hotels.length} hotel${hotels.length === 1 ? '' : 's'} (${fullHotels} full)`;
    addNotification(
      state,
      'Hotel lodging occupancy',
      summary,
      'success',
      { x: fullHotel.x + fullHotel.width / 2, y: fullHotel.y + fullHotel.height / 2 },
    );
    logEvent(state, 'trade', `Hotel lodging: ${summary}`);
  }
}

/** Visitors checked in walk to / rest at the hotel. */
export function steerVisitorToHotel(
  visitor: Entity,
  buildings: readonly Building[],
  speed: number,
): boolean {
  visitor.indoorBuildingId = undefined;
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
    // Route around water/mountains on the camp→hotel walk. Key on the visitor, not the moving
    // position: a position key changes every step, so A* re-ran per tick and the shared cache churned.
    const handled = steerWithPath(visitor, tx, ty, speed * 0.7, `h_${hotel.id}_${visitor.id}`);
    // The hotel owns this visitor's movement step: humanTick must not apply another one.
    // Road route pricing and actual motion both use the same completed-road footprint.
    if (handled === 'path') {
      applyHumanWalkStep(visitor, isOnWalkableRoadAt(visitor.x, visitor.y) ? ROAD_SPEED_MULT : 1);
      return true;
    }
    if (handled === 'blocked') {
      visitor.vx = 0;
      visitor.vy = 0;
      return true;
    }
    if (handled === 'arrived') {
      enterHumanBuilding(visitor, hotel);
      return true;
    }
    visitor.vx = (dx / dist) * speed * 0.7;
    visitor.vy = (dy / dist) * speed * 0.7;
    applyHumanWalkStep(visitor, isOnWalkableRoadAt(visitor.x, visitor.y) ? ROAD_SPEED_MULT : 1);
    faceVelocity(visitor);
  } else {
    visitor.vx = 0;
    visitor.vy = 0;
    enterHumanBuilding(visitor, hotel);
    restAtHotel(visitor);
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
  requestDialogue({ eventKey: guests >= 3 ? 'hotel.service.busy' : 'hotel.service.welcome', speaker: hotelier, tick: state.tick, durationHours: dialogueHoursFromNominalTicks(44) });
}

/** One hotel's roster — a view for the building inspector, derived like the school's. */
export interface HotelRosterEntry {
  hotelId: number;
  /** Visitor guests holding a bed, in check-in order. */
  guests: Entity[];
  /** Settlers with a reserved bed, including those still walking here. */
  lodgers: Entity[];
  /** The clock is inside the night window, so a bed holder is asleep rather than merely checked in. */
  sleepingNow: boolean;
}

/** Bed holders at this hotel, including reserved settlers still on their way. */
export function getHotelRoster(
  hotel: Building,
  _buildings: readonly Building[],
  entities: readonly Entity[],
  hour: number,
): HotelRosterEntry {
  const byId = new Map<number, Entity>();
  for (const e of entities) byId.set(e.id, e);
  const guests = (hotel.hotelGuestIds ?? [])
    .map((id) => byId.get(id))
    .filter((e): e is Entity => isLiveVisitor(e));
  const lodgers = entities.filter((e) => holdsSettlerHotelBed(e, hotel.id));
  return { hotelId: hotel.id, guests, lodgers, sleepingNow: isNightHour(hour) };
}

/** Player-facing summary of a roster — the inspector renders these strings verbatim. */
export function describeHotelRoster(
  entry: HotelRosterEntry,
  hasHotelier: boolean,
): { headline: string; emptyHint: string | null; full: boolean } {
  const beds = entry.guests.length + entry.lodgers.length;
  return {
    headline: `Beds ${beds}/${HOTEL_GUEST_CAPACITY}`,
    emptyHint: beds > 0
      ? null
      : hasHotelier
        ? 'Empty tonight — visitors check in at dusk, and settlers whose walk home outlasts the night sleep free.'
        : 'No hotelier assigned — only a staffed hotel takes guests.',
    full: beds >= HOTEL_GUEST_CAPACITY,
  };
}
