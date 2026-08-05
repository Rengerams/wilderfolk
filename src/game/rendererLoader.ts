/**
 * Renderer loader — Canvas 2D only.
 *
 * Kept as a thin pass-through so importers (gameLoop, App) don't need to
 * change; the PixiJS WebGL renderer was removed.
 */
export { renderGame, resetRendererCaches } from './renderer';

/** Preload the renderer module before the game view mounts. */
export function preloadRenderer(): Promise<void> {
  return Promise.resolve();
}
