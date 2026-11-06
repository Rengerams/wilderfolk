/**
 * Personal marks: born once or earned once, never inherited, never rerolled, saved, and priced
 * through the same activity evaluator as aptitudes.
 */
import { describe, expect, it } from 'vitest';
import {
  PERSONAL_MARK_DEFS,
  PERSONAL_MARK_IDS,
  awardRaidSurvivalMark,
  awardRareWindfallMark,
  grantMark,
  hasMark,
  marksOf,
  normalizeMarks,
  rollBornMarks,
  type PersonalMark,
} from '../src/game/personalMarks';
import { evaluateAptitudeInfluence } from '../src/game/personality/traitEvaluation';
import { APTITUDE_ACTIVITIES } from '../src/game/personality/activityAptitudes';
import { genomeFrom } from './helpers/genome';
import { createSeededRng, resetSimRng } from '../src/game/simRng';
import { ENTITY_PERSISTED_FIELDS } from '../src/game/saveSchema';
import { initGame } from '../src/game/worldGen';
import { createInitialView } from '../src/game/viewState';
import { buildSaveData, loadGameFromParsedOutcome, parseSaveJson } from '../src/game/saveLoad';
import { extractSimPrep } from '../src/game/simWorker/simPrep';
import { EntityType } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';

const mark = (id: PersonalMark['id'], day = 1, source: PersonalMark['source'] = 'raidVictory'): PersonalMark =>
  ({ id, day, source });

const factorFor = (marks: readonly PersonalMark[], activity: keyof typeof APTITUDE_ACTIVITIES): number =>
  evaluateAptitudeInfluence({ genomeV2: genomeFrom(), marks }, activity).factor;

function firstLivingHuman(world: WorldState): Entity {
  const human = world.entities.find((entity) => entity.type === EntityType.Human && entity.alive);
  if (!human) throw new Error('fixture premise: the colony has a living settler');
  return human;
}

describe('a mark is born once or earned once, never inherited', () => {
  it('defines four marks with player-facing wording and a born/earned split', () => {
    expect(PERSONAL_MARK_IDS).toEqual(['lucky', 'pretty', 'scarred', 'sickly']);
    for (const id of PERSONAL_MARK_IDS) {
      expect(PERSONAL_MARK_DEFS[id].id).toBe(id);
      expect(PERSONAL_MARK_DEFS[id].label.length).toBeGreaterThan(0);
      expect(PERSONAL_MARK_DEFS[id].blurb.length).toBeGreaterThan(0);
    }
    expect(PERSONAL_MARK_DEFS.pretty.born).toBe(true);
    expect(PERSONAL_MARK_DEFS.sickly.born).toBe(true);
    expect(PERSONAL_MARK_DEFS.lucky.born).toBe(false);
    expect(PERSONAL_MARK_DEFS.scarred.born).toBe(false);
  });

  it('draws the two born marks at their documented rates and keeps earned marks out', () => {
    let pretty = 0;
    let sickly = 0;
    const runs = 4000;
    for (let seed = 1; seed <= runs; seed++) {
      const marks = rollBornMarks(createSeededRng(seed, 'bornMarkTest'));
      for (const entry of marks) expect(['pretty', 'sickly']).toContain(entry.id);
      if (marks.some((entry) => entry.id === 'pretty')) pretty++;
      if (marks.some((entry) => entry.id === 'sickly')) sickly++;
    }
    expect(pretty / runs).toBeGreaterThan(0.08);
    expect(pretty / runs).toBeLessThan(0.17);
    expect(sickly / runs).toBeGreaterThan(0.04);
    expect(sickly / runs).toBeLessThan(0.13);
  });

  it('is deterministic for one stream position', () => {
    expect(rollBornMarks(createSeededRng(77, 'bornMarkTest')))
      .toEqual(rollBornMarks(createSeededRng(77, 'bornMarkTest')));
  });

  it('grants an earned mark once and never duplicates it', () => {
    const settler: Entity = { id: 1 } as Entity;
    expect(grantMark(settler, 'lucky', 4, 'raidVictory')).toBe(true);
    expect(hasMark(settler, 'lucky')).toBe(true);
    expect(marksOf(settler)).toEqual([{ id: 'lucky', day: 4, source: 'raidVictory' }]);
    expect(grantMark(settler, 'lucky', 9, 'rareWindfall')).toBe(false);
    expect(marksOf(settler)).toHaveLength(1);
    expect(marksOf({} as Entity)).toEqual([]);
  });

  it('rejects an impossible day or an unknown source', () => {
    const settler: Entity = { id: 1 } as Entity;
    expect(grantMark(settler, 'lucky', -1, 'raidVictory')).toBe(false);
    expect(grantMark(settler, 'lucky', 1.5, 'raidVictory')).toBe(false);
    expect(grantMark(settler, 'lucky', 1, 'invented' as PersonalMark['source'])).toBe(false);
    expect(marksOf(settler)).toEqual([]);
  });
});

describe('the save boundary validates marks without inventing one', () => {
  it('keeps valid entries and drops unknown, duplicate, impossible and sourceless ones', () => {
    const normalized = normalizeMarks([
      { id: 'lucky', day: 3, source: 'raidVictory' },
      { id: 'lucky', day: 4, source: 'raidVictory' },
      { id: 'strong', day: 2, source: 'born' },
      { id: 'pretty', day: -2, source: 'born' },
      { id: 'scarred', day: 5, source: 'nonsense' },
      { id: 'sickly', day: 1.5, source: 'born' },
      'junk',
      null,
    ]);
    expect(normalized).toEqual([{ id: 'lucky', day: 3, source: 'raidVictory' }]);
  });

  it('reports a non-list as absent and an empty list as no marks', () => {
    expect(normalizeMarks(undefined)).toBeUndefined();
    expect(normalizeMarks({ id: 'lucky' })).toBeUndefined();
    expect(normalizeMarks([])).toEqual([]);
  });

  it('is an entity-persisted field owned by the save allow-list', () => {
    expect(ENTITY_PERSISTED_FIELDS).toContain('marks');
  });
});

describe('marks feed the one activity evaluator', () => {
  it('prices lucky on danger and conception and nowhere else', () => {
    const lucky = [mark('lucky')];
    expect(factorFor(lucky, 'hunting')).toBeGreaterThan(1);
    expect(factorFor(lucky, 'pursuit')).toBeGreaterThan(1);
    expect(factorFor(lucky, 'escape')).toBeGreaterThan(1);
    expect(factorFor(lucky, 'defense')).toBeGreaterThan(1);
    expect(factorFor(lucky, 'conception')).toBeGreaterThan(1);
    expect(factorFor(lucky, 'courtship')).toBe(1);
    expect(factorFor(lucky, 'learning')).toBe(1);
    expect(factorFor(lucky, 'routineWork')).toBe(1);
  });

  it('prices pretty on the social activities only', () => {
    const pretty = [mark('pretty', 0, 'born')];
    expect(factorFor(pretty, 'courtship')).toBeGreaterThan(1);
    expect(factorFor(pretty, 'friendship')).toBeGreaterThan(1);
    expect(factorFor(pretty, 'company')).toBeGreaterThan(1);
    expect(factorFor(pretty, 'hunting')).toBe(1);
  });

  it('makes scarred a defence strength and a courtship cost', () => {
    const scarred = [mark('scarred')];
    expect(factorFor(scarred, 'defense')).toBeGreaterThan(1);
    expect(factorFor(scarred, 'courtship')).toBeLessThan(1);
  });

  it('makes sickly a cost on endurance and fight-or-flight', () => {
    const sickly = [mark('sickly', 0, 'born')];
    expect(factorFor(sickly, 'labor')).toBeLessThan(1);
    expect(factorFor(sickly, 'defense')).toBeLessThan(1);
    expect(factorFor(sickly, 'escape')).toBeLessThan(1);
    expect(factorFor(sickly, 'construction')).toBeLessThan(1);
  });

  it('keeps every marked factor inside the activity cap', () => {
    for (const id of PERSONAL_MARK_IDS) {
      for (const activity of Object.keys(APTITUDE_ACTIVITIES) as Array<keyof typeof APTITUDE_ACTIVITIES>) {
        const factor = factorFor([mark(id)], activity);
        const cap = APTITUDE_ACTIVITIES[activity].cap;
        expect(factor, `${id} on ${activity}`).toBeGreaterThanOrEqual(1 - cap - 1e-12);
        expect(factor, `${id} on ${activity}`).toBeLessThanOrEqual(1 + cap + 1e-12);
      }
    }
  });

  it('leaves a settler without marks at exactly neutral', () => {
    for (const activity of Object.keys(APTITUDE_ACTIVITIES) as Array<keyof typeof APTITUDE_ACTIVITIES>) {
      expect(factorFor([], activity), activity).toBe(1);
    }
  });
});

describe('marks are awarded only by real resolved events', () => {
  it('blesses a repelled raid and scars a mauling that was survived', () => {
    const winner: Entity = { id: 1 } as Entity;
    awardRaidSurvivalMark(winner, 'victory', 12);
    expect(marksOf(winner)).toEqual([{ id: 'lucky', day: 12, source: 'raidVictory' }]);

    const mauled: Entity = { id: 2 } as Entity;
    awardRaidSurvivalMark(mauled, 'heavy', 12);
    awardRaidSurvivalMark(mauled, 'costly', 13);
    expect(marksOf(mauled)).toEqual([{ id: 'scarred', day: 12, source: 'raidWound' }]);

    const stalemate: Entity = { id: 3 } as Entity;
    awardRaidSurvivalMark(stalemate, 'moderate', 12);
    expect(marksOf(stalemate)).toEqual([]);
  });

  it('turns one rare windfall into one lucky mark', () => {
    const forager: Entity = { id: 4 } as Entity;
    awardRareWindfallMark(forager, 7);
    expect(marksOf(forager)).toEqual([{ id: 'lucky', day: 7, source: 'rareWindfall' }]);
  });
});

describe('marks survive save, load and the worker boundary', () => {
  it('round-trips a real save payload and drops a corrupt saved list', () => {
    resetSimRng();
    const world = initGame({ skipTerrain: true, villageName: 'Marks', size: 'medium', seed: 20_261_106 });
    const target = firstLivingHuman(world);
    grantMark(target, 'lucky', 6, 'raidVictory');
    grantMark(target, 'pretty', 0, 'born');

    const raw = JSON.stringify(buildSaveData(world, createInitialView(world.width, world.height)));
    const parsed = parseSaveJson(raw);
    expect(parsed.valid, 'fixture premise: the current build writes a loadable save').toBe(true);
    if (!parsed.valid || !parsed.parsed) throw new Error('fixture save invalid');

    const loaded = loadGameFromParsedOutcome(parsed.parsed);
    if (!loaded.ok) throw new Error(`marks payload refused: ${loaded.reason} ${loaded.detail ?? ''}`);
    const after = loaded.world.entities.find((entity) => entity.id === target.id);
    expect(after?.marks).toEqual([
      { id: 'lucky', day: 6, source: 'raidVictory' },
      { id: 'pretty', day: 0, source: 'born' },
    ]);
  });

  it('drops a corrupt saved list instead of fabricating a new mark', () => {
    resetSimRng();
    const world = initGame({ skipTerrain: true, villageName: 'Corrupt', size: 'medium', seed: 20_261_107 });
    const target = firstLivingHuman(world);
    const raw = JSON.stringify(buildSaveData(world, createInitialView(world.width, world.height)));
    const parsed = parseSaveJson(raw);
    if (!parsed.valid || !parsed.parsed) throw new Error('fixture save invalid');
    const record = (parsed.parsed.entities as Array<Record<string, unknown>>)
      .find((entry) => entry.id === target.id);
    record!.marks = [{ id: 'strong', day: 1, source: 'born' }, { id: 'lucky', day: -4, source: 'raidVictory' }];

    const loaded = loadGameFromParsedOutcome(parsed.parsed);
    if (!loaded.ok) throw new Error(`corrupt payload refused: ${loaded.reason}`);
    const after = loaded.world.entities.find((entity) => entity.id === target.id);
    expect(after?.marks ?? []).toEqual([]);
  });

  it('copies marks into the worker prep payload instead of sharing the array', () => {
    resetSimRng();
    const world = initGame({ skipTerrain: true, size: 'medium', seed: 20_261_108 });
    const target = firstLivingHuman(world);
    grantMark(target, 'scarred', 11, 'raidWound');

    const prep = extractSimPrep(world);
    const shipped = prep.entities.find((entity) => entity.id === target.id);
    expect(shipped?.marks).toEqual([{ id: 'scarred', day: 11, source: 'raidWound' }]);
    expect(shipped?.marks).not.toBe(target.marks);
    shipped?.marks?.push(mark('pretty', 0, 'born'));
    expect(marksOf(target)).toHaveLength(1);
  });
});
