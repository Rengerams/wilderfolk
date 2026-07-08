import type { ReactNode } from 'react';
import type { GameState } from './gameEngine';
import { ResourceIcon, type ResourceKey } from '../components/ResourceIcons';

interface Props {
  state: GameState;
}

function MiniBar({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2 text-[10px]">
      <span className="w-16 shrink-0 truncate text-right text-stone-400">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-700">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="w-8 shrink-0 text-right font-mono text-stone-300">{value.toLocaleString()}</span>
    </div>
  );
}

function MiniLineChart({ data, color, height = 40 }: { data: number[]; color: string; height?: number }) {
  if (data.length < 2) return <div className="text-[9px] text-stone-500">Not enough data</div>;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const step = 100 / (data.length - 1);

  let path = '';
  let areaPath = '';
  for (let i = 0; i < data.length; i++) {
    const x = i * step;
    const y = 100 - ((data[i] - min) / range) * 100;
    const cmd = i === 0 ? 'M' : 'L';
    path += `${cmd}${x},${y} `;
    if (i === 0) areaPath = `M${x},${y} `;
    else areaPath += `L${x},${y} `;
  }
  areaPath += `L100,100 L0,100 Z`;

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height }}>
      <path d={areaPath} fill={color} opacity={0.15} />
      <path d={path} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function StatisticsPanel({ state }: Props) {
  const stats = state.yearlyStats;
  const ls = state.lifetimeStats;

  if (stats.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-[10px] text-stone-500">
        <div className="text-center">
          <span className="mb-2 block text-2xl">📊</span>
          <p>Statistics will appear after the first year.</p>
          <p className="mt-1 text-stone-600">Keep playing to generate data!</p>
        </div>
      </div>
    );
  }

  const latest = stats[stats.length - 1];
  const humanHistory = stats.map(s => s.population.humans);
  const ecoHistory = stats.map(s => s.ecosystem.health);
  const pollutionHistory = stats.map(s => s.ecosystem.pollution);

  const maxPop = Math.max(...humanHistory, 1);

  return (
    <div className="space-y-3 text-[10px] text-stone-300">
      {/* Current Population Overview */}
      <div className="rounded-xl bg-stone-700/50 p-3">
        <h3 className="mb-2 text-xs font-bold text-emerald-300">📊 Population Overview</h3>
        <div className="space-y-1">
          <MiniBar value={latest.population.humans} max={maxPop} color="#fbbf24" label="👤 Humans" />
          <MiniBar value={latest.population.rabbits} max={maxPop * 2} color="#c4875a" label="🐰 Rabbits" />
          <MiniBar value={latest.population.deer} max={maxPop * 2} color="#926418" label="🦌 Deer" />
          <MiniBar value={latest.population.wolves} max={Math.max(...stats.map(s => s.population.wolves), 5)} color="#6b7280" label="🐺 Wolves" />
          <MiniBar value={latest.population.foxes} max={Math.max(...stats.map(s => s.population.foxes), 5)} color="#ea580c" label="🦊 Foxes" />
          <MiniBar value={latest.population.trees} max={Math.max(...stats.map(s => s.population.trees), 50)} color="#22c55e" label="🌲 Trees" />
        </div>
      </div>

      {/* Human Population History */}
      <div className="rounded-xl bg-stone-700/50 p-3">
        <div className="mb-1.5 flex items-center justify-between">
          <h3 className="text-xs font-bold text-amber-300">👤 Human Population</h3>
          <span className="text-[9px] font-mono text-stone-500">Peak: {Math.max(...humanHistory).toLocaleString()}</span>
        </div>
        <MiniLineChart data={humanHistory} color="#fbbf24" />
        <div className="mt-1 flex justify-between text-[9px] tabular-nums text-stone-500">
          <span>Y{stats[0].year}</span>
          <span>Y{latest.year}</span>
        </div>
      </div>

      {/* Ecosystem Health */}
      <div className="rounded-xl bg-stone-700/50 p-3">
        <div className="mb-1.5 flex items-center justify-between">
          <h3 className="text-xs font-bold text-emerald-300">🌍 Ecosystem Health</h3>
          <span className="text-[9px] font-mono text-stone-500">{Math.round(latest.ecosystem.health)}%</span>
        </div>
        <MiniLineChart data={ecoHistory} color="#22c55e" />
        <div className="mt-1 flex justify-between text-[9px] tabular-nums text-stone-500">
          <span>Y{stats[0].year}</span>
          <span>Y{latest.year}</span>
        </div>
      </div>

      {/* Pollution */}
      <div className="rounded-xl bg-stone-700/50 p-3">
        <div className="mb-1.5 flex items-center justify-between">
          <h3 className="text-xs font-bold text-rose-300">🏭 Pollution Level</h3>
          <span className="text-[9px] font-mono text-stone-500">{Math.round(latest.ecosystem.pollution)}%</span>
        </div>
        <MiniLineChart data={pollutionHistory} color="#ef4444" />
        <div className="mt-1 flex justify-between text-[9px] tabular-nums text-stone-500">
          <span>Y{stats[0].year}</span>
          <span>Y{latest.year}</span>
        </div>
      </div>

      {/* Lifetime Stats */}
      <div className="rounded-xl bg-stone-700/50 p-3">
        <h3 className="mb-2 text-xs font-bold text-cyan-300">📈 Lifetime Records</h3>
        <div className="grid grid-cols-2 gap-1.5">
          <StatBox label="Humans Born" value={ls.totalHumansBorn} icon="👶" color="text-pink-400" />
          <StatBox label="Humans Died" value={ls.totalHumansDied} icon="⚰️" color="text-stone-400" />
          <StatBox label="Marriages" value={ls.totalMarriages} icon="💍" color="text-amber-400" />
          <StatBox label="Buildings" value={ls.totalBuildings} icon="🏗️" color="text-blue-400" />
          <StatBox label="Techs" value={ls.technologiesResearched} icon="🔬" color="text-purple-400" />
          <StatBox label="Trade Routes" value={ls.tradeRoutesEstablished} icon="🚢" color="text-emerald-400" />
        </div>

        {ls.longestLivingHuman.age > 0 && (
          <div className="mt-2 flex items-center gap-2 rounded bg-stone-800/60 p-2">
            <span className="text-base">👑</span>
            <div className="min-w-0">
              <span className="text-[8px] uppercase tracking-wider text-stone-500">Longest Life</span>
              <div className="text-[11px]">
                <strong className="text-amber-300">{ls.longestLivingHuman.name}</strong>
                <span className="text-stone-400"> ({ls.longestLivingHuman.age} days)</span>
              </div>
            </div>
          </div>
        )}

        {ls.largestPopulation.count > 0 && (
          <div className="mt-1 flex items-center gap-2 rounded bg-stone-800/60 p-2">
            <span className="text-base">🏆</span>
            <div className="min-w-0">
              <span className="text-[8px] uppercase tracking-wider text-stone-500">Peak Population</span>
              <div className="text-[11px]">
                <strong className="text-emerald-300">{ls.largestPopulation.count.toLocaleString()}</strong>
                <span className="text-stone-400"> (Year {ls.largestPopulation.year})</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Resources History */}
      <div className="rounded-xl bg-stone-700/50 p-3">
        <h3 className="mb-2 text-xs font-bold text-stone-300">📦 Current Resources</h3>
        <div className="grid grid-cols-2 gap-1.5">
          <StatBox label="Wood" value={latest.resources.wood} resource="wood" color="text-amber-500" />
          <StatBox label="Stone" value={latest.resources.stone} resource="stone" color="text-stone-400" />
          <StatBox label="Food" value={latest.resources.food} resource="food" color="text-emerald-400" />
          <StatBox label="Gold" value={latest.resources.gold} resource="gold" color="text-yellow-400" />
        </div>
      </div>
    </div>
  );
}

function StatBox({
  label,
  value,
  resource,
  icon,
  color,
}: {
  label: string;
  value: number;
  resource?: ResourceKey;
  icon?: ReactNode;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded bg-stone-800/60 p-2">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center text-base">
        {resource ? <ResourceIcon resource={resource} className="h-5 w-5" /> : icon}
      </span>
      <div className="min-w-0">
        <div className="text-[8px] uppercase tracking-wider text-stone-500">{label}</div>
        <div className={`text-sm font-bold leading-tight ${color}`}>{value.toLocaleString()}</div>
      </div>
    </div>
  );
}
