import { describe, expect, it } from 'vitest';
import { recordCareerWork, MAX_CREDITED_DAYS, normalizeCareerHistory } from '../src/game/careers/careerHistory';
import { getAbsoluteCalendarDay, TICKS_PER_DAY } from '../src/game/dayCycleClock';
import { JobType, BuildingType } from '../src/game/gameTypes';
import { human, building } from '../src/test/factories';
import { recordScheduleWorkTick, resolveDailyScheduleFatigue } from '../src/game/scheduleFatigue';
import { TICKS_PER_HOUR } from '../src/game/dayCycle';

const farm = building(10, BuildingType.Farm, { occupants: [1] });
const worker = () => human(1, {
  workerBuildingId: 10, job: JobType.Farmer,
  scheduleLastWorkedHours: 6, scheduleLastWorkedSiteId: 10,
});

describe('observed career history', () => {
  it('credits only once for a verified site, job and absolute day', () => {
    const h = worker();
    const day = getAbsoluteCalendarDay(TICKS_PER_DAY * 3 + TICKS_PER_HOUR * 12) - 1;
    expect(day).toBe(2);
    expect(recordCareerWork(h, farm, JobType.Farmer, day, 6)).toBe(true);
    expect(recordCareerWork(h, farm, JobType.Farmer, day, 6)).toBe(false);
    expect(h.careerHistory?.farmer).toEqual({ days: 1, lastDay: 2 });
    expect(recordCareerWork(h, farm, JobType.Farmer, day + 1, 6)).toBe(true);
    expect(h.careerHistory?.farmer?.days).toBe(2);
  });

  it('does not fabricate work for absence, unassigned, child, captive, rival or stale sites', () => {
    const base = worker();
    expect(recordCareerWork(base, farm, JobType.Farmer, 0, 0)).toBe(false);
    expect(recordCareerWork({ ...base, workerBuildingId: undefined }, farm, JobType.Farmer, 0, 4)).toBe(false);
    expect(recordCareerWork({ ...base, isJuvenile: true, age: 16 }, farm, JobType.Farmer, 0, 4)).toBe(false);
    expect(recordCareerWork({ ...base, age: 17 }, farm, JobType.Farmer, 0, 4)).toBe(false);
    expect(recordCareerWork({ ...base, alive: false }, farm, JobType.Farmer, 0, 4)).toBe(false);
    expect(recordCareerWork({ ...base, faction: 'rival' }, farm, JobType.Farmer, 0, 4)).toBe(false);
    expect(recordCareerWork({ ...base, faction: 'visitor' }, farm, JobType.Farmer, 0, 4)).toBe(false);
    expect(recordCareerWork({ ...base, prisonBuildingId: 7 }, farm, JobType.Farmer, 0, 4)).toBe(false);
    expect(recordCareerWork({ ...base, scheduleLastWorkedSiteId: 11 }, farm, JobType.Farmer, 0, 4)).toBe(false);
    expect(recordCareerWork({ ...base, job: JobType.Hunter }, farm, JobType.Farmer, 0, 4)).toBe(false);
    expect(recordCareerWork(base, { ...farm, completed: false }, JobType.Farmer, 0, 4)).toBe(false);
    expect(recordCareerWork(base, { ...farm, occupants: [] }, JobType.Farmer, 0, 4)).toBe(false);
    expect(recordCareerWork(base, { ...farm, faction: 'rival' }, JobType.Farmer, 0, 4)).toBe(false);
    expect(base.careerHistory).toBeUndefined();
  });

  it('does not attribute mixed-site shifts to the last assigned building', () => {
    const h = worker();
    h.scheduleWorkedTicksToday = undefined;
    recordScheduleWorkTick(h, TICKS_PER_HOUR);
    h.workerBuildingId = 11;
    recordScheduleWorkTick(h, TICKS_PER_HOUR);
    h.workerBuildingId = 10;
    resolveDailyScheduleFatigue(h, { workSchedule: { startHour: 8, endHour: 17 } });
    expect(h.scheduleLastWorkedHours).toBe(2);
    expect(h.scheduleLastWorkedSiteId).toBe(-1);
    expect(recordCareerWork(h, farm, JobType.Farmer, 0, 2)).toBe(false);
    expect(h.careerHistory).toBeUndefined();
  });

  it('keeps full-storage attendance eligible and saturates without redundant records', () => {
    const h = worker();
    h.careerHistory = { farmer: { days: MAX_CREDITED_DAYS - 1, lastDay: 5 } };
    expect(recordCareerWork(h, farm, JobType.Farmer, 6, 3)).toBe(true);
    expect(recordCareerWork(h, farm, JobType.Farmer, 7, 3)).toBe(false);
    expect(h.careerHistory?.farmer?.days).toBe(MAX_CREDITED_DAYS);
  });

  it('rejects malformed jobs, counters and prototype-shaped history', () => {
    expect(normalizeCareerHistory({ farmer: { days: 3, lastDay: 9 } })).toEqual({ farmer: { days: 3, lastDay: 9 } });
    expect(normalizeCareerHistory({ farmer: { days: -2, lastDay: 4 } })).toBeUndefined();
    expect(normalizeCareerHistory({ farmer: { days: '3', lastDay: 4 } })).toBeUndefined();
    expect(normalizeCareerHistory({ farmer: { days: NaN, lastDay: 4 } })).toBeUndefined();
    expect(normalizeCareerHistory({ invalidJob: { days: 4, lastDay: 4 } })).toBeUndefined();
    const cyclic: Record<string, unknown> = {}; cyclic.farmer = cyclic;
    expect(normalizeCareerHistory(cyclic)).toBeUndefined();
  });
});
