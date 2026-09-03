/**
 * Hospital ↔ people: visits, treatments, doctor-on-duty care.
 */
import type { Building, Entity, WorldState } from './gameTypes';
import { BuildingType, JobType } from './gameTypes';
import { personDayRoll, TICKS_PER_DAY } from './dayCycle';
import { addFloatingText } from './simEffects';
import { addReputation } from './simHelpers';
import { sayHumanChatPhrase } from './humanChat';
import { gainSkill } from './skills';
import { isPlayerHuman } from './playerHuman';

export function findStaffedHospital(buildings: readonly Building[]): Building | undefined {
  return buildings.find(
    (b) =>
      b.completed
      && b.type === BuildingType.Hospital
      && b.faction !== 'rival'
      && b.occupants.length > 0,
  );
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

export function needsMedicalCare(entity: Entity): boolean {
  if (!entity.alive || entity.isJuvenile === undefined) return false;
  if (entity.pregnant) return true;
  if (entity.energy < entity.maxEnergy * 0.42) return true;
  if ((entity.griefUntilTick ?? 0) > 0 && entity.energy < entity.maxEnergy * 0.7) return true;
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

  // Light medicine cost occasionally
  if (state.resources.food >= 1 && Math.random() < 0.25) {
    state.resources.food -= 1;
  }

  patient.energy = Math.min(patient.maxEnergy, patient.energy + heal);
  if (patient.pregnant && Math.random() < 0.15) {
    // Steady care — nudge pregnancy safely (no skip)
    patient.pregnancyProgress = Math.min(99, (patient.pregnancyProgress ?? 0) + 0.15);
  }

  for (const id of hospital.occupants) {
    gainSkill(state, id, JobType.Doctor, 0.08);
  }

  if (Math.random() < 0.35) {
    addFloatingText(
      state,
      patient.x,
      patient.y - 16,
      doctorOnSite ? '❤ Treated' : '❤ Resting',
      '#f472b6',
      'brief',
    );
  }
  if ((patient.chatTicks ?? 0) <= 0 && Math.random() < 0.2) {
    sayHumanChatPhrase(
      patient,
      patient.pregnant
        ? (Math.random() < 0.5 ? 'The child is well…' : 'Thank you, doctor.')
        : (Math.random() < 0.5 ? 'I feel better.' : 'Medicine helps.'),
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
  if (ok && (doctor.chatTicks ?? 0) <= 0 && Math.random() < 0.3) {
    sayHumanChatPhrase(
      doctor,
      Math.random() < 0.5 ? 'Rest and drink water.' : 'You will mend.',
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
    .filter((h) => h.alive && isPlayerHuman(h) && needsMedicalCare(h))
    .sort((a, b) => medicalUrgency(b) - medicalUrgency(a));

  let treated = 0;
  for (const p of patients) {
    if (treated >= 2 + hospital.occupants.length) break;
    const near = Math.hypot(p.x - hx, p.y - hy) < 70;
    // Urgent cases farther away still get a small passive "clinic" benefit if staffed
    if (!near && medicalUrgency(p) < 0.7) continue;
    if (treatPatientAtHospital(state, p, hospital, { doctorPresent: near })) {
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
