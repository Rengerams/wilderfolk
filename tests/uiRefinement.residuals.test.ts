/**
 * UI refinement guards, each naming the expression it replaces: controls state themselves in text
 * rather than colour, keyboard reach stays intact, and one message prints in one place.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EVENT_LOG_FILTER_OPTIONS, getEventLogFilterLabel } from '../src/game/eventLogFilters';

function read(relativePath: string): string {
  // `UI_REFINEMENT_RESIDUALS_ROOT` points the guards at a mirrored source tree for a red-before proof.
  const root = process.env.UI_REFINEMENT_RESIDUALS_ROOT ?? process.cwd();
  return readFileSync(resolve(root, relativePath), 'utf8');
}

describe('R30 — the chronicle header names the filter the dropdown names', () => {
  it('labels every filter with the dropdown text, never the raw stored id', () => {
    for (const option of EVENT_LOG_FILTER_OPTIONS) {
      expect(getEventLogFilterLabel(option.id), `filter ${option.id}`).toBe(option.label);
    }
    // `death` is the stored id; the header must print the dropdown label, never the id.
    expect(getEventLogFilterLabel('death')).not.toBe('death');
    expect(getEventLogFilterLabel('all')).toBe('All');
  });

  it('renders the owner label instead of interpolating the id', () => {
    const panel = read('src/game/EventLogPanel.tsx');

    expect(panel, 'the header no longer asks the filter owner for its label').toContain(
      'getEventLogFilterLabel(filter)',
    );
    expect(panel, 'the raw filter id is back in the header').not.toContain(
      "${filter === 'all' ? '' : filter}",
    );
  });
});

describe('R31–R33 — controls state themselves, not only by colour', () => {
  it('R31: the header resource chip carries its full state as an accessible name', () => {
    // The chip's full state is its accessible name, not a mouse-only `title`.
    expect(read('src/components/ResourceBadge.tsx')).toContain('aria-label={title}');
  });

  it('R32: the progress sub-nav buttons expose their pressed state', () => {
    expect(read('src/components/tabPanels/ProgressTabPanel.tsx')).toContain(
      'aria-pressed={progressSubTab === id}',
    );
  });

  it('R33: the collapsed build rail grid toggle exposes its pressed state', () => {
    // The rail's grid toggle must expose `aria-pressed` like the header's auto-play toggle.
    expect(read('src/components/GameBuildRail.tsx')).toContain('aria-pressed={showGrid}');
  });
});

describe('R11, R36, R37, R39 — keyboard reach and one message in one place', () => {
  it('R11: focus enters the menu dialog when it opens, so the Tab trap is reachable', () => {
    // Focus must enter the panel on open, so the Tab trap is reachable.
    const menu = read('src/components/GameMenu.tsx');

    expect(menu).toContain('getFocusableElements(panelRef.current)[0]');
    expect(menu).toContain('first?.focus()');
  });

  it('R36: the intro does not treat Tab or a modifier chord as "continue"', () => {
    // Tab and modifier chords stay inert, so the mute control beside the CTA stays reachable.
    const intro = read('src/game/IntroScreen.tsx');

    expect(intro).toContain("event.key === 'Tab'");
    expect(intro).toContain('event.ctrlKey || event.metaKey || event.altKey');
  });

  it('R37: the village mood label is printed once, by its stat card', () => {
    const overview = read('src/components/CitizenOverviewScreen.tsx');

    expect(overview, 'the mood label is duplicated beside the stat card again').not.toContain(
      '{overview.moodLabel} — ',
    );
    expect(overview, 'the mood explanation disappeared with the label').toContain(
      '{overview.moodDetail}',
    );
  });

  it('R39: the save banner renders in the new-settlement screen as well as the game', () => {
    // "Load saved game" lives on the map-setup screen, so its refusal banner must render there too.
    const app = read('src/App.tsx');
    const uses = app.split('<SaveToastBanner').length - 1;

    expect(uses, 'the save banner is no longer shared by both session states').toBe(2);
    expect(app).toContain('className="z-[60]"');
  });
});
