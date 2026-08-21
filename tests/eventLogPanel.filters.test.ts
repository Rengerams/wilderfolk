import { describe, expect, it } from 'vitest';
import { EVENT_LOG_FILTER_OPTIONS } from '../src/game/eventLogFilters';
import type { GameEventLog } from '../src/game/gameTypes';

const EVENT_TYPES: GameEventLog['type'][] = [
  'birth',
  'death',
  'marriage',
  'scandal',
  'building',
  'disaster',
  'research',
  'trade',
  'migration',
  'season',
  'event',
  'combat',
  'milestone',
];

describe('Chronicle filter options', () => {
  it('provides one direct player filter for every event-log category', () => {
    const filterIds = EVENT_LOG_FILTER_OPTIONS.map((option) => option.id);

    expect(filterIds).toContain('all');
    expect(filterIds).toHaveLength(new Set(filterIds).size);
    expect(filterIds).toEqual(expect.arrayContaining(EVENT_TYPES));
  });
});
