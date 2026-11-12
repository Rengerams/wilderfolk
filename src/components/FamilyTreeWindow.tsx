/**
 * Family tree window: the owner-built generation rows, drawn horizontally one generation per row.
 * Living relatives come from the world; the genealogy registry adds people the world has released.
 */
import { useMemo, useState } from 'react';
import type { Entity } from '../game/gameTypes';
import { EntityType } from '../game/gameTypes';
import type { GenealogyRegistry, GenealogyPerson } from '../game/genealogyRegistry';
import { buildFullFamilyTree, type FamilyTreePerson } from '../game/familyTree';
import { humanDisplayName } from '../game/citizenId';
import GameWindow from './GameWindow';
import { useOverlayKeyboard } from '../hooks/useOverlayKeyboard';

export interface FamilyTreeWindowProps {
  entity: Entity;
  allEntities: Entity[];
  genealogyRegistry?: GenealogyRegistry;
  tick?: number;
  onClose: () => void;
  onSelect?: (entityId: number) => void;
}

type TreeMode = 'all' | 'ancestors' | 'descendants';

/**
 * A vanished settler as the tree builder needs them. The registry keeps the kinship fields the
 * world has already released; the movement and need fields are neutral because nobody simulates them.
 */
function historicalEntity(person: GenealogyPerson): Entity {
  return {
    id: person.id,
    type: EntityType.Human,
    x: 0,
    y: 0,
    energy: 0,
    maxEnergy: 0,
    age: Math.max(0, (person.diedYear ?? person.bornYear ?? 0) - (person.bornYear ?? 0)),
    birthYear: person.bornYear ?? 0,
    birthMonth: 0,
    birthDay: person.bornDay ?? 0,
    maxAge: 0,
    speed: 0,
    size: 0,
    vx: 0,
    vy: 0,
    reproductionCooldown: 0,
    alive: false,
    flash: 0,
    isJuvenile: false,
    name: person.name,
    surname: person.surname,
    gender: person.gender,
    motherId: person.motherId,
    fatherId: person.fatherId,
    adoptiveMotherId: person.adoptiveMotherId,
    adoptiveFatherId: person.adoptiveFatherId,
    childrenIds: [...person.childrenIds],
    // No current marriage can be inferred from a historical registry of all past partners.
  };
}

export default function FamilyTreeWindow({
  entity, allEntities, genealogyRegistry, tick, onClose, onSelect,
}: FamilyTreeWindowProps) {
  useOverlayKeyboard('family-tree-window', onClose);
  const [depth, setDepth] = useState(3);
  const [historicalFocusId, setHistoricalFocusId] = useState<number | null>(null);
  const focusId = historicalFocusId ?? entity.id;
  const [mode, setMode] = useState<TreeMode>('all');
  const [showDeceased, setShowDeceased] = useState(true);

  // The world keeps dead settlers until cleanup; the registry keeps them forever. Merge the two so
  // a family branch does not end at the first person the world has released.
  const roster = useMemo(() => {
    if (!showDeceased) return allEntities;
    const known = new Set(allEntities.map((e) => e.id));
    const released: Entity[] = [];
    for (const person of Object.values(genealogyRegistry?.people ?? {})) {
      if (person.alive || known.has(person.id)) continue;
      released.push(historicalEntity(person));
    }
    return released.length > 0 ? [...allEntities, ...released] : allEntities;
  }, [allEntities, genealogyRegistry, showDeceased]);

  const focusEntity = roster.find((e) => e.id === focusId) ?? entity;
  const tree = useMemo(
    () => buildFullFamilyTree(focusEntity, roster, tick, {
      includeDeceased: showDeceased,
      historicalRegistry: showDeceased ? genealogyRegistry : undefined,
    }),
    [focusEntity, roster, tick, showDeceased, genealogyRegistry],
  );

  // The tree owner bounds the walk, so the selector offers only generations it can actually draw;
  // deriving the bound from the built rows keeps the control from advertising dead options.
  const maxGenerations = Math.max(1, ...tree.rows.map((row) => Math.abs(row.delta)));
  const shownGenerations = Math.min(depth, maxGenerations);

  const visibleRows = tree.rows.filter((row) => {
    if (Math.abs(row.delta) > shownGenerations) return false;
    if (mode === 'ancestors') return row.delta <= 0;
    if (mode === 'descendants') return row.delta >= 0;
    return true;
  });
  /** Members in the rows actually drawn — the same reduction the rows render, so the header cannot overcount. */
  const visibleMemberCount = visibleRows.reduce((count, row) => count + row.members.length, 0);

  const selectPerson = (person: FamilyTreePerson) => {
    if (person.id === focusId) return;
    setHistoricalFocusId(person.id);
    if (person.alive) onSelect?.(person.id);
  };

  const renderPerson = (person: FamilyTreePerson) => (
    <button
      key={person.id}
      type="button"
      disabled={person.id === focusId}
      onClick={() => selectPerson(person)}
      className={`flex min-w-40 max-w-56 flex-col rounded-lg border px-3 py-2 text-left shadow-sm transition
        ${person.isFocus
          ? 'border-amber-300 bg-amber-900/60 text-amber-50'
          : 'border-stone-600 bg-stone-800 text-stone-100 hover:border-amber-500'}
        ${!person.alive ? 'opacity-65' : ''}`}
    >
      <span className="flex items-center gap-1.5">
        <span aria-hidden>{person.icon}</span>
        <span className="text-[13px] font-semibold">{person.name}</span>
      </span>
      {person.relation && (
        <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-300/90">
          {person.relation}
        </span>
      )}
      <span className="text-[10px] text-stone-400">
        {person.alive ? 'Living' : 'Deceased'} · #{person.id}
        {person.detail ? ` · ${person.detail}` : ''}
      </span>
      {person.bonds.length > 0 && (
        <span className="text-[10px] text-rose-300">{person.bonds.join(' · ')}</span>
      )}
    </button>
  );

  return (
    <GameWindow
      title={`Family tree · ${tree.focusName || humanDisplayName(entity)}`}
      icon="🌳"
      subtitle={`${visibleMemberCount} people drawn · ${visibleRows.length} generations shown`}
      onClose={onClose}
      centered
      widthClassName="w-[56rem] max-w-[95vw]"
      maxBodyClassName="max-h-[78vh]"
    >
      <div className="space-y-4 text-stone-200">
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-stone-800/80 p-2">
          {([['all', 'All'], ['ancestors', 'Ancestors ↑'], ['descendants', 'Descendants ↓']] as const)
            .map(([value, label]) => (
              <button key={value} type="button" onClick={() => setMode(value)}
                aria-pressed={mode === value}
                className={`rounded px-3 py-1.5 text-xs ${mode === value ? 'bg-amber-700 text-white' : 'bg-stone-700'}`}>
                {label}
              </button>
            ))}
          <label className="ml-2 text-xs">Generations
            <select value={shownGenerations} onChange={(event) => setDepth(Number(event.target.value))}
              className="ml-2 rounded border border-stone-600 bg-stone-900 p-1">
              {Array.from({ length: maxGenerations }, (_, index) => index + 1).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          {historicalFocusId != null && historicalFocusId !== entity.id && (
            <button type="button" onClick={() => setHistoricalFocusId(null)}
              className="rounded bg-stone-700 px-3 py-1.5 text-xs hover:bg-stone-600">
              Back to selected settler
            </button>
          )}
          <label className="ml-auto flex items-center gap-2 text-xs">
            <input type="checkbox" checked={showDeceased}
              onChange={(event) => setShowDeceased(event.target.checked)} />
            Include deceased
          </label>
        </div>
        <p className="text-xs text-stone-400">
          Rows are generations: older generations above, younger below. Lines show recorded biological
          or adoptive parent-child relationships; marriage alone does not imply shared ancestry.
        </p>
        <div className="max-h-[57vh] overflow-auto rounded-xl border border-amber-900/40 bg-stone-950/60 p-4">
          {visibleRows.length === 0 ? (
            <p>No genealogy record available for this settler.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {visibleRows.map((row) => (
                <section key={row.delta} className="flex flex-col gap-2">
                  <h3 className="text-[10px] font-semibold uppercase tracking-wide text-amber-500/80">
                    {row.label}
                  </h3>
                  <div className="flex flex-wrap items-stretch gap-2">
                    {row.members.map(renderPerson)}
                  </div>
                </section>
              ))}
            </div>
          )}
          {tree.truncated && (
            <p className="mt-3 text-[11px] text-amber-300">
              The tree is larger than the window can draw; the closest kin are shown.
            </p>
          )}
          {tree.gaps.length > 0 && (
            <ul className="mt-3 space-y-1 border-t border-stone-800 pt-3 text-[11px] text-stone-400">
              {tree.gaps.map((gap) => <li key={gap.kind}>{gap.text}</li>)}
            </ul>
          )}
        </div>
      </div>
    </GameWindow>
  );
}
