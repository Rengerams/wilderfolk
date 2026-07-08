import { afterEach, describe, expect, it, vi } from 'vitest';
import { initGame } from '@/game/gameEngine';
import { createEntity } from '@/game/worldGen';
import { EntityType, Season } from '@/game/gameTypes';
import type { WorldState } from '@/game/gameTypes';
import { tickHumans, type TickContext } from '@/game/lifeSimulation';
import { isPlayerHuman } from '@/game/groupEvents';
import { withLifeAge } from '@/test/fixtures/gameFixtures';

function buildTickCtx(state: WorldState, hourOfDay = 20): TickContext {
  const alive = state.entities.filter((e) => e.alive);
  const playerHumans = alive.filter(isPlayerHuman);
  const byType = Object.fromEntries(
    Object.values(EntityType).map((type) => [type, [] as typeof alive]),
  ) as TickContext['byType'];
  byType[EntityType.Human] = alive.filter((e) => e.type === EntityType.Human);

  return {
    width: state.width,
    height: state.height,
    hourOfDay,
    season: state.season ?? Season.Spring,
    grassMult: 1,
    reproMult: 1,
    winterPenalty: 0,
    canHeat: true,
    byType,
    newEntities: [],
    updatedBuildings: state.buildings,
    roadBuildings: [],
    playerHumans,
    entityById: new Map(alive.map((e) => [e.id, e])),
    buildingById: new Map(state.buildings.map((b) => [b.id, b])),
    predators: [],
  };
}

describe('courtship marriage chat', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sets Yes! bubbles on both partners when courtship completes', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1);

    const state = initGame();
    state.tick = 7;

    const male = createEntity(EntityType.Human, 200, 200, 1, 250, false, {
      gender: 'male',
      surname: 'A',
    });
    const female = createEntity(EntityType.Human, 205, 200, 2, 250, false, {
      gender: 'female',
      surname: 'B',
    });
    withLifeAge(male, 25);
    withLifeAge(female, 25);
    male.faction = undefined;
    female.faction = undefined;
    male.relationshipStatus = 'single';
    female.relationshipStatus = 'single';
    male.courtshipProgress = 100;
    female.courtshipProgress = 100;
    male.energy = 200;
    female.energy = 200;

    state.entities = [male, female];

    tickHumans(state, buildTickCtx(state, 20));

    expect(male.relationshipStatus).toBe('married');
    expect(female.relationshipStatus).toBe('married');
    expect(male.partnerId).toBe(female.id);
    expect(female.partnerId).toBe(male.id);
    expect(male.chatPhrase).toBe('Yes!');
    expect(female.chatPhrase).toBe('Yes!');
    expect(male.chatTicks).toBe(120);
    // Female is processed later in the same tick; tickHumanChat decrements once after marriage.
    expect(female.chatTicks).toBe(119);
  });
});