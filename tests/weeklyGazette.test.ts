import { describe, expect, it } from 'vitest';
import type { GameEventLog } from '../src/game/gameTypes';
import { TICKS_PER_DAY } from '../src/game/dayCycleClock';
import { buildWeeklyGazette, gazetteWeekForTick } from '../src/game/weeklyGazette';

function event(id: number, day: number, type: GameEventLog['type'], message: string): GameEventLog {
  return { id, tick: day * TICKS_PER_DAY, day, year: 0, type, message };
}

describe('the weekly gazette reads the Chronicle without changing the simulation', () => {
  it('uses exact seven-day boundaries, including the start of the next week', () => {
    expect(gazetteWeekForTick(0)).toBe(0);
    expect(gazetteWeekForTick(7 * TICKS_PER_DAY - 1)).toBe(0);
    expect(gazetteWeekForTick(7 * TICKS_PER_DAY)).toBe(1);
  });

  it('counts true events and prints only the selected week', () => {
    const events = [
      event(8, 8, 'scandal', 'A secret was revealed'),
      event(7, 7, 'election', 'New village head elected'),
      event(6, 6, 'birth', 'New child born'),
      event(5, 5, 'death', 'A settler passed away'),
      event(4, 4, 'marriage', 'A wedding took place'),
      event(3, 3, 'scandal', 'A scandal shook the village'),
    ];
    const before = structuredClone(events);
    const first = buildWeeklyGazette(events, 0);
    expect(first.startDay).toBe(1);
    expect(first.endDay).toBe(7);
    expect(first.eventCount).toBe(3);
    expect(first.births).toBe(1);
    expect(first.marriages).toBe(1);
    expect(first.deaths).toBe(1);
    expect(first.scandals).toBe(0);
    expect(first.articles.every((article) => article.event.tick < 7 * TICKS_PER_DAY)).toBe(true);

    const next = buildWeeklyGazette(events, 1);
    expect(next.eventCount).toBe(3);
    expect(next.scandals).toBe(2);
    expect(next.articles.some((article) => article.event.type === 'election')).toBe(true);
    expect(events).toEqual(before);
  });

  it('never invents a story for an empty week', () => {
    const issue = buildWeeklyGazette([event(1, 0, 'birth', 'Hello')], 4);
    expect(issue.eventCount).toBe(0);
    expect(issue.articles).toEqual([]);
  });
});
