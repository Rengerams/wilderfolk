/** Deterministic housing colonies for invariant suites: couples, minors, prisoners, overcrowding. */
import type { Building, Entity } from '../game/gameTypes';
import { BuildingType } from '../game/gameTypes';
import { createSeededRng } from '../game/simRng';
import { building, human } from './factories';

export interface HousingColony {
  humans: Entity[];
  buildings: Building[];
  houses: Building[];
  manor: Building;
  prison: Building;
  prisoners: Entity[];
}

export interface HousingColonyOptions {
  houses?: number;
  couples?: number;
  singles?: number;
  /** Settlers forced into the first house; default 9. */
  packed?: number;
  /** Share of settlers left without a home; default 0.25. */
  homelessShare?: number;
}

export function buildHousingColony(seed = 1, options: HousingColonyOptions = {}): HousingColony {
  const rand = createSeededRng(seed, 'housingColony');
  const houseCount = options.houses ?? 14;
  const houses: Building[] = [];
  for (let i = 0; i < houseCount; i++) {
    houses.push(building(100 + i, BuildingType.House, {
      x: 40 + (i % 7) * 24,
      y: 40 + Math.floor(i / 7) * 24,
      level: i % 5 === 0 ? 2 : 1,
    }));
  }
  const manor = building(900, BuildingType.LeaderHouse, { x: 0, y: 0 });
  const prison = building(901, BuildingType.Prison, { x: 0, y: 260 });
  const humans: Entity[] = [];
  const pairs: Array<[Entity, Entity]> = [];
  const singles: Entity[] = [];
  let nextId = 1;

  const adult = (): Entity => human(nextId++, {
    age: 20 + Math.floor(rand() * 30),
    isJuvenile: false,
    childrenIds: [],
  });

  for (let couple = 0; couple < (options.couples ?? 12); couple++) {
    const first = adult();
    const second = adult();
    first.partnerId = second.id;
    second.partnerId = first.id;
    pairs.push([first, second]);
    humans.push(first, second);
  }
  for (let single = 0; single < (options.singles ?? 4); single++) {
    const person = adult();
    singles.push(person);
    humans.push(person);
  }
  for (const [mother, father] of pairs) {
    const children = Math.floor(rand() * 3);
    for (let child = 0; child < children; child++) {
      humans.push(human(nextId++, {
        age: 2 + Math.floor(rand() * 13),
        isJuvenile: true,
        motherId: mother.id,
        fatherId: father.id,
        childrenIds: [],
      }));
    }
  }

  // A share start homeless, one house starts overcrowded, and some couples start split.
  for (const person of humans) {
    if (rand() < (options.homelessShare ?? 0.25)) continue;
    person.residenceBuildingId = houses[Math.floor(rand() * houses.length)].id;
  }
  for (const person of humans.slice(0, options.packed ?? 9)) person.residenceBuildingId = houses[0].id;
  if (humans.length > 30) humans[0].residenceBuildingId = houses[1].id;

  const prisoners = singles.slice(0, 2);
  for (const prisoner of prisoners) {
    prisoner.prisonBuildingId = prison.id;
    prisoner.prisonerUntilTick = 10_000;
    prisoner.residenceBuildingId = houses[1].id;
  }

  return { humans, buildings: [...houses, manor, prison], houses, manor, prison, prisoners };
}
