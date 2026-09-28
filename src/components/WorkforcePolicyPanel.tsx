import type { WorldState } from '../game/gameTypes';
import {
  getWorkforcePolicy,
  getWorkforcePresetDescription,
  getWorkforcePresetLabel,
  WORKFORCE_PRESET_OPTIONS,
  type WorkforcePreset,
} from '../game/workforcePolicy';

interface Props {
  state: WorldState;
  onApply: (preset: WorkforcePreset) => void;
}

/**
 * Workforce policy presets — roadmap F3.
 *
 * The panel restates no ordering and no preset copy: everything it renders comes from
 * `workforcePolicy.ts`, which is the single definition. Selecting the current preset is a
 * no-op (the command owner returns the same state unchanged, so no delta is produced).
 */
export default function WorkforcePolicyPanel({ state, onApply }: Props) {
  const current = getWorkforcePolicy(state);

  return (
    <div className="space-y-3 text-sm text-stone-300">
      <div>
        <p className="font-semibold text-stone-100">Workforce policy</p>
        <p className="mt-1 text-xs leading-relaxed text-stone-400">
          Steers which workplace receives the next idle settler during auto-staffing. Manual
          assignments always outrank the preset, and removing a worker is never blocked by it.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {WORKFORCE_PRESET_OPTIONS.map(({ preset, label, description }) => {
          const isCurrent = preset === current;
          return (
            <button
              key={preset}
              type="button"
              title={description}
              aria-pressed={isCurrent}
              disabled={isCurrent}
              onClick={() => onApply(preset)}
              className={`rounded border px-2 py-2 text-xs font-bold ${
                isCurrent
                  ? 'border-emerald-500/60 bg-emerald-900/40 text-emerald-200'
                  : 'border-stone-600 bg-stone-900 text-stone-300 hover:border-stone-500 hover:text-stone-100'
              } disabled:cursor-default`}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div className="rounded border border-stone-700/70 bg-stone-900/40 px-2.5 py-2 text-xs">
        <div className="flex items-center justify-between">
          <span>Current</span>
          <strong className="text-emerald-300">{getWorkforcePresetLabel(current)}</strong>
        </div>
        <p className="mt-1 text-stone-400">{getWorkforcePresetDescription(current)}</p>
        <p className="mt-1 text-stone-500">
          A manual assignment or a manual-staffing workplace still overrides this preset.
        </p>
      </div>
    </div>
  );
}
