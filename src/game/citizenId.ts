import { EntityType, type Entity } from './gameTypes';
import { HUMAN_ADULT_MIN_AGE, HUMAN_VENERABLE_AGE } from './daycycleconstants';
export const SETTLER_NAME_FALLBACK = 'A settler';
export const SETTLER_LABEL_FALLBACK = 'Settler';
export function citizenGivenName(entity: Pick<Entity, 'name'>): string {
  const name = entity.name?.trim();
  return name ? name : SETTLER_NAME_FALLBACK;
}


export function humanDisplayName(entity: Entity): string {
  if (!entity.name) return SETTLER_NAME_FALLBACK;
  const surname = entity.surname?.trim() ? ` ${entity.surname.trim()}` : '';
  const title = entity.title?.trim() ? ` ${entity.title.trim()}` : '';
  return `${entity.name}${surname}${title}`;
}


export function citizenFullName(entity: Pick<Entity, 'name' | 'surname'>): string {
  const base = citizenGivenName(entity);
  const surname = entity.surname?.trim();
  return surname ? `${base} ${surname}` : base;
}

export function formatCitizenId(id: number): string {
  return `#${id}`;
}

export function formatCitizenName(entity: Pick<Entity, 'id' | 'name' | 'surname'>): string {
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
    years < HUMAN_ADULT_MIN_AGE
      ? 'child'
      : years >= HUMAN_VENERABLE_AGE
        ? 'elder'
        : 'adult';
  return `at the age of ${years} year${years === 1 ? '' : 's'} (${stage})`;
}

export function formatDeathLog(entity: Entity, cause: string): string {
  return `${citizenFullName(entity)} ${cause} — ${formatDeathAgeSuffix(entity)}`;
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