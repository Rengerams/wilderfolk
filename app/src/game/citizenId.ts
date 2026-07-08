import { EntityType, type Entity } from './gameTypes';
import { HUMAN_CHILDHOOD_DAYS, HUMAN_VENERABLE_AGE } from './dayCycle';

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
  const full = `${base} ${surname}`.trim();
  return base.includes(q) || surname.includes(q) || full.includes(q);
}

/** Life stage + age for chronicle death lines (internal age counts as years in the village calendar). */
export function formatDeathAgeSuffix(entity: Pick<Entity, 'age' | 'isJuvenile'>): string {
  const years = Math.max(0, entity.age);
  // Age is ground truth; isJuvenile flag is ignored here to avoid inconsistent overrides.
  const stage = years < HUMAN_CHILDHOOD_DAYS
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

export function findCitizenByQuery(entities: Entity[], query: string): Entity | undefined {
  const citizenId = parseCitizenIdQuery(query);
  if (citizenId != null) {
    return entities.find((e) => e.alive && e.type === EntityType.Human && e.id === citizenId);
  }
  const q = query.trim().toLowerCase();
  if (!q) return undefined;
  return entities.find(
    (e) => e.alive && e.type === EntityType.Human && matchesCitizenSearch(e, q),
  );
}