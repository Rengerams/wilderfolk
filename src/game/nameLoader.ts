import { formatCitizenName } from './citizenId';
import { EntityType, type Entity, type WorldState } from './gameTypes';
import { readUtf8RelativeToModule } from './nodeRuntime';

let maleNames: string[] = [];
let femaleNames: string[] = [];
let lastNames: string[] = [];
/** `none` → `embedded` (tiny sync fallback) → `full` (data files). */
let poolSource: 'none' | 'embedded' | 'full' = 'none';
/**
 * After the first full-pool upgrade pass, stop treating census-overlapping
 * legacy boot names (Whitaker, Elijah, …) as forever-invalid — those strings
 * also exist in the data files and are valid draws.
 */
let legacyBootUpgradeDone = false;

/**
 * Boot-only markers — deliberately absent from the census data files so a
 * settler still holding one is unambiguously "not yet named from the lists".
 */
const EMBEDDED_MALE = `Bootman
Preload
Syncname
Awaiter
Tempfirst
Initname
Holdname
Loadname
Pendname
Stagefirst`;

const EMBEDDED_FEMALE = `Bootwoman
Preloadia
Syncelle
Awaita
Tempessa
Initelle
Holdelle
Loadelle
Pendelle
Stageelle`;

const EMBEDDED_LAST = `Bootwaite
Namepending
Loadhold
Tempkin
Awaitford
Preloadson
Syncroft
Initvale
Fallback
Placeholder`;

/** Previous boot pool (overlapped the census files) — upgrade once after load. */
const LEGACY_BOOT_MALE = new Set(
  'elijah silas josiah caleb ezra harley jasper levi amos gideon'.split(' '),
);
const LEGACY_BOOT_FEMALE = new Set(
  'carisa maude eliza hannah mercy prudence temperance abigail charity patience rose'.split(
    ' ',
  ),
);
const LEGACY_BOOT_LAST = new Set(
  'batten caldwell mercer hawthorne whitaker langford prescott fairchild ashford thornhill'.split(
    ' ',
  ),
);

const EMBEDDED_MALE_SET = new Set(parseNames(EMBEDDED_MALE).map((n) => n.toLowerCase()));
const EMBEDDED_FEMALE_SET = new Set(parseNames(EMBEDDED_FEMALE).map((n) => n.toLowerCase()));
const EMBEDDED_LAST_SET = new Set(parseNames(EMBEDDED_LAST).map((n) => n.toLowerCase()));

function parseNames(text: string): string[] {
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
  maleNames = parseNames(male);
  femaleNames = parseNames(female);
  lastNames = parseNames(last);
  if (maleNames.length > 0 && femaleNames.length > 0 && lastNames.length > 0) {
    poolSource = source;
    if (source === 'embedded') legacyBootUpgradeDone = false;
  }
}

/** Sync fallback pool — used until loadNames() finishes (browser) or at sim start. */
export function ensureNamesLoaded(): void {
  if (poolSource !== 'none') return;
  applyNameData(EMBEDDED_MALE, EMBEDDED_FEMALE, EMBEDDED_LAST, 'embedded');
}

/** Read name lists from disk — headless sims (tsx/node) cannot use Vite ?raw imports. */
async function loadNamesFromDisk(): Promise<boolean> {
  const [male, female, last] = await Promise.all([
    readUtf8RelativeToModule(import.meta.url, 'data', 'male-first-names.txt'),
    readUtf8RelativeToModule(import.meta.url, 'data', 'female-first-names.txt'),
    readUtf8RelativeToModule(import.meta.url, 'data', 'last-names.txt'),
  ]);
  if (!male || !female || !last) return false;
  applyNameData(male, female, last, 'full');
  return maleNames.length > 20;
}

export async function loadNames(): Promise<void> {
  if (poolSource === 'full' && maleNames.length > 20) return;
  if (await loadNamesFromDisk()) return;
  try {
    const [male, female, last] = await Promise.all([
      import('./data/male-first-names.txt?raw').then((m) => m.default),
      import('./data/female-first-names.txt?raw').then((m) => m.default),
      import('./data/last-names.txt?raw').then((m) => m.default),
    ]);
    applyNameData(male, female, last, 'full');
  } catch {
    ensureNamesLoaded();
  }
}

function pickFrom(pool: string[]): string {
  ensureNamesLoaded();
  return pool[Math.floor(Math.random() * pool.length)] ?? pool[0] ?? 'Settler';
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

const PLACEHOLDER_FIRST = new Set(['john', 'mary']);
const PLACEHOLDER_LAST = new Set(['smith']);

function isPlaceholderFirst(name: string | undefined): boolean {
  return PLACEHOLDER_FIRST.has((name ?? '').trim().toLowerCase());
}

function isPlaceholderLast(surname: string | undefined): boolean {
  return PLACEHOLDER_LAST.has((surname ?? '').trim().toLowerCase());
}

function needsFullPoolFirstName(entity: Entity, upgradeLegacy: boolean): boolean {
  const key = (entity.name ?? '').trim().toLowerCase();
  if (!key || isPlaceholderFirst(key)) return true;
  if (poolSource !== 'full') return false;
  if (entity.gender === 'male' ? EMBEDDED_MALE_SET.has(key) : EMBEDDED_FEMALE_SET.has(key)) {
    return true;
  }
  if (!upgradeLegacy) return false;
  return entity.gender === 'male' ? LEGACY_BOOT_MALE.has(key) : LEGACY_BOOT_FEMALE.has(key);
}

function needsFullPoolSurname(surname: string | undefined, upgradeLegacy: boolean): boolean {
  const key = (surname ?? '').trim().toLowerCase();
  if (!key || isPlaceholderLast(key)) return true;
  if (poolSource !== 'full') return false;
  if (EMBEDDED_LAST_SET.has(key)) return true;
  if (!upgradeLegacy) return false;
  return LEGACY_BOOT_LAST.has(key);
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

/** Status after a marriage ends — pregnant settlers stay "expecting", not free to remarry. */
function statusAfterDivorce(entity: Entity): 'single' | 'expecting' {
  return entity.pregnant ? 'expecting' : 'single';
}

/** Clear legal + secret-romance links so either person can court again later. */
function clearMarriageLinks(entity: Entity): void {
  entity.partnerId = undefined;
  entity.affairPartnerId = undefined;
  entity.affairProgress = 0;
  entity.courtshipProgress = 0;
  entity.lastAffairSiteDay = undefined;
  entity.lastAffairSiteX = undefined;
  entity.lastAffairSiteY = undefined;
}

/**
 * Wife leaves the marriage and takes back her maiden name; husband keeps his surname.
 * Both become eligible to remarry once single (not pregnant / not imprisoned).
 */
export function grantDivorce(wife: Entity, husband: Entity): void {
  if (wife.maidenSurname?.trim()) {
    wife.surname = wife.maidenSurname.trim();
  }
  clearMarriageLinks(wife);
  clearMarriageLinks(husband);
  wife.relationshipStatus = statusAfterDivorce(wife);
  husband.relationshipStatus = statusAfterDivorce(husband);
}

/** End a marriage regardless of which partner cheated — maiden name restored for the woman. */
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

/** Regenerate fallback / placeholder names once the full lists are available. */
export function fixDefaultNames(state: WorldState): void {
  ensureNamesLoaded();
  const upgradeLegacy = poolSource === 'full' && !legacyBootUpgradeDone;
  const humans = state.entities.filter((e) => e.alive && e.type === EntityType.Human);
  for (const entity of humans) {
    if (needsFullPoolFirstName(entity, upgradeLegacy)) {
      entity.name = getRandomName(entity.gender === 'male' ? 'male' : 'female');
    }
    if (needsFullPoolSurname(entity.surname, upgradeLegacy)) {
      entity.surname = getRandomSurname();
    }
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