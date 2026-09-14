import type { Building, Entity, WorldState } from './gameTypes';
import { JobType } from './gameTypes';
import { isPlayerHuman } from './playerHuman';
import { PREGNANCY_TICKS, TICKS_PER_DAY, getTickOfDay, personDayRoll } from './dayCycle';
import {
  doctorTreatNearby,
  isDoctorAtHospital,
  needsMedicalCare,
  pickHospitalWalkTarget,
  treatPatientAtHospital,
} from './hospitalCare';

export type HospitalRuntimeContext = {
  state: WorldState;
  entity: Entity;
  allHumans: Entity[];
  updatedBuildings: Building[];
  staffedHospitals: Building[];
  onDayJobShift: boolean;
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
  onDayJobShift,
}: Pick<HospitalRuntimeContext, 'state' | 'entity' | 'allHumans' | 'updatedBuildings' | 'onDayJobShift'>): void {
  if (onDayJobShift && isPlayerHuman(entity) && entity.job === JobType.Doctor) {
    const ward = isDoctorAtHospital(entity, updatedBuildings);
    // One doctor treatment per doctor per colony day, on the same settler-staggered tick the
    // patient path uses. Without it the doctor's day-stable roll passed all day and the whole
    // treatment (heal + Doctor skill + medicine food) re-ran every tick.
    if (ward && isHospitalTreatmentTick(entity.id, state.tick)) {
      doctorTreatNearby(state, entity, ward, allHumans);
    }
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
    const best = pickHospitalWalkTarget(entity, staffedHospitals);
    if (best) {
      const dx = best.x + best.width / 2 - entity.x;
      const dy = best.y + best.height / 2 - entity.y;
      const distance = Math.hypot(dx, dy) || 1;
      // Movement owns position: set velocity and let the human loop apply the step.
      entity.vx = (dx / distance) * speed * 0.55;
      entity.vy = (dy / distance) * speed * 0.55;
      entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
    }
  }

  if (shouldAttemptHospitalTreatment(entity, onJobShift, staffedHospitals.length > 0, state.tick)) {
    const hospital = staffedHospitals.find(
      (building) => Math.hypot(
        entity.x - (building.x + building.width / 2),
        entity.y - (building.y + building.height / 2),
      ) < 36,
    );
    if (
      hospital
      && isHospitalTreatmentTick(entity.id, state.tick)
      && personDayRoll(entity.id, state.tick, 840) < 0.2
    ) {
      treatPatientAtHospital(state, entity, hospital);
    }
  }
}
