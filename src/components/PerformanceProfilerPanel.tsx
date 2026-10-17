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
                <td className="px-1 py-1 text-right">{section.calls.toLocaleString()}</td>
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

/**
 * Player-accessible CPU profiler. It runs inside the live game while the drawer
 * is closed; enabling it sends one small toggle to the active simulation worker.
 */
export default function PerformanceProfilerPanel({ loopRef }: Props) {
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [copyStatus, setCopyStatus] = useState('');

  useEffect(() => {
    if (!open) return;
    const refresh = () => {
      const loop = loopRef.current;
      if (loop) setReport(loop.getPerformanceProfiling());
    };
    refresh();
    const timer = window.setInterval(refresh, 1000);
    return () => window.clearInterval(timer);
  }, [loopRef, open]);

  const toggle = () => {
    const loop = loopRef.current;
    if (!loop) return;
    const next = !loop.getPerformanceProfiling().enabled;
    loop.setPerformanceProfiling(next);
    setReport(loop.getPerformanceProfiling());
    setCopyStatus('');
  };

  const copyResults = async () => {
    const loop = loopRef.current;
    if (!loop) return;
    try {
      const snapshot = loop.getPerformanceProfiling();
      await navigator.clipboard.writeText(JSON.stringify({
        game: 'Wilderfolk',
        sampledAt: new Date().toISOString(),
        diagnostics: loop.getDiagnostics(),
        ...snapshot,
      }, null, 2));
      setCopyStatus('Copied!');
    } catch {
      setCopyStatus('Clipboard unavailable');
    }
  };

  const active = report?.enabled ?? false;
  return (
    <div className="pointer-events-auto absolute bottom-3 left-3 z-[65] text-stone-100">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-label="Open CPU profiler"
        className="rounded-lg border border-stone-600 bg-stone-950/90 px-3 py-1.5 text-xs font-bold shadow-lg hover:bg-stone-800"
      >
        {active ? '● CPU profiler' : 'CPU profiler'} {open ? '▾' : '▴'}
      </button>
      {open && (
        <section
          aria-label="In-game CPU profiler"
          className="mt-2 max-h-[min(60vh,440px)] w-[min(95vw,420px)] space-y-3 overflow-y-auto rounded-xl border border-stone-600 bg-stone-950/95 p-3 shadow-2xl"
        >
          <div className="flex items-center justify-between gap-2">
            <strong className="text-sm">Performance measurement</strong>
            <button
              type="button"
              onClick={toggle}
              className={`rounded px-3 py-1 text-xs font-semibold ${active
                ? 'bg-rose-900 text-rose-100 hover:bg-rose-800'
                : 'bg-emerald-800 text-white hover:bg-emerald-700'}`}
            >
              {active ? 'Stop' : 'Start measuring'}
            </button>
            <button
              type="button"
              onClick={copyResults}
              className="rounded bg-stone-700 px-2 py-1 text-xs hover:bg-stone-600"
            >Copy</button>
          </div>
          {copyStatus && <p className="text-[11px] text-emerald-300">{copyStatus}</p>}
          <p className="text-[11px] leading-relaxed text-stone-400">
            Start, play a few game days, then copy the report. Closing this panel
            does not stop measurement. CPU time only; nested stages overlap and
            totals must not be added together. Weather cost is in the main thread.
          </p>
          <ProfileTable name="Simulation worker" report={report?.worker ?? null} />
          <ProfileTable name="Main thread / rendering" report={report?.main ?? null} />
        </section>
      )}
    </div>
  );
}
