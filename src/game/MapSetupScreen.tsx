import { useCallback, useEffect, useRef, useState } from 'react';
import { GAME_VERSION, GAME_PHASE } from './gameEngine';
import { ensureIntroAudio } from '../audio';
import { MapPreset, MapSize, MAP_SIZE_DIMENSIONS } from './gameTypes';
import { generateRawTerrain } from './terrain/terragen';
import { tileAt } from './terrain/terrainGrid';
import { TERRAIN_PALETTE } from './terrainAtlas';

const PRESET_INFO: Record<MapPreset, { label: string; blurb: string; emoji: string; forTag: string; sky: string; mid: string; low: string; water?: boolean }> = {
  [MapPreset.Arabia]: {
    label: 'Arabia',
    emoji: '🏜️',
    blurb: 'Open, semi-arid land with scattered oases.',
    forTag: 'Dust and dunes',
    sky: '#451a03', mid: '#9a3412', low: '#c2703d',
  },
  [MapPreset.BlackForest]: {
    label: 'Black Forest',
    emoji: '🌲',
    blurb: 'A dense wall of trees with small clearings.',
    forTag: 'Deep woods',
    sky: '#0c1a2e', mid: '#1e3a2e', low: '#14532d',
  },
  [MapPreset.Coastal]: {
    label: 'Coastal',
    emoji: '🏖️',
    blurb: 'Ocean edge, beaches and mixed terrain.',
    forTag: 'Seabreeze and salt',
    sky: '#0f172a', mid: '#164e63', low: '#0e7490', water: true,
  },
  [MapPreset.Islands]: {
    label: 'Islands',
    emoji: '🏝️',
    blurb: 'A tropical archipelago of many isles.',
    forTag: 'Coral and trade winds',
    sky: '#0c1a2e', mid: '#0e7490', low: '#155e75', water: true,
  },
  [MapPreset.Highland]: {
    label: 'Highland',
    emoji: '🏔️',
    blurb: 'Rugged, river-carved mountain valleys.',
    forTag: 'Stone and high passes',
    sky: '#1e293b', mid: '#334155', low: '#5b6575',
  },
  [MapPreset.Scandinavia]: {
    label: 'Scandinavia',
    emoji: '🧊',
    blurb: 'Cold fjords, pine and many lakes.',
    forTag: 'Frost and fjords',
    sky: '#0f172a', mid: '#334155', low: '#94a3b8', water: true,
  },
  [MapPreset.Meadows]: {
    label: 'Meadows',
    emoji: '🌾',
    blurb: 'Flat, lush lowlands with wide rivers.',
    forTag: 'Green and gentle',
    sky: '#0c1a2e', mid: '#166534', low: '#15803d', water: true,
  },
  [MapPreset.Oasis]: {
    label: 'Oasis',
    emoji: '🌴',
    blurb: 'Desert around a central water source.',
    forTag: 'Life in the sand',
    sky: '#451a03', mid: '#9a3412', low: '#b45309', water: true,
  },
  [MapPreset.Rivers]: {
    label: 'Rivers',
    emoji: '🏞️',
    blurb: 'Land divided by wide waterways.',
    forTag: 'Reeds and slow water',
    sky: '#0c1a2e', mid: '#1e3a5f', low: '#14532d', water: true,
  },
  [MapPreset.Continental]: {
    label: 'Continental',
    emoji: '🌍',
    blurb: 'Every biome on one living continent.',
    forTag: 'The wide world',
    sky: '#0c1a2e', mid: '#4a5a3a', low: '#6a7a4a',
  },
};

/** Real generated-terrain thumbnail — the actual Teraforge engine, deterministic per preset. */
function TerrainPreview({ preset, seed }: { preset: MapPreset; seed: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sky = PRESET_INFO[preset].sky;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // A representative Medium map with a stable per-preset seed — the player sees
    // the preset's real character (rivers, coasts, ranges, forests), not a decal.
    const map = generateRawTerrain(1200, 900, seed, MapSize.Medium, preset);
    const w = map.width;
    const h = map.height;
    canvas.width = w;
    canvas.height = h;
    const img = ctx.createImageData(w, h);
    // Full-map pass, but the cost is bounded to one bake per preset change: `tileAt` caches each
    // projected tile on the map, so the whole thumbnail is projected at most once.
    for (let ty = 0; ty < h; ty++) {
      for (let tx = 0; tx < w; tx++) {
        const tile = tileAt(map, tx, ty);
        if (!tile) continue;
        const c = TERRAIN_PALETTE[tile.type];
        const o = (ty * w + tx) * 4;
        img.data[o] = (c >> 16) & 0xff;
        img.data[o + 1] = (c >> 8) & 0xff;
        img.data[o + 2] = c & 0xff;
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [preset, seed]);

  return (
    <canvas
      ref={canvasRef}
      className="h-20 w-full object-cover"
      style={{ background: sky, imageRendering: 'pixelated' }}
    />
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

  /**
   * Starting a settlement deletes the browser save (`beginNewGameSession` → `deleteSave`), so when a
   * save exists the first activation only arms the confirmation — the shape
   * `SelectedBuildingPanel`'s demolish step already uses for a destructive action. Enter in the name
   * field routes through here too: it used to call `handleStart` directly, so one keystroke while
 * typing a name destroyed a saved colony with no warning.
   */
  const [confirmStartArmed, setConfirmStartArmed] = useState(false);
  const requestStart = () => {
    if (hasSave && !confirmStartArmed) {
      setConfirmStartArmed(true);
      return;
    }
    handleStart();
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
            style={{ width: '40px', height: '40px', flexShrink: 0, imageRendering: 'pixelated' }}
          />
          <div>
            <h1 className="text-sm font-bold tracking-wide text-white sm:text-base">New settlement</h1>
            <p className="text-xs text-stone-300">Choose your valley before the pioneers arrive</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden rounded-full bg-amber-900/40 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-amber-300 ring-1 ring-amber-600/30 sm:inline">
            {GAME_PHASE}
          </span>
          <span className="text-xs text-stone-600">v{GAME_VERSION}</span>
        </div>
      </header>

      <main className="mx-auto my-4 flex w-full max-w-3xl flex-1 flex-col gap-4 overflow-y-auto border border-stone-700/70 bg-stone-900/40 px-4 py-5 sm:gap-5 sm:px-6 sm:py-6">
        {/* The chooser reads as one framed panel (owner request, 2026-09-29): a square border around
            the column, so the preset grid, the size selector and the tips sit inside a visible box
            instead of floating on the full-bleed gradient. The cards inside keep their own rounded
            borders — this frame is the panel's, not theirs. */}
        {/* Settlement name — slim signpost */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-emerald-400">Settlement name</h2>
            <p className="mt-0.5 text-[13px] text-stone-300">Your pioneers will carry this name in the chronicle.</p>
          </div>
          <div className="relative sm:w-64">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm">🏷️</span>
            <input
              type="text"
              value={villageName}
              onChange={(e) => setVillageName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && requestStart()}
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
            <h2 className="text-sm font-bold uppercase tracking-widest text-emerald-400">Choose your land</h2>
            <span className="text-xs text-stone-400">10 lands, each generated live from its seed</span>
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
                  className={`ui-card-hover group relative overflow-hidden rounded-xl border text-left ${
                    selected
                      ? 'border-emerald-400/60 bg-emerald-500/10 ring-2 ring-emerald-500/30 ui-selected'
                      : 'border-stone-700 bg-stone-900/70 hover:border-stone-500 hover:bg-stone-800/80'
                  }`}
                >
                  <TerrainPreview preset={preset} seed={i * 7919 + 3} />
                  <div className="flex items-start gap-2 p-2.5">
                    <span className="mt-0.5 text-lg leading-none">{info.emoji}</span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm font-bold ${selected ? 'text-emerald-200' : 'text-stone-100'}`}>
                        {info.label}
                      </span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-stone-300">{info.blurb}</span>
                      <span className="mt-1 block text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                        {info.forTag}
                      </span>
                    </span>
                  </div>
                  {selected && (
                    <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-xs font-black text-stone-950 shadow">
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
              <h2 className="text-sm font-bold uppercase tracking-widest text-emerald-400">Map size</h2>
              <p className="mt-0.5 text-[13px] text-stone-300">Larger maps mean more wilderness — and more to manage.</p>
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
                    /* The chosen size was stated by background/ring colour alone — unlike the preset
                       cards above, this control carries no visible tick (2026-09-20 audit, A6). */
                    aria-pressed={selected}
                    className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-all ${
                      selected
                        ? 'bg-emerald-500/25 text-emerald-200 ring-1 ring-emerald-500/40'
                        : 'text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    {label}
                    <span className="ml-1 hidden text-[11px] font-normal opacity-70 sm:inline">
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
                <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-emerald-400">
                  💡 Tutorial tips
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-emerald-300 ring-1 ring-emerald-500/30">
                    Tips
                  </span>
                </h2>
                <p className="mt-0.5 text-[13px] text-stone-300">Help cards appear when something new happens.</p>
              </div>
              <label className="flex cursor-pointer items-center gap-2">
                <span className={`text-sm ${tutorialsEnabled !== false ? 'text-stone-200' : 'text-stone-400'}`}>
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
          <section className="rounded-xl border border-stone-700/60 bg-stone-900/70 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-emerald-400">
                  🎓 First-spring guide
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-emerald-300 ring-1 ring-emerald-500/30">
                    Guide
                  </span>
                </h2>
                <p className="mt-0.5 text-[13px] text-stone-300">
                  A step-by-step guide walks you through your first year — build a house, plant food, survive winter. You can skip it anytime.
                </p>
              </div>
              <label className="flex cursor-pointer items-center gap-2">
                <span className={`text-sm ${tutorialChoice !== false ? 'text-emerald-200' : 'text-stone-400'}`}>
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

        <p className="text-center text-xs leading-relaxed text-stone-300">
          Playtest build — bugs and features still in flux. Difficulty scales with the land you pick.
        </p>
      </main>

      <footer className="shrink-0 border-t border-stone-800/80 bg-stone-950/80 px-4 py-4 sm:px-8">
        <div className="mx-auto flex max-w-3xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="order-2 rounded-lg border border-stone-700 px-4 py-2.5 text-sm font-semibold text-stone-400 transition-all hover:border-stone-600 hover:text-stone-200 sm:order-1"
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
            {confirmStartArmed ? (
              <div className="rounded-lg border border-rose-500/40 bg-rose-950/40 p-2">
                <p className="text-[11px] font-semibold text-rose-200">
                  Starting a new settlement deletes your saved colony in this browser. Save it to a
                  file first if you want to keep it — this cannot be undone.
                </p>
                <div className="mt-1.5 grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={handleStart}
                    className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white transition-all hover:bg-rose-500"
                  >
                    Settle anyway
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmStartArmed(false)}
                    className="rounded-lg bg-stone-700 px-4 py-2 text-sm font-bold text-stone-200 transition-all hover:bg-stone-600"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={requestStart}
                className="rounded-lg bg-emerald-600 px-8 py-2.5 text-sm font-bold tracking-wide text-white transition-all hover:bg-emerald-500"
              >
                Settle the valley
              </button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}