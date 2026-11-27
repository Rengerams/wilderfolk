/**
 * UI refinement guards: each panel reads the rule it displays from its owner instead
 * of re-deriving a label, price, ratio, delay or count.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initGame } from '../src/game/worldGen';
import { getChallengeProgress, INITIAL_CHALLENGES } from '../src/game/challenges';
import { BuildingType } from '../src/game/buildings';
import type { Building, WorldState } from '../src/game/gameTypes';

const read = (relative: string) => readFileSync(resolve(process.cwd(), relative), 'utf8');

const FIXTURE_SEED = 20_260_917;

function world(): WorldState {
  const state = initGame({ villageName: 'Refinement', size: 'medium', seed: FIXTURE_SEED });
  state.challenges = INITIAL_CHALLENGES.map((c) => ({ ...c, completed: false }));
  return state;
}

function completedPlayerHouse(id: number): Building {
  return {
    id, type: BuildingType.House, x: 100, y: 100, width: 20, height: 20, completed: true, occupants: [], rotation: 0,
  } as unknown as Building;
}

describe('R1 — the unmount save never writes a colony no loop owns', () => {
  it('routes the unmount cleanup through the guarded session-stop save', () => {
    const src = read('src/hooks/useGamePersistence.ts');
    // The teardown owner is now `persistOnSessionStop`; the cleanup must call that one owner.
    const effect = src.match(
      /useEffect\(\(\) => \{\s*return \(\) => \{\s*void persistOnSessionStop\(\);\s*\};\s*\}, \[persistOnSessionStop\]\);/,
    );
    expect(effect, 'fixture premise: the unmount-save effect calls the guarded owner').not.toBeNull();

    // The guard moved into the owner, which still reads the loop ref and skips without one.
    const owner = src.match(
      /const persistOnSessionStop = useCallback\(\(\): Promise<boolean> => \{([\s\S]*?)\n  \}, \[loopRef, persistCurrentGame\]\);/,
    );
    expect(owner, 'the guarded session-stop owner exists').not.toBeNull();
    const body = owner?.[1] ?? '';
    expect(body, 'the owner reads the loop ref into a local').toContain('const loop = loopRef.current;');
    const guard = body.match(/if\s*\(\s*!loop[\s\S]*?\)\s*return Promise\.resolve\(false\);/);
    expect(guard, 'the owner skips saving without a loop or during crash recovery').not.toBeNull();
    expect(
      guard?.index ?? Infinity,
      'the owner guards before it persists',
    ).toBeLessThan(body.indexOf('persistCurrentGame('));
  });
});

describe('R8 — every goal card reports progress from the challenge\'s own targets', () => {
  it('gives each unfinished initial challenge a non-empty current / target row', () => {
    const state = world();
    for (const challenge of INITIAL_CHALLENGES) {
      const row = getChallengeProgress({ ...challenge, completed: false }, state);
      expect(row, `${challenge.id} has no progress row`).not.toBeNull();
      expect(row?.target, challenge.id).toBeGreaterThan(0);
      expect(row?.unit.length, challenge.id).toBeGreaterThan(0);
    }
  });

  it('counts Growing Village in completed player buildings and Century Mark in years', () => {
    const state = world();
    const growing = INITIAL_CHALLENGES.find((c) => c.id === 'growing_village');
    const century = INITIAL_CHALLENGES.find((c) => c.id === 'century');
    expect(growing, 'fixture premise: the challenge exists').toBeTruthy();
    expect(century, 'fixture premise: the challenge exists').toBeTruthy();

    const before = getChallengeProgress({ ...growing!, completed: false }, state);
    expect(before).toMatchObject({ target: 5, unit: 'buildings' });
    state.buildings.push(completedPlayerHouse(9001));
    expect(getChallengeProgress({ ...growing!, completed: false }, state)?.current)
      .toBe((before?.current ?? 0) + 1);

    state.year = 42;
    expect(getChallengeProgress({ ...century!, completed: false }, state)).toMatchObject({
      current: 42, target: 100, unit: 'years',
    });
  });
});
