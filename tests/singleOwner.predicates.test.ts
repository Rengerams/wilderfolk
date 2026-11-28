import { isMarriedOrExpecting } from '../src/game/relationships';
/**
 * Each "one rule" has a single owner: the colony-human predicate in `playerHuman`, the predator set
 * in `combat`, and "what is a wall" in `defenseStructures`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BuildingType, EntityType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { isPlayerHuman } from '../src/game/playerHuman';
import { isPredatorType, PREDATOR_TYPES } from '../src/game/combat';
import { isWallBuildingType } from '../src/game/defenseStructures';
import { collectStripCenters } from '../src/game/stripJunction';
import { initGame } from '../src/game/worldGen';
import { createEntity } from '../src/game/entityFactory';
import { simulateElectionVotes } from '../src/game/electionVotes';

const sfx = vi.hoisted(() => ({
  playHumanHuntSfx: vi.fn(),
  playPredatorHuntSfx: vi.fn(),
  playMoonHowlerSfx: vi.fn(),
  playTameSfx: vi.fn(),
  playTransformSfx: vi.fn(),
  playSettlerDeathSfx: vi.fn(),
}));
vi.mock('../src/audio/interactionSfx', () => ({
  playHumanHuntSfx: sfx.playHumanHuntSfx,
  playPredatorHuntSfx: sfx.playPredatorHuntSfx,
  playMoonHowlerSfx: sfx.playMoonHowlerSfx,
  playTameSfx: sfx.playTameSfx,
  playTransformSfx: sfx.playTransformSfx,
  playSettlerDeathSfx: sfx.playSettlerDeathSfx,
}));
import { detectInteractionSounds } from '../src/audio/interactionDetect';

/**
 * An entity carrying a faction string outside the declared union; `faction` is parsed from save data,
 * so such a value is representable at runtime.
 */
function humanWithFaction(id: number, faction?: string): Entity {
  const human = { id, type: EntityType.Human, x: 0, y: 0, alive: true, age: 30 } as Entity;
  return Object.assign(human, { faction });
}

describe('A3 — the colony-human rule has one owner', () => {
  it('is a player human only while no foreign faction is set', () => {
    expect(isPlayerHuman(humanWithFaction(1))).toBe(true);
    for (const faction of ['visitor', 'rival', 'trade_caravan']) {
      expect(isPlayerHuman(humanWithFaction(2, faction)), `${faction} counted as a colonist`).toBe(false);
    }
  });

  it('keeps the explicit `player` marker the suite writes player-owned', () => {
    // `player` is outside `Entity['faction']` and only classified foreign factions may be excluded,
    // so this marker must stay a colonist.
    expect(isPlayerHuman(humanWithFaction(3, 'player'))).toBe(true);
  });

  it('never counts a non-human as a colonist', () => {
    expect(isPlayerHuman({ id: 4, type: EntityType.Deer, x: 0, y: 0, alive: true } as Entity)).toBe(false);
  });

  it('keeps foreign-faction humans off the ballot and player-marked ones on it', () => {
    const state: WorldState = initGame({ villageName: 'Owner', size: 'medium' });
    state.entities = state.entities.filter((e) => e.type !== EntityType.Human);
    // `'player'` is the explicit player-owned marker the union does not name; only classified foreign
    // factions are excluded, so this voter stays on the ballot.
    const voters: [number, string | undefined][] = [[1, undefined], [2, 'visitor'], [3, 'rival'], [4, 'player']];
    for (const [id, faction] of voters) {
      const voter = createEntity(EntityType.Human, 300, 300, id, 80, false, { name: `V${id}`, ageYears: 30 });
      voter.alive = true;
      state.entities.push(Object.assign(voter, { faction }));
    }
    const result = simulateElectionVotes(state, [{ entityId: 10, name: 'C10', totalScore: 100 }]);
    expect(result.totalVotes).toBe(2);
  });
});

type HuntCue = 'human' | 'predator' | 'howler';

const HUNT_CUE: Partial<Record<EntityType, HuntCue>> = {
  [EntityType.Human]: 'human',
  [EntityType.Wolf]: 'predator',
  [EntityType.Fox]: 'predator',
  [EntityType.Werewolf]: 'howler',
};

function beast(id: number, type: EntityType, x: number, y: number, alive = true): Entity {
  return { id, type, x, y, alive } as Entity;
}

describe('A10 — one predator definition across the sim/audio boundary', () => {
  beforeEach(() => {
    for (const fn of Object.values(sfx)) fn.mockClear();
  });

  it('the simulation calls a wolf, a fox and a werewolf a predator — never a human', () => {
    expect([...PREDATOR_TYPES].sort()).toEqual(
      [EntityType.Wolf, EntityType.Fox, EntityType.Werewolf].sort(),
    );
    for (const type of [EntityType.Wolf, EntityType.Fox, EntityType.Werewolf]) {
      expect(isPredatorType(type), `${type} is a predator`).toBe(true);
    }
    for (const type of [EntityType.Human, EntityType.Rabbit, EntityType.Deer, EntityType.Wildkin]) {
      expect(isPredatorType(type), `${type} is not a predator`).toBe(false);
    }
  });

  it('plays the cue for the hunter that is there, and silence for anything that is not a hunter', () => {
    const cues = {
      human: sfx.playHumanHuntSfx,
      predator: sfx.playPredatorHuntSfx,
      howler: sfx.playMoonHowlerSfx,
    };
    for (const type of Object.values(EntityType) as EntityType[]) {
      const expected = HUNT_CUE[type];
      const rabbit = (alive: boolean) => beast(1, EntityType.Rabbit, 0, 0, alive);
      detectInteractionSounds([rabbit(true), beast(2, type, 10, 0)], [rabbit(false), beast(2, type, 10, 0)]);
      const sounded = Object.values(cues).reduce((n, fn) => n + fn.mock.calls.length, 0);
      if (expected) {
        for (const [name, fn] of Object.entries(cues)) {
          expect(fn.mock.calls.length, `${type} played the ${name} hunt cue`).toBe(expected === name ? 1 : 0);
        }
      } else if (isPredatorType(type)) {
        // A predator the simulation adds is heard through the composed set without a new branch.
        expect(sounded, `simulated predator ${type} is heard as nothing`).toBe(1);
      } else {
        expect(sounded, `${type} is not a hunter but made a hunt noise`).toBe(0);
      }
      for (const fn of Object.values(sfx)) fn.mockClear();
    }
  });
});

function stubBuilding(id: number, type: BuildingType, x: number, y: number): Building {
  return {
    id,
    type,
    x,
    y,
    width: 20,
    height: 20,
    occupants: [],
    level: 1,
    constructionProgress: 100,
    completed: true,
    health: 100,
    maxHealth: 100,
    spriteScale: 1,
    buildAnimTimer: 0,
    rotation: 0,
  };
}

describe('A11 — "what is a wall" has one owner', () => {
  it('classifies Wall and WallGate as walls and nothing else', () => {
    expect(isWallBuildingType(BuildingType.Wall)).toBe(true);
    expect(isWallBuildingType(BuildingType.WallGate)).toBe(true);
    for (const type of [BuildingType.House, BuildingType.Road, BuildingType.Farm]) {
      expect(isWallBuildingType(type), `${type} is not a wall`).toBe(false);
    }
  });

  it('keeps both wall types in the strip family the junction pass collects', () => {
    const buildings = [
      stubBuilding(1, BuildingType.Wall, 100, 100),
      stubBuilding(2, BuildingType.WallGate, 200, 100),
      stubBuilding(3, BuildingType.House, 300, 100),
    ];
    const { hList, vList } = collectStripCenters(buildings, 'wall');
    expect(hList.length + vList.length, 'a wall type dropped out of the strip family').toBe(2);
  });
});

describe('one definition of "in an active marriage"', () => {
  it('counts expecting as married, because conception sets both partners to it', () => {
    expect(isMarriedOrExpecting({ relationshipStatus: 'married' })).toBe(true);
    expect(isMarriedOrExpecting({ relationshipStatus: 'expecting', partnerId: 1 })).toBe(true);
    expect(isMarriedOrExpecting({ relationshipStatus: 'expecting' })).toBe(false);
    expect(isMarriedOrExpecting({ relationshipStatus: 'single' })).toBe(false);
    expect(isMarriedOrExpecting({ relationshipStatus: undefined })).toBe(false);
  });






});
