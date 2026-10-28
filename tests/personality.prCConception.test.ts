import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { EntityType, JobType } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import type { TickContext } from '../src/game/simulation/simulationTypes';
import { tryDailyConception } from '../src/game/simulation/humanRelationships';
import { ticksForDays } from '../src/game/dayCycleClock';
import { personDayRoll } from '../src/game/humanSchedule';

const MOTHER = 7001;
const FATHER = 7002;

function settler(id: number, traits: Entity['traits'], overrides: Partial<Entity> = {}): Entity {
  return {
    id, type: EntityType.Human, name: 'Settler' + id, alive: true,
    gender: id === MOTHER ? 'female' : 'male', age: 28,
    x: 100, y: 100, vx: 0, vy: 0, speed: 2, size: 10, flash: 0,
    energy: 200, maxEnergy: 200, birthYear: -28, job: JobType.Settler,
    relationshipStatus: 'married', reproductionCooldown: 0, traits, ...overrides,
  } as Entity;
}

function fixture(mother: Entity, father: Entity): { state: WorldState; ctx: TickContext } {
  const state = initGame({ seed: 20261028 });
  state.entities = [mother, father];
  state.villageLeaderId = null;
  const byType = {} as Record<EntityType, Entity[]>;
  for (const type of Object.values(EntityType)) byType[type] = [];
  byType[EntityType.Human] = [mother, father];
  const entityById = new Map([[mother.id, mother], [father.id, father]]);
  const ctx = {
    width: state.width, height: state.height, hourOfDay: 8,
    season: state.season, grassMult: 1, reproMult: 1, winterPenalty: 1, canHeat: true,
    byType, aliveEntities: [mother, father], newEntities: [], updatedBuildings: state.buildings,
    roadBuildings: [], playerHumans: [mother, father], entityById,
    buildingById: new Map(state.buildings.map(b => [b.id, b])), predators: [],
  } as TickContext;
  return { state, ctx };
}

function passingDay(salt: number): number {
  for (let day = 1; day < 10000; day++) {
    if (personDayRoll(MOTHER, ticksForDays(day), salt) < 0.001) return day;
  }
  throw new Error('No qualifying seeded conception day');
}

describe('PR C conception migration retains non-Lucky eligibility', () => {
  it.each([{ traits: [] }, { traits: ['lucky'] }, { traits: ['stoic'] }] as const)('allows married pregnancy without Lucky requirement: $traits', ({ traits }) => {
    const mother = settler(MOTHER, [...traits], { partnerId: FATHER });
    const father = settler(FATHER, [], { partnerId: MOTHER });
    const { state, ctx } = fixture(mother, father);
    state.tick = ticksForDays(passingDay(603));
    expect(tryDailyConception(state, ctx, mother)).toBe(true);
    expect(mother.pregnant).toBe(true);
  });

  it('retains youth-love conception without Lucky', () => {
    const mother = settler(MOTHER, [], {
      age: 16, isJuvenile: true, relationshipStatus: 'single',
      partnerId: undefined, youthLovePartnerId: FATHER,
    });
    const father = settler(FATHER, [], {
      age: 16, isJuvenile: true, relationshipStatus: 'single',
      partnerId: undefined, youthLovePartnerId: MOTHER,
    });
    const { state, ctx } = fixture(mother, father);
    state.tick = ticksForDays(passingDay(604));
    expect(tryDailyConception(state, ctx, mother)).toBe(true);
    expect(mother.pregnancyFromYouthLove).toBe(true);
  });
});
