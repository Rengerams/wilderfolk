import { describe, expect, it } from 'vitest';
import { isWorkerCommand } from '../src/game/simWorker/commands';
import { MAX_STRIP_SEGMENTS } from '../src/game/stripBuild';

describe('batch strip demolition worker protocol', () => {
  it('accepts bounded unique positive building identifiers', () => {
    expect(isWorkerCommand({ proto: 1, op: 'demolishStripBuildings', buildingIds: [1, 2, 3] })).toBe(true);
  });

  it('rejects duplicates, invalid ids, excessive batches, and old protocol versions', () => {
    const cmd = (ids: unknown, proto = 1) => ({ proto, op: 'demolishStripBuildings', buildingIds: ids });
    expect(isWorkerCommand(cmd([1, 1]))).toBe(false);
    expect(isWorkerCommand(cmd([-1]))).toBe(false);
    expect(isWorkerCommand(cmd([1.1]))).toBe(false);
    expect(isWorkerCommand(cmd([]))).toBe(false);
    expect(isWorkerCommand(cmd(Array.from({ length: MAX_STRIP_SEGMENTS + 1 }, (_, i) => i + 1)))).toBe(false);
    expect(isWorkerCommand(cmd([1], 2))).toBe(false);
  });
});
