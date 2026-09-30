/**
 * Residual cross-cutting audit items closed at their owners (2026-09-13).
 *
 * 1. `simQueries.REPRO_WILDLIFE_TYPES` omitted Wildkin although Wildkin is ticked as wildlife
 *    and carries a reproduction chance/cooldown, so its population snapshot was permanently 0:
 *    the 35-cap never applied and it always bred with the full scarcity boost.
 * 2. The leader-residency invariant had no exemption for a cursed leader hunting in Moon Howler
 *    form, whose live `residenceBuildingId` is parked in `moonHowlerSaved` for the duration of the
 *    form — so a cursed leader made the invariant report a manor violation that is not a defect.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { BuildingType, EntityType, MapSize, LEADER_OCCUPATION } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import {
  buildWildlifePopulationSnapshot,
  recordWildlifeBirth,
  wildlifeTypePopulation,
} from '../src/game/simQueries';
import { collectSimulationInvariantErrors } from '../src/game/simulation/simulationInvariants';
import { curseMoonHowler, isActiveMoonHowler, transformToWerewolfForm } from '../src/game/moonHowler';

function entity(type: EntityType, id: number): Entity {
  return { id, type, x: 100, y: 100, alive: true } as never;
}

function reproductionByType(wildkin: Entity[]): Record<EntityType, Entity[]> {
  return {
    [EntityType.Rabbit]: [],
    [EntityType.Deer]: [],
    [EntityType.Wolf]: [],
    [EntityType.Fox]: [],
    [EntityType.Wildkin]: wildkin,
  } as unknown as Record<EntityType, Entity[]>;
}

describe('Wildkin joins the reproduction snapshot', () => {
  it('reports the live Wildkin population instead of a permanent zero', () => {
    const snapshot = buildWildlifePopulationSnapshot(reproductionByType([entity(EntityType.Wildkin, 900)]), []);

    expect(wildlifeTypePopulation(snapshot, EntityType.Wildkin, 1)).toBe(1);
  });

  it('counts a mid-tick Wildkin birth for the colony but not for its own parent', () => {
    const snapshot = buildWildlifePopulationSnapshot(reproductionByType([entity(EntityType.Wildkin, 900)]), []);
    recordWildlifeBirth(snapshot, EntityType.Wildkin, 900, 901);

    expect(wildlifeTypePopulation(snapshot, EntityType.Wildkin, 1)).toBe(2);
    expect(wildlifeTypePopulation(snapshot, EntityType.Wildkin, 900)).toBe(1);
  });
});

function leaderWorld(): { state: WorldState; leader: Entity; manor: Building } {
  const state = initGame({ size: MapSize.Medium, seed: 9 });
  const leader = state.entities.find(
    (e) => e.alive && e.type === EntityType.Human && e.faction == null && !isActiveMoonHowler(e),
  );
  expect(leader).toBeDefined();
  if (!leader) throw new Error('no settler');
  leader.isJuvenile = false;
  leader.age = 30;
  leader.occupation = LEADER_OCCUPATION;

  const manor = {
    id: state.nextBuildingId++,
    type: BuildingType.LeaderHouse,
    x: 300,
    y: 300,
    width: 60,
    height: 48,
    rotation: 0,
    completed: true,
    faction: 'player',
    occupants: [leader.id],
    constructionProgress: 100,
    level: 1,
    spriteScale: 1,
    health: 100,
    maxHealth: 100,
  } as unknown as Building;
  state.buildings.push(manor);
  state.villageLeaderId = leader.id;
  leader.residenceBuildingId = manor.id;

  return { state, leader, manor };
}

const manorErrors = (state: WorldState): string[] =>
  collectSimulationInvariantErrors(state).filter((e) => e.includes("Leader's House"));

describe('leader residency vs the Moon Howler form', () => {
  it('reports a resident leader correctly (control)', () => {
    const { state } = leaderWorld();

    expect(manorErrors(state)).toEqual([]);
  });

  it('still reports a human leader who is not in the manor (control)', () => {
    const { state, leader } = leaderWorld();
    leader.residenceBuildingId = undefined;

    expect(manorErrors(state).some((e) => e.includes('not residing'))).toBe(true);
  });

  it('exempts a cursed leader hunting in Moon Howler form', () => {
    const { state, leader } = leaderWorld();
    curseMoonHowler(leader);
    transformToWerewolfForm(leader, state.buildings);

    expect(isActiveMoonHowler(leader)).toBe(true);
    expect(manorErrors(state)).toEqual([]);
  });
});
