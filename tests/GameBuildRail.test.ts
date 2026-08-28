import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import GameBuildRail from '../src/components/GameBuildRail';
import { BuildingType } from '../src/game/gameTypes';
import { initGame } from '../src/game/worldGen';

describe('GameBuildRail', () => {
  it('renders collapsed build controls and selected-building cancellation without owning build state', () => {
    const markup = renderToStaticMarkup(createElement(GameBuildRail, {
      world: initGame(),
      buildPanelOpen: false,
      selectedBuildingType: BuildingType.House,
      showGrid: true,
      onToggleOpen: vi.fn(),
      onOpen: vi.fn(),
      onSelect: vi.fn(),
      onLocked: vi.fn(),
      onCancel: vi.fn(),
      onToggleGrid: vi.fn(),
    }));

    expect(markup).toContain('class="build-panel side-panel');
    expect(markup).toContain('Expand build panel (B)');
    expect(markup).toContain('Toggle grid (G)');
    expect(markup).toContain('Cancel House (ESC)');
    expect(markup).toContain('Full build catalog (B)');
  });
});
