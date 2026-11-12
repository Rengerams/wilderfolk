import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WORK_SCHEDULE,
  getWorkHourProductionMultiplier,
  getWorkSchedule,
  setWorkSchedule,
  validateWorkSchedule,
} from '../src/game/workSchedule';

const state = { workSchedule: { startHour: 7, endHour: 16 } };

describe('ordinary work window has no length restriction', () => {
  it('accepts any non-wrapping, whole-hour window', () => {
    // Any non-wrapping whole-hour window: a longer day costs fatigue and scales production rather
    // than being rejected.
    expect(validateWorkSchedule(6, 23).ok).toBe(true); // 17h
    expect(validateWorkSchedule(0, 23).ok).toBe(true); // 23h, the widest
    expect(validateWorkSchedule(9, 10).ok).toBe(true); // 1h, the narrowest
    expect(validateWorkSchedule(7, 16).ok).toBe(true); // the shipped default
  });

  it('still refuses a non-hour, a wrapping window, and an empty one', () => {
    expect(validateWorkSchedule(7, 24).ok).toBe(false); // 24 is not a clock hour
    expect(validateWorkSchedule(7.5, 16).ok).toBe(false);
    expect(validateWorkSchedule(22, 4).ok).toBe(false); // would wrap midnight
    expect(validateWorkSchedule(9, 9).ok).toBe(false); // empty
  });

  it('commits a long window that the old cap used to refuse', () => {
    const before = getWorkSchedule(state);
    const after = setWorkSchedule(state as never, 6, 23);

    expect(after).not.toBe(state);
    expect(getWorkSchedule(after as never)).toEqual({ startHour: 6, endHour: 23 });
    expect(before).toEqual(DEFAULT_WORK_SCHEDULE); // the input world was not mutated

    // A long window is the player's choice, and production scales with it (17/9).
    expect(getWorkHourProductionMultiplier(17)).toBeCloseTo(17 / 9, 5);
  });

  it('reports the default window as unchanged so the panel sends no command', () => {
    expect(validateWorkSchedule(7, 16, DEFAULT_WORK_SCHEDULE)).toEqual({
      ok: true,
      status: 'unchanged',
      schedule: { startHour: 7, endHour: 16 },
    });
  });

  it('answers the per-tick read from one normalized schedule until the hours change', () => {
    const configured = { workSchedule: { startHour: 6, endHour: 15 } };
    const first = getWorkSchedule(configured);

    // The scheduler and every per-settler caller read the same object for the same hours, even when
    // the worker delta hands them a fresh container each tick.
    expect(getWorkSchedule(configured)).toBe(first);
    expect(getWorkSchedule({ workSchedule: { ...configured.workSchedule } })).toBe(first);
    expect(first).toEqual({ startHour: 6, endHour: 15 });

    const changed = getWorkSchedule({ workSchedule: { startHour: 8, endHour: 17 } });
    expect(changed).not.toBe(first);
    expect(changed).toEqual({ startHour: 8, endHour: 17 });
  });
});
