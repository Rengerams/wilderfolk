/**
 * Every header door takes its name from the one subject vocabulary. The view-side wiring that used
 * to be read from source is asserted by `scripts/check-source-guards.mjs`.
 */
import { describe, expect, it } from 'vitest';
import { OVERVIEW_SUBJECTS, overviewSubjectForTab } from '../src/hooks/useGameShellState';
import { HEADER_DOORS } from '../src/game/hotkeys';

describe('every door name comes from the one subject vocabulary', () => {
  it('keeps the People subject label and hint distinct from the council', () => {
    expect(OVERVIEW_SUBJECTS.people.label).toBe('People');
    expect(OVERVIEW_SUBJECTS.people.hint).toBe('Citizens, housing, work hours');
  });

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
