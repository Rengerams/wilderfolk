/**
 * Family tree window: one row per generation of the whole connected family, the clicked settler
 * leading and highlighted. The data owner is `game/familyTree.buildFullFamilyTree`.
 */
import type { Entity } from '../game/gameTypes';
import { citizenFullName } from '../game/citizenId';
import { buildFullFamilyTree, type FamilyTreePerson } from '../game/familyTree';
import GameWindow from './GameWindow';

export interface FamilyTreeWindowProps {
  /** The settler whose tree this is. */
  entity: Entity;
  allEntities: Entity[];
  onClose: () => void;
  /** Select another citizen — how the tree is walked. */
  onSelect?: (entityId: number) => void;
}

/** One person on the tree. The `anchor` variant is the settler the window is about. */
function TreeNode({
  label,
  name,
  relation,
  detail,
  icon,
  anchor = false,
  onSelect,
}: {
  label?: string;
  name: string;
  relation?: string;
  detail?: string;
  icon?: string;
  anchor?: boolean;
  onSelect?: () => void;
}) {
  const body = (
    <>
      {label && <span aria-hidden>{label}</span>}
      {icon && <span aria-hidden>{icon}</span>}
      <span className={anchor ? 'font-bold text-amber-50' : 'font-semibold text-amber-100'}>{name}</span>
      {relation && <span className="text-stone-400">{relation}</span>}
      {detail && <span className="text-stone-500">{detail}</span>}
    </>
  );
  const base = 'inline-flex flex-wrap items-baseline gap-x-1.5 rounded px-1.5 py-0.5 text-amber-200';
  if (!onSelect) {
    return (
      <span className={anchor ? `${base} bg-amber-500/20 ring-1 ring-amber-400/40` : base}>{body}</span>
    );
  }
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`${base} hover:bg-amber-500/15 hover:text-amber-50 ${
        anchor ? 'bg-amber-500/20 ring-1 ring-amber-400/40' : ''
      }`}
    >
      {body}
    </button>
  );
}

/** A vertical connector segment. `height` in px, kept small so gaps stay legible. */
function Stem({ height = 8 }: { height?: number }) {
  return <div aria-hidden className="mx-auto w-px bg-amber-500/40" style={{ height }} />;
}

/** The horizontal bar that ties a generation's people to the single stem below them. */
function Elbow() {
  return <div aria-hidden className="mx-auto h-px w-2/3 bg-amber-500/40" />;
}

export default function FamilyTreeWindow({ entity, allEntities, onClose, onSelect }: FamilyTreeWindowProps) {
  const tree = buildFullFamilyTree(entity, allEntities);
  const relatives = tree.memberCount - 1;
  /** Full names through `citizenFullName` — given names alone are ambiguous across generations. */
  const byId = new Map(allEntities.map((e) => [e.id, e] as const));
  const fullNameOf = (person: FamilyTreePerson) => {
    const found = byId.get(person.id);
    return found ? citizenFullName(found) : person.name;
  };
  const pick = (person: FamilyTreePerson) => (onSelect ? () => onSelect(person.id) : undefined);
  const row = (person: FamilyTreePerson) => (
    <TreeNode
      key={person.id}
      icon={person.icon}
      name={fullNameOf(person)}
      relation={person.relation}
      detail={person.detail}
      anchor={person.isFocus}
      onSelect={person.isFocus ? undefined : pick(person)}
    />
  );

  return (
    <GameWindow
      title={`Family tree of ${citizenFullName(entity)}`}
      icon="🌳"
      subtitle={`Gen ${entity.generation} · ${Math.floor(entity.age)}y${entity.isJuvenile ? ' · child' : ''} · ${relatives} relative${relatives === 1 ? '' : 's'}`}
      onClose={onClose}
      // Centred over a backdrop: this window is opened *from* the Selected inspector that occupies the
      // right edge, so anchoring it there put it on top of that panel and it read as a stray box.
      centered
    >
      {relatives === 0 ? (
        <p className="rounded bg-stone-800/60 p-2 text-[11px] text-stone-400">
          No living relatives recorded — no parents, siblings, spouse or children.
        </p>
      ) : (
        <div className="space-y-0 text-[11px]">
          {/* One row per generation, oldest at the top. The rows do not depend on who was clicked: the
              builder resolves the connected family first, so every member draws the same tree and only
              the highlight moves. */}
          {tree.rows.map((generation, index) => (
            <div key={generation.delta}>
              {index > 0 && (
                <>
                  <Stem />
                  <Elbow />
                  <Stem height={6} />
                </>
              )}
              <p className="text-center text-[10px] uppercase tracking-wide text-amber-400/70">
                {generation.label}
                {generation.delta === 0 ? ' · this settler' : ''}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5">
                {generation.members.map(row)}
              </div>
            </div>
          ))}
          {tree.truncated && (
            <p className="pt-1 text-center text-[10px] text-stone-500">
              This family is larger than one window draws — {relatives} relatives are shown.
            </p>
          )}
        </div>
      )}

      {onSelect && relatives > 0 && (
        <p className="mt-2 border-t border-amber-600/20 pt-1.5 text-[10px] text-stone-500">
          Click a name to select that settler — the same family is drawn from any of them.
        </p>
      )}
    </GameWindow>
  );
}
