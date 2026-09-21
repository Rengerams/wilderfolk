/**
 * Hospital ↔ people: visits, treatments, doctor-on-duty care.
 */
import type { Building, Entity, WorldState } from './gameTypes';
import { BuildingType, JobType } from './gameTypes';
import { personDayRoll, PRODUCTION_INTERVAL, TICKS_PER_DAY } from './dayCycle';
import { addFloatingText } from './simEffects';
import { addReputation } from './simHelpers';
import { isDialogueBusy, sayHumanChatPhrase } from './humanChat';
import { gainSkill } from './skills';
import { isPlayerHuman } from './playerHuman';
import { recordFoodConsumed } from './economyLedger';

/** Flat reputation a staffed hospital grants on each production interval. */
export const HOSPITAL_REPUTATION_PER_INTERVAL = 2;

/** Most the ward round can add on top of the flat grant (`1 + min(2, treated)`). */
export const HOSPITAL_TREATMENT_REPUTATION_MAX = 3;

/** Days between staffed-hospital grants — `PRODUCTION_INTERVAL.hospital`, for the UI copy. */
export const HOSPITAL_REPUTATION_INTERVAL_DAYS = PRODUCTION_INTERVAL.hospital / TICKS_PER_DAY;

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
  if (entity.job !== JobType.Doctor || entity.homeBuildingId == null) return undefined;
  const h = buildings.find((b) => b.id === entity.homeBuildingId);
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
    state.resources.food -= 1;
    recordFoodConsumed(state, 'medicine', 1);
  }

  patient.energy = Math.min(patient.maxEnergy, patient.energy + heal);
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
    const lineRoll = personDayRoll(patient.id, state.tick, 905);
    sayHumanChatPhrase(
      patient,
      patient.pregnant
        ? (lineRoll < 0.5 ? 'The child is well…' : 'Thank you, doctor.')
        : (lineRoll < 0.5 ? 'I feel better.' : 'Medicine helps.'),
      48,
    );
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
    sayHumanChatPhrase(
      doctor,
      personDayRoll(doctor.id, state.tick, 907) < 0.5 ? 'Rest and drink water.' : 'You will mend.',
      44,
    );
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
    const near = Math.hypot(p.x - hx, p.y - hy) < 70;
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
