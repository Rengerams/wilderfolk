/**
 * Low-severity audit batch 8 — regression tests for the findings fixed in this change.
 *
 *   - L8  buildingStaffingActions: `removeStaffWorkerFromBuilding` refuses a settler
 *         who does not work at the targeted building (it used to free their real job).
 *   - L39 humanTick: ambient dialogue rolls on the same SOCIAL_STAGGER bucket as the
 *         neighbour scan, so a roll never samples an always-empty candidate list.
 *   - L40 humanTick: imprisoned settlers keep their per-tick upkeep (dialogue timers,
 *         energy/meals, pregnancy progress) instead of freezing at the early return.
 *   - L41 humanTick: the realtime affair gate receives the colony work schedule.
 *   - L42 humanTick: company-following leisure blends velocity exactly once.
 *   - L60 humanRelationships: `reassignDivorcedResidences` leaves an imprisoned
 *         custodian unhoused and never moves minors into a prisoner's home.
 *   - L61 humanRelationships: the amicable-divorce rate has one definition.
 *   - L62 humanRelationships: the caught-in-the-act path is the only 'caught' path,
 *         so its deterministic divorce is the intended surviving contract.
 *   - L75 villageLeadership: load reconciliation clears a dangling `villageLeaderId`.
 *   - L76 groupEvents/virtualPlayer: one Village Request eligibility rule.
 *   - L78 workforce: an imprisoned settler is detached from construction crews.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { BuildingType, EntityType, JobType, Season, WeatherType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import type { TickContext } from '../src/game/simulation/simulationTypes';
import { DAYS_PER_YEAR, PER_TICK_RATE_SCALE, TICKS_PER_DAY, TICKS_PER_HOUR, getHourOfDay } from '../src/game/dayCycleClock';
import { personDayRoll, prefersHomeTonightFor } from '../src/game/humanSchedule';
import { resetSimRng, seededRandomForRun, setSimSeed } from '../src/game/simRng';
import { isPlayerHuman } from '../src/game/playerHuman';
import { initGame } from '../src/game/worldGen';
import { SOCIAL_STAGGER } from '../src/game/adaptiveSpatialQuery';
import { removeStaffWorkerFromBuilding } from '../src/game/buildingStaffingActions';
import { prepareWorkforce } from '../src/game/workforce';
import { tickHumans } from '../src/game/humanTick';
import { exposeAffair, MARRIAGE_ANNUAL_AMICABLE_DIVORCE_RATE, tryDailyAmicableDivorce } from '../src/game/simulation/humanRelationships';
import { validateVillageLeaderOnLoad } from '../src/game/villageLeadership';
import { getVillageRequestEligibility, resolveVillageRequest } from '../src/game/groupEvents';
import { decideVirtualPlayerAction } from '../src/game/virtualPlayer';

const TEST_SEED = 20_260_101;

/** A fully-formed settler prototype, so tests do not hand-build a partial Entity. */
let settlerPrototype: Entity | undefined;

function baseSettler(): Entity {
  if (!settlerPrototype) {
    const probe = initGame({ seed: 4242 });
    const found = probe.entities.find((e) => isPlayerHuman(e) && !e.isJuvenile && e.alive);
    if (!found) throw new Error('worldGen produced no settler to use as a test prototype');
    settlerPrototype = found;
  }
  return structuredClone(settlerPrototype);
}

function settler(id: number, overrides: Partial<Entity> = {}): Entity {
  return Object.assign(baseSettler(), {
    id,
    alive: true,
    isJuvenile: false,
    age: 30,
    energy: 90,
    maxEnergy: 100,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    flash: 0,
    faction: undefined,
    occupation: 'settler',
    job: JobType.Settler,
    homeBuildingId: undefined,
    residenceBuildingId: undefined,
    prisonBuildingId: undefined,
    relationshipStatus: 'single',
    partnerId: undefined,
    affairPartnerId: undefined,
    affairProgress: 0,
    prisonSentenceCrime: undefined,
    prisonerUntilTick: undefined,
  }, overrides);
}

function building(id: number, type: BuildingType, overrides: Partial<Building> = {}): Building {
  return {
    id,
    type,
    completed: true,
    faction: undefined,
    occupants: [],
    x: 0,
    y: 0,
    width: 40,
    height: 40,
    ...overrides,
  } as unknown as Building;
}

/** Full valid world from worldGen, stripped of its own colony for the scenario. */
function newWorld(): WorldState {
  const state = initGame({ seed: TEST_SEED });
  state.entities = [];
  state.buildings = [];
  state.visitorGroups = [];
  state.pendingRaidEvents = [];
  state.pendingOutgoingRaidEvents = [];
  state.pendingDiplomacyEvents = [];
  state.pendingStoryEvents = [];
  state.electionCeremony = null;
  state.pendingElectionYear = null;
  state.resources.food = 100;
  state.resources.gold = 100;
  state.weather = WeatherType.Clear;
  // Mid-day, away from the new-calendar-day boundary so daily rules stay out of the way.
  state.tick = TICKS_PER_DAY + 12 * TICKS_PER_HOUR;
  return state;
}

function contextFor(state: WorldState, humans: Entity[]): TickContext {
  return {
    width: state.width,
    height: state.height,
    hourOfDay: getHourOfDay(state.tick),
    season: Season.Spring,
    grassMult: 1,
    reproMult: 1,
    winterPenalty: 0,
    canHeat: true,
    byType: { [EntityType.Human]: humans } as unknown as TickContext['byType'],
    aliveEntities: humans,
    newEntities: [],
    updatedBuildings: state.buildings,
    roadBuildings: [],
    playerHumans: humans.filter(isPlayerHuman),
    entityById: new Map(humans.map((h) => [h.id, h])),
    buildingById: new Map(state.buildings.map((b) => [b.id, b])),
    predators: [],
  };
}

afterEach(() => {
  resetSimRng();
});

describe('L8 — removal targets the settler\'s own building', () => {
  it('leaves a settler who works elsewhere assigned to their real workplace', () => {
    const state = newWorld();
    const church = building(1, BuildingType.Church);
    const school = building(2, BuildingType.School);
    state.buildings = [church, school];
    const worker = settler(10, { homeBuildingId: church.id, job: JobType.Priest, occupation: 'priest' });
    church.occupants = [worker.id];
    state.entities = [worker];

    const next = removeStaffWorkerFromBuilding(state, school.id, worker.id);

    // Pre-fix `removeWorkerTransition` released the priest from the church even though
    // the command named the school; the settler must still hold the church job.
    const nextWorker = next.entities.find((e) => e.id === worker.id)!;
    expect(nextWorker.homeBuildingId).toBe(church.id);
    expect(next.buildings.find((b) => b.id === church.id)!.occupants).toContain(worker.id);
  });

  it('still detaches a settler from the building they actually work at', () => {
    const state = newWorld();
    const church = building(1, BuildingType.Church);
    state.buildings = [church];
    const worker = settler(10, { homeBuildingId: church.id, job: JobType.Priest, occupation: 'priest' });
    church.occupants = [worker.id];
    state.entities = [worker];

    const next = removeStaffWorkerFromBuilding(state, church.id, worker.id);

    const nextWorker = next.entities.find((e) => e.id === worker.id)!;
    expect(nextWorker.homeBuildingId).toBeUndefined();
    expect(next.buildings.find((b) => b.id === church.id)!.occupants).not.toContain(worker.id);
  });
});

describe('L39 — ambient dialogue cadence', () => {
  /** Quiet-at-home settler (no commute, no leisure) whose ambient roll passes. */
  function quietAmbientTick(id: number, aligned: boolean): number {
    for (let day = 1; day < 5000; day++) {
      for (let slot = 0; slot < TICKS_PER_DAY; slot++) {
        const tick = day * TICKS_PER_DAY + slot;
        const bucket = (tick + id) % SOCIAL_STAGGER;
        if (aligned ? bucket !== 0 : bucket === 0) continue;
        if (!aligned && (tick + id) % 3 !== 0) continue;
        const hour = getHourOfDay(tick);
        if (hour < 5 || hour >= 20) continue;
        if (!prefersHomeTonightFor({ startHour: 20, endHour: 23 }, id, tick, hour)) continue;
        if (seededRandomForRun(`chat-ambient:${id}:${tick}`) > 0.036 * PER_TICK_RATE_SCALE) continue;
        return tick;
      }
    }
    throw new Error('no ambient dialogue tick found');
  }

  function runAmbient(tick: number): { speaker: Entity; peer: Entity } {
    const state = newWorld();
    state.tick = tick;
    state.workSchedule = { startHour: 20, endHour: 23 };
    const speaker = settler(1, { x: 0, y: 0, gender: 'male', relationshipStatus: 'married', partnerId: 999 });
    const peer = settler(2, { x: 10, y: 0, gender: 'female', relationshipStatus: 'married', partnerId: 998 });
    state.entities = [speaker, peer];
    setSimSeed(TEST_SEED);
    tickHumans(state, contextFor(state, [speaker, peer]));
    return { speaker, peer };
  }

  /** The ambient roll for the observed settler must actually pass on the chosen tick. */
  function expectRollPasses(id: number, tick: number): void {
    setSimSeed(TEST_SEED);
    expect(seededRandomForRun(`chat-ambient:${id}:${tick}`)).toBeLessThanOrEqual(0.036 * PER_TICK_RATE_SCALE);
  }

  it('never rolls ambient dialogue on a tick the neighbour scan skips', () => {
    setSimSeed(TEST_SEED);
    const tick = quietAmbientTick(1, false);
    expect((tick + 1) % SOCIAL_STAGGER).not.toBe(0);
    expect((tick + 1) % 3).toBe(0);
    expectRollPasses(1, tick);

    const { speaker } = runAmbient(tick);

    // Pre-fix `(tick + id) % 3` ran the ambient roll on a bucket the neighbour scan
    // rejects, so a nearby peer was invisible and the settler spoke a solo line.
    expect(speaker.chatPhrase).toBeUndefined();
    expect(speaker.chatDialogueSessionKey).toBeUndefined();
  });

  it('still pairs with a nearby settler on the aligned bucket', () => {
    setSimSeed(TEST_SEED);
    const tick = quietAmbientTick(1, true);
    expect((tick + 1) % SOCIAL_STAGGER).toBe(0);
    expectRollPasses(1, tick);

    const { speaker, peer } = runAmbient(tick);

    expect(speaker.chatPartnerId).toBe(peer.id);
  });
});

describe('L40 — prisoner upkeep', () => {
  it('advances a jailed settler\'s dialogue timer instead of freezing it', () => {
    const state = newWorld();
    const prison = building(9, BuildingType.Prison, { x: 100, y: 100 });
    state.buildings = [prison];
    const prisoner = settler(1, {
      x: 100,
      y: 100,
      prisonBuildingId: prison.id,
      chatPhrase: 'Let me out.',
      chatTicks: 6,
    });
    prison.occupants = [prisoner.id];
    state.entities = [prisoner];

    tickHumans(state, contextFor(state, [prisoner]));

    // Pre-fix the prisoner branch `continue`d before `tickHumanChat`, so the timer froze.
    expect(prisoner.chatTicks).toBe(5);
    expect(prisoner.chatPhrase).toBe('Let me out.');
  });
});

describe('L41 — realtime affair gate honours the colony work schedule', () => {
  /** First in-game noon that keeps the settler home on the evening work window. */
  function noonTick(): number {
    for (let day = 1; day < 5000; day++) {
      const tick = day * TICKS_PER_DAY + 12 * TICKS_PER_HOUR;
      if (prefersHomeTonightFor({ startHour: 20, endHour: 23 }, 1, tick, 12)) return tick;
    }
    throw new Error('no noon tick found');
  }

  function affairScene(tick: number, startHour: number, endHour: number): Entity {
    const state = newWorld();
    state.tick = tick;
    state.workSchedule = { startHour, endHour };
    const farm = building(1, BuildingType.Farm, { x: -220, y: 0 });
    const farmHand = settler(1, {
      x: 0,
      y: 0,
      gender: 'male',
      relationshipStatus: 'married',
      partnerId: 999, // absent spouse: the gate only depends on the schedule
      homeBuildingId: farm.id,
      job: JobType.Farmer,
      occupation: 'farmer',
    });
    farm.occupants = [farmHand.id];
    const lover = settler(2, {
      x: 200,
      y: 0,
      gender: 'female',
      relationshipStatus: 'married',
      partnerId: 998,
      affairPartnerId: farmHand.id,
    });
    farmHand.affairPartnerId = lover.id;
    state.buildings = [farm];
    state.entities = [farmHand, lover];
    setSimSeed(TEST_SEED);
    tickHumans(state, contextFor(state, [farmHand, lover]));
    return farmHand;
  }

  it('does not open the affair gate when the schedule excludes the hour', () => {
    setSimSeed(TEST_SEED);
    const tick = noonTick();

    // Player schedule 20:00-23:00 excludes noon: the legacy 07:00-16:00 fallback used
    // to open the gate here and sent the settler to the tryst anyway.
    const farmHand = affairScene(tick, 20, 23);

    expect(farmHand.vx).toBe(0);
    expect(farmHand.vy).toBe(0);
  });

  it('opens the gate when the schedule covers the hour', () => {
    setSimSeed(TEST_SEED);
    const tick = noonTick();
    const farmHand = affairScene(tick, 7, 16);

    // Moving right, toward the lover — the gate is open for a covered hour.
    expect(farmHand.vx).toBeGreaterThan(0);
  });
});

describe('L42 — company-following leisure blends velocity once', () => {
  /** Ticks whose deterministic rolls put the settler on the spouse-following branch. */
  function companyFollowTicks(): number[] {
    const ticks: number[] = [];
    for (let day = 1; day < 5000 && ticks.length < 8; day++) {
      const tick = day * TICKS_PER_DAY + 15 * TICKS_PER_HOUR;
      const leisureSlotPeriod = 80 * TICKS_PER_HOUR;
      const leisureSlot = Math.floor(tick / leisureSlotPeriod + 1 * 3); // entity id 1
      if (personDayRoll(1, tick, 510 + leisureSlot) >= 0.4) continue;
      if (personDayRoll(1, tick, 520 + leisureSlot) >= 0.78) continue;
      ticks.push(tick);
    }
    if (ticks.length === 0) throw new Error('no company-following leisure tick found');
    return ticks;
  }

  function runCompanyFollow(tick: number, previousVx: number): number {
    const state = newWorld();
    state.tick = tick;
    const speaker = settler(1, {
      x: 0,
      y: 0,
      vx: previousVx,
      gender: 'male',
      relationshipStatus: 'married',
      partnerId: 2,
    });
    const spouse = settler(2, { x: 200, y: 0, gender: 'female', relationshipStatus: 'married', partnerId: 1 });
    state.entities = [speaker, spouse];
    setSimSeed(TEST_SEED);
    tickHumans(state, contextFor(state, [speaker, spouse]));
    return speaker.vx;
  }

  it('weights the previous velocity at 0.5 like every other leisure kind', () => {
    setSimSeed(TEST_SEED);
    const deltas = companyFollowTicks()
      .map((tick) => runCompanyFollow(tick, 20) - runCompanyFollow(tick, 0));

    // Pre-fix the branch blended 0.45/0.55 and the shared tail blended 0.5/0.5 again,
    // weighting the previous velocity at 0.225. Only a single 0.5 blend is correct.
    expect(deltas.some((delta) => Math.abs(delta - 10) < 1e-9)).toBe(true);
  });
});

describe('L60 — imprisoned custodian in a caught-affair divorce', () => {
  function caughtScandal(state: WorldState, entities: Entity[]): void {
    exposeAffair(
      state,
      entities.find((e) => e.id === 10)!,
      entities.find((e) => e.id === 12)!,
      'caught',
      new Map(entities.map((e) => [e.id, e])),
      state.buildings,
      entities.filter(isPlayerHuman),
    );
  }

  function scandalWorld(): { state: WorldState; cheater: Entity; child: Entity; spouse: Entity } {
    const state = newWorld();
    // No staffed prison: `arrestForScandal` returns before its roll, so the cheater
    // stays in the sentence the scenario already gave them.
    const houseA = building(1, BuildingType.House, { x: 0, y: 0 });
    const houseB = building(2, BuildingType.House, { x: 80, y: 0 });
    const prison = building(9, BuildingType.Prison, { x: 300, y: 300 });
    const cheater = settler(10, {
      gender: 'female',
      relationshipStatus: 'married',
      partnerId: 11,
      prisonBuildingId: prison.id,
      prisonSentenceCrime: 'scandal',
      prisonerUntilTick: state.tick + 500,
    });
    const spouse = settler(11, { gender: 'male', relationshipStatus: 'married', partnerId: 10, residenceBuildingId: houseB.id });
    const paramour = settler(12, { gender: 'male', relationshipStatus: 'single' });
    const child = settler(13, {
      isJuvenile: true,
      age: 6,
      motherId: cheater.id,
      fatherId: spouse.id,
      residenceBuildingId: houseB.id,
    });
    prison.occupants = [cheater.id];
    houseB.occupants = [cheater.id, spouse.id, child.id];
    state.buildings = [houseA, houseB, prison];
    state.entities = [cheater, spouse, paramour, child];
    state.tick = TICKS_PER_DAY + 10 * TICKS_PER_HOUR;
    return { state, cheater, child, spouse };
  }

  it('leaves the imprisoned custodian unhoused and keeps minors out of the cell home', () => {
    const { state, cheater, child, spouse } = scandalWorld();
    caughtScandal(state, state.entities);

    // The cheater is the female parent, so they are the custody holder — and they are
    // in prison. Pre-fix they were re-housed into an empty house and the child followed.
    expect(cheater.residenceBuildingId).toBeUndefined();
    expect(child.residenceBuildingId).toBe(2);
    // The freed spouse is still relocated out of the former shared home.
    expect(spouse.residenceBuildingId).toBe(1);
  });
});

describe('L61 — amicable-divorce rate has one definition', () => {
  function runDivorce(roll: number): { husband: Entity; wife: Entity } {
    const state = newWorld();
    const house = building(1, BuildingType.House);
    const husband = settler(1, { gender: 'male', relationshipStatus: 'married', partnerId: 2, residenceBuildingId: house.id });
    const wife = settler(2, { gender: 'female', relationshipStatus: 'married', partnerId: 1, residenceBuildingId: house.id });
    state.buildings = [house];
    state.entities = [husband, wife];
    const villagers = [husband, wife];
    tryDailyAmicableDivorce(state, husband, new Map(villagers.map((e) => [e.id, e])), state.buildings, villagers, () => roll);
    return { husband, wife };
  }

  it('drives the daily rule from the surviving exported annual rate', () => {
    const daily = MARRIAGE_ANNUAL_AMICABLE_DIVORCE_RATE / DAYS_PER_YEAR;

    // The deleted `RELATIONSHIP_CONFIG` copy was unread; the rate the daily rule reads
    // is the exported owner value, so a roll just under it still divorces.
    const divorced = runDivorce(daily - 1e-9);
    expect(divorced.husband.partnerId).toBeUndefined();
    expect(divorced.wife.partnerId).toBeUndefined();

    const kept = runDivorce(daily + 1e-9);
    expect(kept.husband.partnerId).toBe(2);
    expect(kept.wife.partnerId).toBe(1);
  });
});

describe('L62 — caught-in-the-act divorce is the only caught path', () => {
  /** A colony day whose caught-divorce roll sits above the 0.7 soft chance. */
  function tickAboveSoftChance(cheaterId: number): number {
    for (let day = 1; day < 5000; day++) {
      const tick = day * TICKS_PER_DAY + 10 * TICKS_PER_HOUR;
      if (personDayRoll(cheaterId, tick, 608) >= 0.7) return tick;
    }
    throw new Error('no tick above the soft divorce chance');
  }

  it('divorces deterministically on "caught" and never on gossip "rumor"', () => {
    const state = newWorld();
    const house = building(2, BuildingType.House);
    const prison = building(9, BuildingType.Prison, { x: 300, y: 300 });
    const cheater = settler(10, {
      gender: 'female',
      relationshipStatus: 'married',
      partnerId: 11,
      prisonBuildingId: prison.id,
      prisonSentenceCrime: 'scandal',
      prisonerUntilTick: state.tick + 500,
    });
    const spouse = settler(11, { gender: 'male', relationshipStatus: 'married', partnerId: 10, residenceBuildingId: house.id });
    const paramour = settler(12, { gender: 'male', relationshipStatus: 'single' });
    paramour.affairPartnerId = cheater.id;
    cheater.affairPartnerId = paramour.id;
    prison.occupants = [cheater.id];
    state.buildings = [house, prison];
    state.entities = [cheater, spouse, paramour];
    state.tick = tickAboveSoftChance(cheater.id);

    const entityById = new Map(state.entities.map((e) => [e.id, e]));
    const playerHumans = state.entities.filter(isPlayerHuman);

    // Gossip exposure never reaches the divorce rule.
    exposeAffair(state, cheater, paramour, 'rumor', entityById, state.buildings, playerHumans);
    expect(spouse.partnerId).toBe(10);
    expect(cheater.partnerId).toBe(11);

    // A witnessed caught-in-the-act divorce ignores the 0.7 soft chance entirely:
    // only `tryExposeCaughtAffair` can pass 'caught', and it requires a witness first.
    expect(personDayRoll(cheater.id, state.tick, 608)).toBeGreaterThanOrEqual(0.7);
    cheater.affairPartnerId = paramour.id;
    paramour.affairPartnerId = cheater.id;
    cheater.scandalCooldownUntilTick = undefined;
    paramour.scandalCooldownUntilTick = undefined;
    exposeAffair(state, cheater, paramour, 'caught', entityById, state.buildings, playerHumans);
    expect(spouse.partnerId).toBeUndefined();
    expect(cheater.partnerId).toBeUndefined();
  });
});

describe('L75 — load reconciliation drops a dangling leader id', () => {
  it('clears the dead leader id and still schedules the vacancy election', () => {
    const state = newWorld();
    const dead = settler(1, { alive: false, age: 60 });
    state.entities = [dead];
    state.villageLeaderId = dead.id;
    state.lastElectionYear = 1;
    state.pendingElectionYear = null;

    validateVillageLeaderOnLoad(state);

    expect(state.villageLeaderId).toBeNull();
    expect(state.pendingElectionYear).not.toBeNull();
  });

  it('keeps a jailed leader in office (office survives prison)', () => {
    const state = newWorld();
    const leader = settler(1, { prisonBuildingId: 9, occupation: 'leader' });
    state.entities = [leader];
    state.villageLeaderId = leader.id;
    state.lastElectionYear = 1;

    validateVillageLeaderOnLoad(state);

    expect(state.villageLeaderId).toBe(leader.id);
  });
});

describe('L76 — one Village Request eligibility rule', () => {
  function requestWorld(gold: number, food: number) {
    const state = newWorld();
    state.resources.gold = gold;
    const trader = {
      id: 'trader-1',
      kind: 'traders',
      daysLeft: 5,
      name: 'Trailhands',
      campX: 20,
      campY: 20,
    } as unknown as WorldState['visitorGroups'][number];
    state.visitorGroups = [trader];
    state.activeVillageRequest = {
      id: 'vreq_1',
      kind: 'caravan_provisions',
      sourceVisitorGroupId: trader.id,
      sourceName: trader.name,
      emoji: '🥣',
      title: 'Caravan Provisions Offer',
      description: 'Test offer',
      choices: [
        { id: 'accept', label: 'Accept provisions', detail: 'Pay gold' },
        { id: 'decline', label: 'Decline politely', detail: 'Lose reputation' },
      ],
      expiresDay: 100,
    };
    state.resources.food = food;
    return state;
  }

  it('gates the accept exactly as the resolver does', () => {
    const poor = requestWorld(0, 0);
    const request = poor.activeVillageRequest!;
    expect(getVillageRequestEligibility(poor, request, 'accept')).toEqual({
      ok: false,
      blockReason: 'Need 15 gold',
    });
    expect(getVillageRequestEligibility(poor, request, 'decline')).toEqual({ ok: true });

    const wealthy = requestWorld(100, 0);
    const wealthyRequest = wealthy.activeVillageRequest!;
    expect(getVillageRequestEligibility(wealthy, wealthyRequest, 'accept')).toEqual({ ok: true });
  });

  it('refuses a resolver accept the shared gate rejects and leaves the offer open', () => {
    const state = requestWorld(0, 0);
    const next = resolveVillageRequest(state, 'vreq_1', 'accept');

    expect(next.resources.gold).toBe(0);
    expect(next.activeVillageRequest).toBeDefined();
  });

  it('routes the bot through the owner gate', () => {
    const state = requestWorld(0, 0);
    const decision = decideVirtualPlayerAction(state);
    expect(decision?.command.op).toBe('resolveVillageRequest');
    expect(decision?.command).toMatchObject({ choice: 'decline' });
  });
});

describe('L78 — imprisoned settlers leave construction crews', () => {
  it('detaches a prisoner from the crew it was working', () => {
    const state = newWorld();
    const site = building(1, BuildingType.House, { completed: false, occupants: [10] });
    const prison = building(9, BuildingType.Prison, { x: 300, y: 300 });
    const prisoner = settler(10, { prisonBuildingId: prison.id, homeBuildingId: undefined });
    prison.occupants = [prisoner.id];
    state.buildings = [site, prison];
    state.entities = [prisoner];

    prepareWorkforce([prisoner], state.buildings);

    // Pre-fix the prisoner cleared only the job link, so the site kept working them.
    expect(site.occupants).not.toContain(prisoner.id);
    expect(prisoner.prisonBuildingId).toBe(prison.id);
    expect(prison.occupants).toContain(prisoner.id);
  });
});
