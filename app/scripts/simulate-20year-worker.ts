/**
 * v0.5.0 worker ship gatekeeper — 20 in-game year balance simulation via Web Worker.
 *
 * Run: npm run simulate:20year:worker
 * Same full logging as simulate:10year / simulate:20year (main log, life log, chronicle, gates).
 * Ticks run on worker_threads; auto-build / diplomacy / raids stay on main thread (synced each tick).
 *
 * Env: same as simulate-10year (SIM_YEARS, SIM_PROFILE, SIM_LOG_FILE, SIM_CHRONICLE_FILE, …)
 */
process.env.SIM_YEARS = process.env.SIM_YEARS ?? '20';
process.env.SIM_USE_WORKER = '1';
process.env.SIM_HEADLESS = process.env.SIM_HEADLESS ?? '1';
await import('./simulate-10year.ts');