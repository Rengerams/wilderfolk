/**
 * Interaction audio resolves deaths by id in one roster pass and still names the hunter that was
 * actually beside the prey.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityType } from '../src/game/gameTypes';
import type { Entity } from '../src/game/gameTypes';

const sfx = vi.hoisted(() => ({
  playHumanHuntSfx: vi.fn(),
  playPredatorHuntSfx: vi.fn(),
  playMoonHowlerSfx: vi.fn(),
  playTameSfx: vi.fn(),
  playTransformSfx: vi.fn(),
  playSettlerDeathSfx: vi.fn(),
}));
vi.mock('../src/audio/interactionSfx', () => ({
  playHumanHuntSfx: sfx.playHumanHuntSfx,
  playPredatorHuntSfx: sfx.playPredatorHuntSfx,
  playMoonHowlerSfx: sfx.playMoonHowlerSfx,
  playTameSfx: sfx.playTameSfx,
  playTransformSfx: sfx.playTransformSfx,
  playSettlerDeathSfx: sfx.playSettlerDeathSfx,
}));
import { detectInteractionSounds } from '../src/audio/interactionDetect';

const beast = (id: number, type: EntityType, x: number, y: number, alive = true): Entity =>
  ({ id, type, x, y, alive } as Entity);
const human = (id: number, x: number, y: number, alive = true): Entity =>
  ({ id, type: EntityType.Human, x, y, alive, age: 30 } as Entity);

beforeEach(() => {
  for (const fn of Object.values(sfx)) fn.mockClear();
});

describe('interaction audio', () => {
  it('plays the settler death cue for a human death', () => {
    detectInteractionSounds([human(1, 0, 0)], [human(1, 0, 0, false)]);
    expect(sfx.playSettlerDeathSfx).toHaveBeenCalledTimes(1);
  });

  it('names the hunter standing near a dead prey', () => {
    detectInteractionSounds(
      [beast(1, EntityType.Rabbit, 0, 0), human(2, 10, 0)],
      [beast(1, EntityType.Rabbit, 0, 0, false), human(2, 10, 0)],
    );
    expect(sfx.playHumanHuntSfx).toHaveBeenCalledTimes(1);
    expect(sfx.playPredatorHuntSfx).not.toHaveBeenCalled();
  });

  it('stays silent when a prey dies with no hunter near it', () => {
    detectInteractionSounds(
      [beast(1, EntityType.Rabbit, 0, 0), human(2, 5_000, 0)],
      [beast(1, EntityType.Rabbit, 0, 0, false), human(2, 5_000, 0)],
    );
    expect(sfx.playHumanHuntSfx).not.toHaveBeenCalled();
    expect(sfx.playPredatorHuntSfx).not.toHaveBeenCalled();
    expect(sfx.playMoonHowlerSfx).not.toHaveBeenCalled();
  });

  it('resolves deaths without rescanning the roster per corpse', () => {
    const roster: Entity[] = [];
    for (let i = 0; i < 2_000; i++) roster.push(beast(1_000 + i, EntityType.Rabbit, i, 0));
    const prev = [human(1, 0, 0), ...roster];
    const current = [human(1, 0, 0, false), ...roster];

    let indexReads = 0;
    const counted = new Proxy(current, {
      get(target, prop, receiver) {
        if (typeof prop === 'string' && /^\d+$/.test(prop)) indexReads++;
        return Reflect.get(target, prop, receiver);
      },
    });

    detectInteractionSounds(prev, counted);

    expect(sfx.playSettlerDeathSfx).toHaveBeenCalledTimes(1);
    expect(indexReads).toBeLessThan(prev.length * 6);
  });

  it('stays silent for a visitor or rival death', () => {
    detectInteractionSounds(
      [human(1, 0, 0), { ...human(2, 10, 0), faction: 'visitor' } as Entity],
      [human(1, 0, 0), { ...human(2, 10, 0, false), faction: 'visitor' } as Entity],
    );
    expect(sfx.playSettlerDeathSfx).not.toHaveBeenCalled();
  });

  it('cues one death for a cursed settler dying in wolf form', () => {
    const cursed = {
      ...beast(1, EntityType.Werewolf, 0, 0),
      moonHowlerCursed: true,
      moonHowlerSaved: {},
    } as Entity;
    detectInteractionSounds(
      [cursed],
      [{ ...cursed, alive: false } as Entity],
    );
    expect(sfx.playSettlerDeathSfx).toHaveBeenCalledTimes(1);
  });
});
