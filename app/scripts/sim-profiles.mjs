/** Shared sim profile names → script paths (used by sim-cli + sim-parallel). */
export const RUN_SIM = {
  '5min': 'simulate-5min.ts',
  '30min': 'simulate-30min.ts',
  housing: 'simulate-housing.ts',
  'housing:ticks': 'simulate-housing-ticks.ts',
  family: 'simulate-family.ts',
  social: 'simulate-social.ts',
  militia: 'balance-militia.ts',
  '10year': 'simulate-10year.ts',
  '10year:worker': 'simulate-10year-worker.ts',
  '20year': 'simulate-20year.ts',
  '20year:worker': 'simulate-20year-worker.ts',
  city: 'benchmark-city.ts',
};

export const DIRECT = {
  '30min:city': 'run-city-30min.mjs',
  kill: 'kill-sims.mjs',
};

export const ALIASES = {
  simulate: '5min',
  balance: 'militia',
};

export function resolveProfile(raw) {
  const profile = ALIASES[raw] ?? raw;
  const ts = RUN_SIM[profile];
  if (ts) return { profile, ts, viaRunSim: true };
  const direct = DIRECT[profile];
  if (direct) return { profile, ts: direct, viaRunSim: false };
  return null;
}