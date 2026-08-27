import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import GamePlayLayout from '../src/components/GamePlayLayout';

describe('GamePlayLayout', () => {
  it('preserves the gameplay composition order and stable structural regions', () => {
    const markup = renderToStaticMarkup(createElement(GamePlayLayout, {
      header: createElement('header', { id: 'header-slot' }, 'Header'),
      alertBar: createElement('section', { id: 'alert-slot' }, 'Alerts'),
      buildRail: createElement('aside', { id: 'build-slot' }, 'Build'),
      mapStage: createElement('canvas', { id: 'map-slot' }),
      inspector: createElement('aside', { id: 'inspector-slot' }, 'Inspector'),
      overlays: createElement('section', { id: 'overlay-slot' }, 'Overlays'),
    }));

    expect(markup).toContain('class="game-shell flex h-screen w-screen flex-col overflow-hidden text-stone-100"');
    expect(markup).toMatch(/header-slot[\s\S]*alert-slot[\s\S]*build-slot[\s\S]*<main[^>]*>[\s\S]*map-slot[\s\S]*inspector-slot[\s\S]*overlay-slot/);
    expect(markup).toContain('class="map-stage relative"');
  });
});
