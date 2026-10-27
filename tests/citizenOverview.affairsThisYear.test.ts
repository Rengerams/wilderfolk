/**
 * The People screen's "affairs this year" counter — `citizenOverview.computeCitizenOverview()`.
 *
 * Why a year total exists at all: the live affair count is a snapshot of a deliberately short-lived
 * state. Measured on the repo's own engine gate (`npm run test:full-year`, seed 12345, 360 days,
 * ~70 settlers) the instantaneous count averages **0.2 per day** and is non-zero on only **35 of
 * 360** days of a year that established **93** affairs, so the snapshot reads zero almost always and
 * the feature looked absent from play ("there are zero affairs").
 *
 * The risk this guards is the two ways the count can lie: counting a *different* year's affairs, and
 * counting a scandal line that is not an establishment (a rumour, or a caught-in-the-act). Both are
 * message-classified against the affair owner's own phrase constant, so the writer and this reader
 * cannot drift apart.
 */
import { describe, expect, it } from 'vitest';
import { EntityType, Season, WeatherType } from '../src/game/gameTypes';
import type { GameEventLog, WorldState } from '../src/game/gameTypes';
import { computeCitizenOverview } from '../src/game/citizenOverview';

function event(id: number, year: number, type: GameEventLog['type'], message: string): GameEventLog {
  return { id, tick: id, year, day: 1, type, message } as GameEventLog;
}

function makeState(eventLog: GameEventLog[]): WorldState {
  return {
    entities: [],
    buildings: [],
    tick: 0,
    paused: false,
    speed: 1,
    width: 400,
    height: 300,
    resources: { wood: 500, stone: 500, food: 500, gold: 500, iron: 0 },
    storageMax: { wood: 1000, stone: 1000, food: 1000, gold: 1000, iron: 300 },
    season: Season.Spring,
    weather: WeatherType.Clear,
    year: 1,
    dayInYear: 100,
    notifications: [],
    bigNews: [],
    floatingTexts: [],
    deathParticles: [],
    nextFloatingTextId: 1,
    nextBuildingId: 100,
    nextEntityId: 100,
    eventLog,
    screenShakeImpulse: 0,
    totalBuildingsCompleted: 0,
    humanPopulation: 0,
    maxHumanPopulation: 0,
    workingSettlers: 0,
    idleSettlers: 0,
    villageName: 'Scandalville',
    villageReputation: 50,
    challenges: [],
    autoSave: false,
    wildlifeCounts: {
      grass: 0, rabbits: 0, deer: 0, wolves: 0, foxes: 0, werewolves: 0, wildkin: 0, trees: 0,
    },
    foodSpoilageRate: 0,
    biodiversityIndex: 100,
    pollutionLevel: 0,
    disasters: [],
    tradeRoutes: [],
    eventsThisYear: [],
    worldMap: null,
    yearlyStats: [],
    lifetimeStats: {},
    visitorGroups: [],
    rivalSettlements: [],
    pendingDiplomacyEvents: [],
    pendingRaidEvents: [],
    pendingOutgoingRaidEvents: [],
    ecoHealthYearsAbove80: 0,
    firstWeekVisitorSpawned: false,
    villageLeaderId: null,
    leaderSinceYear: 0,
    lastElectionYear: -1,
    pendingElectionYear: null,
    electionBuildupNotifiedYear: null,
    electionCeremony: null,
    researchNodes: [],
    unlockedTechs: [],
    activeResearch: null,
    researchProgress: 0,
  } as unknown as WorldState;
}

describe('citizen overview — affairs this year', () => {
  it('counts this year\'s establishments and not another year\'s', () => {
    const overview = computeCitizenOverview(makeState([
      event(1, 1, 'scandal', '#1 Ada Vale began a secret affair with #2 Bram Vale'),
      event(2, 1, 'scandal', '#3 Cass Vale began a secret affair with #4 Dana Vale'),
      event(3, 0, 'scandal', '#5 Eve Vale began a secret affair with #6 Finn Vale'),
    ]));

    expect(overview.affairsThisYear).toBe(2);
  });

  it('does not count a scandal line that is not an establishment', () => {
    const overview = computeCitizenOverview(makeState([
      event(1, 1, 'scandal', 'Whispers spread about Ada Vale and Bram Vale'),
      event(2, 1, 'scandal', 'Ada Vale was caught with Bram Vale'),
      event(3, 1, 'event', 'Ada Vale began a secret affair with Bram Vale'),
    ]));

    // The rumour and the catch are the same affair already counted at establishment; the third is a
    // non-scandal line and must not be added either.
    expect(overview.affairsThisYear).toBe(1);
  });
});
