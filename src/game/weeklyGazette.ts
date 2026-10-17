import type { GameEventLog } from './gameTypes';
import { TICKS_PER_DAY } from './dayCycleClock';

const DAYS_PER_ISSUE = 7;
const TICKS_PER_ISSUE = DAYS_PER_ISSUE * TICKS_PER_DAY;

export type GazetteArticle = {
  section: string;
  headline: string;
  event: GameEventLog;
};

export type WeeklyGazetteIssue = {
  week: number;
  startDay: number;
  endDay: number;
  eventCount: number;
  births: number;
  marriages: number;
  deaths: number;
  scandals: number;
  articles: GazetteArticle[];
};

export function gazetteWeekForTick(tick: number): number {
  return Math.max(0, Math.floor(tick / TICKS_PER_ISSUE));
}

const SECTIONS: ReadonlyArray<{
  label: string;
  headline: string;
  types: ReadonlySet<GameEventLog['type']>;
}> = [
  {
    label: 'Whispers & Society',
    headline: 'Word around the village',
    types: new Set(['scandal', 'divorce', 'marriage', 'conception']),
  },
  {
    label: 'At the Town Hall',
    headline: 'Decisions and developments',
    types: new Set(['election', 'research', 'milestone', 'building']),
  },
  {
    label: 'Beyond the Village',
    headline: 'News from the valley',
    types: new Set(['disaster', 'combat', 'migration', 'trade', 'season']),
  },
  {
    label: 'The Village Register',
    headline: 'People and everyday life',
    types: new Set(['birth', 'death', 'prison', 'event']),
  },
];

/** A deterministic, read-only newspaper assembled from real Chronicle entries. */
export function buildWeeklyGazette(
  events: readonly GameEventLog[],
  week: number,
): WeeklyGazetteIssue {
  const selected: GameEventLog[] = [];
  let births = 0;
  let marriages = 0;
  let deaths = 0;
  let scandals = 0;

  for (const evt of events) {
    if (gazetteWeekForTick(evt.tick) !== week) continue;
    selected.push(evt);
    if (evt.type === 'birth') births++;
    if (evt.type === 'marriage') marriages++;
    if (evt.type === 'death') deaths++;
    if (evt.type === 'scandal') scandals++;
  }

  const articles: GazetteArticle[] = [];
  for (const section of SECTIONS) {
    const relevant = selected.filter((evt) => section.types.has(evt.type));
    for (const evt of relevant.slice(0, 2)) {
      articles.push({ section: section.label, headline: section.headline, event: evt });
    }
  }

  return {
    week,
    startDay: week * DAYS_PER_ISSUE + 1,
    endDay: (week + 1) * DAYS_PER_ISSUE,
    eventCount: selected.length,
    births,
    marriages,
    deaths,
    scandals,
    articles,
  };
}
