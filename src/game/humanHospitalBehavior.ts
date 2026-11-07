import { personDayRoll } from './simRng';
import type { Building, Entity, WorldState } from './gameTypes';
import { JobType } from './gameTypes';
import { isPlayerHuman } from './playerHuman';
import { PREGNANCY_TICKS, TICKS_PER_DAY, getTickOfDay } from './dayCycle';
import { doctorHospitalShift, HOSPITAL_SHIFT_HOURS } from './hospitalShifts';
import { TICKS_PER_HOUR } from './dayCycleClock';
import { enterHumanBuilding, homeEntryPosition, steerHumanToward } from './simulation/humanMovement';
import {
  doctorTreatNearby,
  isDoctorAtHospital,
  needsMedicalCare,
  pickHospitalWalkTarget,
  treatPatientAtHospital,
} from './hospitalCare';

const PATIENT_CENTRE_RADIUS_PX = 36;
const PATIENT_ENTRY_RADIUS_PX = 16;
/** A doctor past this share of a pregnancy is a patient, not a carer. */
const DOCTOR_PREGNANCY_OFF_DUTY_RATIO = 0.8;
const HOSPITAL_TREATMENT_ROLL_SALT = 840;
const HOSPITAL_TREATMENT_DAILY_CHANCE = 0.2;

/** A patient is at the ward inside its centre radius or at its nearest entrance; walls block the rest. */
function isAtHospital(entity: Entity, hospital: Building): boolean {
  const centreX = hospital.x + hospital.width / 2;
  const centreY = hospital.y + hospital.height / 2;
  if (Math.hypot(entity.x - centreX, entity.y - centreY) < PATIENT_CENTRE_RADIUS_PX) return true;
  const entrance = homeEntryPosition(hospital, entity.x, entity.y);
  return Math.hypot(entity.x - entrance.x, entity.y - entrance.y) < PATIENT_ENTRY_RADIUS_PX;
}

/** Near-term doctors give birth, they do not run a ward round. */
export function doctorMayServe(entity: Entity): boolean {
  return (entity.pregnancyProgress ?? 0) <= PREGNANCY_TICKS * DOCTOR_PREGNANCY_OFF_DUTY_RATIO;
}

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
  hasStaffedHospital: boolean,
  tick: number,
): boolean {
  // needsMedicalCare already covers pregnancy, low stamina and grief; a working settler is not
  // excluded, and a second stamina gate must not hide a need it already detected.
  return isPlayerHuman(entity) && hasStaffedHospital && needsMedicalCare(entity, tick);
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
  if (!doctorMayServe(entity)) return;
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
 * One treatment attempt per settler per colony day, pinned to a settler-staggered tick so the
 * daily cadence needs no per-entity state.
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
    const best = staffedHospitals.find((hospital) => isAtHospital(entity, hospital))
      ?? pickHospitalWalkTarget(entity, staffedHospitals);
    if (best) {
      if (isAtHospital(entity, best)) enterHumanBuilding(entity, best);
      else {
        entity.indoorBuildingId = undefined;
        const entrance = homeEntryPosition(best, entity.x, entity.y);
        steerHumanToward(entity, entrance.x, entrance.y, speed, 0.55, `hospital_${best.id}_${entity.id}`);
      }
    }
  }

  if (shouldAttemptHospitalTreatment(entity, staffedHospitals.length > 0, state.tick)) {
    const hospital = staffedHospitals.find((building) => isAtHospital(entity, building));
    if (hospital) enterHumanBuilding(entity, hospital);
    if (
      hospital
      && isHospitalTreatmentTick(entity.id, state.tick)
      && personDayRoll(entity.id, state.tick, HOSPITAL_TREATMENT_ROLL_SALT) < HOSPITAL_TREATMENT_DAILY_CHANCE
    ) {
      treatPatientAtHospital(state, entity, hospital);
    }
  }
}