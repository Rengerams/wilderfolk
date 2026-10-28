import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { createEntity } from '../src/game/entityFactory';
import { EntityType } from '../src/game/gameTypes';
import type { Entity, SettlerTrait, WorldState } from '../src/game/gameTypes';
import { TICKS_PER_DAY } from '../src/game/dayCycleClock';
import { evaluateTraitInfluence } from '../src/game/personality/traitEvaluation';
import { applyWarCommunityReaction } from '../src/game/warPrisoners';

type Traits = readonly SettlerTrait[];

const COMMUNITY_REACTION = { kind: 'civic', activity: 'communityReaction' } as const;
const FIXTURE_SEED = 20_261_028;

/** AS-IS reference: one restraint voice for Nurturing OR Chivalrous, one severity voice for Fierce. */
const legacyRestraint = (traits: Traits | null | undefined): 0 | 1 =>
  (traits?.some((trait) => trait === 'nurturing' || trait === 'chivalrous') ? 1 : 0);
const legacySeverity = (traits: Traits | null | undefined): 0 | 1 => (traits?.includes('fierce') ? 1 : 0);

const voices = (traits: Traits | null | undefined) =>
  evaluateTraitInfluence({ traits }, COMMUNITY_REACTION).exact;

const traitSets: Array<Traits | null | undefined> = [
  undefined,
  null,
  [],
  ['nurturing'],
  ['chivalrous'],
  ['fierce'],
  ['brave'],
  ['nurturing', 'chivalrous'],
  ['nurturing', 'fierce'],
  ['chivalrous', 'fierce'],
  ['stoic', 'lucky'],
];

function villager(id: number, traits: Traits): Entity {
  const entity = createEntity(EntityType.Human, 300, 300, id, 80, false, { name: `V${id}` });
  entity.alive = true;
  entity.isJuvenile = false;
  entity.traits = [...traits];
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

describe('civic community reaction parity', () => {
  it('returns the two 0/1 voices exactly as the old direct checks did', () => {
    for (const traits of traitSets) {
      expect(voices(traits), JSON.stringify(traits)).toEqual({
        activity: 'communityReaction',
        restraintVoice: legacyRestraint(traits),
        severityVoice: legacySeverity(traits),
      });
    }
  });

  it('deduplicates Nurturing plus Chivalrous to one restraint voice and lets Fierce coexist', () => {
    expect(voices(['nurturing', 'chivalrous']).restraintVoice).toBe(1);
    expect(voices(['nurturing', 'chivalrous']).severityVoice).toBe(0);
    expect(voices(['fierce', 'nurturing'])).toEqual({
      activity: 'communityReaction',
      restraintVoice: 1,
      severityVoice: 1,
    });
  });

  it('keeps the exact result away from the bounded factor', () => {
    const influence = evaluateTraitInfluence({ traits: ['fierce'] }, COMMUNITY_REACTION);
    expect(influence.factor).toBe(1);
    expect(influence.tendency).toBe(0);
  });

  it('sums the same per-villager voices into the unchanged opinion and message', () => {
    const people = [villager(1, ['nurturing']), villager(2, ['chivalrous']), villager(3, ['fierce'])];
    const state = world(people);
    applyWarCommunityReaction(state, 'execution', 'rival-1');
    expect(lastMessage(state)).toContain('Community reaction to execution: 2 favor restraint, 1 favor severity');
    expect(lastMessage(state)).toContain('no recent attack or active war');
    // sentiment = 1 severity + 0 threat - 2 restraint = -1 with a 3-villager population.
    expect(lastMessage(state)).toContain('leadership standing -2');
    expect(state.villageReputation).toBe(48);
  });

  it('lets a Fierce Nurturing villager speak in both categories', () => {
    const state = world([villager(1, ['nurturing', 'fierce'])]);
    applyWarCommunityReaction(state, 'tribute', 'rival-1');
    expect(lastMessage(state)).toContain('1 favor restraint, 1 favor severity');
    expect(lastMessage(state)).toContain('leadership standing 0');
    expect(state.villageReputation).toBe(50);
  });

  it('keeps the threat voices, choice polarity and half-intensity tribute', () => {
    const people = [villager(1, ['nurturing']), villager(2, ['brave']), villager(3, ['brave']), villager(4, ['brave'])];
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
    const dead = villager(2, ['nurturing']);
    dead.alive = false;
    const rival = villager(3, ['nurturing']);
    rival.faction = 'rival';
    const state = world([villager(1, ['fierce']), dead, rival]);
    applyWarCommunityReaction(state, 'execution', 'rival-1');
    expect(lastMessage(state)).toContain('0 favor restraint, 1 favor severity');
  });

  it('keeps the leader merit cap and the five outcome polarities', () => {
    for (const choice of ['release', 'execution', 'mercy', 'tribute', 'raze'] as const) {
      const people = [villager(1, ['fierce']), villager(2, ['brave'])];
      const state = world(people);
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
    const state = world([villager(1, ['fierce'])]);
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
