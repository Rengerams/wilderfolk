import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { BuildingType, EntityType, MapSize, type Building, type Entity } from '../src/game/gameTypes';
import {
  getTameFoodCost,
  recruitSettler,
  spawnMoonHowlerDebug,
  tameEntity,
} from '../src/game/buildingActions';
import {
  getTameFoodCost as extractedGetTameFoodCost,
  recruitSettler as extractedRecruitSettler,
  spawnMoonHowlerDebug as extractedSpawnMoonHowlerDebug,
  tameEntity as extractedTameEntity,
} from '../src/game/settlerInteractionActions';

function tamingPost(id: number, faction: 'player' | 'rival'): Building {
  return {
    id,
    type: BuildingType.TamingPost,
    x: 100,
    y: 100,
    width: 40,
    height: 40,
    completed: true,
    faction,
    occupants: [],
    level: 1,
    health: 100,
    maxHealth: 100,
  } as Building;
}

function human(id: number): Entity {
  return {
    id,
    type: EntityType.Human,
    faction: undefined,
    alive: true,
    x: 110,
    y: 110,
  } as Entity;
}

function wolf(id: number): Entity {
  return {
    id,
    type: EntityType.Wolf,
    alive: true,
    x: 110,
    y: 110,
  } as Entity;
}

describe('settler interaction action compatibility', () => {
  it('keeps direct interaction and debug APIs forwarded from the legacy building-actions entry point', () => {
    expect(recruitSettler).toBe(extractedRecruitSettler);
    expect(spawnMoonHowlerDebug).toBe(extractedSpawnMoonHowlerDebug);
    expect(getTameFoodCost).toBe(extractedGetTameFoodCost);
    expect(tameEntity).toBe(extractedTameEntity);
  });

  it('recruits one settler and charges the established food and gold costs', () => {
    const state = initGame({ size: MapSize.Medium, seed: 1 });
    state.resources.food = 100;
    state.resources.gold = 100;
    const beforePopulation = state.entities.filter((entity) => entity.type === EntityType.Human && entity.alive).length;

    const recruited = recruitSettler(state);
    const afterPopulation = recruited.entities.filter((entity) => entity.type === EntityType.Human && entity.alive).length;

    expect(afterPopulation).toBe(beforePopulation + 1);
    expect(recruited.resources.food).toBe(70);
    expect(recruited.resources.gold).toBe(80);
  });

  it('requires a nearby player-owned Taming Post before taming or spending food', () => {
    const state = initGame({ size: MapSize.Medium, seed: 1 });
    const settler = human(1);
    const animal = wolf(2);
    state.entities = [settler, animal];
    state.resources.food = 100;
    state.buildings = [tamingPost(100, 'rival')];

    const blocked = tameEntity(state, animal.id, settler.id);
    expect(blocked.entities.find((entity) => entity.id === animal.id)?.tamedBy).toBeUndefined();
    expect(blocked.resources.food).toBe(100);

    state.buildings = [tamingPost(101, 'player')];
    const tamed = tameEntity(state, animal.id, settler.id);
    expect(tamed.entities.find((entity) => entity.id === animal.id)?.tamedBy).toBe(settler.id);
    expect(tamed.resources.food).toBe(60);
    expect(getTameFoodCost(EntityType.Wolf)).toBe(40);
  });
});
