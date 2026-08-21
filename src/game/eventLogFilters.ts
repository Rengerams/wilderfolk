import type { GameEventLog } from './gameTypes';

/**
 * Player-selectable Chronicle categories. Each stored event type receives one
 * direct filter; `all` remains the combined newest-first view.
 */
export const EVENT_LOG_FILTER_OPTIONS: Array<{ id: 'all' | GameEventLog['type']; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'birth', label: 'Births' },
  { id: 'death', label: 'Deaths (age, illness, exhaustion, raid)' },
  { id: 'marriage', label: 'Marriages' },
  { id: 'scandal', label: 'Scandals' },
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
