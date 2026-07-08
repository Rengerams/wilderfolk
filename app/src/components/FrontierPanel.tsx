import { memo } from 'react';
import type { WorldState } from '../game/gameTypes';
import CombatPreviewPanel from '../game/CombatPreviewPanel';
import {
  canLaunchRaidOnRival,
  getOutgoingRaidActionLabel,
  formatCampDistance,
  formatRaidDeadline,
  formatRivalPopulationLabel,
  formatRivalRelationshipLabel,
  getCampDistancePixels,
  getCombatPreview,
  getOutgoingRaidFoodCostForRival,
  getRivalRaidStrength,
  hasIronSpears,
  hasStoneSpears,
  isRivalAtPeace,
} from '../game/gameEngine';
import { getBarracksGuardCount, countCompletedDefenseBuildings } from '../game/defenseStructures';
import { BuildingType } from '../game/gameTypes';
import { computeMilitiaBreakdown } from '../game/militiaBalance';

interface Props {
  state: WorldState;
  pendingRaidCount: number;
  pendingOutgoingRaidCount: number;
  pendingDiplomacyCount: number;
  onFocusVisitor: (id: string, x: number, y: number) => void;
  onFocusRival: (id: string, x: number, y: number, buildingId?: number) => void;
  onLaunchRaid?: (rivalId: string) => void;
}

function FrontierPanel({
  state,
  pendingRaidCount,
  pendingOutgoingRaidCount,
  pendingDiplomacyCount,
  onFocusVisitor,
  onFocusRival,
  onLaunchRaid,
}: Props) {
  const pendingRaids = state.pendingRaidEvents ?? [];
  const firstPendingRaid = pendingRaids[0];
  const pendingDiplomacy = state.pendingDiplomacyEvents ?? [];
  const hasNeighbors = state.visitorGroups.length > 0 || state.rivalSettlements.length > 0;
  const militia = computeMilitiaBreakdown(state, state.entities);
  const guards = getBarracksGuardCount(state, state.buildings);
  const barracksCount = countCompletedDefenseBuildings(state.buildings, BuildingType.Barracks);
  const wallSegments = countCompletedDefenseBuildings(state.buildings, [
    BuildingType.Wall,
    BuildingType.WallCorner,
    BuildingType.WallGate,
  ]);
  const armament = hasIronSpears(state) ? 'Iron spears' : hasStoneSpears(state) ? 'Stone spears' : 'Unarmed adults';

  if (!hasNeighbors && pendingRaidCount === 0 && pendingOutgoingRaidCount === 0) {
    const year = state.year ?? 0;
    return (
      <div className="rounded-xl border border-dashed border-stone-600 bg-stone-800/40 p-4 text-center">
        <p className="text-[10px] text-stone-400">No caravans or rival camps yet.</p>
        <p className="mt-1 text-[9px] text-stone-500">
          Grow your village — trade caravans arrive as reputation spreads.
        </p>
        {year < 2 && (
          <p className="mt-2 text-[9px] text-amber-400/90">
            Rival camps usually appear from Year 2 onward (you are Year {year}).
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-600/50 bg-slate-950/40 px-3 py-2">
        <h4 className="mb-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">Village readiness</h4>
        <p className="mb-2 text-[8px] leading-relaxed text-stone-500">
          Raids test prep you already made — no battle screen. Stock spears, walls, guards, and tribute food before they arrive.
        </p>
        <div className="grid grid-cols-2 gap-1.5 text-[9px]">
          <div className="rounded bg-stone-800/80 px-2 py-1">
            <div className="text-stone-500">Militia</div>
            <strong className="text-emerald-300">{militia.militiaStrength}</strong>
          </div>
          <div className="rounded bg-stone-800/80 px-2 py-1">
            <div className="text-stone-500">Barricade</div>
            <strong className="text-cyan-300">{militia.barricadeStrength}</strong>
          </div>
          <div className="rounded bg-stone-800/80 px-2 py-1">
            <div className="text-stone-500">Guards</div>
            <strong className={guards > 0 ? 'text-violet-300' : 'text-amber-400'}>
              {guards}{barracksCount > 0 ? ` / ${barracksCount} barracks` : ''}
            </strong>
          </div>
          <div className="rounded bg-stone-800/80 px-2 py-1">
            <div className="text-stone-500">Walls</div>
            <strong className="text-stone-300">{wallSegments} seg.</strong>
          </div>
        </div>
        <p className="mt-1.5 text-[8px] text-stone-500">🏹 {armament} · assign guards in Barracks inspector</p>
      </div>

      {(pendingRaidCount > 0 || pendingOutgoingRaidCount > 0 || pendingDiplomacyCount > 0) && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-950/25 px-3 py-2 text-[9px] text-rose-200">
          {pendingRaidCount > 0 && <p>⚔️ {pendingRaidCount} incoming raid(s) — respond in the map banner</p>}
          {pendingOutgoingRaidCount > 0 && (
            <p className={pendingRaidCount > 0 ? 'mt-0.5' : ''}>
              🏹 {pendingOutgoingRaidCount} war-band(s) at rival camps — accept tribute or fight
            </p>
          )}
          {pendingDiplomacyCount > 0 && (
            <p className={pendingRaidCount > 0 || pendingOutgoingRaidCount > 0 ? 'mt-0.5' : ''}>
              📜 {pendingDiplomacyCount} diplomacy event(s) — respond on map
            </p>
          )}
        </div>
      )}

      {firstPendingRaid && (
        <CombatPreviewPanel
          preview={getCombatPreview(state, {
            attackerStrength: firstPendingRaid.attackerStrength
              ?? (state.rivalSettlements[0] ? getRivalRaidStrength(state.rivalSettlements[0]) : undefined),
            rival: state.rivalSettlements.find((r) => r.id === firstPendingRaid.rivalId)
              ?? state.rivalSettlements[0],
            incomingPayoffFood: firstPendingRaid.lootFood,
          })}
          showOutgoingRaid={false}
          title="⚔️ Incoming raid forecast"
        />
      )}

      {state.visitorGroups.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-cyan-400">Visitors</h4>
          <div className="space-y-1.5">
            {state.visitorGroups.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => onFocusVisitor(g.id, g.campX, g.campY)}
                className="flex w-full items-center justify-between gap-2 rounded-lg bg-stone-800/60 px-2.5 py-2 text-left transition-colors hover:bg-cyan-900/30"
              >
                <div className="min-w-0">
                  <p className="truncate text-[10px] font-bold text-cyan-200">🧳 {g.name}</p>
                  <p className="text-[9px] capitalize text-stone-500">
                    {g.kind} · {g.daysLeft}d · click for trade &amp; leader
                  </p>
                </div>
                <span className="shrink-0 text-[9px] text-cyan-500">→</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {state.rivalSettlements.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-400">Rival camps</h4>
          <div className="space-y-1.5">
            {state.rivalSettlements.map((r) => {
              const hasRaid = pendingRaids.some((e) => e.rivalId === r.id);
              const hasDiplo = pendingDiplomacy.some((e) => e.rivalId === r.id);
              const raidEligibility = canLaunchRaidOnRival(state, r);
              const raidFoodCost = getOutgoingRaidFoodCostForRival(state, r);
              const outgoingRaidAction = getOutgoingRaidActionLabel(state, r.id);
              return (
                <div
                  key={r.id}
                  className="rounded-lg bg-stone-800/60 px-2.5 py-2"
                >
                  <button
                    type="button"
                    onClick={() => onFocusRival(r.id, r.campX, r.campY, r.buildingIds[0])}
                    className="flex w-full flex-col gap-1 text-left transition-colors hover:opacity-90"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-[10px] font-bold text-amber-200">🏕️ {r.name}</p>
                      <span className="shrink-0 text-[9px] capitalize text-amber-400">{formatRivalRelationshipLabel(r)}</span>
                    </div>
                    <p className="text-[9px] text-stone-500">
                      {formatRivalPopulationLabel(r)} · {formatCampDistance(getCampDistancePixels(state, state.buildings, r))}
                      · raid {raidFoodCost}🍖
                      {isRivalAtPeace(r) && <span className="text-cyan-400"> · 🕊️ {r.peaceTreatyDays}d</span>}
                    </p>
                    {(hasRaid || hasDiplo) && (
                      <p className="text-[8px] font-bold text-rose-400">
                        {(() => {
                          const pendingRaid = pendingRaids.find((e) => e.rivalId === r.id);
                          return hasRaid && pendingRaid
                            ? `⚔️ Raid — ${formatRaidDeadline(pendingRaid, state.tick)}`
                            : '';
                        })()}
                        {hasRaid && hasDiplo ? ' · ' : ''}
                        {hasDiplo ? '📜 Diplomacy pending' : ''}
                      </p>
                    )}
                    <p className="text-[8px] text-stone-600">Open camp on map for gifts, peace, diplomacy →</p>
                  </button>
                  {onLaunchRaid && (
                    <button
                      type="button"
                      disabled={!raidEligibility.ok}
                      title={raidEligibility.ok ? `March provisions ${raidFoodCost}🍖 · worsens relations` : raidEligibility.blockReason}
                      onClick={(e) => {
                        e.stopPropagation();
                        onLaunchRaid(r.id);
                      }}
                      className="mt-1.5 w-full rounded bg-orange-950 px-2 py-1 text-[8px] font-bold text-orange-100 hover:bg-orange-900 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      🏹 {outgoingRaidAction.buttonLabel} ({raidFoodCost}🍖)
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(FrontierPanel);