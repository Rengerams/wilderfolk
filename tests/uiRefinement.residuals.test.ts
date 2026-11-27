/**
 * The chronicle header names the filter the dropdown names. The control-state and keyboard-reach
 * guards that read source live in `scripts/check-source-guards.mjs`.
 */
import { describe, expect, it } from 'vitest';
import { EVENT_LOG_FILTER_OPTIONS, getEventLogFilterLabel } from '../src/game/eventLogFilters';

describe('R30 — the chronicle header names the filter the dropdown names', () => {
  it('labels every filter with the dropdown text, never the raw stored id', () => {
    for (const option of EVENT_LOG_FILTER_OPTIONS) {
      expect(getEventLogFilterLabel(option.id), `filter ${option.id}`).toBe(option.label);
    }
    // `death` is the stored id; the header must print the dropdown label, never the id.
    expect(getEventLogFilterLabel('death')).not.toBe('death');
    expect(getEventLogFilterLabel('all')).toBe('All');
  });
});
