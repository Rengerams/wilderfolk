/** Deterministic round-the-clock hospital shifts, rotated by day and posted doctor ID. */
import type { Building } from './gameTypes';
import { TICKS_PER_HOUR, getAbsoluteCalendarDay, getHourOfDay } from './dayCycleClock';

export const HOSPITAL_SHIFT_HOURS = 8;
export const HOSPITAL_SHIFTS_PER_DAY = 3;

/** One source for shift windows used by the roster and the inspector. */
export const HOSPITAL_SHIFT_WINDOWS = Array.from({ length: HOSPITAL_SHIFTS_PER_DAY }, (_, slot) => ({
  startHour: slot * HOSPITAL_SHIFT_HOURS,
  endHour: (slot + 1) * HOSPITAL_SHIFT_HOURS,
  label: (['Night', 'Day', 'Evening'] as const)[slot] ?? `Shift ${slot + 1}`,
}));

export interface HospitalDoctorShift {
  doctorId: number;
  startHour: number;
  endHour: number;
}

/** Return a deterministic daily roster; with fewer than 3 doctors some shifts stay empty. */
export function hospitalDoctorRoster(hospital: Pick<Building, 'occupants'>, day: number): HospitalDoctorShift[] {
  const posted = hospital.occupants;
  if (!posted.length) return [];
  const used = Math.min(posted.length, HOSPITAL_SHIFTS_PER_DAY);
  const out: HospitalDoctorShift[] = [];
  for (let slot = 0; slot < used; slot++) {
    const index = ((day * HOSPITAL_SHIFTS_PER_DAY + slot) % posted.length + posted.length) % posted.length;
    const window = HOSPITAL_SHIFT_WINDOWS[slot];
    out.push({ doctorId: posted[index], startHour: window.startHour, endHour: window.endHour });
  }
  return out;
}

/** Compute a doctor's shift slot without allocating a roster. */
function hospitalDoctorSlotForDay(
  hospital: Pick<Building, 'occupants'>,
  day: number,
  doctorId: number,
): number {
  const posted = hospital.occupants;
  const index = posted.indexOf(doctorId);
  if (index < 0) return -1;
  const slot = ((index - day * HOSPITAL_SHIFTS_PER_DAY) % posted.length + posted.length) % posted.length;
  return slot < HOSPITAL_SHIFTS_PER_DAY ? slot : -1;
}

export function doctorHospitalShift(
  hospital: Pick<Building, 'occupants'>,
  tick: number,
  doctorId: number,
): HospitalDoctorShift | undefined {
  const slot = hospitalDoctorSlotForDay(hospital, getAbsoluteCalendarDay(tick), doctorId);
  if (slot < 0) return undefined;
  const window = HOSPITAL_SHIFT_WINDOWS[slot];
  return { doctorId, startHour: window.startHour, endHour: window.endHour };
}

export function isHospitalDoctorOnShift(
  hospital: Pick<Building, 'occupants'>,
  tick: number,
  doctorId: number,
): boolean {
  const slot = hospitalDoctorSlotForDay(hospital, getAbsoluteCalendarDay(tick), doctorId);
  return slot >= 0 && Math.floor(getHourOfDay(tick) / HOSPITAL_SHIFT_HOURS) === slot;
}

/** Include the next day's midnight shift in the existing commute-lead window. */
export function isHospitalDoctorCommuteTime(
  hospital: Pick<Building, 'occupants'>,
  tick: number,
  doctorId: number,
  commuteLeadHours: number,
): boolean {
  if (isHospitalDoctorOnShift(hospital, tick, doctorId)) return true;
  const hour = tick / TICKS_PER_HOUR;
  const day = getAbsoluteCalendarDay(tick);
  const lead = Math.max(0, commuteLeadHours);
  for (let offset = 0; offset <= 1; offset++) {
    const slot = hospitalDoctorSlotForDay(hospital, day + offset, doctorId);
    if (slot < 0) continue;
    const starts = (day + offset) * 24 + slot * HOSPITAL_SHIFT_HOURS;
    const untilStart = starts - hour;
    if (untilStart > 0 && untilStart <= lead) return true;
  }
  return false;
}

export function hospitalCoverageSummary(hospital: Pick<Building, 'occupants'>): string {
  const staffed = Math.min(hospital.occupants.length, HOSPITAL_SHIFTS_PER_DAY);
  return staffed === HOSPITAL_SHIFTS_PER_DAY
    ? `24-hour coverage scheduled: ${HOSPITAL_SHIFTS_PER_DAY} × ${HOSPITAL_SHIFT_HOURS}-hour shifts, including weekends.`
    : `Coverage: ${staffed} of ${HOSPITAL_SHIFTS_PER_DAY} daily shifts. Assign at least ${HOSPITAL_SHIFTS_PER_DAY} doctors for 24-hour care.`;
}
