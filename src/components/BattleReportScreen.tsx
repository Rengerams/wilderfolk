import { useEffect, useRef, useState } from 'react';
import { useModalFocus } from '../hooks/useModalFocus';
import { useOverlayKeyboard } from '../hooks/useOverlayKeyboard';
import type { GameEventLog, OutgoingRaidEvent, RaidEvent, WorldState } from '../game/gameTypes';
import { TICKS_PER_HOUR } from '../game/dayCycle';
import RazeConfirmation from './RazeConfirmation';

type PendingFate = NonNullable<WorldState['pendingRaidVictories']>[number];
type RaidReport = NonNullable<WorldState['raidBattleReports']>[number];

interface BattleReportScreenProps {
  rivalName: string;
  incoming?: boolean;
  dayLabel: string;
  events: GameEventLog[];
  resolved: boolean;
  pending?: PendingFate;
  report?: RaidReport;
  liveArmy?: OutgoingRaidEvent;
  liveDefense?: RaidEvent;
  liveSoldiers: number | null;
  progressPercent: number;
  startedAtTick?: number;
  onClose: () => void;
  onFate: (choice: 'mercy' | 'tribute' | 'raze') => void;
}

function commentaryVisual(event: GameEventLog): { tone: string; icon: string } {
  if (/killed|slain|fallen|dead/i.test(event.message)) {
    return { tone: 'border-rose-500/70 text-rose-200', icon: '☠' };
  }
  if (/enemy killed|defenders lost|enemy losses/i.test(event.message)) {
    return { tone: 'border-amber-400/70 text-amber-100', icon: '⚔' };
  }
  if (/surrendered/i.test(event.message)) {
    return { tone: 'border-emerald-500/70 text-emerald-200', icon: '🏳' };
  }
  if (/battle ended|victory|defeat|repelled/i.test(event.message)) {
    return { tone: 'border-emerald-500/70 text-emerald-200', icon: '🏁' };
  }
  if (event.combatStage === 'casualties') {
    return { tone: 'border-stone-500/70 text-stone-300', icon: '⚔' };
  }
  return { tone: 'border-stone-600/70 text-stone-200', icon: '›' };
}

function outcomeHeadline(outcome: string | undefined, pending: PendingFate | undefined): string {
  if (pending) return 'The village has surrendered';
  switch (outcome) {
    case 'decisive': return 'Decisive victory';
    case 'narrow': return 'A costly victory';
    case 'stalemate': return 'A bloody stalemate';
    case 'defeat': return 'The line broke';
    case 'success': return 'The raid succeeded';
    case 'meager': return 'A thin success';
    case 'fail': return 'The raid failed';
    case 'unanswered': return 'The village was undefended';
    default: return 'Full time';
  }
}

export default function BattleReportScreen({
  rivalName, incoming, dayLabel, events, resolved, pending, report, liveArmy, liveDefense,
  liveSoldiers, progressPercent, startedAtTick, onClose, onFate,
}: BattleReportScreenProps) {
  const [revealed, setRevealed] = useState(() => Math.min(1, events.length));
  const [confirmExterminate, setConfirmExterminate] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);
  const dialogRef = useModalFocus<HTMLDivElement>();
  // Escape dismisses the nested fate confirmation before closing the report.
  useOverlayKeyboard('battle-report', () => {
    if (confirmExterminate) setConfirmExterminate(false);
    else onClose();
  });

  useEffect(() => {
    if (revealed >= events.length) return;
    const timer = window.setTimeout(() => {
      setRevealed((value) => Math.min(events.length, value + 1));
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [revealed, events.length]);

  useEffect(() => {
    const feed = feedRef.current;
    if (feed) feed.scrollTop = feed.scrollHeight;
  }, [revealed]);

  const allSeen = revealed >= events.length;
  const finalReady = allSeen && (resolved || !!pending);
  const playerLosses = pending?.playerDead ?? report?.playerDeaths
    ?? liveArmy?.battlePlayerCasualties?.length ?? liveDefense?.battlePlayerCasualties?.length ?? 0;
  const enemyLosses = pending?.enemyDead ?? report?.enemyDeaths ?? 0;
  const committed = liveArmy?.soldierIds?.length ?? liveDefense?.soldierIds?.length
    ?? (pending ? pending.playerDead + (liveSoldiers ?? 0) : undefined);
  const battleHour = Math.max(0, Math.min(6, Math.round((progressPercent / 100) * 6)));
  const status = finalReady ? 'FULL TIME' : resolved || pending ? 'FINAL WHISTLE' : 'LIVE';
  const visible = events.slice(0, revealed);

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Raid match report" className="pointer-events-auto fixed inset-0 z-[1000] flex items-center justify-center overflow-y-auto bg-black/95 p-3 text-stone-100 sm:p-5">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-amber-700/60 bg-stone-950 shadow-2xl">
        <header className="border-b border-amber-800/50 bg-gradient-to-r from-stone-950 via-amber-950/60 to-stone-950 px-4 py-3 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-amber-500">War-band · text match</p>
            <p className="text-[10px] uppercase tracking-[0.18em] text-stone-500">{dayLabel}</p>
          </div>

          <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-black uppercase tracking-wide text-emerald-200 sm:text-lg">Wilderfolk</p>
              <p className="text-[10px] uppercase tracking-widest text-emerald-500/80">Home</p>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-stone-700 bg-black/60 px-4 py-2 font-mono shadow-inner">
              <span className="text-3xl font-black text-emerald-300 sm:text-4xl">{playerLosses}</span>
              <span className="text-lg text-stone-500">—</span>
              <span className="text-3xl font-black text-rose-300 sm:text-4xl">{enemyLosses}</span>
            </div>
            <div className="min-w-0 text-right">
              <p className="truncate text-sm font-black uppercase tracking-wide text-rose-200 sm:text-lg">{rivalName}</p>
              <p className="text-[10px] uppercase tracking-widest text-rose-500/80">{incoming ? 'Raiders' : 'War-band'}</p>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${status === 'LIVE' ? 'bg-rose-600/20 text-rose-300' : 'bg-emerald-600/20 text-emerald-300'}`}>
              {status === 'LIVE' && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" />}
              {status}
            </span>
            <span className="font-mono text-xs text-stone-400">H{battleHour} / 6</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-800">
              <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-rose-500 transition-[width] duration-700" style={{ width: `${Math.max(4, progressPercent)}%` }} />
            </div>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[1.7fr_1fr]">
          <section className="flex min-h-0 flex-col border-b border-stone-800 lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between border-b border-stone-800 px-4 py-2">
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-stone-400">Commentary</h3>
              <span className="font-mono text-[10px] text-stone-500">{visible.length}/{events.length}</span>
            </div>
            <div ref={feedRef} className="min-h-[220px] flex-1 space-y-2 overflow-y-auto bg-[radial-gradient(circle_at_top,_rgba(120,53,15,0.18),_transparent_55%)] p-4 font-mono text-sm">
              {events.length === 0 && <p className="text-amber-300">Waiting for the first report from the field…</p>}
              {visible.map((event) => {
                const visual = commentaryVisual(event);
                return (
                  <div key={event.id} className={`grid grid-cols-[3.4rem_1.2rem_1fr] items-start gap-2 border-l-2 pl-3 ${visual.tone}`}>
                    <span className="text-[10px] tabular-nums text-stone-500">
                      {startedAtTick != null ? `H${Math.max(0, Math.min(6, Math.floor((event.tick - startedAtTick) / TICKS_PER_HOUR)))}` : '—'}
                    </span>
                    <span className="text-center text-xs">{visual.icon}</span>
                    <p>{event.message}</p>
                  </div>
                );
              })}
              {!allSeen && <p className="animate-pulse pl-3 text-xs text-amber-500">The next report is coming in…</p>}
            </div>
          </section>

          <aside className="min-h-0 space-y-4 overflow-y-auto p-4">
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-stone-400">Match stats</h3>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg border border-stone-800 bg-stone-900/70 p-2">
                  <dt className="text-[10px] uppercase tracking-wider text-stone-500">Committed</dt>
                  <dd className="font-mono text-lg text-stone-100">{committed ?? '—'}</dd>
                </div>
                <div className="rounded-lg border border-stone-800 bg-stone-900/70 p-2">
                  <dt className="text-[10px] uppercase tracking-wider text-stone-500">Still afield</dt>
                  <dd className="font-mono text-lg text-stone-100">{liveSoldiers ?? '—'}</dd>
                </div>
                <div className="rounded-lg border border-stone-800 bg-stone-900/70 p-2">
                  <dt className="text-[10px] uppercase tracking-wider text-stone-500">Enemy strength</dt>
                  <dd className="font-mono text-lg text-rose-200">{liveArmy?.defenderStrength ?? liveDefense?.attackerStrength ?? '—'}</dd>
                </div>
                <div className="rounded-lg border border-stone-800 bg-stone-900/70 p-2">
                  <dt className="text-[10px] uppercase tracking-wider text-stone-500">Buildings hit</dt>
                  <dd className="font-mono text-lg text-amber-200">{report?.damagedBuildings ?? '—'}</dd>
                </div>
              </dl>
            </div>

            <div className="rounded-lg border border-stone-800 bg-black/40 p-3 text-xs text-stone-400">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500">Field notes</p>
              <p>{pending ? `${pending.enemySurvivors} survive in the camp.` : resolved ? 'The field has fallen quiet.' : 'The fight is still moving; only recorded deaths are named.'}</p>
            </div>

            <div className="rounded-lg border border-amber-900/50 bg-amber-950/20 p-3 text-xs text-amber-200/80">
              <p className="font-bold uppercase tracking-wider text-amber-300/80">Your war-band</p>
              <p className="mt-1">{liveArmy ? `${liveArmy.soldierIds?.length ?? 0} marched out; ${liveSoldiers ?? 0} still standing in the line.` : liveDefense ? `${liveDefense.soldierIds?.length ?? 0} villagers stood at the barricade.` : 'The survivors who came home.'}</p>
            </div>
          </aside>
        </div>

        <footer className="border-t border-stone-800 bg-stone-950 px-4 py-3 sm:px-6">
          {finalReady ? (
            <div className="space-y-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber-500">Full time</p>
                <p className="text-lg font-black text-amber-100">{outcomeHeadline(report?.outcome, pending)}</p>
                <p className="text-sm text-stone-400">
                  {playerLosses} of ours killed · {enemyLosses} of theirs · {pending ? `${pending.enemySurvivors} survivors remain` : `${report?.enemyFallen.length ?? 0} identified enemy dead`}
                </p>
              </div>
              {pending && (
                <div className="rounded-xl border border-rose-800/70 bg-rose-950/25 p-3">
                  <p className="font-bold text-rose-100">{rivalName} has surrendered. Do you want to exterminate this village?</p>
                  <p className="mt-1 text-xs text-stone-300">All {pending.enemySurvivors} surviving inhabitants are killed; no one is released.</p>
                  {!confirmExterminate ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" className="rounded-lg bg-stone-700 px-3 py-2 text-sm font-bold text-stone-100 hover:bg-stone-600" onClick={() => onFate('mercy')}>No — spare and withdraw</button>
                      <button type="button" className="rounded-lg bg-stone-700 px-3 py-2 text-sm font-bold text-stone-100 hover:bg-stone-600" onClick={() => onFate('tribute')}>Demand one-time tribute</button>
                      <button type="button" className="rounded-lg bg-rose-900 px-3 py-2 text-sm font-bold text-rose-50 hover:bg-rose-800" onClick={() => setConfirmExterminate(true)}>Yes — exterminate village</button>
                    </div>
                  ) : (
                    <RazeConfirmation pending={pending} onConfirm={() => onFate('raze')} onCancel={() => setConfirmExterminate(false)} />
                  )}
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button type="button" className="text-xs font-bold uppercase tracking-wider text-amber-400 hover:text-amber-300" onClick={onClose}>
                  Return to village
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-stone-400">{resolved || pending ? 'The final reports are still being read out.' : 'The battle is still underway. You can close this and return later.'}</p>
              <div className="flex gap-2">
                {!allSeen && (
                  <button type="button" className="rounded-lg border border-amber-700 px-3 py-2 text-xs font-bold uppercase tracking-wider text-amber-300 hover:bg-amber-950" onClick={() => setRevealed(events.length)}>
                    Skip commentary
                  </button>
                )}
                <button type="button" className="rounded-lg bg-stone-800 px-3 py-2 text-xs font-bold uppercase tracking-wider text-stone-200 hover:bg-stone-700" onClick={onClose}>
                  Close
                </button>
              </div>
            </div>
          )}
        </footer>
      </div>
    </div>
  );
}
