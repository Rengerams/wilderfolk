import type { Building, Entity, WorldState } from './gameTypes';
import { JobType } from './gameTypes';
import { personDayRoll, PER_TICK_RATE_SCALE } from './dayCycle';
import { isPlayerHuman } from './playerHuman';
import { seededRandomForRun } from './simRng';
import { commuteHumanToBuilding } from './simulation/humanMovement';
import {
  isOfficialAtHall,
  officialHandlePetitioners,
  resolveCivicPetition,
  wantsCivicAudience,
} from './townHall';
import { hotelierGreetGuests, isHotelierAtHotel } from './hotelStay';

export type TavernRuntimeContext = {
  entity: Entity;
  workplace: Building | undefined;
  onTavernShift: boolean;
  huntingWere: boolean;
  inElectionCeremony: boolean;
  speed: number;
  tick: number;
  onSchedule: () => void;
  onSuppressIdle: () => void;
  onWorkChat: () => void;
};

export function shouldRunTavernService(
  huntingWere: boolean,
  inElectionCeremony: boolean,
  onTavernShift: boolean,
  hasWorkplace: boolean,
): boolean {
  return !huntingWere && !inElectionCeremony && onTavernShift && hasWorkplace;
}

/** Runs the existing innkeeper commute and work-chat behavior. */
export function tickTavernService({
  entity,
  workplace,
  onTavernShift,
  huntingWere,
  inElectionCeremony,
  speed,
  tick,
  onSchedule,
  onSuppressIdle,
  onWorkChat,
}: TavernRuntimeContext): boolean {
  if (!workplace || !shouldRunTavernService(huntingWere, inElectionCeremony, onTavernShift, true)) {
    return false;
  }

  commuteHumanToBuilding(entity, workplace, speed, false, 3.2);
  onSchedule();
  onSuppressIdle();
  if (seededRandomForRun(`chat-work:${entity.id}:${tick}`) < 0.04 * PER_TICK_RATE_SCALE) {
    onWorkChat();
  }
  return true;
}

export type CivicVenueRuntimeContext = {
  state: WorldState;
  entity: Entity;
  allHumans: Entity[];
  updatedBuildings: Building[];
  buildingById: ReadonlyMap<number, Building>;
  staffedTownHalls: Building[];
  onDayJobShift: boolean;
  onHotelShift: boolean;
  allowFreeRoam: boolean;
};

/** Runs the existing on-duty official and hotelier service behavior. */
export function tickHumanCivicVenueService({
  state,
  entity,
  allHumans,
  updatedBuildings,
  buildingById,
  onDayJobShift,
  onHotelShift,
}: Pick<CivicVenueRuntimeContext, 'state' | 'entity' | 'allHumans' | 'updatedBuildings' | 'buildingById' | 'onDayJobShift' | 'onHotelShift'>): void {
  if (onDayJobShift && isPlayerHuman(entity) && entity.job === JobType.Official) {
    const hall = isOfficialAtHall(entity, updatedBuildings);
    if (hall) {
      officialHandlePetitioners(state, entity, hall, allHumans);
    }
  }

  if (onHotelShift && isPlayerHuman(entity) && entity.job === JobType.Hotelier) {
    const hotel = isHotelierAtHotel(entity, buildingById);
    if (hotel) {
      hotelierGreetGuests(state, entity, hotel);
    }
  }

}

/** Runs the existing free-time town-hall petition behavior. */
export function tickHumanFreeTimeCivicPetition({
  state,
  entity,
  staffedTownHalls,
  allowFreeRoam,
}: Pick<CivicVenueRuntimeContext, 'state' | 'entity' | 'staffedTownHalls' | 'allowFreeRoam'>): void {
  if (
    allowFreeRoam
    && isPlayerHuman(entity)
    && !entity.isJuvenile
    && wantsCivicAudience(entity, state)
    && staffedTownHalls.length > 0
  ) {
    const hall = staffedTownHalls.find(
      (building) => Math.hypot(
        entity.x - (building.x + building.width / 2),
        entity.y - (building.y + building.height / 2),
      ) < 40,
    );
    if (hall && personDayRoll(entity.id, state.tick, 841) < 0.18) {
      resolveCivicPetition(state, entity, hall);
    }
  }
}
