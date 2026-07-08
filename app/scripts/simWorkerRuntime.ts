/**
 * Headless sim tick engine — worker_threads by default (matches live GameWorkerHost + SimTickDelta).
 * Balance sims (simulate-*year.ts, not *-worker) default to main-thread ticks for throughput.
 * Set SIM_USE_WORKER=1 / =0 to override.
 */
import { gameTick, type SimulationFocus } from '../src/game/gameEngine';
import type { WorldState } from '../src/game/gameTypes';
import { NodeSimWorkerHost, type SimTickTiming } from './simWorkerHost.node';

export type { SimTickTiming };

/** npm run sim / run-sim.mjs entry scripts that should not default to worker_threads. */
function balanceSimEntryScript(): boolean {
  const script = (process.argv[1] ?? '').replace(/\\/g, '/');
  return /simulate-\d+year\.ts$/.test(script) && !/worker/i.test(script);
}

export function simUsesWorker(): boolean {
  const flag = process.env.SIM_USE_WORKER;
  if (flag === '0') return false;
  if (flag === '1') return true;
  if (balanceSimEntryScript()) return false;
  return true;
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