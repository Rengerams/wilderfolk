import { PERSON_DAY_ROLL_SALTS, personDayRoll, resetSimRng, setSimSeed } from '../src/game/simRng';
import { describe, expect, it, afterEach } from 'vitest';
import { BuildingType, JobType, TerrainType, WeatherType, type Building, type Entity, type WorldState } from '../src/game/gameTypes';
import {
  CHILD_PLAYMATE_CANDIDATE_LIMIT,
  CHILD_PLAY_GROUP_MAX,
  idleDestination,
  leisureKindFor,
  tickHumanChildLeisure,
  stopInvalidChildFollowing,
} from '../src/game/humanLeisureBehavior';
import { isPlayerHuman } from '../src/game/playerHuman';
import { TICKS_PER_HOUR, TICKS_PER_DAY } from '../src/game/dayCycle';
import { isWorkDay } from '../src/game/dayCycleClock';
import { createBuilding, initGame } from '../src/game/worldGen';
import { homeStandPosition, rememberHumanWalkTarget, resumeHumanWalk } from '../src/game/simulation/humanMovement';
import { isWaterTerrainType } from '../src/game/terrain/terrainTraits';
import { tileTypeAt, tileTypeAtWorld } from '../src/game/terrain/terrainGrid';
import { testWorldMap } from '../src/test/worldMapFixtures';
import { getCurrentPathGrid, getNavigationQuote, hasUnreachableWalkTarget, steerWithPath, isGroundWalkableAt, lineCrossesBlocked, setCurrentPathMap } from '../src/game/pathfinding';

function playerChild(prototype: Entity, id: number, overrides: Partial<Entity> = {}): Entity {
  return Object.assign(structuredClone(prototype), {
    id,
    alive: true,
    isJuvenile: true,
    age: 10,
    energy: 90,
    maxEnergy: 100,
    x: 100,
    y: 100,
    motherId: undefined,
    fatherId: undefined,
  }, overrides);
}

function childFixture(): { state: ReturnType<typeof initGame>; child: Entity } {
  setCurrentPathMap(null);
  const state = initGame({ skipTerrain: true, seed: 4242 });
  const prototype = state.entities.find((entity) => isPlayerHuman(entity) && entity.alive);
  if (!prototype) throw new Error('worldGen produced no player settler for the child leisure test');
  state.entities = [];
  state.buildings = [];
  state.weather = WeatherType.Clear;
  return { state, child: playerChild(prototype, 10) };
}

function playTickFor(child: Entity, start = 1, end = 5000): number {
  for (let tick = start; tick < end; tick += TICKS_PER_DAY) {
    if (personDayRoll(child.id, tick, 718) < 0.72) return tick;
  }
  throw new Error('could not find a child play day');
}

/** A crowded play tick whose uncapped choice would fall outside the bounded candidate list. */
function crowdedSteeringTick(state: ReturnType<typeof initGame>, child: Entity, allHumans: Entity[]): number {
  const nearby = allHumans.length - 1;
  for (let tick = 1; tick < 50 * TICKS_PER_DAY; tick += TICKS_PER_DAY) {
    const day = Math.floor(tick / TICKS_PER_DAY);
    if ((child.id + day) % nearby < CHILD_PLAYMATE_CANDIDATE_LIMIT) continue;
    if (personDayRoll(child.id, tick, 718) >= 0.72) continue;
    child.vx = 0;
    child.vy = 0;
    if (tickChild(state, child, allHumans, tick)) return tick;
  }
  throw new Error('could not find a crowded child play day');
}

function tickChild(state: ReturnType<typeof initGame>, child: Entity, allHumans: Entity[], tick: number, livingHumanAt: (id: number | null | undefined) => Entity | undefined = () => undefined, buildings: Building[] = []): boolean {
  state.tick = tick;
  return tickHumanChildLeisure({
    state,
    entity: child,
    speed: 5,
    hourOfDay: Math.floor((tick % TICKS_PER_DAY) / TICKS_PER_HOUR),
    onSchedule: false,
    allHumans,
    entityById: new Map(allHumans.map((human) => [human.id, human])),
    updatedBuildings: buildings,
    buildingById: new Map(buildings.map((building) => [building.id, building])),
    humanSocialGrid: undefined,
    width: state.width,
    height: state.height,
    livingHumanAt,
    suppressIdleInitial: false,
  });
}

describe('tickHumanChildLeisure', () => {
  it('does not follow a parent commuting to or working at a job, including the custodian fallback', () => {
    const { state, child } = childFixture();
    const parent = playerChild(child, 21, {
      age: 30, isJuvenile: false, workerBuildingId: 99, x: 180, y: 100,
    });
    child.motherId = parent.id;
    const humans = [child, parent];
    const lookup = (id: number | null | undefined) => id === parent.id ? parent : undefined;
    const day = Array.from({ length: 60 }, (_, i) => i).find((d) =>
      isWorkDay(d * TICKS_PER_DAY) && personDayRoll(child.id, d * TICKS_PER_DAY, 601) > 0.22);
    if (day == null) throw new Error('test needs a workday with a follow roll');
    state.workSchedule = { startHour: 8, endHour: 16 };
    for (const [hour, expected] of [[6, true], [7, false], [9, false], [17, true]] as const) {
      tickChild(state, child, humans, day * TICKS_PER_DAY + hour * TICKS_PER_HOUR + 1, lookup);
      expect(child.childLeisureActivity === 'following').toBe(expected);
      expect(child.childLeisureTargetId === parent.id).toBe(expected);
    }
    parent.indoorBuildingId = parent.workerBuildingId;
    tickChild(state, child, humans, day * TICKS_PER_DAY + 18 * TICKS_PER_HOUR, lookup);
    expect(child.childLeisureActivity).not.toBe('following');
    parent.workerBuildingId = undefined;
    parent.indoorBuildingId = undefined;
    tickChild(state, child, humans, day * TICKS_PER_DAY + 9 * TICKS_PER_HOUR, lookup);
    expect(child.childLeisureActivity).toBe('following');
  });

  it('does not follow a caregiver on a real evening venue shift outside the generic work window', () => {
    const { state, child } = childFixture();
    const parent = playerChild(child, 21, {
      age: 30, isJuvenile: false, job: JobType.Innkeeper, workerBuildingId: 99,
      x: 180, y: 100,
    });
    const tavern = createBuilding(BuildingType.Tavern, 180, 100, 99);
    tavern.completed = true;
    tavern.occupants = [parent.id];
    state.buildings = [tavern];
    state.workSchedule = { startHour: 8, endHour: 16 };
    child.motherId = parent.id;
    const humans = [child, parent];
    const lookup = (id: number | null | undefined) => id === parent.id ? parent : undefined;
    const day = Array.from({ length: 60 }, (_, i) => i).find((d) =>
      personDayRoll(child.id, d * TICKS_PER_DAY, 601) > 0.22);
    if (day == null) throw new Error('test needs a follow roll');
    tickChild(state, child, humans, day * TICKS_PER_DAY + 18 * TICKS_PER_HOUR + 1, lookup, [tavern]);
    expect(child.childLeisureActivity).not.toBe('following');
    expect(child.childLeisureTargetId).toBeUndefined();
  });

  it('cancels cached following before an off-screen school or bedtime tick resumes it', () => {
    const { state, child } = childFixture();
    const parent = playerChild(child, 21, {
      age: 30, isJuvenile: false, x: 220, y: 100,
    });
    child.motherId = parent.id;
    const people = new Map([child, parent].map((person) => [person.id, person]));
    const buildings = new Map<number, Building>();
    const followRoute = () => {
      child.childLeisureActivity = 'following';
      child.childLeisureTargetId = parent.id;
      child.vx = 2;
      child.vy = 0;
      rememberHumanWalkTarget(child, parent.x, parent.y, 2, `child_follow_${child.id}_${parent.id}`);
    };
    followRoute();
    state.tick = 20 * TICKS_PER_HOUR;
    expect(stopInvalidChildFollowing(state, child, people, buildings, 20, false)).toBe(false);
    expect(child.childLeisureActivity).toBe('following');

    // humanTick supplies mandatoryChildActivity from its single school/bedtime
    // schedule, before the off-screen throttle can resume this old path.
    expect(stopInvalidChildFollowing(state, child, people, buildings, 20, true)).toBe(true);
    expect(child.childLeisureActivity).toBeUndefined();
    expect(child.childLeisureTargetId).toBeUndefined();
    expect(child.vx).toBe(0);
    resumeHumanWalk(child);
    expect(child.vx).toBe(0);

    followRoute();
    expect(stopInvalidChildFollowing(state, child, people, buildings, 8, true)).toBe(true);
    resumeHumanWalk(child);
    expect(child.vx).toBe(0);
  });

  it('cancels a moving child when the caregiver begins an evening shift off screen', () => {
    const { state, child } = childFixture();
    const parent = playerChild(child, 21, {
      age: 30, isJuvenile: false, job: JobType.Innkeeper, workerBuildingId: 99,
      x: 220, y: 100,
    });
    const tavern = createBuilding(BuildingType.Tavern, 220, 100, 99);
    tavern.completed = true;
    tavern.occupants = [parent.id];
    state.buildings = [tavern];
    child.childLeisureActivity = 'following';
    child.childLeisureTargetId = parent.id;
    child.vx = 2;
    rememberHumanWalkTarget(child, parent.x, parent.y, 2, `child_follow_${child.id}_${parent.id}`);
    const people = new Map([child, parent].map((person) => [person.id, person]));
    state.tick = 18 * TICKS_PER_HOUR;
    expect(stopInvalidChildFollowing(
      state, child, people, new Map([[tavern.id, tavern]]), 18, false,
    )).toBe(true);
    expect(child.childLeisureActivity).toBeUndefined();
    resumeHumanWalk(child);
    expect(child.vx).toBe(0);
  });

  it('prefers childhood and strong friends on successive days without excluding newcomers', () => {
    const { state, child } = childFixture();
    const friend = playerChild(child, 11, {
      x: 120, y: 100,
      friendships: { friend_10: 88 },
      childhoodFriendsIds: [10],
    });
    const newcomer = playerChild(child, 12, { x: 105, y: 100 });
    child.friendships = { friend_11: 88 };
    child.childhoodFriendsIds = [friend.id];
    let withFriend = 0;
    let withNewcomer = 0;
    for (let day = 0; day < 120; day++) {
      const tick = day * TICKS_PER_DAY + 1;
      tickChild(state, child, [child, friend, newcomer], tick);
      if (child.childPlaymateId === friend.id) withFriend++;
      if (child.childPlaymateId === newcomer.id) withNewcomer++;
    }
    expect(withFriend).toBeGreaterThan(withNewcomer * 2);
    expect(withNewcomer).toBeGreaterThan(0);
  });

  it('forms a shared play circle of two to four children and takes them to one site', () => {
    const { state, child } = childFixture();
    const others = [
      playerChild(child, 11, { x: 112, y: 100 }),
      playerChild(child, 12, { x: 103, y: 115 }),
      playerChild(child, 13, { x: 96, y: 115 }),
    ];
    const all = [child, ...others];
    let found = false;
    for (let day = 0; day < 100; day++) {
      const tick = day * TICKS_PER_DAY + 1;
      tickChild(state, child, all, tick);
      const groupIds = child.childPlayGroupIds ?? [];
      if (groupIds.length < 3) continue;
      found = true;
      expect(groupIds.length).toBeLessThanOrEqual(CHILD_PLAY_GROUP_MAX);
      const group = all.filter((member) => groupIds.includes(member.id));
      expect(group.length).toBe(groupIds.length);
      for (const member of group) {
        expect(member.childPlayGroupIds).toEqual(groupIds);
        expect(member.childPlaymateDay).toBe(day);
        tickChild(state, member, all, tick);
        expect(member.childPlaySite?.x).toBe(child.childPlaySite?.x);
        expect(member.childPlaySite?.y).toBe(child.childPlaySite?.y);
      }
      break;
    }
    expect(found).toBe(true);
  });


  it('walks to a reachable play area instead of circling the same spot', () => {
    const { state, child } = childFixture();
    const mate = playerChild(child, 11, { x: 108, y: 100 });
    const tick = playTickFor(child);
    expect(tickChild(state, child, [child, mate], tick)).toBe(true);
    const first = child.childPlaySite;
    expect(first).toBeDefined();
    expect(first!.mateId).toBe(mate.id);
    expect(Math.hypot(first!.x - child.x, first!.y - child.y)).toBeGreaterThan(25);
    expect(Math.hypot(child.vx, child.vy)).toBeGreaterThan(0);

    tickChild(state, child, [child, mate], tick + 1);
    expect(child.childPlaySite).toEqual(first);

    tickChild(state, child, [child, mate], tick + 3 * TICKS_PER_HOUR);
    const next = child.childPlaySite;
    expect(next).toBeDefined();
    expect(next!.phase).not.toBe(first!.phase);
    expect(Math.hypot(next!.x - first!.x, next!.y - first!.y)).toBeGreaterThanOrEqual(28);
    expect(child.childPlaymateId).toBe(mate.id);
  });

  it('stops at the shared play site instead of oscillating', () => {
    const { state, child } = childFixture();
    const mate = playerChild(child, 11, { x: 108, y: 100 });
    const tick = playTickFor(child);
    expect(tickChild(state, child, [child, mate], tick)).toBe(true);
    const site = child.childPlaySite!;
    expect(site).toBeDefined();
    child.x = site.x;
    child.y = site.y;
    child.vx = 2;
    child.vy = -2;
    for (let offset = 1; offset <= 8; offset++) {
      expect(tickChild(state, child, [child, mate], tick + offset)).toBe(true);
      expect(child.childPlaySite).toEqual(site);
      expect(child.vx).toBe(0);
      expect(child.vy).toBe(0);
    }
  });

  it('keeps play destinations on reachable ground beside a river', () => {
    const { state, child } = childFixture();
    const mate = playerChild(child, 11, { x: 142, y: 150 });
    child.x = 130;
    child.y = 150;
    state.width = 400;
    state.height = 300;
    state.worldMap = testWorldMap({
      tilesX: 40, tilesY: 30,
      tileType: (tx) => tx === 18 ? TerrainType.River : undefined,
    });
    setCurrentPathMap(state.worldMap, state.buildings);
    try {
      expect(tickChild(state, child, [child, mate], playTickFor(child))).toBe(true);
      const site = child.childPlaySite;
      expect(site).toBeDefined();
      const grid = getCurrentPathGrid()!;
      expect(site!.x).toBeLessThan(180);
      expect(isGroundWalkableAt(site!.x, site!.y, grid)).toBe(true);
      expect(lineCrossesBlocked(grid, child.x, child.y, site!.x, site!.y)).toBe(false);
      expect(lineCrossesBlocked(grid, mate.x, mate.y, site!.x, site!.y)).toBe(false);
    } finally {
      setCurrentPathMap(null);
    }
  });

  it('never chooses shallow water as a play site, even when every distant tile is wet', () => {
    const { state, child } = childFixture();
    const mate = playerChild(child, 11, { x: 115, y: 105 });
    child.x = 105;
    child.y = 105;
    state.width = 400;
    state.height = 300;
    state.worldMap = testWorldMap({
      tilesX: 40, tilesY: 30,
      tileType: (tx, ty) => tx >= 9 && tx <= 12 && ty >= 9 && ty <= 12
        ? undefined : TerrainType.ShallowWater,
    });
    setCurrentPathMap(state.worldMap, []);
    try {
      // Shallow water is blocked for both walking and child play destinations.
      expect(isGroundWalkableAt(155, 105)).toBe(false);
      expect(tileTypeAtWorld(state.worldMap, 155, 105)).toBe(TerrainType.ShallowWater);
      const tick = playTickFor(child);
      expect(tickChild(state, child, [child, mate], tick)).toBe(true);
      expect(child.childPlaySite).toBeUndefined();
      expect(child.childPlaySiteAttempt).toBeDefined();
      expect(child.vx).toBe(0);
      expect(child.vy).toBe(0);
    } finally {
      setCurrentPathMap(null);
    }
  });

  it('rejects saved play stops beside water within the child arrival radius', () => {
    const { state, child } = childFixture();
    const mate = playerChild(child, 11, { x: 115, y: 105 });
    child.x = 105;
    child.y = 105;
    const tick = playTickFor(child);
    expect(tickChild(state, child, [child, mate], tick)).toBe(true);
    const day = Math.floor(tick / TICKS_PER_DAY);
    const phase = Math.floor((tick % TICKS_PER_DAY) / (3 * TICKS_PER_HOUR));
    const previous = { day, phase, x: 155, y: 105 };
    child.childPlaySite = { ...previous, mateId: mate.id };
    mate.childPlaySite = { ...previous, mateId: child.id };
    child.childPlaySiteAttempt = { day, phase };
    mate.childPlaySiteAttempt = { day, phase };

    state.width = 400;
    state.height = 300;
    state.worldMap = testWorldMap({
      tilesX: 40, tilesY: 30,
      tileType: (tx, ty) => tx === 16 && ty === 10 ? TerrainType.ShallowWater : undefined,
    });
    setCurrentPathMap(state.worldMap, []);
    try {
      // (155,105) is dry but its play-arrival circle reaches shallow water at tile (16,10).
      expect(tileTypeAtWorld(state.worldMap, previous.x, previous.y)).not.toBe(TerrainType.ShallowWater);
      expect(tickChild(state, child, [child, mate], tick + 1)).toBe(true);
      const site = child.childPlaySite;
      expect(site).toBeDefined();
      expect(site?.x === previous.x && site?.y === previous.y).toBe(false);
      if (!site) throw new Error('expected replacement dry play stop');
      for (let ty = Math.floor((site.y - 14) / 10); ty <= Math.floor((site.y + 14) / 10); ty++) {
        for (let tx = Math.floor((site.x - 14) / 10); tx <= Math.floor((site.x + 14) / 10); tx++) {
          const terrain = tileTypeAt(state.worldMap!, tx, ty);
          expect(terrain, `play arrival radius at ${tx},${ty}`).not.toBeNull();
          expect(isWaterTerrainType(terrain!), `play arrival radius at ${tx},${ty}`).toBe(false);
        }
      }
      expect(mate.childPlaySite?.x).toBe(site.x);
      expect(mate.childPlaySite?.y).toBe(site.y);
    } finally {
      setCurrentPathMap(null);
    }
  });

  it('can select a shared play site reached by a detour around a short river barrier', () => {
    const { state, child } = childFixture();
    const mate = playerChild(child, 11, { x: 135, y: 145 });
    child.x = 125;
    child.y = 145;
    state.width = 400;
    state.height = 300;
    state.worldMap = testWorldMap({
      tilesX: 40, tilesY: 30,
      tileType: (tx, ty) => tx === 16 && ty >= 12 && ty <= 16 ? TerrainType.River : undefined,
    });
    setCurrentPathMap(state.worldMap, state.buildings);
    try {
      const grid = getCurrentPathGrid()!;
      let detourFound = false;
      for (let day = 0; day < 100 && !detourFound; day++) {
        tickChild(state, child, [child, mate], day * TICKS_PER_DAY + 1);
        const site = child.childPlaySite;
        if (!site || !lineCrossesBlocked(grid, child.x, child.y, site.x, site.y)) continue;
        for (const member of [child, mate]) {
          const quote = getNavigationQuote(grid,
            { x: Math.floor(member.x / 10), y: Math.floor(member.y / 10) },
            { x: Math.floor(site.x / 10), y: Math.floor(site.y / 10) },
            { maxNodes: 600 });
          expect(quote.status).toBe('priced');
        }
        detourFound = true;
      }
      expect(detourFound).toBe(true);
    } finally {
      setCurrentPathMap(null);
    }
  });

  it('keeps a reserved circle headed to its play site after members separate beyond the scan radius', () => {
    const { state, child } = childFixture();
    const mate = playerChild(child, 11, { x: 195, y: 100 });
    const tick = playTickFor(child);
    tickChild(state, child, [child, mate], tick);
    expect(child.childPlayGroupIds).toEqual([child.id, mate.id]);
    const assignedSite = structuredClone(child.childPlaySite);
    expect(assignedSite).toBeDefined();

    // Their shared outing is already underway, so 96px is no longer a stop condition.
    child.x = mate.x - 125;
    expect(tickChild(state, child, [child, mate], tick + 1)).toBe(true);
    expect(child.childLeisureActivity).toBe('playing');
    expect(child.childLeisureTargetId).toBe(mate.id);
    expect(child.childPlaySite).toEqual(assignedSite);
    expect(Math.hypot(child.vx, child.vy)).toBeGreaterThan(0);
  });

  it('caches a rejected play-area search until the next three-hour phase', () => {
    const { state, child } = childFixture();
    child.x = 105;
    child.y = 105;
    const mate = playerChild(child, 11, { x: 115, y: 105 });
    state.width = 400;
    state.height = 300;
    // All play stops 42–78 pixels away are blocked; only the children's tiny island is open.
    state.worldMap = testWorldMap({
      tilesX: 40, tilesY: 30,
      tileType: (tx, ty) => tx >= 9 && tx <= 12 && ty >= 9 && ty <= 12
        ? undefined : TerrainType.River,
    });
    setCurrentPathMap(state.worldMap, state.buildings);
    try {
      const tick = playTickFor(child);
      tickChild(state, child, [child, mate], tick);
      const day = Math.floor(tick / TICKS_PER_DAY);
      const phase = Math.floor((tick % TICKS_PER_DAY) / (3 * TICKS_PER_HOUR));
      expect(child.childPlaySite).toBeUndefined();
      expect(child.childPlaySiteAttempt).toEqual({ day, phase });
      expect(mate.childPlaySiteAttempt).toEqual({ day, phase });
      // No reachable play stop: do not chase the other child's moving coordinates.
      mate.x = 150;
      child.vx = 2;
      child.vy = -1;
      tickChild(state, child, [child, mate], tick + 1);
      expect(child.vx).toBe(0);
      expect(child.vy).toBe(0);


      // The world becomes walkable, but the failed phase decision stays cached.
      state.worldMap = testWorldMap({ tilesX: 40, tilesY: 30 });
      setCurrentPathMap(state.worldMap, state.buildings);
      tickChild(state, child, [child, mate], tick + 1);
      expect(child.childPlaySite).toBeUndefined();
      expect(child.childPlaySiteAttempt).toEqual({ day, phase });

      tickChild(state, child, [child, mate], tick + 3 * TICKS_PER_HOUR);
      expect(child.childPlaySite).toBeDefined();
      expect(child.childPlaySiteAttempt?.phase).not.toBe(phase);
    } finally {
      setCurrentPathMap(null);
    }
  });

  it('keeps surviving group members paired when the founder dies', () => {
    const { state, child } = childFixture();
    const second = playerChild(child, 11, { x: 110, y: 100 });
    const third = playerChild(child, 12, { x: 100, y: 110 });
    const all = [child, second, third];
    let tick = -1;
    for (let day = 0; day < 100; day++) {
      const candidate = day * TICKS_PER_DAY + 1;
      tickChild(state, child, all, candidate);
      if (child.childPlayGroupIds?.length === 3) {
        tick = candidate;
        break;
      }
    }
    expect(tick).toBeGreaterThan(0);
    expect(second.childPlaymateId).toBe(child.id);
    expect(third.childPlaymateId).toBe(child.id);

    child.alive = false;
    tickChild(state, second, all, tick + 1);
    expect(second.childPlaymateId).toBe(third.id);
    expect(second.childPlayGroupIds).toEqual([second.id, third.id]);
    expect(third.childPlaymateId).toBe(second.id);
    expect(third.childPlayGroupIds).toEqual([second.id, third.id]);
    tickChild(state, third, all, tick + 2);
    expect(third.childPlaymateId).toBe(second.id);
    expect(third.childPlaymateDay).toBe(Math.floor(tick / TICKS_PER_DAY));
  });

  it('chooses a neighborhood playmate and heads toward an outdoor play site', () => {
    const { state, child } = childFixture();
    const nearby = playerChild(child, 11, { x: 120, y: 100 });
    const distant = playerChild(child, 12, { x: 1000, y: 100 });

    expect(tickChild(state, child, [child, nearby, distant], playTickFor(child))).toBe(true);
    expect(child.childPlaymateId).toBe(nearby.id);
    expect(child.childPlaySite).toBeDefined();
    expect(Math.hypot(child.vx, child.vy)).toBeGreaterThan(0);
  });

  it('does not select a child outside the neighborhood', () => {
    const { state, child } = childFixture();
    const distant = playerChild(child, 12, { x: 1000, y: 100 });

    expect(tickChild(state, child, [child, distant], playTickFor(child))).toBe(false);
    expect(child.vx).toBe(0);
    expect(child.vy).toBe(0);
  });

  it('chooses from a bounded candidate set in a crowded neighborhood', () => {
    const { state, child } = childFixture();
    const right = Array.from({ length: CHILD_PLAYMATE_CANDIDATE_LIMIT }, (_, i) =>
      playerChild(child, 100 + i, { x: 140, y: 100 }));
    const left = Array.from({ length: CHILD_PLAYMATE_CANDIDATE_LIMIT / 2 }, (_, i) =>
      playerChild(child, 200 + i, { x: 60, y: 100 }));
    const humans = [child, ...right, ...left];

    crowdedSteeringTick(state, child, humans);

    expect(right.map((mate) => mate.id)).toContain(child.childPlaymateId);
    expect(child.childPlaySite).toBeDefined();
    expect(Math.hypot(child.vx, child.vy)).toBeGreaterThan(0);
  });

  it('keeps the same playmate throughout the day when other children become available', () => {
    const { state, child } = childFixture();
    const mate = playerChild(child, 11, { x: 120, y: 100 });
    const newcomer = playerChild(child, 12, { x: 105, y: 100 });
    const tick = playTickFor(child);

    expect(tickChild(state, child, [child, mate], tick)).toBe(true);
    expect(child.childPlaymateId).toBe(mate.id);
    const day = child.childPlaymateDay;

    expect(tickChild(state, child, [child, newcomer, mate], tick + 4 * TICKS_PER_HOUR)).toBe(true);
    expect(child.childPlaymateId).toBe(mate.id);
    expect(child.childPlaymateDay).toBe(day);
    expect(child.childLeisureActivity).toBe('playing');
    expect(child.childLeisureTargetId).toBe(mate.id);
  });

  it('persists a daily selection through a save copy and replaces an unavailable mate', () => {
    const { state, child } = childFixture();
    const mate = playerChild(child, 11, { x: 120, y: 100 });
    const replacement = playerChild(child, 12, { x: 130, y: 100 });
    const tick = playTickFor(child);
    expect(tickChild(state, child, [child, mate], tick)).toBe(true);

    const restored = structuredClone(child);
    expect(tickChild(state, restored, [restored, mate, replacement], tick + TICKS_PER_HOUR)).toBe(true);
    expect(restored.childPlaymateId).toBe(mate.id);

    mate.alive = false;
    expect(tickChild(state, restored, [restored, replacement], tick + TICKS_PER_HOUR + 1)).toBe(true);
    expect(restored.childPlaymateId).toBe(replacement.id);
    expect(restored.childLeisureTargetId).toBe(replacement.id);
  });

  it('resets the chosen playmate at the next colony-day boundary', () => {
    const { state, child } = childFixture();
    const mate = playerChild(child, 11, { x: 120, y: 100 });
    const newcomer = playerChild(child, 12, { x: 130, y: 100 });
    const tick = playTickFor(child);
    tickChild(state, child, [child, mate], tick);
    const firstDay = child.childPlaymateDay;

    const nextDayTick = Math.floor(tick / TICKS_PER_DAY) * TICKS_PER_DAY + TICKS_PER_DAY + 1;
    tickChild(state, child, [child, mate, newcomer], nextDayTick);
    expect(child.childPlaymateDay).toBe(firstDay! + 1);
    if (child.childPlaymateId != null) {
      expect([mate.id, newcomer.id]).toContain(child.childPlaymateId);
    }
  });

});

describe('seeded free-time selection', () => {
  afterEach(() => {
    resetSimRng();
  });

  it('changes the 12-way leisure activity with the run seed', () => {
    const kindsFor = (seed: number): number[] => {
      resetSimRng();
      setSimSeed(seed);
      // A slot per sample, so a seed moves the spice of every slot independently.
      return Array.from({ length: 12 }, (_, index) => leisureKindFor(7, 3000 + index * 1000, false));
    };

    const first = kindsFor(1);
    expect(kindsFor(1)).toEqual(first);
    expect(kindsFor(2)).not.toEqual(first);
  });

  it('holds one activity for the whole leisure slot instead of shifting with the calendar day', () => {
    resetSimRng();
    setSimSeed(77);
    // A leisure slot is 80 hours, so it spans several colony days; a day term in the choice made the
    // activity change every midnight even though the slot (and the UI's promise) says it holds.
    const slot = 3;
    const slotTicks = 80 * TICKS_PER_HOUR;
    const kinds = [0, 1, 2].map((dayOffset) =>
      leisureKindFor(0, slot * slotTicks + dayOffset * 288 + 10, false));

    expect(new Set(kinds).size).toBe(1);
  });

  it('never reuses a registered decision salt, so idle choices cannot correlate', () => {
    const salts = Object.values(PERSON_DAY_ROLL_SALTS);
    expect(new Set(salts).size).toBe(salts.length);
    // 812 is the scarce-hunt dialogue's salt; 201 is the schedule's weekend free-day roll.
    expect(salts).not.toContain(812);
    expect(salts).not.toContain(201);
  });

  it('does not send a settler home on the scarce-hunt dialogue roll', () => {
    const entityId = 10;
    // A day where the old shared 812 roll says "go home" but the leisure salt does not.
    let tick = -1;
    for (let day = 0; day < 2000; day++) {
      const candidate = day * 288;
      if (
        personDayRoll(entityId, candidate, 812) < 0.34
        && personDayRoll(entityId, candidate, PERSON_DAY_ROLL_SALTS.leisureIdleDestination) >= 0.34
      ) {
        tick = candidate;
        break;
      }
    }
    expect(tick).toBeGreaterThanOrEqual(0);

    const home = {
      id: 50,
      type: BuildingType.House,
      x: 400,
      y: 400,
      width: 40,
      height: 40,
      occupants: [entityId],
      level: 1,
      constructionProgress: 100,
      completed: true,
      health: 100,
      maxHealth: 100,
      spriteScale: 1,
      buildAnimTimer: 0,
    } as unknown as Building;
    const settler = {
      id: entityId,
      type: 'human',
      alive: true,
      age: 30,
      x: 100,
      y: 100,
      residenceBuildingId: home.id,
    } as unknown as Entity;
    const state = { tick, beautyGrid: undefined } as unknown as WorldState;

    const destination = idleDestination(state, settler, [], new Map([[home.id, home]]));
    const porch = homeStandPosition(home, entityId);

    expect(destination).not.toEqual(porch);
  });
});

describe('leisure route failure verdict', () => {
  it('distinguishes a proven disconnected destination from an unsearched destination', () => {
    const { state, child } = childFixture();
    child.x = 105;
    child.y = 105;
    state.worldMap = testWorldMap({
      tilesX: 40, tilesY: 30,
      tileType: (tx) => tx === 18 ? TerrainType.River : undefined,
    });
    setCurrentPathMap(state.worldMap, []);
    try {
      const key = 'leisure-test-disconnected';
      expect(hasUnreachableWalkTarget(child, 245, 105, key)).toBe(false);
      expect(steerWithPath(child, 245, 105, 2, key)).toBe('blocked');
      expect(hasUnreachableWalkTarget(child, 245, 105, key)).toBe(true);
      expect(hasUnreachableWalkTarget(child, 115, 105, key)).toBe(false);
      expect(steerWithPath(child, 115, 105, 2, key)).toBe('direct');
      expect(hasUnreachableWalkTarget(child, 115, 105, key)).toBe(false);
    } finally {
      setCurrentPathMap(null);
    }
  });

  it('does not reject a destination with a route around a short barrier', () => {
    const { state, child } = childFixture();
    child.x = 145;
    child.y = 145;
    state.worldMap = testWorldMap({
      tilesX: 40, tilesY: 30,
      tileType: (tx, ty) => tx === 18 && ty >= 12 && ty <= 16 ? TerrainType.River : undefined,
    });
    setCurrentPathMap(state.worldMap, []);
    try {
      const key = 'leisure-test-detour';
      expect(steerWithPath(child, 215, 145, 2, key)).toBe('path');
      expect(hasUnreachableWalkTarget(child, 215, 145, key)).toBe(false);
    } finally {
      setCurrentPathMap(null);
    }
  });
});
