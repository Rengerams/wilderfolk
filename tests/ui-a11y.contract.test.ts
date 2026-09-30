/**
 * D-9 of the 2026-09-21 audit — the accessibility and keyboard-contract defects the UI pass found.
 *
 * Each case names the pre-fix expression, so reverting a fix fails here instead of silently restoring
 * the defect. The house pattern is a source guard for the shape plus an assertion that the guard is
 * non-vacuous (see `tests/keyboardGuards.contract.test.ts` and `tests/tradeRouteRewards.copy.test.ts`).
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
    // held. Without one, the card's ~4.8 s of full-screen cover let every gameplay hotkey act on the
    // game behind it and made Escape run the game handler's own chain (clearing the map selection)
    // instead of skipping the card. The card is not focusable, so its own `onKeyDown` caught nothing.
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
    // Ordering, not regex nesting: this guard is itself a correction. Its first version asserted that
    // `GameOverlays` was a flex column whose flow children would stack — but the cards render in the
    // map stage's own `absolute inset-0 z-10` overlay, which is **not** a flex container. So when the
    // cards lost their `absolute left-1/2 -translate-x-1/2`, they landed in that box's top-left
    // corner and this guard stayed green: it proved a class string, not the parent it named.
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
    // The parent the first version of this guard named. `GameOverlays` is `fixed inset-0 z-50`, its
    // children are all `absolute`, and the two authored-decision cards are not among them — so a
    // `pt-4` there offsets nothing and left the real defect in place.
    const overlays = read('src/components/GameOverlays.tsx');
    expect(overlays, 'GameOverlays is being padded for cards it does not contain').not.toMatch(
      /justify-start overflow-hidden pt-4/,
    );
  });
});

describe('the intro does not continue while one of its controls has focus', () => {
  const intro = read('src/game/IntroScreen.tsx');

  it('skips an activatable target and the intro-control group', () => {
    // The window-level "press any key" handler had no target check at all while the click handler
    // skipped `.intro-control`. Tab reaches the 🔊/🔇 button, so Enter or Space there ran
    // `handleContinue` and unmounted the intro (and the button) before its own activation landed.
    expect(intro).toContain('isActivatableTarget(event.target)');
    expect(intro).toContain("closest?.('.intro-control')");
    expect(intro).toContain("from './hotkeys'");
  });

  it('keeps the click half that already worked', () => {
    expect(intro).toContain("closest('.intro-control')");
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
    // An explicit role overrides the native one, so the card was announced as a status region and the
    // click-to-dismiss affordance was never exposed. The check is on the button's **own** attribute
    // list, not on the text between its tags: the live region legitimately lives on an inner element,
    // and a `[\s\S]*?` guard would flag that correct shape (it did).
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
