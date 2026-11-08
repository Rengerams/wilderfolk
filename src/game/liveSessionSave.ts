import { saveGame, loadGameOutcome } from './saveLoad';
import type { WorldState } from './gameTypes';
import type { ViewState } from './viewState';

type LiveSession = { world: WorldState; view: ViewState };
let liveSession: (() => LiveSession | null) | null = null;

/** The running loop registers here so a render failure can still export the current colony. */
export function registerLiveSessionSave(provider: () => LiveSession | null): () => void {
  liveSession = provider;
  return () => {
    if (liveSession === provider) liveSession = null;
  };
}

/** Live colony when the loop is alive, otherwise the last browser quick-save. */
export function exportCurrentSession(): boolean {
  const live = liveSession?.();
  if (live) return saveGame(live.world, live.view, false).success;
  const stored = loadGameOutcome();
  return stored.ok ? saveGame(stored.world, stored.view, false).success : false;
}
