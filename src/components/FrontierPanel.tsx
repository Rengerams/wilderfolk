import { projectFrontierPanel } from '../game/frontierPanelView';
import { RIVAL_FOUNDING_START_DAY, RIVAL_FOUNDING_INTERVAL_DAYS, MIN_RIVAL_FOUNDING_POPULATION, MAX_STRATEGIC_SETTLEMENTS } from '../game/rivalSettlements';

/**
 * The frontier view's props — the lazy wrapper (`tabPanels/FrontierTabPanel`) reuses this contract.
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
  const view = projectFrontierPanel(state, {
    pendingRaidCount,
    pendingOutgoingRaidCount,
    pendingDiplomacyCount,
  });

  if (view.isEmpty) {
    return (
      <div className="space-y-3">
        <StrategicWorldMap state={state} selectedRivalId={selectedRivalId} onSelectRival={setSelectedRivalId} />
      <div className="rounded-xl border border-dashed border-stone-600 bg-stone-800/40 p-4 text-center">
        <p className="text-[13px] text-stone-300">No caravans or rival camps yet.</p>
        <p className="mt-1 text-[13px] text-stone-300">
          Grow your village — trade caravans arrive as reputation spreads.
        </p>
        <p className="mt-2 text-[13px] text-amber-400/90">
          From day {RIVAL_FOUNDING_START_DAY}, settlements can appear on the world map every{' '}
          {RIVAL_FOUNDING_INTERVAL_DAYS} days once your village reaches{' '}
          {MIN_RIVAL_FOUNDING_POPULATION} population, up to {MAX_STRATEGIC_SETTLEMENTS} friends and rivals combined.
        </p>
      </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <StrategicWorldMap state={state} selectedRivalId={selectedRivalId} onSelectRival={setSelectedRivalId} />
      {view.battleReports.length > 0 && (
        <section className="rounded-lg border border-amber-600/40 bg-stone-900/70 px-3 py-2 text-[12px]">
          <h4 className="text-[13px] font-bold text-amber-200">Battle aftermath and recovery</h4>
          {view.battleReports.map((report) => (
            <details key={report.raidId} className="mt-2 rounded border border-stone-700 px-2 py-1">
              <summary className="cursor-pointer font-semibold text-stone-100">
                {report.sideLabel} {report.rivalName} · {report.outcome}
              </summary>
              <p className="mt-1 text-stone-300">{report.playerDeaths} villagers lost · {report.enemyDeaths} enemies lost · {report.damagedBuildings} buildings damaged</p>
              <p className="text-stone-400">Supplies lost: {report.suppliesLost.food} food, {report.suppliesLost.wood} wood, {report.suppliesLost.stone} stone, {report.suppliesLost.gold} gold</p>
              <p className="text-stone-400">Leadership merit: {report.leadershipMeritLabel}</p>
              {report.playerFallen.length > 0 && <div className="mt-1 text-emerald-300"><strong>Village fallen</strong>{report.playerFallen.map((name, i) => <p key={i}>{name} — killed</p>)}</div>}
              {report.enemyFallen.length > 0 && <div className="mt-1 text-red-300"><strong>Enemy fallen</strong>{report.enemyFallen.map((name, i) => <p key={i}>{name} — killed</p>)}</div>}
              {report.unlistedEnemyLosses > 0 && <p className="text-red-300">Enemy losses without known names: {report.unlistedEnemyLosses}</p>}
              {report.showRecoveryAdvice && <p className="mt-1 text-amber-200">Recovery: inspect damaged buildings, restaff defenses and rebuild supplies.</p>}
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
            <strong className="text-emerald-300">{view.militia.militiaStrength}</strong>
          </div>
          <div className="rounded bg-stone-800/80 px-2 py-1">
            <div className="text-stone-400">Barricade</div>
            <strong className="text-cyan-300">{view.militia.barricadeStrength}</strong>
          </div>
          <div className="rounded bg-stone-800/80 px-2 py-1">
            <div className="text-stone-400">Guards</div>
            <strong className={view.guardsColorClass}>
              {view.guards}{view.barracksSuffix}
            </strong>
          </div>
          <div className="rounded bg-stone-800/80 px-2 py-1">
            <div className="text-stone-400">Walls</div>
            <strong className="text-stone-300">{view.wallSegments} seg.</strong>
          </div>
        </div>
        <p className="mt-1.5 text-[10px] text-stone-300">🏹 {view.armament} · assign guards in Barracks inspector</p>
      </div>

      {view.hasAlerts && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-950/25 px-3 py-2 text-[13px] text-rose-200">
          {view.pendingRaidCount > 0 && <p>⚔️ {view.pendingRaidCount} incoming raid(s) — respond in the map banner</p>}
          {view.pendingOutgoingRaidCount > 0 && (
            <p className={view.pendingRaidCount > 0 ? 'mt-0.5' : ''}>
              🏹 {view.pendingOutgoingRaidCount} war-band(s) at rival camps — accept tribute or fight
            </p>
          )}
          {view.pendingDiplomacyCount > 0 && (
            <p className={view.pendingRaidCount > 0 || view.pendingOutgoingRaidCount > 0 ? 'mt-0.5' : ''}>
              📜 {view.pendingDiplomacyCount} diplomacy event(s) — respond on map
            </p>
          )}
        </div>
      )}

      {view.combatPreview && (
        <CombatPreviewPanel
          preview={view.combatPreview}
          showOutgoingRaid={false}
          title="⚔️ Incoming raid forecast"
        />
      )}

      {view.visitors.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-[13px] font-bold uppercase tracking-wider text-cyan-400">Visitors</h4>
          <div className="space-y-1.5">
            {view.visitors.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => onFocusVisitor(g.id, g.x, g.y)}
                className="flex w-full items-center justify-between gap-2 rounded-lg bg-stone-800/60 px-2.5 py-2 text-left transition-colors hover:bg-cyan-900/30"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-bold text-cyan-200">🧳 {g.name}</p>
                  <p className="text-[13px] capitalize text-stone-300">
                    {g.description}
                  </p>
                </div>
                <span className="shrink-0 text-[13px] text-cyan-500">→</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {view.rivals.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-[13px] font-bold uppercase tracking-wider text-amber-400">Rival camps</h4>
          <div className="space-y-1.5">
            {view.rivals.map((r) => (
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
                      <span className="shrink-0 text-[13px] capitalize text-amber-400">{r.relationship}</span>
                    </div>
                    <p className="text-[13px] text-stone-300">
                      {r.populationLabel} · {r.distanceLabel}
                      · raid {r.raidFoodCost}🍖
                      {r.isAtPeace && <span className="text-cyan-400"> · 🕊️ {r.peaceTreatyDays}d (raid breaks treaty)</span>}
                    </p>
                    <p className="text-[10px] capitalize text-amber-300/80">{r.profileLabel} · {r.stanceLabel}</p>
                    {r.valleyMemoryLabel && <p className="text-[10px] text-stone-300">{r.valleyMemoryLabel}</p>}
                    <p className="text-[10px] text-cyan-300/80">Camp status: {r.statusLabel}</p>
                    <p className="text-[10px] text-stone-400">{r.ledgerLabel}</p>
                    <p className="text-[10px] text-stone-400">Latest contact: {r.latestContact}</p>
                    {r.historyLabel && <p className="text-[10px] text-stone-500">History: {r.historyLabel}</p>}
                    {r.pendingLabel && (
                      <p className="text-[10px] font-bold text-rose-400">{r.pendingLabel}</p>
                    )}
                    <p className="text-[10px] text-stone-400">Select to highlight this settlement on the strategic map; no village-camera jump.</p>
                  </button>
                  {r.warBands.map((army) => (
                      <div key={army.id} className="mt-1.5 flex items-center justify-between gap-2 rounded bg-emerald-950/40 px-2 py-1 text-[10px] text-emerald-200">
                        <span>🏹 {army.phaseLabel} · {army.marchingSoldiers} soldiers afield</span>
                        {onRecallRaid && army.canRecall && (
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
                  ))}
                  {onLaunchRaid && (
                    <>
                    {onProvokeRival && (
                      <>
                      <button
                        type="button"
                        disabled={!r.provokeEligibility.ok}
                        title={r.provokeEligibility.ok
                          ? 'Declare hostility — relations turn tense (reputation -6) so you can raid them'
                          : r.provokeEligibility.blockReason}
                        onClick={(e) => {
                          e.stopPropagation();
                          onProvokeRival(r.id);
                        }}
                        className="mt-1.5 w-full rounded bg-rose-950 px-2 py-1 text-[10px] font-bold text-rose-100 hover:bg-rose-900 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        🗡️ Declare hostility
                      </button>
                      {!r.provokeEligibility.ok && (
                        <p className="mt-0.5 text-[10px] text-stone-400">
                          {r.provokeEligibility.blockReason}
                        </p>
                      )}
                      </>
                    )}
                    <button
                      type="button"
                      disabled={!r.raidEligibility.ok}
                      title={r.raidEligibility.ok ? `March provisions ${r.raidFoodCost}🍖 · worsens relations` : r.raidEligibility.blockReason}
                      onClick={(e) => {
                        e.stopPropagation();
                        onLaunchRaid(r.id);
                      }}
                      className="mt-1.5 w-full rounded bg-orange-950 px-2 py-1 text-[10px] font-bold text-orange-100 hover:bg-orange-900 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      🏹 {r.outgoingRaidAction.buttonLabel} ({r.raidFoodCost}🍖)
                    </button>
                    {/* A disabled button is not focusable and its title is unreachable on touch. */}
                    {!r.raidEligibility.ok && (
                      <p className="mt-0.5 text-[10px] text-rose-300">
                        ⚠️ {r.raidEligibility.blockReason ?? 'Cannot raid'}
                      </p>
                    )}
                    </>
                  )}
                </div>
              );
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(FrontierPanel);