/**
 * Hospital staffing: three eight-hour shifts cover the entire 24-hour day.
 * With five doctors, three work (one per shift) and two are off daily.
 * The cyclic schedule rotates across the crew and covers weekends as well.
 * This is derived from the tick and posted worker IDs — no stored roster,
 * arbitrary random changes, or every-tick world scans.
 */
import type { Building } from './gameTypes';
import { TICKS_PER_DAY, TICKS_PER_HOUR, getAbsoluteCalendarDay, getHourOfDay } from './dayCycleClock';

export const HOSPITAL_SHIFT_HOURS = 8;
export const HOSPITAL_SHIFTS_PER_DAY = 3;

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
    out.push({ doctorId: posted[index], startHour: slot * HOSPITAL_SHIFT_HOURS, endHour: (slot + 1) * HOSPITAL_SHIFT_HOURS });
  }
  return out;
}

export function doctorHospitalShift(
  hospital: Pick<Building, 'occupants'>,
  tick: number,
  doctorId: number,
): HospitalDoctorShift | undefined {
  return hospitalDoctorRoster(hospital, getAbsoluteCalendarDay(tick)).find((s) => s.doctorId === doctorId);
}

export function isHospitalDoctorOnShift(
  hospital: Pick<Building, 'occupants'>,
  tick: number,
  doctorId: number,
): boolean {
  const shift = doctorHospitalShift(hospital, tick, doctorId);
  if (!shift) return false;
  const hour = getHourOfDay(tick);
  return hour >= shift.startHour && hour < shift.endHour;
}

/**
 * True if the doctor's next duty begins within their *existing* commute lead.
 * The next calendar day matters for the midnight shift (23:00 commute → 00:00).
 */
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
  for (const offset of [0, 1]) {
    const shift = hospitalDoctorRoster(hospital, day + offset).find((s) => s.doctorId === doctorId);
    if (!shift) continue;
    const starts = (day + offset) * 24 + shift.startHour;
    const untilStart = starts - hour;
    if (untilStart > 0 && untilStart <= lead) return true;
  }
  return false;
}

export function hospitalCoverageSummary(hospital: Pick<Building, 'occupants'>): string {
  const staffed = Math.min(hospital.occupants.length, HOSPITAL_SHIFTS_PER_DAY);
  return staffed === 3
    ? '24-hour care: 3 × 8-hour shifts, every day (including weekends).'
    : `Coverage: ${staffed} of 3 daily shifts. Assign at least 3 doctors for 24-hour care.`;
}
