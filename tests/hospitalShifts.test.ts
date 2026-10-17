import { describe, expect, it } from 'vitest';
import type { Building } from '../src/game/gameTypes';
import { BuildingType } from '../src/game/gameTypes';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/game/dayCycleClock';
import {
  HOSPITAL_SHIFT_HOURS,
  hospitalDoctorRoster,
  doctorHospitalShift,
  isHospitalDoctorOnShift,
  isHospitalDoctorCommuteTime,
  hospitalCoverageSummary,
} from '../src/game/hospitalShifts';

const hospital = (ids: number[]): Building => ({
  id: 42, type: BuildingType.Hospital, occupants: ids, completed: true,
} as Building);

describe('hospital 24-hour rota with five doctors', () => {
  const ward = hospital([1, 2, 3, 4, 5]);

  it('covers every hour each day and weekends, with three on duty and two resting', () => {
    for (let day = 0; day < 14; day++) {
      const roster = hospitalDoctorRoster(ward, day);
      expect(roster).toHaveLength(3);
      expect(new Set(roster.map((s) => s.doctorId)).size).toBe(3);
      expect(roster.map((s) => [s.startHour, s.endHour])).toEqual([[0, 8], [8, 16], [16, 24]]);
      for (let hour = 0; hour < 24; hour++) {
        const active = ward.occupants.filter((id) =>
          isHospitalDoctorOnShift(ward, day * TICKS_PER_DAY + hour * TICKS_PER_HOUR, id),
        );
        expect(active).toEqual([roster[Math.floor(hour / 8)].doctorId]);
      }
    }
    expect(hospitalCoverageSummary(ward)).toContain('24-hour coverage scheduled');
  });

  it('rotates work and days off fairly across five doctors', () => {
    const counts = new Map<number, number>();
    for (let day = 0; day < 5; day++) {
      for (const shift of hospitalDoctorRoster(ward, day)) {
        counts.set(shift.doctorId, (counts.get(shift.doctorId) ?? 0) + 1);
      }
    }
    for (const id of ward.occupants) expect(counts.get(id)).toBe(3);
    expect(HOSPITAL_SHIFT_HOURS).toBe(8);
  });

  it('starts the midnight shift commute before midnight', () => {
    const tomorrow = hospitalDoctorRoster(ward, 1)[0].doctorId;
    const prevNight = 23 * TICKS_PER_HOUR;
    expect(isHospitalDoctorOnShift(ward, prevNight, tomorrow)).toBe(false);
    expect(isHospitalDoctorCommuteTime(ward, prevNight, tomorrow, 1.5)).toBe(true);
    expect(isHospitalDoctorOnShift(ward, TICKS_PER_DAY, tomorrow)).toBe(true);
    expect(doctorHospitalShift(ward, TICKS_PER_DAY, tomorrow)?.startHour).toBe(0);
  });

  it('never invents extra staff coverage when only one or two doctors are assigned', () => {
    expect(hospitalDoctorRoster(hospital([]), 0)).toEqual([]);
    expect(hospitalDoctorRoster(hospital([1]), 0)).toHaveLength(1);
    expect(hospitalDoctorRoster(hospital([1, 2]), 0)).toHaveLength(2);
    expect(hospitalCoverageSummary(hospital([1, 2]))).toContain('2 of 3');
  });
});
