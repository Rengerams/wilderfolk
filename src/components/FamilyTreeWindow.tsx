/**
 * Family tree — its own window, drawn as a **tree**.
 *
 * Two owner reports are the reason this file exists in this shape:
 *   - *"the family tree is no family tree its unclear who is who"* — it was a flat list in which a
 *     spouse, a parent, a sibling and a child were identical rows told apart by a `(relation)` word.
 *   - *"family three is not a family thee"* — a second pass, because grouping relatives under a
 *     heading ("Parents", "Children") is still a **list of groups**, not a tree. The difference a
 *     tree buys is the **connector**: you can see that these two parents produced *these* children,
 *     rather than inferring it from section headings.
 *
 * So the layout is vertical and line-connected: parents on top, an optional spouse beside the
 * settler in the middle, children below, with a spine and elbows joining them. Every generation is
 * drawn by the same row renderer, so a name is a name at every depth.
 *
 * The data is the owner's (`SelectedEntityPanel.buildFamilyTree`) — this window holds no notion of
 * who a relative is, so the inspector's one-line summary and this tree cannot disagree.
 */
import type { Entity } from '../game/gameTypes';
import { citizenFullName } from '../game/citizenId';
import { buildFamilyTree, type FamilyNode } from './SelectedEntityPanel';
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
  const tree = buildFamilyTree(entity, allEntities);
  const relatives = tree.parents.length + tree.siblings.length + tree.children.length + (tree.partner ? 1 : 0);
  const pick = (node: FamilyNode) => (onSelect ? () => onSelect(node.id) : undefined);
  /**
   * Full names, from the owner (`citizenId.citizenFullName`), not the given name alone.
   *
   * `buildFamilyTree` hands back `citizenGivenName`, which is right for the inspector's one-line
   * relation ("⚭ Joachim · 0 children") but wrong inside a family tree: with several generations on
   * screen, given names alone are ambiguous — the owner's report was *"show full names"*. The node's
   * id is looked up in the same entity list the tree was built from, so the tree and the rest of the
   * UI cannot disagree about who someone is.
   */
  const byId = new Map(allEntities.map((e) => [e.id, e] as const));
  const fullNameOf = (node: FamilyNode) => {
    const found = byId.get(node.id);
    return found ? citizenFullName(found) : node.name;
  };
  const row = (node: FamilyNode) => (
    <TreeNode
      key={node.id}
      label={node.label}
      name={fullNameOf(node)}
      relation={node.relation}
      detail={node.detail}
      onSelect={pick(node)}
    />
  );

  return (
    <GameWindow
      title={`Family tree of ${citizenFullName(entity)}`}
      icon="🌳"
      subtitle={`Gen ${entity.generation} · ${Math.floor(entity.age)}y${entity.isJuvenile ? ' · child' : ''}`}
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
          {/* ---- parents (top) ---- */}
          {tree.parents.length > 0 && (
            <>
              <div className="flex flex-wrap justify-center gap-x-2 gap-y-0.5">{tree.parents.map(row)}</div>
              <Stem />
              <Elbow />
              <Stem height={6} />
            </>
          )}

          {/* ---- the settler and their spouse, side by side: the tree's anchor row ---- */}
          <div className="flex flex-wrap items-center justify-center gap-2 rounded-lg bg-amber-500/10 p-2 ring-1 ring-amber-400/30">
            <TreeNode
              name={citizenFullName(entity)}
              icon={entity.gender === 'male' ? '👨' : '👩'}
              detail={`Gen ${entity.generation}`}
              anchor
            />
            {tree.partner && (
              <>
                <span aria-hidden className="text-amber-400">⚭</span>
                <TreeNode
                  name={fullNameOf(tree.partner)}
                  relation={tree.partner.relation}
                  onSelect={pick(tree.partner)}
                />
              </>
            )}
          </div>

          {/* ---- siblings hang off the same parents, so they sit level with this settler ---- */}
          {tree.siblings.length > 0 && (
            <>
              <Stem height={6} />
              <Elbow />
              <Stem height={4} />
              <p className="text-center text-[10px] uppercase tracking-wide text-amber-400/70">Siblings</p>
              <div className="flex flex-wrap justify-center gap-x-2 gap-y-0.5">{tree.siblings.map(row)}</div>
            </>
          )}

          {/* ---- children (bottom), each on its own stem: the descent the owner wanted to see ---- */}
          {tree.children.length > 0 && (
            <>
              <Stem />
              <Elbow />
              <Stem height={6} />
              <p className="text-center text-[10px] uppercase tracking-wide text-amber-400/70">Children</p>
              {/* One row, never wrapped (owner: *"not wrap it in the column"*). `nowrap` keeps every
                  child on the same line; the window is widened below so full names fit without the
                  children being squeezed. `shrink-0` on each child stops flex from compressing a name
                  to fit, which would re-introduce the stacking the owner reported, horizontally. */}
              <div className="flex flex-nowrap items-start justify-center gap-x-3">
                {tree.children.map((child) => (
                  <div key={child.id} className="flex shrink-0 flex-col items-center">
                    <span aria-hidden className="h-2 w-px bg-amber-500/40" />
                    {row(child)}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {onSelect && relatives > 0 && (
        <p className="mt-2 border-t border-amber-600/20 pt-1.5 text-[10px] text-stone-500">
          Click a name to select that settler.
        </p>
      )}
    </GameWindow>
  );
}
