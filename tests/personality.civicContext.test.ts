import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { createEntity } from '../src/game/entityFactory';
import { EntityType } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import type { GenomeV2 } from '../src/game/settlerTraits';
import { TICKS_PER_DAY } from '../src/game/dayCycleClock';
import { evaluateAptitudeInfluence } from '../src/game/personality/traitEvaluation';
import { applyWarCommunityReaction } from '../src/game/warPrisoners';
import { genomeFrom } from './helpers/genome';

const FIXTURE_SEED = 20_261_028;

/** Above the civic-voice band: a restraint (mercy/empathy) voice. */
const RESTRAINT_GENOME = genomeFrom({ cooperation: 95, sensitivity: 95, flexibility: 90, discipline: 90, riskTaking: 5 });
/** Below the civic-voice band: a severity voice. */
const SEVERITY_GENOME = genomeFrom({ cooperation: 5, sensitivity: 5, flexibility: 5, discipline: 5, riskTaking: 95 });

const civicFactor = (genomeV2: GenomeV2): number =>
  evaluateAptitudeInfluence({ genomeV2 }, 'communityReaction').factor;

function villager(id: number, genomeV2: GenomeV2): Entity {
  const entity = createEntity(EntityType.Human, 300, 300, id, 80, false, { name: `V${id}` });
  entity.alive = true;
  entity.isJuvenile = false;
  entity.genomeV2 = genomeV2;
  return entity;
}

function world(people: Entity[]): WorldState {
  const state = initGame({ villageName: 'Muster', size: 'medium', seed: FIXTURE_SEED });
  state.entities = people;
  state.villageLeaderId = people[0]?.id;
  state.villageReputation = 50;
  return state;
}

const lastMessage = (state: WorldState): string => state.eventLog[0]?.message ?? '';

describe('civic community reaction reads the communityReaction activity', () => {
  it('turns a profile above the band into a restraint voice and below it into severity', () => {
    expect(civicFactor(RESTRAINT_GENOME)).toBeGreaterThan(1.04);
    expect(civicFactor(SEVERITY_GENOME)).toBeLessThan(0.96);
    expect(civicFactor(genomeFrom())).toBe(1);
  });

  it('sums the per-villager voices into the opinion and message', () => {
    const people = [
      villager(1, RESTRAINT_GENOME),
      villager(2, RESTRAINT_GENOME),
      villager(3, SEVERITY_GENOME),
    ];
    const state = world(people);
    applyWarCommunityReaction(state, 'execution', 'rival-1');
    expect(lastMessage(state)).toContain('Community reaction to execution: 2 favor restraint, 1 favor severity');
    expect(lastMessage(state)).toContain('no recent attack or active war');
    // sentiment = 1 severity + 0 threat - 2 restraint = -1 with a 3-villager population.
    expect(lastMessage(state)).toContain('leadership standing -2');
    expect(state.villageReputation).toBe(48);
  });

  it('leaves a neutral villager without a voice', () => {
    const state = world([villager(1, genomeFrom())]);
    applyWarCommunityReaction(state, 'tribute', 'rival-1');
    expect(lastMessage(state)).toContain('0 favor restraint, 0 favor severity');
    expect(lastMessage(state)).toContain('leadership standing 0');
    expect(state.villageReputation).toBe(50);
  });

  it('keeps the threat voices, choice polarity and half-intensity tribute', () => {
    const people = [
      villager(1, RESTRAINT_GENOME),
      villager(2, genomeFrom()),
      villager(3, genomeFrom()),
      villager(4, genomeFrom()),
    ];
    const state = world(people);
    state.rivalSettlements = [{ id: 'rival-1', atWarWithPlayer: true } as WorldState['rivalSettlements'][number]];
    applyWarCommunityReaction(state, 'tribute', 'rival-1');
    expect(lastMessage(state)).toContain('1 favor restraint, 0 favor severity');
    expect(lastMessage(state)).toContain('recent attack or active war');
    // sentiment = 0 + ceil(4/4) - 1 = 0 at half intensity: no merit, no reputation change.
    expect(lastMessage(state)).toContain('leadership standing 0');
    expect(state.villageReputation).toBe(50);
  });

  it('excludes the dead and foreign villagers from the voice count', () => {
    const dead = villager(2, RESTRAINT_GENOME);
    dead.alive = false;
    const rival = villager(3, RESTRAINT_GENOME);
    rival.faction = 'rival';
    const state = world([villager(1, SEVERITY_GENOME), dead, rival]);
    applyWarCommunityReaction(state, 'execution', 'rival-1');
    expect(lastMessage(state)).toContain('0 favor restraint, 1 favor severity');
  });

  it('keeps the leader merit cap and the five outcome polarities', () => {
    for (const choice of ['release', 'execution', 'mercy', 'tribute', 'raze'] as const) {
      const state = world([villager(1, SEVERITY_GENOME), villager(2, genomeFrom())]);
      applyWarCommunityReaction(state, choice, 'rival-1');
      const coercive = choice === 'execution' || choice === 'tribute' || choice === 'raze';
      const expectedSign = coercive ? '+' : '-';
      expect(lastMessage(state), choice).toContain(`leadership standing ${expectedSign}`);
      const leader = state.entities[0];
      const merit = leader.battleLeadershipMerit ?? 0;
      expect(Math.abs(merit)).toBeLessThanOrEqual(100);
      expect(Math.abs(merit)).toBeGreaterThan(0);
      const intensity = choice === 'tribute' ? 0.5 : 1;
      const expected = Math.max(1, Math.round(5 * intensity * 1 / 2));
      expect(Math.abs(merit), choice).toBe(expected);
    }
  });

  it('keeps the repeat-attack window at 30 days', () => {
    const state = world([villager(1, SEVERITY_GENOME)]);
    state.raidBattleReports = [{
      raidId: 'raid-1',
      rivalId: 'rival-1',
      side: 'defense',
      resolvedAtTick: state.tick - 29 * TICKS_PER_DAY,
    } as NonNullable<WorldState['raidBattleReports']>[number]];
    applyWarCommunityReaction(state, 'execution', 'rival-1');
    expect(lastMessage(state)).toContain('recent attack or active war');

    state.raidBattleReports = [{
      raidId: 'raid-2',
      rivalId: 'rival-1',
      side: 'defense',
      resolvedAtTick: state.tick - 31 * TICKS_PER_DAY,
    } as NonNullable<WorldState['raidBattleReports']>[number]];
    applyWarCommunityReaction(state, 'execution', 'rival-1');
    expect(lastMessage(state)).toContain('no recent attack or active war');
  });
});
