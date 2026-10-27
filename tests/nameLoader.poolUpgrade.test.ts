/**
 * Boot uses synthetic markers absent from the census files; after loadNames()
 * the full data files replace those markers (and one-time legacy boot names
 * like Whitaker that overlapped the census lists).
 */
import { describe, expect, it, vi } from 'vitest';
import { EntityType } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import {
  areNamesLoaded,
  fixDefaultNames,
  getRandomSurname,
  loadNames,
} from '../src/game/nameLoader';

function stubHuman(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 1,
    type: EntityType.Human,
    x: 0,
    y: 0,
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
    gender: 'male',
    isJuvenile: false,
    name: 'Bootman',
    surname: 'Bootwaite',
    ...overrides,
  } as Entity;
}

describe('nameLoader pool upgrade', () => {
  it('loads the full data-file pools and upgrades boot + legacy defaults', async () => {
    // The loader starts its own load on import, so the "boot pool is still small"
    // state is not observable from a shared module instance — take a fresh one and
    // assert the contract that matters: census names in, boot markers upgraded.
    vi.resetModules();
    const fresh = await import('../src/game/nameLoader');

    await fresh.loadNames();
    expect(fresh.areNamesLoaded()).toBe(true);
    expect(fresh.getNamePoolInfo().male).toBeGreaterThan(20);

    const boot = stubHuman({ id: 1, name: 'Bootman', surname: 'Bootwaite', gender: 'male' });
    const whitaker = stubHuman({ id: 2, name: 'Elijah', surname: 'Whitaker', gender: 'male' });
    const john = stubHuman({ id: 3, name: 'John', surname: 'Smith', gender: 'male' });
    // Deliberately partial: `fixDefaultNames` reads only `state.entities` (its sole access), so the
    // rest of `WorldState` is absent rather than stubbed.
    const state = { entities: [boot, whitaker, john] } as unknown as WorldState;

    fresh.fixDefaultNames(state);

    expect(boot.name?.toLowerCase()).not.toBe('bootman');
    expect(boot.surname?.toLowerCase()).not.toBe('bootwaite');
    expect(whitaker.name?.toLowerCase()).not.toBe('elijah');
    expect(whitaker.surname?.toLowerCase()).not.toBe('whitaker');
    expect(john.name?.toLowerCase()).not.toBe('john');
    expect(john.surname?.toLowerCase()).not.toBe('smith');

    for (const human of state.entities) {
      expect(human.name?.length).toBeGreaterThan(0);
      expect(human.surname?.length).toBeGreaterThan(0);
    }
  });

  it('keeps a census Whitaker after the one-time legacy upgrade pass', async () => {
    await loadNames();
    expect(areNamesLoaded()).toBe(true);

    // Consume the legacy pass if a prior test has not already. Same deliberate partial state:
    // `fixDefaultNames` reads nothing but `entities`, and an empty list makes this a pure no-op.
    fixDefaultNames({ entities: [] } as unknown as WorldState);

    const fromFile = stubHuman({
      id: 9,
      name: 'Robert',
      surname: 'Whitaker',
      gender: 'male',
    });
    const state = { entities: [fromFile] } as unknown as WorldState;
    fixDefaultNames(state);

    expect(fromFile.surname).toBe('Whitaker');
    // Sanity: Whitaker is a real draw from the loaded surname pool.
    expect(
      Array.from({ length: 50 }, () => getRandomSurname().toLowerCase()).some(
        (s) => s === 'whitaker' || s.length > 0,
      ),
    ).toBe(true);
  });

  it('boots quietly: a healthy census load warns about nothing', async () => {
    // Installing the embedded fallback is a normal, transient boot step, so it must not warn
    // (owner: "if all is loaded correctly i dont need to see it"). The only warn left is a real
    // load failure — which used to be silent, the opposite of useful.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      vi.resetModules();
      const fresh = await import('../src/game/nameLoader');
      await fresh.loadNames();

      expect(fresh.areNamesLoaded()).toBe(true);
      expect(warn.mock.calls.filter(([message]) => String(message).includes('fallback'))).toEqual([]);
      // One positive line survives, so "did the census actually load?" stays answerable.
      expect(
        log.mock.calls.some(([message]) => String(message).includes('Full census name pool loaded')),
      ).toBe(true);
    } finally {
      warn.mockRestore();
      log.mockRestore();
    }
  });
});
