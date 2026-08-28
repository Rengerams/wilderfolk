import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import GameSidebar from '../src/components/GameSidebar';

describe('GameSidebar', () => {
  it('preserves tab content inside the sidebar presentation landmark', () => {
    const markup = renderToStaticMarkup(createElement(GameSidebar, null, createElement('div', null, 'Tab content')));
    expect(markup).toContain('aria-label="Game sidebar"');
    expect(markup).toContain('Tab content');
  });
});
