import { useMemo, useState } from 'react';
import type { WorldState } from '../game/gameTypes';
import { formatCitizenName } from '../game/citizenId';
import { getOpenPlayerBeds } from '../game/populationGrowth';
import { daysUntilTick } from '../game/dayCycleClock';
import { buildRaidTerminalReport } from '../game/raidTerminalReport';

interface WarfareStatusProps {
  world: WorldState;
  onPrisonerDecision: (entityId: number, choice: string) => void;
  onRepair: (buildingId: number) => void;
  onExport: () => void;
  onChronicle: () => void;
  onNewVillage: () => void;
  onMainMenu: () => void;
}

/** Durable recovery, terminal reports and real captive choices read authoritative simulation state. */
export default function WarfareStatus({ world, onPrisonerDecision, onRepair, onExport, onChronicle, onNewVillage, onMainMenu }: WarfareStatusProps) {
  const [showCaptives, setShowCaptives] = useState(false);
  const [confirmExecution, setConfirmExecution] = useState<number | null>(null);
  const recovery = world.raidRecovery;
  const prisoners = useMemo(() => recovery?.status === 'destroyed' ? [] : world.entities.filter((person) => person.alive && person.warCaptive && person.prisonBuildingId != null), [world, recovery?.status]);
  const openBeds = useMemo(() => prisoners.length ? getOpenPlayerBeds(world) : 0, [world, prisoners.length]);
  const buildingById = useMemo(() => new Map((recovery?.status === 'recovering' ? world.buildings : []).map((home) => [home.id, home])), [world]);
  const terminal = recovery?.status === 'destroyed' ? buildRaidTerminalReport(world) : null;
  if (terminal && recovery) {
    return <div role="dialog" aria-modal="true" aria-label="Settlement fallen" className="pointer-events-auto fixed inset-0 z-[1200] flex items-center justify-center bg-black/95 p-3 text-stone-100 sm:p-6">
      <section className="max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-xl border border-rose-800 bg-stone-950 p-4 sm:p-8">
        <h2 className="text-3xl font-bold text-rose-200">The settlement has fallen</h2>
        <p>{world.villageName} · year {world.year + 1}, day {world.dayInYear}</p>
        <p>{recovery.reason}</p>
        <div className="space-y-1">
          <h3 className="font-semibold text-amber-200">Final leader</h3>
          <p>{terminal.lastLeaderName
            ? `${terminal.lastLeaderName} (#${terminal.lastLeaderId})`
            : 'Last leader not recorded'}</p>
        </div>
        <div className="space-y-1">
          <h3 className="font-semibold text-amber-200">Battle and survivors</h3>
          <p>{terminal.playerDeaths == null ? 'Final-battle casualties were not recorded.' : `${terminal.playerDeaths} villagers fell in the final battle against ${recovery.rivalName}.`} {terminal.survivors} inhabitants survived.</p>
          {terminal.enemyDeaths != null && <p>Enemy losses: {terminal.enemyDeaths}.</p>}
          {terminal.damagedBuildings != null && <p>Buildings damaged: {terminal.damagedBuildings}.</p>}
          {terminal.playerFallen.map((name, index) => <p key={index} className="text-emerald-300">Village fallen: {name}</p>)}
        </div>
        <section aria-labelledby="terminal-chapters" className="space-y-2">
          <h3 id="terminal-chapters" className="font-semibold text-amber-200">Recorded village chapters</h3>
          {terminal.chapters.length > 0 ? (
            <ul className="space-y-1">
              {terminal.chapters.map((chapter) => (
                <li key={chapter.id} className="rounded bg-stone-900/60 p-2 text-sm">
                  <span className="font-semibold">{chapter.icon} {chapter.title}</span> — {chapter.detail}
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-stone-400">No recorded chapters.</p>}
        </section>
        <section aria-labelledby="terminal-history" className="space-y-2">
          <h3 id="terminal-history" className="font-semibold text-amber-200">Recent Chronicle highlights</h3>
          {terminal.highlights.length > 0 ? (
            <ol className="space-y-1">
              {terminal.highlights.map((event) => (
                <li key={event.id} className="rounded bg-stone-900/60 p-2 text-sm">
                  <span className="text-stone-400">Year {event.year + 1}, day {event.day} · </span>
                  {event.message}
                </li>
              ))}
            </ol>
          ) : <p className="text-sm text-stone-400">No retained Chronicle highlights.</p>}
          <p className="text-xs text-stone-400">Only selected events still held in the Chronicle are shown.</p>
        </section>
        <p className="text-sm">This settlement cannot resume. Export its final state to preserve the history. Existing save files are not deleted.</p>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={onExport} className="rounded bg-amber-800 p-2">Export final save</button>
          <button type="button" onClick={onChronicle} className="rounded bg-stone-700 p-2">View / export Chronicle</button>
          <button type="button" onClick={() => { onExport(); onNewVillage(); }} className="rounded bg-emerald-900 p-2">Export &amp; start new village</button>
          <button type="button" onClick={onMainMenu} className="rounded bg-stone-700 p-2">Return to main menu</button>
        </div>
      </section>
    </div>;
  }
  return <>
    {recovery && <aside className="pointer-events-auto fixed bottom-3 left-3 z-40 max-w-sm rounded border border-amber-700 bg-stone-950 p-3 text-sm text-amber-100">
      <h3 className="font-bold">Village recovery</h3>
      <p>{recovery.reason}</p>
      <p>Food: {Math.floor(world.resources.food)} / {recovery.foodTarget}. Repairs remaining: {recovery.repairs.filter((repair) => (buildingById.get(repair.buildingId)?.health ?? repair.health) < repair.health).length}.</p>
      {recovery.repairs.slice(0, 5).map((repair) => {
        const home = buildingById.get(repair.buildingId);
        return home && home.health < repair.health ? <button key={home.id} className="mr-2 mt-2 rounded bg-amber-900 p-1" onClick={() => onRepair(home.id)}>Repair {home.type} #{home.id} ({Math.round(home.health)}% health)</button> : null;
      })}
      <p>{daysUntilTick(world.tick, recovery.protectedUntilTick)} days before new raids can be raised.</p>
    </aside>}
    {prisoners.length > 0 && <button onClick={() => setShowCaptives(true)} className="pointer-events-auto fixed bottom-3 right-3 z-50 rounded border border-slate-500 bg-stone-950 p-3 text-stone-100">Prisoners of war ({prisoners.length})</button>}
    {showCaptives && <div role="dialog" aria-modal="true" aria-label="Prisoners of war" className="pointer-events-auto fixed inset-0 z-[1100] flex items-center justify-center bg-black/90 p-6 text-stone-100">
      <section className="max-h-[85vh] w-full max-w-2xl space-y-4 overflow-auto rounded-xl border border-stone-600 bg-stone-950 p-6">
        <h2 className="text-2xl font-bold">Prisoners of war</h2>
        <p>Only real enemy combatants are held. Captives consume food and guarded prison space. Recruitment is voluntary and may be refused.</p>
        {prisoners.map((person) => <div key={person.id} className="space-y-2 rounded border border-slate-600 p-3">
          <h3 className="font-bold text-rose-300">Enemy captive: {formatCitizenName(person)}</h3>
          <p>Origin: {world.rivalSettlements.find((rival) => rival.id === person.warCaptive!.originRivalId)?.name ?? 'Former settlement'} · prison #{person.prisonBuildingId}</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => onPrisonerDecision(person.id, 'keep')} className="rounded bg-stone-700 p-2">Keep imprisoned</button>
            <button onClick={() => onPrisonerDecision(person.id, 'release')} className="rounded bg-stone-700 p-2">Release</button>
            <button disabled={world.tick < person.warCaptive!.recruitAfterTick || openBeds <= 0} onClick={() => onPrisonerDecision(person.id, 'recruit')} className="rounded bg-amber-900 p-2 disabled:opacity-40">Offer to join</button>
            <button onClick={() => setConfirmExecution(person.id)} className="rounded bg-stone-700 p-2">Execute</button>
          </div>
          {openBeds <= 0 && <p>No free village housing is available for a recruit.</p>}
          {world.tick < person.warCaptive!.recruitAfterTick && <p>Another recruitment offer is available in {daysUntilTick(world.tick, person.warCaptive!.recruitAfterTick)} days.</p>}
          {confirmExecution === person.id && <div className="rounded border border-stone-600 p-3">
            <p>Execute {formatCitizenName(person)}?</p>
            <button onClick={() => { onPrisonerDecision(person.id, 'execute_confirmed'); setConfirmExecution(null); }} className="mr-3 rounded bg-stone-700 p-2">Confirm</button>
            <button onClick={() => setConfirmExecution(null)}>Cancel</button>
          </div>}
        </div>)}
        {prisoners.length === 0 && <p>No identifiable combatants remain in captivity.</p>}
        <button onClick={() => setShowCaptives(false)} className="rounded bg-stone-700 p-2">Return to village</button>
      </section>
    </div>}
  </>;
}
