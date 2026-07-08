import { describe, expect, it } from 'vitest';
import { formatChronicleCSV } from '@/game/eventLogExport';
import type { GameEventLog } from '@/game/gameTypes';

describe('formatChronicleCSV', () => {
  it('escapes newlines inside message fields', () => {
    const events: GameEventLog[] = [{
      id: 1,
      tick: 10,
      year: 2,
      day: 5,
      type: 'event',
      message: 'Line one\nLine two',
    }];
    const csv = formatChronicleCSV(events);
    expect(csv.split('\n')).toHaveLength(2);
    expect(csv).toContain('"Line one Line two"');
  });
});