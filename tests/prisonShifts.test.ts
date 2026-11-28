import { human, finishedBuilding } from '../src/test/factories';
import { collectSimulationInvariantErrors } from '../src/game/simulation/simulationInvariants';
import { isNearBuilding } from '../src/game/simulation/humanRelationships';
import { humanBuildingTarget } from '../src/game/simulation/humanMovement';
/**
 * The prison roster: three nine-hour shifts with one-hour handovers, rotated weekly. The duty pass
 * reads only these rules, so the arithmetic is what keeps a prison staffed.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/game/dayCycle';
import { BUILDING_CONFIGS, BuildingType, EntityType, JobType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { initGame } from '../src/game/worldGen';
import { tickPrisonGuardDuty, tickPrisonPresence } from '../src/game/prisonGuardDuty';
import { syncJobBuildingOccupants, releasePrisoners } from '../src/game/workforce';
import { resetSimRng, setSimSeed } from '../src/game/simRng';
import {
  PRISON_GUARDS_FOR_FULL_COVERAGE,
  PRISON_GUARDS_MAX,
  PRISON_OCCUPANTS_MAX,
  PRISON_PRISONERS_MAX,
  PRISON_SHIFTS,
  offDutyPrisonGuards,
  prisonGuardCapacity,
  prisonOnDutyGuards,
  prisonPrisonerCapacity,
  prisonRoster,
  prisonDutyForGuard,
  prisonShiftsAtHour,
  prisonWeekIndex,
  shiftHours,
  unguardedPrisonHours,
  vacantPrisonShifts,
} from '../src/game/prisonShifts';

describe('the roster covers the day', () => {
  it('is three nine-hour shifts whose one-hour handovers cover all 24 hours', () => {
    expect(PRISON_SHIFTS.map((shift) => shiftHours(shift).length)).toEqual([9, 9, 9]);

    const covered = new Set<number>();
    let handoverHours = 0;
    for (let hour = 0; hour < 24; hour++) {
      const shifts = prisonShiftsAtHour(hour);
      expect(shifts.length).toBeGreaterThan(0);
      if (shifts.length > 1) handoverHours += 1;
      for (const shift of shifts) for (const h of shiftHours(shift)) covered.add(h);
    }

    // 27 h of work over 24 h of day leaves exactly three one-hour handovers, and no gap.
    expect(handoverHours).toBe(3);
    expect(covered.size).toBe(24);
  });

  it('puts one guard on every shift and moves each of them one shift on each week', () => {
    const crew = [11, 22, 33];
    const first = prisonRoster(crew, 0);
    expect(first.map((entry) => entry.guardId)).toEqual([11, 22, 33]);
    expect(unguardedPrisonHours(first)).toEqual([]);

    const second = prisonRoster(crew, 7 * TICKS_PER_DAY);
    expect(second.map((entry) => entry.guardId)).toEqual([33, 11, 22]);
    expect(unguardedPrisonHours(second)).toEqual([]);

    // Three weeks on, the rotation is back where it started.
    expect(prisonRoster(crew, 21 * TICKS_PER_DAY).map((e) => e.guardId)).toEqual([11, 22, 33]);
  });

  it('rests one of the four posts by week and still covers every shift', () => {
    // Four posts for three shifts: the extra guard buys rest days, not a shorter watch.
    const four = [11, 22, 33, 44];
    const restDays = new Map<number, number>();
    for (let day = 0; day < 28; day++) {
      const tick = day * TICKS_PER_DAY;
      const roster = prisonRoster(four, tick);
      expect(vacantPrisonShifts(roster)).toEqual([]);
      expect(unguardedPrisonHours(roster)).toEqual([]);
      for (const id of offDutyPrisonGuards(four, tick)) restDays.set(id, (restDays.get(id) ?? 0) + 1);
    }

    // One full rest week each in four, and nobody is left off the rotation.
    for (const id of four) expect(restDays.get(id)).toBe(7);
  });

  it('leaves open the vacant shift\u2019s hours, minus what its neighbours\u2019 handovers cover', () => {
    // Week 0, two guards: crew positions 0 and 1 take morning and afternoon, so the night is vacant.
    const roster = prisonRoster([11, 22], 0);
    expect(PRISON_GUARDS_FOR_FULL_COVERAGE).toBe(3);
    expect(vacantPrisonShifts(roster).map((shift) => shift.key)).toEqual(['night']);
    // The night runs 23:00-08:00, but 23:00 is the afternoon's last hour and 07:00 the morning's
    // first: with the handover, one missing guard leaves seven hours open rather than nine.
    expect(unguardedPrisonHours(roster)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('leaves the whole day open with no crew at all', () => {
    expect(unguardedPrisonHours(prisonRoster([], 0))).toHaveLength(24);
  });

  it('keeps a started overnight watch across midnight and schedules next-week relief early', () => {
    const crew = [11, 22, 33, 44];
    const lastSunday = 7 * TICKS_PER_DAY - 1;
    const mondayMidnight = 7 * TICKS_PER_DAY;
    const lastSundayNightStart = 6 * TICKS_PER_DAY + 23 * (TICKS_PER_DAY / 24);

    // The guard who took Sunday night's 23:00 shift remains responsible at 00:00
    // Monday, even though the nominal weekly roster has already rotated.
    const sundayNight = prisonDutyForGuard(33, crew, lastSunday);
    const mondayNight = prisonDutyForGuard(33, crew, mondayMidnight);
    expect(sundayNight).toEqual({
      shift: PRISON_SHIFTS[2], startTick: lastSundayNightStart, onShift: true,
    });
    expect(mondayNight).toEqual(sundayNight);

    // Monday's new morning guard can depart on Sunday, not only at 00:00.
    const mondayMorning = prisonDutyForGuard(44, crew, lastSunday);
    expect(mondayMorning).toEqual({
      shift: PRISON_SHIFTS[0],
      startTick: mondayMidnight + 7 * (TICKS_PER_DAY / 24), onShift: false,
    });
    expect(prisonDutyForGuard(44, crew, mondayMidnight)?.startTick).toBe(mondayMorning?.startTick);
  });

  it('starts a new week where the game clock does', () => {
    expect(prisonWeekIndex(0)).toBe(0);
    expect(prisonWeekIndex(6 * TICKS_PER_DAY)).toBe(0);
    expect(prisonWeekIndex(7 * TICKS_PER_DAY)).toBe(1);
  });
});

describe('the prison holds four prisoners beside its guard posts', () => {
  it('splits the occupancy into the owner\'s posts and cells, pinning both sides', () => {
    const occupancy = BUILDING_CONFIGS[BuildingType.Prison].maxOccupants;
    expect(prisonPrisonerCapacity(occupancy)).toBe(PRISON_PRISONERS_MAX);
    expect(prisonGuardCapacity(occupancy)).toBe(PRISON_GUARDS_MAX);
    // Both sides of the split, so a change to either the building or the roster shows up here.
    expect(occupancy).toBe(PRISON_GUARDS_MAX + PRISON_PRISONERS_MAX);
    expect(occupancy).toBe(PRISON_OCCUPANTS_MAX);
  });
});

describe('a crew larger than the watch takes days off in turn', () => {
  const five = [11, 22, 33, 44, 55];

  it('puts one guard on every shift on every day of the rotation', () => {
    for (let day = 0; day < 35; day++) {
      const roster = prisonRoster(five, day * TICKS_PER_DAY);
      expect(vacantPrisonShifts(roster)).toEqual([]);
      expect(unguardedPrisonHours(roster)).toEqual([]);
    }
  });

  it('keeps the same three guards on duty all week so their commutes can finish', () => {
    for (let week = 0; week < 5; week++) {
      const roster = prisonRoster(five, week * 7 * TICKS_PER_DAY);
      const expected = roster.map((entry) => entry.guardId).filter((id): id is number => id != null).sort();
      for (let day = 1; day < 7; day++) {
        const current = prisonRoster(five, (week * 7 + day) * TICKS_PER_DAY)
          .map((entry) => entry.guardId)
          .filter((id): id is number => id != null)
          .sort();
        expect(current).toEqual(expected);
      }
    }
  });

  it('rests two of the five each week and works every guard three weeks in five', () => {
    const worked = new Map<number, number>();
    for (let day = 0; day < 35; day++) {
      const onDuty = prisonOnDutyGuards(five, day * TICKS_PER_DAY);
      expect(onDuty).toHaveLength(PRISON_SHIFTS.length);
      expect(offDutyPrisonGuards(five, day * TICKS_PER_DAY)).toHaveLength(five.length - PRISON_SHIFTS.length);
      for (const id of onDuty) worked.set(id, (worked.get(id) ?? 0) + 1);
    }
    // 5 weeks x 3 posts = 15 guard-weeks over five guards: 3 weeks each, and the share is exact.
    for (const id of five) expect(worked.get(id)).toBe(21);
  });

  it('rests nobody when the crew is exactly the watch — the pre-rotation behaviour', () => {
    const three = [11, 22, 33];
    expect(prisonOnDutyGuards(three, 5 * TICKS_PER_DAY)).toEqual(three);
    expect(offDutyPrisonGuards(three, 5 * TICKS_PER_DAY)).toEqual([]);
  });
});

const PRISON_ID = 9001;

function prisoner(id: number): Entity {
  return {
    id,
    type: EntityType.Human,
    alive: true,
    x: 10,
    y: 10,
    energy: 100,
    maxEnergy: 100,
    age: 30,
    isJuvenile: false,
    prisonBuildingId: PRISON_ID,
    prisonerUntilTick: 10 * TICKS_PER_DAY,
    prisonSentenceCrime: 'scandal',
  } as unknown as Entity;
}

function prisonBuilding(occupants: number[]): Building {
  return {
    id: PRISON_ID,
    type: BuildingType.Prison,
    completed: true,
    faction: undefined,
    occupants,
    x: 0,
    y: 0,
    width: 40,
    height: 40,
    level: 1,
  } as unknown as Building;
}

/** One unguarded day: a completed Prison with two prisoners and no guard on any shift. */
function unguardedDay(): { state: WorldState; prisoners: Entity[] } {
  const state = initGame({ skipTerrain: true, seed: 4242 });
  const prisoners = [prisoner(1), prisoner(2)];
  state.entities = [...prisoners];
  state.buildings = [prisonBuilding(prisoners.map((p) => p.id))];
  state.tick = 0;
  return { state, prisoners };
}

/** Attempts until one daily pulse frees both prisoners. */
function escapedTogetherOnOneDay(): boolean {
  for (let attempt = 0; attempt < 40; attempt++) {
    const { state, prisoners } = unguardedDay();
    setSimSeed(1000 + attempt);
    state.tick = attempt * TICKS_PER_DAY;

    tickPrisonGuardDuty(state);

    if (prisoners.every((p) => p.prisonBuildingId == null)) return true;
  }
  return false;
}

describe('tickPrisonGuardDuty rolls per unguarded hour', () => {
  afterEach(() => {
    resetSimRng();
  });

  it('keeps an escaped guard on the prison workforce roster', () => {
    let escaped = false;
    for (let attempt = 0; attempt < 40 && !escaped; attempt++) {
      const state = initGame({ skipTerrain: true, seed: 4242 });
      const guard = prisoner(3);
      guard.job = JobType.PrisonGuard;
      guard.workerBuildingId = PRISON_ID;
      const prison = prisonBuilding([guard.id]);
      state.entities = [guard];
      state.buildings = [prison];
      state.tick = attempt * TICKS_PER_DAY;
      setSimSeed(1000 + attempt);

      tickPrisonGuardDuty(state);

      if (guard.prisonBuildingId == null) {
        escaped = true;
        expect(guard.workerBuildingId).toBe(PRISON_ID);
        expect(prison.occupants).toContain(guard.id);
      }
    }
    expect(escaped).toBe(true);
  });

  it('restores an escaped farm worker to the reserved workplace without a staffing pulse', () => {
    let escaped = false;
    for (let attempt = 0; attempt < 40 && !escaped; attempt++) {
      const state = initGame({ skipTerrain: true, seed: 4242 });
      const worker = prisoner(17);
      worker.job = JobType.Farmer;
      worker.workerBuildingId = 9002;
      const prison = prisonBuilding([worker.id]);
      const farm = {
        ...prisonBuilding([]),
        id: 9002,
        type: BuildingType.Farm,
      } as Building;
      state.entities = [worker];
      state.buildings = [prison, farm];
      syncJobBuildingOccupants(state.entities, state.buildings);
      expect(farm.occupants).not.toContain(worker.id);
      state.tick = attempt * TICKS_PER_DAY;
      setSimSeed(1000 + attempt);

      tickPrisonGuardDuty(state);

      if (worker.prisonBuildingId == null) {
        escaped = true;
        expect(worker.workerBuildingId).toBe(farm.id);
        expect(farm.occupants).toEqual([worker.id]);
        expect(prison.occupants).not.toContain(worker.id);
      }
    }
    expect(escaped).toBe(true);
  });

  it('releases both prisoners on a single day when the post was open all day', () => {
    expect(escapedTogetherOnOneDay()).toBe(true);
  });
});

describe('Prison roster, presence and release', () => {
  afterEach(resetSimRng);

  /** One unguarded prisoner (no guards = 24 unguarded hours) in a completed Prison. */
  function prisonWorld(): { world: WorldState; prisoner: Entity; prison: Building } {
    const world = initGame({ skipTerrain: true });
    const prisoner = world.entities.find(
      (e) => e.type === EntityType.Human && e.id !== world.villageLeaderId,
    )!;
    const prisonId = 9001;
    prisoner.workerBuildingId = undefined;
    prisoner.prisonBuildingId = prisonId;
    prisoner.prisonerUntilTick = world.tick + 10 * TICKS_PER_DAY;
    prisoner.prisonSentenceCrime = 'scandal';
    const prison = finishedBuilding(prisonId, BuildingType.Prison, { occupants: [prisoner.id] });
    world.buildings = [prison];
    return { world, prisoner, prison };
  }

  describe('L51 — a prison escape re-syncs the prison occupant list', () => {
    it('drops the escapee from prison.occupants and clears the sentence crime', () => {
      const { world, prisoner, prison } = prisonWorld();
      expect(collectSimulationInvariantErrors(world)).toEqual([]);

      setSimSeed(1);
      let escaped = false;
      for (let day = 0; day < 60 && !escaped; day++) {
        tickPrisonGuardDuty(world);
        escaped = prisoner.prisonBuildingId === undefined;
      }

      expect(escaped).toBe(true);
      expect(prison.occupants).not.toContain(prisoner.id);
      expect(prisoner.prisonSentenceCrime).toBeUndefined();
      // §5 prison invariant: every id in `occupants` is a prisoner or a guard.
      expect(collectSimulationInvariantErrors(world)).toEqual([]);
    });

    it('is the exact state the prison invariant rejects when the list is left stale', () => {
      const { world, prisoner, prison } = prisonWorld();
      // Stale escape end state: ownership cleared but the occupant id left behind.
      prisoner.prisonBuildingId = undefined;
      prisoner.prisonerUntilTick = undefined;

      expect(prison.occupants).toContain(prisoner.id);
      expect(
        collectSimulationInvariantErrors(world).some((e) => e.includes('neither prisoner')),
      ).toBe(true);
    });
  });

  /** The same prison, with `guardCount` guards on its roster and the matching occupants list. */
  function staffedPrison(guardCount: number): { world: WorldState; prisoner: Entity; prison: Building } {
    const { world, prisoner, prison } = prisonWorld();
    for (let i = 0; i < guardCount; i++) {
      const guard = human(7000 + i, { job: JobType.PrisonGuard, workerBuildingId: prison.id });
      world.entities.push(guard);
      prison.occupants = [...(prison.occupants ?? []), guard.id];
    }
    return { world, prisoner, prison };
  }

  describe('prison coverage — the crew the shifts require has to fit in the building', () => {
    it('seats a full guard crew and still has room for a prisoner', () => {
      // The roster needs one guard per shift for 24 h coverage; a building that cannot seat them cannot
      // hold a prisoner.
      expect(BUILDING_CONFIGS[BuildingType.Prison].maxOccupants).toBeGreaterThanOrEqual(
        PRISON_GUARDS_FOR_FULL_COVERAGE + 1,
      );
    });

    it('holds the prisoner while the full crew is on the roster', () => {
      const { world, prisoner } = staffedPrison(PRISON_GUARDS_FOR_FULL_COVERAGE);
      setSimSeed(1);
      for (let day = 0; day < 120; day++) tickPrisonGuardDuty(world);

      expect(prisoner.prisonBuildingId).toBeDefined();
      expect(prisoner.prisonerUntilTick).toBeDefined();
      expect(collectSimulationInvariantErrors(world)).toEqual([]);
    });

    it('still leaks when the roster is one shift short', () => {
      const { world, prisoner } = staffedPrison(PRISON_GUARDS_FOR_FULL_COVERAGE - 1);
      setSimSeed(1);
      let escaped = false;
      for (let day = 0; day < 120 && !escaped; day++) {
        tickPrisonGuardDuty(world);
        escaped = prisoner.prisonBuildingId === undefined;
      }

      expect(escaped).toBe(true);
    });
  });

  describe('prison coverage is presence, not the roster', () => {
    /** One day of hourly post checks, the way the realtime layer runs them. */
    function sampleDay(world: WorldState): void {
      for (let hour = 0; hour < 24; hour++) {
        world.tick = hour * TICKS_PER_HOUR;
        tickPrisonPresence(world);
      }
    }

    it('records no uncovered hour while the crew stands on the post', () => {
      const { world, prisoner, prison } = staffedPrison(PRISON_GUARDS_FOR_FULL_COVERAGE);
      sampleDay(world);

      expect(prison.uncoveredPrisonHours ?? []).toEqual([]);

      setSimSeed(1);
      for (let day = 0; day < 120; day++) tickPrisonGuardDuty(world);
      expect(prisoner.prisonBuildingId).toBeDefined();
    });

    it('sees a stationed guard even with the cells full and the guards seated last', () => {
      // `prison.occupants` is guards ∪ prisoners, so presence must be sampled per guard rather than
      // from list order; with the cells full and the guards last, every hour is still covered.
      const { world, prisoner, prison } = prisonWorld();
      const guards: Entity[] = [];
      for (let i = 0; i < PRISON_GUARDS_FOR_FULL_COVERAGE; i++) {
        const guard = human(7000 + i, { job: JobType.PrisonGuard, workerBuildingId: prison.id });
        world.entities.push(guard);
        guards.push(guard);
      }
      const cellmates = [prisoner.id];
      for (let i = 0; i < 4; i++) {
        const cellmate = human(8000 + i, { prisonBuildingId: prison.id });
        world.entities.push(cellmate);
        cellmates.push(cellmate.id);
      }
      prison.occupants = [...cellmates, ...guards.map((guard) => guard.id)];

      for (const guard of guards) {
        const stand = humanBuildingTarget(prison, guard.id);
        const posted = { ...guard, x: stand.x, y: stand.y };
        expect(isNearBuilding(posted, prison)).toBe(true);
      }

      // And the sampler agrees: every hour of the day is covered while they hold the row.
      sampleDay(world);
      expect(prison.uncoveredPrisonHours ?? []).toEqual([]);
    });

    it('leaks with a full roster when the guards never stood on the post', () => {
      const { world, prisoner, prison } = staffedPrison(PRISON_GUARDS_FOR_FULL_COVERAGE);
      for (const guardId of prison.occupants ?? []) {
        const guard = world.entities.find((e) => e.id === guardId)!;
        guard.x = 500;
        guard.y = 500;
      }
      sampleDay(world);

      // Assigned is not present: every hour of the day had nobody on the post.
      expect((prison.uncoveredPrisonHours ?? []).length).toBe(24);

      setSimSeed(1);
      let escaped = false;
      for (let day = 0; day < 60 && !escaped; day++) {
        sampleDay(world);
        tickPrisonGuardDuty(world);
        escaped = prisoner.prisonBuildingId === undefined;
      }

      expect(escaped).toBe(true);
    });

    it('tells the player when a prisoner escapes, not just the chronicle', () => {
      const { world, prisoner } = prisonWorld();
      setSimSeed(1);
      let told = false;
      for (let day = 0; day < 60 && !told; day++) {
        tickPrisonGuardDuty(world);
        told = world.notifications.some((n) => n.title === 'Escaped');
      }

      expect(prisoner.prisonBuildingId, 'the prisoner never escaped, so nothing was announced').toBeUndefined();
      expect(told, 'the escape was logged but the player was never told').toBe(true);
    });

    it('files a release with the jailings and tells the player', () => {
      const { world, prisoner } = prisonWorld();
      world.notifications = [];
      world.eventLog = [];
      // The sentence is served: `releasePrisoners` frees anyone whose release tick has arrived.
      prisoner.prisonerUntilTick = world.tick;

      releasePrisoners(world);

      expect(prisoner.prisonBuildingId).toBeUndefined();
      expect(world.notifications.some((n) => n.title === 'Released'), 'the release was not announced').toBe(true);
      expect(
        world.eventLog.some((e) => e.type === 'prison' && e.message.includes('released from prison')),
        'the release did not file under the prison filter',
      ).toBe(true);
    });
  });
});
