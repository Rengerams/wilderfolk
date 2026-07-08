import { afterEach, describe, expect, it, vi } from 'vitest';
import { EntityType } from '@/game/gameTypes';
import type { Entity, WorldState } from '@/game/gameTypes';
import { initGame } from '@/game/gameEngine';
import { createEntity } from '@/game/worldGen';
import { withLifeAge } from '@/test/fixtures/gameFixtures';
import {
  findFoundingColonyLeader,
  getElectionGatherTarget,
  getIncumbentRecordAssessment,
  isElectionCeremonyActive,
  startElectionCeremony,
  tickElectionCeremony,
  tickElectionGossip,
} from '@/game/villageLeadership';

function minimalWorld(overrides: Partial<WorldState> = {}): WorldState {
  const base = initGame();
  return {
    ...base,
    entities: [],
    buildings: [],
    eventLog: [],
    electionCeremony: null,
    ...overrides,
  };
}

function adultHuman(id: number, gender: 'male' | 'female', name: string): Entity {
  const human = createEntity(EntityType.Human, 0, 0, id, 250, false);
  withLifeAge(human, 30);
  human.gender = gender;
  human.name = name;
  human.faction = undefined;
  return human;
}

function ceremonyState(
  phase: 'gathering' | 'gossip' | 'tension' | 'reveal',
  pendingLeaderId: number,
  pendingLeaderName: string,
) {
  return {
    phase,
    phaseTicksLeft: phase === 'reveal' ? 1 : 10,
    gatherX: 100,
    gatherY: 100,
    reason: 'decennial' as const,
    pendingLeaderId,
    pendingLeaderName,
    pendingChanged: true,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('findFoundingColonyLeader', () => {
  it('prefers the first male pioneer but falls back to a female founder', () => {
    const female = adultHuman(2, 'female', 'Ada');
    const male = adultHuman(1, 'male', 'John');
    expect(findFoundingColonyLeader(minimalWorld({ entities: [female, male] }))?.id).toBe(1);

    const onlyFemale = minimalWorld({ entities: [female] });
    expect(findFoundingColonyLeader(onlyFemale)?.id).toBe(2);
  });
});

describe('getElectionGatherTarget', () => {
  it('gives each attendee a distinct ring slot', () => {
    const entities = Array.from({ length: 25 }, (_, i) => adultHuman(i + 1, i % 2 === 0 ? 'male' : 'female', `Settler${i}`));
    const world = minimalWorld({
      entities,
      electionCeremony: {
        phase: 'gathering',
        phaseTicksLeft: 5,
        gatherX: 100,
        gatherY: 100,
        reason: 'decennial',
        pendingLeaderId: 1,
        pendingLeaderName: 'Settler0',
        pendingChanged: true,
      },
    });

    const targets = entities.map((entity) => getElectionGatherTarget(world, entity.id));
    const unique = new Set(targets.map((t) => `${t.x.toFixed(1)},${t.y.toFixed(1)}`));
    expect(unique.size).toBe(25);
  });
});

describe('countLeaderScandalsDuringTerm', () => {
  it('does not count scandals for settlers with similar names', () => {
    const leader = adultHuman(1, 'male', 'John');
    const world = minimalWorld({
      entities: [leader],
      villageLeaderId: leader.id,
      leaderSinceYear: 1,
      year: 3,
      eventLog: [
        {
          id: 1,
          tick: 1,
          year: 2,
          day: 0,
          type: 'scandal',
          message: 'Whispers spread about Johnson and Mary',
          entityName: 'Johnson',
        },
      ],
    });

    expect(getIncumbentRecordAssessment(world, leader).scandalCount).toBe(0);
  });
});

describe('tickElectionGossip', () => {
  it('speaks ceremony gossip through sayHumanChatPhrase', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const leader = adultHuman(1, 'male', 'John');
    const challenger = adultHuman(2, 'male', 'Paul');
    const world = minimalWorld({
      entities: [leader, challenger],
      villageLeaderId: leader.id,
      tick: 12,
      electionCeremony: ceremonyState('gossip', challenger.id, 'Paul'),
    });

    tickElectionGossip(world);

    const speaker = world.entities.find((e) => e.chatPhrase);
    expect(speaker).toBeDefined();
    expect(speaker!.chatTicks).toBe(110);
    expect(speaker!.chatPhrase).toMatch(/John|Paul|lead|village|merit/i);
  });

  it('speaks tension lines before the reveal', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const leader = adultHuman(1, 'male', 'John');
    const challenger = adultHuman(2, 'male', 'Paul');
    const world = minimalWorld({
      entities: [leader, challenger],
      villageLeaderId: leader.id,
      tick: 3,
      electionCeremony: ceremonyState('tension', challenger.id, 'Paul'),
    });

    tickElectionGossip(world);

    const speaker = world.entities.find((e) => e.chatPhrase);
    expect(speaker?.chatPhrase).toMatch(/announce|heart|Shh|favor/i);
    expect(speaker?.chatTicks).toBe(110);
  });
});

describe('tickElectionCeremony', () => {
  it('clears ceremony state even when reveal completes', () => {
    const leader = adultHuman(1, 'male', 'John');
    const challenger = adultHuman(2, 'male', 'Paul');
    const world = minimalWorld({
      entities: [leader, challenger],
      villageLeaderId: leader.id,
      electionCeremony: {
        phase: 'reveal',
        phaseTicksLeft: 1,
        gatherX: 100,
        gatherY: 100,
        reason: 'decennial',
        pendingLeaderId: challenger.id,
        pendingLeaderName: 'Paul',
        pendingChanged: true,
      },
    });

    const announcement = tickElectionCeremony(world, 10);
    expect(announcement).not.toBeNull();
    expect(isElectionCeremonyActive(world)).toBe(false);
    expect(world.festival?.active).toBe(true);
  });

  it('winner speaks the scripted acceptance line on reveal', () => {
    const leader = adultHuman(1, 'male', 'John');
    const challenger = adultHuman(2, 'male', 'Paul');
    const world = minimalWorld({
      entities: [leader, challenger],
      villageLeaderId: leader.id,
      electionCeremony: ceremonyState('reveal', challenger.id, 'Paul'),
    });

    tickElectionCeremony(world, 10);

    const winnerLine = world.entities.find((e) => e.chatPhrase === 'I will serve the village!');
    expect(winnerLine).toBeDefined();
    expect(winnerLine!.chatTicks).toBe(140);
    expect(world.villageLeaderId).toBe(winnerLine!.id);
  });

  it('refreshes pending leader before reveal when the front-runner dies', () => {
    const leader = adultHuman(1, 'male', 'John');
    const challenger = adultHuman(2, 'male', 'Paul');
    challenger.alive = false;
    const successor = adultHuman(3, 'female', 'Ada');
    const world = minimalWorld({
      entities: [leader, challenger, successor],
      villageLeaderId: leader.id,
      electionCeremony: {
        phase: 'reveal',
        phaseTicksLeft: 1,
        gatherX: 100,
        gatherY: 100,
        reason: 'decennial',
        pendingLeaderId: challenger.id,
        pendingLeaderName: 'Paul',
        pendingChanged: true,
      },
    });

    tickElectionCeremony(world, 10);
    expect(world.villageLeaderId).not.toBe(challenger.id);
  });
});

describe('startElectionCeremony', () => {
  it('starts when at least one eligible candidate exists', () => {
    const leader = adultHuman(1, 'male', 'John');
    const world = minimalWorld({ entities: [leader] });
    expect(startElectionCeremony(world, 10, 'decennial')).toBe(true);
    expect(world.electionCeremony?.pendingLeaderId).toBe(leader.id);
  });
});