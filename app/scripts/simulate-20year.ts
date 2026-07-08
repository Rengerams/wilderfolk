/**
 * v0.5.0 ship gatekeeper — 20 in-game year balance simulation.
 *
 * Run: npm run simulate:20year
 * Same gates as simulate-10year but SIM_YEARS=20 (pop gates scale with years; town ~259–859 @ 20y).
 * Uses snapBuildingCenter for walls/roads (matches in-game placement).
 *
 * Exit 0 = PASS — safe to tag v0.5.0 after the full sim battery is green.
 */
process.env.SIM_YEARS = process.env.SIM_YEARS ?? '20';
await import('./simulate-10year.ts');