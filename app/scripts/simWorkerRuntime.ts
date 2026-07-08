/**
 * Headless sim tick engine — worker_threads by default (matches live GameWorkerHost + SimTickDelta).
 * Set SIM_USE_WORKER=0 for legacy main-thread gameTick debugging.
 */
import { gameTick, type SimulationFocus } from '../src/game/gameEngine';
import type { WorldState } from '../src/game/gameTypes';
import { NodeSimWorkerHost, type SimTickTiming } from './simWorkerHost.node';

export type { SimTickTiming };

export function simUsesWorker(): boolean {
  return process.env.SIM_USE_WORKER !== '0';
}

/** Headless balance sims skip render SoA and use compact syncSimPrep (default on). */
export function simHeadless(): boolean {
  return process.env.SIM_HEADLESS !== '0';
}

export async function initSimWorkerHost(state: WorldState): Promise<{
  state: WorldState;
  host: NodeSimWorkerHost | null;
}> {
  if (!simUsesWorker()) return { state, host: null };
  const host = new NodeSimWorkerHost({ headless: simHeadless() });
  await host.init(state);
  return { state: host.getWorld(), host };
}

export async function advanceSimTick(
  state: WorldState,
  simFocus: SimulationFocus | undefined,
  workerHost: NodeSimWorkerHost | null,
): Promise<{ state: WorldState; timing: SimTickTiming | null }> {
  if (!workerHost) {
    const t0 = performance.now();
    const next = gameTick(state, simFocus);
    const ms = performance.now() - t0;
    return {
      state: next,
      timing: {
        importMs: 0,
        workerWaitMs: 0,
        mainSyncMs: ms,
        roundTripMs: ms,
      },
    };
  }
  const importStart = performance.now();
  if (workerHost.headless) {
    workerHost.syncSimPrep(state);
  } else {
    workerHost.importSave(state);
  }
  const importMs = performance.now() - importStart;
  workerHost.lastTickTiming = { importMs, workerWaitMs: 0, mainSyncMs: 0, roundTripMs: 0 };
  await workerHost.tick(simFocus);
  if (workerHost.lastTickTiming) workerHost.lastTickTiming.importMs = importMs;
  return { state: workerHost.getWorld(), timing: workerHost.lastTickTiming };
}

export function disposeSimWorkerHost(host: NodeSimWorkerHost | null): void {
  host?.dispose();
}