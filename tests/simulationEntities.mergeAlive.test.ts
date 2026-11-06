import { describe, expect, it } from 'vitest';
import { mergeNewEntitiesIntoAlive } from '../src/game/simulation/simulationEntities';
import { human } from '../src/test/factories';

describe('mergeNewEntitiesIntoAlive', () => {
  it('appends live spawns that the phase list has not seen yet', () => {
    const existing = human(1);
    const spawned = human(2);
    const dead = human(3, { alive: false });
    const allAlive = [existing];

    mergeNewEntitiesIntoAlive(allAlive, [existing, spawned, dead]);

    expect(allAlive.map((entity) => entity.id)).toEqual([1, 2]);
  });

  it('is a no-op when the phase produced no new entities', () => {
    const allAlive = [human(1)];
    mergeNewEntitiesIntoAlive(allAlive, []);
    expect(allAlive.map((entity) => entity.id)).toEqual([1]);
  });
});
