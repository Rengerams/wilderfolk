import { describe, expect, it } from 'vitest';
import { BuildingType, JobType } from '@/game/gameTypes';
import type { Building } from '@/game/gameTypes';
import { getBarracksGuardCount, isBarracksGuard } from '@/game/defenseStructures';
import { initGame } from '@/game/gameEngine';
import { createEntity } from '@/game/worldGen';
import { EntityType } from '@/game/gameTypes';

describe('isBarracksGuard', () => {
  it('requires the human to be an occupant of the barracks', () => {
    const barracks: Building = {
      id: 10,
      type: BuildingType.Barracks,
      x: 0,
      y: 0,
      width: 40,
      height: 40,
      completed: true,
      constructionProgress: 100,
      occupants: [42],
      health: 100,
      maxHealth: 100,
      level: 1,
      buildAnimTimer: 0,
      spriteScale: 1,
    };
    expect(isBarracksGuard(42, 10, [barracks])).toBe(true);
    expect(isBarracksGuard(99, 10, [barracks])).toBe(false);
  });
});

describe('getBarracksGuardCount', () => {
  it('ignores imprisoned guards assigned to barracks', () => {
    const state = initGame();
    const barracks: Building = {
      id: 10,
      type: BuildingType.Barracks,
      x: 0,
      y: 0,
      width: 40,
      height: 40,
      completed: true,
      constructionProgress: 100,
      occupants: [],
      health: 100,
      maxHealth: 100,
      level: 1,
      buildAnimTimer: 0,
      spriteScale: 1,
    };
    const guard = createEntity(EntityType.Human, 0, 0, 42, 400, false, { ageYears: 25 });
    guard.job = JobType.Guard;
    guard.prisonBuildingId = 99;
    barracks.occupants.push(guard.id);
    state.entities.push(guard);
    state.buildings.push(barracks);

    expect(getBarracksGuardCount(state, [barracks])).toBe(0);
  });
});