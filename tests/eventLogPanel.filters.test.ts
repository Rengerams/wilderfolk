import { describe, expect, it } from 'vitest';
import { EVENT_LOG_FILTER_OPTIONS, getEventLogFilterLabel } from '../src/game/eventLogFilters';
import type { GameEventLog } from '../src/game/gameTypes';

/**
 * Every event type the game can write, declared once as a `Record` keyed by the union, so a new
 * event type is a compile error here instead of a silent filter gap.
 */
const EVENT_TYPE_COVERAGE: Record<GameEventLog['type'], true> = {
  birth: true,
  conception: true,
  death: true,
  marriage: true,
  divorce: true,
  scandal: true,
  prison: true,
  election: true,
  building: true,
  disaster: true,
  research: true,
  trade: true,
  migration: true,
  season: true,
  event: true,
  combat: true,
  milestone: true,
};

const EVENT_TYPES = Object.keys(EVENT_TYPE_COVERAGE) as GameEventLog['type'][];

describe('Chronicle filter options', () => {
  it('provides one direct player filter for every event-log category', () => {
    const filterIds = EVENT_LOG_FILTER_OPTIONS.map((option) => option.id);

    expect(filterIds).toContain('all');
    expect(filterIds).toHaveLength(new Set(filterIds).size);
    expect(filterIds).toEqual(expect.arrayContaining(EVENT_TYPES));
  });

  it('names an imprisonment as its own filter, not as a scandal or a generic event', () => {
    expect(getEventLogFilterLabel('prison')).toMatch(/imprison/i);
    expect(getEventLogFilterLabel('prison')).not.toBe(getEventLogFilterLabel('event'));
    expect(getEventLogFilterLabel('prison')).not.toBe(getEventLogFilterLabel('scandal'));
  });
});
