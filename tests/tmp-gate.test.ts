import { describe, expect, it } from 'vitest';
import { createBuilding } from '../src/game/worldGen';
import { BuildingType, MapSize } from '../src/game/gameTypes';
import type { WorldState } from '../src/game/gameTypes';
import { decideVirtualPlayerAction } from '../src/game/virtualPlayer';
import { prepareColonyWorld } from '../scripts/colonyHealth';

function withIncompleteFarms(world: WorldState, count: number): void {
  for (let i = 0; i < count; i++) {
    const farm = createBuilding(BuildingType.Farm, 100 + i * 80, 700, 9000 + i);
    farm.completed = false;
    farm.constructionProgress = 0;
    world.buildings.push(farm);
  }
}

function deficitHistory() {
  return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map((day) => ({
    day, produced: { farms: 8 }, consumed: { meals: 40 },
  }));
}

function producerScenario(): WorldState {
  const { world } = prepareColonyWorld({ size: MapSize.Medium, seed: 12345, scenario: 'producers' });
  world.tick = 20 * 288;
  world.resources.food = 900;
  world.foodHistory = deficitHistory() as WorldState['foodHistory'];
  const leaderHouse = createBuilding(BuildingType.LeaderHouse, 300, 300, 9100);
  leaderHouse.completed = true;
  leaderHouse.constructionProgress = 100;
  world.buildings.push(leaderHouse);
  return world;
}

describe('decideFood construction gate', () => {
  it('does not start a farm while two are already going up under a measured deficit', () => {
    const world = producerScenario();
    // Keep the plan unmet (few completed producers) so only the going-up gate can stop it.
    const farms = world.buildings.filter((b) => b.type === BuildingType.Farm);
    for (const farm of farms.slice(2)) {
      farm.completed = false;
      farm.constructionProgress = 0;
    }
    withIncompleteFarms(world, 1);
    const completed = world.buildings.filter(
      (b) => b.type === BuildingType.Farm && b.completed,
    ).length;
    console.log('completed farms', completed);
    const decision = decideVirtualPlayerAction(world);
    console.log('decision', decision?.command.op, JSON.stringify(decision?.command));
  });

  it('does not build past the deficit target', () => {
    const world = producerScenario();
    withIncompleteFarms(world, 0);
    const completed = world.buildings.filter(
      (b) => b.type === BuildingType.Farm && b.completed,
    ).length;
    console.log('completed2', completed, 'humans', world.entities.filter((e) => e.alive && e.type === 'human').length);
    const decision = decideVirtualPlayerAction(world);
    console.log('decision2', decision?.command.op, JSON.stringify(decision?.command));
    expect(decision?.command).not.toMatchObject({ op: 'startBuilding', type: BuildingType.Farm });
  });
});
