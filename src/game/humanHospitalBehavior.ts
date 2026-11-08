import { personDayRoll } from './simRng';
import type { Building, Entity, WorldState } from './gameTypes';
import { BuildingType, JobType } from './gameTypes';
import { isPlayerHuman } from './playerHuman';
import { TICKS_PER_DAY, getTickOfDay } from './dayCycle';
import { doctorHospitalShift, HOSPITAL_SHIFT_HOURS } from './hospitalShifts';
import { TICKS_PER_HOUR } from './dayCycleClock';
import { isPregnancyHospitalDue } from './simulation/humanLifecycle';
import { enterHumanBuilding, steerHumanToward } from './simulation/humanMovement';
import { buildingAccessPoint, isAtBuildingReach } from './buildingAccess';
import { getBuildingCenter } from './buildingGeometry';
import {
  doctorTreatNearby,
  isDoctorAtHospital,
  needsMedicalCare,
  pickHospitalWalkTarget,
  treatPatientAtHospital,
} from './hospitalCare';

const PATIENT_CENTRE_RADIUS_PX = 36;
const HOSPITAL_TREATMENT_ROLL_SALT = 840;
const HOSPITAL_TREATMENT_DAILY_CHANCE = 0.2;

/** A patient is at the ward inside its centre radius or at its one entrance; walls block the rest. */
function isAtHospital(entity: Entity, hospital: Building): boolean {
  const centre = getBuildingCenter(hospital);
  if (Math.hypot(entity.x - centre.x, entity.y - centre.y) < PATIENT_CENTRE_RADIUS_PX) return true;
  return isAtBuildingReach(entity, hospital);
}

/** A staffed ward: completed, player-owned and with someone on its roster. */
export function isStaffedHospital(building: Building): boolean {
  return building.type === BuildingType.Hospital
    && building.completed
    && building.faction !== 'rival'
    && building.occupants.length > 0;
}

/**
 * Pregnancy hospital priority: the lifecycle owns the 85% threshold, this module the staffed ward.
 * Below both, pregnancy is no different from any other medical need and never bars ordinary work.
 */
export function isPregnancyHospitalPriority(entity: Entity, hasStaffedHospital: boolean): boolean {
  return hasStaffedHospital && isPlayerHuman(entity) && isPregnancyHospitalDue(entity);
}

export type HospitalRuntimeContext = {
  state: WorldState;
  entity: Entity;
  allHumans: Entity[];
  updatedBuildings: Building[];
  staffedHospitals: Building[];
  onHospitalShift: boolean;
  speed: number;
};

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
  staffedHospitals,
  onHospitalShift,
}: Pick<HospitalRuntimeContext, 'state' | 'entity' | 'allHumans' | 'updatedBuildings' | 'staffedHospitals' | 'onHospitalShift'>): void {
  if (!onHospitalShift || !isPlayerHuman(entity) || entity.job !== JobType.Doctor) return;
  // At the pregnancy threshold a doctor with a ward to go to is a patient, not a carer.
  if (isPregnancyHospitalPriority(entity, staffedHospitals.length > 0)) return;
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
  speed,
}: Pick<HospitalRuntimeContext, 'state' | 'entity' | 'staffedHospitals' | 'speed'>): void {
  if (isPregnancyHospitalPriority(entity, staffedHospitals.length > 0)) {
    const best = staffedHospitals.find((hospital) => isAtHospital(entity, hospital))
      ?? pickHospitalWalkTarget(entity, staffedHospitals);
    if (best) {
      if (isAtHospital(entity, best)) enterHumanBuilding(entity, best);
      else {
        entity.indoorBuildingId = undefined;
        const entrance = buildingAccessPoint(best);
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