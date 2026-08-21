import { describe, expect, it } from 'vitest';
import { BuildingType } from '../src/game/gameTypes';
import { getScheduleImpactPreview } from '../src/game/scheduleFeedback';

const state = {
  buildings: [
    { id: 1, type: BuildingType.Farm, completed: true, occupants: [10], x: 0, y: 0, width: 1, height: 1 },
    { id: 2, type: BuildingType.Tavern, completed: true, occupants: [11], x: 0, y: 0, width: 1, height: 1 },
    { id: 3, type: BuildingType.Hotel, completed: true, occupants: [], x: 0, y: 0, width: 1, height: 1 },
  ],
  entities: [
    { id: 10, alive: true, faction: undefined },
    { id: 11, alive: true, faction: undefined },
  ],
} as never;

describe('schedule feedback previews', () => {
  it('counts affected ordinary workplaces and assigned workers', () => {
    const preview = getScheduleImpactPreview(state, 'ordinary', 8, 10);
    expect(preview.affectedWorkplaces).toBe(1);
    expect(preview.assignedWorkers).toBe(1);
    expect(preview.durationDelta).toBe(2);
    expect(preview.warning).toContain('fatigue');
  });

  it('keeps Tavern and Hotel affected counts independent', () => {
    expect(getScheduleImpactPreview(state, 'tavern', 6, 4).affectedWorkplaces).toBe(1);
    expect(getScheduleImpactPreview(state, 'hotel', 16, 12).affectedWorkplaces).toBe(1);
  });

  it('explains unchanged schedules without warning the player about fatigue', () => {
    const preview = getScheduleImpactPreview(state, 'ordinary', 8, 8);
    expect(preview.warning).toContain('No workload change');
  });
});
