import { describe, expect, it, vi, afterEach } from 'vitest';
import { withRandomSequence } from '@/test/helpers/seededRandom';
import { initGame } from '@/game/gameEngine';
import { BuildingType, EntityType } from '@/game/gameTypes';
import { createEntity } from '@/game/worldGen';
import { EVENT_INTERVAL, WORK_START } from '@/game/dayCycle';
import { updateDisasters } from '@/game/worldEvents';
import { addCompletedBuilding, assignResidentToHouse } from '@/test/fixtures/gameFixtures';

/** Rolls for updateDisasters: trigger, type index, x%, y%, radius%. */
const DISASTER_AT_ORIGIN = [0.01, 0, 0, 0, 0] as const;

function disasterReadyState() {
  const state = initGame();
  state.year = 5;
  state.tick = EVENT_INTERVAL.disaster + WORK_START;
  return state;
}

describe('updateDisasters', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('still rolls non-plague disasters when plague is immune', () => {
    withRandomSequence([...DISASTER_AT_ORIGIN], () => {
      const state = disasterReadyState();
      state.unlockedTechs = ['medicine_2'];
      const before = state.disasters.length;
      updateDisasters(state);
      expect(state.disasters.length).toBeGreaterThan(before);
      expect(state.disasters.some((d) => d.type === 'plague')).toBe(false);
    });
  });

  it('clears human building occupants killed by fire', () => {
    withRandomSequence([...DISASTER_AT_ORIGIN], () => {
      const state = disasterReadyState();
      const house = addCompletedBuilding(state, BuildingType.House, 50, 0, 0);
      const human = createEntity(EntityType.Human, 0, 0, state.nextEntityId++, 200, false, {
        gender: 'male',
        ageYears: 30,
      });
      human.isJuvenile = false;
      state.entities.push(human);
      assignResidentToHouse(state, human, house);

      updateDisasters(state);

      expect(human.alive).toBe(false);
      expect(house.occupants).not.toContain(human.id);
      expect(human.residenceBuildingId).toBeUndefined();
    });
  });
});