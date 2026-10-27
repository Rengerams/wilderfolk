/**
 * Documented decisions must have code behind them.
 *
 * The Guide's "Spawn Moon Howler" cheat: recorded as "card gated on `debugMode`" while the card
 * rendered unconditionally and `debugMode` never left `App.tsx`'s diagnostics panel.
 *
 * The same class of defect is what this file used to guard on the ground renderer: `AGENTS.md`,
 * `CHANGELOG.md` and two module comments all asserted `USE_PIXI_GROUND = false` while that constant
 * existed nowhere in `src/`, so dormancy held only by accident. That path — and the constant, and the
 * `pixiUnavailable` latch — were deleted on 2026-09-25, so the guard left with them; canvas2D is now
 * the only ground renderer and there is no second path to keep honest.
 *
 * Assertions run against **comment-stripped** source. A plain text search would be satisfied by the
 * very comment that documents the rule — the failure mode `BUG-REGISTER.md` Appendix C records in
 * `saveLoad.outcomeReasons.test.ts:58-64`, where a source-text assertion can only fire on a comment.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

/** Strip block and line comments so an assertion cannot be satisfied by prose about the rule. */
function code(relativePath: string): string {
  return source(relativePath)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('debug-only tooling is gated in code, not in a comment (bug 45)', () => {
  const moreTab = code('src/components/tabPanels/MoreTabPanel.tsx');
  const overview = code('src/components/CitizenOverviewScreen.tsx');
  const app = code('src/App.tsx');

  it('the Guide declares and applies a debugMode gate on its Testing card', () => {
    expect(moreTab).toMatch(/debugMode\s*:\s*boolean/);
    // The card must be inside a conditional, and the conditional must be the debug flag.
    expect(moreTab).toMatch(/\{\s*debugMode\s*&&\s*\(/);
  });

  it('the shell passes the flag down; the Guide cannot read it from nowhere', () => {
    expect(app).toMatch(/debugMode=\{debugMode\}/);
    expect(overview).toMatch(/debugMode=\{debugMode\}/);
    expect(overview).toMatch(/debugMode\s*:\s*boolean/);
  });

  it('the debug flag has exactly one definition, in the shell', () => {
    // A second `?debug=1` parse would be a second source of truth for "is this a debug session".
    const parses = app.match(/URLSearchParams/g)?.length ?? 0;
    expect(parses).toBe(1);
    expect(moreTab).not.toMatch(/URLSearchParams|location\.search/);
    expect(overview).not.toMatch(/URLSearchParams|location\.search/);
  });
});
