import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import RoadmapPanel from '../game/RoadmapPanel';

type VolumePreset = 'soft' | 'normal' | 'loud';
type MenuView = 'main' | 'settings' | 'graphics' | 'roadmap' | 'about';

interface Props {
  gameTitle: string;
  gameVersion: string;
  gamePhase: string;
  gameSubtitle: string;
  hasSavedGame: boolean;
  autoSave: boolean;
  tutorialsEnabled: boolean;
  juiceEffectsEnabled: boolean;
  muted: boolean;
  volumePreset: VolumePreset;
  onSave: () => void;
  onLoad: () => void;
  onToggleAutoSave: () => void;
  onToggleTutorials: () => void;
  onToggleJuiceEffects: () => void;
  onToggleMute: () => void;
  onVolumePreset: (v: VolumePreset) => void;
  onOpenGuide: () => void;
  onStartNewGame: () => void;
}

function MenuSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-1">
      <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-stone-500">
        {title}
      </p>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

function MenuAction({
  icon,
  label,
  hint,
  onClick,
  variant = 'default',
  trailing,
  disabled = false,
}: {
  icon: string;
  label: string;
  hint?: string;
  onClick: () => void;
  variant?: 'default' | 'danger';
  trailing?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        variant === 'danger'
          ? 'text-rose-300 hover:bg-rose-950/50'
          : 'text-stone-200 hover:bg-stone-700/60'
      }`}
    >
      <span className="w-5 shrink-0 text-center text-sm" aria-hidden>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold">{label}</span>
        {hint && <span className="block text-[10px] text-stone-500">{hint}</span>}
      </span>
      {trailing && <span className="shrink-0 text-[10px] text-stone-500">{trailing}</span>}
    </button>
  );
}

function MenuToggle({
  icon,
  label,
  hint,
  checked,
  onChange,
}: {
  icon: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-stone-700/40"
    >
      <span className="w-5 shrink-0 text-center text-sm" aria-hidden>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-stone-200">{label}</span>
        {hint && <span className="block text-[10px] text-stone-500">{hint}</span>}
      </span>
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-emerald-600' : 'bg-stone-600'
        }`}
        aria-hidden
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  );
}

const VOLUME_OPTIONS: { id: VolumePreset; label: string }[] = [
  { id: 'soft', label: 'Soft' },
  { id: 'normal', label: 'Normal' },
  { id: 'loud', label: 'Loud' },
];

const VIEW_TITLES: Record<MenuView, string> = {
  main: 'Menu',
  settings: 'Settings',
  graphics: 'Graphics',
  roadmap: 'Roadmap',
  about: 'About',
};

export default function GameMenu({
  gameTitle,
  gameVersion,
  gamePhase,
  gameSubtitle,
  hasSavedGame,
  autoSave,
  tutorialsEnabled,
  juiceEffectsEnabled,
  muted,
  volumePreset,
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
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<MenuView>('main');
  const [anchor, setAnchor] = useState({ top: 0, right: 0 });
  const portalRoot = typeof document !== 'undefined' ? document.body : null;
  const buttonRef = useRef<HTMLButtonElement>(null);

  const close = () => {
    setOpen(false);
    setView('main');
  };

  const updateAnchor = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setAnchor({ top: rect.bottom + 6, right: Math.max(8, window.innerWidth - rect.right) });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updateAnchor();
    window.addEventListener('resize', updateAnchor);
    window.addEventListener('scroll', updateAnchor, true);
    return () => {
      window.removeEventListener('resize', updateAnchor);
      window.removeEventListener('scroll', updateAnchor, true);
    };
  }, [open, view]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (view !== 'main') setView('main');
      else close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, view]);

  const panelWidth = view === 'main' ? 'w-64' : 'w-72';

  const menuPanel = open ? (
    <>
      <div className="fixed inset-0 z-[190]" aria-hidden onClick={close} />
      <div
        className={`fixed z-[200] ${panelWidth} flex max-h-[min(75vh,560px)] flex-col overflow-hidden rounded-xl border border-stone-600 bg-stone-900 shadow-2xl`}
        style={{ top: anchor.top, right: anchor.right }}
        role="menu"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-stone-700 px-3 py-2.5">
          {view !== 'main' && (
            <button
              type="button"
              onClick={() => setView('main')}
              className="rounded-md px-1.5 py-0.5 text-[11px] font-bold text-stone-400 hover:bg-stone-800 hover:text-stone-200"
              aria-label="Back to main menu"
            >
              ←
            </button>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-white">{VIEW_TITLES[view]}</p>
            {view === 'main' && (
              <p className="text-[10px] text-stone-500">Save, settings & info</p>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {view === 'main' && (
            <>
              <MenuSection title="Game">
                <MenuAction
                  icon="🌱"
                  label="Start new game"
                  hint="Pick map & settlement name"
                  onClick={() => { onStartNewGame(); close(); }}
                />
                <MenuAction
                  icon="📂"
                  label="Load game"
                  hint={hasSavedGame ? 'Restore last manual save' : 'Save a game first'}
                  disabled={!hasSavedGame}
                  onClick={() => { onLoad(); close(); }}
                />
                <MenuAction
                  icon="💾"
                  label="Save game"
                  hint="Also exports chronicle if enabled"
                  onClick={() => { onSave(); close(); }}
                />
              </MenuSection>

              <div className="mx-3 h-px bg-stone-700" />

              <MenuSection title="Options">
                <MenuAction
                  icon="⚙️"
                  label="Settings"
                  hint="Audio, tutorials & auto-save"
                  trailing="›"
                  onClick={() => setView('settings')}
                />
                <MenuAction
                  icon="🎨"
                  label="Graphics"
                  hint="Screen effects & visuals"
                  trailing="›"
                  onClick={() => setView('graphics')}
                />
              </MenuSection>

              <div className="mx-3 h-px bg-stone-700" />

              <MenuSection title="Info">
                <MenuAction
                  icon="🗺️"
                  label="Roadmap"
                  hint="What we're building next"
                  trailing="›"
                  onClick={() => setView('roadmap')}
                />
                <MenuAction
                  icon="ℹ️"
                  label="About"
                  hint={`${gameTitle} · v${gameVersion}`}
                  trailing="›"
                  onClick={() => setView('about')}
                />
              </MenuSection>

            </>
          )}

          {view === 'settings' && (
            <div className="pb-2">
              <MenuSection title="Gameplay">
                <MenuToggle
                  icon="⟳"
                  label="Auto-save"
                  hint="Every 30 seconds when enabled"
                  checked={autoSave}
                  onChange={onToggleAutoSave}
                />
                <MenuToggle
                  icon="💡"
                  label="Tutorials"
                  hint="Tips when new events happen"
                  checked={tutorialsEnabled}
                  onChange={onToggleTutorials}
                />
              </MenuSection>

              <div className="mx-3 h-px bg-stone-700" />

              <MenuSection title="Audio">
                <MenuToggle
                  icon={muted ? '🔇' : '🔊'}
                  label={muted ? 'Muted' : 'Sound on'}
                  hint="Music, ambience & effects"
                  checked={!muted}
                  onChange={onToggleMute}
                />
                <div className={`px-3 pb-2 pt-1 ${muted ? 'pointer-events-none opacity-40' : ''}`}>
                  <p className="mb-1.5 text-[10px] font-medium text-stone-500">Volume</p>
                  <div className="flex gap-1 rounded-lg bg-stone-800 p-0.5">
                    {VOLUME_OPTIONS.map(({ id, label }) => (
                      <button
                        key={id}
                        type="button"
                        disabled={muted}
                        onClick={() => onVolumePreset(id)}
                        className={`flex-1 rounded-md py-1 text-[10px] font-bold transition-colors ${
                          volumePreset === id
                            ? 'bg-stone-600 text-white shadow-sm'
                            : 'text-stone-400 hover:text-stone-200'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </MenuSection>
            </div>
          )}

          {view === 'graphics' && (
            <div className="pb-2">
              <MenuSection title="Display">
                <MenuToggle
                  icon="✨"
                  label="Screen effects"
                  hint="Camera nudge & juice on select"
                  checked={juiceEffectsEnabled}
                  onChange={onToggleJuiceEffects}
                />
              </MenuSection>
              <p className="px-3 py-2 text-[10px] leading-relaxed text-stone-500">
                Turn off screen effects if the map feels too busy or you prefer a calmer view.
                More display options may arrive in a future update.
              </p>
            </div>
          )}

          {view === 'roadmap' && (
            <div className="p-2">
              <RoadmapPanel />
            </div>
          )}

          {view === 'about' && (
            <div className="space-y-3 p-3 text-[10px] text-stone-300">
              <div className="flex items-center gap-2.5">
                <img
                  src="/logo.png"
                  alt=""
                  className="h-10 w-10 rounded-md object-contain ring-1 ring-amber-500/30"
                />
                <div>
                  <p className="text-sm font-bold text-white">{gameTitle}</p>
                  <p className="text-[10px] text-stone-500">{gameSubtitle}</p>
                </div>
              </div>

              <div className="rounded-lg border border-amber-700/40 bg-amber-950/20 p-2.5">
                <p className="text-xs font-bold text-amber-300">{gamePhase} · v{gameVersion}</p>
                <p className="mt-1 leading-relaxed text-stone-400">
                  Playtest build — expect bugs, rough edges, and features that change.
                  Saves may break between updates.
                </p>
              </div>

              <p className="leading-relaxed text-stone-400">
                A sandbox frontier sim where your village lives inside a real food chain —
                grass, prey, predators, rivals, and winter all push back.
              </p>

              <button
                type="button"
                onClick={() => { onOpenGuide(); close(); }}
                className="w-full rounded-lg border border-stone-600 px-3 py-2 text-[10px] font-semibold text-stone-300 hover:border-stone-500 hover:text-white"
              >
                📖 Open full guide
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  ) : null;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold transition-colors ${
          open
            ? 'bg-stone-600 text-white'
            : 'bg-stone-700 text-stone-300 hover:bg-stone-600 hover:text-white'
        }`}
        title="Game menu"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <span aria-hidden>☰</span>
        <span className="hidden sm:inline">Menu</span>
      </button>

      {menuPanel && portalRoot && createPortal(menuPanel, portalRoot)}
    </div>
  );
}