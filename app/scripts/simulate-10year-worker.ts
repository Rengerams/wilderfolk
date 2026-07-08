/**
 * Worker-thread 10-year balance sim — validates live GameWorkerHost protocol (slower than main-thread).
 *
 * Run: npm run simulate:10year:worker
 * For fast balance testing use: npm run simulate:10year (main-thread, default).
 */
process.env.SIM_USE_WORKER = '1';
process.env.SIM_HEADLESS = process.env.SIM_HEADLESS ?? '1';
await import('./simulate-10year.ts');