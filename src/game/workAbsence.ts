/**
 * Read-only "why is this settler not at their post" reason, for the inspector, a building's worker
 * list and the dashboard. Every rule below is another owner's predicate, composed only.
 */
import type { Building, Entity, WorldState } from './gameTypes';
import { BUILDING_CONFIGS, BuildingType, JobType } from './gameTypes';
import { getHourOfDay, isWorkDay } from './dayCycleClock';
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
import { medicalCareReason } from './hospitalCare';
import { isSettlerLodgingAtHotel } from './hotelStay';
import { canEatColonyMeal } from './simulation/humanNeeds';
import { humanBuildingTarget } from './simulation/humanMovement';
import { findHumanWorkplace, isManualStaffingBuilding } from './workforce';
import { isImprisoned, isNearResidence } from './residencyOccupancy';
import { isPlayerHuman } from './playerHuman';
import { getBuildingConfig } from './buildingConfig';

/** Distance under which a worker counts as standing at their post — the sim's own arrival test. */
export const WORK_ARRIVE_DISTANCE = 24;

export type SettlerWorkReasonCode =
  | 'dead'
  | 'working'
  | 'walking-to-work'
  | 'off-shift'
  | 'sleeping'
  | 'eating'
  | 'ill'
  | 'expecting'
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

/** Maps a staff member's work reason to a workplace-only duty label. */
export function workplaceDutyLabel(reason: SettlerWorkReason): 'Working' | 'Walking to work' | 'Off duty' {
  if (reason.code === 'working') return 'Working';
  if (reason.code === 'walking-to-work') return 'Walking to work';
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
type NextShift = { hour: number; kind: 'day' | 'venue' | 'prison' };

const VENUE_BY_BUILDING: Partial<Record<BuildingType, 'tavern' | 'hotel'>> = {
  [BuildingType.Tavern]: 'tavern',
  [BuildingType.Hotel]: 'hotel',
};

/**
 * The shift predicates `humanTick` composes, in its own order, each read from the owner that
 * already holds that window: the day schedule, the venue place window, the moon-howler night,
 * the prison roster.
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
  const autoVenueShifts = workplace?.staffingMode !== 'manual';
  const venueKind = workplace ? VENUE_BY_BUILDING[workplace.type] : undefined;
  const isVenueWorker = venueKind != null && (venueKind === 'tavern' ? isInnkeeper : isHotelier);
  if (venueKind != null && isVenueWorker) {
    const onVenueShift = venueIndex >= 0 && autoVenueShifts
      ? isVenueWorkerServiceHour(state, venueKind, hour, venueIndex, venueCount)
      : isVenueServiceHour(state, venueKind, hour);
    const startHour = venueIndex >= 0 && autoVenueShifts
      ? getVenueWorkerServiceWindow(state, venueKind, venueIndex, venueCount).startHour
      : getVenueSchedule(state, venueKind).startHour;
    return { onShift: onVenueShift, next: { hour: startHour, kind: 'venue' } };
  }

  const isPrisonGuardAtPost =
    entity.job === JobType.PrisonGuard && workplace?.type === BuildingType.Prison && completed;
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
          && isBarracksGuard(entity.id, entity.homeBuildingId, state.buildings))))
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

  const hour = getHourOfDay(state.tick);
  const buildings = state.buildings;
  if (canEatColonyMeal(state, entity, hour)) return { code: 'eating', label: 'Eating' };
  if (isAsleepAtHome(entity, buildings, hour) || isSettlerLodgingAtHotel(entity, buildings, hour)) {
    return { code: 'sleeping', label: 'Sleeping' };
  }

  // The hospital owner's own word for why this settler needs care, verbatim.
  const care = medicalCareReason(entity, state.tick);
  if (care === 'expecting') return { code: 'expecting', label: 'Expecting — resting' };
  if (care) return { code: 'ill', label: `Ill — ${care}` };

  const workplace = findHumanWorkplace(entity, buildings);
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
    return entity.isJuvenile
      ? { code: 'no-post', label: 'Child — too young for a post' }
      : { code: 'no-post', label: 'No post assigned' };
  }
  if (workplace.completed && !workplace.occupants.includes(entity.id)) {
    return { code: 'post-unstaffed', label: `Post has no roster — ${labelFor(workplace)}` };
  }

  const { onShift, next } = resolveShift(state, entity, workplace, hour);
  if (onShift) {
    const point = humanBuildingTarget(workplace, entity.id, false);
    const atPost = Math.hypot(point.x - entity.x, point.y - entity.y) <= WORK_ARRIVE_DISTANCE;
    return atPost
      ? { code: 'working', label: `Working at ${labelFor(workplace)}` }
      : { code: 'walking-to-work', label: `Walking to work — ${labelFor(workplace)}` };
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
  if (!isManualStaffingBuilding(building)) return null;
  return 'Workplace staffed manually — assign workers here yourself.';
}
