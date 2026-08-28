import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import GameInspector from '../src/components/GameInspector';

describe('GameInspector', () => {
  const props = {
    selectedLabel: 'House',
    onClear: vi.fn(),
    onToggleCollapsed: vi.fn(),
    diagnostics: createElement('div', { 'data-testid': 'diagnostics' }, 'Diagnostics'),
    children: createElement('div', { 'data-testid': 'selection-content' }, 'Selection content'),
  };

  it('renders the selected content and accessible controls when expanded', () => {
    const markup = renderToStaticMarkup(createElement(GameInspector, { ...props, hasSelection: true, collapsed: false }));
    expect(markup).toContain('aria-label="Inspector"');
    expect(markup).toContain('Selection content');
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('Clear selection');
  });

  it('renders only the compact selected label when collapsed', () => {
    const markup = renderToStaticMarkup(createElement(GameInspector, { ...props, hasSelection: true, collapsed: true }));
    expect(markup).toContain('House');
    expect(markup).not.toContain('Selection content');
    expect(markup).toContain('aria-expanded="false"');
  });

  it('keeps the diagnostics presentation when there is no selection', () => {
    const markup = renderToStaticMarkup(createElement(GameInspector, { ...props, hasSelection: false, collapsed: false }));
    expect(markup).toContain('Diagnostics');
    expect(markup).not.toContain('Selected');
  });
});
