import { describe, expect, it } from 'vitest';
import { computePopulationCounts } from '../src/game/entityCounts';
import { EntityType, type Entity } from '../src/game/gameTypes';
import { human } from '../src/test/factories';

describe('population census', () => {
  it('counts traders as transient visitor humans instead of dropping them', () => {
    const trader = { id: 7, type: EntityType.Human, faction: 'trade_caravan', alive: true } as Entity;
    const counts = computePopulationCounts([trader]);
    expect(counts.visitorHumans).toBe(1);
    expect(counts.humans).toBe(0);
  });
  it('counts the temporary werewolf form as one of the colony people', () => {
    const settler = human(1);
    settler.type = EntityType.Werewolf;
    settler.moonHowlerCursed = true;
    settler.moonHowlerSaved = {} as never;

    const counts = computePopulationCounts([settler]);

    expect(counts.humans).toBe(1);
    expect(counts.werewolves).toBe(0);
  });
});
