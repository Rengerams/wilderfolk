import {
  EntityType,
  BuildingType,
  isVillageLeader,
  getHumanArmamentLabel,
  getAgeInYears,
} from '../game/gameEngine';
import type { WorldState, Entity } from '../game/gameEngine';
import type { VisitorGroup } from '../game/gameTypes';
import {
  isResidenceBuilding,
  hasResidenceAssignment,
  hasWorkAssignment,
  isImprisoned,
  canMoveOutOfFamilyHome,
  isAdultChildAtHome,
  HUMAN_MOVE_OUT_MIN_AGE,
  PREGNANCY_TICKS,
  TICKS_PER_DAY,
  getBirthDateString,
} from '../game/dayCycle';
import { TRAIT_DEFS } from '../game/settlerTraits';
import { getHumanVariantLabel } from '../game/humanSprites';
import { getTameFoodCost } from '../game/buildingActions';
import { getBuildingConfig } from '../game/buildingConfig';
import { isPlayerHuman } from '../game/playerHuman';

function getFamilyMembers(entity: Entity, allEntities: Entity[]): { label: string; name: string; relation: string }[] {
  const members: { label: string; name: string; relation: string }[] = [];
  const seen = new Set<number>();

  const add = (e: Entity, label: string, relation: string) => {
    if (!e.alive || e.type !== EntityType.Human || e.id === entity.id || seen.has(e.id)) return;
    seen.add(e.id);
    members.push({ label, name: e.name || 'Unknown', relation });
  };

  for (const e of allEntities) {
    if (!e.alive || e.type !== EntityType.Human) continue;
    if (e.id === entity.fatherId) add(e, '👨', 'Father');
    if (e.id === entity.motherId) add(e, '👩', 'Mother');
    if (e.partnerId === entity.id) add(e, e.gender === 'male' ? '👨' : '👩', 'Spouse');
    if (
      (entity.childrenIds ?? []).includes(e.id)
      || e.motherId === entity.id
      || e.fatherId === entity.id
    ) {
      add(
        e,
        e.gender === 'male' ? '👦' : '👧',
        e.isBastard ? (e.isJuvenile ? 'Bastard child' : 'Bastard') : (e.isJuvenile ? 'Child' : 'Adult child'),
      );
    }
    if (entity.motherId && e.motherId === entity.motherId) {
      add(e, e.gender === 'male' ? '👦' : '👧', 'Sibling');
    }
    if (entity.fatherId && e.fatherId === entity.fatherId) {
      add(e, e.gender === 'male' ? '👦' : '👧', 'Sibling');
    }
  }
  return members;
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
  onMoveOut,
  onOpenVisitorCamp,
}: {
  entity: Entity;
  allEntities: Entity[];
  state: WorldState;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  onTame?: (humanId: number) => void;
  onMoveOut?: () => void;
  onOpenVisitorCamp?: (group: VisitorGroup) => void;
}) {
  const isVillageHead = isVillageLeader(state, entity.id);
  const isHuman = entity.type === EntityType.Human;
  const isVisitor = entity.faction === 'visitor';
  const isRival = entity.faction === 'rival';
  const visitorGroup = isVisitor ? state.visitorGroups.find((g) => g.id === entity.groupId) : null;
  const rivalCamp = isRival ? state.rivalSettlements.find((r) => r.id === entity.groupId) : null;
  const family = isHuman && !isVisitor && !isRival ? getFamilyMembers(entity, allEntities) : [];
  const childCount = isHuman && !isVisitor && !isRival ? countLivingChildren(entity, allEntities) : 0;
  const foodChainInfo: Record<string, { role: string; eats: string; huntedBy: string }> = {
    grass: { role: 'Producer', eats: 'Sunlight (photosynthesis)', huntedBy: 'Rabbits, Deer, Foxes, Wildkin' },
    rabbit: { role: 'Prey', eats: 'Grass', huntedBy: 'Foxes, Wolves, Humans' },
    deer: { role: 'Prey', eats: 'Grass', huntedBy: 'Wolves, Humans, Moon Howlers' },
    fox: { role: 'Predator', eats: 'Rabbits, Grass', huntedBy: 'None' },
    wolf: { role: 'Apex Predator', eats: 'Deer, Rabbits', huntedBy: 'None' },
    werewolf: { role: 'Full-Moon Predator', eats: 'Settlers, Deer, Rabbits', huntedBy: 'Church (breaks the curse)' },
    wildkin: { role: 'Gentle Hybrid', eats: 'Grass, Farm Food', huntedBy: 'Wolves, Foxes' },
    human: { role: 'Civilization Builder', eats: 'Deer, Rabbits, Farm Food', huntedBy: 'Moon Howlers (~every 2 weeks)' },
    tree: { role: 'Environment', eats: 'CO2, Sunlight', huntedBy: 'None (provides habitat)' },
  };
  const ecology = foodChainInfo[entity.type] || { role: 'Unknown', eats: 'Unknown', huntedBy: 'Unknown' };

  const tameableTypes: EntityType[] = [EntityType.Wolf, EntityType.Fox, EntityType.Deer, EntityType.Rabbit];
  const isTameable = tameableTypes.includes(entity.type) && !entity.tamedBy;
  const isMoonHowler = entity.type === EntityType.Werewolf && !!entity.moonHowlerCursed;
  const tamer = entity.tamedBy ? allEntities.find(e => e.id === entity.tamedBy && e.alive) : null;
  const hasTamingPost = state.buildings.some(b => b.completed && b.type === BuildingType.TamingPost && Math.hypot(b.x - entity.x, b.y - entity.y) < 140);
  const canTameHere = hasTamingPost;
  const tameFoodCost = getTameFoodCost(entity.type);
  const availableHumans = allEntities.filter(e => e.type === EntityType.Human && e.alive && !e.isJuvenile);
  const playerHumans = allEntities.filter((e) => e.alive && isPlayerHuman(e));
  const residences = state.buildings.filter((b) => b.completed && isResidenceBuilding(b));
  const canMoveOut = isHuman && !isVisitor && !isRival && isAdultChildAtHome(entity, playerHumans);
  const moveOutReady = canMoveOut && canMoveOutOfFamilyHome(entity, playerHumans, residences);

  return (
    <div className={`rounded-xl p-3 ${isVillageHead ? 'border-2 border-amber-400/70 bg-gradient-to-b from-amber-900/45 to-amber-950/30 shadow-md shadow-amber-900/30' : 'border border-amber-600/30 bg-amber-900/20'}`}>
      {isVillageHead && (
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-amber-500/20 px-2 py-1.5 ring-1 ring-amber-400/50">
          <span className="text-base leading-none" aria-hidden>👑</span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide text-amber-200">Village head</p>
            <p className="text-[9px] text-amber-100/90">
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
          <h3 className={`text-xs font-bold ${isVillageHead ? 'text-amber-100' : 'text-amber-200'}`}>
            {isHuman || entity.type === EntityType.Werewolf
              ? `${isVillageHead ? '👑 ' : ''}${entity.name || 'Unnamed'} ${entity.surname || ''}${entity.title ? ` ${entity.title}` : ''}${entity.type === EntityType.Werewolf ? ' (Moon Howler)' : ''}`
              : entity.type}
          </h3>
          {isMoonHowler && (
            <p className="text-[9px] font-semibold text-rose-300">🌝 Full moon form — curse NOT cured · hunting tonight</p>
          )}
          {isHuman && entity.moonHowlerCursed && (
            <p className="text-[9px] font-semibold text-violet-300">🌝 Moon Howler curse — transforms again every 14 days until cured</p>
          )}
          {isHuman && entity.traits && entity.traits.length > 0 && (
            <div className="mt-0.5 flex flex-wrap gap-1">
              {entity.traits.map((trait) => {
                const def = TRAIT_DEFS[trait];
                return def ? (
                  <span
                    key={trait}
                    title={def.description}
                    className="rounded bg-stone-700/60 px-1.5 py-0.5 text-[8px] font-semibold text-amber-100/90"
                  >
                    {def.emoji} {def.label}
                  </span>
                ) : null;
              })}
            </div>
          )}
          {isVisitor && visitorGroup && (
            <p className="text-[9px] text-cyan-300">Visiting — {visitorGroup.name} ({visitorGroup.daysLeft}d)</p>
          )}
          {isVisitor && visitorGroup && onOpenVisitorCamp && (
            <button
              type="button"
              onClick={() => onOpenVisitorCamp(visitorGroup)}
              className="mt-1 rounded bg-cyan-900/60 px-2 py-0.5 text-[8px] font-bold text-cyan-100 hover:bg-cyan-800/60"
            >
              Open camp — trade &amp; talks
            </button>
          )}
          {isRival && rivalCamp && (
            <p className="text-[9px] text-amber-300">Settler of {rivalCamp.name} · {rivalCamp.relationship}</p>
          )}
          {isHuman && !isVisitor && !isRival && (
            <p className="text-[9px] text-amber-400">
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
        <p className="mb-2 rounded-lg border border-amber-500/30 bg-amber-950/40 px-2 py-1 text-[9px] text-amber-100/90">
          Following on the map — camera stays with them. Tap ⭐ again to stop.
        </p>
      )}

      {/* Food Chain Role */}
      <div className="mb-2 rounded bg-stone-800/60 p-2 text-[9px]">
        <div className="grid grid-cols-[3rem_1fr] gap-y-0.5">
          <span className="text-stone-500">Role</span>
          <strong className="text-amber-300">{ecology.role}</strong>
          <span className="text-stone-500">Eats</span>
          <strong className="text-emerald-300">{ecology.eats}</strong>
          <span className="text-stone-500">Hunted</span>
          <strong className="text-rose-300">{ecology.huntedBy}</strong>
        </div>
      </div>

      <div className="space-y-0.5 text-[10px] text-amber-200">
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
            {canMoveOut && (
              <button
                type="button"
                onClick={() => onMoveOut?.()}
                disabled={!moveOutReady}
                title={
                  moveOutReady
                    ? 'Move into an empty house (spouse and your children come too)'
                    : 'Build and finish an empty house first'
                }
                className="mt-1 w-full rounded-lg bg-sky-700/80 px-2 py-1.5 text-[9px] font-bold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-stone-600 disabled:text-stone-400 transition-all"
              >
                🏠 Move to own home ({HUMAN_MOVE_OUT_MIN_AGE}+)
              </button>
            )}
            {isImprisoned(entity) ? (() => {
              const prison = state.buildings.find((b) => b.id === entity.prisonBuildingId);
              const daysLeft = entity.prisonerUntilTick ? Math.max(0, Math.ceil((entity.prisonerUntilTick - state.tick) / TICKS_PER_DAY)) : 0;
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
              <p className="text-stone-400">🔨 No job yet — build a Farm, Mill, etc.</p>
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
                ? `${spouse.name || 'Settler'}${spouse.surname ? ` ${spouse.surname}` : ''}`
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
            {entity.isBastard && <p className="text-violet-300">⚜ Born outside wedlock</p>}
            {childCount > 0 && (
              <p className="text-pink-200">
                👶 {childCount} child{childCount === 1 ? '' : 'ren'}
              </p>
            )}
            {entity.courtshipProgress && entity.courtshipProgress > 0 && entity.relationshipStatus === 'single' && (
              <p className="text-pink-300">💕 Courting... {entity.courtshipProgress}%</p>
            )}
          </>
        )}
      </div>

      {isMoonHowler && (
        <p className="mt-2 text-[9px] text-rose-300">🌝 Curse NOT cured — hunting tonight. Staff a Church; the priest may break the curse while they are in Moon Howler form.</p>
      )}

      {/* Taming */}
      {isTameable && (
        <div className="mt-2 space-y-1">
          {!canTameHere ? (
            <p className="text-[9px] text-rose-400">Build a Taming Post nearby to tame.</p>
          ) : availableHumans.length === 0 ? (
            <p className="text-[9px] text-stone-500">No adult settler available to tame.</p>
          ) : (
            <div className="space-y-1">
              <p className="text-[9px] text-stone-400">
                Assign a settler to tame{tameFoodCost != null ? ` (${tameFoodCost} food)` : ''}:
              </p>
              <div className="grid grid-cols-2 gap-1">
                {availableHumans.slice(0, 4).map(h => (
                  <button
                    key={h.id}
                    onClick={() => onTame?.(h.id)}
                    disabled={tameFoodCost != null && state.resources.food < tameFoodCost}
                    className="rounded bg-emerald-700 px-1.5 py-1 text-[8px] font-bold text-white hover:bg-emerald-600 transition-all disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    🦴 {h.name || 'Settler'}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Family */}
      {family.length > 0 && (
        <div className="mt-2 border-t border-amber-600/20 pt-2">
          <h4 className="mb-1 text-[9px] font-bold uppercase tracking-wider text-amber-400">Family</h4>
          <div className="space-y-0.5">
            {family.map((m, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[9px] text-amber-200">
                <span>{m.label}</span>
                <span className="font-semibold">{m.name}</span>
                <span className="text-stone-500">({m.relation})</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
