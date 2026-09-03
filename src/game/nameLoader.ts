import { formatCitizenName } from './citizenId';
import { EntityType, type Entity, type WorldState } from './gameTypes';
import { readUtf8RelativeToModule } from './nodeRuntime';

let maleNames: string[] = [];
let femaleNames: string[] = [];
let lastNames: string[] = [];
let loaded = false;

/** Immediate pool until full lists load from data files — not John/Mary/Smith. */
const EMBEDDED_MALE = `Elijah
Silas
Josiah
Caleb
Ezra
Harley
Jasper
Levi
Amos
Gideon`;

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
Rose`;

const EMBEDDED_LAST = `Batten
Caldwell
Mercer
Hawthorne
Whitaker
Langford
Prescott
Fairchild
Ashford
Thornhill`;

function parseNames(text: string): string[] {
  return text
    .split('\n')
    .map((n) => n.trim())
    .filter((n) => n.length > 0)
    .map(capitalize);
}

function capitalize(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

function applyNameData(male: string, female: string, last: string): void {
  maleNames = parseNames(male);
  femaleNames = parseNames(female);
  lastNames = parseNames(last);
  loaded = maleNames.length > 0 && femaleNames.length > 0 && lastNames.length > 0;
}

/** Sync fallback pool — used until loadNames() finishes (browser) or at sim start. */
export function ensureNamesLoaded(): void {
  if (loaded) return;
  applyNameData(EMBEDDED_MALE, EMBEDDED_FEMALE, EMBEDDED_LAST);
}

/** Read name lists from disk — headless sims (tsx/node) cannot use Vite ?raw imports. */
async function loadNamesFromDisk(): Promise<boolean> {
  const [male, female, last] = await Promise.all([
    readUtf8RelativeToModule(import.meta.url, 'data', 'male-first-names.txt'),
    readUtf8RelativeToModule(import.meta.url, 'data', 'female-first-names.txt'),
    readUtf8RelativeToModule(import.meta.url, 'data', 'last-names.txt'),
  ]);
  if (!male || !female || !last) return false;
  applyNameData(male, female, last);
  return maleNames.length > 20;
}

export async function loadNames(): Promise<void> {
  if (loaded && maleNames.length > 20) return;
  if (await loadNamesFromDisk()) return;
  try {
    const [male, female, last] = await Promise.all([
      import('./data/male-first-names.txt?raw').then((m) => m.default),
      import('./data/female-first-names.txt?raw').then((m) => m.default),
      import('./data/last-names.txt?raw').then((m) => m.default),
    ]);
    applyNameData(male, female, last);
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
  return loaded && maleNames.length > 20;
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

/** Regenerate fallback names and backfill missing surnames (immigrants, old saves). */
export function fixDefaultNames(state: WorldState): void {
  ensureNamesLoaded();
  const humans = state.entities.filter((e) => e.alive && e.type === EntityType.Human);
  for (const entity of humans) {
    if (isPlaceholderFirst(entity.name)) {
      entity.name = getRandomName(entity.gender === 'male' ? 'male' : 'female');
    }
    if (!entity.surname?.trim() || isPlaceholderLast(entity.surname)) {
      entity.surname = getRandomSurname();
    }
  }
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