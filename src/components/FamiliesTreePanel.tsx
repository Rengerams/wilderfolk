/**
 * Valley Overview → Village: surname browser + per-person stamboom
 * (grandparents, aunts/uncles, parents, spouse, siblings, children, nephews/nieces).
 */
import { useMemo, useState } from 'react';
import type { Entity, WorldState } from '../game/gameTypes';
import { citizenGivenName, humanDisplayName } from '../game/citizenId';
import {
  buildFamilyTree,
  groupFamiliesBySurname,
  type FamilyTree,
  type KinMember,
} from '../game/familyTree';
import { isPlayerHuman } from '../game/playerHuman';
import { EntityType } from '../game/gameTypes';
import Emoji from './Emoji';

const GENERATION_TITLE: Record<number, string> = {
  0: 'Grandparents',
  1: 'Parents & aunts / uncles',
  2: 'Spouse & siblings',
  3: 'Children & nephews / nieces',
  4: 'Grandchildren',
};

export interface FamiliesTreePanelProps {
  state: WorldState;
  onFocusCitizen: (entity: Entity) => void;
}

export default function FamiliesTreePanel({ state, onFocusCitizen }: FamiliesTreePanelProps) {
  const people = useMemo(
    () => state.entities.filter((e) => e.alive && e.type === EntityType.Human && isPlayerHuman(e)),
    [state.entities],
  );
  const groups = useMemo(() => groupFamiliesBySurname(state.entities), [state.entities]);
  const [focusId, setFocusId] = useState<number | null>(null);

  // Start on a real settler so a stamboom renders as soon as the panel opens;
  // clicking a name chip overrides it.
  const focus = (focusId != null ? people.find((p) => p.id === focusId) : null) ?? people[0] ?? null;
  const tree: FamilyTree | null = useMemo(
    () => (focus ? buildFamilyTree(focus, state.entities) : null),
    [focus, state.entities],
  );

  if (people.length === 0) {
    return <p className="text-[13px] text-stone-400">No living settlers yet.</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-[12px] leading-relaxed text-stone-300">
        Pick a settler to see their family tree — grandparents, aunts and uncles, parents,
        spouse, siblings, children, nephews and nieces.
      </p>

      <div className="space-y-2">
        {groups.map((group) => (
          <div
            key={group.surname}
            className="rounded-lg border border-stone-600/40 bg-stone-900/40 p-2"
          >
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <p className="text-[13px] font-bold text-stone-100">{group.surname}</p>
              <p className="text-[11px] text-stone-400">
                {group.adults} adult{group.adults === 1 ? '' : 's'}
                {group.children > 0 ? ` · ${group.children} child${group.children === 1 ? '' : 'ren'}` : ''}
                {group.generations > 1 ? ` · ${group.generations} gens` : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-1">
              {group.members.map((person) => {
                const selected = focus?.id === person.id;
                return (
                  <button
                    key={person.id}
                    type="button"
                    onClick={() => setFocusId(person.id)}
                    className={`rounded-lg px-2 py-1 text-[12px] font-semibold transition-colors ${
                      selected
                        ? 'bg-violet-700/80 text-violet-50 ring-1 ring-violet-400/50'
                        : 'bg-stone-800/70 text-stone-200 hover:bg-stone-700/80'
                    }`}
                    title={`Show ${humanDisplayName(person)}'s family tree`}
                  >
                    <Emoji className="mr-0.5">{person.isJuvenile ? (person.gender === 'male' ? '👦' : '👧') : (person.gender === 'male' ? '👨' : '👩')}</Emoji>
                    {citizenGivenName(person)}
                    {person.isJuvenile ? ' · child' : ''}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {tree && focus && (
        <div className="rounded-xl border border-violet-500/35 bg-violet-950/25 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-300">
                Family tree
              </p>
              <h4 className="text-sm font-black text-stone-50">{tree.focusName}</h4>
              <p className="text-[11px] text-stone-400">
                {[
                  tree.counts.grandparents ? `${tree.counts.grandparents} grandparent${tree.counts.grandparents === 1 ? '' : 's'}` : null,
                  tree.counts.auntsUncles ? `${tree.counts.auntsUncles} aunt/uncle` : null,
                  tree.counts.children ? `${tree.counts.children} child${tree.counts.children === 1 ? '' : 'ren'}` : null,
                  tree.counts.nephewsNieces ? `${tree.counts.nephewsNieces} nephew/niece` : null,
                ].filter(Boolean).join(' · ') || 'No living kin linked yet'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onFocusCitizen(focus)}
              className="rounded-lg bg-emerald-800/80 px-2.5 py-1.5 text-[12px] font-bold text-emerald-50 ring-1 ring-emerald-500/40 hover:bg-emerald-700"
            >
              Find on map
            </button>
          </div>

          {tree.members.length === 0 ? (
            <p className="text-[13px] text-stone-400">
              No parents, spouse, or children recorded for this settler yet.
            </p>
          ) : (
            <div className="space-y-3">
              {[0, 1, 2, 3, 4].map((gen) => {
                const row = tree.members.filter((m) => m.generation === gen);
                if (row.length === 0) return null;
                return (
                  <div key={gen}>
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-stone-500">
                      {GENERATION_TITLE[gen]}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {row.map((member) => (
                        <KinChip
                          key={`${member.id}-${member.relation}`}
                          member={member}
                          onOpen={() => setFocusId(member.id)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function KinChip({ member, onOpen }: { member: KinMember; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title={`${member.relationLabel} — show their tree`}
      className="rounded-lg border border-stone-600/50 bg-stone-900/70 px-2 py-1.5 text-left transition-colors hover:border-violet-400/40 hover:bg-stone-800"
    >
      <p className="text-[10px] font-bold uppercase tracking-wide text-violet-300/90">
        {member.relationLabel}
      </p>
      <p className="text-[12px] font-semibold text-stone-100">
        <Emoji className="mr-0.5">{member.icon}</Emoji>
        {member.name}
      </p>
    </button>
  );
}
