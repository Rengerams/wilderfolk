/**
 * The daily council: a read-only floating window (via `GameWindow`) over the still-visible map.
 * Surfaces resources, food sources, population/wildlife trends and per-settler work.
 */
import { useState } from 'react';
import type { WorldState } from '../../game/gameTypes';
import { collectDashboard, explainSettler, resourceFillPercent, type DashboardData } from '../../game/dashboardData';
import { displayYear } from '../../game/dayCycleClock';
import { ECONOMY_SOURCE_LABELS } from '../../game/economyLedger';
import { useOverlayKeyboard } from '../../hooks/useOverlayKeyboard';
import { citizenGivenName } from '../../game/citizenId';
import { getEventLogFilterLabel } from '../../game/eventLogFilters';
import type { GameEventLog } from '../../game/gameTypes';
import type { LogSubTab } from '../../hooks/useGameShellState';
import GameWindow from '../GameWindow';

/** Food-source labels come from the ledger's own map; see `ECONOMY_SOURCE_LABELS`. */
function sourceLabel(key: string): string {
  return ECONOMY_SOURCE_LABELS[key] ?? key;
}

const STATUS_STYLE: Record<string, string> = {
  working: 'text-emerald-300',
  'at school': 'text-sky-300',
  'going to school': 'text-cyan-300',
  'school off-hours': 'text-stone-300',
  'no school place': 'text-amber-300',
  'too young for school': 'text-stone-400',
  idle: 'text-stone-400',
  prison: 'text-rose-300',
};

/** Where a concern's "Go" button should take the player. */
export type ConcernNav = 'farm' | 'house' | 'village' | 'nature' | 'frontier';

export interface ConcernLogNav {
  subTab: LogSubTab;
  filter: GameEventLog['type'];
}

/**
 * Concerns whose history the log already holds, so the concern can hand the player the exact category.
 * A concern with no matching category keeps its single "Go" button.
 */
const CONCERN_LOG_NAV: Record<string, ConcernLogNav | undefined> = {
  raid: { subTab: 'combat', filter: 'combat' },
  diplomacy: { subTab: 'combat', filter: 'combat' },
  howler: { subTab: 'chronicle', filter: 'event' },
};

const CONCERN_NAV: Record<string, ConcernNav | undefined> = {
  famine: 'farm',
  low_food: 'farm',
  homeless: 'house',
  idle: 'village',
  howler: 'village',
  wolves: 'frontier',
  ecology: 'nature',
  ecology_soft: 'nature',
  valley: 'nature',
  raid: 'frontier',
  diplomacy: 'frontier',
};

/** The dashboard's tabbed panels, in order — labels stay explicit rather than derived from the keys. */
type DashboardTab = 'settlers' | 'buildings' | 'trend';

const DASHBOARD_TABS: ReadonlyArray<{ id: DashboardTab; label: string }> = [
  { id: 'settlers', label: 'Settlers & work' },
  { id: 'buildings', label: 'Buildings' },
  { id: 'trend', label: 'Population & wildlife' },
];

interface SeriesDef {
  key: 'humans' | 'deer' | 'rabbits' | 'wolves' | 'foxes';
  color: string;
  label: string;
}

const SERIES: SeriesDef[] = [
  { key: 'humans', color: '#fbbf24', label: 'Settlers' },
  { key: 'deer', color: '#34d399', label: 'Deer' },
  { key: 'rabbits', color: '#e5e7eb', label: 'Rabbits' },
  { key: 'wolves', color: '#f87171', label: 'Wolves' },
  { key: 'foxes', color: '#fb923c', label: 'Foxes' },
];

const W = 720;
const H = 236;
const PAD = { top: 12, right: 14, bottom: 42, left: 46 };
const INNER_W = W - PAD.left - PAD.right;
const INNER_H = H - PAD.top - PAD.bottom;
const X_TICK_COUNT = 5;
const X_LABEL_Y = H - 14;

/** Horizontal position of one sample in a chart's data. */
function chartX(index: number, count: number): number {
  return PAD.left + (count <= 1 ? 0 : (index / (count - 1)) * INNER_W);
}

/** Vertical position of a value inside the shared plot area. */
function chartY(value: number, max: number): number {
  return PAD.top + INNER_H - (value / max) * INNER_H;
}

/** Round the top of the scale to four equal steps so the gridline labels stay readable. */
function chartMax(value: number): number {
  return Math.max(4, Math.ceil(value / 4) * 4);
}

/** Up to five evenly spread sample indexes, always including the first and last day. */
function xTickIndices(count: number): number[] {
  if (count <= 1) return [0];
  const tickCount = Math.min(X_TICK_COUNT, count);
  const indexes = new Set<number>();
  for (let tick = 0; tick < tickCount; tick++) {
    indexes.add(Math.round((tick / (tickCount - 1)) * (count - 1)));
  }
  return [...indexes];
}

/** Five labelled horizontal gridlines shared by both charts; {@link ChartXAxis} adds the day axis. */
function ChartGrid({ max }: { max: number }) {
  return (
    <>
      {Array.from({ length: 5 }, (_, g) => {
        const gy = PAD.top + (g / 4) * INNER_H;
        const label = Math.round(max - (g / 4) * max);
        return (
          <g key={g}>
            <line x1={PAD.left} y1={gy} x2={W - PAD.right} y2={gy} stroke="#44403c" strokeWidth={1} />
            <text x={PAD.left - 6} y={gy + 3} textAnchor="end" fontSize={10} fill="#a8a29e">
              {label}
            </text>
          </g>
        );
      })}
    </>
  );
}

/** Day labels along the x-axis, so a point can be read as a calendar day rather than a mystery column. */
function ChartXAxis({ days }: { days: ReadonlyArray<{ day: number }> }) {
  if (days.length === 0) return null;
  const indices = xTickIndices(days.length);
  return (
    <>
      <line
        x1={PAD.left}
        y1={PAD.top + INNER_H}
        x2={W - PAD.right}
        y2={PAD.top + INNER_H}
        stroke="#57534e"
        strokeWidth={1}
      />
      {indices.map((index) => {
        const cx = chartX(index, days.length);
        const anchor = index === 0 ? 'start' : index === days.length - 1 ? 'end' : 'middle';
        return (
          <g key={`day-${index}-${days[index]!.day}`}>
            <line
              x1={cx}
              y1={PAD.top + INNER_H}
              x2={cx}
              y2={PAD.top + INNER_H + 4}
              stroke="#78716c"
              strokeWidth={1}
            />
            <text x={cx} y={X_LABEL_Y} textAnchor={anchor} fontSize={10} fill="#a8a29e">
              Day {days[index]!.day}
            </text>
          </g>
        );
      })}
    </>
  );
}

function LineChart({ data }: { data: DashboardData['history'] }) {
  if (data.length < 2) {
    return (
      <p className="py-10 text-center text-xs text-stone-500">
        Not enough history yet — keep playing a few more days to see the trend.
      </p>
    );
  }
  const max = chartMax(Math.max(1, ...data.flatMap((d) => SERIES.map((s) => d[s.key]))));

  return (
    <div>
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        className="block h-56 w-full"
        role="img"
        aria-label="Population and wildlife trend by day"
      >
        <ChartGrid max={max} />
        <ChartXAxis days={data} />
        {SERIES.map((s) => {
          const pts = data
            .map((d, i) => `${chartX(i, data.length).toFixed(1)},${chartY(d[s.key], max).toFixed(1)}`)
            .join(' ');
          return <polyline key={s.key} points={pts} fill="none" stroke={s.color} strokeWidth={2} />;
        })}
        {SERIES.map((s) => (
          <circle
            key={`dot_${s.key}`}
            cx={chartX(data.length - 1, data.length)}
            cy={chartY(data[data.length - 1][s.key], max)}
            r={3}
            fill={s.color}
          />
        ))}
      </svg>
      {/* Legend: one labelled swatch per series, so colour is never the only meaning. */}
      <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-stone-400">
        {SERIES.map((s) => (
          <span key={s.key} style={{ color: s.color }}>● {s.label}</span>
        ))}
      </div>
    </div>
  );
}

function ResourceBars({ data }: { data: DashboardData }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {data.resources.map((r) => {
        const pct = resourceFillPercent(r);
        return (
          <div key={r.key} className="rounded-lg border border-stone-700/70 bg-stone-900/60 p-2">
            <div className="flex items-baseline justify-between text-[11px]">
              <span className="font-semibold text-stone-200">{r.label}</span>
              <span className="text-stone-400">
                {Math.floor(r.amount)}
                {r.cap > 0 ? ` / ${Math.floor(r.cap)}` : ''}
              </span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded bg-stone-800">
              <div
                className={`h-full rounded ${
                  r.key === 'food' ? 'bg-emerald-500' : r.key === 'gold' ? 'bg-amber-400' : 'bg-sky-500'
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SettlersTable({
  data,
  selectedId,
  onSelect,
}: {
  data: DashboardData;
  selectedId?: number | null;
  onSelect?: (id: number) => void;
}) {
  if (data.settlers.length === 0) {
    return <p className="text-xs text-stone-500">No settlers yet.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-stone-700 text-stone-400">
            <th className="py-1 pr-2 font-medium">Settler</th>
            <th className="py-1 pr-2 font-medium">Role</th>
            <th className="py-1 pr-2 font-medium">Work hrs</th>
            <th className="py-1 pr-2 font-medium">Energy</th>
            <th className="py-1 pr-2 font-medium">Status</th>
            <th className="py-1 font-medium">Flags</th>
          </tr>
        </thead>
        <tbody>
          {data.settlers.map((s) => (
            <tr
              key={s.id}
              onClick={onSelect ? () => onSelect(s.id) : undefined}
              // Click and keyboard both open "Why this settler…"; `role`/`tabIndex` plus an
              // explicit label keep the row reachable and named for assistive tech.
              role={onSelect ? 'button' : undefined}
              tabIndex={onSelect ? 0 : undefined}
              aria-label={onSelect ? `Settler ${citizenGivenName(s)} — open details` : undefined}
              onKeyDown={
                onSelect
                  ? (event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      onSelect(s.id);
                    }
                  : undefined
              }
              className={`border-b border-stone-800/70 ${
                onSelect ? 'cursor-pointer hover:bg-stone-800/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400/70' : ''
              } ${selectedId === s.id ? 'bg-stone-800/70' : ''}`}
            >
              <td className="py-1 pr-2 text-stone-100">{citizenGivenName(s)}</td>
              <td className="py-1 pr-2 capitalize text-sky-200">{s.role}</td>
              <td className="py-1 pr-2 text-stone-300">{s.hoursToday}h</td>
              <td className="py-1 pr-2 text-stone-300">{s.energyPct}%</td>
              <td className={`py-1 ${STATUS_STYLE[s.status] ?? 'text-stone-400'}`}>
                {s.status}
                {/* A posted settler who logged no work is told why, from the absence owner. */}
                {s.status === 'idle' && s.workReason.code !== 'no-post' && (
                  <span className="block text-[9px] font-normal text-stone-400">{s.workReason.label}</span>
                )}
              </td>
              <td className="py-1">
                {s.juvenile && (
                  <span className="mr-1 rounded bg-stone-800 px-1 py-0.5 text-[9px] text-sky-300" title="Child — too young to take a job">
                    child
                  </span>
                )}
                {s.noWork && !s.juvenile && (
                  <span className="mr-1 rounded bg-stone-800 px-1 py-0.5 text-[9px] text-amber-300" title="No workplace assigned">
                    no job
                  </span>
                )}
                {s.noHome && (
                  <span className="rounded bg-stone-800 px-1 py-0.5 text-[9px] text-rose-300" title="No home assigned">
                    no home
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BuildingsTable({ data }: { data: DashboardData }) {
  if (data.buildings.length === 0) {
    return <p className="text-xs text-stone-500">No buildings yet.</p>;
  }
  return (
    <div>
      <p className="mb-1.5 text-[10px] text-stone-500">
        {data.buildings.length} {data.buildings.length === 1 ? 'building' : 'buildings'} · sorted by type number, then by building ID
      </p>
      <div className="max-h-72 overflow-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-stone-700 text-stone-400">
              <th className="py-1 pr-2 font-medium">Building</th>
              <th className="py-1 pr-2 font-medium">Type #</th>
              <th className="py-1 pr-2 font-medium">ID</th>
              <th className="py-1 pr-2 font-medium">Level</th>
              <th className="py-1 pr-2 font-medium">Status</th>
              <th className="py-1 font-medium">Workers / beds</th>
            </tr>
          </thead>
          <tbody>
            {data.buildings.map((b) => (
              <tr key={b.id} className="border-b border-stone-800/70">
                <td className="py-1 pr-2 text-stone-100">{b.label}</td>
                <td className="py-1 pr-2 tabular-nums text-sky-200">{b.typeCode}</td>
                <td className="py-1 pr-2 tabular-nums text-stone-300">#{b.id}</td>
                <td className="py-1 pr-2 tabular-nums text-stone-300">{b.level}</td>
                <td className={`py-1 pr-2 ${b.completed ? 'text-emerald-300' : 'text-amber-300'}`}>
                  {b.completed ? 'built' : `${b.progressPct}% built`}
                </td>
                <td className="py-1 tabular-nums text-stone-300">
                  {b.slots ? `${b.slots.used}/${b.slots.cap}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FoodTrendChart({ days }: { days: DashboardData['foodDays'] }) {
  if (days.length < 2) {
    return (
      <p className="py-8 text-center text-xs text-stone-500">
        Not enough finished days yet — a day is archived when the next one begins; keep playing to see the
        food trend.
      </p>
    );
  }
  const max = chartMax(Math.max(1, ...days.flatMap((d) => [d.total, d.consumed])));
  const producedPts = days
    .map((d, i) => `${chartX(i, days.length).toFixed(1)},${chartY(d.total, max).toFixed(1)}`)
    .join(' ');
  const consumedPts = days
    .map((d, i) => `${chartX(i, days.length).toFixed(1)},${chartY(d.consumed, max).toFixed(1)}`)
    .join(' ');
  const latest = days[days.length - 1]!;
  const latestSources = Object.entries(latest.bySource)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  return (
    <div>
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        className="block h-48 w-full"
        role="img"
        aria-label="Food produced and consumed per day"
      >
        <ChartGrid max={max} />
        <ChartXAxis days={days} />
        <polyline points={producedPts} fill="none" stroke="#fbbf24" strokeWidth={2} />
        <polyline
          points={consumedPts}
          fill="none"
          stroke="#fb7185"
          strokeWidth={2}
          strokeDasharray="5 4"
        />
        {days.map((d, i) => (
          <circle
            key={`produced-${d.day}`}
            cx={chartX(i, days.length)}
            cy={chartY(d.total, max)}
            r={2.5}
            fill="#fbbf24"
          />
        ))}
        {days.map((d, i) => (
          <circle
            key={`consumed-${d.day}`}
            cx={chartX(i, days.length)}
            cy={chartY(d.consumed, max)}
            r={2.5}
            fill="#fb7185"
          />
        ))}
      </svg>
      <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-stone-400">
        <span className="text-amber-300">● Produced</span>
        <span className="text-rose-300">● Consumed / lost</span>
        <span className="text-stone-500">
          Latest day {latest.day}: +{latest.total} produced · −{latest.consumed} used
        </span>
        {latestSources.map(([src, amt]) => (
          <span key={src}>
            {sourceLabel(src)}: {amt}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function GameDashboard({
  state,
  onClose,
  onNavigate,
  onOpenLog,
}: {
  state: WorldState;
  onClose: () => void;
  /** Jump to a relevant action/tab for a concern. */
  onNavigate?: (where: ConcernNav) => void;
  /** Open the Log window on the half and category a concern is about. */
  onOpenLog?: (nav: ConcernLogNav) => void;
}) {
  // Derived each render: the WorldState prop is mutated in place, so a `[state]` memo never sees a tick.
  const data = collectDashboard(state);
  const [openTab, setOpenTab] = useState<DashboardTab>('settlers');
  const [selectedSettlerId, setSelectedSettlerId] = useState<number | null>(null);
  // The dashboard handles its own Escape while open; `GameWindow` owns the focus trap.
  useOverlayKeyboard('dashboard', onClose);

  return (
    <GameWindow
      title="Daily council"
      icon="🏘️"
      // The panel's own header line, kept as the window's subtitle: the shell owns the title bar, so the
      // date and the population sit under the title instead of in a second bar of their own.
      subtitle={`Year ${displayYear(data.year)} · Day ${data.dayInYear} · ${data.season} · ${data.population.humans} settlers`}
      onClose={onClose}
      /* A window, not the screen. Wider than the shell default for the five-column row, two charts
         and a settler table; the body stays inside 70vh so the map shows above and below. */
      centered
      widthClassName="w-[min(58rem,calc(100vw-3rem))] max-w-[calc(100vw-3rem)]"
      maxBodyClassName="max-h-[70vh]"
    >
        <div className="space-y-4">
          {data.concerns.length > 0 && (
            <section className="rounded-xl border border-stone-800 bg-stone-900/50 p-3">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-300">
                ⚠ Village concerns ({data.concerns.length})
              </h3>
              <ul className="space-y-1.5">
                {data.concerns.map((c) => {
                  const accent =
                    c.severity === 'critical'
                      ? 'border-rose-500/60 text-rose-200'
                      : c.severity === 'warning'
                        ? 'border-amber-500/60 text-amber-200'
                        : 'border-sky-500/50 text-sky-200';
                  return (
                    <li
                      key={c.id}
                      className={`rounded border-l-2 bg-stone-950/50 px-2.5 py-1.5 text-[11px] ${accent}`}
                    >
                      <div className="font-semibold">{c.title}</div>
                      <div className="text-stone-400">{c.detail}</div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="italic text-stone-500">{c.hint}</div>
                        <div className="flex shrink-0 items-center gap-1">
                          {CONCERN_LOG_NAV[c.id] && onOpenLog && (
                            <button
                              type="button"
                              // Names the category the log will open on, using the log's own filter
                              // label, so the handover is not a leap into an unfiltered chronicle.
                              aria-label={`Open the log filtered to ${getEventLogFilterLabel(CONCERN_LOG_NAV[c.id]!.filter)}`}
                              onClick={() => onOpenLog(CONCERN_LOG_NAV[c.id]!)}
                              className="rounded bg-stone-800 px-2 py-0.5 font-semibold text-sky-200 hover:bg-stone-700"
                            >
                              Log →
                            </button>
                          )}
                          {CONCERN_NAV[c.id] && onNavigate && (
                            <button
                              type="button"
                              onClick={() => onNavigate(CONCERN_NAV[c.id]!)}
                              className="rounded bg-stone-800 px-2 py-0.5 font-semibold text-amber-200 hover:bg-stone-700"
                            >
                              Go →
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* Daily council */}
          <section className="rounded-xl border border-stone-800 bg-stone-900/50 p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-300">
              🗓 Daily council
            </h3>
            <dl className="space-y-1 text-[11px]">
              {data.council.map((line, index) => (
                <div
                  key={`${line.label}-${index}`}
                  className="flex items-baseline justify-between gap-3 border-b border-stone-800/60 pb-1"
                >
                  <dt className="shrink-0 text-stone-400">{line.label}</dt>
                  <dd
                    className={`text-right ${
                      line.tone === 'good'
                        ? 'text-emerald-300'
                        : line.tone === 'warn'
                          ? 'text-amber-300'
                          : line.tone === 'bad'
                            ? 'text-rose-300'
                            : 'text-stone-200'
                    }`}
                  >
                    {line.value}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <ResourceBars data={data} />

          {/* Food produced and consumed per finished day (rolling history) */}
          <section className="rounded-xl border border-stone-800 bg-stone-900/50 p-3">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-300">
              Food balance per day
            </h3>
            <p className="mb-2 text-[10px] text-stone-500">
              Finished days · produced (amber) vs consumed or lost (rose).
            </p>
            <FoodTrendChart days={data.foodDays} />
          </section>

          {/* Net food flow today — the one card that owns today's ledger balance. */}
          <section className="rounded-xl border border-stone-800 bg-stone-900/50 p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-300">
              Net food flow today
            </h3>
            <div className="grid grid-cols-2 gap-3 text-center text-[11px] md:grid-cols-4">
              <div className="rounded-lg border border-emerald-900/60 bg-emerald-950/30 p-2">
                <div className="text-stone-400">Produced</div>
                <div className="text-lg font-bold text-emerald-300">+{data.foodProducedToday}</div>
              </div>
              <div className="rounded-lg border border-rose-900/60 bg-rose-950/30 p-2">
                <div className="text-stone-400">Consumed</div>
                <div className="text-lg font-bold text-rose-300">−{data.foodConsumedToday}</div>
              </div>
              <div
                className={`rounded-lg border p-2 ${
                  data.netFoodToday >= 0
                    ? 'border-emerald-900/60 bg-emerald-950/30'
                    : 'border-amber-900/60 bg-amber-950/30'
                }`}
              >
                <div className="text-stone-400">Net change</div>
                <div
                  className={`text-lg font-bold ${
                    data.netFoodToday >= 0 ? 'text-emerald-300' : 'text-amber-300'
                  }`}
                >
                  {data.netFoodToday >= 0 ? `+${data.netFoodToday}` : data.netFoodToday}
                </div>
              </div>
              <div className="rounded-lg border border-stone-700 bg-stone-950/40 p-2">
                <div className="text-stone-400">Settler need / day</div>
                <div className="text-lg font-bold text-stone-100">{data.foodNeedPerDay}</div>
                <div className="text-[9px] text-stone-500">for {data.settlers.length} settlers</div>
              </div>
            </div>
            <p className="mt-2 text-center text-[10px] text-stone-500">
              {data.foodStoreDays == null
                ? 'No settlers to feed.'
                : `The current food store covers ${data.foodStoreDays} ${data.foodStoreDays === 1 ? 'day' : 'days'} at this need.`}
            </p>
            {data.foodBySourceToday.length === 0 ? (
              <p className="mt-2 text-[11px] text-stone-500">
                No food produced yet this day — production is recorded as it happens.
              </p>
            ) : (
              <div className="mt-2 space-y-1">
                <span className="text-[10px] text-stone-500">Produced by:</span>
                {data.foodBySourceToday.map((f) => {
                  const pct = f.sharePct;
                  return (
                    <div key={f.label} className="flex items-center gap-2 text-[11px]">
                      <span className="w-20 shrink-0 text-stone-300">{sourceLabel(f.label)}</span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded bg-stone-800">
                        <div className="h-full rounded bg-amber-500" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-12 text-right text-stone-400">{f.amount}</span>
                    </div>
                  );
                })}
              </div>
            )}
            {data.foodBySourceConsumedToday.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-stone-400">
                <span className="text-stone-500">Consumed by:</span>
                {data.foodBySourceConsumedToday.map((c) => (
                  <span key={c.label}>
                    {sourceLabel(c.label)}: {c.amount}
                  </span>
                ))}
              </div>
            )}
          </section>

          {/* Tabbed data panels */}
          <div className="flex gap-1.5">
            {DASHBOARD_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setOpenTab(tab.id)}
                /* Not a real `tablist` (no ids or roving tabindex), so the pressed state is the
                   honest minimum; colour alone is not. */
                aria-pressed={openTab === tab.id}
                className={`rounded-t-lg px-3 py-1.5 text-xs font-semibold ${
                  openTab === tab.id
                    ? 'bg-stone-800 text-amber-200'
                    : 'bg-stone-900 text-stone-400 hover:text-stone-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <section className="-mt-px rounded-b-xl rounded-tr-xl border border-stone-800 bg-stone-900/50 p-3">
            {openTab === 'trend' ? (
              <LineChart data={data.history} />
            ) : openTab === 'buildings' ? (
              <BuildingsTable data={data} />
            ) : (
              <SettlersTable
                data={data}
                selectedId={selectedSettlerId}
                onSelect={setSelectedSettlerId}
              />
            )}
          </section>

          {openTab === 'settlers' && selectedSettlerId != null && (
            <section className="rounded-xl border border-sky-900/50 bg-sky-950/10 p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-sky-200">
                  Why this settler…
                </h3>
                <button
                  type="button"
                  onClick={() => setSelectedSettlerId(null)}
                  className="rounded bg-stone-800 px-2 py-0.5 text-[11px] text-stone-300 hover:bg-stone-700"
                >
                  ✕
                </button>
              </div>
              <dl className="space-y-1 text-[11px]">
                {/* Keyed by label *and* position so a duplicate label cannot silently drop a row. */}
                {explainSettler(state, selectedSettlerId).map((line, index) => (
                  <div
                    key={`${line.label}-${index}`}
                    className="flex items-baseline justify-between gap-3 border-b border-stone-800/60 pb-1"
                  >
                    <dt className="shrink-0 text-sky-300/80">{line.label}</dt>
                    <dd
                      className={`text-right ${
                        line.tone === 'warn'
                          ? 'text-amber-300'
                          : line.tone === 'good'
                            ? 'text-emerald-300'
                            : 'text-stone-200'
                      }`}
                    >
                      {line.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {/* Eco mini readout */}
          <div className="grid grid-cols-3 gap-3 text-center text-[11px]">
            <div className="rounded-lg border border-stone-800 bg-stone-900/50 p-2">
              <div className="text-stone-400">Ecosystem</div>
              <div className="text-lg font-bold text-emerald-300">{data.population.ecoHealth}</div>
            </div>
            <div className="rounded-lg border border-stone-800 bg-stone-900/50 p-2">
              <div className="text-stone-400">Pollution</div>
              <div className="text-lg font-bold text-amber-300">{data.population.pollution}</div>
            </div>
            <div className="rounded-lg border border-stone-800 bg-stone-900/50 p-2">
              <div className="text-stone-400">Valley</div>
              <div className="text-lg font-bold capitalize text-stone-200">{data.valleyStage}</div>
            </div>
          </div>
        </div>
    </GameWindow>
  );
}