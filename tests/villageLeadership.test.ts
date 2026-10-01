import { describe, expect, it } from 'vitest';
import { DAYS_PER_YEAR, TICKS_PER_DAY } from '../src/game/dayCycle';
import {
  BuildingType,
  EntityType,
  JobType,
  LEADER_OCCUPATION,
  type Building,
  type ElectionCeremonyState,
  type Entity,
  type WorldState,
} from '../src/game/gameTypes';
import {
  VACANCY_ELECTION_DELAY_YEARS,
  formatSettlerName,
  getElectionCeremonyStatus,
  getLeadershipScoreBreakdown,
  getVillageLeader,
  isActingVillageHead,
  isEligibleForLeadership,
  isVillageLeader,
  rankLeadershipCandidates,
  runVillageElection,
  tickLeaderVacancy,
  tryStartTermElectionCeremony,
  tryStartVacancyElectionCeremony,
  validateVillageLeaderOnLoad,
} from '../src/game/villageLeadership';
import { initGame } from '../src/game/worldGen';

/**
 * Village head must stay resolvable while in temporary Moon Howler form (EJ-10).
 * Vacancy must not fire just because type flipped to Werewolf.
 */
describe('villageLeadership.actingHead.test.ts', () => {
  function stubHuman(id: number, overrides: Partial<Entity> = {}): Entity {
    return {
      id,
      type: EntityType.Human,
      x: 0,
      y: 0,
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
      name: 'Asha',
      surname: 'Reed',
      gender: 'female',
      isJuvenile: false,
      ...overrides,
    } as Entity;
  }

  function stubState(entities: Entity[], leaderId: number | null): WorldState {
    return {
      entities,
      villageLeaderId: leaderId,
      year: 5,
      dayInYear: 10,
      tick: 500,
    } as WorldState;
  }

  describe('acting village head (Moon Howler night)', () => {
    it('human incumbent is eligible and resolvable', () => {
      const leader = stubHuman(7);
      const state = stubState([leader], 7);
      expect(isEligibleForLeadership(leader, state)).toBe(true);
      expect(getVillageLeader(state)?.id).toBe(7);
      expect(isVillageLeader(state, 7)).toBe(true);
    });

    it('werewolf-form incumbent remains acting head for UI (not vacancy)', () => {
      const leader = stubHuman(7, {
        type: EntityType.Werewolf,
        moonHowlerCursed: true,
      });
      const state = stubState([leader], 7);

      // Merit races still want human form — that is fine
      expect(isEligibleForLeadership(leader, state)).toBe(false);
      // But they still hold office while cursed and transformed
      expect(isActingVillageHead(leader, state)).toBe(true);
      expect(getVillageLeader(state)?.id).toBe(7);
      expect(isVillageLeader(state, 7)).toBe(true);
    });

    it('dead or foreign faction does not keep the crown', () => {
      const dead = stubHuman(1, { alive: false });
      const visitor = stubHuman(2, { faction: 'visitor' });
      expect(isActingVillageHead(dead)).toBe(false);
      expect(isActingVillageHead(visitor)).toBe(false);
      expect(getVillageLeader(stubState([dead], 1))).toBeNull();
    });

    it('scandal-imprisoned incumbent keeps office (no vacancy)', () => {
      const leader = stubHuman(7, { prisonBuildingId: 42 });
      const state = stubState([leader], 7);

      expect(isEligibleForLeadership(leader, state)).toBe(false);
      expect(isActingVillageHead(leader, state)).toBe(true);
      expect(getVillageLeader(state)?.id).toBe(7);
    });
  });
});

/**
 * Two election-scheduling defects from the 2026-09-16 economy audit (tracked in
 * `LIVE-FINDINGS-STATUS.md`), both in `villageLeadership`'s two ceremony starters.
 *
 * - **L11** — `tryStartVacancyElectionCeremony` derived the ceremony's *reason* from the calendar year
 *   (`year % ELECTION_INTERVAL_YEARS === 0 ? 'term' : 'succession'`), although it only ever runs
 *   because a vacancy armed `pendingElectionYear`. A death that resolved in Year 2, 4 or 6 was
 *   therefore announced and logged as "elected/re-elected village head" and stamped `lastElectionYear`
 *   — consuming that year's term slot for a mid-term handover. It now says `'succession'`, which is
 *   what it is.
 * - **L3** — a *term* election that finds no eligible candidate returned `false` and simply logged
 *   "postponed", scheduling nothing. Its gate only opens on `dayInYear === 0 && year % 2 === 0`, so
 *   the colony went without any election for two more years. It now arms the same
 *   `pendingElectionYear` delay the death path uses, so the retry runs in a quarter-year.
 */
describe('villageLeadership.electionGaps.test.ts', () => {
  const FIXTURE_SEED = 20_260_917;
  /** A term year (`ELECTION_INTERVAL_YEARS` is 2), so the old year-derived label would say `'term'`. */
  const TERM_YEAR = 2;

  function world(): WorldState {
    const state = initGame({ villageName: 'Elections', size: 'medium', seed: FIXTURE_SEED });
    state.pendingStoryEvents = [];
    state.electionCeremony = null;
    state.pendingElectionYear = null;
    state.lastElectionYear = 0;
    state.year = TERM_YEAR;
    state.dayInYear = 0;
    state.tick = TERM_YEAR * DAYS_PER_YEAR * TICKS_PER_DAY;
    return state;
  }

  /** No eligible candidate: `isEligibleForLeadership` requires a non-juvenile, un-imprisoned adult. */
  function makeEveryoneIneligible(state: WorldState): void {
    for (const entity of state.entities) {
      if (entity.type === EntityType.Human && entity.faction == null) entity.isJuvenile = true;
    }
  }

  describe('election scheduling (L3, L11)', () => {
    it('labels a vacancy that lands in a term year a succession', () => {
      const state = world();
      // A death armed the schedule for this very day; the term election for Year 2 is not what this is.
      state.pendingElectionYear = TERM_YEAR;

      expect(tryStartVacancyElectionCeremony(state, TERM_YEAR, 0)).toBe(true);

      // The label is the fix, and it carries the date consequence with it: the reveal stamps
      // `lastElectionYear` only for `'term'`/`'founding'` (`villageLeadership.ts`), so pre-fix this
      // mid-term handover took Year 2's term slot as well as announcing itself as a re-election. The
      // stamping itself happens at the reveal, which this test does not drive — the reason it is reached
      // with is the whole difference.
      expect(state.electionCeremony?.reason).toBe('succession');
    });

    it('still schedules a term election as a term, and arms no retry', () => {
      const state = world();

      expect(tryStartTermElectionCeremony(state, TERM_YEAR, 0)).toBe(true);

      expect(state.electionCeremony?.reason).toBe('term');
      expect(state.pendingElectionYear).toBeNull();
    });

    it('re-arms the schedule when a term election finds nobody eligible, instead of stalling two years', () => {
      const state = world();
      makeEveryoneIneligible(state);

      expect(tryStartTermElectionCeremony(state, TERM_YEAR, 0), 'the term election should not start').toBe(false);
      // Pre-fix nothing was armed: the next gate opening is Year 4's day 0, two years later.
      expect(state.pendingElectionYear).toBeCloseTo(TERM_YEAR + VACANCY_ELECTION_DELAY_YEARS, 10);

      // And the retry really runs: restore adults and land on the armed day.
      for (const entity of state.entities) {
        if (entity.type === EntityType.Human && entity.faction == null) entity.isJuvenile = false;
      }
      const due = state.pendingElectionYear ?? 0;
      const dueYear = Math.floor(due);
      const dueDay = Math.round((due - dueYear) * DAYS_PER_YEAR);
      state.year = dueYear;
      state.dayInYear = dueDay;
      state.tick = (dueYear * DAYS_PER_YEAR + dueDay) * TICKS_PER_DAY;

      expect(tryStartVacancyElectionCeremony(state, dueYear, dueDay)).toBe(true);
      expect(state.electionCeremony?.reason).toBe('succession');
    });

    it('re-arms a vacancy that finds nobody eligible, instead of retrying every day', () => {
      const state = world();
      makeEveryoneIneligible(state);
      // A death armed the schedule for this very day, and the attempt finds no candidate.
      state.pendingElectionYear = TERM_YEAR;

      expect(tryStartVacancyElectionCeremony(state, TERM_YEAR, 0), 'the ceremony should not start').toBe(false);
      // Pre-fix the past-due date stayed where it was, so the office was re-attempted — and the
      // postponement logged — every single day until a settler came of age. The office is now
      // re-contested on the vacancy rhythm instead.
      expect(state.pendingElectionYear).toBeCloseTo(TERM_YEAR + VACANCY_ELECTION_DELAY_YEARS, 10);

      // And the retry really runs once an adult is eligible again.
      for (const entity of state.entities) {
        if (entity.type === EntityType.Human && entity.faction == null) entity.isJuvenile = false;
      }
      const due = state.pendingElectionYear ?? 0;
      const dueYear = Math.floor(due);
      const dueDay = Math.round((due - dueYear) * DAYS_PER_YEAR);
      state.year = dueYear;
      state.dayInYear = dueDay;
      state.tick = (dueYear * DAYS_PER_YEAR + dueDay) * TICKS_PER_DAY;

      expect(tryStartVacancyElectionCeremony(state, dueYear, dueDay)).toBe(true);
    });
  });
});

/**
 * Legacy save compatibility for the scheduled-election token.
 *
 * The scheduled election was stored as `reason: 'decennial'` — a name from the
 * original 10-year term, kept through the 5-year era. Terms are now
 * ELECTION_INTERVAL_YEARS (2) years and the token is `'term'`. Saves written
 * before the rename must keep working, so `validateVillageLeaderOnLoad`
 * rewrites the old value on load.
 */
describe('villageLeadership.legacyElectionToken.test.ts', () => {
  function ceremony(reason: string): ElectionCeremonyState {
    return {
      phase: 'gossip',
      phaseTicksLeft: 120,
      gatherX: 100,
      gatherY: 100,
      reason,
      pendingLeaderId: 0,
      pendingLeaderName: 'X',
      pendingChanged: false,
    } as unknown as ElectionCeremonyState;
  }

  describe('legacy election ceremony token', () => {
    it("migrates a stored 'decennial' ceremony to 'term' on load", () => {
      const world = initGame({ villageName: 'W', size: 'medium' });
      world.electionCeremony = ceremony('decennial');

      validateVillageLeaderOnLoad(world);

      expect(world.electionCeremony?.reason).toBe('term');
      // The ceremony itself must survive — only the token is rewritten.
      expect(world.electionCeremony?.phase).toBe('gossip');
      expect(world.electionCeremony?.phaseTicksLeft).toBe(120);
    });

    it("leaves an already-current 'term' ceremony untouched", () => {
      const world = initGame({ villageName: 'W', size: 'medium' });
      world.electionCeremony = ceremony('term');

      validateVillageLeaderOnLoad(world);

      expect(world.electionCeremony?.reason).toBe('term');
    });

    it('still clears a corrupted ceremony instead of migrating it', () => {
      const world = initGame({ villageName: 'W', size: 'medium' });
      world.electionCeremony = { phase: 'nonsense' } as unknown as ElectionCeremonyState;

      validateVillageLeaderOnLoad(world);

      expect(world.electionCeremony).toBeNull();
    });
  });
});

/**
 * Regression: earned titles (Moonslayer, Howlerbane) grant an election merit
 * bonus — deeds speak in the vote. Two otherwise-identical candidates must be
 * separated by the title, and the title must show in the score breakdown and
 * the candidate's name.
 */
describe('villageLeadership.titlePoints.test.ts', () => {
  function stubHuman(id: number, overrides: Partial<Entity> = {}): Entity {
    return {
      id,
      type: EntityType.Human,
      x: 0,
      y: 0,
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
      name: 'Asha',
      surname: 'Reed',
      gender: 'female',
      isJuvenile: false,
      ...overrides,
    } as Entity;
  }

  /**
   * A deliberately partial `WorldState`: it carries only the fields the leadership owners read —
   * `entities`, `villageLeaderId`, `leaderSinceYear`, `year`, `dayInYear`, `tick`, `buildings`,
   * `resources`, `storageMax`, `tradeRoutes`, `villageReputation` and `humanPopulation`. Everything
   * else (`ecosystemHealth`, `disasters`, `eventLog`, `festival`, …) is absent because title scoring
   * never touches it: `getLeadershipScoreBreakdown` and `isEligibleForLeadership` are the only owners
   * exercised, and neither reads past the list above.
   */
  function stubState(entities: Entity[]): WorldState {
    return {
      entities,
      villageLeaderId: null,
      leaderSinceYear: 0,
      year: 5,
      dayInYear: 10,
      tick: 500,
      buildings: [],
      resources: { wood: 0, stone: 0, food: 0, gold: 0, iron: 0 },
      storageMax: { wood: 0, stone: 0, food: 0, gold: 0, iron: 0 },
      tradeRoutes: [],
      villageReputation: 0,
      humanPopulation: entities.length,
    } as unknown as WorldState;
  }

  describe('leadership title bonus', () => {
    it('a titled candidate gains +8 titlePoints in the score breakdown', () => {
      const hero = stubHuman(1, { title: 'Moonslayer' });
      const state = stubState([hero]);

      const breakdown = getLeadershipScoreBreakdown(state, hero);
      expect(breakdown.titlePoints).toBe(8);
      expect(breakdown.totalScore).toBe(breakdown.skillPoints + breakdown.experiencePoints + 8);
    });

    it('an untitled candidate gets no title bonus', () => {
      const plain = stubHuman(2);
      const breakdown = getLeadershipScoreBreakdown(stubState([plain]), plain);
      expect(breakdown.titlePoints).toBe(0);
    });

    it('the title decides between otherwise-identical candidates', () => {
      const hero = stubHuman(1, { title: 'Howlerbane', name: 'Ingrid', surname: 'Priestess' });
      const plain = stubHuman(2, { name: 'Bjorn', surname: 'Smith' });
      const state = stubState([hero, plain]);

      const ranked = rankLeadershipCandidates(state);
      expect(ranked[0]!.entityId).toBe(1);
      expect(ranked[0]!.totalScore).toBe(ranked[1]!.totalScore + 8);
    });

    it('the title shows after the candidate name', () => {
      expect(formatSettlerName(stubHuman(1, { title: 'Moonslayer' }))).toBe('Asha Reed Moonslayer');
      expect(formatSettlerName(stubHuman(2))).toBe('Asha Reed');
    });
  });
});

/**
 * A pending vacancy date must never outlive the seat it was scheduled for.
 *
 * Regression for audit H2 (`docs/private/audits/2026-09-16/sim-economy-leadership-combat.md`,
 * tracked in `LIVE-FINDINGS-STATUS.md`): a leader who dies or is imprisoned while a term ceremony
 * is running leaves behind the successor date that `tickLeaderVacancy` set for them. The ceremony
 * then fills the office with that date still armed — the panel announces a vacancy nobody has, and
 * `tryStartVacancyElectionCeremony` runs a *second* full ceremony for the filled seat. Worse, while
 * the stale date sits there `tickLeaderVacancy` early-returns (`:933`), so the next **real** vacancy
 * would never be scheduled at all.
 *
 * Three nodes are pinned, because the fix has three: the reveal that fills the office, the panel
 * status string, and the load-time repair for saves written by the buggy build.
 */
describe('villageLeadership.vacancy.test.ts', () => {
  function human(id: number, overrides: Partial<Entity> = {}): Entity {
    return {
      id,
      type: EntityType.Human,
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
      job: JobType.Settler,
      ...overrides,
    } as Entity;
  }

  function building(id: number, type: BuildingType, overrides: Partial<Building> = {}): Building {
    return {
      id,
      type,
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
      faction: 'player',
      ...overrides,
    } as Building;
  }

  function makeWorld(
    entities: Entity[],
    buildings: Building[],
    villageLeaderId: number | null = null,
    overrides: Partial<WorldState> = {},
  ): WorldState {
    return {
      entities,
      buildings,
      villageLeaderId,
      year: 5,
      dayInYear: 10,
      tick: 500,
      lastElectionYear: 4,
      pendingElectionYear: null,
      electionCeremony: null,
      eventLog: [],
      ...overrides,
    } as unknown as WorldState;
  }

  const YEAR = 5;
  /** The date a vacancy declared today (year 5, day 10) would be due. */
  const PENDING = YEAR + 10 / DAYS_PER_YEAR + VACANCY_ELECTION_DELAY_YEARS;

  describe('a pending vacancy date never outlives the seat', () => {
    it('the reveal clears the schedule when it installs a head', () => {
      const settler = human(1, { age: 40 });
      const manor = building(10, BuildingType.LeaderHouse, { occupants: [1] });
      const state = makeWorld([settler], [manor], null, { pendingElectionYear: PENDING });

      const result = runVillageElection(state, YEAR, 'succession');

      expect(result.leaderId).toBe(1);
      expect(getVillageLeader(state)?.id).toBe(1);
      expect(state.pendingElectionYear).toBeNull();
    });

    it('the panel never reports a vacancy while a head is acting', () => {
      const leader = human(1, { age: 40, occupation: LEADER_OCCUPATION });
      const state = makeWorld([leader], [], 1, { pendingElectionYear: PENDING });

      expect(getVillageLeader(state)?.id).toBe(1);
      expect(getElectionCeremonyStatus(state) ?? '').not.toContain('No village head');
    });

    it('loading a save with an acting head clears the stale date', () => {
      const leader = human(1, { age: 40, occupation: LEADER_OCCUPATION });
      const state = makeWorld([leader], [], 1, { pendingElectionYear: PENDING });

      validateVillageLeaderOnLoad(state);

      expect(state.pendingElectionYear).toBeNull();

      // Control: with no acting head the pending date is legitimate and must survive the load path,
      // or the load repair would silence a real vacancy.
      const dead = human(2, { age: 40, alive: false });
      const vacant = makeWorld([dead], [], 2, { pendingElectionYear: PENDING });
      validateVillageLeaderOnLoad(vacant);
      expect(vacant.pendingElectionYear).toBe(PENDING);
    });

    it('a stale date blocks every future vacancy, and clearing it restores scheduling', () => {
      const deadLeader = human(2, { age: 40, alive: false });
      const settler = human(3, { age: 40 });

      // What the buggy build left behind: the office is empty, and no vacancy can ever be scheduled.
      const blocked = makeWorld([deadLeader, settler], [], 2, { pendingElectionYear: PENDING });
      expect(tickLeaderVacancy(blocked)).toBeNull();
      expect(blocked.pendingElectionYear).toBe(PENDING);

      // Cleared — as the reveal and the load repair now do — the vacancy is scheduled again.
      const healed = makeWorld([deadLeader, settler], [], 2, { pendingElectionYear: null });
      const notice = tickLeaderVacancy(healed);
      expect(notice).not.toBeNull();
      expect(healed.pendingElectionYear).toBeCloseTo(PENDING, 5);
      expect(healed.villageLeaderId).toBeNull();
    });
  });

  describe('a vacant seat on load goes to an election', () => {
    it('arms the four-month by-election instead of appointing a pioneer', () => {
      // Year 0 is the founding stamp and a succession never rewrites it, so `lastElectionYear` stays 0
      // for the whole founding era. That is a real year, not "never elected": a vacant seat must be
      // decided by the scheduled election, not handed back to a pioneer with no vote.
      const deadHead = human(2, { age: 40, alive: false });
      const adult = human(3, { age: 40 });
      const state = makeWorld([deadHead, adult], [], 2, {
        pendingElectionYear: null,
        lastElectionYear: 0,
      });

      validateVillageLeaderOnLoad(state);

      expect(state.villageLeaderId).toBeNull();
      expect(state.pendingElectionYear).toBeCloseTo(PENDING, 5);
    });
  });
});
