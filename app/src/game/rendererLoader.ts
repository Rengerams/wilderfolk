type RendererModule = typeof import('./renderer');

let rendererModule: RendererModule | null = null;
type RenderArgs = Parameters<RendererModule['renderGame']>;
let pendingRender: RenderArgs | null = null;

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

export function preloadRenderer(): Promise<void> {
  return rendererReady.then(() => undefined);
}

export function resetRendererCaches(): void {
  if (rendererModule) {
    rendererModule.resetRendererCaches();
    return;
  }
  void rendererReady.then((mod) => mod.resetRendererCaches());
}

export function renderGame(
  ...args: RenderArgs
): void {
  if (rendererModule) {
    pendingRender = null;
    rendererModule.renderGame(...args);
    return;
  }
  pendingRender = args;
  void rendererReady.then((mod) => {
    if (pendingRender === args) flushPendingRender(mod);
  });
}