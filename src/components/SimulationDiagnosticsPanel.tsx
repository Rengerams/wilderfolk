import { useEffect, useState } from 'react';
import type { GameLoop, GameLoopDiagnostics } from '../game/gameLoop';

type Props = {
  loop: GameLoop | null;
};

function formatLatency(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '—';
  return `${Math.round(value)} ms`;
}

function formatAge(value: number | null): string {
  if (value == null) return '—';
  if (value < 1000) return `${Math.round(value)} ms ago`;
  return `${(value / 1000).toFixed(1)} s ago`;
}

export default function SimulationDiagnosticsPanel({ loop }: Props) {
  const [open, setOpen] = useState(false);
  const [diagnostics, setDiagnostics] = useState<GameLoopDiagnostics | null>(null);

  useEffect(() => {
    if (!loop) {
      setDiagnostics(null);
      return;
    }
    const refresh = () => setDiagnostics(loop.getDiagnostics());
    refresh();
    const timer = window.setInterval(refresh, 250);
    return () => window.clearInterval(timer);
  }, [loop]);

  return (
    <section className="shrink-0 border-b border-stone-700/80 bg-stone-950/55">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-stone-400 hover:bg-stone-800/60 hover:text-amber-200"
        aria-expanded={open}
      >
        <span>Simulation diagnostics</span>
        <span aria-hidden>{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="space-y-1 px-3 pb-3 text-[11px] text-stone-300">
          {!diagnostics ? (
            <p className="text-stone-500">Waiting for the simulation loop…</p>
          ) : (
            <>
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg border border-stone-700/70 bg-stone-900/70 p-2">
                <span className="text-stone-500">Authority</span>
                <strong className={diagnostics.workerMode === 'worker' ? 'text-emerald-300' : 'text-amber-300'}>
                  {diagnostics.workerBooting ? 'Starting worker' : diagnostics.workerMode === 'worker' ? 'Simulation worker' : 'Main thread'}
                </strong>
                <span className="text-stone-500">Game time</span>
                <span>Day {diagnostics.inGameDay} · {String(diagnostics.hour).padStart(2, '0')}:00</span>
                <span className="text-stone-500">Tick</span>
                <span>{diagnostics.tick.toLocaleString()} · {diagnostics.paused ? 'Paused' : `${diagnostics.speed}× speed`}</span>
                <span className="text-stone-500">Last day boundary</span>
                <span>Tick {diagnostics.lastDailyBoundaryTick.toLocaleString()}</span>
                {diagnostics.workerMode === 'worker' && (
                  <>
                    <span className="text-stone-500">Tick response</span>
                    <span>{formatLatency(diagnostics.tickLatencyMs)} · {formatAge(diagnostics.lastWorkerActivityMsAgo)}</span>
                    <span className="text-stone-500">In flight</span>
                    <span>{diagnostics.ticksInFlight} tick{diagnostics.ticksInFlight === 1 ? '' : 's'}{diagnostics.commandInFlight ? ' · command pending' : ''}</span>
                  </>
                )}
              </div>
              <p className="text-[10px] leading-relaxed text-stone-500">
                Read-only view of the active simulation boundary. It does not change cadence, ownership, or world state.
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}

export type { Props as SimulationDiagnosticsPanelProps };
