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
import { OVERVIEW_SUBJECTS } from '../src/hooks/useGameShellState';

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
