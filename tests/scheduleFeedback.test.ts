import { describe, expect, it } from 'vitest';
import { BuildingType, EntityType } from '../src/game/gameTypes';
import { getScheduleImpactPreview } from '../src/game/scheduleFeedback';

const normal = { startHour: 7, endHour: 16 };
const longer = { startHour: 7, endHour: 18 };
const shifted = { startHour: 8, endHour: 17 };
const shorter = { startHour: 7, endHour: 13 };

const state = {
  buildings: [
    { id: 1, type: BuildingType.Farm, completed: true, occupants: [10] },
    { id: 2, type: BuildingType.Tavern, completed: true, occupants: [11] },
    { id: 3, type: BuildingType.Hotel, completed: true, occupants: [] },
  ],
  entities: [
    { id: 10, type: EntityType.Human, alive: true, age: 30, workerBuildingId: 1 },
    { id: 11, type: EntityType.Human, alive: true, age: 30, workerBuildingId: 2 },
  ],
} as never;

describe('schedule feedback previews', () => {
  it('counts ordinary workplaces by real assignments and previews longer hours', () => {
    const preview = getScheduleImpactPreview(state, 'ordinary', normal, longer);
    expect(preview.affectedWorkplaces).toBe(1);
    expect(preview.assignedWorkers).toBe(1);
    expect(preview.expectedHours).toBe(11);
    expect(preview.durationDelta).toBe(2);
    expect(preview.warning).toContain('fatigue');
  });

  it('keeps Tavern and Hotel counts independent', () => {
    const tavern = getScheduleImpactPreview(state, 'tavern', normal, shorter);
    const hotel = getScheduleImpactPreview(state, 'hotel', normal, longer);
    expect(tavern.affectedWorkplaces).toBe(1);
    expect(tavern.assignedWorkers).toBe(1);
    expect(tavern.warning).toContain('opening time');
    expect(hotel.affectedWorkplaces).toBe(1);
    expect(hotel.assignedWorkers).toBe(0);
    expect(hotel.warning).toContain('staffing');
  });

  it('does not infer jobs from occupants or non-human entities', () => {
    const preview = getScheduleImpactPreview({
      buildings: [
        { id: 1, type: BuildingType.Farm, completed: true, occupants: [12, 13] },
      ],
      entities: [
        { id: 10, type: EntityType.Human, alive: true, age: 30, workerBuildingId: 1 },
        { id: 12, type: EntityType.Deer, alive: true, age: 30, workerBuildingId: 1 },
        { id: 13, type: EntityType.Human, alive: true, age: 30, workerBuildingId: 999 },
      ],
    } as never, 'ordinary', normal, longer);
    expect(preview.assignedWorkers).toBe(1);
  });

  it('excludes prisoners, dead settlers, minors and foreign factions', () => {
    const preview = getScheduleImpactPreview({
      buildings: [{ id: 1, type: BuildingType.Farm, completed: true, occupants: [10, 11, 12, 13, 14] }],
      entities: [
        { id: 10, type: EntityType.Human, alive: true, age: 30, workerBuildingId: 1, prisonBuildingId: 8 },
        { id: 11, type: EntityType.Human, alive: false, age: 30, workerBuildingId: 1 },
        { id: 12, type: EntityType.Human, alive: true, age: 1, workerBuildingId: 1 },
        { id: 13, type: EntityType.Human, alive: true, age: 30, workerBuildingId: 1, faction: 'rival' },
        { id: 14, type: EntityType.Human, alive: true, age: 30, workerBuildingId: 1 },
      ],
    } as never, 'ordinary', normal, longer);
    expect(preview.assignedWorkers).toBe(1);
  });

  it('includes active construction crews without double-counting regular workers', () => {
    const preview = getScheduleImpactPreview({
      buildings: [
        { id: 1, type: BuildingType.Farm, completed: true, occupants: [10] },
        { id: 2, type: BuildingType.House, completed: false, constructionProgress: 45, occupants: [11, 12, 13, 10] },
        { id: 3, type: BuildingType.Lamp, completed: false, constructionProgress: 10, occupants: [] },
        { id: 4, type: BuildingType.Mine, completed: false, constructionProgress: 100, occupants: [14] },
      ],
      entities: [
        { id: 10, type: EntityType.Human, alive: true, age: 30, workerBuildingId: 1 },
        { id: 11, type: EntityType.Human, alive: true, age: 30 },
        { id: 12, type: EntityType.Human, alive: true, age: 30, prisonBuildingId: 9 },
        { id: 13, type: EntityType.Human, alive: false, age: 30 },
        { id: 14, type: EntityType.Human, alive: true, age: 30 },
      ],
    } as never, 'ordinary', normal, longer);
    expect(preview.affectedWorkplaces).toBe(3);
    expect(preview.assignedWorkers).toBe(2);
  });

  it('excludes fixed-schedule workplaces from ordinary hours', () => {
    const preview = getScheduleImpactPreview({
      buildings: [
        { id: 1, type: BuildingType.Church, completed: true, occupants: [10] },
        { id: 2, type: BuildingType.School, completed: true, occupants: [11] },
        { id: 3, type: BuildingType.TownHall, completed: true, occupants: [12] },
      ],
      entities: [10, 11, 12].map((id) => ({
        id, type: EntityType.Human, alive: true, age: 30, workerBuildingId: id - 9,
      })),
    } as never, 'ordinary', normal, longer);
    expect(preview.affectedWorkplaces).toBe(0);
    expect(preview.assignedWorkers).toBe(0);
  });

  it('uses the ordinary schedule owner to clamp malformed negative durations', () => {
    const preview = getScheduleImpactPreview(
      state, 'ordinary', { startHour: 18, endHour: 7 }, normal,
    );
    expect(preview.expectedHours).toBe(9);
    expect(preview.durationDelta).toBe(9);
  });

  it('recognizes a shifted window with the same duration', () => {
    const preview = getScheduleImpactPreview(state, 'ordinary', normal, shifted);
    expect(preview.durationDelta).toBe(0);
    expect(preview.warning).toContain('Shift times change');
  });

  it('does not warn for an unchanged window', () => {
    const preview = getScheduleImpactPreview(state, 'ordinary', normal, normal);
    expect(preview.warning).toContain('No workload change');
  });

  it('reads the entity roster once even for many staffed buildings', () => {
    const entities = Array.from({ length: 2500 }, (_, id) => ({
      id,
      type: EntityType.Human,
      alive: true,
      age: 30,
      workerBuildingId: id >= 2400 && id < 2480 ? id - 2399 : undefined,
    }));
    let entityVisits = 0;
    const trackedEntities = new Proxy(entities, {
      get(target, key, receiver) {
        if (typeof key === 'string' && /^\d+$/.test(key)) entityVisits++;
        return Reflect.get(target, key, receiver);
      },
    });
    const buildings = Array.from({ length: 80 }, (_, index) => ({
      id: index + 1, type: BuildingType.Farm, completed: true, occupants: [],
    }));
    const preview = getScheduleImpactPreview(
      { buildings, entities: trackedEntities } as never, 'ordinary', normal, longer,
    );
    expect(preview.assignedWorkers).toBe(80);
    expect(entityVisits).toBeLessThanOrEqual(entities.length);
  });
});
