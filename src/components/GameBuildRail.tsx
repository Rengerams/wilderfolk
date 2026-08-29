import { lazy, Suspense } from 'react';
import type { WorldState } from '../game/gameEngine';
import type { BuildingType } from '../game/gameTypes';
import { getBuildingConfig } from '../game/buildingConfig';
import { BUILDING_HOTKEYS } from '../game/hotkeys';

const BuildCatalogPanel = lazy(() => import('./BuildCatalogPanel'));

type GameBuildRailProps = {
  world: WorldState;
  buildPanelOpen: boolean;
  selectedBuildingType: BuildingType | null;
  showGrid: boolean;
  onToggleOpen: () => void;
  onOpen: () => void;
  onSelect: (type: BuildingType) => void;
  onLocked: (type: BuildingType) => void;
  onCancel: () => void;
  onToggleGrid: () => void;
};

/** Presentation-only build rail; App remains the owner of build and shell state. */
export default function GameBuildRail({
  world,
  buildPanelOpen,
  selectedBuildingType,
  showGrid,
  onToggleOpen,
  onOpen,
  onSelect,
  onLocked,
  onCancel,
  onToggleGrid,
}: GameBuildRailProps) {
  return (
    <aside className={`build-panel game-view-drawer game-view-drawer--build flex flex-col ${buildPanelOpen ? 'game-view-drawer--open' : 'game-view-drawer--rail'}`}>
      <button
        onClick={onToggleOpen}
        className="build-panel-toggle absolute -right-3 top-5 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-stone-600 bg-stone-850 text-sm font-bold text-stone-300 shadow-lg transition-all hover:border-emerald-500/50 hover:bg-stone-700 hover:text-emerald-300"
        title={buildPanelOpen ? 'Close build catalogue (B)' : 'Open build catalogue (B)'}
        aria-label={buildPanelOpen ? 'Close build catalogue' : 'Open build catalogue'}
        aria-expanded={buildPanelOpen}
      >
        {buildPanelOpen ? '‹' : '›'}
      </button>
      {buildPanelOpen ? (
        <Suspense fallback={<p className="p-3 text-xs text-stone-300">Loading build catalog…</p>}>
          <BuildCatalogPanel
            world={world}
            selected={selectedBuildingType}
            showGrid={showGrid}
            hotkeys={BUILDING_HOTKEYS}
            onSelect={onSelect}
            onLocked={onLocked}
            onCancel={onCancel}
            onToggleGrid={onToggleGrid}
          />
        </Suspense>
      ) : (
        <div className="flex h-full flex-col items-center gap-2 py-3">
          <span className="text-base" title="Build catalog on the left · press B">🏗️</span>
          <button
            onClick={onToggleGrid}
            className={`flex h-9 w-9 items-center justify-center rounded-lg border text-sm transition-all ${showGrid ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300' : 'border-stone-700 bg-stone-800/80 text-stone-400 hover:border-stone-600 hover:text-stone-300'}`}
            title="Toggle grid (G)"
          >
            ⊞
          </button>
          {selectedBuildingType && (
            <>
              <div className="my-0.5 h-px w-7 bg-stone-700" />
              <button
                onClick={onCancel}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-rose-800/50 bg-rose-950/40 text-xs text-rose-300 hover:bg-rose-900/50"
                title={`Cancel ${getBuildingConfig(selectedBuildingType).label} (ESC)`}
              >
                ✕
              </button>
            </>
          )}
          <button
            onClick={onOpen}
            className="mt-auto flex h-8 w-8 items-center justify-center rounded-lg border border-stone-700 bg-stone-800/80 text-stone-400 hover:border-emerald-500/40 hover:text-emerald-300"
            title="Full build catalog (B)"
          >
            »
          </button>
        </div>
      )}
    </aside>
  );
}
