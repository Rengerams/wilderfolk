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
} from '../game/housingModel';
import { daysUntilTick, getBirthDateString } from '../game/dayCycle';
import { getPregnancyProgressFraction } from '../game/simulation/humanLifecycle';
import { isMarriedOrExpecting } from '../game/relationships';
import { APTITUDE_DEFS, APTITUDE_IDS, expressAptitudes } from '../game/settlerTraits';
import { getHumanVariantLabel } from '../game/humanSprites';
import { getTameFoodCost } from '../game/settlerInteractionActions';
import { hasNearbyPlayerTamingPost, listTamingCandidates, getTameEntityEligibility } from '../game/settlerInteractionActions';
import { getBuildingConfig } from '../game/buildingConfig';
import { useEffect, useState } from 'react';
import { getHumanActivityProjection } from '../game/humanStatus';
import { explainSettlerMovement } from '../game/dashboardData';
import { citizenFullName, citizenGivenName, humanDisplayName } from '../game/citizenId';
import { displayYear } from '../game/dayCycleClock';
import PersonalityCareerDetails from './PersonalityCareerDetails';

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
  const isVillageHead = isVillageLeader(state, entity.id);
  const isHuman = entity.type === EntityType.Human;

  const previousActivity = lastActivity?.entityId === entity.id
    ? lastActivity.activity
    : undefined;

  const activityProjection = isHuman || entity.type === EntityType.Werewolf
    ? getHumanActivityProjection(state, entity, previousActivity)
    : null;

  // Remember the last shown activity for this entity so transitions can be annotated; keyed on the
  // primitive activity string to avoid resyncing on unrelated re-renders.
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

  /** The movement reason trace for this settler — the day's named stops, the current leg and the
   * path owner's blocked/rerouting verdict, printed as-is. Read-only; nothing is derived here. */
  const movementExplanation = isHuman && !isVisitor && !isRival
    ? explainSettlerMovement(state, entity.id)
    : null;

  // Derived each render: the sim mutates the world and its entities in place, so a memo
  // keyed on them cannot see a change.
  const childCount = isHuman && !isVisitor && !isRival ? countLivingChildren(entity, allEntities) : 0;

  // Both come from the taming owner: the candidate list is the one that filters visitors/rivals, and
  // `building.x/y` is the footprint centre, so the reach test measures from the centre.
  const availableHumans = listTamingCandidates(state);

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
  // A tame is the whole colony's food, so affordability is the one gate that disables every candidate.
  const tameDisabled = tameFoodCost != null && !canAffordTame;
  /** Why the buttons are dead, in the taming owner's own words — the panel reads back the price it sets. */
  const tameBlockReason = tameDisabled && availableHumans.length > 0
    ? getTameEntityEligibility(state, entity.id, availableHumans[0].id).blockReason ?? null
    : null;

  return (
    <div className={`rounded-xl p-3 ${isVillageHead ? 'border-2 border-amber-400/70 bg-gradient-to-b from-amber-900/45 to-amber-950/30 shadow-md shadow-amber-900/30' : 'border border-amber-600/30 bg-amber-900/20'}`}>
      {isVillageHead && (
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-amber-500/20 px-2 py-1.5 ring-1 ring-amber-400/50">
          <span className="text-base leading-none" aria-hidden>👑</span>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-amber-200">Village head</p>
            <p className="text-[11px] text-amber-100/90">
              In office since Year {state.leaderSinceYear}
              {state.pendingElectionYear != null ? ` · next vote Y${displayYear(Math.floor(state.pendingElectionYear))}` : ''}
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
              {activityProjection.workReason.code !== 'working' && (
                <p className="mt-1 rounded bg-amber-950/50 px-1.5 py-1 text-amber-100">
                  🔨 {activityProjection.workReason.label}
                </p>
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
          {isHuman && entity.genomeV2 && (
            <div className="mt-0.5 flex flex-wrap gap-1">
              {expressAptitudes(entity.genomeV2).relative
                .map((relative, index) => ({ relative, id: APTITUDE_IDS[index] }))
                .filter((entry) => Math.abs(entry.relative) >= 1)
                .sort((a, b) => Math.abs(b.relative) - Math.abs(a.relative))
                .slice(0, 3)
                .map((entry) => {
                  const def = APTITUDE_DEFS[entry.id];
                  const good = entry.relative > 0;
                  return (
                    <span
                      key={entry.id}
                      title={good ? def.high : def.low}
                      className="rounded bg-stone-700/60 px-1.5 py-0.5 text-[10px] font-semibold text-amber-100/90"
                    >
                      {good ? '＋' : '−'} {def.label}
                    </span>
                  );
                })}
            </div>
          )}
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
              {/* The settler's own name — the entity id is engine bookkeeping, not something to show. */}
              <span className="font-mono text-stone-400">{citizenFullName(entity)}</span>
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

      <div className="space-y-0.5 text-xs text-amber-200">
        {isHuman && !isVisitor && !isRival && entity.needs ? (
          <>
            <p>Nutrition: {Math.round(entity.needs.nutrition)} / 100</p>
            <p>Rest: {Math.round(entity.needs.rest)} / 100</p>
            <p>Stamina: {Math.round(entity.needs.stamina)} / 100</p>
          </>
        ) : <p>Energy: {Math.round(entity.energy)} / {entity.maxEnergy}</p>}
        <p>Age: {getAgeInYears(entity, state)} years{entity.isJuvenile && ' (child)'} — b. {getBirthDateString(entity)}</p>
        {entity.huntTargetId && (
          <p className="text-orange-300">🏹 Chasing prey — watch the dashed hunt line on the map</p>
        )}
        {entity.combatTicks && entity.combatTicks > 0 && (
          <p className="text-amber-300">⚔️ In combat</p>
        )}
        {isHuman && !entity.isJuvenile && !isVisitor && !isRival && getHumanArmamentLabel(state) && (
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
              const jobSite = state.buildings.find((b) => b.id === entity.workerBuildingId);
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
                🤰 Pregnant! ({Math.round(getPregnancyProgressFraction(entity) * 100)}%)
              </p>
            )}
            {entity.partnerId && isMarriedOrExpecting(entity) && (() => {
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
            {/* Progress builds before `affairPartnerId` is set at 100, so a brewing affair is shown
                without a name; only an established pair has a paramour to name. */}
            {entity.affairPartnerId == null && (entity.affairProgress ?? 0) > 0 && (
              <p className="text-rose-300/70">💋 Secret affair brewing ({Math.round(entity.affairProgress ?? 0)}%)</p>
            )}
            {entity.isBastard && <p className="text-violet-300">⚜ Born outside wedlock</p>}
            {childCount > 0 && (
              <p className="text-pink-200">
                👶 {childCount} child{childCount === 1 ? '' : 'ren'}
              </p>
            )}
            {/* Youth love (12–17) is a real pair bond; the sweetheart is named like the marriage line
                above, and the Chronicle's `#id` form is not used here. */}
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

      {/* Its own read-only component: the inspector decides which identities carry DNA and career records. */}
      <PersonalityCareerDetails entity={entity} />

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
                Assign a settler to tame{tameFoodCost != null ? ` (${tameFoodCost} food)` : ''}
                {' · '}
                {availableHumans.length} available:
              </p>
              {/* Every candidate is offered; four stay visible and the list scrolls past them. */}
              <div className="grid max-h-28 grid-cols-2 gap-1 overflow-y-auto overscroll-contain">
                {availableHumans.map(h => (
                  <button
                    key={h.id}
                    onClick={() => onTame?.(h.id)}
                    disabled={tameDisabled}
                    className="rounded bg-emerald-700 px-1.5 py-1 text-[10px] font-bold text-white hover:bg-emerald-600 transition-all disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    🦴 {citizenGivenName(h)}
                  </button>
                ))}
              </div>
              {tameBlockReason && (
                <p className="text-[11px] text-amber-300">{tameBlockReason}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Family — one icon that opens the tree in its own window (`FamilyTreeWindow`, the owner of
          `game/familyTree`). Always rendered; the window owns the empty state. */}
      <div className="mt-2 border-t border-amber-600/20 pt-2">
        <button
          type="button"
          onClick={onOpenFamilyTree}
          className="rounded bg-stone-800/60 px-1.5 py-1 text-[13px] leading-none text-amber-300 hover:bg-stone-700/60"
          title="Family tree"
          aria-label={`Open ${humanDisplayName(entity)}'s family tree`}
        >
          <span aria-hidden>🧬</span>
        </button>
      </div>
    </div>
  );
}