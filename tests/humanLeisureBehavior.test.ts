import { PERSON_DAY_ROLL_SALTS, personDayRoll, resetSimRng, setSimSeed } from '../src/game/simRng';
import { describe, expect, it, afterEach } from 'vitest';
import { BuildingType, TerrainType, WeatherType, type Building, type Entity, type WorldState } from '../src/game/gameTypes';
import {
  CHILD_PLAYMATE_CANDIDATE_LIMIT,
  CHILD_PLAY_GROUP_MAX,
  idleDestination,
  leisureKindFor,
  tickHumanChildLeisure,
} from '../src/game/humanLeisureBehavior';
import { isPlayerHuman } from '../src/game/playerHuman';
import { TICKS_PER_HOUR, TICKS_PER_DAY } from '../src/game/dayCycle';
import { initGame } from '../src/game/worldGen';
import { homeStandPosition } from '../src/game/simulation/humanMovement';
import { testWorldMap } from '../src/test/worldMapFixtures';
import { getCurrentPathGrid, isGroundWalkableAt, lineCrossesBlocked, setCurrentPathMap } from '../src/game/pathfinding';

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

function tickChild(state: ReturnType<typeof initGame>, child: Entity, allHumans: Entity[], tick: number): boolean {
  state.tick = tick;
  return tickHumanChildLeisure({
    state,
    entity: child,
    speed: 5,
    hourOfDay: Math.floor((tick % TICKS_PER_DAY) / TICKS_PER_HOUR),
    onSchedule: false,
    allHumans,
    entityById: new Map(allHumans.map((human) => [human.id, human])),
    updatedBuildings: [],
    buildingById: new Map(),
    humanSocialGrid: undefined,
    width: state.width,
    height: state.height,
    livingHumanAt: () => undefined,
    suppressIdleInitial: false,
  });
}

describe('tickHumanChildLeisure', () => {
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
