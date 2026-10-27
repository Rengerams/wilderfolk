import { departWarPrisoner } from '../src/game/warPrisonerCustody';
import { demolishBuildingInPlace, demolishBuildingsInPlace } from '../src/game/buildingMaintenanceActions';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { RaidEvent, WorldState } from '../src/game/gameTypes';
import { BuildingType, JobType } from '../src/game/gameTypes';
import { building, human } from '../src/test/factories';
import { initGame } from '../src/game/worldGen';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/game/dayCycleClock';
import { cancelPendingOutgoingRaidsForRival, launchRaidOnRival, queueRaidDefense,
  tickPendingOutgoingRaidEvents, tickPendingRaidEvents } from '../src/game/frontierCombat';
import { signPeaceTreaty } from '../src/game/rivalDiplomacy';
import { beginRaidRecovery, tickRaidRecovery } from '../src/game/raidAftermath';
import { captureRaidPrisoners, resolveWarPrisoner } from '../src/game/warPrisoners';
import { applyWorkerCommand } from '../src/game/simWorker/commands';
import { extractSimPrep, applySimPrep } from '../src/game/simWorker/simPrep';
import { buildSaveData, loadGameFromParsedOutcome, parseSaveJson } from '../src/game/saveLoad';
import { createInitialView } from '../src/game/viewState';
import { gameTick } from '../src/game/gameTick';
import { extractSimTickDelta, applySimTickDelta } from '../src/game/simBuffers/simDelta';
import { rebuildWorldRuntimeCaches } from '../src/game/worldRuntimeCaches';
import { tryDailyHumanMortality } from '../src/game/simulation/humanRelationships';
import { killHuman } from '../src/game/humanLifecycleCleanup';
import { ensureEntityByIdMap } from '../src/game/entityIndex';
import { resetSimRng, setSimSeed } from '../src/game/simRng';

function colony(): WorldState {
  const world = initGame({ seed: 4242 });
  world.entities = Array.from({ length: 12 }, (_, i) => human(900001 + i, { job: JobType.Soldier, name: `Fighter${i}` }));
  world.buildings = [building(900000, BuildingType.House), building(900100, BuildingType.Prison)];
  world.humanPopulation = 12;
  world.maxHumanPopulation = 20;
  world.tick = 0;
  world.year = 0;
  world.dayInYear = 0;
  world.unlockedTechs = ['defense_2'];
  world.resources = { food: 10000, wood: 500, stone: 500, gold: 500, iron: 500 };
  world.rivalSettlements = [{ id: 'enemy', name: 'Enemy', population: 8, campX: 600, campY: 600,
    entityIds: [], buildingIds: [], relationship: 'tense', foundedYear: 0, daysUntilAction: 30,
    raidCooldownDays: 0, peaceTreatyDays: 0 }];
  world.pendingRaidEvents = [];
  world.pendingOutgoingRaidEvents = [];
  return world;
}

function raid(): RaidEvent {
  return { id: 'raid', rivalId: 'enemy', rivalName: 'Enemy', title: 'Raid', description: 'Raid', emoji: '',
    choices: [], createdAtTick: 0, expiresAtTick: TICKS_PER_DAY * 3, marchDistanceTiles: 10,
    attackerStrength: 20, lootFood: 50, lootGold: 20, lootWood: 20, lootStone: 10 };
}

function reload(world: WorldState): WorldState {
  const parsed = parseSaveJson(JSON.stringify(buildSaveData(world, createInitialView(world.width, world.height))));
  if (!parsed.valid) throw new Error('Save rejected');
  const result = loadGameFromParsedOutcome(parsed.parsed);
  if (!result.ok) throw new Error(result.detail ?? result.reason);
  return result.world;
}

afterEach(resetSimRng);

describe('warfare lifecycle and persistence', () => {
  it('runs an outgoing battle over six game hours and releases a cancelled deployment', () => {
    const world = launchRaidOnRival(colony(), 'enemy');
    const event = world.pendingOutgoingRaidEvents[0];
    expect(event.soldierIds).toHaveLength(12);
    event.rivalResponse = 'fight';
    event.attackerStrength = 1000;
    event.defenderStrength = 100;
    world.tick = event.arrivalAtTick!;
    tickPendingOutgoingRaidEvents(world);
    const started = world.tick;
    world.tick = started + 2 * TICKS_PER_HOUR;
    tickPendingOutgoingRaidEvents(world);
    expect(event.phase).toBe('fighting');
    expect(event.battleCasualtiesApplied).not.toBe(true);
    world.tick = started + 3 * TICKS_PER_HOUR;
    tickPendingOutgoingRaidEvents(world);
    expect(event.battleCasualtiesApplied).toBe(true);
    const losses = world.entities.filter((person) => !person.alive).length;
    tickPendingOutgoingRaidEvents(world);
    expect(world.entities.filter((person) => !person.alive)).toHaveLength(losses);
    world.tick = started + 6 * TICKS_PER_HOUR;
    tickPendingOutgoingRaidEvents(world);
    expect(event.phase).toBe('returning');
    cancelPendingOutgoingRaidsForRival(world, 'enemy');
    expect(world.entities.every((person) => !person.raidDeploymentId)).toBe(true);
  });

  it('starts defense through the real worker command and applies midpoint losses once across save/load', () => {
    const original = colony();
    original.pendingRaidEvents = [raid()];
    let world = applyWorkerCommand(original, { proto: 1, op: 'respondToRaidEvent', eventId: 'raid', choiceId: 'defend' });
    expect(world.pendingRaidEvents[0].phase).toBe('fighting');
    expect(original.pendingRaidEvents[0].phase).toBeUndefined();
    world.tick += 3 * TICKS_PER_HOUR;
    tickPendingRaidEvents(world, world.entities);
    const casualties = world.pendingRaidEvents[0].battlePlayerCasualties;
    expect(casualties?.length).toBeGreaterThan(0);
    world = reload(world);
    const dead = world.entities.filter((person) => !person.alive).length;
    tickPendingRaidEvents(world, world.entities);
    expect(world.entities.filter((person) => !person.alive)).toHaveLength(dead);
    world.tick += 3 * TICKS_PER_HOUR;
    tickPendingRaidEvents(world, world.entities);
    expect(world.pendingRaidEvents).toHaveLength(0);
    expect(world.raidBattleReports?.[0].playerFallen).toEqual(casualties);
    expect(world.entities.every((person) => !person.raidDeploymentId)).toBe(true);
  });

  it('clears war and soldiers when a treaty cancels an expedition', () => {
    const world = launchRaidOnRival(colony(), 'enemy');
    world.rivalSettlements[0].relationship = 'competitive';
    world.rivalSettlements[0].atWarWithPlayer = true;
    const peaceful = signPeaceTreaty(world, 'enemy');
    expect(peaceful.pendingOutgoingRaidEvents).toHaveLength(0);
    expect(peaceful.entities.every((person) => !person.raidDeploymentId)).toBe(true);
    expect(peaceful.rivalSettlements[0].atWarWithPlayer).toBe(false);
  });

  it('keeps repairs and food recovery meaningful and never destroys an intact colony by ratio alone', () => {
    const world = colony();
    const before = structuredClone(world);
    world.buildings[0].health = 50;
    world.resources.food = 0;
    beginRaidRecovery(world, { ...raid(), intent: 'raze', attackerStrength: 100000 }, 'defeat', 1, before);
    expect(world.raidRecovery?.status).toBe('recovering');
    tickRaidRecovery(world);
    expect(world.raidRecovery).toBeDefined();
    world.buildings[0].health = 100;
    world.resources.food = 100;
    tickRaidRecovery(world);
    expect(world.raidRecovery).toBeDefined();
    world.tick = world.raidRecovery!.protectedUntilTick;
    tickRaidRecovery(world);
    expect(world.raidRecovery).toBeUndefined();
  });

  it('persists a terminal razing result and refuses simulation or gameplay commands after reload', () => {
    const world = colony();
    const before = structuredClone(world);
    world.entities = [];
    world.buildings = [];
    beginRaidRecovery(world, { ...raid(), intent: 'raze', attackerStrength: 100000 }, 'defeat', 1, before);
    expect(world.raidRecovery?.status).toBe('destroyed');
    const loaded = reload(world);
    const tick = loaded.tick;
    loaded.paused = false;
    gameTick(loaded);
    expect(loaded.tick).toBe(tick);
    expect(applyWorkerCommand(loaded, { proto: 1, op: 'provokeRival', rivalId: 'enemy' })).toBe(loaded);
  });

  it('rolls back nested raid phases, fate decisions, graves and diplomatic rewards', () => {
    const world = launchRaidOnRival(colony(), 'enemy');
    world.pendingOutgoingRaidEvents[0].battleChronicle = ['Before'];
    const prep = extractSimPrep(world);
    world.pendingOutgoingRaidEvents[0].phase = 'returning';
    world.pendingOutgoingRaidEvents[0].battleChronicle!.push('After');
    world.scoredRaidIds = ['new'];
    world.pendingRaidVictories = [];
    world.graveRecords = [];
    applySimPrep(world, prep);
    expect(world.pendingOutgoingRaidEvents[0].phase).toBe('marching');
    expect(world.pendingOutgoingRaidEvents[0].battleChronicle).toEqual(['Before']);
    expect(world.scoredRaidIds).toBeUndefined();
    expect(world.pendingRaidVictories).toBeUndefined();
  });

  it('retains enemy memorial history while removing it from player graveyard capacity on load', () => {
    const world = colony();
    world.buildings.push(building(900200, BuildingType.Graveyard));
    world.graveRecords = [{ name: 'Enemy fallen', faction: 'enemy', tick: 0, graveyardId: 900200 }];
    const loaded = reload(world);
    expect(loaded.graveRecords).toMatchObject([{ name: 'Enemy fallen', faction: 'enemy' }]);
    expect(loaded.graveRecords?.[0].graveyardId).toBeUndefined();
  });
});

function captiveColony(): WorldState {
  const world = colony();
  const rival = world.rivalSettlements[0];
  const enemy = human(910000, { faction: 'rival', groupId: rival.id, job: JobType.Soldier, age: 25, name: 'Real Fighter' });
  world.entities.push(enemy);
  rival.entityIds = [enemy.id];
  captureRaidPrisoners(world, rival, 'won-raid', 1);
  return world;
}

describe('real raid captives', () => {
  it('never manufactures prisoners from off-map population or captures children/civilians', () => {
    const world = colony();
    const rival = world.rivalSettlements[0];
    captureRaidPrisoners(world, rival, 'raid', 12);
    expect(world.raidPrisonerHistory).toBeUndefined();
    const child = human(910000, { faction: 'rival', job: JobType.Soldier, age: 12, isJuvenile: true });
    const civilian = human(910001, { faction: 'rival', job: JobType.Settler });
    world.entities.push(child, civilian);
    rival.entityIds = [child.id, civilian.id];
    captureRaidPrisoners(world, rival, 'raid', 12);
    expect(world.entities.every((person) => !person.warCaptive)).toBe(true);
  });

  it('uses real prison cells and reserves capacity without replaying a capture', () => {
    const world = captiveColony();
    expect(world.entities.find((person) => person.id === 910000)?.prisonBuildingId).toBe(900100);
    expect(world.raidPrisonerHistory).toHaveLength(1);
    captureRaidPrisoners(world, world.rivalSettlements[0], 'won-raid', 12);
    expect(world.raidPrisonerHistory).toHaveLength(1);
    const loaded = reload(world);
    expect(loaded.entities.find((person) => person.id === 910000)?.warCaptive?.raidId).toBe('won-raid');
  });

  it('releases and escapes alive without turning a captive into a citizen or a death', () => {
    const world = captiveColony();
    const released = resolveWarPrisoner(world, 910000, 'release');
    expect(released.entities.some((person) => person.id === 910000)).toBe(false);
    expect(released.raidPrisonerHistory?.[0].status).toBe('released');
    expect(released.graveRecords?.length ?? 0).toBe(0);
    const escaped = captiveColony();
    const person = escaped.entities.find((entry) => entry.id === 910000)!;
    departWarPrisoner(escaped, person, 'escaped');
    expect(person.alive).toBe(true);
    expect(escaped.raidPrisonerHistory?.[0].status).toBe('escaped');
  });

  it('requires a confirmed execution and never buries an enemy in a village graveyard', () => {
    const world = captiveColony();
    expect(resolveWarPrisoner(world, 910000, 'execute')).toBe(world);
    const executed = resolveWarPrisoner(world, 910000, 'execute_confirmed');
    expect(executed.entities.find((person) => person.id === 910000)?.alive).toBe(false);
    expect(executed.raidPrisonerHistory?.[0].status).toBe('executed');
    expect(executed.graveRecords?.length ?? 0).toBe(0);
    expect(resolveWarPrisoner(executed, 910000, 'execute_confirmed')).toBe(executed);
  });

  it.each([
    { response: 'supports execution', fierce: 8, empathetic: 1, expected: 3 },
    { response: 'opposes execution', fierce: 1, empathetic: 8, expected: -3 },
    { response: 'is divided', fierce: 4, empathetic: 4, expected: 0 },
    { response: 'has no outspoken opinion', fierce: 0, empathetic: 0, expected: 0 },
  ])('lets the village $response without an automatic execution penalty', ({ fierce, empathetic, expected }) => {
    const world = captiveColony();
    world.villageLeaderId = world.entities[0].id;
    const initialReputation = world.villageReputation;
    world.entities.slice(0, 12).forEach((person, index) => {
      person.traits = index < fierce ? ['fierce'] : index < fierce + empathetic ? ['nurturing'] : [];
    });
    const executed = resolveWarPrisoner(world, 910000, 'execute_confirmed');
    expect(executed.entities[0].battleLeadershipMerit ?? 0).toBe(expected);
    expect(executed.villageReputation).toBe(Math.max(0, Math.min(100, initialReputation + expected)));
    const loaded = reload(executed);
    expect(loaded.entities[0].battleLeadershipMerit ?? 0).toBe(expected);
    expect(resolveWarPrisoner(loaded, 910000, 'execute_confirmed')).toBe(loaded);
  });

  it('reflects ongoing war or a recent village defense without forcing a negative score', () => {
    const atWar = captiveColony();
    atWar.villageLeaderId = atWar.entities[0].id;
    atWar.rivalSettlements[0].atWarWithPlayer = true;
    const executedDuringWar = resolveWarPrisoner(atWar, 910000, 'execute_confirmed');
    expect(executedDuringWar.entities[0].battleLeadershipMerit).toBe(1);

    const recentlyAttacked = captiveColony();
    recentlyAttacked.villageLeaderId = recentlyAttacked.entities[0].id;
    recentlyAttacked.raidBattleReports = [{
      raidId: 'defense-raid', rivalId: 'enemy', rivalName: 'Enemy', side: 'defense',
      outcome: 'victory', resolvedAtTick: 0, leaderId: recentlyAttacked.villageLeaderId,
      leadershipMerit: 0, playerDeaths: 0, enemyDeaths: 0, damagedBuildings: 0,
      suppliesLost: { food: 0, wood: 0, stone: 0, gold: 0 },
      playerFallen: [], enemyFallen: [],
    }];
    const executedAfterAttack = resolveWarPrisoner(recentlyAttacked, 910000, 'execute_confirmed');
    expect(executedAfterAttack.entities[0].battleLeadershipMerit).toBe(1);
  });

  it.each([
    { response: 'welcome a release', fierce: 1, empathetic: 8, expected: 3 },
    { response: 'oppose a release', fierce: 8, empathetic: 1, expected: -3 },
    { response: 'be neutral on release', fierce: 4, empathetic: 4, expected: 0 },
  ])('allows villagers to $response', ({ fierce, empathetic, expected }) => {
    const world = captiveColony();
    world.villageLeaderId = world.entities[0].id;
    world.entities.slice(0, 12).forEach((person, index) => {
      person.traits = index < fierce ? ['fierce'] : index < fierce + empathetic ? ['nurturing'] : [];
    });
    const resolved = resolveWarPrisoner(world, 910000, 'release');
    expect(resolved.entities[0].battleLeadershipMerit ?? 0).toBe(expected);
    expect(resolved.raidPrisonerHistory?.[0].status).toBe('released');
  });

  it('allows refusal and applies a persisted recruitment cooldown', () => {
    const world = captiveColony();
    const person = world.entities.find((entry) => entry.id === 910000)!;
    person.warCaptive!.attempts = 100;
    world.tick = person.warCaptive!.recruitAfterTick;
    setSimSeed(42);
    const refused = resolveWarPrisoner(world, person.id, 'recruit');
    expect(refused.entities.find((entry) => entry.id === person.id)?.faction).toBe('rival');
    expect(refused.entities.find((entry) => entry.id === person.id)?.warCaptive?.attempts).toBe(101);
    expect(resolveWarPrisoner(refused, person.id, 'recruit')).toBe(refused);
  });
});


describe('warfare integration boundaries', () => {
  it('resolves simultaneous defenses in place without replacing live cache instances', () => {
    let world = colony();
    world.pendingRaidEvents = [raid(), { ...raid(), id: 'second-defense' }];
    world = queueRaidDefense(world, 'raid', 'defend');
    world.entities.push(...Array.from({ length: 12 }, (_, i) => human(920000 + i, { job: JobType.Soldier })));
    world = queueRaidDefense(world, 'second-defense', 'defend');
    rebuildWorldRuntimeCaches(world);
    const grid = world.grassGrid;
    world.tick = 6 * TICKS_PER_HOUR;
    tickPendingRaidEvents(world, world.entities);
    expect(world.grassGrid).toBe(grid);
    expect(world.pendingRaidEvents).toHaveLength(0);
    expect(world.raidBattleReports).toHaveLength(2);
    expect(world.entities.every((person) => !person.raidDeploymentId)).toBe(true);
  });

  it('actually breaches a damaged unprotected village and cannot resurrect it with another raid', () => {
    let world = colony();
    world.entities = world.entities.slice(0, 2);
    world.entities.push(human(930000, { job: JobType.Settler, name: 'Survivor' }));
    world.buildings[0].health = 40;
    world.buildings.push(building(940000, BuildingType.Wall, { health: 40 }));
    const attack = { ...raid(), intent: 'raze' as const, attackerStrength: 100000 };
    world.pendingRaidEvents = [attack, { ...raid(), id: 'later', expiresAtTick: 6 * TICKS_PER_HOUR }];
    world = queueRaidDefense(world, attack.id, 'defend');
    world.tick = 6 * TICKS_PER_HOUR;
    tickPendingRaidEvents(world, world.entities);
    expect(world.raidRecovery?.status).toBe('destroyed');
    expect(world.buildings.some((home) => home.id === 940000 || home.id === 900000)).toBe(false);
    expect(world.entities.find((person) => person.id === 930000)?.alive).toBe(true);
    beginRaidRecovery(world, raid(), 'defeat', 0, world);
    expect(world.raidRecovery?.status).toBe('destroyed');
  });

  it('awards defender experience and records a fallen leader instead of crediting a successor', () => {
    let world = colony();
    const leaderId = world.entities[0].id;
    const successorId = world.entities[1].id;
    world.villageLeaderId = leaderId;
    world.pendingRaidEvents = [{ ...raid(), attackerStrength: 100 }];
    world = queueRaidDefense(world, 'raid', 'defend');
    world.entities[0].alive = false;
    world.villageLeaderId = successorId;
    world.tick = 6 * TICKS_PER_HOUR;
    tickPendingRaidEvents(world, world.entities);
    expect(world.raidBattleReports?.[0].leaderId).toBe(leaderId);
    expect(world.entities.find((person) => person.id === successorId)?.battleLeadershipMerit ?? 0).toBe(0);
    expect(world.entities.filter((person) => person.alive).some((person) => (person.skills?.[JobType.Soldier] ?? 0) > 0)).toBe(true);
    const merit = world.entities.find((person) => person.id === leaderId)?.battleLeadershipMerit;
    const clickedAgain = applyWorkerCommand(world, { proto: 1, op: 'respondToRaidEvent', eventId: 'raid', choiceId: 'defend' });
    expect(clickedAgain.entities.find((person) => person.id === leaderId)?.battleLeadershipMerit).toBe(merit);
  });

  it('preserves the starting leader after actual tick cleanup removes the midpoint casualty', () => {
    let world = colony();
    const leaderId = world.entities[0].id;
    const successorId = world.entities[1].id;
    world.villageLeaderId = leaderId;
    world.pendingRaidEvents = [{ ...raid(), attackerStrength: 100 }];
    world = queueRaidDefense(world, 'raid', 'defend');
    world.tick = 3 * TICKS_PER_HOUR;
    tickPendingRaidEvents(world, world.entities);
    world.entities.find((person) => person.id === leaderId)!.alive = false;
    world.villageLeaderId = successorId;
    world.paused = false;
    gameTick(world);
    expect(world.entities.some((person) => person.id === leaderId)).toBe(false);
    world.tick = 6 * TICKS_PER_HOUR;
    tickPendingRaidEvents(world, world.entities);
    expect(world.raidBattleReports?.[0].leaderId).toBe(leaderId);
    expect(world.raidBattleReports?.[0].leadershipMerit).toBe(0);
    expect(world.entities.find((person) => person.id === successorId)?.battleLeadershipMerit ?? 0).toBe(0);
  });

  it.each(['demolition', 'raid'] as const)('resolves custody alive when a prison is removed by %s', (cause) => {
    const world = captiveColony();
    const captive = world.entities.find((person) => person.id === 910000)!;
    const prisonId = captive.prisonBuildingId!;
    const population = world.rivalSettlements[0].population;
    demolishBuildingInPlace(world, prisonId, cause);
    expect(world.entities.some((person) => person.id === captive.id)).toBe(false);
    expect(captive.alive).toBe(true);
    expect(captive.departedAlive).toBe(true);
    expect(world.raidPrisonerHistory?.find((entry) => entry.entityId === captive.id)?.status).toBe('escaped');
    expect(world.rivalSettlements[0].population).toBe(population + 1);
    expect(world.buildings.some((building) => building.occupants.includes(captive.id))).toBe(false);
    expect(world.graveRecords?.some((entry) => entry.name.includes(captive.name ?? 'unknown')) ?? false).toBe(false);
    demolishBuildingInPlace(world, prisonId, cause);
    expect(world.rivalSettlements[0].population).toBe(population + 1);
  });

  it('blocks recruitment at the population ceiling and still permits release after the home camp is gone', () => {
    const world = captiveColony();
    world.maxHumanPopulation = 12;
    world.tick = world.entities.find((person) => person.id === 910000)!.warCaptive!.recruitAfterTick;
    expect(resolveWarPrisoner(world, 910000, 'recruit')).toBe(world);
    world.rivalSettlements = [];
    const released = resolveWarPrisoner(world, 910000, 'release');
    expect(released.raidPrisonerHistory?.[0].status).toBe('released');
  });

  it('reserves prison cells across both resident sentences and enemy captives', () => {
    const world = colony();
    for (let index = 0; index < 4; index++) world.entities[index].prisonBuildingId = 900100;
    const enemy = human(910000, { job: JobType.Soldier, faction: 'rival', age: 30 });
    world.entities.push(enemy);
    world.rivalSettlements[0].entityIds = [enemy.id];
    captureRaidPrisoners(world, world.rivalSettlements[0], 'raid', 12);
    expect(enemy.warCaptive).toBeUndefined();
  });

  it('transports recovery, scored identities and custody through the actual worker delta', () => {
    const world = captiveColony();
    world.scoredRaidIds = ['battle'];
    world.raidRecovery = { status: 'recovering', raidId: 'battle', rivalName: 'Enemy', startedAtTick: 0,
      protectedUntilTick: 20, reason: 'Repairs', repairs: [], foodTarget: 100 };
    const target = structuredClone(world);
    delete target.raidRecovery;
    delete target.scoredRaidIds;
    delete target.raidPrisonerHistory;
    applySimTickDelta(target, structuredClone(extractSimTickDelta(world)));
    expect(target.raidRecovery).toEqual(world.raidRecovery);
    expect(target.scoredRaidIds).toEqual(['battle']);
    expect(target.raidPrisonerHistory).toEqual(world.raidPrisonerHistory);
  });

  it('rejects malformed new warfare records instead of loading a broken terminal state', () => {
    const world = colony();
    const payload = buildSaveData(world, createInitialView(world.width, world.height));
    payload.raidRecovery = { status: 'destroyed', repairs: 'invalid' };
    const parsed = parseSaveJson(JSON.stringify(payload));
    expect(parsed.valid).toBe(true);
    if (parsed.valid) expect(loadGameFromParsedOutcome(parsed.parsed).ok).toBe(false);
  });
});


describe('warfare cleanup regressions', () => {
  it.each([140, 110, 90])('retains midpoint losses in final announcements after cleanup and reload at strength %s', (strength) => {
    let world = launchRaidOnRival(colony(), 'enemy');
    const event = world.pendingOutgoingRaidEvents[0];
    event.rivalResponse = 'fight';
    event.attackerStrength = strength;
    event.defenderStrength = 100;
    world.tick = event.arrivalAtTick!;
    tickPendingOutgoingRaidEvents(world);
    const start = world.tick;
    setSimSeed(42);
    world.tick = start + 3 * TICKS_PER_HOUR;
    tickPendingOutgoingRaidEvents(world);
    const fallen = [...event.battlePlayerCasualties!];
    expect(fallen.length).toBeGreaterThan(0);
    world.paused = false;
    gameTick(world);
    expect(world.entities.every((person) => person.alive)).toBe(true);
    world = reload(world);
    world.tick = start + 6 * TICKS_PER_HOUR;
    tickPendingOutgoingRaidEvents(world);
    expect(world.raidBattleReports?.[0].playerFallen).toEqual(fallen);
    if (strength === 140) {
      expect(world.pendingRaidVictories?.[0]).toMatchObject({ playerDead: fallen.length, playerCasualties: fallen });
      expect(world.bigNews.some((news) => news.message.includes(`${fallen.length} of our people lost`))).toBe(true);
    } else if (strength === 110) {
      expect(world.eventLog.some((entry) => entry.message.includes(`${fallen.length} of our people died`))).toBe(true);
    } else {
      expect(world.bigNews.some((news) => news.message.includes(`${fallen.length} of our people were killed`))).toBe(true);
    }
    const loaded = reload(world);
    expect(loaded.raidBattleReports?.[0].playerFallen).toEqual(fallen);
    expect(loaded.pendingRaidVictories).toEqual(world.pendingRaidVictories);
  });

  it('preserves protection and cumulative food and repair goals through subsequent defeats and reload', () => {
    let world = colony();
    const beforeFirst = structuredClone(world);
    world.buildings[0].health = 50;
    world.resources.food = 20;
    beginRaidRecovery(world, raid(), 'defeat', 1, beforeFirst);
    const firstFoodTarget = world.raidRecovery!.foodTarget;
    world = reload(world);
    world.tick = TICKS_PER_HOUR;
    const beforeSecond = structuredClone(world);
    world.buildings[0].health = 40;
    beginRaidRecovery(world, { ...raid(), id: 'second' }, 'defeat', 1, beforeSecond);
    expect(world.raidRecovery?.repairs).toContainEqual({ buildingId: 900000, health: 100 });
    expect(world.raidRecovery?.foodTarget).toBe(firstFoodTarget);
    world.resources.food = 100;
    world.buildings[0].health = 50;
    world.tick = world.raidRecovery!.protectedUntilTick;
    tickRaidRecovery(world);
    expect(world.raidRecovery).toBeDefined();
    world.buildings[0].health = 100;
    world.tick--;
    tickRaidRecovery(world);
    expect(world.raidRecovery).toBeDefined();
    world = reload(world);
    world.tick++;
    tickRaidRecovery(world);
    expect(world.raidRecovery).toBeUndefined();
  });

  it('closes exhausted captive custody once through the normal tick cleanup', () => {
    let world = captiveColony();
    const captive = world.entities.find((person) => person.id === 910000)!;
    world.resources.food = 0;
    captive.energy = 0;
    world.paused = false;
    gameTick(world);
    expect(world.entities.some((person) => person.id === captive.id)).toBe(false);
    expect(world.raidPrisonerHistory?.[0].status).toBe('died');
    expect(world.graveRecords?.length ?? 0).toBe(0);
    const recorded = world.eventLog.filter((entry) => entry.type === 'prison' && entry.message.endsWith('died')).length;
    killHuman(captive, world.buildings, ensureEntityByIdMap(world), world.tick, world);
    expect(world.eventLog.filter((entry) => entry.type === 'prison' && entry.message.endsWith('died'))).toHaveLength(recorded);
    world = reload(world);
    expect(world.raidPrisonerHistory?.[0].status).toBe('died');
  });

  it('keeps old-age enemy deaths out of village graves and ends custody', () => {
    const world = captiveColony();
    const captive = world.entities.find((person) => person.id === 910000)!;
    captive.age = 200;
    expect(tryDailyHumanMortality(world, captive, world.buildings, ensureEntityByIdMap(world))).toBe(true);
    expect(world.raidPrisonerHistory?.[0].status).toBe('died');
    expect(world.graveRecords?.length ?? 0).toBe(0);
  });

  it('clears home, work and custody references for a destruction batch without refunds or repeated removal', () => {
    const world = captiveColony();
    const home = world.buildings[0];
    const worker = world.entities[0];
    const workshop = building(900200, BuildingType.Workshop);
    const road = building(900300, BuildingType.Road);
    world.buildings.push(workshop, road, building(900400, BuildingType.House));
    worker.residenceBuildingId = home.id;
    worker.workerBuildingId = workshop.id;
    home.occupants = [worker.id];
    workshop.occupants = [worker.id];
    world.totalBuildingsCompleted = world.buildings.length;
    const resources = { ...world.resources };
    const destroyed = [home.id, 900100, workshop.id, road.id];
    demolishBuildingsInPlace(world, [...destroyed, home.id, -1], 'raid');
    expect(world.buildings.map((building) => building.id)).toEqual([900400]);
    expect(world.totalBuildingsCompleted).toBe(1);
    expect(world.entities.every((person) => !destroyed.includes(person.residenceBuildingId!)
      && !destroyed.includes(person.workerBuildingId!) && !destroyed.includes(person.prisonBuildingId!))).toBe(true);
    expect(world.raidPrisonerHistory?.[0].status).toBe('escaped');
    for (const key of ['wood', 'stone', 'gold'] as const) expect(world.resources[key]).toBeLessThanOrEqual(resources[key]);
    const history = structuredClone(world.raidPrisonerHistory);
    demolishBuildingsInPlace(world, destroyed, 'raid');
    expect(world.totalBuildingsCompleted).toBe(1);
    expect(world.raidPrisonerHistory).toEqual(history);
    expect(reload(world).buildings.map((building) => building.id)).toEqual([900400]);
  });
});


if (process.env.WARFARE_SMOKE_FIXTURE_DIR) {
  it('exports verified saves for the existing browser harness', () => {
    const directory = process.env.WARFARE_SMOKE_FIXTURE_DIR!;
    mkdirSync(directory, { recursive: true });
    const recovery = colony();
    const before = structuredClone(recovery);
    recovery.buildings[0].health = 50;
    recovery.resources.food = 0;
    beginRaidRecovery(recovery, raid(), 'defeat', 1, before);
    const terminal = colony();
    const terminalBefore = structuredClone(terminal);
    terminal.entities = [];
    terminal.buildings = [];
    beginRaidRecovery(terminal, { ...raid(), intent: 'raze', attackerStrength: 100000 }, 'defeat', 1, terminalBefore);
    const captives = captiveColony();
    const raze = colony();
    raze.paused = true;
    raze.pendingRaidVictories = [{ raidId: 'raze-smoke', rivalId: 'enemy', rivalName: 'Enemy',
      playerDead: 0, enemyDead: 2, enemySurvivors: 8, playerCasualties: [], enemyCasualties: [] }];
    for (const [name, world] of Object.entries({ recovery, terminal, captives, raze })) {
      world.autoSave = false;
      world.tutorialSeen = ['all'];
      writeFileSync(path.join(directory, `${name}.json`), JSON.stringify(buildSaveData(world, createInitialView(world.width, world.height))));
    }
    expect(recovery.raidRecovery?.status).toBe('recovering');
    expect(terminal.raidRecovery?.status).toBe('destroyed');
    expect(captives.raidPrisonerHistory).toHaveLength(1);
  });
}


if (process.env.WARFARE_PERF_OUTPUT) {
  it('measures mass razing through the combat and removal owners', () => {
    const samples = [];
    for (const count of [100, 400, 1000]) {
      const world = colony();
      world.entities.forEach((person) => { person.job = JobType.Settler; });
      world.buildings = Array.from({ length: count }, (_, index) => building(950000 + index, BuildingType.Wall, { health: 40 }));
      world.totalBuildingsCompleted = count;
      const before = { buildings: world.buildings.map((home) => ({ ...home })), resources: { ...world.resources } };
      const start = performance.now();
      beginRaidRecovery(world, { ...raid(), intent: 'raze', attackerStrength: 100000 }, 'defeat', 1, before);
      samples.push({ buildings: count, population: world.entities.length, milliseconds: performance.now() - start });
      expect(world.buildings).toHaveLength(0);
      expect(world.totalBuildingsCompleted).toBe(0);
    }
    writeFileSync(process.env.WARFARE_PERF_OUTPUT!, JSON.stringify(samples, null, 2));
  });
}
