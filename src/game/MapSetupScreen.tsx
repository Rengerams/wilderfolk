import { useEffect, useCallback, useState } from 'react';
import { GAME_VERSION, GAME_PHASE } from './gameEngine';
import { ensureIntroAudio } from '../audio';
import { MapPreset, MapSize, MAP_SIZE_DIMENSIONS } from './gameTypes';

const PRESET_INFO: Record<MapPreset, { label: string; blurb: string; emoji: string; forTag: string }> = {
  [MapPreset.Verdant]: {
    label: 'Verdant',
    emoji: '🌿',
    blurb: 'Balanced rivers, forests, and grasslands.',
    forTag: 'The classic frontier',
  },
  [MapPreset.Mountainous]: {
    label: 'Mountainous',
    emoji: '⛰️',
    blurb: 'Tall peaks, rocky highlands, fewer rivers.',
    forTag: 'Stone and high passes',
  },
  [MapPreset.Coastal]: {
    label: 'Coastal',
    emoji: '🌊',
    blurb: 'More water, beaches, and wetlands.',
    forTag: 'Seabreeze and salt',
  },
  [MapPreset.Arid]: {
    label: 'Arid',
    emoji: '☀️',
    blurb: 'Dry plains, sparse woods, hot temperatures.',
    forTag: 'Dust on the wind',
  },
  [MapPreset.Harsh]: {
    label: 'Harsh',
    emoji: '❄️',
    blurb: 'Rugged, cold, and unforgiving terrain.',
    forTag: 'For the hardened',
  },
  [MapPreset.Riverlands]: {
    label: 'Riverlands',
    emoji: '🌾',
    blurb: 'Wet, flat marshlands laced with winding rivers.',
    forTag: 'Reeds and slow water',
  },
};

/** One mini painted landscape per preset — layered gradients + shapes, no images. */
function LandscapeArt({ preset, seed }: { preset: MapPreset; seed: number }) {
  const jitter = (n: number) => 50 + ((seed * 7919 + n * 104729) % 100) / 100; // 0.5..1.5 stable

  if (preset === MapPreset.Mountainous) {
    return (
      <div
        className="relative h-20 w-full overflow-hidden rounded-t-xl"
        style={{ background: 'linear-gradient(180deg, #1e293b 0%, #334155 45%, #475569 70%, #5b6575 100%)' }}
      >
        <div className="absolute left-1/2 top-2 h-3 w-3 -translate-x-1/2 rounded-full bg-stone-200/80" style={{ boxShadow: '0 0 12px 4px rgba(226,232,240,0.35)' }} />
        <div
          className="absolute bottom-0 left-0 h-3/4 w-1/2 bg-stone-700"
          style={{ clipPath: 'polygon(0 100%, 22% 22%, 45% 100%)', opacity: 0.9 }}
        />
        <div
          className="absolute bottom-0 right-0 h-3/4 w-1/2 bg-stone-600"
          style={{ clipPath: 'polygon(15% 100%, 42% 10%, 78% 100%)', opacity: 0.9 }}
        />
        <div
          className="absolute bottom-0 left-1/4 h-2/5 w-1/3 bg-stone-500"
          style={{ clipPath: 'polygon(0 100%, 35% 30%, 70% 100%)', opacity: 0.95 }}
        />
        <div className="absolute bottom-0 left-0 right-0 h-1/5 bg-stone-800/90" />
      </div>
    );
  }

  if (preset === MapPreset.Coastal) {
    return (
      <div
        className="relative h-20 w-full overflow-hidden rounded-t-xl"
        style={{ background: 'linear-gradient(180deg, #0f172a 0%, #164e63 55%, #0e7490 75%, #155e75 100%)' }}
      >
        <div className="absolute right-3 top-2 h-3.5 w-3.5 rounded-full bg-amber-200/90" style={{ boxShadow: '0 0 14px 6px rgba(253,230,138,0.4)' }} />
        <div className="absolute bottom-0 left-0 h-3/5 w-full" style={{ background: 'linear-gradient(180deg, #155e75 0%, #0e7490 100%)' }} />
        <div className="absolute bottom-0 left-0 h-[18%] w-2/3 rounded-t-[100%] bg-[#d6c79a]" style={{ left: jitter(1) * 10 }} />
        <div className="absolute bottom-0 left-0 h-[10%] w-1/2 rounded-t-[100%] bg-[#e6d7a8]" style={{ left: jitter(2) * 15 }} />
        <div className="absolute bottom-[22%] left-[8%] h-[6px] w-14 rotate-[-6deg] rounded bg-white/25" style={{ left: jitter(3) * 8 }} />
        <div className="absolute bottom-[26%] left-[30%] h-[5px] w-16 rotate-[4deg] rounded bg-white/20" />
      </div>
    );
  }

  if (preset === MapPreset.Arid) {
    return (
      <div
        className="relative h-20 w-full overflow-hidden rounded-t-xl"
        style={{ background: 'linear-gradient(180deg, #451a03 0%, #9a3412 45%, #c2703d 70%, #b45309 100%)' }}
      >
        <div className="absolute left-1/2 top-2.5 h-4 w-4 -translate-x-1/2 rounded-full bg-amber-300" style={{ boxShadow: '0 0 18px 8px rgba(252,211,77,0.5)' }} />
        <div className="absolute -left-6 bottom-0 h-2/3 w-3/4 rounded-[100%_0_0_0] bg-[#d99a63]" style={{ opacity: 0.85 }} />
        <div className="absolute -right-8 bottom-0 h-2/3 w-3/4 rounded-[0_100%_0_0] bg-[#c2703d]" style={{ opacity: 0.9 }} />
        <div className="absolute -left-10 bottom-0 h-1/2 w-2/3 rounded-[100%_0_0_0] bg-[#b36a3a]" style={{ opacity: 0.9 }} />
        <div className="absolute bottom-[30%] left-[12%] h-[3px] w-10 rotate-[-3deg] rounded bg-amber-100/30" style={{ left: jitter(4) * 10 }} />
      </div>
    );
  }

  if (preset === MapPreset.Harsh) {
    return (
      <div
        className="relative h-20 w-full overflow-hidden rounded-t-xl"
        style={{ background: 'linear-gradient(180deg, #0f172a 0%, #334155 50%, #475569 75%, #94a3b8 100%)' }}
      >
        <div className="absolute left-1/2 top-2 h-3 w-3 -translate-x-1/2 rounded-full bg-stone-100/70" style={{ boxShadow: '0 0 10px 3px rgba(241,245,249,0.3)' }} />
        <div className="absolute bottom-0 left-0 h-1/2 w-full bg-stone-700" style={{ opacity: 0.9 }} />
        <div className="absolute -left-4 bottom-[38%] h-10 w-24 rotate-[8deg] rounded-[100%_0_0_0] bg-[#e2e8f0]" style={{ opacity: 0.95 }} />
        <div className="absolute -right-6 bottom-[34%] h-12 w-28 rotate-[-6deg] rounded-[0_100%_0_0] bg-[#cbd5e1]" style={{ opacity: 0.9 }} />
        <div className="absolute left-0 right-0 bottom-[40%] h-[6px] bg-white/25" />
        <div className="absolute bottom-0 left-0 right-0 h-[18%] bg-white/30" />
      </div>
    );
  }

  if (preset === MapPreset.Riverlands) {
    return (
      <div
        className="relative h-20 w-full overflow-hidden rounded-t-xl"
        style={{ background: 'linear-gradient(180deg, #0c1a2e 0%, #1e3a5f 45%, #166534 70%, #14532d 100%)' }}
      >
        <div className="absolute left-1/2 top-2 h-3.5 w-3.5 -translate-x-1/2 rounded-full bg-stone-200/70" style={{ boxShadow: '0 0 14px 5px rgba(226,232,240,0.3)' }} />
        <div className="absolute -left-6 bottom-0 h-2/3 w-1/2 rounded-[100%_0_0_0] bg-[#166534]" style={{ opacity: 0.85 }} />
        <div className="absolute -right-8 bottom-0 h-2/3 w-1/2 rounded-[0_100%_0_0] bg-[#15803d]" style={{ opacity: 0.9 }} />
        <div className="absolute bottom-0 left-0 h-[42%] w-full bg-[#0e7490]/80" />
        <div className="absolute bottom-0 left-0 h-[10%] w-full bg-[#22d3ee]/40" />
        {/* winding river — two strokes */}
        <div className="absolute bottom-[34%] left-[5%] h-[5px] w-16 rotate-[8deg] rounded bg-[#67e8f9]/60" style={{ left: jitter(6) * 8 }} />
        <div className="absolute bottom-[40%] left-[40%] h-[4px] w-14 rotate-[-10deg] rounded bg-[#67e8f9]/50" />
        {/* reeds */}
        <div className="absolute bottom-[30%] left-[8%] h-3 w-[2px] rotate-[6deg] rounded bg-[#4ade80]/70" />
        <div className="absolute bottom-[30%] left-[10%] h-3.5 w-[2px] rotate-[-5deg] rounded bg-[#86efac]/60" />
        <div className="absolute bottom-[30%] right-[12%] h-3 w-[2px] rotate-[-4deg] rounded bg-[#4ade80]/70" />
      </div>
    );
  }

  // Verdant (default) — rolling green hills, dusk sky, a river glint
  return (
    <div
      className="relative h-20 w-full overflow-hidden rounded-t-xl"
      style={{ background: 'linear-gradient(180deg, #0c1a2e 0%, #14532d 48%, #166534 70%, #15803d 100%)' }}
    >
      <div className="absolute right-4 top-2 h-3.5 w-3.5 rounded-full bg-emerald-100/90" style={{ boxShadow: '0 0 14px 6px rgba(209,250,229,0.35)' }} />
      <div className="absolute -left-8 bottom-0 h-2/3 w-3/4 rounded-[100%_0_0_0] bg-[#14532d]" style={{ opacity: 0.9 }} />
      <div className="absolute -right-10 bottom-0 h-2/3 w-3/4 rounded-[0_100%_0_0] bg-[#166534]" style={{ opacity: 0.9 }} />
      <div className="absolute -left-12 bottom-0 h-1/2 w-2/3 rounded-[100%_0_0_0] bg-[#15803d]" style={{ opacity: 0.95 }} />
      <div className="absolute bottom-[24%] left-[20%] h-[4px] w-12 rotate-[-8deg] rounded bg-[#99e6c4]/50" style={{ left: jitter(5) * 12 }} />
      <div className="absolute bottom-[28%] left-[45%] h-[3px] w-10 rotate-[5deg] rounded bg-[#99e6c4]/40" />
    </div>
  );
}

interface MapSetupScreenProps {
  selectedSize: MapSize;
  selectedPreset: MapPreset;
  onSizeChange: (size: MapSize) => void;
  onPresetChange: (preset: MapPreset) => void;
  onStart: (villageName: string) => void;
  onLoad?: () => void;
  onBack?: () => void;
  backLabel?: string;
  hasSave?: boolean;
  tutorialsEnabled?: boolean;
  onTutorialsChange?: (enabled: boolean) => void;
  /** Per-new-game choice — play the first-spring guide or start free. */
  tutorialChoice?: boolean;
  onTutorialChoiceChange?: (enabled: boolean) => void;
}

export default function MapSetupScreen({
  selectedSize,
  selectedPreset,
  onSizeChange,
  onPresetChange,
  onStart,
  onLoad,
  onBack,
  backLabel = '← Back to intro',
  hasSave,
  tutorialsEnabled,
  onTutorialsChange,
  tutorialChoice,
  onTutorialChoiceChange,
}: MapSetupScreenProps) {
  const [villageName, setVillageName] = useState('New Frontier');

  const ensureIntroMusic = useCallback(() => {
    void ensureIntroAudio();
  }, []);

  useEffect(() => {
    ensureIntroMusic();
  }, [ensureIntroMusic]);

  useEffect(() => {
    const unlockOnGesture = () => ensureIntroMusic();
    window.addEventListener('pointerdown', unlockOnGesture);
    window.addEventListener('keydown', unlockOnGesture);
    return () => {
      window.removeEventListener('pointerdown', unlockOnGesture);
      window.removeEventListener('keydown', unlockOnGesture);
    };
  }, [ensureIntroMusic]);

  const handleStart = () => {
    onStart(villageName.trim() || 'New Frontier');
  };

  const presets = Object.values(MapPreset) as MapPreset[];
  const sizes = Object.values(MapSize) as MapSize[];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gradient-to-b from-stone-950 via-stone-900 to-emerald-950">
      <header className="flex shrink-0 items-center justify-between border-b border-stone-800/80 px-4 py-3 sm:px-8">
        <div className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt=""
            className="h-10 w-10 rounded-full object-contain ring-1 ring-emerald-500/30"
            style={{ imageRendering: 'pixelated' }}
          />
          <div>
            <h1 className="text-sm font-bold tracking-wide text-white sm:text-base">New settlement</h1>
            <p className="text-[10px] text-stone-500">Choose your valley before the pioneers arrive</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden rounded-full bg-amber-900/40 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300 ring-1 ring-amber-600/30 sm:inline">
            {GAME_PHASE}
          </span>
          <span className="text-[10px] text-stone-600">v{GAME_VERSION}</span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 overflow-y-auto px-4 py-5 sm:gap-5 sm:px-6 sm:py-6">
        {/* Settlement name — slim signpost */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest text-emerald-400">Settlement name</h2>
            <p className="mt-0.5 text-[11px] text-stone-500">Your pioneers will carry this name in the chronicle.</p>
          </div>
          <div className="relative sm:w-64">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm">🏷️</span>
            <input
              type="text"
              value={villageName}
              onChange={(e) => setVillageName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleStart()}
              maxLength={24}
              autoFocus
              className="w-full rounded-lg border border-stone-700 bg-stone-800 pl-9 pr-3 py-2 text-sm text-white placeholder-stone-500 outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30"
              placeholder="New Frontier"
            />
          </div>
        </div>

        {/* Choose your land — painted gallery */}
        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-xs font-bold uppercase tracking-widest text-emerald-400">Choose your land</h2>
            <span className="text-[10px] text-stone-600">5 valleys, each with its own mood</span>
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {presets.map((preset, i) => {
              const info = PRESET_INFO[preset];
              const selected = selectedPreset === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => onPresetChange(preset)}
                  className={`group relative overflow-hidden rounded-xl border text-left transition-all ${
                    selected
                      ? 'border-emerald-400/60 bg-emerald-500/10 ring-2 ring-emerald-500/30'
                      : 'border-stone-700 bg-stone-900/70 hover:border-stone-500 hover:bg-stone-800/80'
                  }`}
                >
                  <LandscapeArt preset={preset} seed={i * 7 + 3} />
                  <div className="flex items-start gap-2 p-2.5">
                    <span className="mt-0.5 text-lg leading-none">{info.emoji}</span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm font-bold ${selected ? 'text-emerald-200' : 'text-stone-100'}`}>
                        {info.label}
                      </span>
                      <span className="mt-0.5 block text-[10px] leading-snug text-stone-500">{info.blurb}</span>
                      <span className="mt-1 block text-[9px] font-semibold uppercase tracking-wider text-stone-600">
                        {info.forTag}
                      </span>
                    </span>
                  </div>
                  {selected && (
                    <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-black text-stone-950 shadow">
                      ✓
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* Map size — slim segmented control */}
        <section className="rounded-xl border border-stone-700/60 bg-stone-900/70 px-4 py-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-widest text-emerald-400">Map size</h2>
              <p className="mt-0.5 text-[11px] text-stone-500">Larger maps mean more wilderness — and more to manage.</p>
            </div>
            <div className="flex gap-1 rounded-lg border border-stone-700 bg-stone-800/80 p-1">
              {sizes.map((size) => {
                const dims = MAP_SIZE_DIMENSIONS[size];
                const label = size[0].toUpperCase() + size.slice(1);
                const selected = selectedSize === size;
                return (
                  <button
                    key={size}
                    type="button"
                    onClick={() => onSizeChange(size)}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                      selected
                        ? 'bg-emerald-500/25 text-emerald-200 ring-1 ring-emerald-500/40'
                        : 'text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    {label}
                    <span className="ml-1 hidden text-[9px] font-normal opacity-70 sm:inline">
                      {dims.width}×{dims.height}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {onTutorialsChange !== undefined && (
          <section className="rounded-xl border border-stone-700/60 bg-stone-900/70 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-widest text-emerald-400">Tutorial tips</h2>
                <p className="mt-0.5 text-[11px] text-stone-500">Help cards appear when something new happens.</p>
              </div>
              <label className="flex cursor-pointer items-center gap-2">
                <span className={`text-xs ${tutorialsEnabled !== false ? 'text-stone-200' : 'text-stone-500'}`}>
                  {tutorialsEnabled !== false ? 'On' : 'Off'}
                </span>
                <input
                  type="checkbox"
                  checked={tutorialsEnabled !== false}
                  onChange={(e) => onTutorialsChange(e.target.checked)}
                  className="h-4 w-4 accent-emerald-500"
                />
              </label>
            </div>
          </section>
        )}

        {onTutorialChoiceChange !== undefined && (
          <section className="rounded-xl border border-emerald-700/40 bg-emerald-950/30 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-widest text-emerald-300">🎓 First-spring guide</h2>
                <p className="mt-0.5 text-[11px] text-stone-400">
                  A step-by-step guide walks you through your first year — build a house, plant food, survive winter. You can skip it anytime.
                </p>
              </div>
              <label className="flex cursor-pointer items-center gap-2">
                <span className={`text-xs ${tutorialChoice !== false ? 'text-emerald-200' : 'text-stone-500'}`}>
                  {tutorialChoice !== false ? 'On' : 'Off'}
                </span>
                <input
                  type="checkbox"
                  checked={tutorialChoice !== false}
                  onChange={(e) => onTutorialChoiceChange(e.target.checked)}
                  className="h-4 w-4 accent-emerald-500"
                />
              </label>
            </div>
          </section>
        )}

        <p className="text-center text-[10px] leading-relaxed text-stone-600">
          Playtest build — bugs and features still in flux. Difficulty scales with the land you pick.
        </p>
      </main>

      <footer className="shrink-0 border-t border-stone-800/80 bg-stone-950/80 px-4 py-4 sm:px-8">
        <div className="mx-auto flex max-w-3xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="order-2 rounded-lg border border-stone-700 px-4 py-2.5 text-xs font-semibold text-stone-400 transition-all hover:border-stone-600 hover:text-stone-200 sm:order-1"
            >
              {backLabel}
            </button>
          ) : (
            <span className="hidden sm:block" />
          )}
          <div className="order-1 flex flex-col gap-2 sm:order-2 sm:flex-row">
            {hasSave && onLoad && (
              <button
                type="button"
                onClick={onLoad}
                className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-5 py-2.5 text-sm font-semibold text-amber-300 transition-all hover:bg-amber-500/20"
              >
                Load saved game
              </button>
            )}
            <button
              type="button"
              onClick={handleStart}
              className="rounded-lg bg-emerald-600 px-8 py-2.5 text-sm font-bold tracking-wide text-white transition-all hover:bg-emerald-500"
            >
              Settle the valley
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
