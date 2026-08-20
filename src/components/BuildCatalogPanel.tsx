import { useState } from 'react';
import { BUILDING_CONFIGS, BuildingType } from '../game/gameEngine';
import type { WorldState } from '../game/gameTypes';
import {
  BUILDING_CATEGORIES,
  categoryForBuildingType,
} from '../game/buildCatalog';
import Emoji from './Emoji';
import ResourceCost from './ResourceCost';

interface Props {
  world: WorldState;
  selected: BuildingType | null;
  showGrid: boolean;
  hotkeys: Partial<Record<BuildingType, string>>;
  onSelect: (type: BuildingType) => void;
  onLocked: (type: BuildingType) => void;
  onCancel: () => void;
  onToggleGrid: () => void;
}

export default function BuildCatalogPanel({
  world,
  selected,
  showGrid,
  hotkeys,
  onSelect,
  onLocked,
  onCancel,
  onToggleGrid,
}: Props) {
  const [manualCategory, setManualCategory] = useState(BUILDING_CATEGORIES[0].id);

  // React to a changed selection without an effect (adjust-state-during-render):
  // selecting a build jumps the category tab to it, but the user stays free to
  // navigate other tabs while a build is selected (previously the tab was
  // pinned to the selected type, so you could never switch to another category
  // without cancelling first — "can't change build type while one is selected").
  const [prevSelected, setPrevSelected] = useState<BuildingType | null>(null);
  if (selected !== prevSelected) {
    setPrevSelected(selected);
    if (selected != null) setManualCategory(categoryForBuildingType(selected));
  }

  const activeCategory = manualCategory;

  const category = BUILDING_CATEGORIES.find((c) => c.id === activeCategory) ?? BUILDING_CATEGORIES[0];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b border-stone-700/80 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-white">Build</h2>
            <p className="text-[13px] text-stone-300">{category.label}</p>
          </div>
          {selected && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg bg-rose-900/45 px-2 py-1 text-[13px] font-bold text-rose-200 hover:bg-rose-800/55"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <nav
          className="flex w-11 shrink-0 flex-col gap-1 border-r border-stone-700/70 bg-stone-900/50 p-1"
          aria-label="Building categories"
        >
          {BUILDING_CATEGORIES.map((cat) => {
            const isActive = cat.id === activeCategory;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setManualCategory(cat.id)}
                title={cat.label}
                aria-label={cat.label}
                aria-current={isActive ? 'true' : undefined}
                className={`flex h-10 w-full flex-col items-center justify-center rounded-lg border transition-all ${
                  isActive
                    ? 'border-emerald-500/55 bg-emerald-500/20 text-emerald-200'
                    : 'border-transparent text-stone-400 hover:border-stone-600 hover:bg-stone-800 hover:text-stone-200'
                }`}
              >
                <Emoji className="text-base">{cat.icon}</Emoji>
              </button>
            );
          })}
        </nav>

        <div className="min-w-0 flex-1 overflow-y-auto p-2">
          {category.hint && (
            <p className="mb-2 rounded-lg bg-stone-800/60 px-2 py-1.5 text-xs leading-relaxed text-stone-300">
              {category.hint}
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            {category.types.map((type) => {
              const config = BUILDING_CONFIGS[type];
              if (!config) return null;
              const isSelected = selected === type;
              const affordable = world.resources.wood >= config.cost.wood
                && world.resources.stone >= config.cost.stone
                && world.resources.gold >= config.cost.gold;
              const locked = config.unlockRequirement
                && !world.unlockedTechs.includes(config.unlockRequirement);
              const uniqueBuilt = !!config.unique && world.buildings.some((b) => b.type === type);
              const lockTech = locked && config.unlockRequirement
                ? world.researchNodes.find((n) => n.id === config.unlockRequirement)
                : undefined;
              const hotkey = hotkeys[type];

              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => (uniqueBuilt ? undefined : locked ? onLocked(type) : onSelect(type))}
                  disabled={uniqueBuilt}
                  title={uniqueBuilt ? `Only one ${config.label} per village — already built` : `${config.description}${hotkey ? ` · key ${hotkey}` : ''}`}
                  className={`flex w-full items-center gap-2.5 rounded-xl border-2 px-2.5 py-2 text-left transition-all ${
                    isSelected
                      ? 'border-emerald-400 bg-emerald-500/25 shadow-md shadow-emerald-500/20 ring-1 ring-emerald-400/40'
                      : locked || uniqueBuilt
                        ? 'border-stone-700 bg-stone-800/50 opacity-50'
                        : affordable
                          ? 'border-stone-600 bg-stone-800/70 hover:border-emerald-500/45 hover:bg-stone-800'
                          : 'border-stone-700 bg-stone-800/50 opacity-70'
                  }`}
                >
                  <img
                    src={config.sprite}
                    alt=""
                    className="h-10 w-10 shrink-0 object-contain"
                    style={{ imageRendering: 'pixelated' }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className={`text-sm font-bold leading-tight ${isSelected ? 'text-emerald-100' : 'text-stone-100'}`}>
                        {config.label}
                      </span>
                      {hotkey && (
                        <span className="rounded bg-stone-900 px-1.5 py-px text-xs font-bold text-emerald-400">
                          {hotkey}
                        </span>
                      )}
                      {locked && <span className="text-xs" title="Locked">🔒</span>}
                    </span>
                    <ResourceCost
                      cost={{ wood: config.cost.wood, stone: config.cost.stone, gold: config.cost.gold }}
                      className="mt-0.5"
                      iconClassName="h-2.5 w-2.5"
                      amountClassName="font-mono text-xs font-semibold leading-none"
                    />
                    {locked && lockTech && (
                      <span className="mt-0.5 block text-xs font-medium text-amber-500/90">
                        Needs {lockTech.name}
                      </span>
                    )}
                    {uniqueBuilt && (
                      <span className="mt-0.5 block text-xs font-medium text-amber-500/90">
                        Already built — one per village
                      </span>
                    )}
                    {!locked && (
                      <span className="mt-0.5 block text-xs leading-relaxed text-stone-400">
                        {config.description}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {selected && BUILDING_CONFIGS[selected] && (
        <div className="shrink-0 border-t border-stone-700/60 bg-stone-900/40 p-1.5">
          <p className="text-center text-[11px] font-medium text-stone-300">
            Placing {BUILDING_CONFIGS[selected].label} — <kbd className="rounded bg-stone-800 px-1 text-stone-400">Esc</kbd> or right-click stops
          </p>
        </div>
      )}

      <div className="shrink-0 border-t border-stone-700/80 p-2">
        <button
          type="button"
          onClick={onToggleGrid}
          className={`w-full rounded-xl border px-3 py-2.5 text-sm font-bold transition-all ${
            showGrid
              ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-300'
              : 'border-stone-700 bg-stone-800 text-stone-400 hover:border-stone-600 hover:text-stone-300'
          }`}
          title="Toggle placement grid (G)"
        >
          {showGrid ? '⊞ Grid on' : '⊞ Grid off'}
        </button>
      </div>
    </div>
  );
}