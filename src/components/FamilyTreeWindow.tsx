/**
 * Family tree window: one row per generation of the whole connected family, the clicked settler
 * leading and highlighted. The data owner is `game/familyTree.buildFullFamilyTree`.
 */
import type { Entity } from '../game/gameTypes';
import { useLayoutEffect, useRef, useState } from 'react';
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

/** One measured parent → child branch, in coordinates relative to the tree's own box. */
interface Branch {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function TreeBranches({ branches }: { branches: Branch[] }) {
  if (branches.length === 0) return null;
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden>
      {branches.map((b, index) => (
        // Orthogonal routing: down from the parent, across at the midpoint, then down to the child.
        <path
          key={index}
          d={`M ${b.x1} ${b.y1} V ${(b.y1 + b.y2) / 2} H ${b.x2} V ${b.y2}`}
          fill="none"
          stroke="rgba(245,158,11,0.45)"
          strokeWidth={1}
        />
      ))}
    </svg>
  );
}

export default function FamilyTreeWindow({ entity, allEntities, onClose, onSelect }: FamilyTreeWindowProps) {
  const tree = buildFullFamilyTree(entity, allEntities);
  const relatives = tree.memberCount - 1;
  const treeBoxRef = useRef<HTMLDivElement | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  /** The member layout, as a stable key: re-measure when it changes, not on every render. */
  const layoutKey = tree.rows.map((r) => r.members.map((m) => m.id).join(',')).join('|');

  // The edges are known (`parentLinks`); where each name lands is not, so the branches are measured
  // after layout and redrawn whenever the box changes size.
  useLayoutEffect(() => {
    const root = treeBoxRef.current;
    if (!root) return;
    const draw = () => {
      const box = root.getBoundingClientRect();
      const boxOf = (id: number) => {
        const node = root.querySelector<HTMLElement>(`[data-ftid="${id}"]`);
        if (!node) return null;
        const rect = node.getBoundingClientRect();
        return {
          x: rect.left - box.left + rect.width / 2,
          top: rect.top - box.top,
          bottom: rect.bottom - box.top,
        };
      };
      const next: Branch[] = [];
      for (const [childId, parentIds] of tree.parentLinks) {
        const child = boxOf(childId);
        if (!child) continue;
        for (const parentId of parentIds) {
          const parent = boxOf(parentId);
          if (!parent) continue;
          // Oldest is drawn first, so the parent is normally above; guard the reverse anyway.
          const upper = parent.top <= child.top ? parent : child;
          const lower = upper === parent ? child : parent;
          next.push({ x1: upper.x, y1: upper.bottom, x2: lower.x, y2: lower.top });
        }
      }
      setBranches(next);
    };
    draw();
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }, [layoutKey]);
  /** Full names through `citizenFullName` — given names alone are ambiguous across generations. */
  const byId = new Map(allEntities.map((e) => [e.id, e] as const));
  const fullNameOf = (person: FamilyTreePerson) => {
    const found = byId.get(person.id);
    return found ? citizenFullName(found) : person.name;
  };
  const pick = (person: FamilyTreePerson) => (onSelect ? () => onSelect(person.id) : undefined);
  const row = (person: FamilyTreePerson) => (
    // `data-ftid` is how the branch layer finds this person's box to measure.
    <span key={person.id} data-ftid={person.id}>
      <TreeNode
        icon={person.icon}
        name={fullNameOf(person)}
        relation={person.relation}
        detail={person.detail}
        anchor={person.isFocus}
        onSelect={person.isFocus ? undefined : pick(person)}
      />
    </span>
  );

  return (
    <GameWindow
      title={`Family tree of ${citizenFullName(entity)}`}
      icon="🧬"
      subtitle={`Gen ${entity.generation} · ${Math.floor(entity.age)}y${entity.isJuvenile ? ' · child' : ''} · ${relatives} relative${relatives === 1 ? '' : 's'}`}
      onClose={onClose}
      // Centred over a backdrop: this window is opened *from* the Selected inspector that occupies the
      // right edge, so anchoring it there put it on top of that panel and it read as a stray box.
      centered
      // A row of names per generation needs more than the shell's chat-sized 26rem, and a deep family
      // needs a body cap so it scrolls instead of running off-screen. The caller owns both numbers.
      widthClassName="w-[44rem] max-w-[92vw]"
      maxBodyClassName="max-h-[70vh]"
    >
      {relatives === 0 ? (
        <p className="rounded bg-stone-800/60 p-2 text-[11px] text-stone-400">
          No living relatives recorded — no parents, siblings, spouse or children.
        </p>
      ) : (
        <div ref={treeBoxRef} className="relative space-y-1 text-[11px]">
          <TreeBranches branches={branches} />
          {/* One row per generation, oldest at the top. The rows do not depend on who was clicked: the
              builder resolves the connected family first, so every member draws the same tree and only
              the highlight moves. */}
          {tree.rows.map((generation) => (
            <div key={generation.delta}>
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
