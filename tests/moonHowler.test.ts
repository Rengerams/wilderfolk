/**
 * Bundled Moon Howler suite: the nine `tests/moonHowler.*.test.ts` files merged into one, one
 * `describe('<original file name>')` per source file.
 *
 * Every `it(...)` case is carried over verbatim — same title, same body, same assertions, same
 * comments. Each source file's own doc comment sits directly above its `describe`. The per-file
 * constants and helpers live inside that file's `describe` (rule 3's "the body verbatim"), which is
 * also what keeps the two different `FIXTURE_SEED` values and the three different `FULL_MOON_DAY`
 * expressions from colliding.
 *
 * `NIGHT_START` and `TICKS_PER_DAY` were imported from different paths in different source files
 * (`../src/game/dayCycle` vs `../src/game/dayCycleConstants` / `../src/game/dayCycleClock`). Both
 * paths are kept below; `dayCycle` merely re-exports the very same bindings, so the `const` re-binds
 * at the top of the `rare`/`rngThreading`/`syncFormsEquivalence` describes are aliases for an
 * identical value, not new fixtures.
 */
import { describe, expect, it } from 'vitest';
import { EntityType } from '../src/game/gameTypes';
import {
  BUILDING_CONFIGS,
  BuildingType,
  JobType,
  LEADER_OCCUPATION,
  MapSize,
  Season,
  WeatherType,
} from '../src/game/gameTypes';
import type { BigNewsItem, Building, Entity, WorldState } from '../src/game/gameTypes';
import { DAYS_PER_YEAR, NIGHT_START, TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/game/dayCycle';
import { TICKS_PER_DAY as TICKS_PER_DAY_FROM_CLOCK } from '../src/game/dayCycleClock';
import {
  DAYS_PER_MOON_CYCLE,
  NIGHT_END,
  NIGHT_START as NIGHT_START_FROM_CONSTANTS,
} from '../src/game/dayCycleConstants';
import { createBuilding, initGame } from '../src/game/worldGen';
import { createEntity } from '../src/game/entityFactory';
import {
  MOON_HOWLER_CURE_CHANCE_MAX,
  MOON_HOWLER_EXORCISM_INTERVAL_HOURS,
  MOON_HOWLER_REPLACEMENT_CHANCE,
  countActiveMoonHowlerCurses,
  curseMoonHowler,
  forceMoonHowlerOutside,
  isActiveMoonHowler,
  isMoonHowlerCureWindow,
  isMoonHowlerEligible,
  isMoonHowlerRevertTick,
  isMoonHowlerTransformTick,
  moonHowlerRiteWeights,
  shouldApplyNewMoonHowlerCurse,
  shouldMoonHowlerTransform,
  syncMoonHowlerForms,
  tickMoonHowlerCycle,
  transformToWerewolfForm,
  tryMoonHowlerChurchCures,
} from '../src/game/moonHowler';
import type { MoonHowlerSyncResult } from '../src/game/moonHowler';
import { revertToHumanForm } from '../src/game/moonHowlerForm';
import type { RevertToHumanFormOptions } from '../src/game/moonHowlerForm';
import { buildEntityByType } from '../src/game/simFocus';
import { isInsideCompletedBuilding } from '../src/game/terrainSystems';
import { createInitialView } from '../src/game/viewState';
import { buildSaveData, loadGameFromParsed, parseSaveJson } from '../src/game/saveLoad';
import { createSeededRng, getSimRng, setSimSeed } from '../src/game/simRng';
import { collectSimulationInvariantErrors } from '../src/game/simulation/simulationInvariants';

/**
 * Regression: tickMoonHowlerCycle must reuse the caller's byType index instead
 * of rebuilding it every tick (perf — one full O(n) bucket rebuild per tick
 * was wasted when nothing transformed).
 *
 * Bug: `buildEntityByType(aliveEntities)` ran unconditionally at the top of
 * every tick, even on ordinary days with no moon-form changes. gameTick
 * already built the identical index and passed it via ctx.byType.
 */
describe('moonHowler.byTypeReuse.test.ts', () => {
  describe('tickMoonHowlerCycle byType reuse', () => {
    it('returns the same byType object when no form changes occur', () => {
      const state = initGame();
      const alive = state.entities.filter((e) => e.alive);
      const byType = buildEntityByType(alive);

      // Daytime (hour 12) with the initial settlers — no transform/revert fires.
      const result = tickMoonHowlerCycle(
        state,
        alive,
        state.buildings,
        1, // colonyDay
        12, // hourOfDay — not a transform/revert boundary
        new Map(alive.map((e) => [e.id, e])),
        byType,
      );

      // Optimization holds: same object identity, no rebuild on a quiet tick.
      expect(result.byType).toBe(byType);
      expect(result.changed).toBe(false);
    });

    it('rebuilds and reports change when a form actually transforms', () => {
      const state = initGame();
      const alive = state.entities.filter((e) => e.alive);
      const byType = buildEntityByType(alive);
      const humans = byType[EntityType.Human];
      expect(humans.length).toBeGreaterThan(0);

      // Force a moon-form transform: mark one settler cursed and use a full-moon
      // nightfall hour so syncMoonHowlerForms converts them.
      const victim = humans[0];
      victim.moonHowlerCursed = true;
      // Full moon nightfall (hour 22) — transform window.
      const result = tickMoonHowlerCycle(
        state,
        alive,
        state.buildings,
        14, // colonyDay — a full-moon day (14 ≡ 0 mod 14-ish window)
        22, // nightfall — transform hour
        new Map(alive.map((e) => [e.id, e])),
        byType,
      );

      expect(result.changed).toBe(true);
      // Rebuilt index must reflect the new form (settler no longer a plain Human).
      const humansAfter = result.byType[EntityType.Human];
      expect(humansAfter.includes(victim)).toBe(false);
    });
  });
});

describe('moonHowler.cureChance.test.ts', () => {
  describe('Moon Howler cure chance', () => {
    it('scales to 71% at four priests', () => {
      expect(moonHowlerRiteWeights(1).cure).toBeCloseTo(0.35);
      expect(moonHowlerRiteWeights(2).cure).toBeCloseTo(0.47);
      expect(moonHowlerRiteWeights(3).cure).toBeCloseTo(0.59);
      expect(moonHowlerRiteWeights(4).cure).toBeCloseTo(0.71);
    });

    it('does not exceed the four-priest cap', () => {
      expect(moonHowlerRiteWeights(5).cure).toBeCloseTo(0.71);
      expect(moonHowlerRiteWeights(12).cure).toBeCloseTo(0.71);
    });
  });
});

/**
 * Regression: the Moon Howler curse can only be broken during the full-moon
 * NIGHT (20:00 → before 06:00), while the cursed settler is still in 🌝 form —
 * never at 7am work start.
 *
 * The sim has gated the Church exorcism to the night window since 3854df70,
 * but nothing locked it in: the tutorial/help copy still told players "dawn
 * (7am)", and the 0.5.0 changelog described a 7am cure. At 6am the cursed
 * settler has already reverted to human form, so a 7am cure would be both
 * wrong in lore and impossible in the sim.
 */
describe('moonHowler.cureWindow.test.ts', () => {
  describe('Moon Howler cure window — night only, not 7am', () => {
    it('allows the cure through the full-moon night (20:00 → before 06:00)', () => {
      // 8pm on a full-moon day (day 0 ≡ 0 mod 14)
      expect(isMoonHowlerCureWindow(0, 20)).toBe(true);
      expect(isMoonHowlerCureWindow(0, 23)).toBe(true);
      // Pre-dawn hours of the following morning are still the same full-moon night
      expect(isMoonHowlerCureWindow(1, 0)).toBe(true);
      expect(isMoonHowlerCureWindow(1, 5)).toBe(true);
    });

    it('rejects 6am onwards — the werewolf reverts at 06:00, so 7am is too late', () => {
      expect(isMoonHowlerCureWindow(1, 6)).toBe(false); // revert hour
      expect(isMoonHowlerCureWindow(1, 7)).toBe(false); // THE bug: "dawn (7am)" copy
      expect(isMoonHowlerCureWindow(1, 12)).toBe(false); // midday
    });

    it('rejects ordinary (non-full-moon) nights', () => {
      expect(isMoonHowlerCureWindow(3, 22)).toBe(false);
      expect(isMoonHowlerCureWindow(4, 2)).toBe(false);
    });

    it('keeps the transform/revert anchors consistent with the window', () => {
      expect(isMoonHowlerTransformTick(0, 20)).toBe(true); // transform at 8pm
      expect(isMoonHowlerRevertTick(6)).toBe(true); // revert at 6am
      expect(isMoonHowlerRevertTick(7)).toBe(false); // already human by 7am
    });

    it('skips the church exorcism at 7am even when a cursed howler is abroad', () => {
      const state = initGame();
      const human = state.entities.find((e) => e.type === EntityType.Human && e.alive);
      expect(human).toBeDefined();

      // A cursed settler currently in werewolf form, hunting at 7am.
      const were = { ...human!, type: EntityType.Werewolf, moonHowlerCursed: true, alive: true };
      const res = tryMoonHowlerChurchCures(
        state,
        [were],
        [], // no churches needed — the window gate fires before church checks
        1, // colonyDay — not a full-moon day
        7, // hourOfDay — 7am, outside the night window
        new Map([[were.id, were]]),
      );

      expect(res.skippedReason).toBe('not_full_moon_night');
      expect(res.attempted).toBe(false);
    });
  });
});

/**
 * Regression: the Moon Howler exorcism overhaul —
 *   • churches hold up to 4 priests (cure 35% → 71%)
 *   • the rite needs the priest within MOON_HOWLER_EXORCISM_RANGE of the howler
 *   • Barracks guards nearby roll (extra roll, not guaranteed) to save the priest
 *   • a fallen priest scares the survivors (flee window), and breaking a curse
 *     earns the priest the "Howlerbane" title
 */
describe('moonHowler.exorcism.test.ts', () => {
  /** Staffed church + priest + cursed howler fixture. Returns a fresh setup each call. */
  function exorcismFixture(howlerX: number) {
    const state = initGame();
    const human = state.entities.find((e) => e.type === EntityType.Human && e.alive)!;

    const priest: Entity = {
      ...human,
      id: 9000,
      name: 'Ingrid',
      surname: 'Priestess',
      job: JobType.Priest,
      occupation: 'priest',
      alive: true,
      x: 100,
      y: 100,
      homeBuildingId: 8000,
    };
    const howler: Entity = {
      ...human,
      id: 9001,
      name: 'Bjorn',
      surname: 'Cursed',
      type: EntityType.Werewolf,
      moonHowlerCursed: true,
      alive: true,
      x: howlerX,
      y: 100,
    };
    const church: Building = {
      ...state.buildings[0]!,
      id: 8000,
      type: BuildingType.Church,
      completed: true,
      occupants: [9000],
      faction: undefined,
      x: 90,
      y: 90,
      width: 50,
      height: 56,
    };
    return { state, priest, howler, church, entities: [priest, howler], buildings: [church] };
  }

  describe('Moon Howler exorcism overhaul', () => {
    it('churches hold up to 4 priests and 4 priests cap the cure at 71%', () => {
      expect(BUILDING_CONFIGS[BuildingType.Church].maxOccupants).toBe(4);
      const w = moonHowlerRiteWeights(4);
      expect(w.cure).toBeCloseTo(0.71, 5);
      expect(w.cure).toBeLessThanOrEqual(MOON_HOWLER_CURE_CHANCE_MAX);
    });

    it('skips when the priest is out of exorcism range — no teleport', () => {
      const f = exorcismFixture(500); // priest at (100,100), howler at (500,100) → 400px
      const res = tryMoonHowlerChurchCures(
        f.state,
        f.entities,
        f.buildings,
        0, // full-moon night
        22,
        new Map(f.entities.map((e) => [e.id, e])),
      );
      expect(res.skippedReason).toBe('priest_too_far');
      expect(res.attempted).toBe(false);
    });

    it('attempts when the priest has hunted the howler down into range', () => {
      const f = exorcismFixture(150); // 50px — well within range
      const res = tryMoonHowlerChurchCures(
        f.state,
        f.entities,
        f.buildings,
        0,
        22,
        new Map(f.entities.map((e) => [e.id, e])),
        () => 0.1, // roll < cure (0.35) → cured
      );
      expect(res.attempted).toBe(true);
      expect(res.outcome).toBe('cured');
      expect(f.howler.moonHowlerCursed).toBe(false);
    });

    it('breaking a curse earns the priest the Howlerbane title', () => {
      const f = exorcismFixture(150);
      const res = tryMoonHowlerChurchCures(
        f.state,
        f.entities,
        f.buildings,
        0,
        22,
        new Map(f.entities.map((e) => [e.id, e])),
        () => 0.1,
      );
      expect(res.outcome).toBe('cured');
      expect(f.priest.title).toBe('Howlerbane');
    });

    it('a nearby Barracks Soldier rolls to save the priest (extra roll, not guaranteed)', () => {
      const f = exorcismFixture(150);
      // Soldier within MOON_HOWLER_GUARD_PROTECT_RANGE of the priest at (100,100).
      const guard: Entity = {
        ...f.priest,
        id: 9002,
        name: 'Sven',
        job: JobType.Soldier,
        occupation: 'Soldier',
        x: 120,
        y: 90,
        homeBuildingId: 8001,
      };
      const barracks: Building = {
        ...f.church,
        id: 8001,
        type: BuildingType.Barracks,
        occupants: [9002],
        x: 110,
        y: 80,
        width: 40,
        height: 40,
      };
      const entities = [...f.entities, guard];
      const buildings = [...f.buildings, barracks];

      // rng 0.49 → rite rolls priest_killed (0.35 ≤ 0.49 < 0.75), guard roll 0.49 < 0.5 → saved.
      const res = tryMoonHowlerChurchCures(
        f.state,
        entities,
        buildings,
        0,
        22,
        new Map(entities.map((e) => [e.id, e])),
        () => 0.49,
      );
      expect(res.outcome).toBe('priest_fled');
      expect(res.priestsKilled).toHaveLength(0);
      expect(f.priest.alive).toBe(true);
    });

    it('without a guard the priest dies and the survivors are scared', () => {
      const f = exorcismFixture(150);
      const res = tryMoonHowlerChurchCures(
        f.state,
        f.entities,
        f.buildings,
        0,
        22,
        new Map(f.entities.map((e) => [e.id, e])),
        () => 0.49, // priest_killed, no guard to save
      );
      expect(res.outcome).toBe('priest_killed');
      expect(res.priestsKilled).toHaveLength(1);
      expect(f.priest.alive).toBe(false);
      // Survivors retreat for a cooldown → next attempt is skipped as scared.
      expect(f.state.moonHowlerPriestsFleeUntil).toBe(
        f.state.tick + MOON_HOWLER_EXORCISM_INTERVAL_HOURS * TICKS_PER_HOUR,
      );
      const again = tryMoonHowlerChurchCures(
        f.state,
        f.entities,
        f.buildings,
        0,
        22,
        new Map(f.entities.map((e) => [e.id, e])),
        () => 0.49,
      );
      expect(again.skippedReason).toBe('priests_scared');
    });
  });
});

/**
 * The Moon Howler cure-window sweep uses the owner's padded "indoors" test.
 *
 * Regression for audit L16 (`docs/private/audits/2026-09-16/sim-economy-leadership-combat.md`, tracked
 * in `LIVE-FINDINGS-STATUS.md`): the sweep re-implemented "inside a completed building" as a bare
 * axis-aligned bounds check with no margin, while the owner
 * `terrainSystems.isInsideCompletedBuilding` pads the footprint by 10 px — the same padding
 * `buildingRotation.isEntityOnBuilding` gives every other consumer. A howler within that margin
 * therefore counted as outdoors and the sweep never forced it away.
 *
 * Driven through the real owner (`tickMoonHowlerCycle` at a full-moon `NIGHT_START`, which is the cure
 * window) rather than by calling the helper, so the test fails if the sweep stops delegating.
 */
describe('moonHowler.indoorsPad.test.ts', () => {
  const FIXTURE_SEED = 20_260_917;
  const BUILDING_ID = 10;
  /** A small square footprint, so any forced displacement of 40 px or more leaves the padded area. */
  const BUILDING_SIZE = 40;
  /** Inside the owner's 10 px pad, outside the bare rectangle — exactly the gap this finding is about. */
  const MARGIN_PROBE_PX = 5;
  /** A full-moon colony day (`isFullMoonDay` = `colonyDay % DAYS_PER_MOON_CYCLE === 0`). */
  const FULL_MOON_DAY = DAYS_PER_MOON_CYCLE * 4;

  function house(): Building {
    return {
      id: BUILDING_ID, type: BuildingType.House, x: 100, y: 100,
      width: BUILDING_SIZE, height: BUILDING_SIZE, occupants: [], level: 1, constructionProgress: 100,
      completed: true, health: 100, maxHealth: 100, spriteScale: 1, buildAnimTimer: 0,
    };
  }

  function howlerWorld(): { state: WorldState; howler: Entity; building: Building } {
    const state = initGame({ villageName: 'Indoors', size: 'medium', seed: FIXTURE_SEED });
    const building = house();
    state.buildings = [building];
    state.pendingStoryEvents = [];

    const settler = state.entities.find(
      (e) => e.alive && e.type === EntityType.Human && e.faction == null && !e.isJuvenile,
    );
    if (!settler) throw new Error('fixture has no adult settler');
    curseMoonHowler(settler);
    transformToWerewolfForm(settler, state.buildings);
    expect(isActiveMoonHowler(settler)).toBe(true);

    // Just off the left edge, vertically centred: within the pad, outside the rectangle.
    settler.x = building.x - MARGIN_PROBE_PX;
    settler.y = building.y + BUILDING_SIZE / 2;
    state.entities = [settler];

    state.year = Math.floor(FULL_MOON_DAY / DAYS_PER_YEAR);
    state.dayInYear = FULL_MOON_DAY % DAYS_PER_YEAR;
    state.tick = FULL_MOON_DAY * TICKS_PER_DAY + NIGHT_START * TICKS_PER_HOUR;
    return { state, howler: settler, building };
  }

  describe('the cure-window sweep treats the padded footprint as indoors (L16)', () => {
    it('forces a howler out of the pad margin, not only out of the bare rectangle', () => {
      const { state, howler, building } = howlerWorld();

      // The fixture's premise, stated as the owner sees it: indoors by the padded rule, outdoors by the
      // bare rectangle the sweep used to apply.
      expect(isInsideCompletedBuilding(state, howler.x, howler.y)).toBe(true);
      expect(howler.x >= building.x && howler.x <= building.x + building.width).toBe(false);

      tickMoonHowlerCycle(
        state,
        state.entities,
        state.buildings,
        FULL_MOON_DAY,
        NIGHT_START,
        new Map(state.entities.map((e) => [e.id, e])),
        undefined,
        () => 0.5,
      );

      expect(isInsideCompletedBuilding(state, howler.x, howler.y)).toBe(false);
    });
  });
});

/**
 * Moon Howler rarity — SIMULATION_AUTHORITY.md §5 + Objective 10.
 *
 * The curse path must be a RARE replacement event, not a guaranteed
 * every-full-moon spawn:
 *   - a surviving cursed Howler makes later full moons quiet (it returns
 *     instead — never a second curse);
 *   - after a kill/cure, full moons may be quiet;
 *   - a replacement appears only through MOON_HOWLER_REPLACEMENT_CHANCE;
 *   - a full moon never guarantees a new Howler.
 *
 * RNG is injectable (`rng` param on shouldApplyNewMoonHowlerCurse /
 * tickMoonHowlerCycle) so quiet moons, survivor returns, and rare
 * replacements are deterministic.
 */
describe('moonHowler.rare.test.ts', () => {
  // This file imported `NIGHT_START` from `../src/game/dayCycleConstants`; `dayCycle` re-exports the
  // very same const, so this re-bind keeps the original path meaningful and the bodies verbatim.
  const NIGHT_START = NIGHT_START_FROM_CONSTANTS;
  const FULL_MOON_NIGHTFALL = { colonyDay: DAYS_PER_MOON_CYCLE, hourOfDay: NIGHT_START };

  function human(id: number, overrides: Partial<Entity> = {}): Entity {
    return {
      id,
      type: EntityType.Human,
      x: 100,
      y: 100,
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
      job: 'settler' as Entity['job'],
      gender: 'male',
      ...overrides,
    } as Entity;
  }

  function makeState(entities: Entity[]): WorldState {
    return {
      entities,
      buildings: [],
      tick: DAYS_PER_MOON_CYCLE * TICKS_PER_DAY + NIGHT_START * TICKS_PER_HOUR,
      paused: false,
      speed: 1,
      width: 400,
      height: 300,
      resources: { wood: 500, stone: 500, food: 500, gold: 500, iron: 0 },
      storageMax: { wood: 1000, stone: 1000, food: 1000, gold: 1000, iron: 300 },
      season: Season.Spring,
      weather: WeatherType.Clear,
      year: 0,
      dayInYear: 0,
      notifications: [],
      bigNews: [],
      floatingTexts: [],
      deathParticles: [],
      nextFloatingTextId: 1,
      nextBuildingId: 100,
      nextEntityId: 100,
      eventLog: [],
      screenShakeImpulse: 0,
      totalBuildingsCompleted: 0,
      humanPopulation: 0,
      maxHumanPopulation: 0,
      workingSettlers: 0,
      idleSettlers: 0,
      villageName: 'Moonville',
      villageReputation: 50,
      challenges: [],
      autoSave: false,
      wildlifeCounts: {
        grass: 0, rabbits: 0, deer: 0, wolves: 0, foxes: 0, werewolves: 0, wildkin: 0, trees: 0,
      },
      foodSpoilageRate: 0,
      biodiversityIndex: 100,
      pollutionLevel: 0,
      disasters: [],
      tradeRoutes: [],
      eventsThisYear: [],
      worldMap: null,
      yearlyStats: [],
      lifetimeStats: {},
      visitorGroups: [],
      rivalSettlements: [],
      pendingDiplomacyEvents: [],
      pendingRaidEvents: [],
      pendingOutgoingRaidEvents: [],
      ecoHealthYearsAbove80: 0,
      firstWeekVisitorSpawned: false,
      villageLeaderId: null,
      leaderSinceYear: 0,
      lastElectionYear: -1,
      pendingElectionYear: null,
      electionBuildupNotifiedYear: null,
      electionCeremony: null,
      researchNodes: [],
      unlockedTechs: [],
      activeResearch: null,
      researchProgress: 0,
    } as unknown as WorldState;
  }

  function sevenAdults(): Entity[] {
    return Array.from({ length: 7 }, (_, i) => human(i + 1, { gender: i % 2 === 0 ? 'male' : 'female' }));
  }

  /**
   * The curse cards the real producers posted — `addBigNews(state, '🌝 Moon Howler Curse!', …)`
   * (`moonHowler.ts`), plus the matching `⛪ Curse Broken!` cure card.
   *
   * `BigNewsItem` has `title`/`message`, **not** `text` (`gameTypes.ts`), so the old
   * `n.text.includes('Curse')` inspected nothing: on the quiet-moon control the list is empty and the
   * callback never ran, and had a card ever been posted it would have thrown a `TypeError` instead.
   * The positive control in the replacement-roll test below proves this predicate can go true.
   */
  function curseNews(state: WorldState): BigNewsItem[] {
    return state.bigNews.filter((item) => item.title.includes('Curse') || item.message.includes('Curse'));
  }

  describe('Moon Howler rarity (Objective 10)', () => {
    it('a surviving cursed Howler makes the full moon quiet — no second curse', () => {
      const { colonyDay, hourOfDay } = FULL_MOON_NIGHTFALL;
      const survivor = human(1, { moonHowlerCursed: true });
      // Even a rng that would pass the replacement roll cannot double-curse.
      expect(shouldApplyNewMoonHowlerCurse(colonyDay, hourOfDay, 10, 1, () => 0.001)).toBe(false);
      void survivor;
    });

    it('a full moon after a kill is QUIET when the replacement roll fails', () => {
      const { colonyDay, hourOfDay } = FULL_MOON_NIGHTFALL;
      expect(
        shouldApplyNewMoonHowlerCurse(colonyDay, hourOfDay, 10, 0, () => MOON_HOWLER_REPLACEMENT_CHANCE + 0.01),
      ).toBe(false);
    });

    it('a replacement Howler appears only through the rare roll', () => {
      const { colonyDay, hourOfDay } = FULL_MOON_NIGHTFALL;
      expect(
        shouldApplyNewMoonHowlerCurse(colonyDay, hourOfDay, 10, 0, () => MOON_HOWLER_REPLACEMENT_CHANCE - 0.01),
      ).toBe(true);
    });

    it('the base gates still hold regardless of rng', () => {
      const { colonyDay, hourOfDay } = FULL_MOON_NIGHTFALL;
      expect(shouldApplyNewMoonHowlerCurse(colonyDay, hourOfDay, 5, 0, () => 0.001)).toBe(false); // too few humans
      expect(shouldApplyNewMoonHowlerCurse(colonyDay, NIGHT_START - 1, 10, 0, () => 0.001)).toBe(false); // wrong hour
      expect(shouldApplyNewMoonHowlerCurse(1, hourOfDay, 10, 0, () => 0.001)).toBe(false); // not full moon
    });

    it('cycle: quiet moon with a survivor returns the same Howler, never a replacement', () => {
      const survivor = human(1, { moonHowlerCursed: true });
      const others = sevenAdults().filter((h) => h.id !== 1);
      const state = makeState([survivor, ...others]);
      const entityById = new Map(state.entities.map((e) => [e.id, e]));

      tickMoonHowlerCycle(
        state,
        state.entities,
        [],
        FULL_MOON_NIGHTFALL.colonyDay,
        FULL_MOON_NIGHTFALL.hourOfDay,
        entityById,
        undefined,
        () => 0.001, // would pass the replacement roll if it were reachable
      );

      const cursed = state.entities.filter((e) => e.alive && e.moonHowlerCursed);
      expect(cursed.length).toBe(1);
      expect(cursed[0]!.id).toBe(1); // the SAME survivor
      expect(collectSimulationInvariantErrors(state)).toEqual([]);
    });

    it('cycle: quiet full moon after the Howler is gone (roll fails)', () => {
      const state = makeState(sevenAdults());
      const entityById = new Map(state.entities.map((e) => [e.id, e]));

      tickMoonHowlerCycle(
        state,
        state.entities,
        [],
        FULL_MOON_NIGHTFALL.colonyDay,
        FULL_MOON_NIGHTFALL.hourOfDay,
        entityById,
        undefined,
        () => 0.99,
      );

      expect(countActiveMoonHowlerCurses(state.entities)).toBe(0);
      expect(curseNews(state)).toEqual([]);
    });

    it('cycle: rare replacement roll curses exactly one settler', () => {
      const state = makeState(sevenAdults());
      const entityById = new Map(state.entities.map((e) => [e.id, e]));

      tickMoonHowlerCycle(
        state,
        state.entities,
        [],
        FULL_MOON_NIGHTFALL.colonyDay,
        FULL_MOON_NIGHTFALL.hourOfDay,
        entityById,
        undefined,
        () => 0.001,
      );

      const cursed = state.entities.filter((e) => e.alive && e.moonHowlerCursed);
      expect(cursed.length).toBe(1);
      expect(cursed[0]!.isJuvenile).toBe(false);
      expect(collectSimulationInvariantErrors(state)).toEqual([]);

      // Positive control for the quiet-moon control above: when the curse really fires, the very
      // same predicate is non-empty — so "no curse news was posted" is an assertion that can fail.
      const curseCards = curseNews(state);
      expect(curseCards).toHaveLength(1);
      expect(curseCards[0]!.title).toContain('Curse');
    });
  });
});

/**
 * Audit L13 (`docs/private/audits/2026-09-16/sim-economy-leadership-combat.md`, tracked in
 * `LIVE-FINDINGS-STATUS.md`) — two halves, one contract: the Moon Howler's random draws come from the
 * stream its caller owns.
 *
 * 1. `forceMoonHowlerOutside` scattered a transforming settler with `getSimRng('moonHowler')()`
 *    directly, ignoring the `rng` the tick had been handed; the flavour-line picks did the same.
 * 2. `saveLoad` ran the load-time form sync (which transforms, and therefore scatters) *before*
 *    `adoptSimSeedFromWorld`/`restoreSimRng`, so those draws came from the pre-load stream (seed 1)
 *    and a load could not reproduce the positions its own save implied.
 */
describe('moonHowler.rngThreading.test.ts', () => {
  // This file imported `TICKS_PER_DAY` from `../src/game/dayCycleClock`; `dayCycle` re-exports the very
  // same const, so this re-bind keeps the original path meaningful and the bodies verbatim.
  const TICKS_PER_DAY = TICKS_PER_DAY_FROM_CLOCK;
  const FIXTURE_SEED = 20_260_917;
  const START_X = 500;
  const START_Y = 500;
  /** A full-moon `NIGHT_START`, which is when `syncMoonHowlerForms` transforms. */
  const FULL_MOON_DAY = DAYS_PER_MOON_CYCLE * 4;

  /** `rng() === 0` twice → angle 0, distance 40 → due east of the start. */
  const ZERO_RNG = () => 0;
  const EXPECTED = [START_X + 40, START_Y];

  function werewolf(id = 1): Entity {
    const entity = createEntity(EntityType.Human, START_X, START_Y, id, 100, false, { name: 'Wren' });
    entity.alive = true;
    entity.isJuvenile = false;
    // `createEntity`'s fifth parameter is *energy*, and without `opts.ageYears` the settler is born at
    // age 0 — which `isMoonHowlerEligible` (adult ≥ 18) rejects, so the sync would skip them.
    entity.age = 40;
    entity.x = START_X;
    entity.y = START_Y;
    curseMoonHowler(entity);
    return entity;
  }

  describe('the Moon Howler draws from the injected stream (L13)', () => {
    it('scatters a transforming settler from the rng it was given, not the module stream', () => {
      const entity = werewolf();

      forceMoonHowlerOutside(entity, [], 1200, 900, ZERO_RNG);

      // Exact, so the assertion cannot pass by accident: pre-fix the angle came from the global stream.
      expect([entity.x, entity.y]).toEqual(EXPECTED);
    });

    it('threads that rng through the load-time form sync', () => {
      const entity = werewolf();
      const buildings: Building[] = [];

      const sync = syncMoonHowlerForms(
        [entity], FULL_MOON_DAY, NIGHT_START, buildings, 1200, 900,
        FULL_MOON_DAY * TICKS_PER_DAY + NIGHT_START * TICKS_PER_HOUR, null, ZERO_RNG,
      );

      expect(sync.transformed).toHaveLength(1);
      expect(entity.type).toBe(EntityType.Werewolf);
      expect([entity.x, entity.y]).toEqual(EXPECTED);
    });

    it('reproduces its own scatter on load, whatever the realm the load starts in', () => {
      const state: WorldState = initGame({ villageName: 'Moon', size: 'medium', seed: FIXTURE_SEED });
      const victim = werewolf(7);
      state.entities = [victim];
      state.buildings = [];
      state.year = Math.floor(FULL_MOON_DAY / DAYS_PER_YEAR);
      state.dayInYear = FULL_MOON_DAY % DAYS_PER_YEAR;
      state.tick = FULL_MOON_DAY * TICKS_PER_DAY + NIGHT_START * TICKS_PER_HOUR;

      const raw = JSON.stringify(buildSaveData(state, createInitialView(state.width, state.height)));
      expect(parseSaveJson(raw).valid).toBe(true);

      const scatterAfterLoad = (realmSeed: number): number[] => {
        // A fresh parse and a different realm per load, so a mutated payload or a lucky pre-load stream
        // cannot make the two runs agree.
        const parsed = parseSaveJson(raw);
        if (!parsed.valid) throw new Error('fixture save did not parse');
        setSimSeed(realmSeed);
        const loaded = loadGameFromParsed(parsed.parsed);
        expect(loaded).not.toBeNull();
        const were = loaded!.world.entities.find((e) => e.id === 7);
        expect(were?.type, 'the cursed settler should have transformed at load').toBe(EntityType.Werewolf);
        return [were!.x, were!.y];
      };

      // Pre-fix these two differ: the scatter drew from whichever stream the realm happened to be on,
      // because the snapshot was restored after the form sync rather than before it.
      expect(scatterAfterLoad(999)).toEqual(scatterAfterLoad(12345));
    });
  });
});

/**
 * Follow-up exposed by audit M18 (2026-09-13): a stale `moonHowlerSaved.occupation`.
 *
 * The village office is not a building slot, so the earlier leader-occupation fix restored it
 * unconditionally at dawn — correct while the reverting settler still holds the office, wrong
 * once the office has moved on. An election can complete during the night: a transformed leader
 * is not an eligible candidate (`isEligibleForLeadership` requires a Human-typed entity), so a
 * successor can be elected while the incumbent hunts in Moon Howler form, and the revert then
 * handed the `village_leader` label back to a settler who no longer holds it.
 *
 * `RevertToHumanFormOptions.villageLeaderId` carries the owner's answer (`villageLeadership`
 * owns the office). An **absent** option still means "the caller cannot say", which leaves the
 * previous behaviour intact — but an explicit `null` is not that: `villageLeaderId` is
 * `number | null` and `null` is exactly how the office is spelled when it is *vacant* (`worldGen`
 * starts it at `null`), so it must not restore the `village_leader` occupation label (M8).
 */
describe('moonHowler.staleLeaderOccupation.test.ts', () => {
  function setup(): { state: WorldState; leader: Entity; other: Entity } {
    const state = initGame({ size: MapSize.Medium, seed: 11 });
    const leader = state.entities.find((e) => e.alive && e.type === EntityType.Human && e.faction == null);
    const other = state.entities.find(
      (e) => e.alive && e.type === EntityType.Human && e.faction == null && e.id !== leader?.id,
    );
    expect(leader).toBeDefined();
    expect(other).toBeDefined();
    if (!leader || !other) throw new Error('no settlers');

    leader.isJuvenile = false;
    leader.age = 30;
    leader.occupation = LEADER_OCCUPATION;
    state.villageLeaderId = leader.id;

    curseMoonHowler(leader);
    transformToWerewolfForm(leader, state.buildings);
    expect(isActiveMoonHowler(leader)).toBe(true);

    return { state, leader, other };
  }

  function revert(state: WorldState, entity: Entity, villageLeaderId: number | null | undefined): void {
    revertToHumanForm(entity, {
      buildings: state.buildings,
      humans: state.entities,
      tick: state.tick,
      villageLeaderId,
    });
  }

  describe('stale leader occupation across the Moon Howler form', () => {
    it('restores the office when the reverting settler still holds it', () => {
      const { state, leader } = setup();

      revert(state, leader, leader.id);

      expect(leader.type).toBe(EntityType.Human);
      expect(leader.occupation).toBe(LEADER_OCCUPATION);
    });

    it('does not hand the office label back to a settler who lost it during the night', () => {
      const { state, leader, other } = setup();

      revert(state, leader, other.id);

      expect(leader.occupation).toBe('settler');
    });

    it('keeps the previous behaviour when the caller cannot say who leads', () => {
      const { state, leader } = setup();

      revert(state, leader, undefined);

      expect(leader.occupation).toBe(LEADER_OCCUPATION);
    });

    it('does not restore the office label when the office is explicitly vacant', () => {
      const { state, leader } = setup();
      // `null` is the vacancy spelling, not a missing answer: a leader who was deposed or whose term
      // ended while they hunted in Moon Howler form must come back a settler (M8).
      state.villageLeaderId = null;

      revert(state, leader, state.villageLeaderId);

      expect(leader.occupation).toBe('settler');
    });
  });
});

/**
 * N-6 (`src/game/moonHowler.ts`, `syncMoonHowlerForms`) — differential equivalence.
 *
 * The realtime call `tickLayerRealtime` → `tickMoonHowlerCycle` → `syncMoonHowlerForms` runs on
 * **every** tick, and its registry row claims the work is "gated internally to full-moon ticks"
 * (`simulation/decisionRegistry.ts`). It was not: each call built an array of every living human
 * (used only by the revert branch), walked the whole world once, and then walked it a **second**
 * time for `huntingTonight`. The refactor defers the human snapshot to the first revert and fuses
 * `huntingTonight` into the single walk.
 *
 * The trap this file exists to catch: `wantWerewolf` gates the transform *and* the revert, so an
 * "early return when not a full moon" would strand cursed settlers as werewolves for the rest of
 * their lives. Case `NIGHT_END` below fails under that change.
 *
 * Every case is a **differential** run over two identical worlds: one is handed to
 * {@link referenceSyncMoonHowlerForms} (the pre-N-6 body, kept verbatim below as the reference
 * implementation) and one to the real function, with independent but identical rng streams. The two
 * worlds must agree on the returned `transformed`/`reverted`/`nightFall` and on every mutated field
 * of every entity and building. Each case then also pins the outcome with hard-coded expectations,
 * so the file does not depend on the reference agreeing with itself.
 */
describe('moonHowler.syncFormsEquivalence.test.ts', () => {
  // This file imported `NIGHT_START` from `../src/game/dayCycleConstants`; `dayCycle` re-exports the
  // very same const, so this re-bind keeps the original path meaningful and the bodies verbatim.
  const NIGHT_START = NIGHT_START_FROM_CONSTANTS;
  const FIXTURE_SEED = 20_260_920;
  /** Day 14 is a full-moon day (`isFullMoonDay`); `NIGHT_START` (20) is inside the full-moon night. */
  const FULL_MOON_DAY = DAYS_PER_MOON_CYCLE;
  const ORDINARY_DAY = 3;
  /** Any tick inside the full-moon night; only the prison restore reads it (sentence still active). */
  const TICK = 1_000;
  const PRISONER_UNTIL_TICK = 5_000;

  const HOUSE_ID = 101;
  const MANSION_ID = 102;
  const FARM_ID = 103;
  const PRISON_ID = 104;
  const RIVAL_HOUSE_ID = 105;
  const SITE_ID = 106;

  const ELDER_ID = 1;
  const PLAIN_RESIDENT_ID = 2;
  const CURSED_SETTLER_ID = 3;
  const PLAIN_WEREWOLF_ID = 4;
  const ACTIVE_HOWLER_ID = 5;
  const DEAD_CURSED_ID = 6;
  const JUVENILE_CURSED_ID = 7;
  const REVERT_A_ID = 8;
  const REVERT_B_ID = 9;
  const REVERT_PRISONER_ID = 10;
  const MANSION_RESIDENT_IDS = [11, 12, 13, 14, 15, 16, 17];
  const FARM_WORKER_ID = 18;
  const RIVAL_SETTLER_ID = 19;
  const WOLF_ID = 20;
  const DEAD_PLAIN_ID = 21;

  /**
   * REFERENCE IMPLEMENTATION — the pre-N-6 body of `syncMoonHowlerForms`, verbatim, calling the same
   * production primitives. This is not production code and must not be "fixed": its only job is to be
   * the old behaviour that the real function is diffed against.
   */
  function referenceSyncMoonHowlerForms(
    entities: Entity[],
    colonyDay: number,
    hourOfDay: number,
    buildings: Building[],
    mapWidth = 1200,
    mapHeight = 900,
    tick?: number,
    villageLeaderId?: number | null,
    rng: () => number = getSimRng('moonHowler'),
  ): MoonHowlerSyncResult {
    const wantWerewolf = shouldMoonHowlerTransform(colonyDay, hourOfDay);
    const transformTick = isMoonHowlerTransformTick(colonyDay, hourOfDay);
    const transformed: Entity[] = [];
    const reverted: Entity[] = [];
    const humans = entities.filter((e) => e.alive && e.type === EntityType.Human);
    const revertOpts: RevertToHumanFormOptions = { buildings, humans, tick, villageLeaderId };

    for (const entity of entities) {
      if (!entity.alive || !entity.moonHowlerCursed || !isMoonHowlerEligible(entity)) continue;

      if (wantWerewolf && entity.type === EntityType.Human) {
        transformToWerewolfForm(entity, buildings);
        forceMoonHowlerOutside(entity, buildings, mapWidth, mapHeight, rng);
        transformed.push(entity);
      } else if (!wantWerewolf && entity.type === EntityType.Werewolf) {
        revertToHumanForm(entity, revertOpts);
        if (!humans.includes(entity)) humans.push(entity);
        reverted.push(entity);
      }
    }

    const huntingTonight = entities.some((e) => isActiveMoonHowler(e));

    return {
      transformed,
      reverted,
      nightFall: transformTick && (transformed.length > 0 || huntingTonight),
    };
  }

  /** A completed building through the production factory — no hand-built `Building` literal. */
  function finishedBuilding(id: number, type: BuildingType, overrides: Partial<Building> = {}): Building {
    const building = createBuilding(type, 100 + id, 100 + id, id);
    building.completed = true;
    return Object.assign(building, overrides);
  }

  function settler(id: number, opts: { ageYears?: number; isJuvenile?: boolean } = {}): Entity {
    const human = createEntity(EntityType.Human, 400, 400, id, 200, opts.isJuvenile ?? false, {
      ageYears: opts.ageYears ?? 30,
      name: `S${id}`,
      surname: 'Vale',
    });
    human.age = opts.ageYears ?? 30;
    return human;
  }

  /** The production curse + transform path, so `moonHowlerSaved` is a real snapshot, not a literal. */
  function toCursedWerewolf(human: Entity, buildings: Building[]): Entity {
    curseMoonHowler(human);
    transformToWerewolfForm(human, buildings);
    forceMoonHowlerOutside(human, buildings, 1200, 900, () => 0.5);
    return human;
  }

  /**
   * A settlement with every branch of the walk represented, on a real `WorldState` from `initGame`:
   * one cursed settler still in human form, cursed settlers already abroad, a cursed prisoner, a
   * plain werewolf, dead and juvenile cursed settlers, a rival camp, a construction site, and a
   * mansion/farm that are one slot short of full so the revert branch's capacity tests bite.
   */
  function buildSettlementWorld(opts: { cursedSettlerAlreadyTransformed?: boolean } = {}): WorldState {
    setSimSeed(FIXTURE_SEED);
    const state = initGame({ villageName: 'N6', size: 'medium', seed: FIXTURE_SEED });

    const mansion = finishedBuilding(MANSION_ID, BuildingType.Mansion);
    const farm = finishedBuilding(FARM_ID, BuildingType.Farm);
    state.buildings = [
      finishedBuilding(HOUSE_ID, BuildingType.House),
      mansion,
      farm,
      finishedBuilding(PRISON_ID, BuildingType.Prison),
      finishedBuilding(RIVAL_HOUSE_ID, BuildingType.House, { faction: 'rival', occupants: [900] }),
      createBuilding(BuildingType.House, 900, 900, SITE_ID),
    ];

    const elder = settler(ELDER_ID, { ageYears: 62 });
    elder.residenceBuildingId = HOUSE_ID;
    const plainResident = settler(PLAIN_RESIDENT_ID, { ageYears: 40 });
    plainResident.residenceBuildingId = HOUSE_ID;

    const cursedSettler = settler(CURSED_SETTLER_ID, { ageYears: 33 });
    cursedSettler.residenceBuildingId = HOUSE_ID;
    if (opts.cursedSettlerAlreadyTransformed) {
      toCursedWerewolf(cursedSettler, state.buildings);
    } else {
      curseMoonHowler(cursedSettler);
    }

    const plainWerewolf = createEntity(EntityType.Werewolf, 700, 700, PLAIN_WEREWOLF_ID, 600);
    const activeHowler = settler(ACTIVE_HOWLER_ID, { ageYears: 27 });
    activeHowler.residenceBuildingId = HOUSE_ID;
    toCursedWerewolf(activeHowler, state.buildings);

    const deadCursed = settler(DEAD_CURSED_ID, { ageYears: 45 });
    deadCursed.residenceBuildingId = HOUSE_ID;
    curseMoonHowler(deadCursed);
    deadCursed.alive = false;

    const juvenileCursed = settler(JUVENILE_CURSED_ID, { ageYears: 9, isJuvenile: true });
    juvenileCursed.residenceBuildingId = HOUSE_ID;
    curseMoonHowler(juvenileCursed);

    // Two cursed settlers abroad whose saved home is the farm (cap 2) and saved residence the mansion
    // (cap 8 — seven of its eight slots are taken below). Both would fit if the reverted settler were
    // not pushed back into the human snapshot, so this pair pins that push.
    const revertA = settler(REVERT_A_ID, { ageYears: 38 });
    revertA.homeBuildingId = FARM_ID;
    revertA.residenceBuildingId = MANSION_ID;
    toCursedWerewolf(revertA, state.buildings);

    const revertB = settler(REVERT_B_ID, { ageYears: 36 });
    revertB.homeBuildingId = FARM_ID;
    revertB.residenceBuildingId = MANSION_ID;
    toCursedWerewolf(revertB, state.buildings);

    const prisoner = settler(REVERT_PRISONER_ID, { ageYears: 29 });
    prisoner.prisonBuildingId = PRISON_ID;
    prisoner.prisonerUntilTick = PRISONER_UNTIL_TICK;
    prisoner.prisonSentenceCrime = 'scandal';
    toCursedWerewolf(prisoner, state.buildings);

    const mansionResidents = MANSION_RESIDENT_IDS.map((id) => {
      const resident = settler(id, { ageYears: 25 + (id % 7) });
      resident.residenceBuildingId = MANSION_ID;
      return resident;
    });

    const farmWorker = settler(FARM_WORKER_ID, { ageYears: 44 });
    farmWorker.homeBuildingId = FARM_ID;
    farmWorker.residenceBuildingId = MANSION_ID;

    const rivalSettler = settler(RIVAL_SETTLER_ID, { ageYears: 31 });
    rivalSettler.faction = 'rival';
    rivalSettler.residenceBuildingId = RIVAL_HOUSE_ID;

    const wolf = createEntity(EntityType.Wolf, 200, 200, WOLF_ID, 500);
    const deadPlain = settler(DEAD_PLAIN_ID, { ageYears: 50 });
    deadPlain.alive = false;

    // Spawn-order, not id order: the walk's result must not depend on the array being sorted.
    state.entities = [
      wolf,
      elder,
      plainResident,
      cursedSettler,
      plainWerewolf,
      activeHowler,
      deadCursed,
      juvenileCursed,
      revertA,
      revertB,
      prisoner,
      ...mansionResidents,
      farmWorker,
      rivalSettler,
      deadPlain,
    ];

    return state;
  }

  /** A quiet settlement: no cursed settler in either form, so a plain tick must do nothing at all. */
  function buildQuietWorld(): WorldState {
    setSimSeed(FIXTURE_SEED);
    const state = initGame({ villageName: 'N6-quiet', size: 'medium', seed: FIXTURE_SEED });
    state.buildings = [
      finishedBuilding(HOUSE_ID, BuildingType.House),
      finishedBuilding(FARM_ID, BuildingType.Farm),
    ];

    const resident = settler(ELDER_ID, { ageYears: 41 });
    resident.residenceBuildingId = HOUSE_ID;
    resident.homeBuildingId = FARM_ID;
    const neighbour = settler(PLAIN_RESIDENT_ID, { ageYears: 39 });
    neighbour.residenceBuildingId = HOUSE_ID;
    const wolf = createEntity(EntityType.Wolf, 200, 200, WOLF_ID, 500);

    state.entities = [wolf, resident, neighbour];
    return state;
  }

  /**
   * Both runs get their own clone of the entities and buildings — the only things `syncMoonHowlerForms`
   * touches — so neither can observe the other's mutations. The rest of the `WorldState` (map, clock,
   * resources) is immutable during the call and is shared.
   */
  function cloneWorld(state: WorldState): WorldState {
    return {
      ...state,
      entities: structuredClone(state.entities),
      buildings: structuredClone(state.buildings),
    };
  }

  /** Every field either branch of the walk can write, plus the identity/position fields it moves. */
  function entityFields(entity: Entity): Record<string, unknown> {
    return {
      id: entity.id,
      type: entity.type,
      alive: entity.alive,
      x: entity.x,
      y: entity.y,
      vx: entity.vx,
      vy: entity.vy,
      energy: entity.energy,
      maxEnergy: entity.maxEnergy,
      speed: entity.speed,
      size: entity.size,
      flash: entity.flash,
      moonHowlerCursed: entity.moonHowlerCursed ?? null,
      moonHowlerSaved: entity.moonHowlerSaved ?? null,
      residenceBuildingId: entity.residenceBuildingId ?? null,
      homeBuildingId: entity.homeBuildingId ?? null,
      prisonBuildingId: entity.prisonBuildingId ?? null,
    };
  }

  interface SyncOutcome {
    transformedIds: number[];
    revertedIds: number[];
    nightFall: boolean;
    forms: Array<Record<string, unknown>>;
    occupants: number[][];
    entitiesJson: string;
  }

  function runSync(
    state: WorldState,
    useReference: boolean,
    colonyDay: number,
    hourOfDay: number,
  ): SyncOutcome {
    // The global 'moonHowler' stream is drawn from by `revertToHumanForm`'s prison restore; restart it
    // so both runs see the same stream. The injected stream is independent of it, as in production.
    setSimSeed(FIXTURE_SEED);
    const rng = createSeededRng(FIXTURE_SEED, 'n6-sync');
    const sync = useReference
      ? referenceSyncMoonHowlerForms(
        state.entities, colonyDay, hourOfDay, state.buildings,
        state.width, state.height, state.tick, state.villageLeaderId, rng,
      )
      : syncMoonHowlerForms(
        state.entities, colonyDay, hourOfDay, state.buildings,
        state.width, state.height, state.tick, state.villageLeaderId, rng,
      );

    return {
      transformedIds: sync.transformed.map((e) => e.id),
      revertedIds: sync.reverted.map((e) => e.id),
      nightFall: sync.nightFall,
      forms: state.entities.map(entityFields),
      occupants: state.buildings.map((b) => [...b.occupants]),
      entitiesJson: JSON.stringify(state.entities),
    };
  }

  /** Diff the real function against the reference on two identical worlds; return the real world. */
  function differential(
    source: WorldState,
    colonyDay: number,
    hourOfDay: number,
  ): { actual: SyncOutcome; world: WorldState } {
    const referenceWorld = cloneWorld(source);
    const actualWorld = cloneWorld(source);
    const reference = runSync(referenceWorld, true, colonyDay, hourOfDay);
    const actual = runSync(actualWorld, false, colonyDay, hourOfDay);

    expect(actual.transformedIds, 'transformed ids').toEqual(reference.transformedIds);
    expect(actual.revertedIds, 'reverted ids').toEqual(reference.revertedIds);
    expect(actual.nightFall, 'nightFall').toBe(reference.nightFall);
    expect(actual.forms, 'entity fields after the sync').toEqual(reference.forms);
    expect(actual.occupants, 'building occupants after the sync').toEqual(reference.occupants);
    expect(actual.entitiesJson, 'every entity field').toBe(reference.entitiesJson);

    return { actual, world: actualWorld };
  }

  function entityById(world: WorldState, id: number): Entity {
    const entity = world.entities.find((e) => e.id === id);
    if (!entity) throw new Error(`fixture entity ${id} is missing`);
    return entity;
  }

  describe('syncMoonHowlerForms is equivalent to its pre-N-6 body (N-6)', () => {
    it('full-moon NIGHT_START: the cursed settler transforms and the night falls', () => {
      const source = buildSettlementWorld();
      // Sanity on the fixture itself: a full-moon night is when the transform direction can run.
      expect(shouldMoonHowlerTransform(FULL_MOON_DAY, NIGHT_START)).toBe(true);
      expect(isMoonHowlerTransformTick(FULL_MOON_DAY, NIGHT_START)).toBe(true);

      const { actual, world } = differential(source, FULL_MOON_DAY, NIGHT_START);

      expect(actual.transformedIds).toEqual([CURSED_SETTLER_ID]);
      expect(actual.revertedIds).toEqual([]);
      expect(actual.nightFall).toBe(true);
      expect(entityById(world, CURSED_SETTLER_ID).type).toBe(EntityType.Werewolf);
      // A cursed settler already abroad is not reverted during the transform direction.
      expect(entityById(world, REVERT_A_ID).type).toBe(EntityType.Werewolf);
      expect(entityById(world, REVERT_PRISONER_ID).type).toBe(EntityType.Werewolf);
      // Dead or under-age cursed settlers are never touched.
      expect(entityById(world, DEAD_CURSED_ID).type).toBe(EntityType.Human);
      expect(entityById(world, JUVENILE_CURSED_ID).type).toBe(EntityType.Human);
    });

    it('full-moon NIGHT_START on the next tick: an howler already abroad keeps the night fallen', () => {
      // NIGHT_START spans three ticks, so ticks 2 and 3 of the hour find every cursed settler already
      // transformed: `transformed` is empty and only `huntingTonight` can keep `nightFall` true.
      const source = buildSettlementWorld({ cursedSettlerAlreadyTransformed: true });

      const { actual } = differential(source, FULL_MOON_DAY, NIGHT_START);

      expect(actual.transformedIds).toEqual([]);
      expect(actual.revertedIds).toEqual([]);
      expect(actual.nightFall).toBe(true);
    });

    it('NIGHT_END: werewolves revert, and the first revert takes the last free slot', () => {
      const source = buildSettlementWorld({ cursedSettlerAlreadyTransformed: true });
      // The revert direction runs whenever it is *not* a full-moon night — `NIGHT_END` (06:00) is the
      // production revert tick. This is the case a `if (!wantWerewolf) return;` gate would skip.
      expect(shouldMoonHowlerTransform(FULL_MOON_DAY, NIGHT_END)).toBe(false);

      const { actual, world } = differential(source, FULL_MOON_DAY, NIGHT_END);

      // Every cursed werewolf reverts, in `entities` order — the cursed settler that transformed
      // earlier in the night and the one already abroad included. An "only run this on a full moon"
      // gate would strand all five of them as werewolves.
      expect(actual.revertedIds).toEqual([
        CURSED_SETTLER_ID, ACTIVE_HOWLER_ID, REVERT_A_ID, REVERT_B_ID, REVERT_PRISONER_ID,
      ]);
      expect(actual.nightFall).toBe(false);
      for (const id of [CURSED_SETTLER_ID, ACTIVE_HOWLER_ID, REVERT_A_ID, REVERT_B_ID, REVERT_PRISONER_ID]) {
        expect(entityById(world, id).type, `entity ${id} reverted to human form`).toBe(EntityType.Human);
        expect(entityById(world, id).moonHowlerCursed, `entity ${id} keeps the curse`).toBe(true);
      }
      // Farm cap 2 with one worker, mansion cap 8 with seven residents: the settler who reverts first
      // is pushed into the human snapshot the capacity test reads, so the second is refused.
      // Measured, not assumed. Farm cap 2 with one worker: the settler who reverts first is pushed into
      // the human snapshot the capacity test reads, so it takes the last free farm slot and the second
      // is refused. The mansion (cap 8, seven residents) has **no** free slot for either of them — an
      // earlier draft of this pin assumed the first revert would take a residence slot too and was wrong;
      // the differential above agreed with the reference throughout, so the pin was corrected rather
      // than the production code.
      expect(entityById(world, REVERT_A_ID).homeBuildingId).toBe(FARM_ID);
      expect(entityById(world, REVERT_A_ID).residenceBuildingId).toBeUndefined();
      expect(entityById(world, REVERT_B_ID).homeBuildingId).toBeUndefined();
      expect(entityById(world, REVERT_B_ID).residenceBuildingId).toBeUndefined();
      // The prison sentence is restored from the saved snapshot, jittered off the global stream.
      expect(entityById(world, REVERT_PRISONER_ID).prisonBuildingId).toBe(PRISON_ID);
      expect(entityById(world, REVERT_PRISONER_ID).prisonerUntilTick).toBe(PRISONER_UNTIL_TICK);
      // Skipped by the walk: dead and juvenile cursed settlers, and a werewolf that was never cursed.
      expect(entityById(world, DEAD_CURSED_ID).type).toBe(EntityType.Human);
      expect(entityById(world, JUVENILE_CURSED_ID).type).toBe(EntityType.Human);
      expect(entityById(world, PLAIN_WEREWOLF_ID).type).toBe(EntityType.Werewolf);
    });

    it('full-moon night past the transform hour: the night flag needs the transform hour', () => {
      const source = buildSettlementWorld();

      const { actual } = differential(source, FULL_MOON_DAY, NIGHT_START + 1);

      // Still a full-moon night, so cursed settlers keep transforming …
      expect(actual.transformedIds).toEqual([CURSED_SETTLER_ID]);
      // … but `nightFall` is `transformTick && (...)`, and only NIGHT_START is the transform tick.
      expect(shouldMoonHowlerTransform(FULL_MOON_DAY, NIGHT_START + 1)).toBe(true);
      expect(isMoonHowlerTransformTick(FULL_MOON_DAY, NIGHT_START + 1)).toBe(false);
      expect(actual.nightFall).toBe(false);
    });

    it('ordinary day: a quiet settlement is left exactly as it was', () => {
      const source = buildQuietWorld();

      const { actual, world } = differential(source, ORDINARY_DAY, 12);

      expect(actual.transformedIds).toEqual([]);
      expect(actual.revertedIds).toEqual([]);
      expect(actual.nightFall).toBe(false);
      expect(entityById(world, ELDER_ID).residenceBuildingId).toBe(HOUSE_ID);
      expect(entityById(world, ELDER_ID).homeBuildingId).toBe(FARM_ID);
    });
  });
});

