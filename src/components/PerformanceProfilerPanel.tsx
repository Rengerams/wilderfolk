import { useEffect, useState, type RefObject } from 'react';
import type { GameLoop } from '../game/gameLoop';
import type { PerformanceSnapshot } from '../game/performanceProfiler';

interface Props {
  loopRef: RefObject<GameLoop | null>;
}

type Report = ReturnType<GameLoop['getPerformanceProfiling']>;

function ProfileTable({ name, report }: { name: string; report: PerformanceSnapshot | null }) {
  if (!report || report.sections.length === 0) {
    return <p className="text-[11px] text-stone-500">{name}: No samples yet.</p>;
  }
  return (
    <div className="space-y-1">
      <p className="text-xs font-bold text-amber-200">
        {name} · {report.ticks} ticks · {report.frames} frames · {Math.round(report.elapsedMs / 1000)}s
      </p>
      <p className="text-[10px] text-stone-400">
        Tick {report.lastTick} · {report.population || '—'} settlers · {report.weather || '—'}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full table-fixed text-[10px] tabular-nums">
          <thead className="text-left text-stone-500">
            <tr>
              <th className="w-[40%] px-1 py-1">Function / stage</th>
              <th className="w-[14%] px-1 py-1 text-right">Calls</th>
              <th className="w-[16%] px-1 py-1 text-right">Total</th>
              <th className="w-[15%] px-1 py-1 text-right">Avg</th>
              <th className="w-[15%] px-1 py-1 text-right">Peak</th>
            </tr>
          </thead>
          <tbody>
            {report.sections.slice(0, 18).map((section) => (
              <tr key={section.name} className="border-t border-stone-800">
                <td className="break-words px-1 py-1 text-stone-300" title={`Peak at tick ${section.peakTick}`}>{section.name}</td>
                <td className="px-1 py-1 text-right">
                  <span className="block">{section.calls.toLocaleString()}</span>
                  <span className="block text-[9px] text-stone-500">
                    {(section.calls / Math.max(1, name === 'Simulation worker' ? report.ticks : report.frames)).toFixed(2)}
                    /{name === 'Simulation worker' ? 'tick' : 'frame'}
                  </span>
                </td>
                <td className="px-1 py-1 text-right">{section.totalMs.toFixed(0)}ms</td>
                <td className="px-1 py-1 text-right">{section.averageMs.toFixed(1)}</td>
                <td className="px-1 py-1 text-right text-amber-300">{section.maxMs.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Opt-in CPU reporting continues while the game panel is closed. */
function DevPerformanceProfilerPanel({ loopRef }: Props) {
  const [report, setReport] = useState<Report | null>(null);
  const [copyStatus, setCopyStatus] = useState('');
  const [stopping, setStopping] = useState(false);
  const [stoppedDiagnostics, setStoppedDiagnostics] = useState<ReturnType<GameLoop['getDiagnostics']> | null>(null);

  useEffect(() => {
    const refresh = () => {
      const loop = loopRef.current;
      if (loop) setReport(loop.getPerformanceProfiling());
    };
    refresh();
    const timer = window.setInterval(refresh, 1000);
    return () => window.clearInterval(timer);
  }, [loopRef]);

  const toggle = async () => {
    const loop = loopRef.current;
    if (!loop || stopping) return;
    const next = !loop.getPerformanceProfiling().enabled;
    setCopyStatus('');
    if (next) setStoppedDiagnostics(null);
    if (!next) setStopping(true);
    try {
      await loop.setPerformanceProfiling(next);
      if (!next) setStoppedDiagnostics(loop.getDiagnostics());
      setReport(loop.getPerformanceProfiling());
    } catch {
      setCopyStatus('Could not confirm the final worker sample. Retry Stop before copying.');
    } finally {
      setStopping(false);
    }
  };

  const copyResults = async () => {
    const loop = loopRef.current;
    if (!loop || stopping || loop.getPerformanceProfiling().enabled) return;
    try {
      const snapshot = loop.getPerformanceProfiling();
      await navigator.clipboard.writeText(JSON.stringify({
        game: 'Wilderfolk',
        sampledAt: new Date().toISOString(),
        diagnostics: stoppedDiagnostics ?? loop.getDiagnostics(),
        ...snapshot,
      }, null, 2));
      setCopyStatus('Copied!');
    } catch {
      setCopyStatus('Clipboard unavailable');
    }
  };

  const active = report?.enabled ?? false;
  return (
    <div className="text-stone-100">
      {
        <section
          aria-label="In-game CPU profiler"
          className="space-y-3 p-2"
        >
          <div className="flex items-center justify-between gap-2">
            <strong className="text-sm">Performance measurement</strong>
            <button
              type="button"
              onClick={() => { void toggle(); }}
              disabled={stopping}
              className={`rounded px-3 py-1 text-xs font-semibold disabled:cursor-wait disabled:opacity-60 ${active
                ? 'bg-rose-900 text-rose-100 hover:bg-rose-800'
                : 'bg-emerald-800 text-white hover:bg-emerald-700'}`}
            >
              {stopping ? 'Stopping…' : active ? 'Stop' : 'Start measuring'}
            </button>
            <button
              type="button"
              onClick={() => { void copyResults(); }}
              disabled={stopping || active || report == null}
              className="rounded bg-stone-700 px-2 py-1 text-xs hover:bg-stone-600 disabled:cursor-not-allowed disabled:opacity-40"
            >Copy</button>
          </div>
          {copyStatus && <p className="text-[11px] text-emerald-300">{copyStatus}</p>}
          <p className="text-[11px] leading-relaxed text-stone-400">
            Start, play a few game days, then Stop and wait for the worker's final sample before Copy.
            Closing this panel does not stop measurement. CPU time only; nested stages overlap and
            totals must not be added together. Weather cost is in the main thread.
          </p>
          <ProfileTable name="Simulation worker" report={report?.worker ?? null} />
          <ProfileTable name="Main thread / rendering" report={report?.main ?? null} />
        </section>
      }
    </div>
  );
}

/** Development-only: never expose the profiler in a packaged or production build. */
export default function PerformanceProfilerPanel(props: Props) {
  if (!import.meta.env.DEV) return null;
  return <DevPerformanceProfilerPanel {...props} />;
}
