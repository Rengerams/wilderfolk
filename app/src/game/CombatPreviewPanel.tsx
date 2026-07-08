import type { CombatPreview, CounterRaidTier, RaidOutcomeTier } from './frontierCombat';
import {
  COUNTER_RAID_LABELS, COUNTER_RAID_RATIO_HINT, DEFENSE_RATIO_HINT, MILITIA_TIER_HINT,
  RAID_OUTCOME_LABELS, RAID_PREPARATION_HINT,
} from './frontierCombat';

interface Props {
  preview: CombatPreview;
  compact?: boolean;
  /** Show outgoing attack forecast — rival inspector only, not incoming-raid banner */
  showOutgoingRaid?: boolean;
  /** They marched on you first — label as counter-raid instead of a first strike */
  outgoingRaidIsCounter?: boolean;
  title?: string;
}

function OutcomeBadge({ tier, kind }: { tier: RaidOutcomeTier | CounterRaidTier; kind: 'defend' | 'counter' }) {
  const meta = kind === 'defend'
    ? RAID_OUTCOME_LABELS[tier as RaidOutcomeTier]
    : COUNTER_RAID_LABELS[tier as CounterRaidTier];
  const toneClass = meta.tone === 'good'
    ? 'border-emerald-600/40 bg-emerald-950/40 text-emerald-300'
    : meta.tone === 'warn'
      ? 'border-amber-600/40 bg-amber-950/40 text-amber-300'
      : 'border-rose-600/40 bg-rose-950/40 text-rose-300';
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[8px] font-bold ${toneClass}`} title={meta.hint}>
      {meta.label}
    </span>
  );
}

function ratioPct(ratio: number | null): string {
  if (ratio == null) return '—';
  return `${Math.round(ratio * 100)}%`;
}

export default function CombatPreviewPanel({
  preview,
  compact,
  showOutgoingRaid,
  outgoingRaidIsCounter = false,
  title,
}: Props) {
  const outgoingActionLabel = outgoingRaidIsCounter ? 'Counter-raid their camp' : 'Raid their camp';
  const outgoingHeading = outgoingRaidIsCounter
    ? 'If you counter-raid their camp:'
    : 'If you raid their camp:';
  return (
    <div className={`rounded-lg border border-stone-600/50 bg-stone-900/60 ${compact ? 'p-2' : 'p-2.5'}`}>
      <h4 className="mb-1.5 text-[9px] font-bold uppercase tracking-wider text-stone-400">
        {title ?? '⚔️ Raid readiness forecast'}
      </h4>
      {!compact && (
        <p className="mb-2 rounded bg-stone-800/80 px-2 py-1 text-[8px] leading-relaxed text-stone-400">
          {RAID_PREPARATION_HINT}
        </p>
      )}

      {preview.distanceLabel && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-1 rounded bg-stone-800/80 px-2 py-1 text-[9px]">
          <span className="text-stone-500">📍 Distance to camp</span>
          <strong className="text-cyan-300">{preview.distanceLabel}</strong>
        </div>
      )}

      {preview.armamentLabel && (
        <p className="mb-1.5 rounded bg-emerald-950/30 px-2 py-1 text-[8px] font-semibold text-emerald-300/90">
          🏹 {preview.armamentLabel}
        </p>
      )}

      <div className="mb-2 grid grid-cols-2 gap-1.5 text-[9px]">
        <div className="rounded bg-stone-800/80 px-2 py-1">
          <div className="text-stone-500">Your militia</div>
          <strong className="text-lg text-emerald-300">{preview.militiaStrength}</strong>
          <div className="text-stone-500">{preview.militiaCount} adults</div>
        </div>
        <div className="rounded bg-stone-800/80 px-2 py-1">
          <div className="text-stone-500">Rival raid power</div>
          <strong className="text-lg text-rose-300">{preview.rivalStrength ?? '—'}</strong>
          {preview.defendRatio != null && (
            <div className="text-stone-500">Ratio {ratioPct(preview.defendRatio)}</div>
          )}
        </div>
      </div>

      {!compact && (
        <div className="mb-2 space-y-0.5 text-[8px] text-stone-500">
          {preview.breakdown.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      )}

      {preview.rivalStrength != null && (
        <div className="space-y-1 border-t border-stone-700/60 pt-2 text-[9px]">
          <p className="mb-1 text-[8px] font-semibold text-stone-500">If they raid your village:</p>
          <div className="flex flex-wrap items-center justify-between gap-1">
            <span className="text-stone-400">Defend with militia (spears)</span>
            {preview.hasSpears
              ? (preview.defendOutcome
                  ? <OutcomeBadge tier={preview.defendOutcome} kind="defend" />
                  : (
                    <span
                      className="inline-block rounded border border-stone-600/40 bg-stone-800/80 px-1.5 py-0.5 text-[8px] font-bold text-stone-400"
                      title="Militia strength could not be forecast"
                    >
                      Unknown
                    </span>
                  ))
              : <span className="text-rose-400/90">Need stone/iron spears</span>}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-1">
            <span className="text-stone-400">Barricade ({preview.barricadeStrength})</span>
            {preview.barricadeOutcome && <OutcomeBadge tier={preview.barricadeOutcome} kind="defend" />}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-1">
            <span className="text-stone-400">
              Pay them off{preview.incomingPayoffFood != null ? ` (${preview.incomingPayoffFood}🍖)` : ' (food tribute)'}
            </span>
            <span className="text-[8px] text-stone-500">No fight — tribute food, they leave</span>
          </div>
          {preview.incomingPayoffFood != null
            && preview.outgoingRaidFoodCost != null
            && preview.incomingPayoffFood < preview.outgoingRaidFoodCost && (
            <p className="rounded bg-cyan-950/40 px-1.5 py-1 text-[8px] font-semibold text-cyan-300">
              💡 Paying {preview.incomingPayoffFood}🍖 tribute is cheaper than {outgoingRaidIsCounter ? 'counter-raiding' : 'raiding their camp'} ({preview.outgoingRaidFoodCost}🍖 provisions).
            </p>
          )}
          <p className="mt-1 text-[8px] italic text-stone-600">{DEFENSE_RATIO_HINT}</p>
          <p className="text-[8px] italic text-stone-600">{MILITIA_TIER_HINT}</p>
          {showOutgoingRaid && (
            <>
              <p className="mb-0.5 mt-1.5 text-[8px] font-semibold text-stone-500">{outgoingHeading}</p>
              {preview.counterRaidRivalStrength != null && (
                <p className="mb-1 text-[8px] text-stone-500">
                  Their camp defense: <strong className="text-rose-300">{preview.counterRaidRivalStrength}</strong>
                  {preview.counterRaidRatio != null && (
                    <span> · your ratio {ratioPct(preview.counterRaidRatio)}</span>
                  )}
                </p>
              )}
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="text-stone-400">
                  {outgoingActionLabel}{preview.outgoingRaidFoodCost != null ? ` (${preview.outgoingRaidFoodCost}🍖)` : ''}
                </span>
                {preview.canCounterRaid && preview.counterRaidOutcome
                  ? <OutcomeBadge tier={preview.counterRaidOutcome} kind="counter" />
                  : (
                    <span className="text-rose-400/90">
                      {preview.counterRaidBlockReason ?? 'Cannot raid yet'}
                    </span>
                  )}
              </div>
              <p className="mt-1 text-[8px] italic text-stone-600">{COUNTER_RAID_RATIO_HINT}</p>
            </>
          )}
        </div>
      )}

      {!preview.hasSpears && (
        <p className="mt-1.5 text-[8px] text-amber-400/90">Research Stone Spears (Defense) to unlock militia defense & raids.</p>
      )}
    </div>
  );
}