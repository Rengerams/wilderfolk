/**
 * Documented decisions must have code behind them: debug-only tooling is gated in code and the
 * `debugMode` flag has a single definition in the shell. Assertions run on comment-stripped source.
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
