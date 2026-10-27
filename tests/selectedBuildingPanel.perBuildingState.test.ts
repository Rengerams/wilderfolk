import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `SelectedBuildingPanel` arms its destructive action ("Confirm demolish") in
 * component state, and compares the armed id against the *current* building, so an
 * arm set on building A is invisible — not cleared — while B is selected. The state
 * only resets when React replaces the component instance, which is what the
 * `key={building.id}` at the App call site does. Without the key, returning to A
 * renders the confirm button with no intervening click, and one click demolishes a
 * building the player never armed.
 *
 * This tier has no DOM environment (`vitest.config.ts` is `environment: 'node'`,
 * `include: tests/**\/*.test.ts`), so the contract is guarded at the source, exactly
 * as `tradeRoutes.eligibility.test.ts` guards the trade panel. A source guard is
 * weaker than a render test: it can only prove the key is still present, not that
 * React reuses the instance without it. That limitation is disclosed here rather
 * than hidden behind a test name that implies rendering.
 */
describe('SelectedBuildingPanel is keyed per building so armed demolish cannot leak', () => {
  const appSource = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');

  it('renders the panel with key={selectedBuilding.id}', () => {
    expect(appSource).toMatch(/<SelectedBuildingPanel\s+key=\{selectedBuilding\.id\}/);
  });
});
