/**
 * The daily commute move is fair to every member, and a day has a budget.
 *
 * §12 lets a household trade its home for a nearer vacant one. A move may not pay for the household
 * total with one member's own day, and a colony makes at most `MAX_RELOCATIONS_PER_DAY` moves in one
 * sweep, so a newly built row of houses cannot reshuffle the valley in a single evening.
 */
import { describe, expect, it } from 'vitest';
import { BuildingType, EntityType } from '../src/game/gameTypes';
import type { Building, Entity } from '../src/game/gameTypes';
import { createBuilding } from '../src/game/worldGen';
import { createEntity } from '../src/game/entityFactory';
import { buildResidenceOccupancy } from '../src/game/residencyOccupancy';
import { relocateHouseholdsForCommute } from '../src/game/residencyReconciliation';
import {
  buildResidenceTraits,
  MAX_RELOCATIONS_PER_DAY,
  pickCommuteRelocation,
} from '../src/game/residencySelection';

/** Human walk speed the movement owner uses; kept in step with the pickers' default. */
const WALK_SPEED = 6.4;
/**
 * Distances are chosen so the trips are unclamped. The estimator prices roughly 690 units per hour,
 * so 3 600 units is about 5.2 h from the old home and the one-hour floor from the new one.
 */
const HOME_X = 0;
const CANDIDATE_X = 3600;

function house(id: number, x: number, y = 200): Building {
  const building = createBuilding(BuildingType.House, x, y, id);
  building.completed = true;
  return building;
}

function workplace(id: number, x: number, y = 200): Building {
  const building = createBuilding(BuildingType.Farm, x, y, id);
  building.completed = true;
  return building;
}

function worker(id: number, homeId: number, workId: number): Entity {
  const human = createEntity(EntityType.Human, 0, 200, id, 200);
  human.alive = true;
  human.isJuvenile = false;
  human.age = 30;
  human.faction = undefined;
  human.childrenIds = [];
  human.residenceBuildingId = homeId;
  human.workerBuildingId = workId;
  return human;
}

describe('a move may not pay for the household with one member', () => {
  it('refuses the move that the same household accepts without the losing member', () => {
    const home = house(1, HOME_X);
    const candidate = house(2, CANDIDATE_X);
    const jobBesideCandidate = workplace(3, CANDIDATE_X);
    const jobBesideHome = workplace(4, HOME_X);
    const gainer = worker(20, home.id, jobBesideCandidate.id);
    const secondGainer = worker(21, home.id, jobBesideCandidate.id);
    const loser = worker(22, home.id, jobBesideHome.id);
    const buildings = [home, candidate, jobBesideCandidate, jobBesideHome];

    // The two gainers alone clear both margins, so the fixture really is a move the rule allows.
    const gainersOnly = pickCommuteRelocation(
      [gainer, secondGainer],
      [gainer, secondGainer],
      [home, candidate],
      buildings,
      undefined,
      new Map(),
      WALK_SPEED,
    );
    expect(gainersOnly).toBe(candidate.id);

    // The loser's own trip grows from the one-hour floor to hours, while the household total still
    // improves by more than both margins — so only the per-member rule can refuse this.
    const unit = [gainer, secondGainer, loser];
    const withLoser = pickCommuteRelocation(
      unit,
      unit,
      [home, candidate],
      buildings,
      undefined,
      new Map(),
      WALK_SPEED,
    );
    expect(withLoser).toBeUndefined();
  });
});

describe('a day has a budget of moves', () => {
  it('moves no more households than the daily cap, however many could improve', () => {
    const households = MAX_RELOCATIONS_PER_DAY + 1;
    const job = workplace(500, CANDIDATE_X);
    const farHomes = Array.from({ length: households }, (_, index) => house(100 + index, HOME_X));
    const vacantHomes = Array.from({ length: households }, (_, index) => house(200 + index, CANDIDATE_X));
    const units = farHomes.map((far, index) => [worker(1000 + index, far.id, job.id)]);
    const alive = units.flat();
    const residences = [...farHomes, ...vacantHomes];
    const buildings = [...residences, job];

    relocateHouseholdsForCommute(
      units,
      alive,
      residences,
      buildings,
      buildResidenceOccupancy(alive),
      buildResidenceTraits(alive),
    );

    const vacantIds = new Set(vacantHomes.map((home) => home.id));
    const movedHomes = new Set(alive
      .map((member) => member.residenceBuildingId!)
      .filter((homeId) => vacantIds.has(homeId)));
    expect(movedHomes.size).toBe(MAX_RELOCATIONS_PER_DAY);
  });
});
