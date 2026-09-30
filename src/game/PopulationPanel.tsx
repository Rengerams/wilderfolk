import { useMemo, useState } from 'react';
import type { WorldState, Entity } from './gameTypes';
import { EntityType, BUILDING_CONFIGS } from './gameTypes';
import { isPlayerHuman } from './playerHuman';
import { buildFamilyGroups, hasWorkAssignment, isImprisoned } from './dayCycle';
import { isVillageLeader } from './villageLeadership';
import { getPopulationGrowthReport, resolvePopulationCap } from './populationGrowth';
import { computeVillageStats } from './uiSimSummary';
import { citizenFullName, formatCitizenId, formatCitizenName, matchesCitizenSearch } from './citizenId';
import { formatEducationLabel } from './education';

function relationIcon(e: Entity): string {
  if (e.isJuvenile) return e.gender === 'male' ? '👦' : '👧';
  return e.gender === 'male' ? '👨' : e.gender === 'female' ? '👩' : '👤';
}

function CitizenRow({
  person,
  state,
  isFavorite,
  onFocusCitizen,
  onToggleFavorite,
}: {
  person: Entity;
  state: WorldState;
  isFavorite?: boolean;
  onFocusCitizen?: (entity: Entity) => void;
  onToggleFavorite?: (entityId: number) => void;
}) {
  const educationLabel = formatEducationLabel(person);
  const label = (
    <>
      <span className="font-mono text-[13px] text-stone-400">{formatCitizenId(person.id)}</span>
      {' '}
      {relationIcon(person)} {citizenFullName(person)}
      {isFavorite ? ' ⭐' : ''}
      {isVillageLeader(state, person.id) ? ' 👑' : ''}
      {hasWorkAssignment(person) ? ' 🔨' : ''}
      {isImprisoned(person) ? ' 🔒' : ''}
      {person.moonHowlerCursed ? ' 🌝' : ''}
      {educationLabel ? ` ${educationLabel}` : ''}
    </>
  );

  if (!onFocusCitizen) {
    return (
      <span title={person.occupation || 'settler'} className="text-stone-300">
        {label}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-0.5">
      <button
        type="button"
        title={`Locate ${formatCitizenName(person)} on the map`}
        onClick={() => onFocusCitizen(person)}
        className={`rounded px-0.5 text-left transition-colors hover:bg-stone-700/60 hover:text-amber-100 ${
          isFavorite ? 'text-amber-200' : 'text-stone-300'
        }`}
      >
        {label}
      </button>
      {onToggleFavorite && (
        <button
          type="button"
          title={isFavorite ? 'Stop following' : 'Favorite — follow on map'}
          aria-label={isFavorite ? `Stop following ${formatCitizenName(person)}` : `Favorite ${formatCitizenName(person)}`}
          aria-pressed={!!isFavorite}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(person.id);
          }}
          className={`rounded px-0.5 text-[13px] leading-none transition-colors ${
            isFavorite
              ? 'text-amber-300 hover:text-amber-100'
              : 'text-stone-400 hover:text-amber-200'
          }`}
        >
          {isFavorite ? '★' : '☆'}
        </button>
      )}
    </span>
  );
}

export default function PopulationPanel({
  state,
  favoriteEntityId,
  onFocusCitizen,
  onToggleFavorite,
}: {
  state: WorldState;
  favoriteEntityId?: number | null;
  onFocusCitizen?: (entity: Entity) => void;
  onToggleFavorite?: (entityId: number) => void;
}) {
  const [search, setSearch] = useState('');
  const playerHumans = state.entities.filter(
    (e) => e.alive && e.type === EntityType.Human && isPlayerHuman(e),
  );
  // Work / bed counts come from the village aggregation and the assignable-bed owner rather than the
  // raw tick counters and `getOpenBeds` (R29): the counters can disagree with the header, and
  // `getOpenBeds` counts beds a settler cannot actually be assigned to. The panel states no counter
  // of its own — adults, children, jailed, working and idle all come from `villageStats`, and the
 // immigration cap from `resolvePopulationCap`.
  const villageStats = computeVillageStats(state);
  const moonHowlerCursed = state.entities.filter(
    (e) => e.alive && isPlayerHuman(e) && e.moonHowlerCursed,
  ).length
    + state.entities.filter(
      (e) => e.alive && e.type === EntityType.Werewolf && e.moonHowlerCursed && e.faction !== 'visitor' && e.faction !== 'rival',
    ).length;
  const capacity = resolvePopulationCap(state);
  const beds = villageStats.beds;

  const familyGroups = buildFamilyGroups(playerHumans);
  const filteredFamilies = useMemo(() => {
    const q = search.trim();
    if (!q) return familyGroups;
    return familyGroups.filter((family) =>
      family.some((member) => matchesCitizenSearch(member, q)),
    );
  }, [familyGroups, search]);

  const growth = getPopulationGrowthReport(state);
  const growthToneClass = growth.tone === 'blocked'
    ? 'border-rose-500/30 bg-rose-950/30 text-rose-200'
    : growth.tone === 'warn'
      ? 'border-amber-500/30 bg-amber-950/30 text-amber-200'
      : 'border-emerald-500/30 bg-emerald-950/25 text-emerald-200';

  const getResidenceLabel = (id?: number) => {
    if (id == null) return 'Unhoused';
    const b = state.buildings.find((b) => b.id === id);
    if (!b) return 'Unknown';
    return BUILDING_CONFIGS[b.type]?.label || 'House';
  };

  return (
    <div className="rounded-xl bg-stone-700/50 p-3">
      <div className="mb-3 flex items-end justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-stone-300">Population & Families</h3>
          {/* The roster's own header: how many households, how many beds they share, and the cap the
              growth owner applies. The open-bed count and the mood label are the People screen's stat
              cards above this panel — they were printed a second time here (2026-09-22 audit, P1). */}
          <p className="text-[13px] text-stone-300">{familyGroups.length} families · 🛏️ {beds} beds · cap {capacity}</p>
        </div>
      </div>

      <div className="mb-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Find citizen — #12 or name…"
          className="w-full rounded-lg border border-stone-600/50 bg-stone-800/80 px-2.5 py-1.5 text-[13px] text-stone-100 placeholder:text-stone-500 focus:border-amber-500/50 focus:outline-none"
        />
        {search.trim() && (
          <p className="mt-1 text-[13px] text-stone-300">
            {filteredFamilies.reduce((n, f) => n + f.length, 0)} match{filteredFamilies.reduce((n, f) => n + f.length, 0) === 1 ? '' : 'es'}
            {onFocusCitizen ? ' · click a name to locate on map' : ''}
          </p>
        )}
      </div>

      <div className={`mb-3 rounded-lg border px-2.5 py-2 text-[13px] ${growthToneClass}`}>
        <p className="font-bold">{growth.headline}</p>
        <p className="mt-0.5 text-[10px] opacity-90">{growth.detail}</p>
        <ul className="mt-1 list-inside list-disc text-[10px] opacity-80">
          {growth.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </div>

      {moonHowlerCursed > 0 && (
        <div className="mb-3 rounded-lg border border-violet-500/35 bg-violet-950/35 px-2.5 py-2 text-[13px] text-violet-200">
          <p className="font-bold">🌝 {moonHowlerCursed} Moon Howler curse{moonHowlerCursed === 1 ? '' : 's'} active</p>
          <p className="mt-0.5 text-[13px] text-violet-300/90">
            Still cursed: 🌝 on name below · on full-moon nights (20:00–06:00), priests leave the Church to hunt the howler — the rite fires when they get close (guards can protect them) · Log: &quot;was cured of the Moon Howler curse&quot;
          </p>
        </div>
      )}

      <div className="max-h-60 overflow-y-auto pr-1">
        <div className="space-y-1.5">
          {filteredFamilies.length === 0 && (
            <p className="text-[13px] text-stone-300">
              {search.trim() ? 'No citizens match that search.' : 'No families yet.'}
            </p>
          )}
          {filteredFamilies.map((family, idx) => {
            const parents = family.filter((e) => !e.isJuvenile);
            const kids = family.filter((e) => e.isJuvenile);
            const visibleParents = search.trim()
              ? parents.filter((p) => matchesCitizenSearch(p, search))
              : parents;
            const visibleKids = search.trim()
              ? kids.filter((k) => matchesCitizenSearch(k, search))
              : kids;
            const residenceId = family[0]?.residenceBuildingId;
            const residenceLabel = getResidenceLabel(residenceId);
            const surname = family[0]?.surname;
            return (
              <div
                key={idx}
                className="rounded bg-stone-800/50 px-2 py-1.5 text-[13px]"
              >
                <div className="mb-0.5 flex items-center justify-between">
                  <span className="font-bold text-stone-200">
                    {surname ? `${surname} household` : `Family ${idx + 1}`}
                  </span>
                  <span className="text-[13px] text-stone-400" title="Home">
                    🏠 {residenceLabel}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                  {visibleParents.map((p) => (
                    <CitizenRow
                      key={p.id}
                      person={p}
                      state={state}
                      isFavorite={favoriteEntityId === p.id}
                      onFocusCitizen={onFocusCitizen}
                      onToggleFavorite={onToggleFavorite}
                    />
                  ))}
                  {visibleKids.map((k) => (
                    <CitizenRow
                      key={k.id}
                      person={k}
                      state={state}
                      isFavorite={favoriteEntityId === k.id}
                      onFocusCitizen={onFocusCitizen}
                      onToggleFavorite={onToggleFavorite}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}