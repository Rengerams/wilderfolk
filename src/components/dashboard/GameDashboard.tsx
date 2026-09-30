/**
 * The Village overview — a **window**, not the screen.
 *
 * Owner reports that shaped this: *"there is a villageoverview but its not wired … i want a new icon
 * in the header to open it and not full screen"*. The data was never the problem; the shell was. It
 * used to be a `fixed inset-0` dialog with hand-rolled chrome (its own title bar, its own close
 * control, its own `useModalFocus` trap) that covered the whole game while it was open. It now renders
 * into `GameWindow` — the one window shell every subject renders into — so it is a floating window with
 * the map still visible around it, and the shell owns the title bar, the close control and the focus
 * trap.
 *
 * It surfaces big, readable data over the play screen (instead of the corner inspector): resource
 * levels, food produced today by source, population/wildlife trend from populationHistory, and a
 * per-settler work table (job + hours worked today). Close with the window's ✕ or Escape — the Escape
 * half is this file's own (`useOverlayKeyboard`), because Escape is not part of the shell's contract:
 * an anchored window beside a panel is not dismissible that way.
 *
 * Read-only — it only projects state and never mutates simulation state.
 */
import { useMemo, useState } from 'react';
import type { WorldState } from '../../game/gameTypes';
import { collectDashboard, explainSettler, resourceFillPercent, type DashboardData } from '../../game/dashboardData';
import { ECONOMY_SOURCE_LABELS } from '../../game/economyLedger';
import { useOverlayKeyboard } from '../../hooks/useOverlayKeyboard';
import { citizenGivenName } from '../../game/citizenId';
import GameWindow from '../GameWindow';

/**
 * Food-source labels come from the ledger's own map. This file used to keep a second copy, and it had
 * drifted: `spoilage`, `greenhouse`, `medicine` and `chronicle` were missing, so those rows rendered
 * their raw keys — including spoilage, the largest sink in a mid-game larder
 * (`LIVE-FINDINGS-STATUS.md`, F2).
 */
function sourceLabel(key: string): string {
  return ECONOMY_SOURCE_LABELS[key] ?? key;
}

const STATUS_STYLE: Record<string, string> = {
  working: 'text-emerald-300',
  idle: 'text-stone-400',
  prison: 'text-rose-300',
};

/** Where a concern's "Go" button should take the player. */
export type ConcernNav = 'farm' | 'house' | 'village' | 'nature' | 'frontier';

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
const H = 220;
const PAD = { top: 12, right: 12, bottom: 26, left: 34 };

/**
 * Five labelled horizontal gridlines — one shared axis block for both charts, which had drifted
 * apart: `LineChart` drew it with no accessible name while `FoodTrendChart` carried an
 * `aria-label`, and any axis change had to be made twice (audit C1 clone 6).
 */
function ChartGrid({ max, innerH }: { max: number; innerH: number }) {
  return (
    <>
      {Array.from({ length: 5 }, (_, g) => {
        const gy = PAD.top + (g / 4) * innerH;
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

function LineChart({ data }: { data: DashboardData['history'] }) {
  if (data.length < 2) {
    return (
      <p className="py-10 text-center text-xs text-stone-500">
        Not enough history yet — keep playing a few more days to see the trend.
      </p>
    );
  }
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const max = Math.max(1, ...data.flatMap((d) => SERIES.map((s) => d[s.key])));
  const x = (i: number) => PAD.left + (data.length === 1 ? 0 : (i / (data.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;

  return (
    <div>
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        className="block h-52 w-full"
        role="img"
        aria-label="Population and wildlife trend"
      >
        <ChartGrid max={max} innerH={innerH} />
        {SERIES.map((s) => {
          const pts = data
            .map((d, i) => `${x(i).toFixed(1)},${y(d[s.key]).toFixed(1)}`)
            .join(' ');
          return <polyline key={s.key} points={pts} fill="none" stroke={s.color} strokeWidth={2} />;
        })}
        {SERIES.map((s) => (
          <circle key={`dot_${s.key}`} cx={x(data.length - 1)} cy={y(data[data.length - 1][s.key])} r={3} fill={s.color} />
        ))}
      </svg>
      {/* Colour was the only meaning of these five lines: with no legend, Deer / Rabbits / Wolves
          were indistinguishable (2026-09-17 UI audit, R10). The labels come from SERIES itself. */}
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
              // The row is the only way to open the "Why this settler…" panel, and it was mouse-only:
              // no role, no tab stop and no key handler, so the panel was unreachable by keyboard or
              // assistive tech. `role="button"` + `tabIndex` + Enter/Space is the shape the mini-map
              // already uses for its own click-only canvas (2026-09-21 audit, D-9). The label is
              // explicit because a row's accessible name would otherwise be every cell concatenated.
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
              <td className="py-1 pr-2 text-stone-100">
                {citizenGivenName(s)}
                {s.juvenile ? ' 🧒' : ''}
              </td>
              <td className="py-1 pr-2 capitalize text-sky-200">{s.role}</td>
              <td className="py-1 pr-2 text-stone-300">{s.hoursToday}h</td>
              <td className="py-1 pr-2 text-stone-300">{s.energyPct}%</td>
              <td className={`py-1 ${STATUS_STYLE[s.status] ?? 'text-stone-400'}`}>{s.status}</td>
              <td className="py-1">
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

function FoodTrendChart({ days }: { days: DashboardData['foodDays'] }) {
  if (days.length < 2) {
    return (
      <p className="py-8 text-center text-xs text-stone-500">
        Not enough finished days yet — a day is archived when the next one begins; keep playing to see the
        food trend.
      </p>
    );
  }
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const max = Math.max(1, ...days.map((d) => d.total));
  const x = (i: number) => PAD.left + (i / (days.length - 1)) * innerW;
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const pts = days.map((d, i) => `${x(i).toFixed(1)},${y(d.total).toFixed(1)}`).join(' ');
  const latestSources = Object.entries(days[days.length - 1].bySource)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  return (
    <div>
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        className="block h-44 w-full"
        role="img"
        aria-label="Food produced per day"
      >
        <ChartGrid max={max} innerH={innerH} />
        <polyline points={pts} fill="none" stroke="#fbbf24" strokeWidth={2} />
        {days.map((d, i) => (
          <circle key={d.day} cx={x(i)} cy={y(d.total)} r={2.5} fill="#fbbf24" />
        ))}
      </svg>
      <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-stone-400">
        <span className="text-amber-300">● Food produced / day</span>
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
}: {
  state: WorldState;
  onClose: () => void;
  /** Jump to a relevant action/tab for a concern. */
  onNavigate?: (where: ConcernNav) => void;
}) {
  const data = useMemo(() => collectDashboard(state), [state]);
  const [openTab, setOpenTab] = useState<'settlers' | 'trend'>('settlers');
  const [selectedSettlerId, setSelectedSettlerId] = useState<number | null>(null);
  // The keyboard half of the overlay contract: the dashboard owns the keyboard while it is open and
  // handles Escape itself, in one place shared with the other three overlays (2026-09-20 audit, clone 3).
  // The focus half moved to `GameWindow`, which owns the element the trap must be attached to.
  useOverlayKeyboard('dashboard', onClose);

  return (
    <GameWindow
      title="Village overview"
      icon="🏘️"
      // The panel's own header line, kept as the window's subtitle: the shell owns the title bar, so the
      // date and the population sit under the title instead of in a second bar of their own.
      subtitle={`Year ${data.year} · Day ${data.dayInYear} · ${data.season} · ${data.population.humans} settlers`}
      onClose={onClose}
      /*
       * A window, not the screen (owner: *"not full screen"*). Centred over the backdrop the shell
       * already provides, and wider than the shell's chat-sized default because this subject carries a
       * five-column resource row, two charts and a settler table — which is *why* it used to hand-roll
       * a full-screen dialog: the shell had no size for it. `maxBodyClassName` keeps the body inside
       * 70vh so the game stays visible above and below and the content scrolls instead.
       */
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
                        {CONCERN_NAV[c.id] && onNavigate && (
                          <button
                            type="button"
                            onClick={() => onNavigate(CONCERN_NAV[c.id]!)}
                            className="shrink-0 rounded bg-stone-800 px-2 py-0.5 font-semibold text-amber-200 hover:bg-stone-700"
                          >
                            Go →
                          </button>
                        )}
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

          {/* Food produced per day (rolling history) */}
          <section className="rounded-xl border border-stone-800 bg-stone-900/50 p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-300">
              Food produced per day
            </h3>
            <FoodTrendChart days={data.foodDays} />
          </section>

          {/* Net food flow today — the one card that owns today's ledger balance. The produced total
              used to be printed a second time in a card of its own (and a third time in the council),
              which made one balance read as several claims (`LIVE-FINDINGS-STATUS.md`, F2). */}
          <section className="rounded-xl border border-stone-800 bg-stone-900/50 p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-300">
              Net food flow today
            </h3>
            <div className="grid grid-cols-3 gap-3 text-center text-[11px]">
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
            </div>
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

          {/* Trend + settlers tabbed panels */}
          <div className="flex gap-1.5">
            {(['trend', 'settlers'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setOpenTab(t)}
                /* The selected panel was stated by background colour alone. These two do not form a
                   real `tablist` — the panel below carries no id/`aria-labelledby` and there is no
                   roving tabindex — so the honest minimum is the pressed state rather than roles the
                   markup cannot back (2026-09-20 audit, A6). */
                aria-pressed={openTab === t}
                className={`rounded-t-lg px-3 py-1.5 text-xs font-semibold capitalize ${
                  openTab === t
                    ? 'bg-stone-800 text-amber-200'
                    : 'bg-stone-900 text-stone-400 hover:text-stone-200'
                }`}
              >
                {t === 'trend' ? 'Population & wildlife' : 'Settlers & work'}
              </button>
            ))}
          </div>
          <section className="-mt-px rounded-b-xl rounded-tr-xl border border-stone-800 bg-stone-900/50 p-3">
            {openTab === 'trend' ? (
              <LineChart data={data.history} />
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
                {/* Keyed by label *and* position: the owner keeps these labels unique, but a duplicate
                    key silently drops a row, so the view does not depend on that
                    (`LIVE-FINDINGS-STATUS.md`, F25). */}
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