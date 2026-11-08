import { lazy, type LazyExoticComponent } from 'react';

/** Pause before the second fetch, so a reloading dev server can finish swapping its module graph. */
const RETRY_DELAY_MS = 250;

/** The component shape `React.lazy` accepts, so each loader keeps its concrete component type. */
type LazyComponent = Awaited<ReturnType<Parameters<typeof lazy>[0]>>['default'];

/** `lazy` with one re-fetch; a second failure reaches AppErrorBoundary, which offers export and reload. */
export function lazyWithRetry<C extends LazyComponent>(
  load: () => Promise<{ default: C }>,
): LazyExoticComponent<C> {
  return lazy(() =>
    load().catch((firstError: unknown) => {
      console.warn('[lazyWithRetry] panel chunk fetch failed, fetching once more', firstError);
      return new Promise<{ default: C }>((resolve, reject) => {
        setTimeout(() => {
          load().then(resolve, reject);
        }, RETRY_DELAY_MS);
      });
    }),
  );
}
