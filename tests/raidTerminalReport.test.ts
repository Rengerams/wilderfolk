import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { GameEventLog, WorldState } from '../src/game/gameTypes';
import { buildRaidTerminalReport } from '../src/game/raidTerminalReport';
import { initGame } from '../src/game/worldGen';
import { buildSaveData, loadGameFromParsedOutcome, parseSaveJson } from '../src/game/saveLoad';
import { createInitialView } from '../src/game/viewState';
import WarfareStatus from '../src/components/WarfareStatus';
import RazeConfirmation from '../src/components/RazeConfirmation';

function fallenVillage(): WorldState {
  const world = initGame({ seed: 4242 });
  world.raidRecovery = {
    status: 'destroyed', raidId: 'final-raid', rivalName: 'Hillford',
    startedAtTick: 12, protectedUntilTick: 300, reason: 'The defenses fell.',
    repairs: [], foodTarget: 0,
  };
  world.paused = true;
  world.raidBattleReports = [{
    raidId: 'final-raid', rivalId: 'hillford', rivalName: 'Hillford', side: 'defense',
    outcome: 'defeat', resolvedAtTick: 12, leaderId: 123, leadershipMerit: 0,
    playerFallen: ['#2 Rowan Vale'], enemyFallen: [], playerDeaths: 1, enemyDeaths: 2,
    damagedBuildings: 3, suppliesLost: { food: 10, wood: 0, stone: 0, gold: 0 },
  }];
  world.genealogyRegistry = { people: {
    '123': { id: 123, name: 'Ada', surname: 'Rowe', birthSurname: 'Rowe', alive: false,
      partners: [], childrenIds: [] },
  } };
  world.entities = [];
  world.villageLeaderId = null;
  world.chronicleChapters = ['foundation', 'a_dynasty', 'unrecognized_old_chapter'];
  world.eventLog = [
    { id: 5, tick: 12, year: 1, day: 12, type: 'combat', message: 'Village defeated', combatStage: 'resolved' },
    { id: 4, tick: 11, year: 1, day: 12, type: 'combat', message: 'Named casualty', combatStage: 'casualties' },
    { id: 3, tick: 10, year: 1, day: 11, type: 'election', message: 'Ada became leader' },
    { id: 2, tick: 5, year: 1, day: 5, type: 'milestone', message: 'House founded' },
    { id: 1, tick: 1, year: 1, day: 1, type: 'event', message: 'Ordinary chatter' },
  ];
  return world;
}

function saveRoundTrip(world: WorldState): WorldState {
  const text = JSON.stringify(buildSaveData(world, createInitialView(world.width, world.height)));
  const parsed = parseSaveJson(text);
  if (!parsed.valid) throw new Error('Save unexpectedly rejected');
  const loaded = loadGameFromParsedOutcome(parsed.parsed);
  if (!loaded.ok) throw new Error(loaded.detail ?? loaded.reason);
  return loaded.world;
}

describe('terminal raid presentation and backward-compatible saves', () => {
  it('does not show a terminal report for active or recovering settlements', () => {
    const world = initGame({ seed: 123 });
    expect(buildRaidTerminalReport(world)).toBeNull();
    world.raidRecovery = { status: 'recovering', raidId: 'r1', rivalName: 'Hillford',
      startedAtTick: 1, protectedUntilTick: 500, reason: 'Rebuild',
      repairs: [], foodTarget: 100 };
    expect(buildRaidTerminalReport(world)).toBeNull();
    expect(saveRoundTrip(world).raidRecovery?.status).toBe('recovering');
  });

  it('identifies the fallen leader from genealogy and projects history without granting rewards', () => {
    const world = fallenVillage();
    const before = JSON.stringify({
      eventLog: world.eventLog, chapters: world.chronicleChapters,
      resources: world.resources, report: world.raidBattleReports,
    });
    const report = buildRaidTerminalReport(world);
    expect(report?.lastLeaderId).toBe(123);
    expect(report?.lastLeaderName).toBe('Ada Rowe');
    expect(report?.playerDeaths).toBe(1);
    expect(report?.enemyDeaths).toBe(2);
    expect(report?.damagedBuildings).toBe(3);
    expect(report?.survivors).toBe(0);
    expect(report?.chapters.map((chapter) => chapter.id)).toEqual(['foundation', 'a_dynasty']);
    expect(report?.highlights.map((event) => event.id)).toEqual([5, 3, 2]);
    expect(JSON.stringify({
      eventLog: world.eventLog, chapters: world.chronicleChapters,
      resources: world.resources, report: world.raidBattleReports,
    })).toBe(before);
  });

  it('bounds selection to five persisted IDs without sorting or duplicating the Chronicle', () => {
    const world = fallenVillage();
    const logs: GameEventLog[] = Array.from({ length: 100 }, (_, i) => ({
      id: 100 - i, tick: 100 - i, year: 0, day: i, type: 'milestone',
      message: `Chronicle moment ${i}`,
    }));
    logs.splice(1, 0, { ...logs[0] });
    world.eventLog = logs;
    expect(buildRaidTerminalReport(world)?.highlights.map((event) => event.id)).toEqual([100, 99, 98, 97, 96]);
    expect(world.eventLog).toHaveLength(101);
  });

  it('renders an accessible final screen while preserving the four exit actions', () => {
    const world = fallenVillage();
    const html = renderToStaticMarkup(createElement(WarfareStatus, {
      world,
      onPrisonerDecision: () => undefined,
      onRepair: () => undefined,
      onExport: () => undefined,
      onChronicle: () => undefined,
      onNewVillage: () => undefined,
      onMainMenu: () => undefined,
    }));
    expect(html).toContain('Final leader');
    expect(html).toContain('Ada Rowe');
    expect(html).toContain('Recorded village chapters');
    expect(html).toContain('Recent Chronicle highlights');
    expect(html).toContain('Village defeated');
    for (const action of ['Export final save', 'View / export Chronicle', 'Export &amp; start new village', 'Return to main menu']) {
      expect(html).toContain(action);
    }
  });

  it('loads older destroyed saves without a terminal snapshot or a surviving leader entity', () => {
    const world = fallenVillage();
    world.genealogyRegistry = undefined;
    world.raidBattleReports![0].leaderId = null;
    world.eventLog = [];
    world.chronicleChapters = [];
    const loaded = saveRoundTrip(world);
    expect(loaded.raidRecovery?.status).toBe('destroyed');
    expect(loaded.paused).toBe(true);
    const report = buildRaidTerminalReport(loaded);
    expect(report?.lastLeaderName).toBeNull();
    expect(report?.highlights).toEqual([]);
    expect(report?.chapters).toEqual([]);
    const html = renderToStaticMarkup(createElement(WarfareStatus, {
      world: loaded,
      onPrisonerDecision: () => undefined,
      onRepair: () => undefined,
      onExport: () => undefined,
      onChronicle: () => undefined,
      onNewVillage: () => undefined,
      onMainMenu: () => undefined,
    }));
    expect(html).toContain('Last leader not recorded');
    expect(html).toContain('No retained Chronicle highlights');
  });

  it('explains finality, displaced survivors and witnesses without a moral score', () => {
    const world = fallenVillage();
    const pending: NonNullable<WorldState['pendingRaidVictories']>[number] = {
      raidId: 'pending-fate', rivalId: 'hillford', rivalName: 'Hillford',
      playerDead: 0, enemyDead: 3, enemySurvivors: 1,
      playerCasualties: [], enemyCasualties: [],
    };
    const before = JSON.stringify(world);
    const html = renderToStaticMarkup(createElement(RazeConfirmation, {
      pending,
      onConfirm: () => undefined,
      onCancel: () => undefined,
    }));
    expect(html).toContain('Raze ');
    expect(html).toContain('Hillford');
    expect(html).toContain('permanently removes');
    expect(html).toContain('inhabitant is');
    expect(html).toContain('displaced, not killed');
    expect(html).toContain('diplomatic attitude');
    expect(html).toContain('Confirm raze');
    expect(html).toContain('Cancel');
    expect(JSON.stringify(world)).toBe(before);
  });
});
