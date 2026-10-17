import { memo, useMemo, useState } from 'react';
import type { GameEventLog } from './gameTypes';
import { displayYear } from './dayCycleClock';
import { buildWeeklyGazette, gazetteWeekForTick } from './weeklyGazette';
import { EVENT_LOG_FILTER_OPTIONS, getEventLogFilterLabel } from './eventLogFilters';
import {
  downloadChronicleCSV,
  downloadChronicleJSON,
  downloadChronicleLog,
  loadExportChronicleOnSave,
  saveExportChronicleOnSave,
  type ChronicleExportMeta,
} from './eventLogExport';

interface Props {
  events: GameEventLog[];
  meta: ChronicleExportMeta;
  /** Category to open on, so a caller that already knows the subject need not land on "All". */
  initialFilter?: 'all' | GameEventLog['type'];
  /** Mirrors the panel's own category choice back to that caller. */
  onFilterChange?: (filter: 'all' | GameEventLog['type']) => void;
}

const EVENT_ICONS: Record<GameEventLog['type'], string> = {
  birth: '👶',
  conception: '🤰',
  death: '💀',
  marriage: '💍',
  divorce: '💔',
  scandal: '⚡',
  prison: '⛓️',
  election: '🗳️',
  building: '🏗️',
  disaster: '⚠️',
  research: '🔬',
  trade: '🚢',
  migration: '🚶',
  season: '🌸',
  event: '🌝',
  combat: '⚔️',
  milestone: '🏅',
};

const EVENT_COLORS: Record<GameEventLog['type'], string> = {
  birth: 'text-pink-400',
  conception: 'text-fuchsia-300',
  death: 'text-stone-400',
  marriage: 'text-amber-400',
  divorce: 'text-orange-400',
  scandal: 'text-rose-400',
  prison: 'text-slate-300',
  election: 'text-amber-200',
  building: 'text-emerald-400',
  disaster: 'text-rose-400',
  research: 'text-purple-400',
  trade: 'text-cyan-400',
  migration: 'text-blue-400',
  season: 'text-green-400',
  event: 'text-violet-400',
  combat: 'text-rose-400',
  milestone: 'text-amber-300',
};

/** Rows drawn at a time. The list re-renders with the world, so it grows by request, not at once. */
const IN_GAME_LOG_PAGE = 500;

function formatEventLine(evt: GameEventLog): string {
  return `Year ${displayYear(evt.year)}, Day ${evt.day} — ${evt.message}`;
}

/** Memoised so opening the whole log (thousands of rows) does not rebuild it on every world tick. */
const LogRow = memo(function LogRow({ evt }: { evt: GameEventLog }) {
  return (
    <div className="flex items-start gap-1.5 rounded-lg bg-stone-800/40 px-2 py-1 text-[13px] transition-colors hover:bg-stone-700/60">
      <span className="mt-0.5 shrink-0 text-sm" title={evt.type}>
        {EVENT_ICONS[evt.type]}
      </span>
      <div className="min-w-0 flex-1">
        <span className={`font-medium ${EVENT_COLORS[evt.type]}`}>{evt.message}</span>
        <span className="ml-1.5 whitespace-nowrap text-stone-600">
          Y{displayYear(evt.year)} D{evt.day}
        </span>
      </div>
    </div>
  );
});

export default function EventLogPanel({ events, meta, initialFilter = 'all', onFilterChange }: Props) {
  const [editionView, setEditionView] = useState<'gazette' | 'chronicle'>('chronicle');
  const [chosenWeek, setChosenWeek] = useState<number | null>(null);
  const [filter, setFilter] = useState<'all' | GameEventLog['type']>(initialFilter);
  const [visibleCount, setVisibleCount] = useState(IN_GAME_LOG_PAGE);
  const [copied, setCopied] = useState(false);
  const [downloadedFormat, setDownloadedFormat] = useState<'txt' | 'json' | 'csv' | null>(null);
  const [exportOnSave, setExportOnSave] = useState(loadExportChronicleOnSave);

  const currentWeek = gazetteWeekForTick(meta.tick);
  const selectedWeek = Math.min(chosenWeek ?? currentWeek, currentWeek);
  const oldestWeek = events.length > 0
    ? gazetteWeekForTick(events[events.length - 1].tick)
    : currentWeek;
  const newestEventId = events[0]?.id;
  const issue = useMemo(
    () => buildWeeklyGazette(events, selectedWeek),
    [events, newestEventId, selectedWeek],
  );

  // Derived each render: the chronicle array is mutated in place (unshift/pop), so a memo on it
  // would never see an entry written after the panel opened.
  const allFiltered = filter === 'all' ? events : events.filter((e) => e.type === filter);
  const filtered = allFiltered.slice(0, visibleCount);

  /** A new filter starts its own list at the first page. */
  const chooseFilter = (next: 'all' | GameEventLog['type']) => {
    setFilter(next);
    setVisibleCount(IN_GAME_LOG_PAGE);
    onFilterChange?.(next);
  };

  const copyLog = async () => {
    const text = allFiltered.map(formatEventLine).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const markDownloaded = (format: 'txt' | 'json' | 'csv') => {
    setDownloadedFormat(format);
    window.setTimeout(() => setDownloadedFormat(null), 2000);
  };

  const downloadLogFile = () => {
    downloadChronicleLog(allFiltered, meta);
    markDownloaded('txt');
  };

  const downloadLogJSON = () => {
    downloadChronicleJSON(allFiltered, meta);
    markDownloaded('json');
  };

  const downloadLogCSV = () => {
    downloadChronicleCSV(allFiltered, meta);
    markDownloaded('csv');
  };

  const toggleExportOnSave = () => {
    const next = !exportOnSave;
    setExportOnSave(next);
    saveExportChronicleOnSave(next);
  };

  if (events.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-[13px] text-stone-400">
        <div className="text-center">
          <span className="mb-2 block text-2xl">📜</span>
          <p>No events yet.</p>
          <p className="mt-1 text-stone-600">Events will appear as your village grows.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setEditionView('gazette')}
          aria-pressed={editionView === 'gazette'}
          className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold ${editionView === 'gazette'
            ? 'bg-amber-700 text-amber-50' : 'bg-stone-800 text-stone-300 hover:bg-stone-700'}`}
        >
          📰 Weekly Gazette
        </button>
        <button
          type="button"
          onClick={() => setEditionView('chronicle')}
          aria-pressed={editionView === 'chronicle'}
          className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold ${editionView === 'chronicle'
            ? 'bg-amber-700 text-amber-50' : 'bg-stone-800 text-stone-300 hover:bg-stone-700'}`}
        >
          📜 Full Chronicle
        </button>
      </div>

      {editionView === 'gazette' ? (
        <section aria-label="Weekly village gazette" className="space-y-3 rounded-xl border border-amber-800/60 bg-stone-950/70 p-3 text-stone-200">
          <header className="border-b border-amber-700/50 pb-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber-500">The village's own newspaper</p>
            <h2 className="font-serif text-2xl font-black tracking-wide text-amber-100">The Wilderfolk Gazette</h2>
            <p className="text-xs text-stone-400">
              Issue {selectedWeek + 1} · Colony days {issue.startDay}–{issue.endDay}
            </p>
          </header>
          <nav aria-label="Newspaper edition" className="flex items-center justify-between gap-3 text-[13px]">
            <button
              type="button"
              disabled={selectedWeek <= oldestWeek}
              onClick={() => setChosenWeek(selectedWeek - 1)}
              className="rounded bg-stone-800 px-2.5 py-1 text-amber-200 hover:bg-stone-700 disabled:opacity-40"
            >← Previous week</button>
            <span className="text-xs text-stone-400">{selectedWeek === currentWeek ? 'This week' : 'From the archives'}</span>
            <button
              type="button"
              disabled={selectedWeek >= currentWeek}
              onClick={() => setChosenWeek(selectedWeek + 1)}
              className="rounded bg-stone-800 px-2.5 py-1 text-amber-200 hover:bg-stone-700 disabled:opacity-40"
            >Next week →</button>
          </nav>
          {issue.mayBeIncomplete && (
            <p className="text-[11px] text-amber-300" role="status">
              This edition may be incomplete: the Chronicle keeps only its latest events. Counts below are minimums from retained entries.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
            {([
              ['Births', issue.births],
              ['Weddings', issue.marriages],
              ['Deaths', issue.deaths],
              ['Scandals', issue.scandals],
            ] as const).map(([label, value]) => (
              <div key={label} className="rounded border border-stone-700 bg-stone-900/60 px-2 py-2">
                <strong className="block text-lg text-amber-100">{issue.mayBeIncomplete ? `≥${value}` : value}</strong>
                <span className="text-stone-400">{label}</span>
              </div>
            ))}
          </div>
          {issue.articles.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {issue.articles.map((article) => (
                <article key={article.event.id} className="border-t border-stone-700 pt-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-500">{article.section}</p>
                  <h3 className="font-serif text-base font-bold text-amber-50">{article.headline}</h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-stone-300">{article.event.message}</p>
                  <p className="mt-1 text-[10px] text-stone-500">
                    Year {displayYear(article.event.year)}, day {article.event.day}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-[13px] text-stone-400">
              A quiet week so far. The presses will run when the Chronicle records a story.
            </p>
          )}
          <p className="border-t border-stone-800 pt-2 text-[11px] text-stone-500">
            {issue.mayBeIncomplete ? `At least ${issue.eventCount} retained events` : `${issue.eventCount} recorded events`} this week. Stories come from the Chronicle, without invented gossip.
          </p>
        </section>
      ) : (
        <>
      <div className="flex flex-wrap items-center gap-1">
        {EVENT_LOG_FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => chooseFilter(opt.id)}
 /* The active filter was stated by background colour alone. */
            aria-pressed={filter === opt.id}
            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold transition-all ${
              filter === opt.id
                ? 'bg-amber-600 text-white'
                : 'bg-stone-800 text-stone-400 hover:bg-stone-700 hover:text-stone-200'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-stone-400">
        <span>
          {allFiltered.length > visibleCount
            ? `Showing ${filtered.length} of ${allFiltered.length.toLocaleString()} ${filter === 'all' ? '' : getEventLogFilterLabel(filter)}`
            : `${filtered.length} event${filtered.length === 1 ? '' : 's'}`}
          {filter !== 'all' && allFiltered.length <= visibleCount ? ` (${events.length} total)` : ''}
        </span>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={downloadLogFile}
            className="rounded bg-amber-800 px-2 py-0.5 font-semibold text-amber-100 hover:bg-amber-700"
          >
            {downloadedFormat === 'txt' ? 'Saved!' : 'Download .txt'}
          </button>
          <button
            type="button"
            onClick={downloadLogJSON}
            className="rounded bg-stone-800 px-2 py-0.5 font-semibold text-stone-300 hover:bg-stone-700"
          >
            {downloadedFormat === 'json' ? 'Saved!' : '.json'}
          </button>
          <button
            type="button"
            onClick={downloadLogCSV}
            className="rounded bg-stone-800 px-2 py-0.5 font-semibold text-stone-300 hover:bg-stone-700"
          >
            {downloadedFormat === 'csv' ? 'Saved!' : '.csv'}
          </button>
          <button
            type="button"
            onClick={copyLog}
            className="rounded bg-stone-800 px-2 py-0.5 font-semibold text-stone-300 hover:bg-stone-700"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      <label className="flex cursor-pointer items-start gap-2 text-[13px] text-stone-400">
        <input
          type="checkbox"
          checked={exportOnSave}
          onChange={toggleExportOnSave}
          className="mt-0.5"
        />
        <span>
          Also save <strong className="text-stone-400">wilderfolk-…-chronicle.txt</strong> to Downloads when I click 💾 Save (not on auto-save).
        </span>
      </label>

      <div className="max-h-[min(28rem,55vh)] space-y-0.5 overflow-y-auto pr-1">
        {filtered.map((evt) => (
          <LogRow key={evt.id} evt={evt} />
        ))}
        {filtered.length === 0 && (
          <p className="py-4 text-center text-[13px] text-stone-300">No events in this category.</p>
        )}
        {allFiltered.length > visibleCount && (
          <button
            type="button"
            onClick={() => setVisibleCount(allFiltered.length)}
            className="mt-1 w-full rounded-lg bg-stone-800 px-2 py-1.5 text-[11px] font-semibold text-stone-300 transition-colors hover:bg-stone-700 hover:text-white"
          >
            Show all {(allFiltered.length - visibleCount).toLocaleString()} more
          </button>
        )}
      </div>

      <p className="text-[10px] leading-relaxed text-stone-600">
        Newest first · {events.length.toLocaleString()} entries stored; the list opens with {IN_GAME_LOG_PAGE}. Download carries the full stored set.
      </p>
        </>
      )}
    </div>
  );
}