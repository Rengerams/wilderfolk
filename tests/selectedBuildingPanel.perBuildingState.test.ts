import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `SelectedBuildingPanel` arms demolish in component state; `key={selectedBuilding.id}` at
 * the App call site forces a remount so an armed id cannot leak. Guarded at source: no DOM tier.
 */
describe('SelectedBuildingPanel is keyed per building so armed demolish cannot leak', () => {
  const appSource = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');

  it('renders the panel with key={selectedBuilding.id}', () => {
    expect(appSource).toMatch(/<SelectedBuildingPanel\s+key=\{selectedBuilding\.id\}/);
  });
});
