import type { WorldState } from '../game/gameTypes';
import {
  getWorkforcePolicy,
  getWorkforceFocus,
  WORKFORCE_FOCUS_OPTIONS,
  type WorkforceFocusSector,
  getWorkforcePresetDescription,
  getWorkforcePresetLabel,
  WORKFORCE_PRESET_OPTIONS,
  type WorkforcePreset,
} from '../game/workforcePolicy';

interface Props {
  state: WorldState;
  onApply: (preset: WorkforcePreset) => void;
  onSetFocus: (sector: WorkforceFocusSector, enabled: boolean) => void;
}

/**
 * Workforce policy presets. The panel restates no ordering or preset copy:
 * `workforcePolicy.ts` is the single definition of both.
 */
export default function WorkforcePolicyPanel({ state, onApply, onSetFocus }: Props) {
  const current = getWorkforcePolicy(state);
  const focused = getWorkforceFocus(state);

  return (
    <div className="space-y-3 text-sm text-stone-300">
      <div>
        <p className="font-semibold text-stone-100">Workforce policy</p>
        <p className="mt-1 text-xs leading-relaxed text-stone-400">
          The preset sets the normal hiring order. Sector buttons below let you redirect safe
          surplus staffing to the jobs your settlement currently needs most.
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
        <p className="font-semibold text-stone-100">Sector priorities</p>
        <p className="mt-1 text-stone-400">
          Choose any combination. Priority sectors get extra workers ahead of lower-priority jobs,
          while keeping essential staff. Ten pupils at one school call for a second teacher.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {WORKFORCE_FOCUS_OPTIONS.map(({ sector, label, description }) => {
            const active = focused.includes(sector);
            return (
              <button
                key={sector}
                type="button"
                title={description}
                aria-pressed={active}
                onClick={() => onSetFocus(sector, !active)}
                className={`rounded border px-2 py-2 text-xs font-semibold ${
                  active
                    ? 'border-amber-400/70 bg-amber-900/40 text-amber-200'
                    : 'border-stone-600 bg-stone-950 text-stone-300 hover:border-stone-400'
                }`}
              >
                {label} {active ? 'On' : 'Off'}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-stone-500">
          Changes trigger an immediate staffing pass. Workers only transfer between reachable posts;
          essential food and guard coverage stays protected.
        </p>
      </div>
      <div className="rounded border border-stone-700/70 bg-stone-900/40 px-2.5 py-2 text-xs">
        <div className="flex items-center justify-between">
          <span>Current</span>
          <strong className="text-emerald-300">{getWorkforcePresetLabel(current)}</strong>
        </div>
        <p className="mt-1 text-stone-400">{getWorkforcePresetDescription(current)}</p>
        <p className="mt-1 text-stone-500">
          Completed workplaces are staffed automatically; worker transfers preserve essential coverage.
        </p>
      </div>
    </div>
  );
}
