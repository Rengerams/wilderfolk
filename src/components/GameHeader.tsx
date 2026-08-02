import Emoji from './Emoji';
import GameMenu from './GameMenu';
import ResourceBadge from './ResourceBadge';
import type { WorldState } from '../game/gameTypes';
import { WEATHER_CONFIGS } from '../game/gameTypes';
import { isNightHour, getHourOfDay, getWeekdayLabel, isWeekend, TICKS_PER_DAY } from '../game/dayCycle';
import { getOpenBeds, getTotalBeds } from '../game/populationGrowth';
import { formatSettlerName, getVillageLeader } from '../game/villageLeadership';
import {
  computeDailyTemperatureC,
  formatTemperatureC,
  SEASON_LABELS,
  seasonTextClass,
} from '../game/temperature';

function formatHour(hour: number) {
  const h = hour % 24;
  return `${h.toString().padStart(2, '0')}:00`;
}

interface Props {
  world: WorldState;
  population: number;
  gameTitle: string;
  gameVersion: string;
  gamePhase: string;
  gameSubtitle: string;
  foodAlert: boolean;
  muted: boolean;
  volumePreset: 'soft' | 'normal' | 'loud';
  hasSavedGame: boolean;
tutorialsEnabled: boolean;
  juiceEffectsEnabled: boolean;
  /** Show raw sim tick (and absolute day) next to the clock. */
  showSimTick: boolean;
  speedOptions: number[];
  onTogglePause: () => void;
  onSetSpeed: (speed: number) => void;
  onOpenTrade: () => void;
  onSave: () => void;
  onLoad: () => void;
  onSaveToFile: () => void;
  onLoadFromFile: (jsonText: string) => void;
  onToggleAutoSave: () => void;
  onToggleTutorials: () => void;
  onToggleJuiceEffects: () => void;
  onToggleShowSimTick: () => void;
  onToggleMute: () => void;
  onVolumePreset: (v: 'soft' | 'normal' | 'loud') => void;
  onOpenGuide: () => void;
  onStartNewGame: () => void;
  /** Select & camera-focus the village leader on the map. */
  onFocusLeader?: () => void;
}

export default function GameHeader({
  world,
  population,
  gameTitle,
  gameVersion,
  gamePhase,
  gameSubtitle,
  foodAlert,
  muted,
  volumePreset,
  hasSavedGame,
tutorialsEnabled,
  juiceEffectsEnabled,
  showSimTick,
  speedOptions,
  onTogglePause,
  onSetSpeed,
  onOpenTrade,
  onSave,
  onLoad,
  onSaveToFile,
  onLoadFromFile,
  onToggleAutoSave,
  onToggleTutorials,
  onToggleJuiceEffects,
  onToggleShowSimTick,
  onToggleMute,
  onVolumePreset,
  onOpenGuide,
  onStartNewGame,
  onFocusLeader,
}: Props) {
  const hour = getHourOfDay(world.tick);
  const isNight = isNightHour(hour);
  const weekday = getWeekdayLabel(world.tick);
  const weekend = isWeekend(world.tick);
  const dailyTempC = computeDailyTemperatureC(world.season, world.weather, world.dayInYear, world.year);
  const seasonLabel = SEASON_LABELS[world.season];
  const popNearCap = population / Math.max(1, world.maxHumanPopulation) >= 0.9;
  const beds = getTotalBeds(world);
  const openBeds = getOpenBeds(world);
  const absoluteDay = Math.floor(Math.max(0, world.tick) / TICKS_PER_DAY);
  const villageLeader = getVillageLeader(world);
  const leaderLabel = villageLeader ? formatSettlerName(villageLeader) : null;
  return (
    <header className="game-header flex items-center justify-between gap-3 border-b border-stone-700/90 px-3 py-1.5 shadow-lg">
      <div
        className="flex min-w-0 items-center gap-2"
        title={`${gameTitle} · v${gameVersion}`}
      >
        <img
          src="/logo.png"
          alt=""
          className="h-8 w-8 shrink-0 rounded-md object-contain ring-1 ring-amber-500/40 shadow-md shadow-amber-900/20"
        />
        <div className="min-w-0">
          <h1 className="truncate text-sm font-bold tracking-tight text-stone-50">
            {world.villageName || gameTitle}
          </h1>
          <p className="hidden truncate text-[9px] text-stone-500 sm:block">
            {gameSubtitle || gamePhase}
          </p>
        </div>
        {leaderLabel ? (
          <button
            type="button"
            onClick={onFocusLeader}
            disabled={!onFocusLeader}
            className="hidden max-w-[11rem] shrink items-center gap-1 rounded-lg bg-amber-950/70 px-2 py-1 text-left ring-1 ring-amber-500/50 hover:bg-amber-900/80 disabled:cursor-default sm:flex"
            title={`Village head since Year ${world.leaderSinceYear} — click to find on map`}
            aria-label={`Village head ${leaderLabel}`}
          >
            <span className="text-sm leading-none" aria-hidden>👑</span>
            <span className="min-w-0">
              <span className="block text-[8px] font-semibold uppercase tracking-wide text-amber-500/90">Village head</span>
              <span className="block truncate text-[11px] font-bold text-amber-100">{leaderLabel}</span>
            </span>
          </button>
        ) : (
          <span
            className="hidden items-center gap-1 rounded-lg bg-stone-900/50 px-2 py-1 text-[10px] text-stone-500 ring-1 ring-stone-700/60 sm:flex"
            title="No village head appointed yet"
          >
            <span aria-hidden>👑</span>
            <span>No head</span>
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <div
          className="hud-chip flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] sm:px-2.5 sm:text-[11px]"
          title={`${seasonLabel} · ${formatTemperatureC(dailyTempC)} · ${weekday}${weekend ? ' (free)' : ' (work 7–18)'} · Year ${world.year} · Day ${world.dayInYear}${world.weather !== 'clear' ? ` · ${WEATHER_CONFIGS[world.weather].label}` : ''}${world.festival ? ` · ${world.festival.name}` : ''} · sim tick ${world.tick} (day ${absoluteDay})${showSimTick ? '' : ' — enable “Show sim tick” in Menu → Settings to pin tick on the bar'}`}
        >
          <span className={seasonTextClass(world.season)}>{seasonLabel}</span>
          <span className="font-mono text-stone-200">{formatTemperatureC(dailyTempC)}</span>
          <span className="text-stone-500">·</span>
          <span className={`font-semibold ${weekend ? 'text-emerald-400' : 'text-stone-300'}`}>{weekday}</span>
          <span className="text-stone-500">·</span>
          <span className="text-stone-300">Y{world.year} D{world.dayInYear}</span>
          <span className="text-stone-500">·</span>
          <Emoji>{isNight ? '🌙' : weekend ? '🌿' : '☀️'}</Emoji>
          <span className="font-mono text-white">{formatHour(hour)}</span>
          {world.weather !== 'clear' && <Emoji>{WEATHER_CONFIGS[world.weather].emoji}</Emoji>}
          {world.festival && <Emoji title={world.festival.name}>🎉</Emoji>}
          {showSimTick && (
            <>
              <span className="text-stone-500">·</span>
              <button
                type="button"
                onClick={onToggleShowSimTick}
                className="rounded bg-cyan-950/60 px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums text-cyan-300 ring-1 ring-cyan-700/50 hover:bg-cyan-900/50"
                title={`Simulation tick ${world.tick} · absolute day ${absoluteDay} (${TICKS_PER_DAY} ticks/day) · click to hide`}
                aria-label={`Simulation tick ${world.tick}`}
              >
                t{world.tick}
                <span className="ml-1 hidden font-normal text-cyan-500/90 sm:inline">d{absoluteDay}</span>
              </button>
            </>
          )}
        </div>

        <div
          className="hud-chip flex items-center gap-1 rounded-lg px-1 py-0.5"
          title="Pause / speed — Space toggles pause"
        >
          <button
            type="button"
            onClick={onTogglePause}
            className={`rounded-md px-2.5 py-1 text-[11px] font-bold shadow-sm ${world.paused ? 'bg-emerald-600 text-white ring-1 ring-emerald-400/40' : 'bg-amber-600/95 text-white ring-1 ring-amber-400/30'}`}
            title="Space — pause / resume"
            aria-label={world.paused ? 'Resume simulation' : 'Pause simulation'}
          >
            {world.paused ? '▶' : '⏸'}
          </button>
          <div className="flex gap-0.5 rounded-md bg-stone-950/40 p-0.5">
            {speedOptions.map((s, index) => (
              <button
                key={`speed-${index}-${s}`}
                type="button"
                onClick={() => onSetSpeed(s)}
                className={`rounded px-1.5 py-0.5 text-[9px] font-bold transition-colors ${world.speed === s ? 'bg-emerald-700/80 text-emerald-50' : 'text-stone-400 hover:bg-stone-700/60 hover:text-white'}`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 flex-nowrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenTrade}
            className="flex items-center gap-0.5 rounded-md bg-violet-900/35 px-1.5 py-1 text-[11px] text-violet-200 hover:bg-violet-800/45"
            title={`Reputation ${world.villageReputation} — click for trade routes`}
          >
            <span>⭐</span>
            <span className="font-mono font-bold">{world.villageReputation}</span>
          </button>

          <span
            className={`flex items-center gap-0.5 rounded-md px-1.5 py-1 text-[11px] ${
              popNearCap ? 'bg-rose-900/40 text-rose-300' : 'bg-sky-900/40 text-sky-300'
            }`}
            title={`${population} settlers · immigration cap ${world.maxHumanPopulation} · 🛏️ ${beds} beds (${openBeds} open)`}
          >
            <span>👥</span>
            <span className="font-mono font-bold">{population}/{world.maxHumanPopulation}</span>
            <span className="text-[9px] opacity-75" title={`${beds} beds total`}>🛏️{beds}</span>
          </span>

          <div className="flex items-center gap-0.5">
            <ResourceBadge
              resource="food"
              value={world.resources.food}
              max={world.storageMax.food}
              alert={foodAlert}
            />
            <ResourceBadge
              resource="wood"
              value={world.resources.wood}
              max={world.storageMax.wood}
            />
            <ResourceBadge resource="gold" value={world.resources.gold} />
            <ResourceBadge
              resource="stone"
              value={world.resources.stone}
              max={world.storageMax.stone}
              className="hidden md:inline-flex"
            />
          </div>
        </div>

<GameMenu
          gameTitle={gameTitle}
          gameVersion={gameVersion}
          gamePhase={gamePhase}
          gameSubtitle={gameSubtitle}
          hasSavedGame={hasSavedGame}
          autoSave={world.autoSave}
          tutorialsEnabled={tutorialsEnabled}
          juiceEffectsEnabled={juiceEffectsEnabled}
          showSimTick={showSimTick}
          muted={muted}
          volumePreset={volumePreset}
          onSave={onSave}
          onLoad={onLoad}
          onSaveToFile={onSaveToFile}
          onLoadFromFile={onLoadFromFile}
          onToggleAutoSave={onToggleAutoSave}
          onToggleTutorials={onToggleTutorials}
          onToggleJuiceEffects={onToggleJuiceEffects}
          onToggleShowSimTick={onToggleShowSimTick}
          onToggleMute={onToggleMute}
          onVolumePreset={onVolumePreset}
          onOpenGuide={onOpenGuide}
          onStartNewGame={onStartNewGame}
        />
      </div>
    </header>
  );
}