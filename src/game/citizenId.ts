import { EntityType, type Entity } from './gameTypes';
import { HUMAN_CHILDHOOD_DAYS, HUMAN_VENERABLE_AGE } from './dayCycleConstants';

/**
 * The name the UI shows for a settler who has none — one fallback, owned here.
 *
 * The panels each picked their own string for a nameless settler ("Unknown" in the inspector's
 * family list, "Unnamed" in the dashboard table, "Settler" in the families chip) while the tree
 * header of the *same* panel read "A settler" through `humanDisplayName`, so one settler had three
 * names on one screen (audit C2 "Settler name fallback").
 *
 * This is the **sentence** form: "A settler has died." See {@link SETTLER_LABEL_FALLBACK} for the
 * label form that follows an `#id`.
 */
export const SETTLER_NAME_FALLBACK = 'A settler';

/**
 * The same settler as a **label after an `#id`**: `#12 Settler`.
 *
 * `formatCitizenName` needs a bare noun — "Cannot assign #12 A settler" reads worse than the drift it
 * would remove, so the two grammars get two named strings in the one owner rather than one of them
 * being typed as a literal in the formatter (2026-09-20 audit, W-1; caught in review of the first cut,
 * which delegated to {@link citizenGivenName} and produced the article form everywhere).
 */
export const SETTLER_LABEL_FALLBACK = 'Settler';

/** A settler's given name, or the owner's fallback when the entity has none. */
export function citizenGivenName(entity: Pick<Entity, 'name'>): string {
  const name = entity.name?.trim();
  return name ? name : SETTLER_NAME_FALLBACK;
}

/** Full display name incl. title, with a fallback for nameless entities. */
export function humanDisplayName(entity: Entity): string {
  if (!entity.name) return SETTLER_NAME_FALLBACK;
  const surname = entity.surname?.trim() ? ` ${entity.surname.trim()}` : '';
  const title = entity.title?.trim() ? ` ${entity.title.trim()}` : '';
  return `${entity.name}${surname}${title}`;
}

/**
 * Given name + surname, **without** the title or the `#id` prefix — the compact form the panels' lists
 * and pickers show.
 *
 * Ten call sites hand-rolled this join (`{citizenGivenName(x)}{x.surname ? ` ${x.surname}` : ''}`),
 * one of them rendering a trailing space for a surname-less settler, and `useKeyboardControls`/
 * `PopulationPanel` each carried a private copy of the wrapper (2026-09-20 audit, W-2). `humanDisplayName`
 * is the title-inclusive form; `formatCitizenName` is the identified form.
 */
export function citizenFullName(entity: Pick<Entity, 'name' | 'surname'>): string {
  const base = citizenGivenName(entity);
  const surname = entity.surname?.trim();
  return surname ? `${base} ${surname}` : base;
}

/** Stable citizen number — same as internal entity id, shown as #123 in the UI. */
export function formatCitizenId(id: number): string {
  return `#${id}`;
}

export function formatCitizenName(entity: Pick<Entity, 'id' | 'name' | 'surname'>): string {
  // The label form of the owner's fallback (a bare noun after the `#id`), and the owner's trim: this
  // formatter used to type its own `'Settler'` literal, which is how one settler read "A settler" in
  // one panel and "#12 Settler" in another (2026-09-20 audit, W-1).
  const name = entity.name?.trim();
  const base = name ? name : SETTLER_LABEL_FALLBACK;
  const surname = entity.surname?.trim();
  const full = surname ? `${base} ${surname}` : base;
  return `${formatCitizenId(entity.id)} ${full}`;
}

export function parseCitizenIdQuery(query: string): number | null {
  const trimmed = query.trim().replace(/^#/, '');
  if (!trimmed || !/^\d+$/.test(trimmed)) return null;
  const id = Number.parseInt(trimmed, 10);
  return Number.isFinite(id) ? id : null;
}

export function matchesCitizenSearch(entity: Entity, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const citizenId = parseCitizenIdQuery(q);
  if (citizenId != null) return entity.id === citizenId;

  const base = (entity.name || '').toLowerCase();
  const surname = (entity.surname || '').toLowerCase();
  const title = (entity.title || '').toLowerCase();
  const full = `${base} ${surname} ${title}`.trim();

  return (
    base.includes(q) ||
    surname.includes(q) ||
    title.includes(q) ||
    full.includes(q)
  );
}

/** Life stage + age for chronicle death lines. */
export function formatDeathAgeSuffix(entity: Pick<Entity, 'age' | 'isJuvenile'>): string {
  const years = Math.max(0, entity.age);
  const stage =
    years < HUMAN_CHILDHOOD_DAYS
      ? 'child'
      : years >= HUMAN_VENERABLE_AGE
        ? 'elder'
        : 'adult';
  return `at the age of ${years} year${years === 1 ? '' : 's'} (${stage})`;
}

export function formatDeathLog(entity: Entity, cause: string): string {
  return `${formatCitizenName(entity)} ${cause} — ${formatDeathAgeSuffix(entity)}`;
}

export function appendDeathAge(message: string, entity: Pick<Entity, 'age' | 'isJuvenile'>): string {
  return `${message} — ${formatDeathAgeSuffix(entity)}`;
}

export function findCitizenByQuery(entities: Iterable<Entity>, query: string): Entity | undefined {
  const citizenId = parseCitizenIdQuery(query);
  if (citizenId != null) {
    for (const e of entities) {
      if (e.alive && e.type === EntityType.Human && e.id === citizenId) {
        return e;
      }
    }
    return undefined;
  }

  const q = query.trim().toLowerCase();
  if (!q) return undefined;

  for (const e of entities) {
    if (e.alive && e.type === EntityType.Human && matchesCitizenSearch(e, q)) {
      return e;
    }
  }

  return undefined;
}