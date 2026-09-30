import {
  EntityType,
  isVillageLeader,
  getHumanArmamentLabel,
  getAgeInYears,
} from '../game/gameEngine';
import type { WorldState, Entity } from '../game/gameEngine';
import type { VisitorGroup } from '../game/gameTypes';
import {
  hasResidenceAssignment,
  hasWorkAssignment,
  isImprisoned,
  PREGNANCY_TICKS,
  daysUntilTick,
  getBirthDateString,
} from '../game/dayCycle';
import { TRAIT_DEFS } from '../game/settlerTraits';
import { getHumanVariantLabel } from '../game/humanSprites';
import { getTameFoodCost } from '../game/buildingActions';
import { hasNearbyPlayerTamingPost, listTamingCandidates } from '../game/settlerInteractionActions';
import { getBuildingConfig } from '../game/buildingConfig';
import { useEffect, useMemo, useState } from 'react';
import SubjectWindow from './SubjectWindow';
import { getHumanActivityProjection } from '../game/humanStatus';
import { explainSettlerMovement } from '../game/dashboardData';
import { citizenFullName, citizenGivenName, humanDisplayName } from '../game/citizenId';

/** One relative, as the Family section draws them. */
export interface FamilyNode {
  id: number;
  label: string;
  name: string;
  relation: string;
  /** Age, or the other parent of a child — the qualifier the row needs to be unambiguous. */
  detail?: string;
}

/** A settler's relatives, grouped by generation. */
export interface FamilyTree {
  parents: FamilyNode[];
  siblings: FamilyNode[];
  children: FamilyNode[];
  partner: FamilyNode | null;
}

/**
 * The settler's relatives, **grouped by generation** — what the Family section renders.
 *
 * This replaced a flat `getFamilyMembers` array in which a spouse, a parent, a sibling and a child
 * all arrived as identical rows, distinguishable only by a `(relation)` in parentheses. The owner's
 * report is the reason it is grouped now: *"the family tree is no family tree its unclear who is
 * who"*. Which row a relative is drawn on says which generation they belong to, so the layout
 * carries the meaning instead of one word in brackets.
 *
 * Adoptive parents are included and **marked** — the old list omitted them entirely, so a settler
 * raised by someone other than their birth parents showed no parents at all.
 */
export function buildFamilyTree(entity: Entity, allEntities: Entity[]): FamilyTree {
  const livingHumans = allEntities.filter(
    (e) => e.alive && e.type === EntityType.Human && e.id !== entity.id,
  );
  const seen = new Set<number>();
  const take = (e: Entity, label: string, relation: string, detail?: string): FamilyNode | null => {
    if (seen.has(e.id)) return null;
    seen.add(e.id);
    return {
      id: e.id,
      label,
      // `citizenGivenName` owns the nameless fallback; this list used to say "Unknown" while the
 // tree header for the same settler said "A settler".
      name: citizenGivenName(e),
      relation,
      detail,
    };
  };

  const parents: FamilyNode[] = [];
  for (const e of livingHumans) {
    const match =
      e.id === entity.fatherId ? { label: '👨', relation: 'Father' }
      : e.id === entity.motherId ? { label: '👩', relation: 'Mother' }
      : e.id === entity.adoptiveFatherId ? { label: '👨', relation: 'Adoptive father' }
      : e.id === entity.adoptiveMotherId ? { label: '👩', relation: 'Adoptive mother' }
      : null;
    if (!match) continue;
    // Age on every relative, not only on children. The owner asked why the parents had none
    // (*"why no age at the paretns"*) — the row showed a name and a relation while the child rows
    // below carried `18y`, so the tree was inconsistent about what it told you about a person.
    const node = take(e, match.label, match.relation, `${Math.floor(e.age)}y`);
    if (node) parents.push(node);
  }

  // The partner they are actually with. Marriages only — courting, sweethearts and a secret affair
  // are shown with their own meters in the relationships block above, not in the tree.
  let partner: FamilyNode | null = null;
  for (const e of livingHumans) {
    if (e.partnerId !== entity.id && e.id !== entity.partnerId) continue;
    partner = take(e, e.gender === 'male' ? '👨' : '👩', 'Spouse', `${Math.floor(e.age)}y`);
    break;
  }

  // A sibling shares either parent. The old list tested each side in two separate `if`s against the
  // same `seen` set, so which parent matched decided the order rather than the relationship.
  const siblings: FamilyNode[] = [];
  for (const e of livingHumans) {
    const shares =
      (entity.motherId != null && e.motherId === entity.motherId)
      || (entity.fatherId != null && e.fatherId === entity.fatherId);
    if (!shares) continue;
    const node = take(e, e.gender === 'male' ? '👦' : '👧', 'Sibling');
    if (node) siblings.push(node);
  }

  const children: FamilyNode[] = [];
  for (const e of livingHumans) {
    const isChild =
      (entity.childrenIds ?? []).includes(e.id) || e.motherId === entity.id || e.fatherId === entity.id;
    if (!isChild) continue;
    // Name the other parent when it is NOT this settler's spouse, so a child from an earlier
    // marriage is never silently attributed to the current one.
    const otherParentId = e.motherId === entity.id ? e.fatherId : e.motherId;
    const otherParent =
      otherParentId != null && otherParentId !== entity.partnerId
        ? allEntities.find((candidate) => candidate.id === otherParentId)
        : undefined;
    const age = `${Math.floor(e.age)}y`;
    const relation = e.isBastard
      ? e.isJuvenile ? 'Child · outside wedlock' : 'Adult child · outside wedlock'
      : e.isJuvenile ? 'Child' : 'Adult child';
    const node = take(
      e,
      e.gender === 'male' ? '👦' : '👧',
      relation,
      otherParent ? `${age} · with ${citizenGivenName(otherParent)}` : age,
    );
    if (node) children.push(node);
  }

  return { parents, siblings, children, partner };
}

/** One generation's row of the tree — renders nothing when that generation is empty. */
export function FamilyGeneration({
  label,
  nodes,
  inset = false,
}: {
  label: string;
  nodes: FamilyNode[];
  inset?: boolean;
}) {
  if (nodes.length === 0) return null;
  return (
    <div className={inset ? 'mt-1' : ''}>
      <p className="text-[10px] uppercase tracking-wide text-amber-400/70">{label}</p>
      <ul className="mt-0.5 space-y-0.5">
        {nodes.map((node) => (
          <li key={node.id} className="flex flex-wrap items-baseline gap-x-1.5 text-amber-200">
            <span aria-hidden>{node.label}</span>
            <span className="font-semibold">{node.name}</span>
            <span className="text-stone-400">{node.relation}</span>
            {node.detail && <span className="text-stone-500">{node.detail}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function countLivingChildren(entity: Entity, allEntities: Entity[]): number {
  return allEntities.filter((e) =>
    e.alive
    && e.type === EntityType.Human
    && ((entity.childrenIds ?? []).includes(e.id) || e.motherId === entity.id || e.fatherId === entity.id),
  ).length;
}

export default function SelectedEntityPanel({
  entity,
  allEntities,
  state,
  isFavorite,
  onToggleFavorite,
  onTame,
  onOpenVisitorCamp,
  onOpenFamilyTree,
}: {
  entity: Entity;
  allEntities: Entity[];
  state: WorldState;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  onTame?: (humanId: number) => void;
  onOpenVisitorCamp?: (group: VisitorGroup) => void;
  /** Opens the family tree in its own window (`FamilyTreeWindow`). */
  onOpenFamilyTree?: () => void;
}) {
  const [lastActivity, setLastActivity] = useState<{ entityId: number; activity: string } | null>(null);
  /**
   * Which of this citizen's subjects has its window open, if any.
   *
   * Owner ruling: *"each subject should just have its own window not stacking up"*, and the owner's own
   * entry point for this panel: *"right side only citizin information when you click on them"* — so the
   * right column keeps the **identity and what she is doing right now** (name, activity, schedule,
   * target, movement), which is the citizen information, and her facts open as subjects: life & work,
   * relationships, traits. The panel is re-keyed per selection (`App.tsx`), so which subject is open
   * never outlives the citizen it belongs to.
   */
  const [openSubject, setOpenSubject] = useState<'life' | 'traits' | null>(null);
  const closeSubject = () => setOpenSubject(null);
  const isVillageHead = isVillageLeader(state, entity.id);
  const isHuman = entity.type === EntityType.Human;

  const previousActivity = lastActivity?.entityId === entity.id
    ? lastActivity.activity
    : undefined;

  const activityProjection = isHuman || entity.type === EntityType.Werewolf
    ? getHumanActivityProjection(state, entity, previousActivity)
    : null;

  // Remember the last shown activity for this entity so transitions can be
  // annotated. Keyed on the primitive activity string to avoid resyncing on
  // unrelated re-renders.
  const currentActivity = activityProjection?.activity;
  useEffect(() => {
    const record = () => {
      if (currentActivity != null) {
        setLastActivity({ entityId: entity.id, activity: currentActivity });
      }
    };
    record();
  }, [currentActivity, entity.id]);

  const isVisitor = entity.faction === 'visitor';
  const isRival = entity.faction === 'rival';
  
  const visitorGroup = isVisitor ? state.visitorGroups?.find((g) => g.id === entity.groupId) : null;
  const rivalCamp = isRival ? state.rivalSettlements?.find((r) => r.id === entity.groupId) : null;

  /**
   * P5 — the movement reason trace for this settler: the day's named stops in order, the leg they are
   * on, and the path owner's blocked/rerouting verdict. Read-only projection; the panel prints its
   * lines and derives nothing.
   */
  const movementExplanation = isHuman && !isVisitor && !isRival
    ? explainSettlerMovement(state, entity.id)
    : null;

  // 🚀 PERFORMANCE: Memoize expensive array filtering and derivations
  const tree = useMemo(() => {
    return isHuman && !isVisitor && !isRival
      ? buildFamilyTree(entity, allEntities)
      : ({ parents: [], siblings: [], children: [], partner: null } as FamilyTree);
  }, [isHuman, isVisitor, isRival, entity, allEntities]);

  const childCount = useMemo(() => {
    return isHuman && !isVisitor && !isRival ? countLivingChildren(entity, allEntities) : 0;
  }, [isHuman, isVisitor, isRival, entity, allEntities]);

  // Both come from the taming owner: the local list offered visitors/rivals (a click did nothing, since
  // the command refuses them) and the local reach test was paired with a command that added half a
  // footprint to the post's position. `building.x/y` is the footprint **centre** (the pad and sprite are
  // drawn from `x - w/2`; the bounds/terrain/overlap checks use `x ± w/2`), so both now measure from the
  // centre (`LIVE-FINDINGS-STATUS.md`, F16 and F17).
  const availableHumans = useMemo(() => listTamingCandidates(state), [state]);

  const tameableTypes: EntityType[] = [EntityType.Wolf, EntityType.Fox, EntityType.Deer, EntityType.Rabbit];
  const isTameable = tameableTypes.includes(entity.type) && !entity.tamedBy;
  const isMoonHowler = entity.type === EntityType.Werewolf && !!entity.moonHowlerCursed;
  const tamer = entity.tamedBy ? allEntities.find(e => e.id === entity.tamedBy && e.alive) : null;
  const hasTamingPost = hasNearbyPlayerTamingPost(state, entity);
  const canTameHere = hasTamingPost;
  const tameFoodCost = getTameFoodCost(entity.type);
  
  // Safe access to resources food to prevent undefined crashes during initialization
  const currentFood = state.resources?.food ?? 0;
  const canAffordTame = tameFoodCost == null || currentFood >= tameFoodCost;

  return (
    <div className={`rounded-xl p-3 ${isVillageHead ? 'border-2 border-amber-400/70 bg-gradient-to-b from-amber-900/45 to-amber-950/30 shadow-md shadow-amber-900/30' : 'border border-amber-600/30 bg-amber-900/20'}`}>
      {isVillageHead && (
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-amber-500/20 px-2 py-1.5 ring-1 ring-amber-400/50">
          <span className="text-base leading-none" aria-hidden>👑</span>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-amber-200">Village head</p>
            <p className="text-[11px] text-amber-100/90">
              In office since Year {state.leaderSinceYear}
              {state.pendingElectionYear != null ? ` · next vote Y${state.pendingElectionYear}` : ''}
            </p>
          </div>
        </div>
      )}
      <div className="mb-2 flex items-start gap-2">
        <span className="text-lg">
          {entity.type === EntityType.Human ? (entity.gender === 'male' ? '👨' : '👩') :
           entity.type === EntityType.Rabbit ? '🐰' : entity.type === EntityType.Deer ? '🦌' :
           entity.type === EntityType.Wolf ? '🐺' : entity.type === EntityType.Fox ? '🦊' :
           entity.type === EntityType.Werewolf ? '🌝' : entity.type === EntityType.Wildkin ? '🦌' :
           entity.type === EntityType.Tree ? '🌲' : '🌿'}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className={`text-sm font-bold ${isVillageHead ? 'text-amber-100' : 'text-amber-200'}`}>
            {isHuman || entity.type === EntityType.Werewolf
              ? `${isVillageHead ? '👑 ' : ''}${humanDisplayName(entity)}${entity.type === EntityType.Werewolf ? ' (Moon Howler)' : ''}`
              : entity.type}
          </h3>
          {(isHuman || entity.type === EntityType.Werewolf) && (
            <p className="text-[11px] font-semibold text-lime-300">
              🕐 {activityProjection?.activity}
            </p>
          )}
          {activityProjection && (
            <div className="mt-1 rounded-lg border border-sky-700/40 bg-sky-950/25 p-1.5 text-[10px] text-sky-100">
              <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
                <span className="text-sky-300/70">Schedule</span>
                <span>{activityProjection.schedule.label} · {activityProjection.schedule.onShift ? 'on shift' : 'off shift'}</span>
                <span className="text-sky-300/70">Target</span>
                <span>{activityProjection.target ? `${activityProjection.target.label} (${activityProjection.target.kind})` : 'None'}</span>
                <span className="text-sky-300/70">Observed</span>
                <span>Tick {activityProjection.observedAtTick.toLocaleString()}</span>
                {activityProjection.transition && (
                  <>
                    <span className="text-sky-300/70">Changed</span>
                    <span>{activityProjection.transition.from} → {activityProjection.transition.to}</span>
                  </>
                )}
              </div>
              {activityProjection.blockedReason && (
                <p className="mt-1 rounded bg-rose-950/50 px-1.5 py-1 text-rose-200">Blocked: {activityProjection.blockedReason}</p>
              )}
            </div>
          )}
          {movementExplanation && (
            <div className="mt-1 rounded-lg border border-emerald-700/40 bg-emerald-950/25 p-1.5 text-[10px]">
              <p className="mb-0.5 font-semibold uppercase tracking-wider text-emerald-300">Movement</p>
              <div className="space-y-0.5">
                {movementExplanation.lines.map((line, index) => (
                  <p key={`${line.label}-${index}`}>
                    <span className="text-stone-400">{line.label}: </span>
                    <span className={
                      line.tone === 'warn' ? 'text-rose-300' : line.tone === 'good' ? 'text-emerald-300' : 'text-stone-200'
                    }>
                      {line.value}
                    </span>
                  </p>
                ))}
              </div>
            </div>
          )}
          {isMoonHowler && (
            <p className="text-[11px] font-semibold text-rose-300">🌝 Full moon form — curse NOT cured · hunting tonight</p>
          )}
          {isHuman && entity.moonHowlerCursed && (
            <p className="text-[11px] font-semibold text-violet-300">🌝 Moon Howler curse — transforms again every 14 days until cured</p>
          )}
          {/* The trait chips that used to sit in this header are the **Traits** subject now — its own
              window, opened from the index below. A trait list is a subject, not a subtitle. */}
          {isVisitor && visitorGroup && (
            <p className="text-[11px] text-cyan-300">Visiting — {visitorGroup.name} ({visitorGroup.daysLeft}d)</p>
          )}
          {isVisitor && visitorGroup && onOpenVisitorCamp && (
            <button
              type="button"
              onClick={() => onOpenVisitorCamp(visitorGroup)}
              className="mt-1 rounded bg-cyan-900/60 px-2 py-0.5 text-[10px] font-bold text-cyan-100 hover:bg-cyan-800/60"
            >
              Open camp — trade &amp; talks
            </button>
          )}
          {isRival && rivalCamp && (
            <p className="text-[11px] text-amber-300">Settler of {rivalCamp.name} · {rivalCamp.relationship}</p>
          )}
          {isHuman && !isVisitor && !isRival && (
            <p className="text-[11px] text-amber-400">
              <span className="font-mono text-stone-400">Citizen #{entity.id}</span>
              {' · '}
              {entity.gender === 'male' ? '♂' : '♀'} {entity.relationshipStatus || 'child'}
              {(entity.generation ?? 0) > 0 ? ` · Gen ${entity.generation}` : ''}
            </p>
          )}
        </div>
        {onToggleFavorite && (
          <button
            type="button"
            onClick={onToggleFavorite}
            title={isFavorite ? 'Stop following this citizen' : 'Favorite — camera follows on the map'}
            aria-label={isFavorite ? 'Stop following' : 'Favorite and follow'}
            aria-pressed={!!isFavorite}
            className={`shrink-0 rounded-lg px-2 py-1 text-sm leading-none transition-colors ${
              isFavorite
                ? 'bg-amber-500/25 text-amber-200 ring-1 ring-amber-400/50 hover:bg-amber-500/35'
                : 'bg-stone-800/70 text-stone-400 hover:bg-stone-700 hover:text-amber-200'
            }`}
          >
            {isFavorite ? '⭐' : '☆'}
          </button>
        )}
      </div>
      {isFavorite && onToggleFavorite && (
        <p className="mb-2 rounded-lg border border-amber-500/30 bg-amber-950/40 px-2 py-1 text-[11px] text-amber-100/90">
          Following on the map — camera stays with them. Tap ⭐ again to stop.
        </p>
      )}

      {/*
        The index. The right column keeps the citizen's identity and what she is doing right now; her
        facts are subjects, each in its own window (`SubjectWindow`), because the owner ruled against
        stacking (`"each subject should just have its own window not stacking up"`) and this card was
        the "one long stack" they reported first: energy, age, home, work, marriage, affairs, children,
        traits, all in one column.
      */}
      {isHuman && !isVisitor && !isRival && (
        <div className="mt-2 space-y-1">
          {([
            { id: 'life' as const, icon: '⚡', label: 'Life & bonds', hint: 'Energy, age, home, job, gear, family, affairs' },
            { id: 'traits' as const, icon: '🎭', label: 'Traits', hint: entity.traits?.length ? `${entity.traits.length} trait${entity.traits.length === 1 ? '' : 's'}` : 'None yet' },
          ]).map((subject) => (
            <button
              key={subject.id}
              type="button"
              onClick={() => setOpenSubject(subject.id)}
              aria-current={openSubject === subject.id}
              className={`block w-full rounded-lg px-2 py-1.5 text-left ring-1 transition-colors ${
                openSubject === subject.id
                  ? 'bg-amber-900/50 ring-amber-500/50'
                  : 'bg-stone-800/60 ring-stone-600/40 hover:bg-stone-700/60'
              }`}
            >
              <span className="flex items-center gap-1 text-[12px] font-bold text-amber-100">
                <span aria-hidden>{subject.icon}</span>
                {subject.label}
                <span aria-hidden className="ml-auto text-stone-400">↗</span>
              </span>
              <span className="block text-[10px] leading-snug text-stone-400">{subject.hint}</span>
            </button>
          ))}
        </div>
      )}

      {isHuman && entity.traits && entity.traits.length > 0 && (
        <SubjectWindow
          windowKey={`citizen-traits-${entity.id}`}
          open={openSubject === 'traits'}
          onClose={closeSubject}
          icon="🎭"
          title={`${humanDisplayName(entity)} — Traits`}
          subtitle={`${entity.traits.length} trait${entity.traits.length === 1 ? '' : 's'}`}
        >
          <div className="space-y-1">
            {entity.traits.map((trait) => {
              const def = TRAIT_DEFS[trait];
              return def ? (
                <div key={trait} className="rounded-lg border border-stone-600/50 bg-stone-800/40 px-2 py-1">
                  <p className="text-[13px] font-bold text-amber-100">{def.emoji} {def.label}</p>
                  <p className="text-[11px] leading-snug text-stone-300">{def.description}</p>
                </div>
              ) : null;
            })}
          </div>
        </SubjectWindow>
      )}

      {/* The Food Chain Role block is **deleted**, on the owner's own reason rather than mine:
          *"work is already defined lower in the civ viewer and civilationd builder is nothign"*.

          Two independent facts make it redundant. (1) This settler's work is already shown further
          down this card — `💼 occupation` plus the job and skill lines — so a second "role" line is a
          duplicate of a fact the card already carries. (2) "Civilization Builder" says nothing: it is
          the *species'* trophic role, a constant (`human: { role: 'Civilization Builder' }`) printed
          on an individual settler, so it read as that person's job while carrying no information about
          them — every citizen, a newborn included, was a "Civilization Builder".

          The earlier pass relabelled it ("Role" → "Species role", under "Food chain · humans"), which
          is why the owner had to report it a second time. Renaming a meaningless, duplicated line
          cannot fix it. Do not reinstate it as a rename. */}

      <SubjectWindow
        windowKey={`citizen-life-${entity.id}`}
        open={openSubject === 'life'}
        onClose={closeSubject}
        icon="⚡"
        title={`${humanDisplayName(entity)} — Life & bonds`}
        subtitle={`Energy ${Math.round(entity.energy)} / ${entity.maxEnergy} · ${getAgeInYears(entity, state)} years`}
      >
      <div className="space-y-0.5 text-xs text-amber-200">
        <p>Energy: {Math.round(entity.energy)} / {entity.maxEnergy}</p>
        <p>Age: {getAgeInYears(entity, state)} years{entity.isJuvenile && ' (child)'} — b. {getBirthDateString(entity)}</p>
        {entity.huntTargetId && (
          <p className="text-orange-300">🏹 Chasing prey — watch the dashed hunt line on the map</p>
        )}
        {entity.combatTicks && entity.combatTicks > 0 && (
          <p className="text-amber-300">⚔️ In combat</p>
        )}
        {isHuman && !isVisitor && !isRival && getHumanArmamentLabel(state) && (
          <p className="text-sky-300">⚔️ Village gear: {getHumanArmamentLabel(state)}</p>
        )}
        {entity.tamedBy && (
          <p className="text-emerald-400">🦴 Tamed by {tamer?.name || 'a settler'}</p>
        )}
        {isHuman && !isVisitor && !isRival && (
          <>
            {hasResidenceAssignment(entity) ? (() => {
              const home = state.buildings.find((b) => b.id === entity.residenceBuildingId);
              const label = home ? getBuildingConfig(home.type).label : 'Home';
              return <p className="text-sky-300">🏠 Lives in: {label}</p>;
            })() : (
              <p className="text-rose-300">🏠 No home yet — build a House (auto-assigned when ready)</p>
            )}
            {isImprisoned(entity) ? (() => {
              const prison = state.buildings.find((b) => b.id === entity.prisonBuildingId);
              const daysLeft = entity.prisonerUntilTick ? daysUntilTick(state.tick, entity.prisonerUntilTick) : 0;
              return (
                <p className="text-slate-400">
                  ⛓️ Imprisoned{prison ? ` at ${getBuildingConfig(prison.type).label}` : ''} · {daysLeft} day{daysLeft === 1 ? '' : 's'} left
                </p>
              );
            })() : hasWorkAssignment(entity) ? (() => {
              const jobSite = state.buildings.find((b) => b.id === entity.homeBuildingId);
              const label = jobSite ? getBuildingConfig(jobSite.type).label : 'Workplace';
              return <p className="text-emerald-300">🔨 Works at: {label}</p>;
            })() : !entity.isJuvenile && !entity.pregnant && (
              <p className="text-amber-300">🔨 Unemployed — no work assigned</p>
            )}
            <p className="text-sky-300">👕 {getHumanVariantLabel(entity.gender, entity.spriteVariant ?? 0)}</p>
            {entity.occupation && entity.occupation !== 'settler' && <p>💼 {entity.occupation}</p>}
            {entity.job && (entity.skills?.[entity.job] ?? 0) > 0 && (
              <p className="text-emerald-400">⭐ {entity.job} skill: {Math.round(entity.skills?.[entity.job] ?? 0)}/100</p>
            )}
            {entity.pregnant && (
              <p className="font-bold text-pink-400">
                🤰 Pregnant! ({Math.round(((entity.pregnancyProgress || 0) / PREGNANCY_TICKS) * 100)}%)
              </p>
            )}
            {entity.partnerId && entity.relationshipStatus === 'married' && (() => {
              const spouse = allEntities.find((e) => e.id === entity.partnerId && e.alive);
              const spouseLabel = spouse
                ? citizenFullName(spouse)
                : 'partner';
              return <p className="text-amber-300">💍 Married to {spouseLabel}</p>;
            })()}
            {entity.affairPartnerId != null && (() => {
              const lover = allEntities.find((e) => e.id === entity.affairPartnerId && e.alive);
              return (
                <p className="text-rose-300/90">
                  💋 Secret affair{lover?.name ? ` with ${lover.name}` : ''}
                  {entity.affairProgress != null && entity.affairProgress < 100
                    ? ` (${Math.round(entity.affairProgress)}%)`
                    : ''}
                </p>
              );
            })()}
            {/* Affair progress accumulates over several trysts *before* `affairPartnerId` is set at
                100, and that whole build-up was invisible — the panel only read the established id.
                Only the established pair gets a name: before establishment there is no recorded
                paramour to name. */}
            {entity.affairPartnerId == null && (entity.affairProgress ?? 0) > 0 && (
              <p className="text-rose-300/70">💋 Secret affair brewing ({Math.round(entity.affairProgress ?? 0)}%)</p>
            )}
            {entity.isBastard && <p className="text-violet-300">⚜ Born outside wedlock</p>}
            {childCount > 0 && (
              <p className="text-pink-200">
                👶 {childCount} child{childCount === 1 ? '' : 'ren'}
              </p>
            )}
            {/* Youth love (12–17) is a real mutual pair bond in the simulation, but nothing rendered
                it: no panel line, no counter, no map badge — only a generic 🌝 log entry. The
                sweetheart's given name and surname match the marriage line above; the `#id` form is
                the Chronicle's. */}
            {entity.youthLovePartnerId != null && (() => {
              const sweetheart = allEntities.find((e) => e.id === entity.youthLovePartnerId && e.alive);
              return (
                <p className="text-pink-300">
                  💗 Sweethearts{sweetheart ? ` with ${citizenFullName(sweetheart)}` : ''}
                  {` (${Math.round(entity.youthLoveProgress ?? 0)}%)`}
                </p>
              );
            })()}
            {entity.courtshipProgress && entity.courtshipProgress > 0 && entity.relationshipStatus === 'single' && (
              <p className="text-pink-300">💕 Courting... {entity.courtshipProgress}%</p>
            )}
          </>
        )}
      </div>
      </SubjectWindow>

      {isMoonHowler && (
        <p className="mt-2 text-[11px] text-rose-300">🌝 Curse NOT cured — hunting tonight. Staff a Church; the priest may break the curse while they are in Moon Howler form.</p>
      )}

      {/* Taming */}
      {isTameable && (
        <div className="mt-2 space-y-1">
          {!canTameHere ? (
            <p className="text-[11px] text-rose-400">Build a Taming Post nearby to tame.</p>
          ) : availableHumans.length === 0 ? (
            <p className="text-[11px] text-stone-300">No adult settler available to tame.</p>
          ) : (
            <div className="space-y-1">
              <p className="text-[11px] text-stone-300">
                Assign a settler to tame{tameFoodCost != null ? ` (${tameFoodCost} food)` : ''}:
              </p>
              <div className="grid grid-cols-2 gap-1">
                {availableHumans.slice(0, 4).map(h => (
                  <button
                    key={h.id}
                    onClick={() => onTame?.(h.id)}
                    disabled={!canAffordTame}
                    className="rounded bg-emerald-700 px-1.5 py-1 text-[10px] font-bold text-white hover:bg-emerald-600 transition-all disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    🦴 {citizenGivenName(h)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Family — the tree itself lives in its own window (`FamilyTreeWindow`). The inspector keeps
          only a one-line summary and the door to it, because the whole tree inlined here was part of
          what made this panel one long stack ("not stacking up all").

          The door is **always** rendered, where it used to appear only for a settler who had a
          parent, sibling, child or partner. That condition is why the owner reported *"it doesnt work
          when i cick on famliy three"*: clicking a settler with no recorded relatives showed no
          control at all, so the feature looked broken rather than empty — and a freshly-founded
          colony is full of exactly those settlers. The window already has an explicit empty state
          ("No living relatives recorded"), so the honest place to say that is inside the window. */}
      <div className="mt-2 border-t border-amber-600/20 pt-2">
        <button
          type="button"
          onClick={onOpenFamilyTree}
          className="flex w-full items-center justify-between gap-2 rounded bg-stone-800/60 px-2 py-1.5 text-left text-[11px] text-amber-200 hover:bg-stone-700/60"
          title="Open the family tree in its own window"
        >
          <span className="font-bold uppercase tracking-wider text-amber-400">Family tree</span>
          <span className="min-w-0 truncate text-stone-300">
            {tree.parents.length + tree.siblings.length + tree.children.length + (tree.partner ? 1 : 0) === 0
              ? 'no relatives recorded'
              : `${tree.partner ? `⚭ ${tree.partner.name} · ` : ''}${tree.children.length} child${tree.children.length === 1 ? '' : 'ren'}`}
          </span>
          <span aria-hidden className="text-amber-400">↗</span>
        </button>
      </div>
    </div>
  );
}