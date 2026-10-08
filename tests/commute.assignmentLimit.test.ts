/**
 * The two-hour rule for offering a settler a post.
 *
 * A post more than two hours' walk from a settler's home is not offered to them. Work assignment
 * sorts candidates by distance and takes the nearest, which without this rule meant a settler housed
 * across the map could be handed a job they could never reach in time.
 *
 * The hours judged are the walk the settler really makes: the lead estimate has to carry the same
 * `rush` multiplier the work commute passes, or it disagrees with the walk by exactly that factor.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initGame, createBuilding } from '../src/game/worldGen';
import {
  commuteLeadHoursFor,
  isWithinAssignableCommute,
  MAX_ASSIGNABLE_COMMUTE_HOURS,
  WORK_COMMUTE_RUSH,
} from '../src/game/simulation/humanMovement';
import { SPECIES_CONFIG } from '../src/game/speciesConfig';
import { BuildingType, EntityType, type Building, type Entity, type WorldState } from '../src/game/gameTypes';
import { resetSimRng } from '../src/game/simRng';

const WALK_SPEED = SPECIES_CONFIG[EntityType.Human].speed;

let world: WorldState;

beforeEach(() => {
  resetSimRng();
  world = initGame({ seed: 424242 });
});

afterEach(() => {
  resetSimRng();
});

/** A completed building of `type` centred on `x, y`. */
function placed(type: BuildingType, x: number, y: number, id: number): Building {
  const building = createBuilding(type, x, y, id);
  building.completed = true;
  building.constructionProgress = 1;
  world.buildings.push(building);
  return building;
}

/** A settler who lives in `home`, so the commute is measured from where they sleep. */
function settlerLivingIn(home: Building, id: number): Entity {
  const entity = world.entities.find((candidate) => candidate.alive)!;
  entity.type = EntityType.Human;
  entity.id = id;
  entity.homeBuildingId = home.id;
  entity.x = home.x;
  entity.y = home.y;
  entity.isJuvenile = false;
  entity.age = 30;
  return entity;
}

function distanceWhereHoursReach(targetHours: number, speed: number): number {
  let lo = 0;
  let hi = 100_000;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (commuteLeadHoursFor(mid, speed) <= targetHours) lo = mid;
    else hi = mid;
  }
  return lo;
}

describe('a post beyond a two-hour walk is not offered', () => {
  it('judges the walk the settler actually makes, including the commute rush', () => {
    // The scheduler's estimate carries the same rush the walk does: at 60% of the distance the
    // two-hour walk reaches it fits the rule, and stripped of the rush the same walk does not.
    const insideTheRule = distanceWhereHoursReach(MAX_ASSIGNABLE_COMMUTE_HOURS, WALK_SPEED) * 0.6;
    expect(commuteLeadHoursFor(insideTheRule, WALK_SPEED)).toBeLessThan(MAX_ASSIGNABLE_COMMUTE_HOURS);
    expect(commuteLeadHoursFor(insideTheRule, WALK_SPEED / WORK_COMMUTE_RUSH)).toBeGreaterThan(
      MAX_ASSIGNABLE_COMMUTE_HOURS,
    );
  });

  it('accepts a house beside the workplace and refuses one across the map', () => {
    const home = placed(BuildingType.House, 600, 400, 8001);
    const nearShop = placed(BuildingType.Store, 640, 400, 8002);
    const farShop = placed(BuildingType.Store, 600 + 1500, 400, 8003);
    const settler = settlerLivingIn(home, 7001);

    expect(isWithinAssignableCommute(settler, nearShop, world.buildings, WALK_SPEED)).toBe(true);
    expect(isWithinAssignableCommute(settler, farShop, world.buildings, WALK_SPEED)).toBe(false);
  });

  it('draws the line at the distance the two-hour walk reaches', () => {
    const home = placed(BuildingType.House, 400, 400, 8011);
    const settler = settlerLivingIn(home, 7002);
    const limit = distanceWhereHoursReach(MAX_ASSIGNABLE_COMMUTE_HOURS, WALK_SPEED);

    // Sized off the limit rather than sitting on it: a knife-edge probe would pass or fail on the
    // rounding of the binary search that found `limit`.
    const inside = placed(BuildingType.Store, home.x + limit * 0.6, home.y, 8012);
    const outside = placed(BuildingType.Store, home.x + limit * 1.4, home.y, 8013);

    expect(isWithinAssignableCommute(settler, inside, world.buildings, WALK_SPEED)).toBe(true);
    expect(isWithinAssignableCommute(settler, outside, world.buildings, WALK_SPEED)).toBe(false);
  });

  it('measures from the settler home, not from wherever they are standing', () => {
    const home = placed(BuildingType.House, 400, 400, 8021);
    const shop = placed(BuildingType.Store, 480, 400, 8022);
    const settler = settlerLivingIn(home, 7003);
    // Standing on the far side of the map must not buy them a distant post.
    expect(isWithinAssignableCommute(settler, shop, world.buildings, WALK_SPEED)).toBe(true);
    settler.x = 5000;
    settler.y = 5000;
    expect(isWithinAssignableCommute(settler, shop, world.buildings, WALK_SPEED)).toBe(true);
  });

  it('keeps a far post reachable when a road serves the route', () => {
    const home = placed(BuildingType.House, 300, 300, 8031);
    const settler = settlerLivingIn(home, 7004);
    // A shop past the plain-walking limit, on a line that a road runs along.
    const beyond = distanceWhereHoursReach(MAX_ASSIGNABLE_COMMUTE_HOURS, WALK_SPEED) + 120;
    const shop = placed(BuildingType.Store, home.x + beyond, home.y, 8032);
    const hasRoad = isWithinAssignableCommute(settler, shop, world.buildings, WALK_SPEED);

    // Lay a road along the route; the same post becomes reachable in time.
    for (let i = 0; i <= 12; i++) {
      placed(BuildingType.Road, home.x + (beyond / 12) * i, home.y, 8100 + i);
    }

    expect(hasRoad).toBe(false);
    expect(isWithinAssignableCommute(settler, shop, world.buildings, WALK_SPEED)).toBe(true);
  });

  it('ignores a road that is nowhere near the route', () => {
    const home = placed(BuildingType.House, 300, 300, 8041);
    const settler = settlerLivingIn(home, 7005);
    const beyond = distanceWhereHoursReach(MAX_ASSIGNABLE_COMMUTE_HOURS, WALK_SPEED) + 120;
    const shop = placed(BuildingType.Store, home.x + beyond, home.y, 8042);
    // A road on the far side of the map must not widen this settler's reach.
    placed(BuildingType.Road, 300, 3000, 8050);

    expect(isWithinAssignableCommute(settler, shop, world.buildings, WALK_SPEED)).toBe(false);
  });
});
