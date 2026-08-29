import { EntityType, type Entity } from './gameTypes';
import { HUMAN_CHILDHOOD_DAYS, HUMAN_VENERABLE_AGE } from './dayCycle';

/** Full display name incl. title, with a fallback for nameless entities. */
export function humanDisplayName(entity: Entity): string {
  if (!entity.name) return 'A settler';
  const surname = entity.surname?.trim() ? ` ${entity.surname.trim()}` : '';
  const title = entity.title?.trim() ? ` ${entity.title.trim()}` : '';
  return `${entity.name}${surname}${title}`;
}

/** Stable citizen number — same as internal entity id, shown as #123 in the UI. */
export function formatCitizenId(id: number): string {
  return `#${id}`;
}

export function formatCitizenName(entity: Pick<Entity, 'id' | 'name' | 'surname'>): string {
  const base = entity.name || 'Settler';
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