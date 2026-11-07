import { Component, type ErrorInfo, type ReactNode } from 'react';
import { exportCurrentSession } from '../game/liveSessionSave';

interface Props {
  children: ReactNode;
}

interface State {
  failed: boolean;
  exportState: 'idle' | 'ok' | 'failed';
}

/** The one top-level render boundary: a panel throw must not blank the whole game. */
export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, exportState: 'idle' };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[AppErrorBoundary] render failed', error, info.componentStack);
  }

  private handleExport = (): void => {
    try {
      this.setState({ exportState: exportCurrentSession() ? 'ok' : 'failed' });
    } catch {
      this.setState({ exportState: 'failed' });
    }
  };

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-950 p-6 text-stone-100">
        <section className="w-full max-w-lg space-y-4 rounded-xl border border-rose-800 bg-stone-900 p-6">
          <h1 className="text-2xl font-bold text-rose-200">The colony hit a rendering error</h1>
          <p className="text-sm text-stone-300">
            Your simulation was not deliberately changed. Export the current colony before reloading
            so unsaved progress is not lost.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={this.handleExport}
              className="rounded bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600"
            >
              Export current save
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded bg-stone-700 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-600"
            >
              Reload game
            </button>
          </div>
          {this.state.exportState === 'ok' && <p className="text-sm text-emerald-300">Save exported.</p>}
          {this.state.exportState === 'failed' && (
            <p className="text-sm text-rose-300">No live or stored colony could be exported.</p>
          )}
        </section>
      </div>
    );
  }
}
