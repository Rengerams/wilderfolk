import { personDayRoll } from './simRng';
/**
 * Hospital ↔ people: visits, treatments, doctor-on-duty care.
 */
import type { Building, Entity, WorldState } from './gameTypes';
import { BuildingType, JobType } from './gameTypes';
import { PRODUCTION_INTERVAL, TICKS_PER_DAY } from './dayCycle';
import { addFloatingText } from './simEffects';
import { addReputation } from './simHelpers';
import { isDialogueBusy } from './humanChat';
import { requestDialogue, dialogueHoursFromNominalTicks } from './dialogueTrees';
import { gainSkill } from './skills';
import { isPlayerHuman } from './playerHuman';
import { spendFood } from './economyLedger';
import { adjustHumanStaminaFromEnergy } from './simulation/humanPhysiology';

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
 * the ward round's own grant for the patients it treats. `dailyBuildingEconomy` decides *when* the
 * interval fires and no longer adds reputation itself, so the amount a hospital produces is
 * readable from this module alone.
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
 * The single player-facing description of the hospital reputation rule. The build tooltip
 * (`SelectedBuildingPanel`) and the More-tab guide both render this, so the advertised amount
 * cannot drift from what the ward pays.
 */
export function describeHospitalReputation(): string {
  return `Staffed: +${HOSPITAL_REPUTATION_PER_INTERVAL} reputation every ${HOSPITAL_REPUTATION_INTERVAL_DAYS} days,`
    + ` up to +${HOSPITAL_TREATMENT_REPUTATION_MAX} more when patients are treated. Any hospital lowers energy drain.`;
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
 * Whether this settler should seek medical care.
 *
 * `tick` is required because the grief window is an absolute deadline: comparing it with `0`
 * made every settler who had *ever* grieved a permanent walk-in candidate.
 */
export function needsMedicalCare(entity: Entity, tick: number): boolean {
  if (!entity.alive || entity.isJuvenile === undefined) return false;
  if (entity.pregnant) return true;
  if (entity.energy < entity.maxEnergy * 0.42) return true;
  if ((entity.griefUntilTick ?? 0) > tick && entity.energy < entity.maxEnergy * 0.7) return true;
  return false;
}

/** How urgently this settler should seek the hospital (0–1). */
export function medicalUrgency(entity: Entity): number {
  // pregnancyProgress runs ~0..PREGNANCY_TICKS (~24 days); scale urgency over the term
  if (entity.pregnant) {
    const term = Math.max(1, entity.pregnancyProgress ?? 0);
    return 0.55 + Math.min(0.4, term / 1800);
  }
  const energyRatio = entity.energy / Math.max(1, entity.maxEnergy);
  if (energyRatio < 0.28) return 0.85;
  if (energyRatio < 0.42) return 0.55;
  if (energyRatio < 0.55) return 0.3;
  return 0;
}

/** The owner's own reason this settler needs care, or `null` — the roster renders it verbatim. */
export function medicalCareReason(entity: Entity, tick: number): string | null {
  if (!needsMedicalCare(entity, tick)) return null;
  if (entity.pregnant) return 'expecting';
  if (entity.energy < entity.maxEnergy * 0.42) return 'exhausted';
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

/** Who is in the ward, each with the owner's reason — the same reach the ward round treats by. */
export function getHospitalRoster(
  hospital: Building,
  entities: readonly Entity[],
  tick: number,
): HospitalRosterEntry {
  const hx = hospital.x + hospital.width / 2;
  const hy = hospital.y + hospital.height / 2;
  const patients: HospitalPatientEntry[] = [];
  for (const e of entities) {
    if (!e.alive || !isPlayerHuman(e)) continue;
    if (Math.hypot(e.x - hx, e.y - hy) > HOSPITAL_WARD_RADIUS_PX) continue;
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
    const d = Math.hypot(entity.x - (h.x + h.width / 2), entity.y - (h.y + h.height / 2));
    if (d < bestD) {
      bestD = d;
      best = h;
    }
  }
  // Already at the ward (<= 28px) or no staffed hospital at all — stay put.
  return best && bestD > 28 ? best : undefined;
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
    return !!d && Math.hypot(d.x - (hospital.x + hospital.width / 2), d.y - (hospital.y + hospital.height / 2)) < 48;
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
  const hx = hospital.x + hospital.width / 2;
  const hy = hospital.y + hospital.height * 0.9;
  // Doctor should be near the hospital
  if (Math.hypot(doctor.x - hx, doctor.y - hy) > 55) return false;

  let best: Entity | null = null;
  let bestU = 0;
  for (const p of patients) {
    if (p.id === doctor.id || !p.alive || !isPlayerHuman(p)) continue;
    if (Math.hypot(p.x - hx, p.y - hy) > 60) continue;
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

  const hx = hospital.x + hospital.width / 2;
  const hy = hospital.y + hospital.height / 2;
  const patients = humans
    .filter((h) => h.alive && isPlayerHuman(h) && needsMedicalCare(h, state.tick))
    .sort((a, b) => medicalUrgency(b) - medicalUrgency(a));

  let treated = 0;
  for (const p of patients) {
    if (treated >= 2 + hospital.occupants.length) break;
    const near = Math.hypot(p.x - hx, p.y - hy) < HOSPITAL_WARD_RADIUS_PX;
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
  if (state.tick % (TICKS_PER_DAY * 3) !== 0) return;
  addFloatingText(
    state,
    hospital.x + hospital.width / 2,
    hospital.y - 14,
    `🏥 ${n} treated`,
    '#f9a8d4',
    'brief',
  );
}
