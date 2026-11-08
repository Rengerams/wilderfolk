/**
 * The one owner of personal marks: non-genetic qualities a settler is born with or earns once.
 * Marks are never inherited, never rerolled and never a second genetics source.
 */
import { getSimRng, type RngStream } from './simRng';

export const PERSONAL_MARK_IDS = ['lucky', 'pretty', 'scarred', 'sickly'] as const;

export type PersonalMarkId = (typeof PERSONAL_MARK_IDS)[number];

/** The resolved event that handed the settler the mark; `born` marks come from creation. */
export type PersonalMarkSource = 'born' | 'raidVictory' | 'raidWound' | 'rareWindfall';

export interface PersonalMark {
  readonly id: PersonalMarkId;
  readonly day: number;
  readonly source: PersonalMarkSource;
}

export interface PersonalMarkDef {
  readonly id: PersonalMarkId;
  readonly label: string;
  readonly blurb: string;
  /** Born marks are drawn once at creation; earned marks need a real resolved event. */
  readonly born: boolean;
}

export const PERSONAL_MARK_DEFS: Readonly<Record<PersonalMarkId, PersonalMarkDef>> = {
  lucky: { id: 'lucky', label: 'Lucky', blurb: 'Fortune keeps favouring them', born: false },
  pretty: { id: 'pretty', label: 'Pretty', blurb: 'Pleasant to look at, easy to listen to', born: true },
  scarred: { id: 'scarred', label: 'Scarred', blurb: 'Survived a mauling and carries the marks', born: false },
  sickly: { id: 'sickly', label: 'Sickly', blurb: 'Frail since birth', born: true },
};

/** A carrier as far as marks are concerned: never the whole entity or world. */
export interface MarkCarrier {
  marks?: PersonalMark[];
}

/** Born marks are a one-off draw per settler, independent of parents and genome. */
const BORN_MARK_CHANCE: Readonly<Record<'pretty' | 'sickly', number>> = { pretty: 0.12, sickly: 0.08 };

const EMPTY_MARKS: readonly PersonalMark[] = Object.freeze([]);
const MARK_IDS: ReadonlySet<string> = new Set(PERSONAL_MARK_IDS);
/** Provenance per mark: born marks come from birth, earned marks from their own resolved event. */
const MARK_ALLOWED_SOURCES: Readonly<Record<PersonalMarkId, readonly PersonalMarkSource[]>> = {
  lucky: ['raidVictory', 'rareWindfall'],
  pretty: ['born'],
  scarred: ['raidWound'],
  sickly: ['born'],
};

function isAllowedMarkSource(id: PersonalMarkId, source: unknown): source is PersonalMarkSource {
  return typeof source === 'string'
    && (MARK_ALLOWED_SOURCES[id] as readonly string[]).includes(source);
}

export function isPersonalMarkId(value: unknown): value is PersonalMarkId {
  return typeof value === 'string' && MARK_IDS.has(value);
}

/** Never returns null: an absent field and an empty list both mean "no marks". */
export function marksOf(carrier: MarkCarrier | null | undefined): readonly PersonalMark[] {
  return carrier?.marks ?? EMPTY_MARKS;
}

export function hasMark(carrier: MarkCarrier | null | undefined, id: PersonalMarkId): boolean {
  return marksOf(carrier).some((mark) => mark.id === id);
}

/**
 * The only writer of an earned or born mark. Idempotent per id and bounded by the mark list, so
 * a repeated event can never stack or duplicate a settler's marks.
 */
export function grantMark(
  carrier: MarkCarrier,
  id: PersonalMarkId,
  day: number,
  source: PersonalMarkSource,
): boolean {
  if (!isPersonalMarkId(id) || !Number.isSafeInteger(day) || day < 0) return false;
  if (!isAllowedMarkSource(id, source)) return false;
  const existing = marksOf(carrier);
  if (existing.some((mark) => mark.id === id)) return false;
  carrier.marks = [...existing, Object.freeze({ id, day, source })];
  return true;
}

/** The creation-time draw for appearance and constitution marks; one stream, two stable draws. */
export function rollBornMarks(stream?: RngStream): PersonalMark[] {
  const rng = stream ?? getSimRng('settlerMarks');
  const marks: PersonalMark[] = [];
  if (rng() < BORN_MARK_CHANCE.pretty) marks.push(Object.freeze({ id: 'pretty', day: 0, source: 'born' }));
  if (rng() < BORN_MARK_CHANCE.sickly) marks.push(Object.freeze({ id: 'sickly', day: 0, source: 'born' }));
  return marks;
}

/**
 * Validate an untrusted saved mark list. Unknown ids, duplicate ids and impossible day/source
 * pairs are dropped; a non-array value is reported as absent.
 */
export function normalizeMarks(value: unknown): PersonalMark[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<PersonalMarkId>();
  const marks: PersonalMark[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const id = record.id;
    const day = record.day;
    const source = record.source;
    if (!isPersonalMarkId(id) || seen.has(id)) continue;
    if (typeof day !== 'number' || !Number.isSafeInteger(day) || day < 0) continue;
    if (!isAllowedMarkSource(id, source)) continue;
    seen.add(id);
    marks.push(Object.freeze({ id, day, source }));
  }
  return marks;
}

export type SurvivalOutcome = 'victory' | 'costly' | 'moderate' | 'heavy';

/** A repelled raid blesses every survivor; being mauled and living leaves a scar. */
export function awardRaidSurvivalMark(carrier: MarkCarrier, outcome: SurvivalOutcome, day: number): void {
  if (outcome === 'victory') grantMark(carrier, 'lucky', day, 'raidVictory');
  else if (outcome === 'costly' || outcome === 'heavy') grantMark(carrier, 'scarred', day, 'raidWound');
}

/** Emptied a rare bush: the one small windfall the world already hands out. */
export function awardRareWindfallMark(carrier: MarkCarrier, day: number): void {
  grantMark(carrier, 'lucky', day, 'rareWindfall');
}
