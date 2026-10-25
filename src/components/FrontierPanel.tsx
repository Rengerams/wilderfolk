import { memo, useState } from 'react';
import type { WorldState } from '../game/gameTypes';
import CombatPreviewPanel from '../game/CombatPreviewPanel';
import StrategicWorldMap from './StrategicWorldMap';
import {
  canLaunchRaidOnRival,
  canProvokeRival,
  getOutgoingRaidActionLabel,
  formatCampDistance,
  formatRaidDeadline,
  formatRivalPopulationLabel,
  formatRivalRelationshipLabel,
  getCampDistancePixels,
  getCombatPreview,
  getOutgoingRaidFoodCostForRival,
  getRivalRaidStrength,
  isRivalAtPeace,
} from '../game/gameEngine';
import { getBarracksGuardCount, countCompletedDefenseBuildings } from '../game/defenseStructures';
import { BuildingType } from '../game/gameTypes';
import { computeMilitiaBreakdown, getMilitiaArmamentLabel } from '../game/militiaBalance';
import { normalizeRivalProfile, getRivalProfileLabel } from '../game/rivalProfiles';
import { getRivalPresenceSummary } from '../game/rivalPresence';

/**
 * The frontier view's props — exported so the lazy wrapper (`tabPanels/FrontierTabPanel`) reuses
 * this contract instead of restating the six props, where the copy had already drifted on
 * `onFocusRival`'s `buildingId` optionality and `onLaunchRaid`'s optionality.
 */
export interface FrontierPanelProps {
  state: WorldState;
  pendingRaidCount: number;
  pendingOutgoingRaidCount: number;
  pendingDiplomacyCount: number;
  onFocusVisitor: (id: string, x: number, y: number) => void;
  onFocusRival: (id: string, x: number, y: number, buildingId?: number) => void;
  onLaunchRaid?: (rivalId: string) => void;
  onProvokeRival?: (rivalId: string) => void;
  onRecallRaid?: (eventId: string) => void;
}

function FrontierPanel({
  state,
  pendingRaidCount,
  pendingOutgoingRaidCount,
  pendingDiplomacyCount,
  onFocusVisitor,
  onLaunchRaid,
  onProvokeRival,
  onRecallRaid,
}: FrontierPanelProps) {
  const [selectedRivalId, setSelectedRivalId] = useState<string | null>(null);
  const pendingRaids = state.pendingRaidEvents ?? [];
  const firstPendingRaid = pendingRaids[0];
  const pendingDiplomacy = state.pendingDiplomacyEvents ?? [];
  const livingIds = new Set(state.entities.filter((person) => person.alive).map((person) => person.id));
  const hasNeighbors = state.visitorGroups.length > 0 || state.rivalSettlements.length > 0;
  const militia = computeMilitiaBreakdown(state, state.entities);
  const guards = getBarracksGuardCount(state, state.buildings);
  const barracksCount = countCompletedDefenseBuildings(state.buildings, BuildingType.Barracks);
  const wallSegments = countCompletedDefenseBuildings(state.buildings, [
    BuildingType.Wall,
    BuildingType.WallGate,
  ]);
  // The owner covers all five tiers — iron swords and the three shield tiers included — and its
  // multipliers are what `computeMilitiaBreakdown` prints as the strength a line above. The local
  // two-tier ternary that used to live here made a sword-armed (or shield-only) village read
  // "Unarmed adults" beside a non-zero militia strength (`LIVE-FINDINGS-STATUS.md`, F15).
  const armament = getMilitiaArmamentLabel(state) ?? 'Unarmed adults';

  if (!hasNeighbors && pendingRaidCount === 0 && pendingOutgoingRaidCount === 0 && !(state.raidBattleReports?.length)) {
    const year = state.year ?? 0;
    return (
      <div className="space-y-3">
        <StrategicWorldMap state={state} selectedRivalId={selectedRivalId} onSelectRival={setSelectedRivalId} />
      <div className="rounded-xl border border-dashed border-stone-600 bg-stone-800/40 p-4 text-center">
        <p className="text-[13px] text-stone-300">No caravans or rival camps yet.</p>
        <p className="mt-1 text-[13px] text-stone-300">
          Grow your village — trade caravans arrive as reputation spreads.
        </p>
        {/* The rival-camp trigger is population, not the year: `groupEvents`' `WORLD_EVENTS` entry for
            `rival_settlement` is `minHumans: 6, maxRivals: 2` in the yearly pool and carries no year
            condition. That table is module-private, so the 6 is restated here and must track it. */}
        {year < 2 && (
          <p className="mt-2 text-[13px] text-amber-400/90">
            Rival camps can appear once your village reaches 6 population — they arrive with the yearly events.
          </p>
        )}
      </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <StrategicWorldMap state={state} selectedRivalId={selectedRivalId} onSelectRival={setSelectedRivalId} />
      {(state.raidBattleReports?.length ?? 0) > 0 && (
        <section className="rounded-lg border border-amber-600/40 bg-stone-900/70 px-3 py-2 text-[12px]">
          <h4 className="text-[13px] font-bold text-amber-200">Battle aftermath and recovery</h4>
          {state.raidBattleReports!.slice(-5).reverse().map((report) => (
            <details key={report.raidId} className="mt-2 rounded border border-stone-700 px-2 py-1">
              <summary className="cursor-pointer font-semibold text-stone-100">
                {report.side === 'defense' ? 'Defending against' : 'Raiding'} {report.rivalName} · {report.outcome}
              </summary>
              <p className="mt-1 text-stone-300">{report.playerDeaths} villagers lost · {report.enemyDeaths} enemies lost · {report.damagedBuildings} buildings damaged</p>
              <p className="text-stone-400">Supplies lost: {report.suppliesLost.food} food, {report.suppliesLost.wood} wood, {report.suppliesLost.stone} stone, {report.suppliesLost.gold} gold</p>
              <p className="text-stone-400">Leadership merit: {report.leadershipMerit > 0 ? '+' : ''}{report.leadershipMerit}</p>
              {report.playerFallen.length > 0 && <div className="mt-1 text-emerald-300"><strong>Village fallen</strong>{report.playerFallen.map((name, i) => <p key={i}>{name} — killed</p>)}</div>}
              {report.enemyFallen.length > 0 && <div className="mt-1 text-red-300"><strong>Enemy fallen</strong>{report.enemyFallen.map((name, i) => <p key={i}>{name} — killed</p>)}</div>}
              {report.enemyDeaths > report.enemyFallen.length && <p className="text-red-300">Enemy losses without known names: {report.enemyDeaths - report.enemyFallen.length}</p>}
              {report.side === 'defense' && report.outcome !== 'decisive' && <p className="mt-1 text-amber-200">Recovery: inspect damaged buildings, restaff defenses and rebuild supplies.</p>}
            </details>
          ))}
        </section>
      )}

      <div className="rounded-lg border border-slate-600/50 bg-slate-950/40 px-3 py-2">
        <h4 className="mb-1.5 text-[13px] font-bold uppercase tracking-wider text-slate-400">Village readiness</h4>
        <p className="mb-2 text-[10px] leading-relaxed text-stone-300">
          Check the valley map to watch raiding forces and declare war. Stock spears, walls, guards, and tribute food before enemies arrive.
        </p>
        <div className="grid grid-cols-2 gap-1.5 text-[13px]">
          <div className="rounded bg-stone-800/80 px-2 py-1">
            <div className="text-stone-400">Militia</div>
            <strong className="text-emerald-300">{militia.militiaStrength}</strong>
          </div>
          <div className="rounded bg-stone-800/80 px-2 py-1">
            <div className="text-stone-400">Barricade</div>
            <strong className="text-cyan-300">{militia.barricadeStrength}</strong>
          </div>
          <div className="rounded bg-stone-800/80 px-2 py-1">
            <div className="text-stone-400">Guards</div>
            <strong className={guards > 0 ? 'text-violet-300' : 'text-amber-400'}>
              {guards}{barracksCount > 0 ? ` / ${barracksCount} barracks` : ''}
            </strong>
          </div>
          <div className="rounded bg-stone-800/80 px-2 py-1">
            <div className="text-stone-400">Walls</div>
            <strong className="text-stone-300">{wallSegments} seg.</strong>
          </div>
        </div>
        <p className="mt-1.5 text-[10px] text-stone-300">🏹 {armament} · assign guards in Barracks inspector</p>
      </div>

      {(pendingRaidCount > 0 || pendingOutgoingRaidCount > 0 || pendingDiplomacyCount > 0) && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-950/25 px-3 py-2 text-[13px] text-rose-200">
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
          <h4 className="mb-1.5 text-[13px] font-bold uppercase tracking-wider text-cyan-400">Visitors</h4>
          <div className="space-y-1.5">
            {state.visitorGroups.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => onFocusVisitor(g.id, g.campX, g.campY)}
                className="flex w-full items-center justify-between gap-2 rounded-lg bg-stone-800/60 px-2.5 py-2 text-left transition-colors hover:bg-cyan-900/30"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-bold text-cyan-200">🧳 {g.name}</p>
                  <p className="text-[13px] capitalize text-stone-300">
                    {g.kind} · {g.daysLeft}d · click for trade &amp; leader
                  </p>
                </div>
                <span className="shrink-0 text-[13px] text-cyan-500">→</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {state.rivalSettlements.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-[13px] font-bold uppercase tracking-wider text-amber-400">Rival camps</h4>
          <div className="space-y-1.5">
            {state.rivalSettlements.map((r) => {
              const hasRaid = pendingRaids.some((e) => e.rivalId === r.id);
              const hasDiplo = pendingDiplomacy.some((e) => e.rivalId === r.id);
              const warBands = (state.pendingOutgoingRaidEvents ?? []).filter((army) => army.rivalId === r.id);
              const raidEligibility = canLaunchRaidOnRival(state, r);
              const provokeEligibility = canProvokeRival(state, r);
              const raidFoodCost = getOutgoingRaidFoodCostForRival(state, r);
              const outgoingRaidAction = getOutgoingRaidActionLabel(state, r.id);
              const profile = normalizeRivalProfile(r);
              const presence = getRivalPresenceSummary(state, r);
              return (
                <div
                  key={r.id}
                  className={`rounded-lg border px-2.5 py-2 ${selectedRivalId === r.id ? 'border-amber-500 bg-amber-950/40' : 'border-transparent bg-stone-800/60'}`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedRivalId(r.id)}
                    className="flex w-full flex-col gap-1 text-left transition-colors hover:opacity-90"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-[13px] font-bold text-amber-200">🏕️ {r.name}</p>
                      <span className="shrink-0 text-[13px] capitalize text-amber-400">{formatRivalRelationshipLabel(r)}</span>
                    </div>
                    <p className="text-[13px] text-stone-300">
                      {formatRivalPopulationLabel(r)} · {formatCampDistance(getCampDistancePixels(state, state.buildings, r))}
                      · raid {raidFoodCost}🍖
                      {isRivalAtPeace(r) && <span className="text-cyan-400"> · 🕊️ {r.peaceTreatyDays}d</span>}
                    </p>
                    <p className="text-[10px] capitalize text-amber-300/80">{getRivalProfileLabel(profile)} · {presence.stanceLabel}</p>
                    <p className="text-[10px] text-cyan-300/80">Activity: {presence.modeLabel}</p>
                    <p className="text-[10px] text-stone-400">Ledger: {profile.ledger.food} food · {profile.ledger.wood} wood · {profile.ledger.gold} gold · morale {profile.ledger.morale}% · recovery {profile.ledger.recovery}%</p>
                    <p className="text-[10px] text-stone-400">Latest contact: {presence.latestContact}</p>
                    {presence.history.length > 1 && <p className="text-[10px] text-stone-500">History: {presence.history.slice(1, 3).join(' · ')}</p>}
                    {(hasRaid || hasDiplo) && (
                      <p className="text-[10px] font-bold text-rose-400">
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
                    <p className="text-[10px] text-stone-400">Select to highlight this settlement on the strategic map; no village-camera jump.</p>
                  </button>
                  {warBands.map((army) => {
                    const phase = army.phase === 'returning' ? 'Returning' : army.phase === 'fighting' ? 'Battle underway' : army.phase === 'engaging' ? 'Arrived' : 'Marching';
                    const marchingSoldiers = army.soldierIds?.filter((id) => livingIds.has(id)).length ?? 0;
                    const canRecall = onRecallRaid && army.phase !== 'returning' && army.phase !== 'fighting';
                    return (
                      <div key={army.id} className="mt-1.5 flex items-center justify-between gap-2 rounded bg-emerald-950/40 px-2 py-1 text-[10px] text-emerald-200">
                        <span>🏹 {phase} · {marchingSoldiers} soldiers afield</span>
                        {canRecall && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRecallRaid(army.id);
                            }}
                            className="rounded bg-amber-800 px-2 py-0.5 font-bold text-amber-50 hover:bg-amber-700"
                          >
                            Recall
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {onLaunchRaid && (
                    <>
                    {onProvokeRival && (
                      <>
                      <button
                        type="button"
                        disabled={!provokeEligibility.ok}
                        title={provokeEligibility.ok
                          ? 'Declare hostility — relations turn tense (reputation -6) so you can raid them'
                          : provokeEligibility.blockReason}
                        onClick={(e) => {
                          e.stopPropagation();
                          onProvokeRival(r.id);
                        }}
                        className="mt-1.5 w-full rounded bg-rose-950 px-2 py-1 text-[10px] font-bold text-rose-100 hover:bg-rose-900 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        🗡️ Declare hostility
                      </button>
                      {!provokeEligibility.ok && (
                        <p className="mt-0.5 text-[10px] text-stone-400">
                          {provokeEligibility.blockReason}
                        </p>
                      )}
                      </>
                    )}
                    <button
                      type="button"
                      disabled={!raidEligibility.ok}
                      title={raidEligibility.ok ? `March provisions ${raidFoodCost}🍖 · worsens relations` : raidEligibility.blockReason}
                      onClick={(e) => {
                        e.stopPropagation();
                        onLaunchRaid(r.id);
                      }}
                      className="mt-1.5 w-full rounded bg-orange-950 px-2 py-1 text-[10px] font-bold text-orange-100 hover:bg-orange-900 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      🏹 {outgoingRaidAction.buttonLabel} ({raidFoodCost}🍖)
                    </button>
                    {/* A disabled button is not focusable and its title is unreachable on touch. */}
                    {!raidEligibility.ok && (
                      <p className="mt-0.5 text-[10px] text-rose-300">
                        ⚠️ {raidEligibility.blockReason ?? 'Cannot raid'}
                      </p>
                    )}
                    </>
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