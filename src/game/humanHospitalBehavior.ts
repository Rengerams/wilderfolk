import type { Building, Entity, WorldState } from './gameTypes';
import { JobType } from './gameTypes';
import { isPlayerHuman } from './playerHuman';
import { PREGNANCY_TICKS, TICKS_PER_DAY, getTickOfDay, personDayRoll } from './dayCycle';
import { doctorHospitalShift, HOSPITAL_SHIFT_HOURS } from './hospitalShifts';
import { TICKS_PER_HOUR } from './dayCycleClock';
import { enterHumanBuilding } from './simulation/humanMovement';
import { steerEntityToward } from './simulation/movementSteering';
import {
  doctorTreatNearby,
  isDoctorAtHospital,
  needsMedicalCare,
  pickHospitalWalkTarget,
  treatPatientAtHospital,
} from './hospitalCare';

const PATIENT_ARRIVAL_RADIUS_PX = 36;

export type HospitalRuntimeContext = {
  state: WorldState;
  entity: Entity;
  allHumans: Entity[];
  updatedBuildings: Building[];
  staffedHospitals: Building[];
  onHospitalShift: boolean;
  onJobShift: boolean;
  speed: number;
};

export function shouldRoutePregnantSettlerToHospital(
  entity: Entity,
  onJobShift: boolean,
  hasStaffedHospital: boolean,
): boolean {
  return !!entity.pregnant
    && isPlayerHuman(entity)
    && hasStaffedHospital
    && (!onJobShift || (entity.pregnancyProgress ?? 0) > PREGNANCY_TICKS * 0.85);
}

export function shouldAttemptHospitalTreatment(
  entity: Entity,
  onJobShift: boolean,
  hasStaffedHospital: boolean,
  tick: number,
): boolean {
  return !!(needsMedicalCare(entity, tick) || entity.pregnant || !onJobShift)
    && isPlayerHuman(entity)
    && !!(entity.energy < entity.maxEnergy * 0.5 || entity.pregnant)
    && hasStaffedHospital;
}

/** Runs the existing on-duty doctor treatment behavior. */
export function tickHumanDoctorHospitalService({
  state,
  entity,
  allHumans,
  updatedBuildings,
  onHospitalShift,
}: Pick<HospitalRuntimeContext, 'state' | 'entity' | 'allHumans' | 'updatedBuildings' | 'onHospitalShift'>): void {
  if (!onHospitalShift || !isPlayerHuman(entity) || entity.job !== JobType.Doctor) return;
  const ward = isDoctorAtHospital(entity, updatedBuildings);
  const shift = ward ? doctorHospitalShift(ward, state.tick, entity.id) : undefined;
  if (!ward || !shift) return;
  // Exactly one ward round in this doctor's own 8h shift, even on weekends and
  // overnight. The old day-only stagger fell outside many rotating shifts.
  const tickOfShift = getTickOfDay(state.tick) - shift.startHour * TICKS_PER_HOUR;
  if (tickOfShift === entity.id % (HOSPITAL_SHIFT_HOURS * TICKS_PER_HOUR)) {
    doctorTreatNearby(state, entity, ward, allHumans);
  }
}

/**
 * One hospital treatment attempt per settler per colony day.
 *
 * `personDayRoll` is stable for a whole colony day, so re-evaluating it every tick
 * repeated the full treatment (heal + doctor skill + medicine food) on every tick of
 * a qualifying day. Pinning the attempt to a single, settler-staggered tick restores
 * the intended daily cadence without adding per-entity state.
 */
function isHospitalTreatmentTick(entityId: number, tick: number): boolean {
  return getTickOfDay(tick) === entityId % TICKS_PER_DAY;
}

/**
 * Runs the existing pregnant-settler routing and patient-care behavior. Treatment
 * policy remains owned by hospitalCare; this module only coordinates its gates.
 */
export function tickHumanHospitalPatientCare({
  state,
  entity,
  staffedHospitals,
  onJobShift,
  speed,
}: Pick<HospitalRuntimeContext, 'state' | 'entity' | 'staffedHospitals' | 'onJobShift' | 'speed'>): void {
  if (shouldRoutePregnantSettlerToHospital(entity, onJobShift, staffedHospitals.length > 0)) {
    const best = staffedHospitals.find((hospital) => Math.hypot(
      entity.x - (hospital.x + hospital.width / 2),
      entity.y - (hospital.y + hospital.height / 2),
    ) < PATIENT_ARRIVAL_RADIUS_PX) ?? pickHospitalWalkTarget(entity, staffedHospitals);
    if (best) {
      const x = best.x + best.width / 2;
      const y = best.y + best.height / 2;
      if (Math.hypot(entity.x - x, entity.y - y) < PATIENT_ARRIVAL_RADIUS_PX) enterHumanBuilding(entity, best);
      else {
        entity.indoorBuildingId = undefined;
        steerEntityToward(entity, x, y, speed, 0.55);
      }
    }
  }

  if (shouldAttemptHospitalTreatment(entity, onJobShift, staffedHospitals.length > 0, state.tick)) {
    const hospital = staffedHospitals.find(
      (building) => Math.hypot(
        entity.x - (building.x + building.width / 2),
        entity.y - (building.y + building.height / 2),
      ) < PATIENT_ARRIVAL_RADIUS_PX,
    );
    if (hospital) enterHumanBuilding(entity, hospital);
    if (
      hospital
      && isHospitalTreatmentTick(entity.id, state.tick)
      && personDayRoll(entity.id, state.tick, 840) < 0.2
    ) {
      treatPatientAtHospital(state, entity, hospital);
    }
  }
}