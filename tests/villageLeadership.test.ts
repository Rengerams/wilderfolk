import { scenarioSettler, scenarioWorld } from './helpers/humanScenario';
import { resetSimRng } from '../src/game/simRng';
import { describe, expect, it, afterEach } from 'vitest';
import { DAYS_PER_YEAR, TICKS_PER_DAY, getColonyDay, killHuman, setHumanBirthFromAge } from '../src/game/dayCycle';
import { HUMAN_ADULT_MIN_AGE } from '../src/game/daycycleconstants';
import {
  BuildingType,
  EntityType,
  JobType,
  LEADER_OCCUPATION,
  MapSize,
  type Building,
  type ElectionCeremonyState,
  type Entity,
  type WorldState,
} from '../src/game/gameTypes';
import {
  VACANCY_ELECTION_DELAY_YEARS,
  formatSettlerName,
  getElectionCeremonyStatus,
  getElectionGatherSite,
  getElectionGatherTarget,
  getLeadershipScoreBreakdown,
  getVillageLeader,
  isActingVillageHead,
  isEligibleForLeadership,
  isVillageLeader,
  rankLeadershipCandidates,
  runVillageElection,
  tickElectionCeremony,
  tickLeaderVacancy,
  tryStartTermElectionCeremony,
  tryStartVacancyElectionCeremony,
  validateVillageLeaderOnLoad,
} from '../src/game/villageLeadership';
import { initGame } from '../src/game/worldGen';
import { friendCount } from '../src/game/relationships';
import { deterministicCos, deterministicSin } from '../src/game/simTrig';

/**
 * Village head must stay resolvable while in temporary Moon Howler form, so a Werewolf-form
 * incumbent does not fire a vacancy.
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
 * The two ceremony starters: a vacancy election reports `'succession'` (it is never a term election),
 * and a term election with no eligible candidate arms the same `pendingElectionYear` retry delay.
 */
describe('villageLeadership.electionGaps.test.ts', () => {
  const FIXTURE_SEED = 20_260_917;
  /** A term year (`ELECTION_INTERVAL_YEARS` is 2): the vacancy must still report `'succession'`. */
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
    const colonyDay = getColonyDay(state);
    for (const entity of state.entities) {
      if (entity.type === EntityType.Human && entity.faction == null) {
        setHumanBirthFromAge(entity, HUMAN_ADULT_MIN_AGE - 1, colonyDay);
      }
    }
  }

  describe('election scheduling (L3, L11)', () => {
    it('labels a vacancy that lands in a term year a succession', () => {
      const state = world();
      // A death armed the schedule for this very day; the term election for Year 2 is not what this is.
      state.pendingElectionYear = TERM_YEAR;

      expect(tryStartVacancyElectionCeremony(state, TERM_YEAR, 0)).toBe(true);

      // The label carries the date consequence: the reveal stamps `lastElectionYear` only for
      // `'term'`/`'founding'`, so a mid-term handover must report `'succession'`.
      expect(state.electionCeremony?.reason).toBe('succession');
    });

    it('keeps recorded ballots and election ID stable after candidate merits change', () => {
      const state = world();
      expect(tryStartTermElectionCeremony(state, TERM_YEAR, 0)).toBe(true);
      const ceremony = state.electionCeremony!;
      const electionId = ceremony.electionId;
      const tally = { ...ceremony.ballotTally };
      const ballots = ceremony.ballotTotal;
      const names = { ...ceremony.candidateNames };
      expect(Object.keys(names).length).toBeGreaterThan(0);
      for (const candidate of state.entities) {
        if (candidate.type === EntityType.Human) {
          candidate.skills = { farmer: 100 };
          candidate.name = 'Renamed after ballot';
        }
      }
      expect(state.electionCeremony?.ballotTally).toEqual(tally);
      const result = runVillageElection(state, TERM_YEAR, 'term');
      expect(state.lastElectionResult?.electionId).toBe(electionId);
      expect(state.lastElectionResult?.tally).toEqual(tally);
      expect(state.lastElectionResult?.candidateNames).toEqual(names);
      expect(state.lastElectionResult?.ballots).toBe(ballots);
      expect(state.lastElectionResult?.winnerId).toBe(result.leaderId);
    });

    it('credits only eligible ballots when every finalist became ineligible before the reveal', () => {
      const state = world();
      // Keep enough eligible adults that the race still has a lawful winner after the finalists fall.
      const template = state.entities.find((entity) => entity.type === EntityType.Human && !entity.faction);
      expect(template).toBeDefined();
      for (let index = 0; index < 6; index++) {
        const clone = structuredClone(template!);
        clone.id = state.nextEntityId++;
        clone.name = `Extra ${index}`;
        clone.surname = 'Vale';
        clone.age = 30 + index;
        clone.partnerId = undefined;
        state.entities.push(clone);
      }

      expect(tryStartTermElectionCeremony(state, TERM_YEAR, 0)).toBe(true);
      const ceremony = state.electionCeremony!;
      const finalists = ceremony.finalistIds ?? [];
      expect(finalists.length).toBeGreaterThan(0);
      for (const id of finalists) {
        const candidate = state.entities.find((entity) => entity.id === id);
        if (candidate) candidate.alive = false;
      }
      ceremony.phase = 'reveal';
      ceremony.phaseTicksLeft = 1;

      tickElectionCeremony(state, TERM_YEAR);

      const result = state.lastElectionResult!;
      expect(result).toBeDefined();
      expect(result.winnerId).not.toBeNull();
      expect(finalists).not.toContain(result.winnerId);
      // The displayed count is the sum of ballots still credited to an eligible nominee.
      expect(result.ballots).toBe(
        Object.values(result.tally).reduce((sum, count) => sum + count, 0),
      );
      expect(result.ballots).toBeGreaterThan(0);
      expect(Object.keys(result.tally).some((id) => finalists.includes(Number(id)))).toBe(false);
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
      // The failed term election arms the vacancy delay instead of waiting for the next term gate.
      expect(state.pendingElectionYear).toBeCloseTo(TERM_YEAR + VACANCY_ELECTION_DELAY_YEARS, 10);

      // And the retry really runs: restore adults and land on the armed day.
      const colonyDay = getColonyDay(state);
      for (const entity of state.entities) {
        if (entity.type === EntityType.Human && entity.faction == null) {
          setHumanBirthFromAge(entity, HUMAN_ADULT_MIN_AGE + 10, colonyDay);
        }
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
      // The office is re-contested on the vacancy rhythm, not re-attempted and logged every day.
      expect(state.pendingElectionYear).toBeCloseTo(TERM_YEAR + VACANCY_ELECTION_DELAY_YEARS, 10);

      // And the retry really runs once an adult is eligible again.
      const colonyDay = getColonyDay(state);
      for (const entity of state.entities) {
        if (entity.type === EntityType.Human && entity.faction == null) {
          setHumanBirthFromAge(entity, HUMAN_ADULT_MIN_AGE + 10, colonyDay);
        }
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
 * A save whose ceremony carries the legacy `'decennial'` reason loads as `'term'`; the rest of the
 * ceremony is untouched.
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
 * Earned titles (Moonslayer, Howlerbane) grant an election merit bonus, so two otherwise-identical
 * candidates are separated by the title in the score breakdown and in the candidate's name.
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
      constructionProgress: 100,
      completed: true,
      health: 100,
      maxHealth: 100,
      spriteScale: 1,
      buildAnimTimer: 0,
      ...overrides,
    } as Building;
  }

  /**
   * A deliberately partial `WorldState` carrying only the fields the leadership owners read; title
   * scoring never touches the rest.
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
      eventLog: [],
      disasters: [],
      ecosystemHealth: 80,
      resources: { wood: 0, stone: 0, food: 0, gold: 0, iron: 0 },
      storageMax: { wood: 0, stone: 0, food: 0, gold: 0, iron: 0 },
      tradeRoutes: [],
      villageReputation: 0,
      humanPopulation: entities.length,
    } as unknown as WorldState;
  }

  describe('leadership title bonus', () => {
    it('an honorary title gives a small bonus rather than deciding the election', () => {
      const hero = stubHuman(1, { title: 'Moonslayer' });
      const state = stubState([hero]);

      const breakdown = getLeadershipScoreBreakdown(state, hero);
      expect(breakdown.titlePoints).toBe(6);
      expect(breakdown.totalScore).toBe(breakdown.skillPoints + breakdown.contributionPoints + breakdown.experiencePoints + 6);
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
      expect(ranked[0]!.totalScore).toBe(ranked[1]!.totalScore + 6);
    });

    it('the title shows after the candidate name', () => {
      expect(formatSettlerName(stubHuman(1, { title: 'Moonslayer' }))).toBe('Asha Reed Moonslayer');
      expect(formatSettlerName(stubHuman(2))).toBe('Asha Reed');
    });
  });

  /**
   * A single capped skill cannot outweigh a lifetime of service, community standing and experience;
   * broad expertise is useful but capped, and incumbent penalties stay bounded.
   */
  describe('merit weighs a career, not only a capped skill', () => {
    const closeFriends = (count: number) =>
      Object.fromEntries(Array.from({ length: count }, (_, i) => [`f_${900 + i}`, 70]));

    it('a long-serving, well-liked veteran can outrank a capped farmer', () => {
      // 30 years of service, a Town Hall seat, 37 close friends and a spouse — a full career.
      const veteran = stubHuman(1, {
        age: 48,
        skills: { farmer: 20 },
        title: 'Moonslayer',
        relationshipStatus: 'married',
        friendships: closeFriends(37),
      });
      const farmer = stubHuman(2, { age: 30, skills: { farmer: 100 } });
      const hall = building(10, BuildingType.TownHall, { occupants: [1] });
      const state = stubState([veteran, farmer]);
      state.buildings = [hall];

      const veteranScore = getLeadershipScoreBreakdown(state, veteran);
      const farmerScore = getLeadershipScoreBreakdown(state, farmer);

      expect(friendCount(veteran)).toBe(37);
      expect(veteranScore.communityPoints).toBeGreaterThan(0);
      expect(veteranScore.totalScore).toBeGreaterThan(farmerScore.totalScore);
    });

    it('town hall assignment does not affect leadership merit', () => {
      const official = stubHuman(1, { age: 32, skills: { official: 30 } });
      const state = stubState([official]);
      const baseline = getLeadershipScoreBreakdown(state, official).totalScore;
      state.buildings = [building(10, BuildingType.TownHall, { occupants: [official.id] })];
      expect(getLeadershipScoreBreakdown(state, official).totalScore).toBe(baseline);
    });

    it('rewards verified battlefield achievements with a 100-point cap', () => {
      const fighter = stubHuman(1, { battleLeadershipMerit: 40 });
      const state = stubState([fighter]);
      const score = getLeadershipScoreBreakdown(state, fighter);
      expect(score.battlePoints).toBe(40);
      fighter.battleLeadershipMerit = 300;
      expect(getLeadershipScoreBreakdown(state, fighter).battlePoints).toBe(45);
    });

    it('gives established family names bounded popularity without awarding lone surnames', () => {
      const founder = stubHuman(1, { surname: 'Stone', generation: 1 });
      const parent = stubHuman(2, { surname: 'Stone', generation: 2 });
      const candidate = stubHuman(3, { surname: 'Stone', generation: 3 });
      const outsider = stubHuman(4, { surname: 'Other', generation: 1 });
      const state = stubState([founder, parent, candidate, outsider]);
      const family = getLeadershipScoreBreakdown(state, candidate);
      const unrelated = getLeadershipScoreBreakdown(state, outsider);
      expect(family.familyPoints).toBeGreaterThan(0);
      expect(family.familyPoints).toBeLessThanOrEqual(6);
      expect(unrelated.familyPoints).toBe(0);
    });

    it('applies the original leader promise record to election merit', () => {
      const leader = stubHuman(1, { promiseLeadershipMerit: 24 });
      const skeptic = stubHuman(2, { promiseLeadershipMerit: -32 });
      const state = stubState([leader, skeptic]);
      expect(getLeadershipScoreBreakdown(state, leader).promisePoints).toBe(24);
      expect(getLeadershipScoreBreakdown(state, skeptic).promisePoints).toBe(-30);
      leader.promiseLeadershipMerit = 90;
      skeptic.promiseLeadershipMerit = -100;
      expect(getLeadershipScoreBreakdown(state, leader).promisePoints).toBe(30);
      expect(getLeadershipScoreBreakdown(state, skeptic).promisePoints).toBe(-30);
    });

    it('one mastered trade beats inflated beginner skills, while a second specialty adds a little', () => {
      const specialist = stubHuman(1, { skills: { farmer: 100 } });
      const expert = stubHuman(2, { skills: { farmer: 100, miner: 100, hunter: 100 } });

      expect(getLeadershipScoreBreakdown(stubState([specialist]), specialist).skillPoints).toBe(24);
      expect(getLeadershipScoreBreakdown(stubState([expert]), expert).skillPoints).toBe(30);
    });

    it('rewards verified years of work, not an inherited collection of novice skills', () => {
      const veteran = stubHuman(1, {
        age: 35,
        skills: { farmer: 20 },
        careerHistory: { farmer: { days: 200, lastDay: 250 } },
      });
      const inflated = stubHuman(2, {
        age: 35,
        skills: Object.fromEntries(Object.values(JobType).map((job) => [job, 20])),
      });
      const state = stubState([veteran, inflated]);
      const actual = getLeadershipScoreBreakdown(state, veteran);
      const legacy = getLeadershipScoreBreakdown(state, inflated);
      expect(actual.contributionPoints).toBe(40);
      expect(legacy.contributionPoints).toBe(0);
      expect(actual.totalScore).toBeGreaterThan(legacy.totalScore);
    });

    it('does not reward an assigned job without witnessed career days', () => {
      const worker = stubHuman(1, { job: JobType.Farmer, workerBuildingId: 50 });
      expect(getLeadershipScoreBreakdown(stubState([worker]), worker).contributionPoints).toBe(0);
    });

    it('keeps a scandal measurably expensive for the incumbent', () => {
      const incumbent = stubHuman(1, { age: 40 });
      const state = stubState([incumbent]);
      state.villageLeaderId = 1;
      state.leaderSinceYear = 5;
      // Premise: a healthy colony under a clean incumbent, so the record term has something to lose.
      state.resources.food = 400;
      state.storageMax.food = 800;
      state.villageReputation = 60;
      state.tradeRoutes.push({ active: true } as never);
      const clean = getLeadershipScoreBreakdown(state, incumbent);

      state.eventLog.push({ year: 5, type: 'scandal', message: 'a scandal', entityName: 'Asha' } as never);
      const tainted = getLeadershipScoreBreakdown(state, incumbent);

      expect(clean.recordPoints, 'fixture premise: a healthy clean term scores positively').toBeGreaterThan(0);
      expect(tainted.recordPoints).toBeLessThan(clean.recordPoints);
      // Softened, not free: one scandal costs its own points and the clean-term bonus.
      expect(clean.recordPoints - tainted.recordPoints).toBeGreaterThanOrEqual(4);
    });

    it('caps repeated incumbent misconduct and poor records at -12 points', () => {
      const incumbent = stubHuman(1, { age: 40 });
      const state = stubState([incumbent]);
      state.villageLeaderId = 1;
      state.leaderSinceYear = 5;
      for (let i = 0; i < 20; i++) {
        state.eventLog.push({ year: 5, type: 'scandal', message: 'a scandal', entityName: 'Asha' } as never);
      }

      expect(getLeadershipScoreBreakdown(state, incumbent).recordPoints).toBe(-12);
    });

    it('keeps the ranking contract: score desc, then age desc, then id asc', () => {
      const lowId = stubHuman(1, { age: 30 });
      const youngTwin = stubHuman(2, { age: 31 });
      const oldTwin = stubHuman(3, { age: 31 });
      const state = stubState([lowId, youngTwin, oldTwin]);

      const ranked = rankLeadershipCandidates(state);

      expect(ranked.map((b) => b.entityId)).toEqual([2, 3, 1]);
    });
  });
});

/**
 * A pending vacancy date never outlives the seat it was scheduled for: the reveal that installs a
 * head clears it, the panel stops announcing a vacancy, and the load repair drops a stale one.
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

      // A stale date with an empty office: no vacancy can be scheduled while it stands.
      const blocked = makeWorld([deadLeader, settler], [], 2, { pendingElectionYear: PENDING });
      expect(tickLeaderVacancy(blocked)).toBeNull();
      expect(blocked.pendingElectionYear).toBe(PENDING);

      // Once cleared, the vacancy is scheduled again.
      const healed = makeWorld([deadLeader, settler], [], 2, { pendingElectionYear: null });
      const notice = tickLeaderVacancy(healed);
      expect(notice).not.toBeNull();
      expect(healed.pendingElectionYear).toBeCloseTo(PENDING, 5);
      expect(healed.villageLeaderId).toBeNull();
    });
  });

  describe('a vacant seat on load goes to an election', () => {
    it('arms the four-month by-election instead of appointing a pioneer', () => {
      // Year 0 is the founding stamp, so `lastElectionYear` stays 0 through the founding era: a
      // vacant seat is still decided by the scheduled election, not handed to a pioneer.
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

const FIXTURE_SEED = 20_260_921;
const GATHER_X = 600;
const GATHER_Y = 400;
const SLOTS_PER_RING = 12;
/** Radius of ring 0 — the first constant in the returned target (`22 + ring * 14`). */
const RING_0_RADIUS = 22;
const RING_STEP = 14;

function legacyGetElectionGatherTarget(state: WorldState, entityId: number): { x: number; y: number } {
  const c = state.electionCeremony;
  if (!c) return getElectionGatherSite(state);

  const attendees = state.entities
    .filter((entity) => isEligibleForLeadership(entity, state))
    .sort((a, b) => a.id - b.id);

  const slot = attendees.findIndex((entity) => entity.id === entityId);
  if (slot < 0) {
    const outerRing = Math.ceil(attendees.length / SLOTS_PER_RING);
    const angle = ((entityId * 17) % 360) * (Math.PI / 180);
    const ringRadius = RING_0_RADIUS + outerRing * RING_STEP + 28;
    return {
      x: c.gatherX + deterministicCos(angle) * ringRadius,
      y: c.gatherY + deterministicSin(angle) * ringRadius,
    };
  }

  const ring = Math.floor(slot / SLOTS_PER_RING);
  const angleSlot = slot % SLOTS_PER_RING;
  const angle = (angleSlot / SLOTS_PER_RING) * Math.PI * 2;
  const ringRadius = RING_0_RADIUS + ring * RING_STEP;

  return {
    x: c.gatherX + deterministicCos(angle) * ringRadius,
    y: c.gatherY + deterministicSin(angle) * ringRadius,
  };
}

/**
 * A settler line-up covering every eligibility shape: adults, a child, a sub-adult, a prisoner, a
 * foreign rival and a corpse, with ids out of array order so an id-sorted slot cannot coincide.
 */
function gatherWorld(): WorldState {
  const world = initGame({ villageName: 'Gather', size: MapSize.Medium, seed: FIXTURE_SEED });
  const template = world.entities.find((e) => e.type === EntityType.Human);
  if (!template) throw new Error('initGame produced no settler to use as the fixture template');
  const colonyDay = getColonyDay(world);

  const settle = (
    id: number,
    ageYears: number,
    overrides: Partial<Entity> = {},
  ): Entity => {
    const entity: Entity = { ...template, id, ...overrides };
    setHumanBirthFromAge(entity, ageYears, colonyDay);
    entity.age = ageYears;
    entity.isJuvenile = ageYears < 12;
    return entity;
  };

  const humans: Entity[] = [
    settle(29, 41),
    settle(7, 22),
    settle(13, 34),
    settle(2, 19),
    settle(53, 55),
    settle(23, 30),
    settle(5, 27),
    settle(41, 17), // below HUMAN_ADULT_MIN_AGE (18)
    settle(3, 8), // a child
    settle(31, 38),
    settle(11, 45, { prisonBuildingId: 900 }), // imprisoned — excluded
    settle(47, 33, { faction: 'rival', groupId: 'R1' }), // not a player settler
    settle(37, 29, { alive: false }),
    settle(19, 24),
    settle(43, 61),
    settle(59, 26),
    settle(61, 36),
    settle(67, 48),
    settle(71, 20),
    settle(73, 39),
  ];

  world.entities = humans;
  world.electionCeremony = {
    phase: 'gathering',
    phaseTicksLeft: 10,
    gatherX: GATHER_X,
    gatherY: GATHER_Y,
    reason: 'term',
    pendingLeaderId: 7,
    pendingLeaderName: 'Fixture',
    pendingChanged: false,
  };
  return world;
}

/** Ids of the fixture's eligible settlers, ascending — what the old filter+sort produced. */
function eligibleIds(state: WorldState): number[] {
  return state.entities.filter((e) => isEligibleForLeadership(e, state)).map((e) => e.id).sort((a, b) => a - b);
}

describe('election gather slot (N-5)', () => {
  it('puts every id in the slot its position in the id-sorted attendee list gives it', () => {
    const state = gatherWorld();
    const attendees = eligibleIds(state);

    // Fixture sanity: 20 settlers, 15 eligible — past one ring of 12, so the ring maths is exercised.
    expect(attendees).toEqual([2, 5, 7, 13, 19, 23, 29, 31, 43, 53, 59, 61, 67, 71, 73]);

    for (let id = 0; id <= 80; id++) {
      expect(getElectionGatherTarget(state, id)).toEqual(legacyGetElectionGatherTarget(state, id));
    }

    // Slots are pinned, not merely the set: slot 0 sits on +x at ring 0, slot 12 opens ring 1.
    expect(getElectionGatherTarget(state, 2)).toEqual({ x: GATHER_X + RING_0_RADIUS, y: GATHER_Y });
    expect(attendees.indexOf(19)).toBe(4);
    expect(attendees.indexOf(13)).toBe(3);
    expect(getElectionGatherTarget(state, 13)).toEqual({
      x: GATHER_X + RING_0_RADIUS * deterministicCos((3 / SLOTS_PER_RING) * Math.PI * 2),
      y: GATHER_Y + RING_0_RADIUS * deterministicSin((3 / SLOTS_PER_RING) * Math.PI * 2),
    });
    // Slot 12 is the first seat of ring 1 — the boundary the ring maths turns on.
    expect(attendees.indexOf(61)).toBe(11);
    expect(attendees.indexOf(67)).toBe(12);
    expect(getElectionGatherTarget(state, 67)).toEqual({ x: GATHER_X + RING_0_RADIUS + RING_STEP, y: GATHER_Y });
    expect(getElectionGatherTarget(state, 73)).toEqual({
      x: GATHER_X + (RING_0_RADIUS + RING_STEP) * deterministicCos((2 / SLOTS_PER_RING) * Math.PI * 2),
      y: GATHER_Y + (RING_0_RADIUS + RING_STEP) * deterministicSin((2 / SLOTS_PER_RING) * Math.PI * 2),
    });
  });

  it('gives the same slot whatever order the attendees sit in `state.entities`', () => {
    const state = gatherWorld();
    const inArrayOrder = [...state.entities];
    const expected = new Map(inArrayOrder.map((e) => [e.id, legacyGetElectionGatherTarget(state, e.id)]));

    state.entities = [...inArrayOrder].reverse();
    for (const entity of inArrayOrder) {
      expect(getElectionGatherTarget(state, entity.id)).toEqual(expected.get(entity.id));
    }

    // A shuffled order too — the sort made the slot a pure function of the surviving set.
    state.entities = [...inArrayOrder].sort((a, b) => (a.id * 7919) % 101 - (b.id * 7919) % 101);
    for (const entity of inArrayOrder) {
      expect(getElectionGatherTarget(state, entity.id)).toEqual(expected.get(entity.id));
    }
  });

  it('follows the attendee set when a settler dies between two calls', () => {
    const state = gatherWorld();
    const seat = (slot: number): { x: number; y: number } => ({
      x: GATHER_X + RING_0_RADIUS * deterministicCos((slot / SLOTS_PER_RING) * Math.PI * 2),
      y: GATHER_Y + RING_0_RADIUS * deterministicSin((slot / SLOTS_PER_RING) * Math.PI * 2),
    });
    const before = getElectionGatherTarget(state, 53);
    expect(before).toEqual(seat(9));
    expect(before).toEqual(legacyGetElectionGatherTarget(state, 53));
    // Id 2 is the lowest eligible id, so every other attendee sits one slot further out.
    expect(eligibleIds(state).indexOf(53)).toBe(9);
    expect(getElectionGatherTarget(state, 2)).toEqual({ x: GATHER_X + RING_0_RADIUS, y: GATHER_Y });

    // The real mid-loop death path: `tickHumans` calls exactly this for an exhausted settler.
    const victim = state.entities.find((e) => e.id === 2)!;
    killHuman(victim, state.buildings, new Map(state.entities.map((e) => [e.id, e])), state.tick);

    expect(eligibleIds(state).indexOf(53)).toBe(8);
    expect(getElectionGatherTarget(state, 53)).toEqual(seat(8));
    expect(getElectionGatherTarget(state, 53)).not.toEqual(before);
    expect(getElectionGatherTarget(state, 53)).toEqual(legacyGetElectionGatherTarget(state, 53));
    // …and the survivors stay in step with the oracle for every id, not just the probed one.
    for (let id = 0; id <= 80; id++) {
      expect(getElectionGatherTarget(state, id)).toEqual(legacyGetElectionGatherTarget(state, id));
    }
  });

  it('falls back to the outer ring for a non-attendee, counted from the live attendees', () => {
    const state = gatherWorld();
    // 37 is dead and 41 is under the adult floor: both take the outer-ring branch.
    expect(isEligibleForLeadership(state.entities.find((e) => e.id === 37)!, state)).toBe(false);
    expect(isEligibleForLeadership(state.entities.find((e) => e.id === 41)!, state)).toBe(false);

    const outerRing = Math.ceil(eligibleIds(state).length / SLOTS_PER_RING);
    const ringRadius = RING_0_RADIUS + outerRing * RING_STEP + 28;
    const angle37 = ((37 * 17) % 360) * (Math.PI / 180);
    expect(getElectionGatherTarget(state, 37)).toEqual({
      x: GATHER_X + deterministicCos(angle37) * ringRadius,
      y: GATHER_Y + deterministicSin(angle37) * ringRadius,
    });
    expect(getElectionGatherTarget(state, 41)).toEqual(legacyGetElectionGatherTarget(state, 41));

    // With no ceremony the site itself is the answer — the branch this pass must not change.
    state.electionCeremony = null;
    expect(getElectionGatherTarget(state, 41)).toEqual(getElectionGatherSite(state));
  });

  it('keeps the ceremony-free and empty-world answers', () => {
    const empty = gatherWorld();
    empty.entities = [];
    expect(eligibleIds(empty)).toEqual([]);
    for (const id of [0, 1, 2, 41, 70]) {
      expect(getElectionGatherTarget(empty, id)).toEqual(legacyGetElectionGatherTarget(empty, id));
    }
  });
});

describe('Leader load reconciliation', () => {
  afterEach(resetSimRng);

  describe('L75 — load reconciliation drops a dangling leader id', () => {
    it('clears the dead leader id and still schedules the vacancy election', () => {
      const state = scenarioWorld();
      const dead = scenarioSettler(1, { alive: false, age: 60 });
      state.entities = [dead];
      state.villageLeaderId = dead.id;
      state.lastElectionYear = 1;
      state.pendingElectionYear = null;

      validateVillageLeaderOnLoad(state);

      expect(state.villageLeaderId).toBeNull();
      expect(state.pendingElectionYear).not.toBeNull();
    });

    it('keeps a jailed leader in office (office survives prison)', () => {
      const state = scenarioWorld();
      const leader = scenarioSettler(1, { prisonBuildingId: 9, occupation: 'leader' });
      state.entities = [leader];
      state.villageLeaderId = leader.id;
      state.lastElectionYear = 1;

      validateVillageLeaderOnLoad(state);

      expect(state.villageLeaderId).toBe(leader.id);
    });
  });
});
