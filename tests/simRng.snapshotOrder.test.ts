import { describe, expect, it } from 'vitest';
import { getSimRng, resetSimRng, setSimSeed, snapshotSimRng } from '../src/game/simRng';

describe('simRng snapshot owner ordering', () => {
  it('serialises the same positions identically whatever order the streams were created in', () => {
    resetSimRng();
    setSimSeed(4242);
    getSimRng('b');
    getSimRng('a');
    const firstCreatedBackwards = snapshotSimRng().owners.map(([owner]) => owner);

    resetSimRng();
    setSimSeed(4242);
    getSimRng('a');
    getSimRng('b');
    const createdForwards = snapshotSimRng().owners.map(([owner]) => owner);

    expect(firstCreatedBackwards).toEqual(['a', 'b']);
    expect(createdForwards).toEqual(firstCreatedBackwards);
  });
});
