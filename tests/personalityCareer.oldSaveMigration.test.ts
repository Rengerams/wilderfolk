import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { createInitialView } from '../src/game/viewState';
import { buildSaveData, loadGameFromParsedOutcome, parseSaveJson } from '../src/game/saveLoad';
import { EntityType, JobType } from '../src/game/gameTypes';
import { human } from '../src/test/factories';
import { extractSimPrep, applySimPrep } from '../src/game/simWorker/simPrep';
import { extractSimTickDelta, applySimTickDelta } from '../src/game/simBuffers/simDelta';
import { hydrateWorldRuntimeCaches, invalidateWorldRuntimeCaches } from '../src/game/worldRuntimeCaches';
import { snapshotSimRng, resetSimRng } from '../src/game/simRng';
import { transformToWerewolfForm } from '../src/game/moonHowler';
import { revertToHumanForm } from '../src/game/moonHowlerForm';
import type { WorldState } from '../src/game/gameTypes';

function oldPayload(): Record<string, unknown> {
  const world = initGame({ seed: 4242 });
  const encoded = parseSaveJson(JSON.stringify(buildSaveData(world, createInitialView(world.width, world.height))));
  if (!encoded.valid || !encoded.parsed) throw Error('invalid fixture');
  for (const e of encoded.parsed.entities as Record<string, unknown>[]) {
    if (e.type !== EntityType.Human) continue;
    delete e.careerHistory;
    delete e.careerMilestones;
    delete e.scheduleLastWorkedSiteId;
    delete e.scheduleWorkedSiteIdToday;
    delete e.scheduleWorkedJobToday;
    delete e.scheduleLastWorkedJob;
  }
  return encoded.parsed;
}

function load(payload: Record<string, unknown>): WorldState {
  const result = loadGameFromParsedOutcome(payload);
  if (!result.ok) throw Error('save refused: ' + result.reason + ' ' + (result.detail ?? ''));
  return result.world;
}

describe('PR D compact old-save migration', () => {
  it('does not invent shifts or milestones from pre-existing skills, occupations or DNA', () => {
    resetSimRng();
    const payload = oldPayload();
    const before = (payload.entities as Record<string, unknown>[]).find((e) => e.type === EntityType.Human)!;
    before.skills = { farmer: 90 };
    before.traits = ['hardy'];
    before.job = JobType.Farmer;
    const snapshot = structuredClone(before);
    const world = load(payload);
    const person = world.entities.find((e) => e.id === before.id)!;
    expect(person.skills?.farmer).toBe(90);
    expect(person.traits).toEqual(['hardy']);
    expect(person.careerHistory).toBeUndefined();
    expect(person.careerMilestones).toBeUndefined();
    expect(before).toEqual(snapshot);
  });

  it('normalizes invalid career records deterministically on consecutive loads', () => {
    const payload = oldPayload();
    const before = (payload.entities as Record<string, unknown>[]).find((e) => e.type === EntityType.Human)!;
    before.careerHistory = { farmer: { days: '200', lastDay: -1 },
      hunter: { days: 8, lastDay: 12 }, bogus: { days: 30, lastDay: 1 } };
    before.careerMilestones = { hunter: { tier: 'master', tierAtDay: 12 },
      doctor: { trainedAtDay: 11 }, bogus: { tier: 'master', tierAtDay: 1 } };
    const first = load(payload);
    const entity = first.entities.find((e) => e.id === before.id)!;
    expect(entity.careerHistory).toEqual({ hunter: { days: 8, lastDay: 12 } });
    expect(entity.careerMilestones).toEqual({ doctor: { trainedAtDay: 11 } });
    const second = load(payload);
    const same = second.entities.find((e) => e.id === before.id)!;
    expect(same.careerHistory).toEqual(entity.careerHistory);
    expect(same.careerMilestones).toEqual(entity.careerMilestones);
    const save = parseSaveJson(JSON.stringify(buildSaveData(first, createInitialView(first.width, first.height))));
    if (!save.valid || !save.parsed) throw Error('invalid round trip');
    const twice = load(save.parsed);
    const final = twice.entities.find((e) => e.id === before.id)!;
    expect(final.careerHistory).toEqual(entity.careerHistory);
    expect(final.careerMilestones).toEqual(entity.careerMilestones);
  });

  it('preserves valid work across worker prep rollback and actual delta transport', () => {
    const authority = initGame({ seed: 42 });
    const person = authority.entities.find((e) => e.type === EntityType.Human)!;
    person.careerHistory = { farmer: { days: 21, lastDay: 20 } };
    person.careerMilestones = { farmer: { tier: 'practiced', tierAtDay: 15 } };
    const prep = extractSimPrep(authority);
    person.careerHistory.farmer!.days = 500;
    person.careerMilestones.farmer!.tier = 'master';
    expect(prep.entities.find((e) => e.id === person.id)?.careerHistory?.farmer?.days).toBe(21);
    applySimPrep(authority, prep);
    const restored = authority.entities.find((e) => e.id === person.id)!;
    expect(restored.careerHistory?.farmer?.days).toBe(21);
    expect(restored.careerMilestones?.farmer?.tier).toBe('practiced');
    const display = hydrateWorldRuntimeCaches(structuredClone(authority));
    const delta = extractSimTickDelta(authority, authority.entities.filter((e) => e.alive),
      { headless: true, cloneMode: 'transfer' });
    applySimTickDelta(display, structuredClone(delta), { cloneMode: 'transfer' });
    invalidateWorldRuntimeCaches(display);
    hydrateWorldRuntimeCaches(display);
    expect(display.entities.find((e) => e.id === person.id)?.careerHistory).toEqual(restored.careerHistory);
    expect(display.entities.find((e) => e.id === person.id)?.careerMilestones).toEqual(restored.careerMilestones);
  });

  it('preserves career objects on Moon Howler transformation/reversion without a parallel snapshot', () => {
    const person = human(123, { careerHistory: { hunter: { days: 42, lastDay: 42 } },
      careerMilestones: { hunter: { tier: 'experienced', tierAtDay: 42 } } });
    transformToWerewolfForm(person, []);
    revertToHumanForm(person);
    expect(person.careerHistory?.hunter?.days).toBe(42);
    expect(person.careerMilestones?.hunter?.tier).toBe('experienced');
  });

  it('does not consume extra live RNG draws when career fields are absent', () => {
    resetSimRng();
    const legacy = oldPayload();
    const control = structuredClone(legacy);
    for (const entity of control.entities as Record<string, unknown>[]) {
      if (entity.type !== EntityType.Human) continue;
      entity.careerHistory = {};
      entity.careerMilestones = {};
    }
    // The existing Moon Howler load path may legitimately create its own RNG stream.
    // Compare the exact same save with versus without optional career fields instead.
    load(control);
    const expected = snapshotSimRng();
    resetSimRng();
    load(legacy);
    expect(snapshotSimRng()).toEqual(expected);
  });

  it('retains legacy absent DNA behavior without inventing career experience', () => {
    const payload = oldPayload();
    const first = (payload.entities as Record<string, unknown>[]).find((e) => e.type === EntityType.Human)!;
    delete first.traits;
    const restored = load(payload).entities.find((e) => e.id === first.id)!;
    expect(restored.traits?.length).toBeGreaterThan(0);
    expect(restored.careerHistory).toBeUndefined();
    expect(restored.careerMilestones).toBeUndefined();
  });
});
