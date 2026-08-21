import type { ReactNode } from 'react';
import type { GameState } from './gameEngine';
import { ResourceIcon, type ResourceKey } from '../components/ResourceIcons';

interface Props {
  state: GameState;
}

/**
 * Current values and lifetime records only. Historical lines deliberately stay
 * out of the player menu; the simulation can retain its internal statistics
 * without rendering continuously updating charts.
 */
export default function StatisticsPanel({ state }: Props) {
  const lifetime = state.lifetimeStats;

  return (
    <div className="space-y-3 text-[13px] text-stone-300">
      <div className="rounded-xl bg-stone-700/50 p-3">
        <h3 className="mb-2 text-sm font-bold text-emerald-300">Village Now</h3>
        <div className="grid grid-cols-2 gap-1.5">
          <StatBox label="Population" value={state.humanPopulation} icon="👤" color="text-amber-300" />
          <StatBox label="Reputation" value={state.villageReputation} icon="⭐" color="text-emerald-400" />
          <StatBox label="Buildings" value={state.buildings.length} icon="🏗️" color="text-blue-400" />
          <StatBox label="Year" value={state.year} icon="📅" color="text-stone-300" />
        </div>
      </div>

      <div className="rounded-xl bg-stone-700/50 p-3">
        <h3 className="mb-2 text-sm font-bold text-stone-300">Current Resources</h3>
        <div className="grid grid-cols-2 gap-1.5">
          <StatBox label="Wood" value={state.resources.wood} resource="wood" color="text-amber-500" />
          <StatBox label="Stone" value={state.resources.stone} resource="stone" color="text-stone-400" />
          <StatBox label="Food" value={state.resources.food} resource="food" color="text-emerald-400" />
          <StatBox label="Gold" value={state.resources.gold} resource="gold" color="text-yellow-400" />
        </div>
      </div>

      <div className="rounded-xl bg-stone-700/50 p-3">
        <h3 className="mb-2 text-sm font-bold text-cyan-300">Lifetime Records</h3>
        <div className="grid grid-cols-2 gap-1.5">
          <StatBox label="Humans Born" value={lifetime.totalHumansBorn} icon="👶" color="text-pink-400" />
          <StatBox label="Humans Died" value={lifetime.totalHumansDied} icon="⚰️" color="text-stone-400" />
          <StatBox label="Marriages" value={lifetime.totalMarriages} icon="💍" color="text-amber-400" />
          <StatBox label="Buildings" value={lifetime.totalBuildings} icon="🏗️" color="text-blue-400" />
          <StatBox label="Techs" value={lifetime.technologiesResearched} icon="🔬" color="text-purple-400" />
          <StatBox label="Trade Routes" value={lifetime.tradeRoutesEstablished} icon="🚢" color="text-emerald-400" />
        </div>

        {lifetime.longestLivingHuman.age > 0 && (
          <div className="mt-2 flex items-center gap-2 rounded bg-stone-800/60 p-2">
            <span className="text-base">👑</span>
            <div className="min-w-0">
              <span className="text-[10px] uppercase tracking-wider text-stone-400">Longest Life</span>
              <div className="text-[13px]">
                <strong className="text-amber-300">{lifetime.longestLivingHuman.name}</strong>
                <span className="text-stone-400"> ({lifetime.longestLivingHuman.age} days)</span>
              </div>
            </div>
          </div>
        )}

        {lifetime.largestPopulation.count > 0 && (
          <div className="mt-1 flex items-center gap-2 rounded bg-stone-800/60 p-2">
            <span className="text-base">🏆</span>
            <div className="min-w-0">
              <span className="text-[10px] uppercase tracking-wider text-stone-400">Peak Population</span>
              <div className="text-[13px]">
                <strong className="text-emerald-300">{lifetime.largestPopulation.count.toLocaleString()}</strong>
                <span className="text-stone-400"> (Year {lifetime.largestPopulation.year})</span>
              </div>
            </div>
          </div>
        )}
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
        <div className="text-[10px] uppercase tracking-wider text-stone-400">{label}</div>
        <div className={`text-sm font-bold leading-tight ${color}`}>{value.toLocaleString()}</div>
      </div>
    </div>
  );
}
