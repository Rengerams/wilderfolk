import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GameErrorBoundary, { isCrashRecoveryActive, registerCrashRecoverySource, reloadGamePage } from '../src/components/GameErrorBoundary';
import { initGame } from '../src/game/worldGen';
import { createInitialView } from '../src/game/viewState';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('CB-02: root crash recovery', () => {
  it('captures the latest session refs before a crashing App unmounts', () => {
    const world = initGame({ skipTerrain: true, villageName: 'Recovery valley' });
    const view = createInitialView(world.width, world.height);
    const getWorld = vi.fn(() => world);
    const getView = vi.fn(() => view);
    const unregister = registerCrashRecoverySource({ getWorld, getView });

    const fallback = GameErrorBoundary.getDerivedStateFromError();
    unregister();
    expect(fallback.crashed).toBe(true);
    expect(isCrashRecoveryActive()).toBe(true);
    expect(fallback.snapshot).toEqual({ world, view });
    expect(getWorld).toHaveBeenCalledOnce();
    expect(getView).toHaveBeenCalledOnce();
    expect(GameErrorBoundary.getDerivedStateFromError().snapshot).toBeNull();
  });

  it('renders a recovery-download action only when a colony snapshot is available', () => {
    const world = initGame({ skipTerrain: true });
    const view = createInitialView(world.width, world.height);
    const unregister = registerCrashRecoverySource({ getWorld: () => world, getView: () => view });
    const fallback = GameErrorBoundary.getDerivedStateFromError();
    unregister();

    const boundary = new GameErrorBoundary({ children: createElement('p', null, 'Game') });
    boundary.state = { crashed: true, snapshot: fallback.snapshot ?? null, exportMessage: null };
    const html = renderToStaticMarkup(boundary.render());
    expect(html).toContain('Download recovery snapshot');
    expect(html).toContain('Recent simulation-worker actions may not yet be included');

    boundary.state = { crashed: true, snapshot: null, exportMessage: null };
    expect(renderToStaticMarkup(boundary.render())).not.toContain('Download recovery snapshot');
  });

  it('offers a reload action on every crash and reloads the page', () => {
    const boundary = new GameErrorBoundary({ children: createElement('p', null, 'Game') });
    boundary.state = { crashed: true, snapshot: null, exportMessage: null };
    expect(renderToStaticMarkup(boundary.render())).toContain('Reload game');

    const reload = vi.fn();
    vi.stubGlobal('window', { location: { reload } });
    reloadGamePage();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('keeps the fallback usable even when snapshot access itself fails', () => {
    const unregister = registerCrashRecoverySource({
      getWorld: () => { throw new Error('crash in recovery read'); },
      getView: () => null,
    });
    expect(GameErrorBoundary.getDerivedStateFromError().snapshot).toBeNull();
    unregister();
  });
});
