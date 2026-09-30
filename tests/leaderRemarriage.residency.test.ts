/**
 * Leader remarriage residency regression — BUG 2026-08-28-leader-remarriage-residency.
 *
 * Scenario: the leader divorces and remarries. The marriage/divorce residence
 * owners deliberately exclude the Leader's House (they place couples in general
 * housing), so after a remarriage the new spouse would NOT join the manor. The
 * fix: `tickLayerDaily` now runs `syncLeaderHouseResidency` every colony day
 * after relationship reconciliation, which idempotently moves the current
 * leader household into the manor and evicts former members.
 */
import { describe, expect, it } from 'vitest';
import { BuildingType, EntityType, JobType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { LEADER_OCCUPATION, syncLeaderHouseResidency } from '../src/game/leaderHouse';

function human(id: number, overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    type: EntityType.Human,
    x: 10,
    y: 10,
    energy: 100,
    maxEnergy: 100,
    age: 30,
    birthYear: 0,
    birthMonth: 0,
    birthDay: 0,
    alive: true,
    size: 10,
    speed: 2,
    vx: 0,
    vy: 0,
    flash: 0,
    animFrame: 0,
    spriteAngle: 0,
    childrenIds: [],
    generation: 0,
    isJuvenile: false,
    job: JobType.Settler,
    ...overrides,
  } as Entity;
}

function building(id: number, type: BuildingType, overrides: Partial<Building> = {}): Building {
  return {
    id,
    type,
    x: 0,
    y: 0,
    width: 20,
    height: 20,
    occupants: [],
    level: 1,
    constructionProgress: 1,
    completed: true,
    health: 100,
    maxHealth: 100,
    spriteScale: 1,
    buildAnimTimer: 0,
    ...overrides,
  } as Building;
}

describe('leader remarriage residency', () => {
  it('moves the new spouse into the Leader\'s House after remarriage (daily reconciliation)', () => {
    const leader = human(1, {
      occupation: LEADER_OCCUPATION,
      partnerId: 5,
      relationshipStatus: 'married',
      residenceBuildingId: 10,
    });
    const newSpouse = human(5, { partnerId: 1, relationshipStatus: 'married', residenceBuildingId: 11, childrenIds: [3] });
    const formerSpouse = human(2, { residenceBuildingId: 10 }); // divorced earlier, still squatting in manor
    const child = human(3, { motherId: 5, isJuvenile: true });
    const manor = building(10, BuildingType.LeaderHouse, { occupants: [1, 2, 3] });
    const normalHouse = building(11, BuildingType.House, { occupants: [5] });
    const state = {
      entities: [leader, newSpouse, formerSpouse, child],
      buildings: [manor, normalHouse],
      villageLeaderId: 1,
      eventLog: [],
    } as unknown as WorldState;

    syncLeaderHouseResidency(state); // the daily call the daily layer now performs

    // New spouse joins the leader household in the manor.
    expect(leader.residenceBuildingId).toBe(10);
    expect(newSpouse.residenceBuildingId).toBe(10);
    expect(child.residenceBuildingId).toBe(10);
    expect(manor.occupants).toEqual([1, 5, 3]);
    // Former spouse (no longer part of the leader household) is evicted to general housing.
    expect(formerSpouse.residenceBuildingId).not.toBe(10);
    expect(formerSpouse.residenceBuildingId).toBe(11);
    expect(manor.occupants).not.toContain(2);
  });

  it('is idempotent — calling twice changes nothing', () => {
    const leader = human(1, {
      occupation: LEADER_OCCUPATION,
      partnerId: 5,
      relationshipStatus: 'married',
      residenceBuildingId: 10,
    });
    const newSpouse = human(5, { partnerId: 1, relationshipStatus: 'married', residenceBuildingId: 10 });
    const manor = building(10, BuildingType.LeaderHouse, { occupants: [1, 5] });
    const normalHouse = building(11, BuildingType.House);
    const state = {
      entities: [leader, newSpouse],
      buildings: [manor, normalHouse],
      villageLeaderId: 1,
      eventLog: [],
    } as unknown as WorldState;

    syncLeaderHouseResidency(state);
    const logLength = (state.eventLog ?? []).length;
    syncLeaderHouseResidency(state);

    expect((state.eventLog ?? []).length).toBe(logLength); // no repeat chronicle entry
    expect(manor.occupants).toEqual([1, 5]);
  });
});
