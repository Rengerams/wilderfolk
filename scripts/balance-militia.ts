/**
 * Spear/militia balance scenarios — run: npx tsx scripts/balance-militia.ts
 */
import { BuildingType, EntityType } from '../src/game/gameTypes';
import type { Building, Entity, RivalSettlement, WorldState } from '../src/game/gameTypes';
import { computeMilitiaBreakdown } from '../src/game/militiaBalance';
import { getRivalRaidStrength, resolveDefenseRatio } from '../src/game/frontierCombat';
import { COMBAT_TECH } from '../src/game/combatTech';

function stubState(overrides: Partial<WorldState>): WorldState {
  return {
    width: 800,
    height: 600,
    tick: 0,
    entities: [],
    buildings: [],
    resources: { food: 500, wood: 200, stone: 100, gold: 50 },
    unlockedTechs: [],
    researchNodes: [],
    villageForge: { activeOrder: null, progress: 0, completed: {} },
    humanPopulation: 0,
    ...overrides,
  } as WorldState;
}

function adults(n: number): Entity[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    type: EntityType.Human,
    x: 100,
    y: 100,
    vx: 0,
    vy: 0,
    alive: true,
    energy: 80,
    size: 10,
    isJuvenile: false,
    faction: 'player' as const,
  }));
}

function withTech(
  state: WorldState,
  techs: string[],
  forge?: Partial<WorldState['villageForge']>,
): WorldState {
  return {
    ...state,
    unlockedTechs: techs,
    villageForge: { ...state.villageForge!, ...forge },
    buildings: [
      ...state.buildings,
      ...(techs.includes(COMBAT_TECH.ironSpears) || techs.includes(COMBAT_TECH.ironShields)
        ? [{
          id: 99,
          type: BuildingType.Blacksmith,
          x: 0,
          y: 0,
          width: 2,
          height: 2,
          occupants: [],
          level: 1,
          constructionProgress: 100,
          completed: true,
          health: 100,
          maxHealth: 100,
          spriteScale: 1,
          buildAnimTimer: 0,
        } as Building]
        : []),
    ],
  };
}

const rival: RivalSettlement = {
  id: 'r1',
  name: 'Test Camp',
  campX: 400,
  campY: 400,
  population: 8,
  relationship: 'tense',
  daysUntilAction: 10,
  raidCooldownDays: 0,
  peaceTreatyDays: 0,
};

const raidPower = getRivalRaidStrength(rival);

const scenarios: { label: string; state: WorldState; entities: Entity[] }[] = [
  {
    label: '10 adults, stone spears',
    state: withTech(stubState({}), [COMBAT_TECH.stoneSpears]),
    entities: adults(10),
  },
  {
    label: '10 adults, stone + wooden shields',
    state: withTech(stubState({}), [COMBAT_TECH.stoneSpears, COMBAT_TECH.woodenShields]),
    entities: adults(10),
  },
  {
    label: '10 adults, iron spears + iron shields (forged)',
    state: withTech(
      stubState({}),
      [COMBAT_TECH.stoneSpears, COMBAT_TECH.ironSpears, COMBAT_TECH.woodenShields, COMBAT_TECH.ironShields],
      { completed: { iron_spears: true, iron_shields: true } },
    ),
    entities: adults(10),
  },
  {
    label: '12 adults, iron only vs 8 pop tense rival + 3 walls',
    state: withTech(
      stubState({
        buildings: [
          { id: 1, type: BuildingType.Wall, x: 0, y: 0, width: 1, height: 1, occupants: [], level: 1, constructionProgress: 100, completed: true, health: 100, maxHealth: 100, spriteScale: 1, buildAnimTimer: 0 },
          { id: 2, type: BuildingType.Wall, x: 1, y: 0, width: 1, height: 1, occupants: [], level: 1, constructionProgress: 100, completed: true, health: 100, maxHealth: 100, spriteScale: 1, buildAnimTimer: 0 },
          { id: 3, type: BuildingType.Wall, x: 2, y: 0, width: 1, height: 1, occupants: [], level: 1, constructionProgress: 100, completed: true, health: 100, maxHealth: 100, spriteScale: 1, buildAnimTimer: 0 },
          { id: 99, type: BuildingType.Blacksmith, x: 5, y: 0, width: 2, height: 2, occupants: [], level: 1, constructionProgress: 100, completed: true, health: 100, maxHealth: 100, spriteScale: 1, buildAnimTimer: 0 },
        ],
      }),
      [COMBAT_TECH.stoneSpears, COMBAT_TECH.ironSpears],
      { completed: { iron_spears: true } },
    ),
    entities: adults(12),
  },
];

console.log(`Rival war-band (pop ${rival.population}, tense): ${raidPower}\n`);

for (const s of scenarios) {
  const b = computeMilitiaBreakdown(s.state, s.entities);
  const defendRatio = b.militiaStrength / raidPower;
  const barricadeRatio = b.barricadeStrength / raidPower;
  const defendTier = resolveDefenseRatio(b.militiaStrength, raidPower);
  const barricadeTier = resolveDefenseRatio(b.barricadeStrength, raidPower);
  console.log(`--- ${s.label}`);
  console.log(`  Militia ${b.militiaStrength} (${b.spearTier} / ${b.shieldTier}) → defend ${Math.round(defendRatio * 100)}% ${defendTier}`);
  console.log(`  Barricade ${b.barricadeStrength} → ${Math.round(barricadeRatio * 100)}% ${barricadeTier}`);
}