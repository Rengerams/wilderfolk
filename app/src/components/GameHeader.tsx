import GameMenu from './GameMenu';
import ResourceBadge from './ResourceBadge';
import type { Season, WorldState } from '../game/gameTypes';
import { WEATHER_CONFIGS } from '../game/gameTypes';
import { isNightHour, getHourOfDay } from '../game/dayCycle';
import { getOpenBeds, getTotalBeds } from '../game/populationGrowth';

const SEASON_ICONS: Record<Season, string> = {
  spring: '🌸', summer: '☀️', fall: '🍂', winter: '❄️',
};

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
  speedOptions: number[];
  onTogglePause: () => void;
  onSetSpeed: (speed: number) => void;
  onOpenTrade: () => void;
  onSave: () => void;
  onLoad: () => void;
  onToggleAutoSave: () => void;
  onToggleTutorials: () => void;
  onToggleJuiceEffects: () => void;
  onToggleMute: () => void;
  onVolumePreset: (v: 'soft' | 'normal' | 'loud') => void;
  onOpenGuide: () => void;
  onStartNewGame: () => void;
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
  speedOptions,
  onTogglePause,
  onSetSpeed,
  onOpenTrade,
  onSave,
  onLoad,
  onToggleAutoSave,
  onToggleTutorials,
  onToggleJuiceEffects,
  onToggleMute,
  onVolumePreset,
  onOpenGuide,
  onStartNewGame,
}: Props) {
  const hour = getHourOfDay(world.tick);
  const isNight = isNightHour(hour);
  const popNearCap = population / Math.max(1, world.maxHumanPopulation) >= 0.9;
  const beds = getTotalBeds(world);
  const openBeds = getOpenBeds(world);
  return (
    <header className="flex items-center justify-between gap-3 border-b border-stone-700 bg-stone-800 px-3 py-1.5 shadow-lg">
      <div
        className="flex min-w-0 items-center gap-2"
        title={`${gameTitle} · v${gameVersion}`}
      >
        <img
          src="/logo.png"
          alt=""
          className="h-8 w-8 shrink-0 rounded-md object-contain ring-1 ring-amber-500/30"
        />
        <h1 className="truncate text-sm font-bold text-white">{world.villageName || gameTitle}</h1>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <div
          className="hidden items-center gap-1.5 rounded-md bg-stone-700/50 px-2.5 py-1 text-[11px] sm:flex"
          title={`${world.season} · Year ${world.year} · Day ${world.dayInYear}${world.weather !== 'clear' ? ` · ${WEATHER_CONFIGS[world.weather].label}` : ''}${world.festival ? ` · ${world.festival.name}` : ''}`}
        >
          <span>{SEASON_ICONS[world.season]}</span>
          <span className="font-semibold capitalize text-emerald-400">{world.season.slice(0, 3)}</span>
          <span className="text-stone-500">·</span>
          <span className="text-stone-300">Y{world.year} D{world.dayInYear}</span>
          <span className="text-stone-500">·</span>
          <span>{isNight ? '🌙' : '☀️'}</span>
          <span className="font-mono text-white">{formatHour(hour)}</span>
          {world.weather !== 'clear' && <span>{WEATHER_CONFIGS[world.weather].emoji}</span>}
          {world.festival && <span title={world.festival.name}>🎉</span>}
        </div>

        <div
          className="flex items-center gap-1 rounded-lg border border-stone-600/70 bg-stone-800/60 px-1 py-0.5"
          title="Pause / speed — Space toggles pause"
        >
          <button
            type="button"
            onClick={onTogglePause}
            className={`rounded-md px-2 py-1 text-[11px] font-bold ${world.paused ? 'bg-emerald-600 text-white' : 'bg-amber-600/90 text-white'}`}
            title="Space — pause / resume"
            aria-label={world.paused ? 'Resume simulation' : 'Pause simulation'}
          >
            {world.paused ? '▶' : '⏸'}
          </button>
          <div className="flex gap-0.5 rounded-md bg-stone-700/80 p-0.5">
            {speedOptions.map((s, index) => (
              <button
                key={`speed-${index}-${s}`}
                type="button"
                onClick={() => onSetSpeed(s)}
                className={`rounded px-1 py-0.5 text-[9px] font-bold ${world.speed === s ? 'bg-stone-500 text-white' : 'text-stone-400 hover:text-white'}`}
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
          muted={muted}
          volumePreset={volumePreset}
          onSave={onSave}
          onLoad={onLoad}
          onToggleAutoSave={onToggleAutoSave}
          onToggleTutorials={onToggleTutorials}
          onToggleJuiceEffects={onToggleJuiceEffects}
          onToggleMute={onToggleMute}
          onVolumePreset={onVolumePreset}
          onOpenGuide={onOpenGuide}
          onStartNewGame={onStartNewGame}
        />
      </div>
    </header>
  );
}