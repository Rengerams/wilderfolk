import Emoji from './Emoji';
import GameMenu, { type GameMenuSettingsCallbacks } from './GameMenu';
import ResourceBadge from './ResourceBadge';
import type { WorldState } from '../game/gameTypes';
import { WEATHER_CONFIGS } from '../game/gameTypes';
import { isNightHour, getHourOfDay, getWeekdayLabel, isWeekend, getAbsoluteCalendarDay, TICKS_PER_DAY } from '../game/dayCycle';
import { DEFAULT_WORK_SCHEDULE, getWorkSchedule, getWorkScheduleLabel } from '../game/workSchedule';
import { getOpenPlayerBeds, getTotalBeds, isPopulationNearCap, resolvePopulationCap } from '../game/populationGrowth';
import { isResourceCapped } from '../game/resourceUtils';
import { formatSettlerName, getVillageLeader } from '../game/villageLeadership';
import {
  computeDailyTemperatureC,
  formatTemperatureC,
  SEASON_LABELS,
  seasonTextClass,
} from '../game/temperature';
import type { VirtualPlayerAct } from '../hooks/useVirtualPlayer';
import { VIRTUAL_PLAYER_TOOLTIP_LIMIT } from '../hooks/useVirtualPlayer';
import { OVERVIEW_SUBJECTS, type OverviewNavId } from '../hooks/useGameShellState';

/**
 * The overview's subjects whose door is a *new* icon in this bar.
 *
 * The Village subject is not in this list: its door is the population chip beside it, which has
 * opened that subject since before the ruling and already shows the number the subject is about. All
 * six subjects therefore have a door here, without the bar carrying two glyphs for one thing.
 */
const HEADER_SUBJECT_ICONS: OverviewNavId[] = ['frontier', 'nature', 'progress', 'chronicle', 'help'];

function formatHour(hour: number) {
  const h = hour % 24;
  return `${h.toString().padStart(2, '0')}:00`;
}

interface Props extends GameMenuSettingsCallbacks {
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
  showFps: boolean;
  /** In-app virtual player (auto-play) toggle state. */
  autoPlay: boolean;
  /** Latest one-line auto-play reason, or `null` while auto-play is off. */
  autoPlayStatus: string | null;
  /** Most recent auto-play acts — shown in the toggle's tooltip. */
  autoPlayHistory: VirtualPlayerAct[];
  onToggleAutoPlay: () => void;
  speedOptions: number[];
  onTogglePause: () => void;
  onSetSpeed: (speed: number) => void;
  onOpenTrade: () => void;
  /** Select & camera-focus the village leader on the map. */
  onFocusLeader?: () => void;
  /** Open the full-screen People overview. */
  onOpenCitizenOverview?: () => void;
  /** Open one overview subject in its own window (the six header doors). */
  onOpenSubject?: (subject: OverviewNavId) => void;
  /** Which subject's window is open, so its door reads as pressed. */
  activeSubject?: OverviewNavId | null;
  /** Open the full-screen village overview dashboard (Esc closes it). */
  onOpenDashboard?: () => void;
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
  showFps,
  autoPlay,
  autoPlayStatus,
  autoPlayHistory,
  onToggleAutoPlay,
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
  onToggleShowFps,
  onToggleMute,
  onVolumePreset,
  onOpenGuide,
  onStartNewGame,
  onFocusLeader,
  onOpenCitizenOverview,
  onOpenSubject,
  activeSubject = null,
  onOpenDashboard,
}: Props) {
  const hour = getHourOfDay(world.tick);
  const isNight = isNightHour(hour);
  const weekday = getWeekdayLabel(world.tick);
  const weekend = isWeekend(world.tick);
  const dailyTempC = computeDailyTemperatureC(world.season, world.weather, world.dayInYear, world.year);
  const seasonLabel = SEASON_LABELS[world.season];
  // The band and the cap are the growth owner's (`POPULATION_NEAR_CAP_RATIO` /
 // `resolvePopulationCap`); this view only paints the answer. The open-bed
  // figure is the assignable one: the chip's "N open" means "a settler could sleep here", not
 // "some bed in the valley is empty".
  const popNearCap = isPopulationNearCap(world);
  const popCap = resolvePopulationCap(world);
  const beds = getTotalBeds(world);
  const openBeds = getOpenPlayerBeds(world);
  const absoluteDay = getAbsoluteCalendarDay(world.tick);
  const workSchedule = getWorkSchedule(world);
  // Roadmap P6 / audit R38: the window that decides whether production happens at all was
  // tooltip-only, so a player who set 06:00–16:00 saw no sign of it on the bar.
  const workWindowIsDefault =
    workSchedule.startHour === DEFAULT_WORK_SCHEDULE.startHour
    && workSchedule.endHour === DEFAULT_WORK_SCHEDULE.endHour;
  const villageLeader = getVillageLeader(world);
  const leaderLabel = villageLeader ? formatSettlerName(villageLeader) : null;
  const autoPlayTitle = autoPlay
    ? [
        'Virtual player — answers cards and fixes the colony, one real command per in-game hour.',
        ...autoPlayHistory
          .slice(0, VIRTUAL_PLAYER_TOOLTIP_LIMIT)
          .map((act) => `t${act.tick} · ${act.reason}`),
      ].join('\n')
    : 'Virtual player — an in-app auto-player that plays the real game on screen (one command per in-game hour)';
  return (
    <header className="game-header flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 border-b border-stone-700/90 px-3 py-1 shadow-lg">
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
          <p className="hidden truncate text-[11px] text-stone-300 sm:block">
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
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-amber-500/90">Village head</span>
              <span className="block truncate text-[13px] font-bold text-amber-100">{leaderLabel}</span>
            </span>
          </button>
        ) : (
          <span
            className="hidden items-center gap-1 rounded-lg bg-stone-900/50 px-2 py-1 text-xs text-stone-400 ring-1 ring-stone-700/60 sm:flex"
            title="No village head appointed yet"
          >
            <span aria-hidden>👑</span>
            <span>No head</span>
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <div
          className="hud-chip flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs sm:px-2.5 sm:text-[13px]"
          title={`${seasonLabel} · ${formatTemperatureC(dailyTempC)} · ${weekday}${weekend ? ' (free)' : ` (work ${getWorkScheduleLabel(workSchedule)})`} · Year ${world.year} · Day ${world.dayInYear}${world.weather !== 'clear' ? ` · ${WEATHER_CONFIGS[world.weather].label}` : ''}${world.festival ? ` · ${world.festival.name}` : ''} · sim tick ${world.tick} (day ${absoluteDay})${showSimTick ? '' : ' — enable “Show sim tick” in Menu → Settings to pin tick on the bar'}`}
        >
          <span className={seasonTextClass(world.season)}>{seasonLabel}</span>
          <span className="font-mono text-stone-200">{formatTemperatureC(dailyTempC)}</span>
          <span className="text-stone-400">·</span>
          <span className={`font-semibold ${weekend ? 'text-emerald-400' : 'text-stone-300'}`}>{weekday}</span>
          <span className="text-stone-400">·</span>
          <span className="text-stone-300">Y{world.year} D{world.dayInYear}</span>
          <span className="text-stone-400">·</span>
          <Emoji>{isNight ? '🌙' : weekend ? '🌿' : '☀️'}</Emoji>
          <span className="font-mono text-white">{formatHour(hour)}</span>
          {world.weather !== 'clear' && <Emoji>{WEATHER_CONFIGS[world.weather].emoji}</Emoji>}
          {world.festival && <Emoji title={world.festival.name}>🎉</Emoji>}
          {!workWindowIsDefault && !weekend && (
            <span
              className="rounded bg-amber-950/70 px-1.5 py-0.5 text-[11px] font-semibold text-amber-200 ring-1 ring-amber-500/40"
              title="Configured work window — Menus → People → Work & venue hours"
            >
              🛠 {getWorkScheduleLabel(workSchedule)}
            </span>
          )}
          {showSimTick && (
            <>
              <span className="text-stone-400">·</span>
              <button
                type="button"
                onClick={onToggleShowSimTick}
                className="rounded bg-cyan-950/60 px-1.5 py-0.5 font-mono text-xs font-bold tabular-nums text-cyan-300 ring-1 ring-cyan-700/50 hover:bg-cyan-900/50"
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
          className="hud-chip flex items-center gap-1 rounded-lg px-1.5 py-1"
          title="Pause / speed — Space toggles pause"
        >
          <button
            type="button"
            onClick={onTogglePause}
            className={`rounded-md px-2.5 py-1 text-[13px] font-bold shadow-sm ${world.paused ? 'bg-emerald-600 text-white ring-1 ring-emerald-400/40' : 'bg-amber-600/95 text-white ring-1 ring-amber-400/30'}`}
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
                className={`rounded-md px-2 py-1 text-xs font-bold transition-colors ${world.speed === s ? 'bg-emerald-700/80 text-emerald-50 shadow-sm ring-1 ring-emerald-400/30' : 'text-stone-400 hover:bg-stone-700/60 hover:text-white'}`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>

        {typeof import.meta !== 'undefined' && import.meta.env?.DEV === true && (
          <div
            className="hud-chip flex items-center gap-1 rounded-lg px-1.5 py-1"
            title={autoPlayTitle}
          >
            <button
              type="button"
              onClick={onToggleAutoPlay}
              aria-pressed={autoPlay}
              className={`rounded-md px-2 py-1 text-xs font-bold shadow-sm transition-colors ${autoPlay ? 'bg-cyan-700 text-cyan-50 ring-1 ring-cyan-400/40' : 'bg-stone-950/40 text-stone-400 hover:bg-stone-700/60 hover:text-white'}`}
              title={autoPlay
                ? 'Stop the virtual player'
                : 'Let the virtual player run the colony — one real command per in-game hour'}
              aria-label={autoPlay ? 'Turn auto-play off' : 'Turn auto-play on'}
            >
              🤖 Auto-play
            </button>
            {/* Not `hidden sm:inline`: an enabled bot must never be silent, and a
                width-gated `display: none` hid this line below a 640 px window. */}
            {autoPlay && autoPlayStatus && (
              <span
                className="max-w-[17rem] truncate text-[11px] text-cyan-200"
                title={autoPlayStatus}
              >
                auto-player: {autoPlayStatus}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex shrink-0 flex-nowrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onOpenTrade}
            className="flex items-center gap-0.5 rounded-md bg-violet-900/35 px-1.5 py-1 text-[13px] text-violet-200 hover:bg-violet-800/45"
            title={`Reputation ${world.villageReputation} — click for trade routes`}
          >
            <span>⭐</span>
            <span className="font-mono font-bold">{world.villageReputation}</span>
          </button>

          <button
            type="button"
            onClick={onOpenCitizenOverview}
            disabled={!onOpenCitizenOverview}
            className={`flex items-center gap-0.5 rounded-md px-1.5 py-1 text-[13px] ${
              popNearCap ? 'bg-rose-900/40 text-rose-300' : 'bg-sky-900/40 text-sky-300'
            } hover:brightness-110 disabled:cursor-default`}
            title={`People overview (O) — ${population} settlers · cap ${popCap} · 🛏️ ${beds} beds (${openBeds} open)`}
            aria-label="Open people overview"
          >
            <span>👥</span>
            <span className="font-mono font-bold">{population}/{popCap}</span>
            <span className="text-[11px] opacity-75" title={`${beds} beds total`}>🛏️{beds}</span>
          </button>

          {/* The Village overview's own door. Icon only, like every other control in this bar
              (owner: *"just a icon not a name with it in the ehader"*) — the word lives in the
              `title` and the accessible name, not as a label beside the glyph. It replaced a bare 📊
              that the owner could not read as a door at all (*"i want a new icon in the header to
              open it"*), and the glyph matches the one its window's title bar shows. */}
          {/*
            One icon per overview subject, icon only (owner: *"just a icon not a name with it in the
            ehader"*). Each opens **that subject's window** — the six full-screen panels the owner
            reported (*"the 6 panel stacked now that opens full screen should be each subject a own
            icon the header and open a window for that subject not full screen"*). The glyph, name and
            hint all come from `OVERVIEW_SUBJECTS`, so a door cannot disagree with the window it opens.

            Deliberately the tightest control in the bar — `p-1`, no ring of its own, 12 px glyphs. The
            owner's report of the first version was *"the header is now quite large 3rows"*: five doors
            at the size of the stat chips above them cost ~170 px and pushed the bar's third group onto
            a row of its own. They are one nav strip, so they read as one strip.
          */}
          {onOpenSubject && (
            <div className="flex items-center gap-0 rounded-md bg-stone-950/40 p-px">
              {HEADER_SUBJECT_ICONS.map((id) => {
                const subject = OVERVIEW_SUBJECTS[id];
                const open = activeSubject === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onOpenSubject(id)}
                    // `aria-current`, not `aria-pressed`: the doors are a navigation set, and which
                    // subject is open must be *stated*, not only painted — the contract audit A-6
                    // established for the nav strip these doors replaced
                    // (`tests/keyboardGuards.contract.test.ts`).
                    aria-current={open}
                    className={`rounded p-0.5 text-[11px] leading-none transition-colors ${
                      open ? 'bg-emerald-800/70 text-emerald-100' : 'hover:bg-stone-700/70'
                    }`}
                    title={`${subject.label} — ${subject.hint} (opens in a window, Esc closes)`}
                    aria-label={`Open ${subject.label.toLowerCase()} window`}
                  >
                    <span aria-hidden>{subject.icon}</span>
                  </button>
                );
              })}
            </div>
          )}

          <button
            type="button"
            onClick={onOpenDashboard}
            disabled={!onOpenDashboard}
            className="flex items-center gap-0.5 rounded-md bg-amber-900/40 px-1.5 py-1 text-[13px] text-amber-200 hover:bg-amber-800/50 disabled:cursor-default"
            title="Village overview — concerns, food, jobs, population (opens in a window, Esc closes)"
            aria-label="Open village overview"
          >
            <span aria-hidden>🏘️</span>
          </button>

          <div className="flex items-center gap-0.5">
            <ResourceBadge
              resource="food"
              value={world.resources.food}
              max={world.storageMax.food}
              alert={foodAlert}
              full={isResourceCapped(world, 'food')}
            />
            <ResourceBadge
              resource="wood"
              value={world.resources.wood}
              max={world.storageMax.wood}
              full={isResourceCapped(world, 'wood')}
            />
            <ResourceBadge
              resource="gold"
              value={world.resources.gold}
              max={world.storageMax.gold}
              full={isResourceCapped(world, 'gold')}
            />
            <ResourceBadge
              resource="stone"
              value={world.resources.stone}
              max={world.storageMax.stone}
              full={isResourceCapped(world, 'stone')}
              className="hidden md:inline-flex"
            />
            <ResourceBadge
              resource="iron"
              value={world.resources.iron}
              max={world.storageMax.iron}
              full={isResourceCapped(world, 'iron')}
              className="hidden lg:inline-flex"
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
          showFps={showFps}
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
          onToggleShowFps={onToggleShowFps}
          onToggleMute={onToggleMute}
          onVolumePreset={onVolumePreset}
          onOpenGuide={onOpenGuide}
          onStartNewGame={onStartNewGame}
        />
      </div>
    </header>
  );
}