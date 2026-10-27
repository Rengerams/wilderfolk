import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { BuildingType, EntityType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { createRivalProfile, selectRivalDailyAction } from '../src/game/rivalProfiles';
import { tryDailyAmicableDivorce } from '../src/game/simulation/humanRelationships';
import { initGame } from '../src/game/worldGen';
import { gameTick } from '../src/game/gameTick';
import { createInitialView } from '../src/game/viewState';
import { buildSaveData, loadGameFromParsed, parseSaveJson } from '../src/game/saveLoad';
import { applySimPrep, extractSimPrep } from '../src/game/simWorker/simPrep';
import { applySimTickDelta, extractSimTickDelta } from '../src/game/simBuffers/simDelta';
import {
  createSeededRng,
  getPresentationRng,
  getSimRng,
  getSimSeed,
  parseSimRngSnapshot,
  resetSimRng,
  restoreSimRng,
  setSimSeed,
  snapshotSimRng,
} from '../src/game/simRng';

/**
 * Worker-boundary audit F4 — the tick-delta RNG restore rewound (or deleted) main-thread
 * presentation streams.
 *
 * `applySimTickDelta` calls `restoreSimRng(delta.simRng)` on the main thread, and that snapshot is the
 * **worker's**. The worker never draws `rendererShake` / `weatherFx` / `sfx` / `ambientAudio` /
 * `introScreen`, so those streams sat frozen at the last upload: every applied tick (~3×/s) replayed
 * the same weather respawn positions, screen shake and sfx variation, and a stream created after the
 * upload was deleted outright. Presentation randomness now lives in its own registry
 * (`getPresentationRng`) that snapshots never read or write.
 */
describe('simRng.presentationStreams.test.ts', () => {
  /** The main-thread presentation owners (audit F4). */
  const PRESENTATION_OWNERS = [
    'rendererShake',
    'weatherFx',
    'sfx',
    'ambientAudio',
    'introScreen',
  ] as const;

  /** The modules that own those streams: drawing and audio, never the simulation. */
  const PRESENTATION_MODULES = [
    'src/game/renderer.ts',
    'src/game/renderer/weather.ts',
    'src/audio/sfx.ts',
    'src/audio/ambient.ts',
    'src/game/IntroScreen.tsx',
  ] as const;

  describe('presentation RNG streams', () => {
    it('keeps every presentation owner out of the simulation snapshot', () => {
      resetSimRng();
      setSimSeed(4242);
      getSimRng('entityFactory')();
      for (const owner of PRESENTATION_OWNERS) getPresentationRng(owner)();

      const names = snapshotSimRng().owners.map(([owner]) => owner);
      expect(names).toContain('entityFactory');
      for (const owner of PRESENTATION_OWNERS) expect(names).not.toContain(owner);
    });

    it('survives a snapshot restore: no rewind, no deletion, while sim streams still rewind', () => {
      // Case 1 — the stream existed when the worker stamped the world, so the snapshot's position for
      // it (if it were in the snapshot at all) is stale. An uninterrupted stream with the same seed and
      // owner is the control: if the restore rewinds the live one, the two stop agreeing.
      resetSimRng();
      setSimSeed(4242);
      const shake = getPresentationRng('rendererShake');
      const shakeControl = createSeededRng(getSimSeed(), 'rendererShake');
      shake();
      shakeControl();
      const frozen = snapshotSimRng();
      expect(frozen.owners.some(([owner]) => owner === 'rendererShake')).toBe(false);

      expect(restoreSimRng(frozen)).toBe(true);
      for (let i = 0; i < 3; i++) expect(shake()).toBe(shakeControl());

      // Case 2 — the stream was created after the stamp, so the snapshot does not list it at all. The
      // restore must not delete it (it used to, which repeated the seed's first draw).
      const weather = getPresentationRng('weatherFx');
      const weatherControl = createSeededRng(getSimSeed(), 'weatherFx');
      expect(restoreSimRng(frozen)).toBe(true);
      expect(getPresentationRng('weatherFx')).toBe(weather);
      for (let i = 0; i < 2; i++) expect(weather()).toBe(weatherControl());

      // Control — the same restore must still rewind a simulation stream, or determinism is lost.
      resetSimRng();
      setSimSeed(4242);
      const sim = getSimRng('entityFactory');
      sim();
      const simSnapshot = snapshotSimRng();
      const simContinuation = [sim(), sim()];
      restoreSimRng(simSnapshot);
      expect([sim(), sim()]).toEqual(simContinuation);
    });

    it('keeps the presentation call sites off the simulation registry', () => {
      const offenders: string[] = [];
      for (const file of PRESENTATION_MODULES) {
        const source = readFileSync(resolve(process.cwd(), file), 'utf8');
        if (source.includes('getSimRng')) offenders.push(`${file}: still calls getSimRng`);
        if (!source.includes('getPresentationRng')) offenders.push(`${file}: does not call getPresentationRng`);
      }
      expect(offenders).toEqual([]);
    });
  });
});

/**
 * Seeded RNG defaults (roadmap T3 — unified deterministic RNG helpers).
 *
 * Every simulation roll must come from an owner stream in `simRng.ts`. A raw `Math.random`
 * draw escapes `snapshotSimRng`/`restoreSimRng`, so the same seed stops reproducing the same
 * world after a save/load and two runs of one seed drift apart. These tests pin the default
 * stream of two representative rules and keep `Math.random(` out of `src/` entirely —
 * `simRng.ts` owns the only legitimate uses (it installs the seeded global override).
 */
describe('simRng.seededDefaults.test.ts', () => {
  /** Live Mulberry32 state of one owner stream, or null when the stream was never created. */
  function ownerState(owner: string): number | null {
    const entry = snapshotSimRng().owners.find(([name]) => name === owner);
    return entry ? entry[1] : null;
  }

  function human(id: number, gender: 'male' | 'female', overrides: Partial<Entity> = {}): Entity {
    return {
      id,
      type: EntityType.Human,
      name: `Settler${id}`,
      surname: 'Test',
      gender,
      x: 10,
      y: 10,
      energy: 100,
      maxEnergy: 100,
      age: 30,
      birthYear: 0,
      birthMonth: 0,
      birthDay: 0,
      alive: true,
      size: 10,
      speed: 2,
      vx: 0,
      vy: 0,
      flash: 0,
      animFrame: 0,
      spriteAngle: 0,
      childrenIds: [],
      generation: 0,
      isJuvenile: false,
      job: undefined,
      relationshipStatus: 'single',
      ...overrides,
    } as Entity;
  }

  function building(id: number, overrides: Partial<Building> = {}): Building {
    return {
      id,
      type: BuildingType.House,
      x: 0,
      y: 0,
      width: 20,
      height: 20,
      occupants: [],
      level: 1,
      constructionProgress: 1,
      completed: true,
      health: 100,
      maxHealth: 100,
      spriteScale: 1,
      buildAnimTimer: 0,
      ...overrides,
    } as Building;
  }

  function state(entities: Entity[], buildings: Building[]): WorldState {
    return {
      entities,
      buildings,
      tick: 0,
      year: 1,
      dayInYear: 1,
      eventLog: [],
      notifications: [],
      bigNews: [],
      storyFlags: {},
      pendingStoryEvents: [],
      resources: {},
      villageReputation: 10,
      nextFloatingTextId: 1,
      floatingTexts: [],
    } as unknown as WorldState;
  }

  function marriedCouple(): { world: WorldState; husband: Entity; entityById: Map<number, Entity> } {
    const husband = human(1, 'male', { partnerId: 2, relationshipStatus: 'married', residenceBuildingId: 10 });
    const wife = human(2, 'female', { partnerId: 1, relationshipStatus: 'married', residenceBuildingId: 10 });
    const home = building(10, { occupants: [1, 2] });
    const spare = building(20, { occupants: [] });
    const world = state([husband, wife], [home, spare]);
    return { world, husband, entityById: new Map(world.entities.map((e) => [e.id, e])) };
  }

  describe('seeded RNG defaults', () => {
    it('selectRivalDailyAction draws from the rivalProfiles stream, not Math.random', () => {
      resetSimRng();
      setSimSeed(4242);
      const profile = createRivalProfile(2, 'neutral');
      profile.priority = 'food';
      profile.ledger.recovery = 100;
      profile.ledger.food = 100;
      profile.ledger.wood = 100;
      profile.ledger.gold = 0;

      expect(ownerState('rivalProfiles')).toBeNull();
      selectRivalDailyAction(profile, 'neutral');
      const first = ownerState('rivalProfiles');
      expect(first).not.toBeNull();
      selectRivalDailyAction(profile, 'neutral');
      expect(ownerState('rivalProfiles')).not.toBe(first);
    });

    it('tryDailyAmicableDivorce draws from the humanRelationships stream, not Math.random', () => {
      resetSimRng();
      setSimSeed(7);
      const { world, husband, entityById } = marriedCouple();

      expect(ownerState('humanRelationships')).toBeNull();
      tryDailyAmicableDivorce(world, husband, entityById, world.buildings, world.entities);
      expect(ownerState('humanRelationships')).not.toBeNull();
    });

    it('reproduces the same divorce decision for the same seed', () => {
      const decide = (): boolean => {
        resetSimRng();
        setSimSeed(99);
        const { world, husband, entityById } = marriedCouple();
        tryDailyAmicableDivorce(world, husband, entityById, world.buildings, world.entities);
        return husband.partnerId === undefined;
      };

      expect(decide()).toBe(decide());
    });

    it('ignores a replaced global Math.random', () => {
      // `enableSeededGlobalRandom` deliberately backs off when `Math.random` was already
      // replaced (a test spy, or a host that patches it), so a `Math.random` default would
      // quietly follow the patch instead of the seed.
      resetSimRng();
      setSimSeed(4242);
      const profile = createRivalProfile(2, 'neutral');
      profile.priority = 'food';
      profile.ledger.recovery = 100;
      profile.ledger.food = 100;
      profile.ledger.wood = 100;
      profile.ledger.gold = 0;

      const native = Math.random;
      Math.random = () => 0.99;
      try {
        selectRivalDailyAction(profile, 'neutral');
      } finally {
        Math.random = native;
      }

      expect(ownerState('rivalProfiles')).not.toBeNull();
    });
  });

  /** Every `.ts`/`.tsx` file under `src`, so the guard also covers future modules. */
  function collectSourceFiles(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) collectSourceFiles(full, out);
      else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) out.push(full);
    }
    return out;
  }

  describe('raw Math.random guard', () => {
    it('no source module outside simRng.ts calls Math.random', () => {
      const root = resolve(process.cwd(), 'src');
      const offenders: string[] = [];

      for (const file of collectSourceFiles(root)) {
        if (file.endsWith('simRng.ts')) continue;
        readFileSync(file, 'utf8')
          .split('\n')
          .forEach((line, index) => {
            const trimmed = line.trim();
            if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
            // Matches both a call (`Math.random()`) and the default-parameter form (`= Math.random`).
            if (/Math\.random\b/.test(line)) {
              offenders.push(`${relative(process.cwd(), file)}:${index + 1}`);
            }
          });
      }

      expect(offenders).toEqual([]);
    });
  });
});

/**
 * Cross-cutting audit item X5 (2026-09-13): "RNG stream position is not part of any
 * rollback/save snapshot, so a resumed or retried world cannot reproduce its continuation."
 *
 * `simRng.snapshotSimRng` captures every live stream's Mulberry32 state, the seed and the seeded
 * global override; `restoreSimRng` puts them back *in place* (an existing stream object keeps
 * drawing from the restored position). Three transports carry it: the save file, the worker
 * world hand-off (`world.simRng`, read by `resetWorkerSession`) and the per-tick prep payload the
 * worker rolls a failed tick back with.
 */
describe('simRng.snapshot.test.ts', () => {
  const PROBE = 'snapshotProbe';

  describe('RNG stream snapshot', () => {
    it('resumes an owner stream exactly where the snapshot was taken', () => {
      setSimSeed(4242);
      const stream = getSimRng(PROBE);
      for (let i = 0; i < 5; i++) stream();

      const snapshot = snapshotSimRng();
      const afterSnapshot = [stream(), stream(), stream()];

      // Move the live stream well past the snapshot, then rewind it.
      for (let i = 0; i < 20; i++) stream();
      expect(restoreSimRng(snapshot)).toBe(true);

      expect([stream(), stream(), stream()]).toEqual(afterSnapshot);
    });

    it('resets a cached stream reference in place, so a held stream is not orphaned', () => {
      setSimSeed(77);
      const cached = getSimRng(PROBE);
      cached();
      const snapshot = snapshotSimRng();
      const secondDraw = cached();

      restoreSimRng(snapshot);

      // Re-creating the stream instead of resetting it would leave `cached` detached and return
      // the third draw here.
      expect(cached()).toBe(secondDraw);
    });

    it('restores the seed, so an owner created after the snapshot draws from the same start', () => {
      setSimSeed(9);
      getSimRng(PROBE)();
      const snapshot = snapshotSimRng();

      setSimSeed(1234);
      expect(getSimSeed()).toBe(1234);

      restoreSimRng(snapshot);

      expect(getSimSeed()).toBe(9);
      // A "new" owner in the original run would be created from seed 9; after the restore, so is it.
      expect(getSimRng('createdAfterSnapshot')()).toBe(createSeededRng(9, 'createdAfterSnapshot')());
    });

    it('round-trips through a real save file', () => {
      const state = initGame({ seed: 4242 });
      for (let i = 0; i < 3; i++) gameTick(state);
      getSimRng(PROBE)(); // the probe must exist (with a non-zero position) at save time

      const raw = JSON.stringify(buildSaveData(state, createInitialView(state.width, state.height)));
      const parsed = parseSaveJson(raw);
      expect(parsed.valid).toBe(true);
      if (!parsed.valid) return;
      expect(parsed.parsed.simRng).toBeDefined();

      const expected = [getSimRng(PROBE)(), getSimRng(PROBE)()];

      // Another run in this realm, so the load has something wrong to correct.
      setSimSeed(999);

      const loaded = loadGameFromParsed(parsed.parsed);
      expect(loaded).not.toBeNull();

      expect([getSimRng(PROBE)(), getSimRng(PROBE)()]).toEqual(expected);
    });

    it('still loads a save written before the snapshot existed', () => {
      const state = initGame({ seed: 31337 });
      const save = buildSaveData(state, createInitialView(state.width, state.height));
      delete save.simRng;
      const parsed = parseSaveJson(JSON.stringify(save));
      expect(parsed.valid).toBe(true);
      if (!parsed.valid) return;

      const loaded = loadGameFromParsed(parsed.parsed);

      expect(loaded).not.toBeNull();
      expect(getSimSeed()).toBe(31337);
    });

    it('rolls a failed tick back to the pre-tick stream positions', () => {
      const state = initGame({ seed: 808 });
      getSimRng(PROBE)();
      const prep = extractSimPrep(state);

      // The "tick" consumes randomness…
      const replayed = [getSimRng(PROBE)(), getSimRng(PROBE)(), getSimRng(PROBE)()];

      applySimPrep(state, prep);

      // …and the rollback must put the streams back where the failed tick found them.
      expect([getSimRng(PROBE)(), getSimRng(PROBE)(), getSimRng(PROBE)()]).toEqual(replayed);
    });

    it('carries the positions in the tick delta, so the receiving realm tracks the authority', () => {
      const world = initGame({ seed: 5150 });
      getSimRng(PROBE)();
      const delta = extractSimTickDelta(world, undefined, { headless: true, cloneMode: 'isolated' });
      const expected = [getSimRng(PROBE)(), getSimRng(PROBE)()];

      // The receiving realm is on a different run entirely.
      setSimSeed(999);
      const target = initGame({ seed: 123 });
      applySimTickDelta(target, delta, { cloneMode: 'isolated' });

      expect([getSimRng(PROBE)(), getSimRng(PROBE)()]).toEqual(expected);
    });

    it('ignores a snapshot it cannot trust instead of poisoning the streams', () => {
      expect(parseSimRngSnapshot(undefined)).toBeNull();
      expect(parseSimRngSnapshot({ seed: 'nope' })).toBeNull();
      expect(parseSimRngSnapshot({ owners: [] })).toBeNull();
      expect(restoreSimRng(null)).toBe(false);
      expect(restoreSimRng('not a snapshot')).toBe(false);

      const filtered = parseSimRngSnapshot({
        seed: 5,
        global: 'x',
        owners: [['kept', 7], 'junk', ['bad', Number.NaN], [3, 9]],
      });
      expect(filtered).toEqual({ seed: 5, global: null, owners: [['kept', 7]] });
    });
  });
});
