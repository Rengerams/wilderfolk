import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameWorkerHost } from '../src/game/simWorker/GameWorkerHost';

afterEach(() => vi.restoreAllMocks());

describe('worker diagnostics sampling', () => {
  it('logs first failure, batches repeated errors and still reports distinct failures', () => {
    const host = new GameWorkerHost() as unknown as {
      reportWorkerError: (message: string) => void;
    };
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    host.reportWorkerError('deterministic tick failure');
    host.reportWorkerError('deterministic tick failure');
    host.reportWorkerError('deterministic tick failure');
    expect(log).toHaveBeenCalledTimes(1);
    host.reportWorkerError('new unrelated error');
    expect(log).toHaveBeenCalledTimes(3);
    expect(log.mock.calls[1]).toContain(2);
    expect(log.mock.calls[2]).toContain('new unrelated error');
  });
});
