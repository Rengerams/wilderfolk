/**
 * Temporary probe (local-only, gitignored, safe to delete).
 *
 * WHY: the reported rule gaps are "it ignores iron at 0" and "it does not build houses".
 * This drives the REAL decision engine on real `initGame` worlds whose stores are set to
 * the state being asked about, and prints what the bot answers for each — including
 * "nothing", which is the interesting case.
 */
import { initGame } from '../src/game/gameEngine';
import { BuildingType, MapSize } from '../src/game/gameTypes';
import type { Building, WorldState } from '../src/game/gameTypes';
import { createBuilding } from '../src/game/worldGen';
import { decideVirtualPlayerAction } from '../src/game/virtualPlayer';
import { isPlayerHuman, playerHumanCount } from '../src/game/playerHuman';

function complete(building: Building, occupants: number[]): Building {
  building.completed = true;
  building.constructionProgress = 100;
  building.health = 100;
  building.maxHealth = 100;
  building.occupants = occupants;
  return building;
}

/** A real colony with the early steps satisfied, so a resource rule is what answers. */
function settled(stores: Partial<WorldState['resources']> = {}): WorldState {
  const world = initGame({ size: MapSize.Medium, seed: 4242 });
  const ids = world.entities.filter(isPlayerHuman).map((entity) => entity.id);
  world.buildings.push(complete(createBuilding(BuildingType.LeaderHouse, 100, 100, 90), []));
  world.buildings.push(complete(createBuilding(BuildingType.House, 200, 200, 1), [...ids]));
  world.buildings.push(complete(createBuilding(BuildingType.Farm, 260, 200, 2), ids.slice(0, 2)));
  for (const entity of world.entities) {
    if (!isPlayerHuman(entity)) continue;
    entity.residenceBuildingId = 1;
    entity.homeBuildingId = 2;
  }
  Object.assign(world.resources, stores);
  return world;
}

function answer(label: string, world: WorldState): void {
  const decision = decideVirtualPlayerAction(world);
  const stores = `wood=${world.resources.wood} stone=${world.resources.stone} food=${world.resources.food} gold=${world.resources.gold} iron=${world.resources.iron}`;
  console.log(`${label}`);
  console.log(`   ${stores}`);
  console.log(`   -> ${decision ? `${decision.command.op} (${'type' in decision.command ? decision.command.type : ''}) — ${decision.reason}` : 'NOTHING'}`);
  console.log('');
}

console.log(`settlers=${playerHumanCount(settled().entities)}\n`);

answer('A. iron 0, plenty of everything else, no Mine', settled({ iron: 0, wood: 500, stone: 200, gold: 200 }));
answer('B. gold 0, iron fine (50), no Mine — is anything built to earn gold?', settled({ iron: 50, gold: 0, wood: 500, stone: 200 }));
answer('C. wood 0 and stone 0 (nothing buildable is affordable)', settled({ wood: 0, stone: 0, gold: 40, iron: 0 }));
answer('D. homeless settlers, no spare bed, wood 0 (house unaffordable)', (() => {
  const world = settled({ wood: 0, stone: 0, gold: 40, iron: 0 });
  const extra = world.entities.filter(isPlayerHuman).slice(0, 1).map((entity) => entity.id);
  for (const id of extra) {
    const entity = world.entities.find((candidate) => candidate.id === id);
    if (entity) entity.residenceBuildingId = undefined; // homeless
  }
  world.buildings.find((building) => building.id === 1)!.occupants = [];
  return world;
})());
answer('E. no food producer, full larder', (() => {
  const world = settled({ iron: 30, wood: 500, stone: 200, gold: 200 });
  world.buildings = world.buildings.filter((building) => building.type !== BuildingType.Farm);
  return world;
})());

// The storage question: does the bot ever answer "the granary is nearly full"?
const full = settled({ iron: 30, wood: 500, stone: 200, gold: 200 });
full.resources.food = full.storageMax.food;
for (const key of ['wood', 'stone', 'gold', 'iron'] as const) full.resources[key] = full.storageMax[key];
answer('F. every store at its cap (storage pressure)', full);

/** Same world, but no research is available — isolates "research starves the economy". */
function noResearchLeft(world: WorldState): WorldState {
  for (const node of world.researchNodes) node.researched = true;
  return world;
}

answer('A2. iron 0 with nothing left to research (isolates the ladder order)',
  noResearchLeft(settled({ iron: 0, wood: 500, stone: 200, gold: 200 })));
answer('B2. gold 0, iron fine, nothing left to research (the gold trap)',
  noResearchLeft(settled({ iron: 50, gold: 0, wood: 500, stone: 200 })));
answer('H. gold 20 (a Mine is affordable), iron fine, no Mine — producer or storage?',
  noResearchLeft(settled({ iron: 50, gold: 20, wood: 500, stone: 200 })));
answer('G. stone 0 with wood to spare (the Quarry costs stone it does not exist yet)',
  noResearchLeft(settled({ iron: 30, wood: 400, stone: 0, gold: 200 })));
