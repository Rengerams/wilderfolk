import { memo, useMemo } from 'react';
import type { WorldState } from '../../game/gameEngine';
import type { GrazingPressureReport, EcosystemBreakdown } from '../../game/gameEngine';
import { SEASON_LABELS, seasonTextClass, formatTemperatureC, computeDailyTemperatureC } from '../../game/temperature';
import { Season, WeatherType } from '../../game/gameTypes';
import {
  computeValleyEcologySnapshot,
  valleyStageEmoji,
  valleyStageLabel,
  type ValleyStage,
} from '../../game/ecologyStage';
import Emoji from '../Emoji';

const WEATHER_ICONS: Record<WeatherType, string> = {
  [WeatherType.Clear]: '',
  [WeatherType.Rain]: '🌧️',
  [WeatherType.Storm]: '⛈️',
  [WeatherType.Snow]: '❄️',
  [WeatherType.Fog]: '🌫️',
  [WeatherType.Drought]: '🌵',
};

interface WildlifeBarProps {
  label: string;
  count: number;
  max: number;
  color: string;
  icon: string;
}

const WildlifeBar = memo(function WildlifeBar({ label, count, max, color, icon }: WildlifeBarProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex w-5 justify-center text-center text-[13px]">
        <Emoji>{icon}</Emoji>
      </span>
      <div className="flex-1">
        <div className="mb-0.5 flex justify-between text-[11px]">
          <span className="text-stone-400">{label}</span>
          <span className="font-bold tabular-nums text-stone-200">{count}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-stone-600">
          <div
            className={`h-full rounded-full transition-all ${color}`}
            style={{ width: `${Math.min(100, (count / max) * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
});

export interface NatureTabPanelProps {
  state: WorldState;
  grazingPressure: GrazingPressureReport;
  ecoBreakdown: EcosystemBreakdown;
}

const STAGE_STYLES: Record<ValleyStage, string> = {
  stable: 'border-emerald-500/40 bg-emerald-950/30',
  strained: 'border-amber-500/40 bg-amber-950/30',
  damaged: 'border-orange-500/45 bg-orange-950/35',
  collapse: 'border-rose-500/50 bg-rose-950/40',
};

const STAGE_TITLE: Record<ValleyStage, string> = {
  stable: 'text-emerald-300',
  strained: 'text-amber-300',
  damaged: 'text-orange-300',
  collapse: 'text-rose-300',
};

const DRIVER_BAND_COLOR = {
  good: 'text-emerald-400',
  caution: 'text-amber-400',
  bad: 'text-rose-400',
} as const;

export default function NatureTabPanel({ state, grazingPressure, ecoBreakdown }: NatureTabPanelProps) {
  // Field-level deps on purpose — recompute only when an ecology input changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const valley = useMemo(() => computeValleyEcologySnapshot(state), [
    state.valleyStage,
    state.ecosystemHealth,
    state.pollutionLevel,
    state.wildlifeCounts,
    state.humanPopulation,
    state.buildings,
    state.tick,
    state.season,
    state.weather,
  ]);
  const stage = valley.stage;

  const wc = state.wildlifeCounts;
  const preyTotal = (wc?.rabbits ?? 0) + (wc?.deer ?? 0);
  const predatorTotal = (wc?.wolves ?? 0) + (wc?.foxes ?? 0);

  return (
    <div className="space-y-3">
      {/* Counts first — easy to miss when buried under eco essays */}
      <div className="rounded-xl border border-emerald-700/35 bg-stone-700/50 p-3">
        <div className="mb-2 flex items-end justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-stone-200">Wildlife populations</h3>
            <p className="text-[10px] text-stone-500">
              Live counts · prey {preyTotal} · predators {predatorTotal} · grass {wc?.grass ?? 0}
            </p>
          </div>
          <p className="shrink-0 text-[10px] text-stone-500" title="Season affects grass & animal energy">
            {SEASON_LABELS[state.season]}
          </p>
        </div>
        <div className="mb-2 grid grid-cols-4 gap-1 text-center text-[10px]">
          <div className="rounded-lg bg-stone-800/70 px-1 py-1.5">
            <div className="text-base leading-none"><Emoji>🐰</Emoji></div>
            <div className="mt-0.5 font-bold tabular-nums text-amber-200">{wc?.rabbits ?? 0}</div>
            <div className="text-stone-500">rabbits</div>
          </div>
          <div className="rounded-lg bg-stone-800/70 px-1 py-1.5">
            <div className="text-base leading-none"><Emoji>🦌</Emoji></div>
            <div className="mt-0.5 font-bold tabular-nums text-orange-200">{wc?.deer ?? 0}</div>
            <div className="text-stone-500">deer</div>
          </div>
          <div className="rounded-lg bg-stone-800/70 px-1 py-1.5">
            <div className="text-base leading-none"><Emoji>🐺</Emoji></div>
            <div className="mt-0.5 font-bold tabular-nums text-stone-200">{wc?.wolves ?? 0}</div>
            <div className="text-stone-500">wolves</div>
          </div>
          <div className="rounded-lg bg-stone-800/70 px-1 py-1.5">
            <div className="text-base leading-none"><Emoji>🦊</Emoji></div>
            <div className="mt-0.5 font-bold tabular-nums text-orange-300">{wc?.foxes ?? 0}</div>
            <div className="text-stone-500">foxes</div>
          </div>
        </div>
        <div className="space-y-1 text-[11px]">
          <WildlifeBar label="Rabbits" count={wc?.rabbits ?? 0} max={120} color="bg-amber-600" icon="🐰" />
          <WildlifeBar label="Deer" count={wc?.deer ?? 0} max={60} color="bg-orange-700" icon="🦌" />
          <WildlifeBar label="Wolves" count={wc?.wolves ?? 0} max={25} color="bg-stone-500" icon="🐺" />
          <WildlifeBar label="Foxes" count={wc?.foxes ?? 0} max={35} color="bg-orange-600" icon="🦊" />
          <WildlifeBar label="Grass patches" count={wc?.grass ?? 0} max={500} color="bg-green-500" icon="🌿" />
          <WildlifeBar label="Trees" count={wc?.trees ?? 0} max={200} color="bg-green-700" icon="🌲" />
          {(wc?.werewolves ?? 0) > 0 && (
            <WildlifeBar label="Moon Howlers" count={wc.werewolves} max={10} color="bg-violet-700" icon="🌝" />
          )}
          {(wc?.wildkin ?? 0) > 0 && (
            <WildlifeBar label="Wildkin" count={wc.wildkin} max={15} color="bg-lime-700" icon="🦌" />
          )}
        </div>
        <p className="mt-2 text-[9px] leading-snug text-stone-500">
          Winter and heavy hunting thin herds. Soft recovery at the frontier if numbers stay low.
        </p>
      </div>

      <div className={`rounded-xl border p-3 ${STAGE_STYLES[stage]}`}>
        <h3 className={`mb-1 text-xs font-bold ${STAGE_TITLE[stage]}`}>
          <Emoji className="mr-1">{valleyStageEmoji(stage)}</Emoji>
          Valley: {valleyStageLabel(stage)}
        </h3>
        <p className="text-[11px] leading-relaxed text-stone-300">{valley.playerSummary}</p>
        <div className="mt-2 space-y-1">
          {valley.drivers.map((d) => (
            <div key={d.id} className="flex items-start justify-between gap-2 text-[10px]">
              <span className="text-stone-400">{d.label}</span>
              <span className={`shrink-0 font-semibold uppercase ${DRIVER_BAND_COLOR[d.band]}`}>
                {d.band}
              </span>
            </div>
          ))}
        </div>
        {stage !== 'stable' && (
          <div className="mt-2 rounded-lg bg-stone-950/30 px-2 py-1.5 text-[10px] text-stone-400">
            <p className="mb-0.5 font-semibold uppercase tracking-wide text-stone-500">What helps</p>
            <ul className="list-inside list-disc space-y-0.5">
              {valley.helpLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {grazingPressure.level !== 'stable' && (
        <div className={`rounded-xl border p-3 ${
          grazingPressure.level === 'critical'
            ? 'border-rose-500/40 bg-rose-950/40'
            : 'border-amber-500/40 bg-amber-950/30'
        }`}>
          <h3 className={`mb-1 text-xs font-bold ${
            grazingPressure.level === 'critical' ? 'text-rose-300' : 'text-amber-300'
          }`}>
            {grazingPressure.level === 'critical' ? '⚠️ Overgrazing warning' : '🦌 Grazing pressure rising'}
          </h3>
          <p className="text-[11px] leading-relaxed text-stone-300">{grazingPressure.headline}</p>
          <p className="mt-1.5 text-[11px] text-stone-400">{grazingPressure.advice}</p>
          <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-stone-500">
            <span><Emoji className="mr-0.5">🦌</Emoji> Deer: {grazingPressure.deerCount}</span>
            <span><Emoji className="mr-0.5">🌿</Emoji> Grass: {grazingPressure.grassCount}</span>
            <span>Demand/day: {grazingPressure.grazingDemandPerDay}</span>
            <span>Recovery/day: {grazingPressure.grassRecoveryPerDay}</span>
          </div>
        </div>
      )}

      <div className="rounded-xl bg-stone-700/50 p-3">
        <h3 className="mb-3 text-sm font-bold text-stone-300">Ecosystem Health</h3>

        <div className="mb-3 space-y-2">
          <div>
            <div className="mb-1 flex justify-between text-[11px]">
              <span className="text-stone-400">Health</span>
              <strong className={state.ecosystemHealth > 60 ? 'text-emerald-400' : state.ecosystemHealth > 30 ? 'text-amber-400' : 'text-rose-400'}>
                {Math.round(state.ecosystemHealth)}%
              </strong>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-stone-600">
              <div className={`h-full rounded-full transition-all ${
                state.ecosystemHealth > 60 ? 'bg-emerald-500' : state.ecosystemHealth > 30 ? 'bg-amber-500' : 'bg-rose-500'
              }`} style={{ width: `${Math.max(0, state.ecosystemHealth)}%` }} />
            </div>
          </div>

          <div>
            <div className="mb-1 flex justify-between text-[11px]">
              <span className="text-stone-400">Pollution</span>
              <strong className="text-rose-400">{Math.round(state.pollutionLevel)}%</strong>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-stone-600">
              <div className="h-full rounded-full bg-rose-500 transition-all" style={{ width: `${Math.max(0, state.pollutionLevel)}%` }} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded bg-stone-600/30 p-2">
            <div className="text-stone-500">Biodiversity</div>
            <strong className="text-lg text-white">{state.biodiversityIndex.toFixed(2)}</strong>
          </div>
          <div className="rounded bg-stone-600/30 p-2">
            <div className="text-stone-500">Weather</div>
            <strong className="text-lg text-white">{state.weather}</strong>
          </div>
        </div>

        <div className="mt-3 rounded-lg border border-stone-600/40 bg-stone-800/40 p-2.5">
          <h4 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-stone-400">Why this score</h4>
          <p className="mb-2 text-[11px] leading-relaxed text-stone-400">{ecoBreakdown.summary}</p>
          <div className="space-y-1 text-[11px]">
            {ecoBreakdown.lines.map((line) => (
              <div key={line.label} className="flex items-start justify-between gap-2">
                <span className="text-stone-500">{line.label}</span>
                <span className="text-right">
                  <strong className={line.delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    {line.delta >= 0 ? '+' : ''}{Math.round(line.delta)}
                  </strong>
                  <span className="block text-[8px] text-stone-600">{line.detail}</span>
                </span>
              </div>
            ))}
            <div className="flex justify-between border-t border-stone-700/60 pt-1 font-bold">
              <span className="text-stone-400">Health</span>
              <span className="text-stone-200">{Math.round(ecoBreakdown.health)}%</span>
            </div>
          </div>
          <p className="mt-2 text-[8px] text-stone-600">
            Growing towns shed pristine wilderness — there is no player tree planting yet. Early food-chain balance still matters for hunting.
          </p>
        </div>
      </div>

      <div className="rounded-xl bg-stone-700/50 p-3">
        <h3 className="mb-2 text-sm font-bold text-stone-300">Season & Climate</h3>
        <div className="space-y-1 text-[11px] text-stone-400">
          <p>
            <strong className={seasonTextClass(state.season)}>{SEASON_LABELS[state.season]}</strong>
            {' · '}
            <span className="font-mono text-stone-200">
              {formatTemperatureC(computeDailyTemperatureC(state.season, state.weather, state.dayInYear, state.year))}
            </span>
            {' today'}
          </p>
          {state.season === Season.Winter && (
            <p className="text-sky-300/90">
              Winter (days 270–359) — settlers burn wood for heat; grass and babies slow down.
            </p>
          )}
          {state.weather !== WeatherType.Clear && (
            <p>
              {WEATHER_ICONS[state.weather] ? <Emoji className="mr-1">{WEATHER_ICONS[state.weather]}</Emoji> : null}
              <strong className="text-stone-200">{state.weather}</strong>
              {' '}— shifts today&apos;s temperature and farming
            </p>
          )}
        </div>
      </div>

      {state.disasters.length > 0 && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-900/30 p-3">
          <h3 className="mb-2 text-sm font-bold text-rose-400">Active Disasters</h3>
          {state.disasters.map((d, i) => (
            <div key={i} className="mb-1 text-[11px] text-rose-300">
              ⚠️ {d.type.charAt(0).toUpperCase() + d.type.slice(1)} — {Math.round((1 - d.progress / d.duration) * 100)}% remaining
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
