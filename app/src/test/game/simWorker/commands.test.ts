import { describe, expect, it } from 'vitest';
import { BuildingType } from '@/game/gameTypes';
import { freshState, makeAdultSettler } from '@/test/fixtures/gameFixtures';
import { applyWorkerCommand, aliveIdSet, extractCommandDelta, isWorkerCommand } from '@/game/simWorker/commands';

describe('WorkerCommand', () => {
  it('assignWorker mutates buildings and produces a command delta', () => {
    const state = freshState();
    const settler = makeAdultSettler(1);
    state.entities = [settler];
    const farmCfg = { width: 80, height: 60 } as const;
    state.buildings.push({
      id: 2,
      type: BuildingType.Farm,
      x: 400,
      y: 200,
      width: farmCfg.width,
      height: farmCfg.height,
      completed: true,
      constructionProgress: 100,
      occupants: [],
      health: 100,
      maxHealth: 100,
      level: 1,
      faction: undefined,
      buildAnimTimer: 0,
      spriteScale: 1,
    });

    const before = aliveIdSet(state);
    const next = applyWorkerCommand(state, { proto: 1, op: 'assignWorker', buildingId: 2, humanId: 1 });
    const delta = extractCommandDelta(next, before);

    expect(next.entities.find((e) => e.id === 1)?.homeBuildingId).toBe(2);
    expect(delta.buildings.some((b) => b.id === 2 && b.occupants.includes(1))).toBe(true);
    expect(delta.catalogEntities?.some((e) => e.id === 1 && e.homeBuildingId === 2)).toBe(true);
  });

  it('setSpeed command proto is rejected safely for unknown ops', () => {
    const state = freshState();
    const next = applyWorkerCommand(state, { proto: 1, op: 'spawnMoonHowlerDebug' });
    expect(next).toBeDefined();
  });

  it('rejects invalid command shapes before dispatch', () => {
    expect(isWorkerCommand(null)).toBe(false);
    expect(isWorkerCommand({ proto: 2, op: 'assignWorker' })).toBe(false);
    expect(isWorkerCommand({ proto: 1, op: 'notARealOp' })).toBe(false);
    expect(isWorkerCommand({ proto: 1, op: 'assignWorker', buildingId: 1 })).toBe(true);
  });
});