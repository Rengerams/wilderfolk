import { useMemo, useState } from 'react';
import type { GameEventLog } from './gameTypes';
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
}

const EVENT_ICONS: Record<GameEventLog['type'], string> = {
  birth: '👶',
  death: '💀',
  marriage: '💍',
  scandal: '💔',
  building: '🏗️',
  disaster: '⚠️',
  research: '🔬',
  trade: '🚢',
  migration: '🚶',
  season: '🌸',
  event: '🌝',
  combat: '⚔️',
};

const EVENT_COLORS: Record<GameEventLog['type'], string> = {
  birth: 'text-pink-400',
  death: 'text-stone-500',
  marriage: 'text-amber-400',
  scandal: 'text-rose-400',
  building: 'text-emerald-400',
  disaster: 'text-rose-400',
  research: 'text-purple-400',
  trade: 'text-cyan-400',
  migration: 'text-blue-400',
  season: 'text-green-400',
  event: 'text-violet-400',
  combat: 'text-rose-400',
};

const FILTER_OPTIONS: Array<{ id: 'all' | GameEventLog['type']; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'birth', label: 'Births' },
  { id: 'death', label: 'Deaths (age, illness, exhaustion, raid)' },
  { id: 'marriage', label: 'Marriages' },
  { id: 'scandal', label: 'Scandals' },
  { id: 'building', label: 'Buildings' },
  { id: 'research', label: 'Research' },
  { id: 'trade', label: 'Trade' },
  { id: 'migration', label: 'Visitors' },
  { id: 'disaster', label: 'Disasters' },
  { id: 'combat', label: 'Combat' },
  { id: 'event', label: 'Events' },
  { id: 'season', label: 'Seasons' },
];

const IN_GAME_LOG_LIMIT = 500;

function formatEventLine(evt: GameEventLog): string {
  return `Year ${evt.year}, Day ${evt.day} — ${evt.message}`;
}

export default function EventLogPanel({ events, meta }: Props) {
  const [filter, setFilter] = useState<'all' | GameEventLog['type']>('all');
  const [copied, setCopied] = useState(false);
  const [downloadedFormat, setDownloadedFormat] = useState<'txt' | 'json' | 'csv' | null>(null);
  const [exportOnSave, setExportOnSave] = useState(loadExportChronicleOnSave);

  const allFiltered = useMemo(
    () => (filter === 'all' ? events : events.filter((e) => e.type === filter)),
    [events, filter],
  );
  const filtered = useMemo(
    () => allFiltered.slice(0, IN_GAME_LOG_LIMIT),
    [allFiltered],
  );

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
      <div className="flex h-40 items-center justify-center text-[10px] text-stone-500">
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
      <div className="flex flex-wrap items-center gap-1">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setFilter(opt.id)}
            className={`rounded px-1.5 py-0.5 text-[8px] font-semibold transition-all ${
              filter === opt.id
                ? 'bg-amber-600 text-white'
                : 'bg-stone-800 text-stone-400 hover:bg-stone-700 hover:text-stone-200'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[9px] text-stone-500">
        <span>
          {allFiltered.length > IN_GAME_LOG_LIMIT
            ? `Showing ${filtered.length} of ${allFiltered.length.toLocaleString()} ${filter === 'all' ? '' : filter}`
            : `${filtered.length} event${filtered.length === 1 ? '' : 's'}`}
          {filter !== 'all' && allFiltered.length <= IN_GAME_LOG_LIMIT ? ` (${events.length} total)` : ''}
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

      <label className="flex cursor-pointer items-start gap-2 text-[9px] text-stone-500">
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
          <div
            key={evt.id}
            className="flex items-start gap-1.5 rounded-lg bg-stone-800/40 px-2 py-1 text-[10px] transition-colors hover:bg-stone-700/60"
          >
            <span className="mt-0.5 shrink-0 text-xs" title={evt.type}>
              {EVENT_ICONS[evt.type]}
            </span>
            <div className="min-w-0 flex-1">
              <span className={`font-medium ${EVENT_COLORS[evt.type]}`}>
                {evt.message}
              </span>
              <span className="ml-1.5 whitespace-nowrap text-stone-600">
                Y{evt.year} D{evt.day}
              </span>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="py-4 text-center text-[10px] text-stone-500">No events in this category.</p>
        )}
      </div>

      <p className="text-[8px] leading-relaxed text-stone-600">
        Newest first · {events.length.toLocaleString()} entries stored. In-game panel shows the latest {IN_GAME_LOG_LIMIT}; use Download to get the full data set.
      </p>
    </div>
  );
}