import { describe, expect, it } from 'vitest';
import { gameTick } from '../src/game/gameTick';
import { initGame } from '../src/game/worldGen';
import type { PopulationHistoryEntry } from '../src/game/gameTypes';
import { STATS_SAMPLE_INTERVAL_TICKS } from '../src/game/tickLayerRealtime';

describe('population history resource samples', () => {
  it('records iron together with gold, food, wood and stone on the real sample tick', () => {
    const world = initGame({ seed: 20261028 });
    world.resources.iron = 123;
    world.tick = STATS_SAMPLE_INTERVAL_TICKS - 1;
    gameTick(world);

    const latest = world.populationHistory.at(-1);
    expect(latest?.tick).toBe(STATS_SAMPLE_INTERVAL_TICKS);
    expect(latest?.iron).toBe(world.resources.iron);
    expect(latest?.iron).toBe(123);
    expect(latest?.gold).toBe(world.resources.gold);
    expect(latest?.food).toBe(world.resources.food);
    expect(latest?.wood).toBe(world.resources.wood);
    expect(latest?.stone).toBe(world.resources.stone);
  });

  it('continues to accept old history samples without iron', () => {
    const legacy: PopulationHistoryEntry = {
      tick: 0,
      year: 0,
      grass: 0,
      rabbits: 0,
      deer: 0,
      wolves: 0,
      foxes: 0,
      humans: 2,
      werewolves: 0,
      wildkin: 0,
      buildings: 0,
      food: 100,
    };
    expect(legacy.iron).toBeUndefined();
  });
});
