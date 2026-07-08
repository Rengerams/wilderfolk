import { useState } from 'react';
import { BUILDING_CONFIGS, BuildingType } from '../game/gameEngine';
import type { WorldState } from '../game/gameTypes';
import {
  BUILDING_CATEGORIES,
  categoryForBuildingType,
  formatBuildingCost,
} from '../game/buildCatalog';
import { isRotatableBuildingType } from '../game/buildingRotation';

interface Props {
  world: WorldState;
  selected: BuildingType | null;
  buildRotation: number;
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
  buildRotation,
  showGrid,
  hotkeys,
  onSelect,
  onLocked,
  onCancel,
  onToggleGrid,
}: Props) {
  const [manualCategory, setManualCategory] = useState(BUILDING_CATEGORIES[0].id);
  const activeCategory = selected != null
    ? categoryForBuildingType(selected)
    : manualCategory;

  const category = BUILDING_CATEGORIES.find((c) => c.id === activeCategory) ?? BUILDING_CATEGORIES[0];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b border-stone-700/80 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-white">Build</h2>
            <p className="text-[11px] text-stone-500">{category.label}</p>
          </div>
          {selected && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg bg-rose-900/45 px-2 py-1 text-[11px] font-bold text-rose-200 hover:bg-rose-800/55"
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
                <span className="text-base leading-none">{cat.icon}</span>
              </button>
            );
          })}
        </nav>

        <div className="min-w-0 flex-1 overflow-y-auto p-2">
          {category.hint && (
            <p className="mb-2 rounded-lg bg-stone-800/60 px-2 py-1.5 text-[10px] leading-relaxed text-stone-500">
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
              const lockTech = locked && config.unlockRequirement
                ? world.researchNodes.find((n) => n.id === config.unlockRequirement)
                : undefined;
              const hotkey = hotkeys[type];
              const cost = formatBuildingCost(config.cost.wood, config.cost.stone, config.cost.gold);

              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => (locked ? onLocked(type) : onSelect(type))}
                  title={`${config.description}${hotkey ? ` · key ${hotkey}` : ''}`}
                  className={`flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-all ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-500/20 shadow-md shadow-emerald-500/10'
                      : locked
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
                        <span className="rounded bg-stone-900 px-1.5 py-px text-[10px] font-bold text-emerald-400">
                          {hotkey}
                        </span>
                      )}
                      {locked && <span className="text-[10px]" title="Locked">🔒</span>}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-stone-500">{cost}</span>
                    {locked && lockTech && (
                      <span className="mt-0.5 block text-[10px] font-medium text-amber-500/90">
                        Needs {lockTech.name}
                      </span>
                    )}
                    {!locked && (
                      <span className="mt-0.5 block text-[10px] leading-snug text-stone-600">
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
        <div className="shrink-0 border-t border-stone-700/80 p-2">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-[11px] text-emerald-200">
            <p className="font-bold">Placing: {BUILDING_CONFIGS[selected].label}</p>
            <p className="mt-1 text-stone-400">Click map to place · ESC to cancel</p>
            {isRotatableBuildingType(selected) && (
              <p className="mt-1 text-stone-400">
                <span className="font-bold text-emerald-400">R</span> rotate ({buildRotation === 90 ? 'vertical' : 'horizontal'})
              </p>
            )}
          </div>
        </div>
      )}

      <div className="shrink-0 border-t border-stone-700/80 p-2">
        <button
          type="button"
          onClick={onToggleGrid}
          className={`w-full rounded-xl border px-3 py-2.5 text-xs font-bold transition-all ${
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