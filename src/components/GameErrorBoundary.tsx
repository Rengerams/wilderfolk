import { Component, type ErrorInfo, type ReactNode } from 'react';
import type { WorldState } from '../game/gameTypes';
import type { ViewState } from '../game/viewState';
import { downloadSaveFile } from '../game/saveLoad';

type RecoverySnapshot = { world: WorldState; view: ViewState };
type RecoverySource = { getWorld: () => WorldState | null; getView: () => ViewState | null };
type BoundaryState = { crashed: boolean; snapshot: RecoverySnapshot | null; exportMessage: string | null };

let recoverySource: RecoverySource | null = null;
let recoveringFromCrash = false;

/** Crash unmount must not auto-save a potentially inconsistent render/worker snapshot. */
export function isCrashRecoveryActive(): boolean {
  return recoveringFromCrash;
}

/** Keep only the active game's read-only refs; the boundary snapshots them before React unmounts App. */
export function registerCrashRecoverySource(source: RecoverySource): () => void {
  recoverySource = source;
  return () => {
    if (recoverySource === source) recoverySource = null;
  };
}

/** Catch render/lifecycle crashes; never replace a healthy browser save with a possibly stale snapshot. */
export default class GameErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { crashed: false, snapshot: null, exportMessage: null };

  static getDerivedStateFromError(): Partial<BoundaryState> {
    recoveringFromCrash = true;
    let snapshot: RecoverySnapshot | null = null;
    try {
      const world = recoverySource?.getWorld();
      const view = recoverySource?.getView();
      if (world && view) snapshot = { world, view };
    } catch {
      // A crash in the recovery source must not prevent the fallback UI.
    }
    return { crashed: true, snapshot, exportMessage: null };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[Wilderfolk] UI crashed', error, info.componentStack);
  }

  private exportSnapshot = (): void => {
    const snapshot = this.state.snapshot;
    if (!snapshot) return;
    const result = downloadSaveFile(snapshot.world, snapshot.view, false);
    this.setState({
      exportMessage: result.success
        ? 'Recovery file downloaded. Your existing browser quick-save was not changed.'
        : result.error,
    });
  };

  render(): ReactNode {
    if (!this.state.crashed) return this.props.children;
    return (
      <main role="alert" className="flex min-h-screen items-center justify-center bg-stone-950 p-6 text-stone-100">
        <section className="w-full max-w-xl space-y-4 rounded-xl border border-rose-800 bg-stone-900 p-6">
          <h1 className="text-2xl font-bold text-rose-200">Wilderfolk encountered an error</h1>
          <p>The game interface stopped unexpectedly. Your existing browser quick-save has not been replaced by this recovery screen.</p>
          {this.state.snapshot ? (
            <>
              <p>You can export the last available colony snapshot before refreshing. Recent simulation-worker actions may not yet be included.</p>
              <button type="button" onClick={this.exportSnapshot} className="rounded-lg bg-amber-700 px-4 py-2 font-semibold text-white hover:bg-amber-600">
                Download recovery snapshot (.json)
              </button>
            </>
          ) : (
            <p>No active colony snapshot is available. You can restart and try loading your previous save.</p>
          )}
          {this.state.exportMessage && <p role="status">{this.state.exportMessage}</p>}
        </section>
      </main>
    );
  }
}
