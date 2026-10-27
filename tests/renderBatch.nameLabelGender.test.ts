/**
 * F-RND-19 — gender must not be carried by the name plate's colour alone.
 *
 * The plate colour is the only gender cue a player gets on the map, and it is unavailable to a
 * colour-blind player, invisible in a screenshot and lost in greyscale. The plate text now carries
 * the ♂/♀ glyph the inspector already uses.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatHumanNameLabel, type HumanNameLabelSubject } from '../src/game/renderer/overheadLayout';

function subject(overrides: Partial<HumanNameLabelSubject> = {}): HumanNameLabelSubject {
  return {
    id: 42,
    name: 'Ada',
    surname: null,
    title: null,
    faction: undefined,
    gender: 'female',
    isJuvenile: false,
    ...overrides,
  } as HumanNameLabelSubject;
}

const PLAIN = { isLeader: false, showRole: true, showId: true };

describe('F-RND-19 — the name plate states gender in text', () => {
  it('marks the plate differently for each gender', () => {
    const female = formatHumanNameLabel(subject({ gender: 'female' }), PLAIN);
    const male = formatHumanNameLabel(subject({ gender: 'male' }), PLAIN);
    expect(female).toContain('♀');
    expect(male).toContain('♂');
    expect(female).not.toBe(male);
  });

  it('keeps the plate it already showed — name, suffixes and the visitor/rival marks', () => {
    expect(formatHumanNameLabel(subject({ surname: 'Lovelace' }), PLAIN)).toContain('Ada Lovelace');
    expect(formatHumanNameLabel(subject(), { ...PLAIN, showId: false })).not.toContain('#42');
    expect(formatHumanNameLabel(subject(), PLAIN)).toContain('#42');
    expect(formatHumanNameLabel(subject({ faction: 'visitor' }), PLAIN)).toContain('↗');
    expect(formatHumanNameLabel(subject({ faction: 'rival' }), PLAIN)).toContain('⚑');
    expect(formatHumanNameLabel(subject({ isJuvenile: true }), PLAIN)).toContain('child');
    const leader = formatHumanNameLabel(subject({ name: undefined }), { ...PLAIN, isLeader: true });
    expect(leader).toContain('👑');
    expect(leader).toContain('Village head');
    expect(leader).toContain('Head');
  });

  it('is what the human painter draws', () => {
    const humans = readFileSync(
      fileURLToPath(new URL('../src/game/renderer/humans.ts', import.meta.url)),
      'utf8',
    );
    expect(humans).toContain('formatHumanNameLabel(');
    // The painter used to compose the plate inline; these literals are the expression that moved.
    expect(humans).not.toContain('· Head');
    expect(humans).not.toContain('Village head');
  });
});
