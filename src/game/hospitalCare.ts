/**
 * Hospital ↔ people: visits, treatments, doctor-on-duty care.
 */
import { personDayRoll } from './simRng';
import type { Building, Entity, WorldState } from './gameTypes';
import { BuildingType, JobType } from './gameTypes';
import { PRODUCTION_INTERVAL, TICKS_PER_DAY } from './dayCycle';
import { getAbsoluteCalendarDay } from './dayCycleClock';
import { addFloatingText } from './simEffects';
import { addReputation } from './simHelpers';
import { isDialogueBusy } from './humanChat';
import { requestDialogue, dialogueHoursFromNominalTicks } from './dialogueTrees';
import { gainSkill } from './skills';
import { isPlayerHuman } from './playerHuman';
import { spendFood } from './economyLedger';
import { adjustHumanStaminaFromEnergy, getHumanStaminaRatio } from './simulation/humanPhysiology';
import { getPregnancyProgressFraction } from './pregnancy';
import { isPregnancyHospitalDue } from './simulation/humanLifecycle';
import { getBuildingCenter } from './buildingGeometry';
import { isAtBuildingReach } from './buildingAccess';

/** Flat reputation a staffed hospital grants on each production interval. */
export const HOSPITAL_REPUTATION_PER_INTERVAL = 2;

/** Most the ward round can add on top of the flat grant (`1 + min(2, treated)`). */
export const HOSPITAL_TREATMENT_REPUTATION_MAX = 3;

/** Days between staffed-hospital grants — `PRODUCTION_INTERVAL.hospital`, for the UI copy. */
export const HOSPITAL_REPUTATION_INTERVAL_DAYS = PRODUCTION_INTERVAL.hospital / TICKS_PER_DAY;

/** How near the ward a settler must stand for the ward round to reach them, in world px. */
export const HOSPITAL_WARD_RADIUS_PX = 70;

/**
 * The hospital's whole reputation grant for one production interval: the flat staffed grant plus
 * the ward round's grant. `dailyBuildingEconomy` only decides when the interval fires.
 */
export function grantHospitalIntervalReputation(
  state: WorldState,
  hospital: Building,
  humans: readonly Entity[],
): void {
  addReputation(state, HOSPITAL_REPUTATION_PER_INTERVAL);
  tickHospitalDailyCare(state, hospital, humans);
}

/**
 * The single player-facing description of the hospital reputation rule, rendered by both the
 * build tooltip and the More-tab guide so the advertised amount cannot drift.
 */
export function describeHospitalReputation(): string {
  return `Staffed: +${HOSPITAL_REPUTATION_PER_INTERVAL} reputation every ${HOSPITAL_REPUTATION_INTERVAL_DAYS} days,`
    + ` up to +${HOSPITAL_TREATMENT_REPUTATION_MAX} more when patients are treated. Admitted patients recover extra stamina while resting.`;
}

export function isDoctorAtHospital(
  entity: Entity,
  buildings: readonly Building[],
): Building | undefined {
  if (entity.job !== JobType.Doctor || entity.workerBuildingId == null) return undefined;
  const h = buildings.find((b) => b.id === entity.workerBuildingId);
  if (!h || h.type !== BuildingType.Hospital || !h.completed) return undefined;
  return h;
}

/**
 * Whether this settler should seek medical care. `tick` is required: the grief window is an
 * absolute deadline, not something to compare with `0`.
 */
export function needsMedicalCare(entity: Entity, tick: number): boolean {
  if (!entity.alive || entity.isJuvenile === undefined) return false;
  if (isPregnancyHospitalDue(entity)) return true;
  const stamina = getHumanStaminaRatio(entity);
  if (stamina < 0.42) return true;
  if ((entity.griefUntilTick ?? 0) > tick && stamina < 0.7) return true;
  return false;
}

/** Admission-derived hospital rest: medical need, a staffed ward, and real indoor presence. */
export function isRestingHospitalPatient(
  patient: Entity,
  hospital: Building | undefined,
  tick: number,
  previousIndoorBuildingId?: number,
): boolean {
  if (!hospital || hospital.type !== BuildingType.Hospital || !hospital.completed
    || hospital.faction === 'rival' || hospital.occupants.length === 0
    || previousIndoorBuildingId !== hospital.id || !isPlayerHuman(patient)
    || !needsMedicalCare(patient, tick)) return false;
  // buildingGeometry: x/y are the footprint centre, not the top-left corner.
  const centre = getBuildingCenter(hospital);
  const dx = patient.x - centre.x;
  const dy = patient.y - centre.y;
  return dx * dx + dy * dy <= HOSPITAL_WARD_RADIUS_PX ** 2;
}

/** How urgently this settler should seek the hospital (0–1). */
export function medicalUrgency(entity: Entity): number {
  if (isPregnancyHospitalDue(entity)) {
    return 0.55 + 0.4 * getPregnancyProgressFraction(entity);
  }
  const stamina = getHumanStaminaRatio(entity);
  if (stamina < 0.28) return 0.85;
  if (stamina < 0.42) return 0.55;
  if (stamina < 0.55) return 0.3;
  return 0;
}

/** The owner's own reason this settler needs care, or `null` — the roster renders it verbatim. */
export function medicalCareReason(entity: Entity, tick: number): string | null {
  if (!needsMedicalCare(entity, tick)) return null;
  if (isPregnancyHospitalDue(entity)) return 'expecting';
  if (getHumanStaminaRatio(entity) < 0.42) return 'exhausted';
  return 'grieving';
}

/** One patient in the ward, with the owner's reason they are there. */
export interface HospitalPatientEntry {
  entity: Entity;
  reason: string;
}

/** One hospital's roster — a view for the building inspector, derived like the school's. */
export interface HospitalRosterEntry {
  hospitalId: number;
  patients: HospitalPatientEntry[];
}

/** Who is in the ward: verified admissions only, each with the owner's reason for being there. */
export function getHospitalRoster(
  hospital: Building,
  entities: readonly Entity[],
  tick: number,
): HospitalRosterEntry {
  const patients: HospitalPatientEntry[] = [];
  for (const e of entities) {
    if (!e.alive || !isPlayerHuman(e)) continue;
    // Admission, not proximity: the same verified-ward test that grants hospital rest.
    if (!isRestingHospitalPatient(e, hospital, tick, e.indoorBuildingId)) continue;
    const reason = medicalCareReason(e, tick);
    if (reason) patients.push({ entity: e, reason });
  }
  patients.sort((a, b) => medicalUrgency(b.entity) - medicalUrgency(a.entity));
  return { hospitalId: hospital.id, patients };
}

/** Player-facing summary of a roster — the inspector renders these strings verbatim. */
export function describeHospitalRoster(
  entry: HospitalRosterEntry,
  hasDoctor: boolean,
): { headline: string; emptyHint: string | null } {
  return {
    headline: `In the ward ${entry.patients.length}`,
    emptyHint: entry.patients.length > 0
      ? null
      : hasDoctor
        ? 'Ward empty — settlers walk here when expecting, exhausted or grieving.'
        : 'No doctor assigned — only a staffed hospital treats patients.',
  };
}

/** Nearest staffed hospital to walk to (undefined when already there, or none exist). */
export function pickHospitalWalkTarget(
  entity: Pick<Entity, 'x' | 'y'>,
  hospitals: readonly Building[],
): Building | undefined {
  let best: Building | undefined;
  let bestD = Infinity;
  for (const h of hospitals) {
    const centre = getBuildingCenter(h);
    const d = Math.hypot(entity.x - centre.x, entity.y - centre.y);
    if (d < bestD) {
      bestD = d;
      best = h;
    }
  }
  // Already at the ward (a walkable frontage is in reach) or no staffed hospital at all — stay put.
  return best && !isAtBuildingReach(entity, best) ? best : undefined;
}

/**
 * Apply treatment when a patient is at a staffed hospital.
 * Returns true if care was given.
 */
export function treatPatientAtHospital(
  state: WorldState,
  patient: Entity,
  hospital: Building,
  opts?: { doctorPresent?: boolean },
): boolean {
  if (!patient.alive || !isPlayerHuman(patient)) return false;
  if (hospital.occupants.length === 0) return false;

  const doctorOnSite = opts?.doctorPresent ?? hospital.occupants.some((id) => {
    const d = state.entities.find((e) => e.id === id && e.alive);
    return !!d && isAtBuildingReach(d, hospital);
  });

  const strength = 0.55 + hospital.occupants.length * 0.2 + (doctorOnSite ? 0.35 : 0);
  const heal = Math.min(
    patient.maxEnergy - patient.energy,
    (8 + strength * 14) * (patient.pregnant ? 0.7 : 1),
  );
  if (heal < 0.5) return false;

  // Light medicine cost occasionally — spend through the day ledger so the
  // "why is my food low?" view sees the medicine line like every other meal.
  if (state.resources.food >= 1 && personDayRoll(patient.id, state.tick, 902) < 0.25) {
    spendFood(state, 'medicine', 1);
  }

  // Medical recovery is stamina in the new physiology model. Keep the legacy
  // projection in sync so the next metabolism tick cannot erase paid treatment.
  adjustHumanStaminaFromEnergy(patient, heal);
  // Pregnancy progress is owned only by humanLifecycle.tickPregnancyAndBirth.

  for (const id of hospital.occupants) {
    gainSkill(state, id, JobType.Doctor, 0.08);
  }

  if (personDayRoll(patient.id, state.tick, 903) < 0.35) {
    addFloatingText(
      state,
      patient.x,
      patient.y - 16,
      doctorOnSite ? '❤ Treated' : '❤ Resting',
      '#f472b6',
      'brief',
    );
  }
  if (!isDialogueBusy(patient) && personDayRoll(patient.id, state.tick, 904) < 0.2) {
    requestDialogue({ eventKey: patient.pregnant ? 'hospital.patient.pregnant' : 'hospital.patient.other', speaker: patient, tick: state.tick, durationHours: dialogueHoursFromNominalTicks(48), selectionRoll: personDayRoll(patient.id, state.tick, 905) });
  }
  return true;
}

/** Doctor on shift: treat the neediest patient near the ward. */
export function doctorTreatNearby(
  state: WorldState,
  doctor: Entity,
  hospital: Building,
  patients: readonly Entity[],
): boolean {
  const centre = getBuildingCenter(hospital);
  // Doctor on site: at a reachable frontage of this ward, never a shifted footprint point.
  if (!isAtBuildingReach(doctor, hospital)) return false;

  let best: Entity | null = null;
  let bestU = 0;
  for (const p of patients) {
    if (p.id === doctor.id || !p.alive || !isPlayerHuman(p)) continue;
    const near = isAtBuildingReach(p, hospital)
      || Math.hypot(p.x - centre.x, p.y - centre.y) < HOSPITAL_WARD_RADIUS_PX;
    if (!near) continue;
    const u = medicalUrgency(p);
    if (u > bestU) {
      bestU = u;
      best = p;
    }
  }
  if (!best || bestU < 0.2) return false;
  if (personDayRoll(doctor.id, state.tick, 901 + best.id) > 0.35) return false;

  const ok = treatPatientAtHospital(state, best, hospital, { doctorPresent: true });
  if (ok && !isDialogueBusy(doctor) && personDayRoll(doctor.id, state.tick, 906) < 0.3) {
    requestDialogue({ eventKey: 'hospital.doctor', speaker: doctor, tick: state.tick, durationHours: dialogueHoursFromNominalTicks(44), selectionRoll: personDayRoll(doctor.id, state.tick, 907) });
  }
  return ok;
}

/**
 * Daily ward rounds — heal a few of the sickest settlers if they are near the hospital
 * or randomly "admit" urgent cases (teleport-free: only those already close).
 */
export function tickHospitalDailyCare(
  state: WorldState,
  hospital: Building,
  humans: readonly Entity[],
): void {
  if (!hospital.completed || hospital.occupants.length === 0) return;

  const centre = getBuildingCenter(hospital);
  const patients = humans
    .filter((h) => h.alive && isPlayerHuman(h) && needsMedicalCare(h, state.tick))
    .sort((a, b) => medicalUrgency(b) - medicalUrgency(a));

  let treated = 0;
  for (const p of patients) {
    if (treated >= 2 + hospital.occupants.length) break;
    const near = isAtBuildingReach(p, hospital)
      || Math.hypot(p.x - centre.x, p.y - centre.y) < HOSPITAL_WARD_RADIUS_PX;
    // Urgent cases farther away still get a small passive "clinic" benefit if staffed
    if (!near && medicalUrgency(p) < 0.7) continue;
    // Doctor presence is the ward's own occupant scan — a patient standing near the
    // building is not evidence that a doctor is on site.
    if (treatPatientAtHospital(state, p, hospital)) {
      treated++;
    }
  }

  if (treated > 0) {
    addReputation(state, 1 + Math.min(2, treated));
    logWardNote(state, hospital, treated);
  }
}

function logWardNote(state: WorldState, hospital: Building, n: number): void {
  // The daily ward pass runs at 18:00, so a `tick % 864` test could never be true; key the note to
  // the colony day instead, once every third day.
  if (getAbsoluteCalendarDay(state.tick) % 3 !== 0) return;
  const centre = getBuildingCenter(hospital);
  addFloatingText(
    state,
    centre.x,
    centre.y - 14,
    `🏥 ${n} treated`,
    '#f9a8d4',
    'brief',
  );
}
