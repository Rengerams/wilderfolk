/**
 * The prison escape roll is per unguarded hour: a day whose post was open all 24 hours can release
 * more than one prisoner, which a single-escape-per-day cap made impossible.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { BuildingType, EntityType, JobType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { TICKS_PER_DAY } from '../src/game/dayCycle';
import { initGame } from '../src/game/worldGen';
import { tickPrisonGuardDuty } from '../src/game/prisonGuardDuty';
import { syncJobBuildingOccupants } from '../src/game/workforce';
import { resetSimRng, setSimSeed } from '../src/game/simRng';

const PRISON_ID = 9001;

function prisoner(id: number): Entity {
  return {
    id,
    type: EntityType.Human,
    alive: true,
    x: 10,
    y: 10,
    energy: 100,
    maxEnergy: 100,
    age: 30,
    isJuvenile: false,
    prisonBuildingId: PRISON_ID,
    prisonerUntilTick: 10 * TICKS_PER_DAY,
    prisonSentenceCrime: 'scandal',
  } as unknown as Entity;
}

function prisonBuilding(occupants: number[]): Building {
  return {
    id: PRISON_ID,
    type: BuildingType.Prison,
    completed: true,
    faction: undefined,
    occupants,
    x: 0,
    y: 0,
    width: 40,
    height: 40,
    level: 1,
  } as unknown as Building;
}

/** One unguarded day: a completed Prison with two prisoners and no guard on any shift. */
function unguardedDay(): { state: WorldState; prisoners: Entity[] } {
  const state = initGame({ seed: 4242 });
  const prisoners = [prisoner(1), prisoner(2)];
  state.entities = [...prisoners];
  state.buildings = [prisonBuilding(prisoners.map((p) => p.id))];
  state.tick = 0;
  return { state, prisoners };
}

/** Attempts until one daily pulse frees both prisoners. */
function escapedTogetherOnOneDay(): boolean {
  for (let attempt = 0; attempt < 40; attempt++) {
    const { state, prisoners } = unguardedDay();
    setSimSeed(1000 + attempt);
    state.tick = attempt * TICKS_PER_DAY;

    tickPrisonGuardDuty(state);

    if (prisoners.every((p) => p.prisonBuildingId == null)) return true;
  }
  return false;
}

afterEach(() => {
  resetSimRng();
});

describe('tickPrisonGuardDuty rolls per unguarded hour', () => {
  it('keeps an escaped guard on the prison workforce roster', () => {
    let escaped = false;
    for (let attempt = 0; attempt < 40 && !escaped; attempt++) {
      const state = initGame({ seed: 4242 });
      const guard = prisoner(3);
      guard.job = JobType.PrisonGuard;
      guard.workerBuildingId = PRISON_ID;
      const prison = prisonBuilding([guard.id]);
      state.entities = [guard];
      state.buildings = [prison];
      state.tick = attempt * TICKS_PER_DAY;
      setSimSeed(1000 + attempt);

      tickPrisonGuardDuty(state);

      if (guard.prisonBuildingId == null) {
        escaped = true;
        expect(guard.workerBuildingId).toBe(PRISON_ID);
        expect(prison.occupants).toContain(guard.id);
      }
    }
    expect(escaped).toBe(true);
  });

  it('restores an escaped farm worker to the reserved workplace without a staffing pulse', () => {
    let escaped = false;
    for (let attempt = 0; attempt < 40 && !escaped; attempt++) {
      const state = initGame({ seed: 4242 });
      const worker = prisoner(17);
      worker.job = JobType.Farmer;
      worker.workerBuildingId = 9002;
      const prison = prisonBuilding([worker.id]);
      const farm = {
        ...prisonBuilding([]),
        id: 9002,
        type: BuildingType.Farm,
      } as Building;
      state.entities = [worker];
      state.buildings = [prison, farm];
      syncJobBuildingOccupants(state.entities, state.buildings);
      expect(farm.occupants).not.toContain(worker.id);
      state.tick = attempt * TICKS_PER_DAY;
      setSimSeed(1000 + attempt);

      tickPrisonGuardDuty(state);

      if (worker.prisonBuildingId == null) {
        escaped = true;
        expect(worker.workerBuildingId).toBe(farm.id);
        expect(farm.occupants).toEqual([worker.id]);
        expect(prison.occupants).not.toContain(worker.id);
      }
    }
    expect(escaped).toBe(true);
  });

  it('releases both prisoners on a single day when the post was open all day', () => {
    expect(escapedTogetherOnOneDay()).toBe(true);
  });
});
