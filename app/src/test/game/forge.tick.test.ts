import { describe, expect, it } from 'vitest';
import { initGame } from '@/game/gameEngine';
import { tickVillageForge } from '@/game/forge';
import { BuildingType } from '@/game/gameTypes';
import { createBuilding } from '@/game/worldGen';

describe('tickVillageForge', () => {
  it('clears a corrupted activeOrder instead of jamming the queue', () => {
    const state = initGame();
    const smith = createBuilding(BuildingType.Blacksmith, 200, 200, 50, 0);
    smith.completed = true;
    smith.occupants.push(state.entities.find((e) => e.alive)!.id);
    state.buildings.push(smith);
    state.villageForge.activeOrder = 'not_a_real_order' as never;
    state.villageForge.progress = 40;

    tickVillageForge(state, state.buildings);

    expect(state.villageForge.activeOrder).toBeNull();
    expect(state.villageForge.progress).toBe(0);
  });
});