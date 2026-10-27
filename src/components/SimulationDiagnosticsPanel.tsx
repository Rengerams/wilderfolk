import { useEffect, useState, type RefObject } from 'react';
import type { GameLoop, GameLoopDiagnostics } from '../game/gameLoop';
import { isPlayerHuman } from '../game/playerHuman';

export interface SimulationDiagnosticsPanelProps {
  loopRef: RefObject<GameLoop | null>;
  debugMode?: boolean;
}

export interface LifecycleAlignmentData {
  population: number;
  pregnant: number;
  dueSoon: number;
  progress: string;
  expectingMismatch: number;
  partnerMismatch: number;
  missingParentLinks: number;
}

const STORAGE_KEY = 'wilderfolk-diagnostics-panel-open';

function formatLatency(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '—';
  return `${Math.round(value)} ms`;
}

function formatAge(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (value < 1000) return `${Math.round(value)} ms ago`;
  return `${(value / 1000).toFixed(1)} s ago`;
}

function getLifecycleAlignment(loop: GameLoop | null): LifecycleAlignmentData {
  const entities = loop?.getWorld()?.entities ?? [];
  const humans = [];

  for (let i = 0; i < entities.length; i++) {
    const e = entities[i];
    if (e.alive && isPlayerHuman(e)) {
      humans.push(e);
    }
  }

  const humanIds = new Set<number>();
  for (let i = 0; i < humans.length; i++) {
    humanIds.add(humans[i].id);
  }

  let pregnantCount = 0;
  let dueSoonCount = 0;
  let expectingMismatch = 0;
  let partnerMismatch = 0;
  let missingParentLinks = 0;
  let minProgress = Infinity;
  let maxProgress = -Infinity;

  for (let i = 0; i < humans.length; i++) {
    const h = humans[i];

    if (h.pregnant) {
      pregnantCount++;
      const prog = h.pregnancyProgress;
      const due = h.pregnancyDueProgress;
      if (prog != null && Number.isFinite(prog)) {
        if (prog < minProgress) minProgress = prog;
        if (prog > maxProgress) maxProgress = prog;
        if (due != null && due - prog <= 10) {
          dueSoonCount++;
        }
      }
    } else if (h.relationshipStatus === 'expecting') {
      expectingMismatch++;
    }

    if (h.partnerId != null && !humanIds.has(h.partnerId)) {
      partnerMismatch++;
    }

    if (h.isJuvenile && h.motherId == null && h.fatherId == null) {
      missingParentLinks++;
    }
  }

  const progressRange =
    minProgress !== Infinity && maxProgress !== -Infinity
      ? `${minProgress.toFixed(0)}–${maxProgress.toFixed(0)}`
      : '—';

  return {
    population: humans.length,
    pregnant: pregnantCount,
    dueSoon: dueSoonCount,
    progress: progressRange,
    expectingMismatch,
    partnerMismatch,
    missingParentLinks,
  };
}

export default function SimulationDiagnosticsPanel({
  loopRef,
  debugMode = false,
}: SimulationDiagnosticsPanelProps) {
  const [open, setOpen] = useState(() => {
    try {
      return typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const [diagnostics, setDiagnostics] = useState<GameLoopDiagnostics | null>(null);
  const [lifecycle, setLifecycle] = useState<LifecycleAlignmentData | null>(null);

  // Poll diagnostics straight from the (latest) simulation loop. Reading the
  // loop through the ref inside the interval keeps this reactive to loop
  // lifetime without touching refs during render. Gated on `open`: a collapsed
  // section must not commit a fresh diagnostics object 4×/s.
  useEffect(() => {
    if (!open) return;
    const refresh = () => {
      const loop = loopRef.current;
      if (!loop) {
        setDiagnostics(null);
        return;
      }
      try {
        setDiagnostics(loop.getDiagnostics());
      } catch (err) {
        console.error('[SimulationDiagnosticsPanel] Failed to query diagnostics:', err);
      }
    };

    refresh();
    const timer = window.setInterval(refresh, 250);
    return () => window.clearInterval(timer);
  }, [loopRef, open]);

  // Throttled lifecycle alignment refresh (every 2s) while the panel is open.
  useEffect(() => {
    if (!debugMode || !open) return;
    const refreshLifecycle = () => {
      try {
        setLifecycle(getLifecycleAlignment(loopRef.current));
      } catch (err) {
        console.error('[SimulationDiagnosticsPanel] Failed to compute lifecycle alignment:', err);
      }
    };
    refreshLifecycle();
    const timer = window.setInterval(refreshLifecycle, 2000);
    return () => window.clearInterval(timer);
  }, [debugMode, open, loopRef]);

  const handleToggle = () => {
    setOpen((prev) => {
      const next = !prev;
      try {
        if (typeof window !== 'undefined') {
          localStorage.setItem(STORAGE_KEY, String(next));
        }
      } catch {
        /* Storage write failure ignored */
      }
      return next;
    });
  };

  return (
    <section className="shrink-0 border-b border-stone-700/80 bg-stone-950/55">
      <button
        type="button"
        onClick={handleToggle}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-stone-400 hover:bg-stone-800/60 hover:text-amber-200 transition-colors"
        aria-expanded={open}
        aria-controls="diagnostics-content"
      >
        <span>Simulation diagnostics</span>
        <span aria-hidden>{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div id="diagnostics-content" className="space-y-1.5 px-3 pb-3 text-[11px] text-stone-300">
          {!diagnostics ? (
            <p className="text-stone-500">Waiting for the simulation loop…</p>
          ) : (
            <>
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg border border-stone-700/70 bg-stone-900/70 p-2">
                <span className="text-stone-500">Authority</span>
                <strong
                  className={
                    diagnostics.workerMode === 'worker'
                      ? 'text-emerald-300'
                      : 'text-amber-300'
                  }
                >
                  {diagnostics.workerBooting
                    ? 'Starting worker…'
                    : diagnostics.workerMode === 'worker'
                      ? 'Simulation worker'
                      : 'Main thread'}
                </strong>

                <span className="text-stone-500">Game time</span>
                <span>
                  Day {diagnostics.inGameDay} · {String(diagnostics.hour).padStart(2, '0')}:00
                </span>

                <span className="text-stone-500">Tick</span>
                <span>
                  {diagnostics.tick.toLocaleString()} ·{' '}
                  {diagnostics.paused ? 'Paused' : `${diagnostics.speed}× speed`}
                </span>

                <span className="text-stone-500">Last day boundary</span>
                <span>Tick {diagnostics.lastDailyBoundaryTick.toLocaleString()}</span>

                {diagnostics.workerMode === 'worker' && (
                  <>
                    <span className="text-stone-500">Tick response</span>
                    <span>
                      {formatLatency(diagnostics.tickLatencyMs)} ·{' '}
                      {formatAge(diagnostics.lastWorkerActivityMsAgo)}
                    </span>

                    <span className="text-stone-500">In flight</span>
                    <span>
                      {diagnostics.ticksInFlight} tick{diagnostics.ticksInFlight === 1 ? '' : 's'}
                      {diagnostics.commandInFlight ? ' · command pending' : ''}
                    </span>
                  </>
                )}
              </div>

              {debugMode && lifecycle && (
                <div className="rounded-lg border border-cyan-900/70 bg-cyan-950/20 p-2">
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-cyan-300">
                    Lifecycle alignment
                  </div>
                  <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                    <span className="text-stone-500">Living settlers</span>
                    <span>{lifecycle.population}</span>

                    <span className="text-stone-500">Pregnant</span>
                    <span>
                      {lifecycle.pregnant} · due soon {lifecycle.dueSoon}
                    </span>

                    <span className="text-stone-500">Progress range</span>
                    <span>{lifecycle.progress}</span>

                    <span className="text-stone-500">Expecting mismatch</span>
                    <span
                      className={
                        lifecycle.expectingMismatch === 0
                          ? 'text-emerald-300'
                          : 'text-amber-300'
                      }
                    >
                      {lifecycle.expectingMismatch}
                    </span>

                    <span className="text-stone-500">Partner mismatch</span>
                    <span
                      className={
                        lifecycle.partnerMismatch === 0
                          ? 'text-emerald-300'
                          : 'text-amber-300'
                      }
                    >
                      {lifecycle.partnerMismatch}
                    </span>

                    <span className="text-stone-500">Missing parent links</span>
                    <span
                      className={
                        lifecycle.missingParentLinks === 0
                          ? 'text-emerald-300'
                          : 'text-amber-300'
                      }
                    >
                      {lifecycle.missingParentLinks}
                    </span>
                  </div>
                </div>
              )}

              <p className="text-[10px] leading-relaxed text-stone-500">
                Read-only view of the active simulation boundary. It does not alter cadence,
                ownership, or world state.
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}