/**
 * Read-only "why is this settler not at their post" reason, for the inspector, a building's worker
 * list and the dashboard. Every rule below is another owner's predicate, composed only.
 */
import type { Building, Entity, WorldState } from './gameTypes';
import { BUILDING_CONFIGS, BuildingType, EntityType, JobType } from './gameTypes';
import { getHourOfDay, isWorkDay } from './dayCycleClock';
import { HUMAN_ADULT_MIN_AGE } from './daycycleconstants';
import {
  EVENING_START,
  isAsleepAtHome,
  isFestivalGatherer,
  isOnMoonHowlerNightShift,
  prefersHomeTonightFor,
} from './humanSchedule';
import { getWorkSchedule, isOnWorkScheduleShift } from './workSchedule';
import {
  getVenueSchedule,
  getVenueWorkerServiceWindow,
  isVenueServiceHour,
  isVenueWorkerServiceHour,
} from './venueSchedule';
import { prisonShiftForGuard, shiftCoversHour } from './prisonShifts';
import { prisonGuardIds } from './prisonGuardDuty';
import { isBarracksGuard } from './defenseStructures';
import { isCeremonyAttendee } from './villageLeadership';
import { isRestingHospitalPatient, medicalCareReason } from './hospitalCare';
import { isPregnancyHospitalPriority, isStaffedHospital } from './humanHospitalBehavior';
import { isHospitalDoctorOnShift, isHospitalDoctorCommuteTime } from './hospitalShifts';
import { isSettlerLodgingAtHotel } from './hotelStay';
import { canEatColonyMeal } from './simulation/humanNeeds';
import { commuteDistanceToBuilding, isWalkingToward } from './simulation/humanMovement';
import { buildingAccessPoint, isAtBuildingReach } from './buildingAccess';
import { getRouteObstruction } from './pathfinding';
import { commuteLeadHoursFor } from './commuteReach';
import { SPECIES_CONFIG } from './speciesConfig';
import { findHumanWorkplace } from './workforce';
import { isImprisoned, isNearResidence } from './housingModel';
import { isPlayerHuman } from './playerHuman';
import { getBuildingConfig } from './buildingConfig';

/** Distance under which a worker counts as standing at their post — the sim's own arrival test. */
export const WORK_ARRIVE_DISTANCE = 24;

export type SettlerWorkReasonCode =
  | 'dead'
  | 'working'
  | 'walking-to-work'
  | 'off-shift'
  | 'deployed'
  | 'sleeping'
  | 'eating'
  | 'ill'
  | 'going-to-hospital'
  | 'in-hospital'
  | 'unreachable'
  | 'unknown'
  | 'at-home'
  | 'socialising'
  | 'at-festival'
  | 'at-election'
  | 'hunting'
  | 'in-prison'
  | 'no-post'
  | 'post-unstaffed';

/** One reason, ready to print: a stable code for tests and a terse label for the player. */
export interface SettlerWorkReason {
  code: SettlerWorkReasonCode;
  label: string;
}

export type WorkplaceDutyLabel =
  | 'Working'
  | 'Walking to work'
  | 'Going to hospital'
  | 'In hospital'
  | 'Absent'
  | 'Off duty';

/** Maps a staff member's work reason to a workplace-only duty label. */
export function workplaceDutyLabel(reason: SettlerWorkReason): WorkplaceDutyLabel {
  if (reason.code === 'working') return 'Working';
  if (reason.code === 'walking-to-work') return 'Walking to work';
  if (reason.code === 'going-to-hospital') return 'Going to hospital';
  if (reason.code === 'in-hospital') return 'In hospital';
  if (reason.code === 'unreachable' || reason.code === 'unknown') return 'Absent';
  return 'Off duty';
}

function clockLabel(hour: number): string {
  const normalized = ((Math.round(hour) % 24) + 24) % 24;
  return `${String(normalized).padStart(2, '0')}:00`;
}

function labelFor(building: Building): string {
  return getBuildingConfig(building.type).label;
}

/** Where the settler's next shift starts, and which of the three shift owners said so. */
type NextShift = { hour: number; kind: 'day' | 'venue' | 'prison' | 'hospital' };

const VENUE_BY_BUILDING: Partial<Record<BuildingType, 'tavern' | 'hotel'>> = {
  [BuildingType.Tavern]: 'tavern',
  [BuildingType.Hotel]: 'hotel',
};

/**
 * The shift predicates `humanTick` composes, each read from the owner holding that window: day
 * schedule, venue hours, moon-howler night, prison roster.
 */
function resolveShift(
  state: WorldState,
  entity: Entity,
  workplace: Building | undefined,
  hour: number,
): { onShift: boolean; next: NextShift } {
  const schedule = getWorkSchedule(state);
  const goWorkTime = isOnWorkScheduleShift(state, hour);
  const completed = workplace?.completed === true;
  const isInnkeeper =
    entity.job === JobType.Innkeeper && workplace?.type === BuildingType.Tavern && completed;
  const isHotelier =
    entity.job === JobType.Hotelier && workplace?.type === BuildingType.Hotel && completed;
  const ordinaryWorkplace =
    workplace != null
    && workplace.type !== BuildingType.Church
    && workplace.type !== BuildingType.TownHall
    && workplace.type !== BuildingType.Prison;

  const venueIndex = workplace ? workplace.occupants.indexOf(entity.id) : -1;
  const venueCount = workplace?.occupants.length ?? 0;
  const venueKind = workplace ? VENUE_BY_BUILDING[workplace.type] : undefined;
  const isVenueWorker = venueKind != null && (venueKind === 'tavern' ? isInnkeeper : isHotelier);
  if (venueKind != null && isVenueWorker) {
    const onVenueShift = venueIndex >= 0
      ? isVenueWorkerServiceHour(state, venueKind, hour, venueIndex, venueCount)
      : isVenueServiceHour(state, venueKind, hour);
    const startHour = venueIndex >= 0
      ? getVenueWorkerServiceWindow(state, venueKind, venueIndex, venueCount).startHour
      : getVenueSchedule(state, venueKind).startHour;
    return { onShift: onVenueShift, next: { hour: startHour, kind: 'venue' } };
  }

  const isPrisonGuardAtPost =
    entity.job === JobType.PrisonGuard && workplace?.type === BuildingType.Prison && completed;
  if (entity.job === JobType.Doctor && workplace?.type === BuildingType.Hospital && completed) {
    const onShift = isHospitalDoctorOnShift(workplace, state.tick, entity.id);
    return { onShift, next: { hour: 0, kind: 'hospital' } };
  }

  if (isPrisonGuardAtPost) {
    const prisonShift = prisonShiftForGuard(
      entity.id,
      prisonGuardIds(state, workplace?.occupants ?? []),
      state.tick,
    );
    if (prisonShift) {
      return {
        onShift: shiftCoversHour(prisonShift, hour),
        next: { hour: prisonShift.startHour, kind: 'prison' },
      };
    }
    return { onShift: false, next: { hour: schedule.startHour, kind: 'prison' } };
  }

  const onDayJobShift =
    (goWorkTime
      && !isInnkeeper
      && (ordinaryWorkplace
        || (entity.job === JobType.Soldier
          && isBarracksGuard(entity.id, entity.workerBuildingId, state.buildings))))
    || (entity.job === JobType.Official
      && workplace?.type === BuildingType.TownHall
      && completed
      && goWorkTime);
  const onMoonPriestShift =
    entity.job === JobType.Priest
    && workplace?.type === BuildingType.Church
    && completed
    && isOnMoonHowlerNightShift(state.tick, hour);
  return { onShift: onDayJobShift || onMoonPriestShift, next: { hour: schedule.startHour, kind: 'day' } };
}

/**
 * Why this settler is not at their post right now. Reads stored state and the owners' predicates;
 * it invents no hours, distances or thresholds of its own.
 */
export function getSettlerWorkReason(state: WorldState, entity: Entity): SettlerWorkReason {
  if (!entity.alive) return { code: 'dead', label: 'Dead' };
  if (isImprisoned(entity)) return { code: 'in-prison', label: 'In prison' };
  if (entity.raidDeploymentId) return { code: 'deployed', label: 'Away with the war-band' };
  if (entity.age < HUMAN_ADULT_MIN_AGE) return { code: 'no-post', label: 'Child — too young for a post' };

  const hour = getHourOfDay(state.tick);
  const buildings = state.buildings;
  const workplace = findHumanWorkplace(entity, buildings);
  const isHospitalDoctor = entity.job === JobType.Doctor
    && workplace?.type === BuildingType.Hospital && workplace.completed;
  const doctorCommuteDue = !!(isHospitalDoctor && isHospitalDoctorCommuteTime(
    workplace,
    state.tick,
    entity.id,
    commuteLeadHoursFor(
      commuteDistanceToBuilding(entity, workplace),
      SPECIES_CONFIG[EntityType.Human].speed,
    ),
  ));
  // Pregnancy travel outranks every ordinary activity once the lifecycle threshold and a ward hold.
  const hospitalPriority = isPregnancyHospitalPriority(entity, buildings.some(isStaffedHospital));
  const ward = entity.indoorBuildingId == null
    ? undefined
    : buildings.find((building) => building.id === entity.indoorBuildingId);
  // A doctor on their own ward's shift is serving unless the pregnancy rule has made them a patient.
  const servingOwnWard = !hospitalPriority
    && ward != null
    && ward.id === workplace?.id
    && entity.job === JobType.Doctor
    && isHospitalDoctorOnShift(ward, state.tick, entity.id);
  if (ward && !servingOwnWard && isRestingHospitalPatient(entity, ward, state.tick, entity.indoorBuildingId)) {
    return { code: 'in-hospital', label: `In hospital — ${labelFor(ward)}` };
  }
  if (hospitalPriority) return { code: 'going-to-hospital', label: 'Going to hospital' };

  if (canEatColonyMeal(state, entity, hour)) return { code: 'eating', label: 'Eating' };
  // The hospital roster owns commute duty, including the hour before midnight.
  if (!doctorCommuteDue && (isAsleepAtHome(entity, buildings, hour)
      || isSettlerLodgingAtHotel(entity, buildings, hour))) {
    return { code: 'sleeping', label: 'Sleeping' };
  }

  // The hospital owner's own word for why this settler needs care, verbatim. Pregnancy alone is
  // not an absence: `expecting` is a clinical reason, not evidence that no work happened.
  const care = medicalCareReason(entity, state.tick);
  if (care && care !== 'expecting') return { code: 'ill', label: `Ill — ${care}` };

  // `humanTick` holds a ceremony's attendees before its festival gatherers; keep that order.
  if (state.electionCeremony != null && isPlayerHuman(entity) && isCeremonyAttendee(state, entity.id)) {
    return { code: 'at-election', label: 'At the election' };
  }
  const isInnkeeper = entity.job === JobType.Innkeeper && workplace?.type === BuildingType.Tavern;
  const onShiftNow =
    workplace != null && resolveShift(state, entity, workplace, hour).onShift;
  if (isFestivalGatherer(hour, state.festival?.active, onShiftNow, isInnkeeper)) {
    return { code: 'at-festival', label: 'At the festival' };
  }

  if (!workplace) {
    return entity.age < HUMAN_ADULT_MIN_AGE
      ? { code: 'no-post', label: 'Child — too young for a post' }
      : { code: 'no-post', label: 'No post assigned' };
  }
  if (workplace.completed && !workplace.occupants.includes(entity.id)) {
    return { code: 'post-unstaffed', label: `Post has no roster — ${labelFor(workplace)}` };
  }

  const { onShift, next } = resolveShift(state, entity, workplace, hour);
  const label = labelFor(workplace);
  const point = buildingAccessPoint(workplace);
  // The same three cases `humanTick` credits as verified work: at the building, inside it, or in
  // the field for a hunter holding prey.
  const atWork = isAtBuildingReach(entity, workplace)
    || entity.indoorBuildingId === workplace.id
    || (entity.job === JobType.Hunter && entity.huntTargetId != null);
  if (onShift && atWork) return { code: 'working', label: `Working at ${label}` };
  // The hospital roster owns its own commute window, which opens before the ward duty does.
  if (doctorCommuteDue) return { code: 'walking-to-work', label: `Walking to work — ${label}` };
  if (onShift) {
    if (isWalkingToward(entity, point)) {
      return { code: 'walking-to-work', label: `Walking to work — ${label}` };
    }
    // Only the navigation owner's own verdict may explain a walk that is not happening.
    if (getRouteObstruction(state.worldMap, state.buildings, entity, point) === 'blocked') {
      return { code: 'unreachable', label: `Route failure — cannot reach ${label}` };
    }
    return { code: 'unknown', label: `Unexplained absence — ${label}` };
  }

  if (entity.huntTargetId != null) return { code: 'hunting', label: 'Hunting' };

  const homeTonight = prefersHomeTonightFor(getWorkSchedule(state), entity.id, state.tick, hour);
  if (homeTonight && isNearResidence(entity, buildings)) return { code: 'at-home', label: 'At home' };
  if (hour >= EVENING_START && hour < 23 && !homeTonight) {
    return { code: 'socialising', label: 'Socialising — evening outing' };
  }
  if (isNearResidence(entity, buildings)) return { code: 'at-home', label: 'At home' };

  if (next.kind === 'day' && !isWorkDay(state.tick)) {
    return { code: 'off-shift', label: 'Off shift — not a work day' };
  }
  if (next.kind === 'prison') return { code: 'off-shift', label: 'Off duty today' };
  if (next.kind === 'hospital') return { code: 'off-shift', label: 'Off duty — hospital roster' };
  return { code: 'off-shift', label: `Off shift until ${clockLabel(next.hour)}` };
}

/** One worker on a building's roster with the reason they are, or are not, at their post. */
export interface WorkplaceWorkerReason {
  settlerId: number;
  reason: SettlerWorkReason;
}

/** Every settler on this building's roster, each with their own absence reason. */
export function getWorkplaceRosterReasons(
  state: WorldState,
  building: Building,
): WorkplaceWorkerReason[] {
  const out: WorkplaceWorkerReason[] = [];
  for (const id of building.occupants) {
    const settler = state.entities.find((candidate) => candidate.id === id);
    if (!settler || !settler.alive || !isPlayerHuman(settler)) continue;
    out.push({ settlerId: id, reason: getSettlerWorkReason(state, settler) });
  }
  return out;
}

/**
 * Why a finished, hand-staffed workplace has nobody on its roster — the one empty case the
 * building panel cannot explain from the roster itself, or `null` for every other building.
 */
export function getUnstaffedPostNote(building: Building): string | null {
  if (!building.completed || building.occupants.length > 0) return null;
  if (BUILDING_CONFIGS[building.type].maxOccupants <= 0) return null;
  return 'No workers assigned yet — workforce staffing will fill available posts.';
}
