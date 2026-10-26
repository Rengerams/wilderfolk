/**
 * One authoritative reference for a settler's workplace (§5).
 *
 * The pointer, its roster entry and the `job`/`occupation` labels go through the workforce doors
 * (`clearWorkerAssignment`, `detachWorkplaceReference`, `assignWorkerTransition`,
 * `transferWorkerBetweenBuildings`), so a death, a demolition, a stale leader post, a caravan
 * departure and the moon forms all reach the same code. A prison sentence clears nothing.
 *
 * This guard pins the modules allowed to write the pointer directly: the owner, the save boundary
 * (the nested Moon Howler form included) and the moon-form owner, where a form transform or the
 * Church rite displaces or restores a post outside the staffing transition.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const REPO = process.cwd();

const read = (file: string): string => readFileSync(resolve(REPO, file), 'utf8');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

/** A direct write to the pointer — not a read, a comparison or an object-literal key. */
const POINTER_WRITE = /\.workerBuildingId\s*=(?!=)/;

/** The owner, the save boundary, and the moon-form owner that displaces or restores a post. */
const ALLOWED_WRITERS = [
  'src/game/workforce.ts',
  'src/game/saveLoad.ts',
  'src/game/moonHowler.ts',
  'src/game/moonHowlerForm.ts',
];

/** Sites that clear a post rather than writing one: they must call a door, never the field. */
const DOOR_CALLERS = [
  'src/game/dayCycle.ts',
  'src/game/leaderHouse.ts',
  'src/game/humanLifecycleCleanup.ts',
  'src/game/rivalEvents.ts',
  'src/game/tradeCaravans.ts',
];

describe('the workplace reference has one owner (workforce.ts)', () => {
  it('writes the pointer only in the owner, the save boundary and the moon forms', () => {
    const writers = sourceFiles(resolve(REPO, 'src'))
      .filter((file) => POINTER_WRITE.test(readFileSync(file, 'utf8')))
      .map((file) => relative(REPO, file).split('\\').join('/'))
      .sort();

    expect(
      writers,
      'a module outside the owner writes human.workerBuildingId — route it through workforce.ts',
    ).toEqual([...ALLOWED_WRITERS].sort());
  });

  it('keeps all four workplace doors in the owner', () => {
    const owner = read('src/game/workforce.ts');
    for (const door of [
      'export function assignWorkerTransition',
      'export function transferWorkerBetweenBuildings',
      'export function clearWorkerAssignment',
      'export function detachWorkplaceReference',
    ]) {
      expect(owner, `workforce.ts no longer holds ${door}`).toContain(door);
    }
  });

  it('routes every cleared post through a door', () => {
    for (const file of DOOR_CALLERS) {
      const src = read(file);
      expect(src, `${file} writes the pointer instead of calling a door`).not.toMatch(POINTER_WRITE);
      expect(
        /clearWorkerAssignment|detachWorkplaceReference/.test(src),
        `${file} neither writes the pointer nor calls a door`,
      ).toBe(true);
    }
  });
});
