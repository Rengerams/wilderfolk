/**
 * A3 / A10 / A11 — "one rule, two or more definitions"
 * (`docs/private/audits/2026-09-16/duplication-deadcode.md`, tracked in
 * `LIVE-FINDINGS-STATUS.md`).
 *
 * A3  the colony-human predicate is defined once, in `playerHuman.isPlayerHuman`, and decides by
 *     the *classified* `Entity['faction']` union — the six hand-copied
 *     `alive && type === Human && !faction` tests are gone, and a newly added faction cannot join
 *     the colony silently because the owner's classification `Record` stops compiling until it is
 *     classified.
 * A10 `combat.ts` owns what the *simulation* calls a predator; the audio layer composes its
 *     own, differently-defined "hunt-noise source" set out of it instead of keeping a second
 *     identically-named copy.
 * A11 "what is a wall" is defined once, by `defenseStructures.isWallBuildingType`; the strip
 *     modules read it instead of keeping private sets.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

function source(relPath: string): string {
  return readFileSync(resolve(process.cwd(), relPath), 'utf8');
}

/**
 * An entity carrying a faction string the declared union does not name yet. `faction` is
 * parsed from save data, so such a value is representable at runtime even though TypeScript
 * cannot express it — the widened intersection types exactly like a known faction.
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
    // The marker is a string outside `Entity['faction']`, and the only writers left are
    // `scripts/balance-militia.ts` and the handful of fixtures in other lanes that still carry it.
    // Only *classified* foreign factions may be excluded, so this must stay a colonist — the rule
    // is "not a foreign faction", not "any faction means not ours".
    expect(isPlayerHuman(humanWithFaction(3, 'player'))).toBe(true);
  });

  it('classifies the union at the type level, not by a hand-maintained list', () => {
    expect(source('src/game/playerHuman.ts')).toMatch(
      /Record<NonNullable<Entity\['faction'\]>, boolean>/,
    );
  });

  it('never counts a non-human as a colonist', () => {
    expect(isPlayerHuman({ id: 4, type: EntityType.Deer, x: 0, y: 0, alive: true } as Entity)).toBe(false);
  });

  it('keeps foreign-faction humans off the ballot and player-marked ones on it', () => {
    const state: WorldState = initGame({ villageName: 'Owner', size: 'medium' });
    state.entities = state.entities.filter((e) => e.type !== EntityType.Human);
    // `'player'` is the explicit player-owned marker the union does not name. The hand-copied
    // `!e.faction` filter this file used to hold excluded that voter, so the copies disagreed with
    // the owner on a value the suite genuinely writes — live, not only latent. The marker is now
    // gone from this lane's fixtures, but the runtime rule it exercises must keep working.
    const voters: [number, string | undefined][] = [[1, undefined], [2, 'visitor'], [3, 'rival'], [4, 'player']];
    for (const [id, faction] of voters) {
      const voter = createEntity(EntityType.Human, 300, 300, id, 80, false, { name: `V${id}` });
      voter.alive = true;
      state.entities.push(Object.assign(voter, { faction }));
    }
    const result = simulateElectionVotes(state, [{ entityId: 10, name: 'C10', totalScore: 100 }]);
    expect(result.totalVotes).toBe(2);
  });

  it('leaves no module re-deriving the colony-human test', () => {
    const copy = /\.alive\s*&&\s*![\w.]+\.faction|\.type === EntityType\.Human\s*&&\s*![\w.]+\.faction/;
    const readers = [
      'src/App.tsx',
      'src/game/apprenticeships.ts',
      'src/game/relationships.ts',
      'src/game/electionVotes.ts',
      'src/game/residencyOccupancy.ts',
      'src/game/residencySelection.ts',
      'src/game/residencyReconciliation.ts',
      'src/game/workforce.ts',
      'src/game/scheduleFeedback.ts',
      'src/game/leaderHouse.ts',
      'src/game/moonHowler.ts',
      'src/components/SimulationDiagnosticsPanel.tsx',
    ];
    for (const rel of readers) {
      const src = source(rel);
      // Either owner accessor counts: `playerHumansFrom` is the owner's own list helper beside
      // `isPlayerHuman` (same module, `playerHuman.ts`), added so a caller that needs the whole list
      // does one filter instead of re-deriving the predicate. Both are the owner's rule.
      expect(src, `${rel} no longer asks the owner`).toMatch(/isPlayerHuman|playerHumansFrom/);
      expect(src, `${rel} re-derives the colony-human test`).not.toMatch(copy);
    }

    // Two modules left this list because they stopped *classifying* humans at all rather than switching
    // to the owner: the Church card asks `moonHowler.countStaffedPriests` (O-6) and the work-schedule
    // panel asks `readVillageFatigue` (O-8), and each owner applies `isPlayerHuman` for them. They are
    // still held to the half that matters — they must not re-derive the test either.
    for (const rel of [
      'src/components/SelectedBuildingPanel.tsx',
      'src/components/WorkSchedulePanel.tsx',
    ]) {
      expect(source(rel), `${rel} re-derives the colony-human test`).not.toMatch(copy);
    }
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

  it('keeps the audio layer reading the simulation set instead of re-declaring it', () => {
    const audio = source('src/audio/interactionDetect.ts');
    expect(audio, 'the audio layer no longer reads the simulation predator owner').toMatch(
      /import \{[^}]*PREDATOR_TYPES[^}]*\} from '\.\.\/game\/combat'/,
    );
    expect(audio, 'the audio layer re-declares the simulation predator set').not.toMatch(
      /const PREDATOR_TYPES = new Set<EntityType>\(/,
    );
    const combat = source('src/game/combat.ts');
    expect(combat, 'the simulation predator owner is no longer exported').toMatch(
      /export const PREDATOR_TYPES: ReadonlySet<EntityType> = /,
    );
    expect((combat.match(/new Set<EntityType>\(/g) ?? []).length, 'combat holds a second predator set').toBe(1);
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

  it('leaves the strip modules reading the exported owner', () => {
    const junction = source('src/game/stripJunction.ts');
    expect(junction, 'stripJunction no longer reads the wall owner').toMatch(
      /isWallBuildingType[^;]*from '\.\/defenseStructures'/,
    );
    expect(junction, 'stripJunction declares a second wall set').not.toMatch(
      /const WALL_TYPES = new Set<BuildingType>\(/,
    );
    const topology = source('src/game/stripTopology.ts');
    expect(topology, 'stripTopology no longer reads the wall owner').toMatch(
      /isWallBuildingType[^;]*from '\.\/defenseStructures'/,
    );
    expect(topology, 'stripTopology declares a second wall set').not.toMatch(/WALL_STRIP_TYPES/);
  });
});
