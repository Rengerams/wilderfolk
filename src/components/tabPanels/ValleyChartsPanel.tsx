import type { WorldState } from '../../game/gameTypes';

/** Resource trend mini-chart (single series, normalized, SVG). */
function MiniTrend({
  data,
  color,
  height = 36,
}: { data: number[]; color: string; height?: number }) {
  if (data.length < 2) return <div className="text-[10px] text-stone-600">Waiting for data…</div>;
  let max = 1;
  for (const v of data) if (v > max) max = v;
  const min = Math.min(0, ...data);
  const range = max - min || 1;
  const step = 100 / (data.length - 1);
  let path = '';
  let area = '';
  for (let i = 0; i < data.length; i++) {
    const x = i * step;
    const y = 100 - ((data[i] - min) / range) * 88 - 6;
    path += `${i === 0 ? 'M' : 'L'}${x},${y} `;
    if (i === 0) area = `M${x},${y} `;
    else area += `L${x},${y} `;
  }
  area += 'L100,100 L0,100 Z';
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height }}>
      <path d={area} fill={color} opacity={0.14} />
      <path d={path} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Multi-series trend chart with legend — the food chain, at a glance. */
function SeriesChart({
  series,
  height = 64,
}: { series: { label: string; color: string; data: number[] }[]; height?: number }) {
  const valid = series.filter((s) => s.data.length >= 2);
  if (valid.length === 0) return <div className="text-[10px] text-stone-600">Waiting for data…</div>;
  const count = Math.max(...valid.map((s) => s.data.length));
  const step = 100 / (count - 1);
  // Normalize each series to its own range so every trend line is readable.
  const paths = valid.map((s) => {
    let max = 1;
    for (const v of s.data) if (v > max) max = v;
    const min = Math.min(0, ...s.data);
    const range = max - min || 1;
    let path = '';
    let area = '';
    for (let i = 0; i < count; i++) {
      const v = s.data[i] ?? s.data[s.data.length - 1];
      const x = i * step;
      const y = 100 - ((v - min) / range) * 88 - 6;
      path += `${i === 0 ? 'M' : 'L'}${x},${y} `;
      if (i === 0) area = `M${x},${y} `;
      else area += `L${x},${y} `;
    }
    area += 'L100,100 L0,100 Z';
    return { path, area, color: s.color, label: s.label };
  });
  return (
    <div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height }}>
        {paths.map((p) => (
          <path key={p.label} d={p.area} fill={p.color} opacity={0.1} />
        ))}
        {paths.map((p) => (
          <path key={p.label} d={p.path} fill="none" stroke={p.color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
        {paths.map((p) => (
          <span key={p.label} className="flex items-center gap-1 text-[10px] text-stone-400">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.color }} />
            {p.label}
          </span>
        ))}
      </div>
    </div>
  );
}

const fmt = (v: number): string => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`);

export default function ValleyChartsPanel({ state }: { state: WorldState }) {
  const hist = state.populationHistory ?? [];
  const last = hist[hist.length - 1];

  const gold = hist.map((h) => h.gold ?? 0);
  const food = hist.map((h) => h.food ?? 0);
  const wood = hist.map((h) => h.wood ?? 0);
  const stone = hist.map((h) => h.stone ?? 0);
  const humans = hist.map((h) => h.humans);
  const wolves = hist.map((h) => h.wolves);
  const rabbits = hist.map((h) => h.rabbits);
  const deer = hist.map((h) => h.deer);
  const foxes = hist.map((h) => h.foxes);
  const eco = hist.map((h) => h.ecosystemHealth ?? 0);
  const pollution = hist.map((h) => h.pollution ?? 0);

  const resourceCards = [
    { label: '💰 Gold', color: '#fbbf24', data: gold, value: last?.gold ?? 0 },
    { label: '🍖 Food', color: '#fb7185', data: food, value: last?.food ?? 0 },
    { label: '🪵 Wood', color: '#a16207', data: wood, value: last?.wood ?? 0 },
    { label: '🪨 Stone', color: '#a8a29e', data: stone, value: last?.stone ?? 0 },
  ];

  return (
    <div className="space-y-3 text-[11px] text-stone-300">
      <p className="text-[10px] text-stone-500">
        Rolling view of the last ~40 days — how your valley is doing right now, not just at year's end.
      </p>

      <div className="rounded-xl bg-stone-700/50 p-3">
        <h3 className="mb-2 text-xs font-bold text-amber-300">🐾 The food chain</h3>
        <SeriesChart
          height={64}
          series={[
            { label: '👤 Humans', color: '#fbbf24', data: humans },
            { label: '🐺 Wolves', color: '#6b7280', data: wolves },
            { label: '🐰 Rabbits', color: '#c4875a', data: rabbits },
            { label: '🦌 Deer', color: '#926418', data: deer },
            { label: '🦊 Foxes', color: '#ea580c', data: foxes },
          ]}
        />
        <p className="mt-1 text-[10px] leading-relaxed text-stone-500">
          Grass feeds prey, prey feeds predators, predators keep the balance — and you're part of it.
          Don't kill all the wolves.
        </p>
      </div>

      <div className="rounded-xl bg-stone-700/50 p-3">
        <h3 className="mb-2 text-xs font-bold text-emerald-300">🌍 Valley health</h3>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-emerald-400">Ecosystem</span>
              <span className="font-mono text-[10px]">{Math.round(eco[eco.length - 1] ?? 0)}%</span>
            </div>
            <MiniTrend data={eco} color="#22c55e" height={34} />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-rose-400">Pollution</span>
              <span className="font-mono text-[10px]">{Math.round(pollution[pollution.length - 1] ?? 0)}%</span>
            </div>
            <MiniTrend data={pollution} color="#ef4444" height={34} />
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-stone-700/50 p-3">
        <h3 className="mb-2 text-xs font-bold text-stone-300">📦 Resources</h3>
        <div className="grid grid-cols-2 gap-2">
          {resourceCards.map((c) => (
            <div key={c.label}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-stone-300">{c.label}</span>
                <span className="font-mono text-[10px] text-stone-200">{fmt(c.value)}</span>
              </div>
              <MiniTrend data={c.data} color={c.color} height={34} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
