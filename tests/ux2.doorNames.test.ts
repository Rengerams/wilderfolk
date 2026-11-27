/**
 * Every header door takes its name from the one subject vocabulary. The view-side wiring that used
 * to be read from source is asserted by `scripts/check-source-guards.mjs`.
 */
import { describe, expect, it } from 'vitest';
import { overviewSubjectForTab } from '../src/hooks/useGameShellState';
import { HEADER_DOORS } from '../src/game/hotkeys';

describe('every door name comes from the one subject vocabulary', () => {
  it('names each header door the way the header does', () => {
    expect(HEADER_DOORS.map((door) => overviewSubjectForTab(door.tab).label)).toEqual([
      'People',
      'Frontier',
      'Nature',
      'Progress',
      'Log',
      'More',
    ]);
  });
});
