/**
 * Historical genealogy viewer. Vertical ancestor and descendant branches follow recorded
 * biological/adoptive parent IDs, not surnames or household co-residence.
 */
import { useMemo, useState, type ReactNode } from 'react';
import type { Entity } from '../game/gameTypes';
import type { GenealogyRegistry, GenealogyPerson } from '../game/genealogyRegistry';
import { citizenFullName } from '../game/citizenId';
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

type Person = Pick<GenealogyPerson, 'id' | 'name' | 'surname' | 'alive' |
  'motherId' | 'fatherId' | 'adoptiveMotherId' | 'adoptiveFatherId' | 'childrenIds'>;

const PARENT_KEYS = ['motherId', 'fatherId', 'adoptiveMotherId', 'adoptiveFatherId'] as const;

export default function FamilyTreeWindow({
  entity, allEntities, genealogyRegistry, onClose, onSelect,
}: FamilyTreeWindowProps) {
  useOverlayKeyboard('family-tree-window', onClose);
  const [depth, setDepth] = useState(3);
  const [mode, setMode] = useState<'descendants' | 'ancestors'>('descendants');
  const [showDeceased, setShowDeceased] = useState(true);

  const { people, children } = useMemo(() => {
    const known = new Map<number, Person>();
    // Keep historical identities; the living entity row provides the most recent name.
    for (const record of Object.values(genealogyRegistry?.people ?? {})) known.set(record.id, record);
    for (const e of allEntities) {
      if (e.type !== 'human') continue;
      known.set(e.id, {
        id: e.id, name: e.name ?? 'Unknown', surname: e.surname ?? '',
        alive: e.alive, motherId: e.motherId, fatherId: e.fatherId,
        adoptiveMotherId: e.adoptiveMotherId, adoptiveFatherId: e.adoptiveFatherId,
        childrenIds: e.childrenIds ?? [],
      });
    }
    // Do not let incomplete live rows erase parent links already captured historically.
    for (const record of Object.values(genealogyRegistry?.people ?? {})) {
      const current = known.get(record.id);
      if (current) known.set(record.id, {
        ...current,
        motherId: current.motherId ?? record.motherId,
        fatherId: current.fatherId ?? record.fatherId,
        adoptiveMotherId: current.adoptiveMotherId ?? record.adoptiveMotherId,
        adoptiveFatherId: current.adoptiveFatherId ?? record.adoptiveFatherId,
        childrenIds: [...new Set([...(current.childrenIds ?? []), ...record.childrenIds])],
      });
    }
    const childIds = new Map<number, Set<number>>();
    for (const person of known.values()) {
      for (const parentId of PARENT_KEYS.map(k => person[k])) {
        if (parentId == null || parentId === person.id) continue;
        const set = childIds.get(parentId) ?? new Set<number>();
        set.add(person.id); childIds.set(parentId, set);
      }
    }
    // Old saves may only preserve a parent's childrenIds.
    for (const person of known.values()) for (const id of person.childrenIds ?? []) {
      if (!known.has(id)) continue;
      const set = childIds.get(person.id) ?? new Set<number>();
      set.add(id); childIds.set(person.id, set);
    }
    return { people: known, children: childIds };
  }, [allEntities, genealogyRegistry]);

  const renderPerson = (person: Person, focus: boolean) => {
    const label = `${person.name} ${person.surname}`.trim();
    return (
      <button type="button" disabled={!onSelect || person.id === entity.id}
        onClick={() => onSelect?.(person.id)}
        className={`inline-flex min-w-40 max-w-56 flex-col rounded-lg border px-3 py-2 text-left shadow-sm transition
          ${focus ? 'border-amber-300 bg-amber-900/60 text-amber-50' :
            'border-stone-600 bg-stone-800 text-stone-100 hover:border-amber-500'}
          ${!person.alive ? 'opacity-65' : ''}`}>
        <span className="text-[13px] font-semibold">{label}</span>
        <span className="text-[10px] text-stone-400">
          {person.alive ? 'Living' : 'Deceased'} · #{person.id}
        </span>
      </button>
    );
  };

  const branch = (id: number, generation: number, trail: ReadonlySet<number>): ReactNode => {
    const person = people.get(id);
    if (!person || (trail.has(id)) || (!showDeceased && !person.alive)) return null;
    const nextTrail = new Set(trail); nextTrail.add(id);
    const relatives = mode === 'ancestors'
      ? [...new Set(PARENT_KEYS.map(k => person[k]).filter((v): v is number => v != null))]
      : [...(children.get(id) ?? [])].sort((a, b) => a - b);
    const visible = generation < depth ? relatives.filter(nextId => {
      const candidate = people.get(nextId);
      return candidate && (showDeceased || candidate.alive) && !nextTrail.has(nextId);
    }) : [];
    return (
      <div key={id} className="flex flex-col items-start">
        {renderPerson(person, id === entity.id)}
        {visible.length > 0 && (
          <div className="ml-5 mt-2 space-y-3 border-l-2 border-amber-600/50 pl-5">
            {visible.map(nextId => (
              <div key={nextId} className="relative before:absolute before:-left-5 before:top-5 before:w-5 before:border-t-2 before:border-amber-600/50">
                {branch(nextId, generation + 1, nextTrail)}
              </div>
            ))}
          </div>
        )}
        {generation === depth && relatives.length > 0 && (
          <span className="mt-1 text-[11px] text-stone-400">More generations available · increase depth</span>
        )}
      </div>
    );
  };

  const focus = people.get(entity.id);
  const knownCount = people.size;
  const familyCount = focus ? (mode === 'ancestors'
    ? PARENT_KEYS.filter(k => focus[k] != null).length : (children.get(entity.id)?.size ?? 0)) : 0;

  return (
    <GameWindow
      title={`Family tree · ${citizenFullName(entity)}`}
      icon="🌳"
      subtitle={`${knownCount} people recorded · ${familyCount} direct ${mode === 'ancestors' ? 'parents' : 'children'}`}
      onClose={onClose}
      centered
      widthClassName="w-[56rem] max-w-[95vw]"
      maxBodyClassName="max-h-[78vh]"
    >
      <div className="space-y-4 text-stone-200">
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-stone-800/80 p-2">
          <button type="button" onClick={() => setMode('ancestors')}
            className={`rounded px-3 py-1.5 text-xs ${mode === 'ancestors' ? 'bg-amber-700 text-white' : 'bg-stone-700'}`}>
            Ancestors ↑
          </button>
          <button type="button" onClick={() => setMode('descendants')}
            className={`rounded px-3 py-1.5 text-xs ${mode === 'descendants' ? 'bg-amber-700 text-white' : 'bg-stone-700'}`}>
            Descendants ↓
          </button>
          <label className="ml-2 text-xs">Generations
            <select value={depth} onChange={event => setDepth(Number(event.target.value))}
              className="ml-2 rounded border border-stone-600 bg-stone-900 p-1">
              {[2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="ml-auto flex items-center gap-2 text-xs">
            <input type="checkbox" checked={showDeceased}
              onChange={event => setShowDeceased(event.target.checked)} />
            Include deceased
          </label>
        </div>
        <p className="text-xs text-stone-400">
          Lines show recorded biological or adoptive parent-child relationships.
          Marriage alone does not imply shared ancestry. Click a card to explore that person.
        </p>
        <div className="max-h-[57vh] overflow-auto rounded-xl border border-amber-900/40 bg-stone-950/60 p-5">
          {focus ? branch(focus.id, 0, new Set<number>()) : (
            <p>No genealogy record available for this settler.</p>
          )}
        </div>
      </div>
    </GameWindow>
  );
}
