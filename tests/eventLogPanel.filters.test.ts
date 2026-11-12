import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EVENT_LOG_FILTER_OPTIONS, getEventLogFilterLabel } from '../src/game/eventLogFilters';
import type { GameEventLog } from '../src/game/gameTypes';

const panelSource = (): string =>
  readFileSync(resolve(process.cwd(), 'src/game/EventLogPanel.tsx'), 'utf8');

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

describe('a shell handover reaches the open log window', () => {
  it('adopts a changed initialFilter while the window stays mounted', () => {
    const source = panelSource();
    expect(source).toContain('filterChoice.handedOver === initialFilter');
    expect(source).not.toContain('useEffect');
  });

  it('downloads the stored Chronicle the footer promises, not the active category', () => {
    const source = panelSource();
    for (const format of ['downloadChronicleLog', 'downloadChronicleJSON', 'downloadChronicleCSV']) {
      expect(source, `${format} still exports the filtered list`).not.toContain(`${format}(allFiltered, meta)`);
      expect(source).toContain(`${format}(events, meta)`);
    }
  });
});
