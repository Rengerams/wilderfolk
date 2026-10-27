/**
 * UI refinement residuals — R30–R33 of `docs/private/audits/2026-09-16/UI_REFINEMENT_AND_DUPLICATION_2026-09-17.md`.
 *
 * The audit's higher tiers were closed by the 2026-09-17 campaign; these four rows were re-verified
 * against the tree on 2026-09-20 and were still live. Each guard names the pre-fix expression it
 * replaces, so a regression fails here with that expression in the message (the
 * `uiSingleOwner.test.ts` house pattern).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EVENT_LOG_FILTER_OPTIONS, getEventLogFilterLabel } from '../src/game/eventLogFilters';

function read(relativePath: string): string {
  // `UI_REFINEMENT_RESIDUALS_ROOT` lets the red-before proof run these guards against a mirrored
  // pre-fix tree (`tmp/red-before-r30`) without touching `src/`.
  const root = process.env.UI_REFINEMENT_RESIDUALS_ROOT ?? process.cwd();
  return readFileSync(resolve(root, relativePath), 'utf8');
}

describe('R30 — the chronicle header names the filter the dropdown names', () => {
  it('labels every filter with the dropdown text, never the raw stored id', () => {
    for (const option of EVENT_LOG_FILTER_OPTIONS) {
      expect(getEventLogFilterLabel(option.id), `filter ${option.id}`).toBe(option.label);
    }
    // `death` is the stored id; "Deaths (age, illness, exhaustion, raid)" is the label the player
    // reads in the dropdown. The header used to print the id mid-sentence.
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
    // Pre-fix the span had `title` only: the unit and the "full, production is lost" warning were
    // invisible to screen readers and to touch.
    expect(read('src/components/ResourceBadge.tsx')).toContain('aria-label={title}');
  });

  it('R32: the progress sub-nav buttons expose their pressed state', () => {
    expect(read('src/components/tabPanels/ProgressTabPanel.tsx')).toContain(
      'aria-pressed={progressSubTab === id}',
    );
  });

  it('R33: the collapsed build rail grid toggle exposes its pressed state', () => {
    // `GameHeader`'s auto-play toggle already did this; the rail's grid toggle was colour-only.
    expect(read('src/components/GameBuildRail.tsx')).toContain('aria-pressed={showGrid}');
  });
});

describe('R11, R36, R37, R39 — keyboard reach and one message in one place', () => {
  it('R11: focus enters the menu dialog when it opens, so the Tab trap is reachable', () => {
    // Pre-fix nothing ever focused into the panel, so both wrap branches were unreachable and Tab
    // walked the whole game UI behind the click-catching backdrop.
    const menu = read('src/components/GameMenu.tsx');

    expect(menu).toContain('getFocusableElements(panelRef.current)[0]');
    expect(menu).toContain('first?.focus()');
  });

  it('R36: the intro does not treat Tab or a modifier chord as "continue"', () => {
    // Any key but Escape continued the intro, so the 🔊/🔇 control beside the CTA was unreachable.
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
    // "Load saved game" lives on the map-setup screen, and its refusal message was only rendered in
    // the game shell — so the reason existed but the player never saw it.
    const app = read('src/App.tsx');
    const uses = app.split('<SaveToastBanner').length - 1;

    expect(uses, 'the save banner is no longer shared by both session states').toBe(2);
    expect(app).toContain('className="z-[60]"');
  });
});
