/** Canonical read-only shift and equipment duty; no inspector, movement or diplomacy dependencies. */
import type { Building, Entity, WorldState } from './gameTypes';
import { BuildingType, JobType } from './gameTypes';
import { getHourOfDay } from './dayCycleClock';
import { HUMAN_ADULT_MIN_AGE } from './daycycleconstants';
import { isOnMoonHowlerNightShift } from './humanSchedule';
import { getWorkSchedule, isOnWorkScheduleShift } from './workSchedule';
import { getVenueSchedule, getVenueWorkerServiceWindow, isVenueServiceHour, isVenueWorkerServiceHour } from './venueSchedule';
import { prisonDutyForGuard } from './prisonShifts';
import { prisonGuardIds } from './prisonGuardDuty';
import { isBarracksGuard } from './defenseStructures';
import { isHospitalDoctorOnShift } from './hospitalShifts';
import { resolveHumanWorkplace } from './workforceSummary';
import { isImprisoned } from './housingModel';
import { isPlayerHuman } from './playerHuman';

/** Where the settler's next shift starts, and which of the three shift owners said so. */
type NextShift = { hour: number; kind: 'day' | 'venue' | 'prison' | 'hospital'; endHour?: number };

const VENUE_BY_BUILDING: Partial<Record<BuildingType, 'tavern' | 'hotel'>> = {
  [BuildingType.Tavern]: 'tavern',
  [BuildingType.Hotel]: 'hotel',
};

/**
 * Canonical workplace duty shared by simulation and projections, using the existing schedule owners.
 */
export function resolveShift(
  state: WorldState,
  entity: Entity,
  workplace: Building | undefined,
  hour: number,
): {
  onShift: boolean;
  next: NextShift;
  prisonDuty?: ReturnType<typeof prisonDutyForGuard>;
  moonPriestDuty?: boolean;
  patrolAssignment?: boolean;
} {
  const schedule = getWorkSchedule(state);
  const goWorkTime = isOnWorkScheduleShift(state, hour);
  const completed = workplace?.completed === true;
  const isInnkeeper =
    entity.job === JobType.Innkeeper && workplace?.type === BuildingType.Tavern && completed;
  const isHotelier =
    entity.job === JobType.Hotelier && workplace?.type === BuildingType.Hotel && completed;
  const ordinaryWorkplace =
    workplace != null
    && (!completed || (workplace.type !== BuildingType.Church
      && workplace.type !== BuildingType.TownHall
      && workplace.type !== BuildingType.Prison
      && workplace.type !== BuildingType.Hospital
      && workplace.type !== BuildingType.Hotel));

  const venueIndex = workplace ? workplace.occupants.indexOf(entity.id) : -1;
  const venueCount = workplace?.occupants.length ?? 0;
  const venueKind = workplace ? VENUE_BY_BUILDING[workplace.type] : undefined;
  const isVenueWorker = venueKind != null && (venueKind === 'tavern' ? isInnkeeper : isHotelier);
  if (venueKind != null && isVenueWorker) {
    const onVenueShift = venueIndex >= 0
      ? isVenueWorkerServiceHour(state, venueKind, hour, venueIndex, venueCount)
      : isVenueServiceHour(state, venueKind, hour);
    const window = venueIndex >= 0
      ? getVenueWorkerServiceWindow(state, venueKind, venueIndex, venueCount)
      : getVenueSchedule(state, venueKind);
    return { onShift: onVenueShift, next: { hour: window.startHour, endHour: window.endHour, kind: 'venue' } };
  }

  const isPrisonGuardAtPost =
    entity.job === JobType.PrisonGuard && workplace?.type === BuildingType.Prison && completed;
  if (entity.job === JobType.Doctor && workplace?.type === BuildingType.Hospital && completed) {
    const onShift = isHospitalDoctorOnShift(workplace, state.tick, entity.id);
    return { onShift, next: { hour: 0, kind: 'hospital' } };
  }

  if (isPrisonGuardAtPost) {
    const prisonDuty = prisonDutyForGuard(
      entity.id,
      prisonGuardIds(state, workplace?.occupants ?? []),
      state.tick,
    );
    if (prisonDuty) {
      return {
        onShift: prisonDuty.onShift,
        prisonDuty,
        next: { hour: prisonDuty.shift.startHour, kind: 'prison' },
      };
    }
    return { onShift: false, next: { hour: schedule.startHour, kind: 'prison' } };
  }

  const patrolAssignment = entity.job === JobType.Soldier && workplace?.type === BuildingType.Barracks
    && isBarracksGuard(entity.id, entity.workerBuildingId, state.buildings);
  const onDayJobShift =
    (goWorkTime
      && !isInnkeeper
      && (ordinaryWorkplace || patrolAssignment))
    || (entity.job === JobType.Official
      && workplace?.type === BuildingType.TownHall
      && completed
      && goWorkTime);
  const isPriest = entity.job === JobType.Priest
    && workplace?.type === BuildingType.Church && completed;
  const moonPriestDuty = isPriest && isOnMoonHowlerNightShift(state.tick, hour);
  return {
    onShift: onDayJobShift || (isPriest && goWorkTime) || moonPriestDuty,
    next: { hour: schedule.startHour, kind: 'day' },
    ...(moonPriestDuty ? { moonPriestDuty } : {}),
    ...(patrolAssignment ? { patrolAssignment } : {}),
  };
}

type ArmedDuty = 'none' | 'hunting' | 'military';

/** Equipment eligibility reads the existing assignment and shift owners; never creates a new roster. */
export function resolveArmedDuty(state: WorldState, entity: Entity): ArmedDuty {
  if (!entity.alive || !isPlayerHuman(entity) || entity.age < HUMAN_ADULT_MIN_AGE || isImprisoned(entity)) return 'none';
  // A deployment pointer alone does not establish duty: the active raid must also roster this soldier.
  if (entity.raidDeploymentId != null) {
    if (entity.job !== JobType.Soldier) return 'none';
    const id = entity.raidDeploymentId;
    const outgoing = state.pendingOutgoingRaidEvents?.some((event) =>
      event.id === id && event.phase != null && event.soldierIds?.includes(entity.id));
    const incoming = state.pendingRaidEvents?.some((event) =>
      event.id === id && (event.phase === 'fighting' || event.phase === 'resolving')
      && event.soldierIds?.includes(entity.id));
    return outgoing || incoming ? 'military' : 'none';
  }
  if (entity.job !== JobType.Soldier && entity.job !== JobType.Hunter && entity.job !== JobType.PrisonGuard) return 'none';
  const { workplace } = resolveHumanWorkplace(entity, state.buildings, state.entities);
  if (!workplace?.completed || !workplace.occupants.includes(entity.id)) return 'none';
  if (!resolveShift(state, entity, workplace, getHourOfDay(state.tick)).onShift) return 'none';
  if (entity.job === JobType.Hunter && workplace.type === BuildingType.HuntingSpot) return 'hunting';
  if ((entity.job === JobType.Soldier && isBarracksGuard(entity.id, entity.workerBuildingId, state.buildings))
    || (entity.job === JobType.PrisonGuard && workplace.type === BuildingType.Prison)) return 'military';
  return 'none';
}

