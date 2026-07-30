/** Shared sim profile names → script paths (used by sim-cli + sim-parallel). */
export const RUN_SIM = {
  militia: 'balance-militia.ts',
  city: 'benchmark-city.ts',
};

export const DIRECT = {
  '30min:city': 'run-city-30min.mjs',
  kill: 'kill-sims.mjs',
};

export const ALIASES = {
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
