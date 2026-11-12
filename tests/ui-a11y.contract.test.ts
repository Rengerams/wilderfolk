/**
 * Accessibility and keyboard-contract guards: a moment card that claims the keyboard, stacked
 * authored-decision cards, intro controls, and icon-only or role-carrying controls.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

describe('the moment title card claims the keyboard while it covers the screen', () => {
  const card = read('src/components/MomentTitleCard.tsx');

  it('uses the shared overlay-keyboard hook', () => {
    // `useKeyboardControls` listens on `window` in the capture phase and returns while any claim is
    // held, so the card must own a claim while it covers the screen.
    expect(card).toMatch(/useOverlayKeyboard\(\s*'moment-title-card'/);
    expect(card).toContain("from '../hooks/useOverlayKeyboard'");
  });

  it('is not vacuous — the hook really is what claims it', () => {
    // The two halves of the contract are separate: a claim with no Escape handler and an Escape
    // handler with no claim are the two shipped bugs this hook exists to fuse.
    expect("useOverlayKeyboard('moment-title-card', handleSkip, Boolean(moment));").toMatch(
      /useOverlayKeyboard\(\s*'moment-title-card'/,
    );
    expect("claimKeyboard('moment-title-card');").not.toMatch(/useOverlayKeyboard\(/);
  });
});

describe('the story and diplomacy cards stack instead of overlapping', () => {
  const app = read('src/App.tsx');

  // The one anchored, centred column that owns both cards, inside the map stage's overlay.
  const COLUMN =
    'pointer-events-none absolute left-1/2 top-4 z-10 flex w-full max-w-lg -translate-x-1/2 flex-col';
  const STORY = 'world.pendingStoryEvents && world.pendingStoryEvents.length > 0 && (';
  const DIPLOMACY = 'pendingDiplomacy.length > 0 && (';

  it('renders both cards inside that one column, in DOM order', () => {
    // Both cards render inside the one anchored column, in DOM order; the map stage's overlay is not
    // a flex container, so neither card may position itself.
    const column = app.indexOf(COLUMN);
    const story = app.indexOf(STORY);
    const diplomacy = app.indexOf(DIPLOMACY);
    expect(column, 'the shared authored-decision column is gone').toBeGreaterThan(-1);
    expect(app.indexOf(COLUMN, column + 1), 'a second anchoring column was added').toBe(-1);
    expect(story, 'the story card is not inside the shared column').toBeGreaterThan(column);
    expect(diplomacy, 'the diplomacy card is not inside the shared column').toBeGreaterThan(story);
  });

  it('neither authored-decision card pins itself to the same absolute offset', () => {
    // Both were `absolute left-1/2 top-4 z-10 w-full max-w-lg -translate-x-1/2`, and diplomacy comes
    // later in the DOM, so a pending diplomacy card painted over a story card's title and first choice.
    expect(app, 'the story card is absolutely positioned again').not.toMatch(
      /top-4 z-10 w-full max-w-lg -translate-x-1\/2 animate-in fade-in slide-in-from-top/,
    );
    // The diplomacy card's raid-aware offset — the expression that could not help, because it only
    // considered raids, never a story card.
    expect(app, 'the diplomacy card re-added its own absolute offset').not.toMatch(
      /top-44' : 'top-4'\} z-10 w-full max-w-lg/,
    );
  });

  it('does not pad the container that does not hold them', () => {
    // `GameOverlays` is `fixed inset-0 z-50` and holds neither authored-decision card, so padding it
    // would offset nothing.
    const overlays = read('src/components/GameOverlays.tsx');
    expect(overlays, 'GameOverlays is being padded for cards it does not contain').not.toMatch(
      /justify-start overflow-hidden pt-4/,
    );
  });
});

describe('the intro does not continue while one of its controls has focus', () => {
  const intro = read('src/game/IntroScreen.tsx');

  it('skips an activatable target and the intro-control group', () => {
    // The window-level "press any key" handler must skip activatable targets and `.intro-control`,
    // or Enter/Space on the sound button unmounts the intro before the activation lands.
    expect(intro).toContain('isActivatableTarget(event.target)');
    expect(intro).toContain("closest?.('.intro-control')");
    expect(intro).toContain("from './hotkeys'");
  });

  it('keeps the click half that already worked', () => {
    expect(intro).toContain("closest('.intro-control')");
  });
});

describe('the game menu states the modality it actually enforces', () => {
  const menu = read('src/components/GameMenu.tsx');

  it('is a modal dialog while its backdrop blocks the map', () => {
    // The panel traps Tab and its scrim swallows pointer input, so `aria-modal="false"` let assistive
    // tech walk straight into the covered map.
    expect(menu).toContain('aria-modal="true"');
    expect(menu).not.toContain('aria-modal="false"');
  });

  it('wraps Tab over the canonical focusable list, not a private query', () => {
    expect(menu).toContain('getFocusableElements(panel)');
    expect(menu).not.toContain("'button:not([disabled]), input:not([disabled]), [tabindex]");
  });
});

describe('icon-only and role-carrying controls keep their semantics', () => {
  it('names every icon-only build-rail button', () => {
    const rail = read('src/components/GameBuildRail.tsx');
    // The grid toggle, the cancel ✕ and the full-catalogue » carried a glyph plus a `title` only, so a
    // screen reader announced "⊞ button"/"✕ button"/"» button".
    expect(rail).toMatch(/aria-label=\{showGrid \? 'Hide building grid' : 'Show building grid'\}/);
    expect(rail).toMatch(/aria-label=\{`Cancel building \$\{getBuildingConfig\(selectedBuildingType\)\.label\}`\}/);
    expect(rail).toContain('aria-label="Open full build catalogue"');
  });

  it('does not let role="status" erase the big-news dismiss button', () => {
    const banner = read('src/components/BigNewsBanner.tsx');
    // An explicit role overrides the native one, so the dismiss button keeps its own attributes free
    // of `role="status"`; the live region lives on the inner content wrapper.
    const buttonOpenTag = /<button\b[^>]*>/.exec(banner)?.[0] ?? '';
    expect(buttonOpenTag, 'no button tag found in BigNewsBanner').not.toBe('');
    expect(buttonOpenTag, 'the dismiss button carries role="status" again').not.toContain('role="status"');
    expect(buttonOpenTag, 'the dismiss button lost its live region entirely').not.toContain('aria-live');
    // The live region survives, moved onto the content wrapper.
    expect(banner).toMatch(/<div className="flex items-start gap-2" role="status" aria-live="polite">/);
  });

  it('makes the dashboard settler rows keyboard-reachable', () => {
    const dashboard = read('src/components/dashboard/GameDashboard.tsx');
    expect(dashboard).toContain("role={onSelect ? 'button' : undefined}");
    expect(dashboard).toContain('tabIndex={onSelect ? 0 : undefined}');
    expect(dashboard).toContain("event.key !== 'Enter' && event.key !== ' '");
    expect(dashboard).toMatch(/aria-label=\{onSelect \? `Settler \$\{citizenGivenName\(s\)\} — open details`/);
  });
});
