import { useEffect, useCallback, useState } from 'react';
import { GAME_VERSION, GAME_PHASE } from './gameEngine';
import { ensureIntroAudio } from '../audio';
import { MapPreset, MapSize, MAP_SIZE_DIMENSIONS } from './gameTypes';

const PRESET_INFO: Record<MapPreset, { label: string; blurb: string; emoji: string }> = {
  [MapPreset.Verdant]: { label: 'Verdant', emoji: '🌿', blurb: 'Balanced rivers, forests, and grasslands.' },
  [MapPreset.Mountainous]: { label: 'Mountainous', emoji: '⛰️', blurb: 'Tall peaks, rocky highlands, fewer rivers.' },
  [MapPreset.Coastal]: { label: 'Coastal', emoji: '🌊', blurb: 'More water, beaches, and wetlands.' },
  [MapPreset.Arid]: { label: 'Arid', emoji: '☀️', blurb: 'Dry plains, sparse woods, hot temperatures.' },
  [MapPreset.Harsh]: { label: 'Harsh', emoji: '❄️', blurb: 'Rugged, cold, and unforgiving terrain.' },
};

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

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 overflow-y-auto px-4 py-6 sm:gap-6 sm:px-6 sm:py-8">
        <section className="rounded-xl border border-stone-700/60 bg-stone-900/70 p-4 sm:p-5">
          <h2 className="mb-1 text-xs font-bold uppercase tracking-widest text-emerald-400">Settlement name</h2>
          <p className="mb-3 text-[11px] text-stone-500">Your pioneers will carry this name in the chronicle.</p>
          <input
            type="text"
            value={villageName}
            onChange={(e) => setVillageName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleStart()}
            maxLength={24}
            autoFocus
            className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2.5 text-base text-white placeholder-stone-500 outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30"
            placeholder="New Frontier"
          />
        </section>

        <section className="rounded-xl border border-stone-700/60 bg-stone-900/70 p-4 sm:p-5">
          <h2 className="mb-1 text-xs font-bold uppercase tracking-widest text-emerald-400">Map size</h2>
          <p className="mb-3 text-[11px] text-stone-500">Larger maps mean more wilderness — and more to manage.</p>
          <div className="grid grid-cols-3 gap-2">
            {(Object.values(MapSize) as MapSize[]).map((size) => {
              const dims = MAP_SIZE_DIMENSIONS[size];
              const label = size[0].toUpperCase() + size.slice(1);
              const selected = selectedSize === size;
              return (
                <button
                  key={size}
                  type="button"
                  onClick={() => onSizeChange(size)}
                  className={`rounded-lg border px-2 py-3 text-left transition-all ${
                    selected
                      ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/25'
                      : 'border-stone-700 bg-stone-800/50 text-stone-400 hover:border-stone-600 hover:text-stone-200'
                  }`}
                >
                  <span className="block text-sm font-bold">{label}</span>
                  <span className="mt-0.5 block text-[10px] opacity-80">
                    {dims.width} × {dims.height}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl border border-stone-700/60 bg-stone-900/70 p-4 sm:p-5">
          <h2 className="mb-1 text-xs font-bold uppercase tracking-widest text-emerald-400">Terrain preset</h2>
          <p className="mb-3 text-[11px] text-stone-500">Shapes rivers, coastlines, and how harsh the frontier feels.</p>
          <div className="flex flex-col gap-2">
            {(Object.values(MapPreset) as MapPreset[]).map((preset) => {
              const info = PRESET_INFO[preset];
              const selected = selectedPreset === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => onPresetChange(preset)}
                  className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-all ${
                    selected
                      ? 'border-emerald-500/50 bg-emerald-500/15 ring-1 ring-emerald-500/25'
                      : 'border-stone-700 bg-stone-800/50 hover:border-stone-600'
                  }`}
                >
                  <span className="text-xl leading-none">{info.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm font-semibold ${selected ? 'text-emerald-200' : 'text-stone-200'}`}>
                      {info.label}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-stone-500">{info.blurb}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <p className="text-center text-[10px] leading-relaxed text-stone-600">
          Playtest build — bugs and features still in flux. You can change difficulty by picking a harsher preset.
        </p>
      </main>

      <footer className="shrink-0 border-t border-stone-800/80 bg-stone-950/80 px-4 py-4 sm:px-8">
        <div className="mx-auto flex max-w-2xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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