/**
 * Audit L2 (2026-09-13): "Tamed animals whose owner died keep eating rations
 * forever and can never be hunted."
 *
 * The fix belongs to the removal owner, not to the ration counter:
 * `humanLifecycleCleanup.reconcileFamilyReferencesAfterRemoval` clears the dead
 * owner's `tamedBy`, so the animal returns to the wild — it stops drawing the
 * daily ration AND `isValidHuntPrey` accepts it again. Counting only pets with a
 * living owner (the first attempt) would have hidden the animal from the ration
 * list while `isValidHuntPrey` still refused it, i.e. neither fed nor huntable.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { EntityType, MapSize } from '../src/game/gameTypes';
import type { Entity } from '../src/game/gameTypes';
import { countTamedAnimals, tickAnimalCare } from '../src/game/animalCare';
import { killHuman } from '../src/game/humanLifecycleCleanup';
import { isValidHuntPrey } from '../src/game/simulation/simulationEntities';
import { DAYS_PER_YEAR } from '../src/game/dayCycle';

function tamedDeer(ownerId: number, id: number): Entity {
  return {
    id,
    type: EntityType.Deer,
    x: 220,
    y: 220,
    alive: true,
    tamedBy: ownerId,
  } as never;
}

function indexOf(entities: readonly Entity[]): Map<number, Entity> {
  const byId = new Map<number, Entity>();
  for (const entity of entities) byId.set(entity.id, entity);
  return byId;
}

describe('L2 — a pet is released when its owner dies', () => {
  it('clears tamedBy, stops the ration draw and restores huntability', () => {
    const state = initGame({ size: MapSize.Medium, seed: 1 });
    const owner = state.entities.find((e) => e.alive && e.type === EntityType.Human && e.faction !== 'rival');
    expect(owner).toBeDefined();
    if (!owner) return;

    const deer = tamedDeer(owner.id, state.nextEntityId++);
    state.entities.push(deer);
    expect(countTamedAnimals(state)).toBe(1);
    expect(isValidHuntPrey(deer, EntityType.Deer, owner.id + 10_000)).toBe(false);

    killHuman(owner, state.buildings, indexOf(state.entities));

    expect(deer.tamedBy).toBeUndefined();
    expect(countTamedAnimals(state)).toBe(0);
    expect(isValidHuntPrey(deer, EntityType.Deer, owner.id + 10_000)).toBe(true);
  });

  it('no longer charges the larder for the orphaned animal', () => {
    const state = initGame({ size: MapSize.Medium, seed: 1 });
    const owner = state.entities.find((e) => e.alive && e.type === EntityType.Human && e.faction !== 'rival');
    expect(owner).toBeDefined();
    if (!owner) return;

    const deer = tamedDeer(owner.id, state.nextEntityId++);
    state.entities.push(deer);
    state.resources.food = 50;
    state.year = 0;
    state.dayInYear = 10 % DAYS_PER_YEAR;

    killHuman(owner, state.buildings, indexOf(state.entities));
    tickAnimalCare(state);

    expect(state.resources.food).toBe(50);
  });
});
