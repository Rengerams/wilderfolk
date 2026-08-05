import { initPixiRenderer, renderGamePixi, pixiActive, disposePixiRenderer } from './pixiRenderer';

type RendererModule = typeof import('./renderer');

let rendererModule: RendererModule | null = null;
type RenderArgs = Parameters<RendererModule['renderGame']>;
let pendingRender: RenderArgs | null = null;

/** null = not tried yet; true = Pixi path active; false = fell back to Canvas 2D. */
let pixiMode: boolean | null = null;
let pixiStarting = false;

function flushPendingRender(mod: RendererModule): void {
  if (!pendingRender) return;
  const args = pendingRender;
  pendingRender = null;
  mod.renderGame(...args);
}

const rendererReady: Promise<RendererModule> = import('./renderer').then((mod) => {
  rendererModule = mod;
  flushPendingRender(mod);
  return mod;
});

/** Lazily start the Pixi GPU renderer on first frame (async WebGL init; the
 * Canvas 2D path keeps rendering until it is ready, then we switch over). */
function ensurePixi(ctx: CanvasRenderingContext2D): void {
  if (pixiMode !== null) return;
  if (pixiStarting) return;
  pixiStarting = true;
  void initPixiRenderer(ctx.canvas)
    .then((ok) => {
      pixiMode = ok && pixiActive();
      if (!pixiMode) disposePixiRenderer();
      pixiStarting = false;
      console.info(`[renderer] ${pixiMode ? 'Pixi (WebGL) active' : 'Canvas 2D (Pixi disabled or unavailable)'}`);
    })
    .catch((e) => {
      console.error('[pixi] init failed:', e);
      pixiMode = false;
      disposePixiRenderer();
      pixiStarting = false;
      console.info('[renderer] Canvas 2D (Pixi init failed)');
    });
}

export function preloadRenderer(): Promise<void> {
  return rendererReady.then(() => undefined);
}

export function resetRendererCaches(): void {
  if (pixiMode === true) {
    disposePixiRenderer();
    pixiMode = null;
  }
  if (rendererModule) {
    rendererModule.resetRendererCaches();
    return;
  }
  void rendererReady.then((mod) => mod.resetRendererCaches());
}

export function renderGame(
  ctx: CanvasRenderingContext2D,
  state: RenderArgs[1],
  cw: number,
  ch: number,
): void {
  if (pixiMode === null) {
    ensurePixi(ctx);
  }
  if (pixiMode === true) {
    renderGamePixi(ctx, state, cw, ch);
    return;
  }
  if (rendererModule) {
    pendingRender = null;
    rendererModule.renderGame(ctx, state, cw, ch);
    return;
  }
  // Coalesce to the latest frame while the renderer chunk loads.
  pendingRender = [ctx, state, cw, ch];
  void rendererReady.then((mod) => flushPendingRender(mod));
}
