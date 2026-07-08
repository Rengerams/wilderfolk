import { useMemo, useState } from 'react';
import type { WorldState, Entity } from './gameTypes';
import { EntityType, BUILDING_CONFIGS } from './gameTypes';
import { isPlayerHuman } from './groupEvents';
import { buildFamilyGroups, hasWorkAssignment, isImprisoned } from './dayCycle';
import { isVillageLeader } from './villageLeadership';
import { getLivePlayerPopulation, getOpenBeds, getPopulationGrowthReport, getTotalBeds } from './populationGrowth';
import { formatCitizenId, formatCitizenName, matchesCitizenSearch } from './citizenId';
import { formatEducationLabel } from './education';

function formatName(e: Entity): string {
  const base = e.name || 'Unknown';
  const surname = e.surname || '';
  return `${base}${surname ? ` ${surname}` : ''}`;
}

function relationIcon(e: Entity): string {
  if (e.isJuvenile) return e.gender === 'male' ? '👦' : '👧';
  return e.gender === 'male' ? '👨' : e.gender === 'female' ? '👩' : '👤';
}

function CitizenRow({
  person,
  state,
  onFocusCitizen,
}: {
  person: Entity;
  state: WorldState;
  onFocusCitizen?: (entity: Entity) => void;
}) {
  const educationLabel = formatEducationLabel(person);
  const label = (
    <>
      <span className="font-mono text-[9px] text-stone-500">{formatCitizenId(person.id)}</span>
      {' '}
      {relationIcon(person)} {formatName(person)}
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
    <button
      type="button"
      title={`Locate ${formatCitizenName(person)} on the map`}
      onClick={() => onFocusCitizen(person)}
      className="rounded px-0.5 text-left text-stone-300 transition-colors hover:bg-stone-700/60 hover:text-amber-100"
    >
      {label}
    </button>
  );
}

export default function PopulationPanel({
  state,
  onFocusCitizen,
}: {
  state: WorldState;
  onFocusCitizen?: (entity: Entity) => void;
}) {
  const [search, setSearch] = useState('');
  const playerHumans = state.entities.filter(
    (e) => e.alive && e.type === EntityType.Human && isPlayerHuman(e),
  );
  const constructionWorkers = new Set<number>();
  for (const b of state.buildings) {
    if (!b.completed) {
      for (const id of b.occupants) constructionWorkers.add(id);
    }
  }
  const adults = playerHumans.filter((e) => !e.isJuvenile);
  const children = playerHumans.filter((e) => e.isJuvenile);
  let working = 0;
  let idle = 0;
  for (const e of adults) {
    if (isImprisoned(e)) continue;
    if (hasWorkAssignment(e) || constructionWorkers.has(e.id)) working++;
    else idle++;
  }
  const imprisoned = playerHumans.filter((e) => isImprisoned(e)).length;
  const moonHowlerCursed = state.entities.filter(
    (e) => e.alive && isPlayerHuman(e) && e.moonHowlerCursed,
  ).length
    + state.entities.filter(
      (e) => e.alive && e.type === EntityType.Werewolf && e.moonHowlerCursed && e.faction !== 'visitor' && e.faction !== 'rival',
    ).length;
  const capacity = state.maxHumanPopulation;
  const beds = getTotalBeds(state);
  const openBeds = getOpenBeds(state);

  const familyGroups = buildFamilyGroups(playerHumans);
  const filteredFamilies = useMemo(() => {
    const q = search.trim();
    if (!q) return familyGroups;
    return familyGroups.filter((family) =>
      family.some((member) => matchesCitizenSearch(member, q)),
    );
  }, [familyGroups, search]);

  const livePopulation = getLivePlayerPopulation(state);
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
          <h3 className="text-xs font-bold text-stone-300">Population & Families</h3>
          <p className="text-[9px] text-stone-500">{familyGroups.length} families · 🛏️ {beds} beds ({openBeds} open) · cap {capacity}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-black leading-none text-emerald-300">
            {livePopulation}
            <span className="text-sm font-bold text-stone-500"> / {capacity}</span>
          </p>
        </div>
      </div>

      <div className="mb-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Find citizen — #12 or name…"
          className="w-full rounded-lg border border-stone-600/50 bg-stone-800/80 px-2.5 py-1.5 text-[10px] text-stone-100 placeholder:text-stone-500 focus:border-amber-500/50 focus:outline-none"
        />
        {search.trim() && (
          <p className="mt-1 text-[9px] text-stone-500">
            {filteredFamilies.reduce((n, f) => n + f.length, 0)} match{filteredFamilies.reduce((n, f) => n + f.length, 0) === 1 ? '' : 'es'}
            {onFocusCitizen ? ' · click a name to locate on map' : ''}
          </p>
        )}
      </div>

      <div className={`mb-3 rounded-lg border px-2.5 py-2 text-[9px] ${growthToneClass}`}>
        <p className="font-bold">{growth.headline}</p>
        <p className="mt-0.5 text-[8px] opacity-90">{growth.detail}</p>
        <ul className="mt-1 list-inside list-disc text-[8px] opacity-80">
          {growth.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </div>

      {moonHowlerCursed > 0 && (
        <div className="mb-3 rounded-lg border border-violet-500/35 bg-violet-950/35 px-2.5 py-2 text-[10px] text-violet-200">
          <p className="font-bold">🌝 {moonHowlerCursed} Moon Howler curse{moonHowlerCursed === 1 ? '' : 's'} active</p>
          <p className="mt-0.5 text-[9px] text-violet-300/90">
            Still cursed: 🌝 on name below · dawn after each full-moon hunt, staffed Church may exorcise in 🌝 form (village-wide) · Log: &quot;was cured of the Moon Howler curse&quot;
          </p>
        </div>
      )}

      <div className="mb-3 grid grid-cols-3 gap-1 text-[9px]">
        <div className="rounded bg-stone-600/30 px-2 py-1 text-center">
          <div className="font-bold text-sky-300">{adults.length}</div>
          <div className="text-stone-500">adults</div>
        </div>
        <div className="rounded bg-stone-600/30 px-2 py-1 text-center">
          <div className="font-bold text-pink-300">{children.length}</div>
          <div className="text-stone-500">children</div>
        </div>
        <div className="rounded bg-stone-600/30 px-2 py-1 text-center">
          <div className="font-bold text-amber-300">{imprisoned}</div>
          <div className="text-stone-500">jailed</div>
        </div>
        <div className="rounded bg-stone-600/30 px-2 py-1 text-center">
          <div className="font-bold text-emerald-300">{working}</div>
          <div className="text-stone-500">working</div>
        </div>
        <div className="rounded bg-stone-600/30 px-2 py-1 text-center">
          <div className="font-bold text-stone-300">{idle}</div>
          <div className="text-stone-500">idle</div>
        </div>
        <div className="rounded bg-stone-600/30 px-2 py-1 text-center">
          <div className="font-bold text-purple-300">{state.unlockedTechs.length}</div>
          <div className="text-stone-500">techs</div>
        </div>
      </div>

      <div className="max-h-60 overflow-y-auto pr-1">
        <div className="space-y-1.5">
          {filteredFamilies.length === 0 && (
            <p className="text-[10px] text-stone-500">
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
                className="rounded bg-stone-800/50 px-2 py-1.5 text-[10px]"
              >
                <div className="mb-0.5 flex items-center justify-between">
                  <span className="font-bold text-stone-200">
                    {surname ? `${surname} household` : `Family ${idx + 1}`}
                  </span>
                  <span className="text-[9px] text-stone-500" title="Home">
                    🏠 {residenceLabel}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                  {visibleParents.map((p) => (
                    <CitizenRow key={p.id} person={p} state={state} onFocusCitizen={onFocusCitizen} />
                  ))}
                  {visibleKids.map((k) => (
                    <CitizenRow key={k.id} person={k} state={state} onFocusCitizen={onFocusCitizen} />
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