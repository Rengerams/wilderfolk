import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import GameOverlays from '../src/components/GameOverlays';

describe('GameOverlays', () => {
  it('preserves child order inside the overlay presentation landmark', () => {
    const markup = renderToStaticMarkup(createElement(GameOverlays, null,
      createElement('div', { id: 'priority' }, 'Priority'),
      createElement('div', { id: 'news' }, 'News'),
    ));
    expect(markup).toContain('aria-label="Game notifications and overlays"');
    expect(markup.indexOf('Priority')).toBeLessThan(markup.indexOf('News'));
  });
});
