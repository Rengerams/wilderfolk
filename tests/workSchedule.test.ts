import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WORK_END_HOUR,
  DEFAULT_WORK_START_HOUR,
  getWorkSchedule,
  getWorkScheduleHours,
  setWorkSchedule,
  validateWorkSchedule,
} from '../src/game/workSchedule';
import { initGame } from '../src/game/worldGen';
import { applyWorkerCommand, isWorkerCommand } from '../src/game/simWorker/commands';
import { pickWorldFieldsForSave } from '../src/game/saveSchema';


describe('ordinary work schedule', () => {
  it('uses the 07:00–16:00 default for new and legacy-shaped worlds', () => {
    const world = initGame({ skipTerrain: true });
    expect(getWorkSchedule(world)).toEqual({ startHour: DEFAULT_WORK_START_HOUR, endHour: DEFAULT_WORK_END_HOUR });
    expect(getWorkSchedule({ workSchedule: undefined })).toEqual({ startHour: 7, endHour: 16 });
  });

  it('accepts bounded non-wrapping windows and rejects unsafe windows', () => {
    expect(validateWorkSchedule(8, 17)).toMatchObject({ ok: true, schedule: { startHour: 8, endHour: 17 } });
    expect(validateWorkSchedule(20, 4).ok).toBe(false);
    expect(validateWorkSchedule(8, 12).ok).toBe(false);
    expect(validateWorkSchedule(6, 23).ok).toBe(false);
  });

  it('accepts the typed command, rejects unsafe values, and persists the field', () => {
    const world = initGame({ skipTerrain: true });
    expect(isWorkerCommand({ proto: 1, op: 'setWorkSchedule', startHour: 8, endHour: 17 })).toBe(true);
    expect(isWorkerCommand({ proto: 1, op: 'setWorkSchedule', startHour: 20, endHour: 4 })).toBe(false);
    const changed = applyWorkerCommand(world, { proto: 1, op: 'setWorkSchedule', startHour: 8, endHour: 17 });
    expect(getWorkSchedule(changed)).toEqual({ startHour: 8, endHour: 17 });
    expect(pickWorldFieldsForSave(changed).workSchedule).toEqual({ startHour: 8, endHour: 17 });
  });

  it('changes only the authoritative schedule and preserves the original state', () => {
    const world = initGame({ skipTerrain: true });
    const changed = setWorkSchedule(world, 9, 17);
    expect(getWorkSchedule(world)).toEqual({ startHour: 7, endHour: 18 });
    expect(getWorkSchedule(changed)).toEqual({ startHour: 9, endHour: 17 });
    expect(getWorkScheduleHours(getWorkSchedule(changed))).toBe(8);
  });
});
