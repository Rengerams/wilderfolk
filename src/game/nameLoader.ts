import { formatCitizenName } from './citizenId';
import { EntityType, type Entity, type WorldState } from './gameTypes';
import { readUtf8RelativeToModule } from './nodeRuntime';
import { getSimRng } from './simRng';

let maleNames: string[] = [];
let femaleNames: string[] = [];
let lastNames: string[] = [];
/** `none` → `embedded` (fallback) → `full` (data files). */
let poolSource: 'none' | 'embedded' | 'full' = 'none';
let legacyBootUpgradeDone = false;
let loadPromise: Promise<void> | null = null;
let loadFailureLogged = false;

/**
 * Realistic sync fallback pool — used if data files are still loading or cannot be reached.
 */
const EMBEDDED_MALE = `Elijah
Silas
Josiah
Caleb
Ezra
Harley
Jasper
Levi
Amos
Gideon
Thomas
Arthur
William
Henry
Edward`;

const EMBEDDED_FEMALE = `Carisa
Maude
Eliza
Hannah
Mercy
Prudence
Temperance
Abigail
Charity
Patience
Clara
Eleanor
Margaret
Beatrice
Martha`;

const EMBEDDED_LAST = `Batten
Caldwell
Mercer
Hawthorne
Whitaker
Langford
Prescott
Fairchild
Ashford
Thornhill
Sterling
Blackwood
Aldridge
Fletcher
Vance`;

/**
 * Known debug markers and placeholder names from older versions
 * so we can replace them if found in existing saves.
 */
const DEBUG_OR_LEGACY_LAST = new Set([
  'namepending',
  'bootwaite',
  'loadhold',
  'tempkin',
  'awaitford',
  'preloadson',
  'syncroft',
  'initvale',
  'fallback',
  'placeholder',
  'smith',
]);

const DEBUG_OR_LEGACY_MALE = new Set([
  'bootman',
  'preload',
  'syncname',
  'awaiter',
  'tempfirst',
  'initname',
  'holdname',
  'loadname',
  'pendname',
  'stagefirst',
  'john',
]);

const DEBUG_OR_LEGACY_FEMALE = new Set([
  'bootwoman',
  'preloadia',
  'syncelle',
  'awaita',
  'tempessa',
  'initelle',
  'holdelle',
  'loadelle',
  'pendelle',
  'stageelle',
  'mary',
]);

const EMBEDDED_MALE_SET = new Set(parseNames(EMBEDDED_MALE).map((n) => n.toLowerCase()));
const EMBEDDED_FEMALE_SET = new Set(parseNames(EMBEDDED_FEMALE).map((n) => n.toLowerCase()));
const EMBEDDED_LAST_SET = new Set(parseNames(EMBEDDED_LAST).map((n) => n.toLowerCase()));

function parseNames(text: string): string[] {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((n) => n.trim())
    .filter((n) => n.length > 0)
    .map(capitalize);
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function applyNameData(male: string, female: string, last: string, source: 'embedded' | 'full'): void {
  const parsedMale = parseNames(male);
  const parsedFemale = parseNames(female);
  const parsedLast = parseNames(last);

  if (parsedMale.length > 0 && parsedFemale.length > 0 && parsedLast.length > 0) {
    maleNames = parsedMale;
    femaleNames = parsedFemale;
    lastNames = parsedLast;
    poolSource = source;

    if (source === 'embedded') {
      legacyBootUpgradeDone = false;
      // No log here. Installing the fallback is a normal, transient boot step — every normal start
      // passes through it while the census files load — so announcing it only produced a misleading
      // "have not been loaded yet" line on a perfectly healthy boot. A load that genuinely fails is
      // reported once at the end of `loadNames()` instead.
    } else if (source === 'full') {
      console.log(
        `[nameloader] Full census name pool loaded successfully (${parsedMale.length} male, ${parsedFemale.length} female, ${parsedLast.length} surnames).`,
      );
    }
  }
}

/** Sync fallback pool — used until loadNames() finishes or if disk read fails. */
export function ensureNamesLoaded(): void {
  if (poolSource !== 'none') return;
  applyNameData(EMBEDDED_MALE, EMBEDDED_FEMALE, EMBEDDED_LAST, 'embedded');
}

/** Read name lists from disk (headless / node environments). */
async function loadNamesFromDisk(): Promise<boolean> {
  try {
    const [male, female, last] = await Promise.all([
      readUtf8RelativeToModule(import.meta.url, 'data', 'male-first-names.txt'),
      readUtf8RelativeToModule(import.meta.url, 'data', 'female-first-names.txt'),
      readUtf8RelativeToModule(import.meta.url, 'data', 'last-names.txt'),
    ]);
    if (!male || !female || !last) return false;
    applyNameData(male, female, last, 'full');
    return maleNames.length > 20;
  } catch {
    return false;
  }
}

/** Safely extracts text from either default-exported or raw-string module imports. */
function unwrapRawModule(mod: unknown): string {
  if (typeof mod === 'string') return mod;
  if (mod && typeof mod === 'object' && 'default' in mod && typeof (mod as { default: unknown }).default === 'string') {
    return (mod as { default: string }).default;
  }
  return '';
}

export async function loadNames(): Promise<void> {
  if (poolSource === 'full' && maleNames.length > 20) return;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    // 1. Try disk read (Node / headless)
    if (await loadNamesFromDisk()) return;

    // 2. Try Vite ?raw dynamic import (Browser / Bundler)
    try {
      const [maleMod, femaleMod, lastMod] = await Promise.all([
        import('./data/male-first-names.txt?raw'),
        import('./data/female-first-names.txt?raw'),
        import('./data/last-names.txt?raw'),
      ]);

      const male = unwrapRawModule(maleMod);
      const female = unwrapRawModule(femaleMod);
      const last = unwrapRawModule(lastMod);

      if (male && female && last) {
        applyNameData(male, female, last, 'full');
        return;
      }
    } catch {
      // Dynamic import failed, try fetch fallback below
    }

    // 3. Browser fetch fallback in case ?raw imports are not resolved by bundler
    if (typeof fetch === 'function') {
      try {
        const [mRes, fRes, lRes] = await Promise.all([
          fetch('/data/male-first-names.txt').catch(() => fetch('./data/male-first-names.txt')),
          fetch('/data/female-first-names.txt').catch(() => fetch('./data/female-first-names.txt')),
          fetch('/data/last-names.txt').catch(() => fetch('./data/last-names.txt')),
        ]);
        if (mRes.ok && fRes.ok && lRes.ok) {
          const [male, female, last] = await Promise.all([mRes.text(), fRes.text(), lRes.text()]);
          if (male && female && last) {
            applyNameData(male, female, last, 'full');
            return;
          }
        }
      } catch {
        // Fetch failed
      }
    }

    // 4. Fallback to embedded list if still uninitialized
    ensureNamesLoaded();
    // A fallback pool that survives *every* strategy is a real defect — every settler would be
    // named from the embedded list — so it is reported once here. This is the only nameloader line
    // a healthy boot produces besides the success message.
    if (!areNamesLoaded() && !loadFailureLogged) {
      loadFailureLogged = true;
      console.warn(
        `[nameloader] Census name files could not be loaded — settlers will use the ${maleNames.length}-name fallback pool. Check the bundled "?raw" data imports (src/game/data/*.txt) and /data/*.txt availability.`,
      );
    }
  })();

  return loadPromise;
}

/**
 * Start loading the census files as soon as this module is imported.
 *
 * Every naming site draws from whatever pool is installed *at that moment*
 * (`entityFactory`, `worldGen`, births, immigration), so a late first load means
 * settlers named from the tiny embedded fallback. Importing this module is exactly
 * the moment the game (or the simulation worker) is about to need names, so the
 * load starts here — the explicit `loadNames()` awaits at boot stay in place.
 */
loadNames().catch(() => {});

function pickFrom(pool: string[]): string {
  ensureNamesLoaded();
  // Seeded rather than `Math.random`: a settler's name is part of the world state, so the
  // same seed and tick must produce the same census draw (roadmap T3's remaining site).
  return pool[Math.floor(getSimRng('nameLoader')() * pool.length)] ?? pool[0] ?? 'Settler';
}

export function getRandomMaleName(): string {
  return pickFrom(maleNames);
}

export function getRandomFemaleName(): string {
  return pickFrom(femaleNames);
}

export function getRandomSurname(): string {
  return pickFrom(lastNames);
}

export function getRandomName(gender: 'male' | 'female'): string {
  return gender === 'male' ? getRandomMaleName() : getRandomFemaleName();
}

export function areNamesLoaded(): boolean {
  return poolSource === 'full' && maleNames.length > 20;
}

export function getNamePoolInfo(): { male: number; female: number; last: number; full: boolean } {
  ensureNamesLoaded();
  return {
    male: maleNames.length,
    female: femaleNames.length,
    last: lastNames.length,
    full: areNamesLoaded(),
  };
}

function needsFullPoolFirstName(entity: Entity, upgradeLegacy: boolean): boolean {
  const key = (entity.name ?? '').trim().toLowerCase();
  if (!key || DEBUG_OR_LEGACY_MALE.has(key) || DEBUG_OR_LEGACY_FEMALE.has(key)) return true;
  if (poolSource !== 'full') return false;
  if (entity.gender === 'male' ? EMBEDDED_MALE_SET.has(key) : EMBEDDED_FEMALE_SET.has(key)) {
    return upgradeLegacy;
  }
  return false;
}

function needsFullPoolSurname(surname: string | undefined, upgradeLegacy: boolean): boolean {
  const key = (surname ?? '').trim().toLowerCase();
  if (!key || DEBUG_OR_LEGACY_LAST.has(key)) return true;
  if (poolSource !== 'full') return false;
  if (EMBEDDED_LAST_SET.has(key)) {
    return upgradeLegacy;
  }
  return false;
}

/** Married women take the husband's surname; he keeps his family name. */
export function syncMarriageSurnames(a: Entity, b: Entity): void {
  const husband = a.gender === 'male' ? a : b.gender === 'male' ? b : null;
  const wife = a.gender === 'female' ? a : b.gender === 'female' ? b : null;

  if (husband && wife) {
    const household = husband.surname?.trim() || wife.surname?.trim() || getRandomSurname();
    if (!wife.maidenSurname?.trim()) {
      wife.maidenSurname = wife.surname?.trim() || getRandomSurname();
    }
    husband.surname = household;
    wife.surname = household;
    return;
  }

  const household = a.surname?.trim() || b.surname?.trim() || getRandomSurname();
  a.surname = household;
  b.surname = household;
}

/** Legitimate children inherit the father's line; others take the mother's surname. */
export function resolveChildSurname(
  mother: Entity,
  partnerId: number | undefined,
  biologicalFatherId: number | undefined,
  husband: Entity | undefined,
  biologicalFather: Entity | undefined,
): { surname: string; isBastard: boolean } {
  const fatherIsHusband =
    biologicalFatherId != null
    && partnerId != null
    && biologicalFatherId === partnerId;

  if (!fatherIsHusband) {
    return {
      surname: mother.surname?.trim() || getRandomSurname(),
      isBastard: true,
    };
  }

  return {
    surname: husband?.surname?.trim()
      || biologicalFather?.surname?.trim()
      || mother.surname?.trim()
      || getRandomSurname(),
    isBastard: false,
  };
}

function statusAfterDivorce(entity: Entity): 'single' | 'expecting' {
  return entity.pregnant ? 'expecting' : 'single';
}

function clearMarriageLinks(entity: Entity): void {
  entity.partnerId = undefined;
  entity.affairPartnerId = undefined;
  entity.affairProgress = 0;
  entity.courtshipPartnerId = undefined;
  entity.courtshipProgress = 0;
  entity.lastAffairSiteDay = undefined;
  entity.lastAffairSiteX = undefined;
  entity.lastAffairSiteY = undefined;
}

export function grantDivorce(wife: Entity, husband: Entity): void {
  if (wife.maidenSurname?.trim()) {
    wife.surname = wife.maidenSurname.trim();
  }
  clearMarriageLinks(wife);
  clearMarriageLinks(husband);
  wife.relationshipStatus = statusAfterDivorce(wife);
  husband.relationshipStatus = statusAfterDivorce(husband);
}

export function dissolveMarriage(partnerA: Entity, partnerB: Entity): void {
  const wife = partnerA.gender === 'female' ? partnerA : partnerB.gender === 'female' ? partnerB : null;
  const husband = partnerA.gender === 'male' ? partnerA : partnerB.gender === 'male' ? partnerB : null;
  if (wife && husband) {
    grantDivorce(wife, husband);
    return;
  }
  clearMarriageLinks(partnerA);
  clearMarriageLinks(partnerB);
  partnerA.relationshipStatus = statusAfterDivorce(partnerA);
  partnerB.relationshipStatus = statusAfterDivorce(partnerB);
}

export function formatCaughtCheaterDivorceDetail(spouse: Entity, cheater: Entity): string {
  const spouseName = formatCitizenName(spouse);
  const cheaterName = formatCitizenName(cheater);
  if (cheater.gender === 'female' && cheater.maidenSurname?.trim()) {
    return `${spouseName} divorced ${cheaterName} — she took back her maiden name`;
  }
  return `${spouseName} divorced ${cheaterName}`;
}

/** Regenerates placeholder or default names across existing citizens. */
export function fixDefaultNames(state: WorldState): void {
  ensureNamesLoaded();
  const upgradeLegacy = poolSource === 'full' && !legacyBootUpgradeDone;
  const humans = state.entities.filter((e) => e.alive && e.type === EntityType.Human);
  let updatedCount = 0;

  for (const entity of humans) {
    let changed = false;
    if (needsFullPoolFirstName(entity, upgradeLegacy)) {
      entity.name = getRandomName(entity.gender === 'male' ? 'male' : 'female');
      changed = true;
    }
    if (needsFullPoolSurname(entity.surname, upgradeLegacy)) {
      entity.surname = getRandomSurname();
      changed = true;
    }
    if (needsFullPoolSurname(entity.maidenSurname, upgradeLegacy)) {
      entity.maidenSurname = getRandomSurname();
      changed = true;
    }
    if (changed) updatedCount++;
  }

  if (updatedCount > 0) {
    console.log(`[nameloader] Replaced default/fallback names on ${updatedCount} citizen(s).`);
  }

  if (poolSource === 'full') legacyBootUpgradeDone = true;

  const seenPairs = new Set<string>();
  for (const entity of humans) {
    if (entity.partnerId == null) continue;
    const partner = humans.find((h) => h.id === entity.partnerId);
    if (!partner) continue;
    const key = [entity.id, partner.id].sort((x, y) => x - y).join(':');
    if (seenPairs.has(key)) continue;
    seenPairs.add(key);
    syncMarriageSurnames(entity, partner);
  }
}