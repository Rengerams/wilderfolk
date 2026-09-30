import type { GameEventLog } from './gameTypes';

/**
 * Player-selectable Chronicle categories. Each stored event type receives one
 * direct filter; `all` remains the combined newest-first view.
 */
export const EVENT_LOG_FILTER_OPTIONS: Array<{ id: 'all' | GameEventLog['type']; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'conception', label: 'Conceptions (expecting)' },
  { id: 'birth', label: 'Births' },
  { id: 'death', label: 'Deaths (age, illness, exhaustion, raid)' },
  { id: 'marriage', label: 'Marriages' },
  { id: 'divorce', label: 'Divorces' },
  { id: 'scandal', label: 'Scandals' },
  { id: 'prison', label: 'Imprisonments (jailed for scandal)' },
  { id: 'building', label: 'Buildings' },
  { id: 'research', label: 'Research' },
  { id: 'trade', label: 'Trade' },
  { id: 'migration', label: 'Visitors' },
  { id: 'disaster', label: 'Disasters' },
  { id: 'combat', label: 'Combat' },
  { id: 'event', label: 'Events' },
  { id: 'season', label: 'Seasons' },
  { id: 'milestone', label: 'Milestones' },
];

/**
 * The label the filter dropdown shows, for a header that names the active filter mid-sentence.
 *
 * One definition: the dropdown and the "Showing N of M …" line used to disagree in wording because
 * the header interpolated the raw stored id ("Showing 500 of 823 death") instead of this label
 * (2026-09-17 UI audit, R30).
 */
export function getEventLogFilterLabel(id: 'all' | GameEventLog['type']): string {
  return EVENT_LOG_FILTER_OPTIONS.find((option) => option.id === id)?.label ?? id;
}