/**
 * Hotel lodging — settlers whose walk home is too long can reserve an overnight bed.
 */
import type { Building, Entity, WorldState } from './gameTypes';
import {
  BuildingType,
  EntityType,
  JobType,
} from './gameTypes';
import {
  getColonyDay,
  getHourOfDay,
  isNightHour,
  isStartOfClockHour,
  nextTickAtClockHour,
  NIGHT_END,
  NIGHT_START,
} from './dayCycle';
import { commuteLeadHoursFor, MAX_ASSIGNABLE_COMMUTE_HOURS } from './commuteReach';
import { isPlayerHuman } from './playerHuman';
import { hasResidenceAssignment } from './housingModel';
import { SPECIES_CONFIG } from './speciesConfig';
import { addNotification } from './simEffects';
import { logEvent } from './eventLog';
import { isDialogueBusy } from './humanChat';
import { requestDialogue, dialogueHoursFromNominalTicks } from './dialogueTrees';
import { personDayRoll } from './simRng';

/** Max settler beds at one staffed hotel overnight. */
export const HOTEL_GUEST_CAPACITY = 8;

/** Walk-home time, in hours, below which a settler never looks for a hotel bed. */
const LODGING_MIN_COMMUTE_HOURS = 1.5;

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

/** A completed player hotel the settler could still reach tonight. */
function isReachableHotel(entity: Entity, hotel: Building, homeHours: number): boolean {
  if (!hotel.completed || hotel.type !== BuildingType.Hotel) return false;
  const hours = commuteLeadHoursFor(centreDistance(entity, hotel), HUMAN_WALK_SPEED);
  return hours <= MAX_ASSIGNABLE_COMMUTE_HOURS && hours <= homeHours;
}

/**
 * The one hotel staffing gate: a completed player hotel with a hotelier posted takes guests, so an
 * unstaffed building cannot accept new settler reservations.
 */
export function isStaffedHotel(building: Building): boolean {
  return building.completed
    && building.type === BuildingType.Hotel
    && building.occupants.length > 0;
}

/** Staffed player hotels this settler could reach tonight and that are no further than home, nearest first. */
function lodgingHotelsFor(
  entity: Entity,
  buildings: readonly Building[],
  hour: number,
  options?: { hotels?: readonly Building[]; buildingsById?: ReadonlyMap<number, Building> },
): Building[] {
  const buildingsForHome = options?.buildingsById ?? buildings;
  if (!needsHotelBed(entity, buildingsForHome, hour)) return [];
  const home = buildingFrom(buildingsForHome, entity.residenceBuildingId!);
  const homeHours = home
    ? commuteLeadHoursFor(centreDistance(entity, home), HUMAN_WALK_SPEED)
    : 0;
  const hotels: Building[] = [];
  for (const b of options?.hotels ?? buildings) {
    if (!isReachableHotel(entity, b, homeHours) || !isStaffedHotel(b)) continue;
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

/** Settler reservations per hotel for the capacity check. */
function buildHotelSettlerLodgerCounts(
  hotels: readonly Building[],
  entities: readonly Entity[],
): Map<number, number> {
  const counts = new Map<number, number>();
  for (const hotel of hotels) counts.set(hotel.id, countHotelSettlerLodgers(hotel, entities));
  return counts;
}

/** Per-tick hotel list and settler-bed counts, so a lodging check never rescans every entity. */
export interface HotelLodgingIndex {
  readonly hotels: readonly Building[];
  readonly buildingsById?: ReadonlyMap<number, Building>;
  settlerLodgers(hotelId: number): number;
  reserve(hotelId: number): void;
  release(hotelId: number): void;
}

/** Build once per tick; the hotel scan and bed counts are derived on first use. */
export function createHotelLodgingIndex(
  buildings: readonly Building[],
  entities: readonly Entity[],
  buildingsById?: ReadonlyMap<number, Building>,
): HotelLodgingIndex {
  let hotels: Building[] | null = null;
  const ensureHotels = (): Building[] => {
    if (!hotels) {
      hotels = [];
      for (const b of buildings) {
        if (!b.completed || b.type !== BuildingType.Hotel) continue;
        hotels.push(b);
      }
    }
    return hotels;
  };
  let counts: Map<number, number> | null = null;
  const ensureCounts = (): Map<number, number> => {
    counts ??= buildHotelSettlerLodgerCounts(ensureHotels(), entities);
    return counts;
  };
  return {
    get hotels() {
      return ensureHotels();
    },
    buildingsById,
    settlerLodgers: (hotelId) => ensureCounts().get(hotelId) ?? 0,
    reserve: (hotelId) => {
      const byHotel = ensureCounts();
      byHotel.set(hotelId, (byHotel.get(hotelId) ?? 0) + 1);
    },
    release: (hotelId) => {
      const byHotel = ensureCounts();
      byHotel.set(hotelId, Math.max(0, (byHotel.get(hotelId) ?? 0) - 1));
    },
  };
}

/** True when a settler has arrived at their reserved hotel bed during the night. */
export function isSettlerLodgingAtHotel(
  entity: Entity,
  buildings: readonly Building[] | ReadonlyMap<number, Building>,
  hour: number,
  indoorBuildingId = entity.indoorBuildingId,
): boolean {
  if (!isNightHour(hour) || indoorBuildingId == null ||
      !holdsSettlerHotelBed(entity, indoorBuildingId) || !needsHotelBed(entity, buildings, hour)) return false;
  const hotel = buildingFrom(buildings, indoorBuildingId);
  return hotel?.completed === true && hotel.type === BuildingType.Hotel;
}

/** Keep or reserve a free bed before the settler starts walking; otherwise walk home. */
export function lodgingHotelFor(
  entity: Entity,
  buildings: readonly Building[],
  entities: readonly Entity[],
  tick: number,
  index?: HotelLodgingIndex,
): Building | undefined {
  const hour = getHourOfDay(tick);
  const buildingsForHome = index?.buildingsById ?? buildings;
  const previousHotelId = entity.hotelStayBuildingId;
  if (!needsHotelBed(entity, buildingsForHome, hour)) {
    if (previousHotelId != null) {
      index?.release(previousHotelId);
      checkoutHotelLodger(entity);
    }
    return undefined;
  }

  // A settler already holding a valid bed keeps it without scanning the hotel list every tick.
  if (previousHotelId != null && entity.hotelStayUntilTick != null && tick < entity.hotelStayUntilTick) {
    const reserved = index?.buildingsById?.get(previousHotelId)
      ?? buildings.find((b) => b.id === previousHotelId);
    const home = buildingFrom(buildingsForHome, entity.residenceBuildingId!);
    const homeHours = home
      ? commuteLeadHoursFor(centreDistance(entity, home), HUMAN_WALK_SPEED)
      : 0;
    if (reserved && holdsSettlerHotelBed(entity, reserved.id) && isReachableHotel(entity, reserved, homeHours)) {
      return reserved;
    }
  }

  const hotels = lodgingHotelsFor(
    entity,
    buildings,
    hour,
    index ? { hotels: index.hotels, buildingsById: index.buildingsById } : undefined,
  );
  checkoutHotelLodger(entity);
  if (previousHotelId != null) index?.release(previousHotelId);
  for (const hotel of hotels) {
    const settlerLodgers = index
      ? index.settlerLodgers(hotel.id)
      : countHotelSettlerLodgers(hotel, entities);
    if (!hotelHasVacancy(hotel, entities, settlerLodgers)) continue;
    entity.hotelStayBuildingId = hotel.id;
    entity.hotelStayUntilTick = hotelCheckoutTick(tick);
    index?.reserve(hotel.id);
    return hotel;
  }
  return undefined;
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

/** Free-bed decision shared by direct and indexed reservation callers. */
function hotelHasVacancy(
  hotel: Building,
  entities: readonly Entity[],
  settlerLodgers = countHotelSettlerLodgers(hotel, entities),
): boolean {
  return settlerLodgers < HOTEL_GUEST_CAPACITY;
}

/**
 * Checkout at next morning ({@link NIGHT_END}:00), not a full calendar day later.
 * Uses {@link nextTickAtClockHour} so day-length constants stay in dayCycle only.
 */
export function hotelCheckoutTick(fromTick: number): number {
  return nextTickAtClockHour(fromTick, NIGHT_END);
}

export function checkoutHotelLodger(entity: Entity): void {
  entity.hotelStayBuildingId = undefined;
  entity.hotelStayUntilTick = undefined;
}

/** Release expired or invalid reservations and report citywide bed occupancy. */
export function tickHotelLodging(state: WorldState): void {
  const hour = getHourOfDay(state.tick);
  const hotels = state.buildings.filter(
    (b) => b.completed && b.type === BuildingType.Hotel,
  );
  const byId = new Map(state.buildings.map((b) => [b.id, b]));
  // Retired visitor rosters may survive in old save data; never count or recreate them.
  for (const building of state.buildings) {
    if (building.hotelGuestIds?.length) building.hotelGuestIds = undefined;
  }
  for (const entity of state.entities) {
    if (entity.hotelStayBuildingId == null) continue;
    const hotel = byId.get(entity.hotelStayBuildingId);
    if (!isPlayerHuman(entity) || !entity.alive || !hotel?.completed || hotel.type !== BuildingType.Hotel
      || entity.hotelStayUntilTick == null || entity.prisonBuildingId != null || !!entity.raidDeploymentId
      || state.tick >= entity.hotelStayUntilTick || !needsHotelBed(entity, byId, hour)) {
      checkoutHotelLodger(entity);
    }
  }
  const settlerLodgersByHotel = buildHotelSettlerLodgerCounts(hotels, state.entities);

  // A hotel holding every bed, counting the settlers asleep in it, is the threshold; the day stamp
  // makes that one summary per night rather than one per tick.
  const colonyDay = getColonyDay(state);
  const fullHotel = hotels.find(
    (h) =>
      (settlerLodgersByHotel.get(h.id) ?? 0) >= HOTEL_GUEST_CAPACITY,
  );
  if (fullHotel && (state.storyFlags?.[HOTEL_LODGING_NOTICE_DAY_FLAG] ?? -1) !== colonyDay) {
    state.storyFlags = { ...state.storyFlags, [HOTEL_LODGING_NOTICE_DAY_FLAG]: colonyDay };
    // Report the entire city's occupied beds, not a single hotel's eight-bed cap.
    const occupiedBeds = hotels.reduce(
      (total, hotel) => total + (settlerLodgersByHotel.get(hotel.id) ?? 0),
      0,
    );
    const totalBeds = hotels.length * HOTEL_GUEST_CAPACITY;
    const fullHotels = hotels.filter(
      (hotel) => (settlerLodgersByHotel.get(hotel.id) ?? 0) >= HOTEL_GUEST_CAPACITY,
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

/** Day-shift hotelier banter when guests are present. */
export function hotelierGreetGuests(
  state: WorldState,
  hotelier: Entity,
  hotel: Building,
): void {
  if (isDialogueBusy(hotelier)) return;
  // Once per clock hour — not every sub-hour tick.
  if (!isStartOfClockHour(state.tick)) return;
  const guests = state.entities.filter((e) => holdsSettlerHotelBed(e, hotel.id) && e.indoorBuildingId === hotel.id).length;
  if (guests <= 0) return;
  if (personDayRoll(hotelier.id, state.tick, 913 + getHourOfDay(state.tick)) > 0.35) return;
  requestDialogue({ eventKey: guests >= 3 ? 'hotel.service.busy' : 'hotel.service.welcome', speaker: hotelier, tick: state.tick, durationHours: dialogueHoursFromNominalTicks(44) });
}

/** One hotel's roster — a view for the building inspector, derived like the school's. */
export interface HotelRosterEntry {
  hotelId: number;
  /** Settlers with a reserved bed, including those still walking here. */
  lodgers: Entity[];
}

/** Bed holders at this hotel, including reserved settlers still on their way. */
export function getHotelRoster(
  hotel: Building,
  entities: readonly Entity[],
): HotelRosterEntry {
  const lodgers = entities.filter((e) => holdsSettlerHotelBed(e, hotel.id));
  return { hotelId: hotel.id, lodgers };
}

/** Player-facing summary of a roster — the inspector renders these strings verbatim. */
export function describeHotelRoster(
  entry: HotelRosterEntry,
  hasHotelier: boolean,
): { headline: string; emptyHint: string | null; full: boolean } {
  const beds = entry.lodgers.length;
  return {
    headline: `Beds ${beds}/${HOTEL_GUEST_CAPACITY}`,
    emptyHint: beds > 0
      ? null
      : hasHotelier
        ? 'Empty tonight — settlers whose walk home outlasts the night sleep free.'
        : 'No hotelier assigned — only a staffed hotel takes guests.',
    full: beds >= HOTEL_GUEST_CAPACITY,
  };
}
