/**
 * F-UX-8 / F-UX-27 — two adjacent header doors both answered to "Village overview": the population
 * chip's accessible name said "people overview" while the window it opens was titled "Village", and
 * the 🏘️ door opened a window titled "Village overview".
 *
 * The shipped Guide and shortcut sheet already name these two surfaces "People" and "Daily council",
 * so the doors and window titles now read their names from the same vocabulary. The last case pins
 * the other half: one window carries one heading, because the dialog's accessible name is the visible
 * title rather than a second copy of it.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OVERVIEW_SUBJECTS, overviewSubjectForTab } from '../src/hooks/useGameShellState';
import { HEADER_DOORS } from '../src/game/hotkeys';

function read(relativePath: string): string {
  return readFileSync(resolve(process.env.UX2_SOURCE_ROOT ?? process.cwd(), relativePath), 'utf8');
}

describe('the two overview doors name their own windows', () => {
  it('titles the people subject People, so no door and window share the Village name', () => {
    expect(OVERVIEW_SUBJECTS.people.label).toBe('People');
    expect(OVERVIEW_SUBJECTS.people.hint).toBe('Citizens, housing, work hours');
    expect(read('src/hooks/useGameShellState.ts')).not.toContain("label: 'Village'");
  });

  it('names the council window the same thing the Guide and the shortcut sheet call it', () => {
    const council = "Daily council";
    expect(read('src/components/dashboard/GameDashboard.tsx')).toContain(`title="${council}"`);
    expect(read('src/components/tabPanels/MoreTabPanel.tsx')).toContain(`🏘️ ${council}`);
    expect(read('src/components/ShortcutsOverlay.tsx')).toContain(`'C', description: '${council}`);
  });

  it('gives the population chip and the council door distinct accessible names', () => {
    const header = read('src/components/GameHeader.tsx');
    expect(header).toContain('aria-label={`Open ${OVERVIEW_SUBJECTS.people.label.toLowerCase()} window`}');
    expect(header).toContain('aria-label="Open daily council"');
    expect(header, 'the council door answers to "village overview" again').not.toContain(
      'aria-label="Open village overview"',
    );
    expect(header, 'the chip promises a name its window does not carry').not.toContain(
      'aria-label="Open people overview"',
    );
  });

  it('lets one window carry one heading: the dialog is named by its visible title', () => {
    const window = read('src/components/GameWindow.tsx');
    expect(window).toContain('aria-labelledby={titleId}');
    expect(window).toContain('id={titleId}');
    expect(window, 'the dialog name is a second copy of the visible title again').not.toContain(
      'aria-label={title}',
    );
  });
});

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

  it('keeps no second copy of a door name in the key table', () => {
    expect(
      read('src/game/hotkeys.ts'),
      'the key table stores door names again',
    ).not.toMatch(/label: '/);
  });

  it('renders the sheet and the Guide from the vocabulary, not from a literal', () => {
    for (const file of [
      'src/components/ShortcutsOverlay.tsx',
      'src/components/tabPanels/MoreTabPanel.tsx',
    ]) {
      const source = read(file);
      expect(source, `${file} does not resolve a door name from the subject table`)
        .toContain('overviewSubjectForTab(');
      expect(source, `${file} hard-codes a door name the vocabulary owns`).not.toMatch(/'Village'/);
    }
  });

  it('says V and O are two routes to the People window', () => {
    expect(read('src/components/ShortcutsOverlay.tsx')).toContain('V opens the same window');
    expect(read('src/components/tabPanels/MoreTabPanel.tsx')).toContain('V opens the same window');
  });

  it('draws the Guide window list from the vocabulary, glyph included', () => {
    const guide = read('src/components/tabPanels/MoreTabPanel.tsx');
    for (const subject of ['progress', 'help'] as const) {
      expect(guide, `the Guide does not read the ${subject} name and glyph from the subject table`)
        .toContain(`{OVERVIEW_SUBJECTS.${subject}.icon} {OVERVIEW_SUBJECTS.${subject}.label}`);
    }
    expect(guide, 'the Guide writes the Progress glyph by hand again').not.toContain('🎯 Progress');
    expect(guide, 'the Guide writes the More name by hand again').not.toContain('☰ Menu');
  });
});
