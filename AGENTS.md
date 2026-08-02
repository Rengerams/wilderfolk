# Repository Guidelines

Wilderfolk is a client-only colony sim built with **React 19 + TypeScript + Vite + Canvas 2D**, with an optional Web Worker sim. Player docs: `README.md` · `CHANGELOG.md` · `ROADMAP.md`. Technical design: `docs/ARCHITECTURE.md`.

## Project Structure & Module Organization

- `src/game/` — simulation logic. One file per system (`dayCycle.ts`, `combat.ts`, `economy.ts`), plus `data/` (catalogs), `simBuffers/`, and `simWorker/`.
- `src/components/` — React UI (PascalCase `.tsx`); tab panels in `src/components/tabPanels/`. `src/hooks/` — custom hooks; `src/audio/` — audio director; `src/test/` — shared Vitest setup.
- `scripts/` — headless sims and tooling (`simBuildPolicy.ts`, `perf-at-pop.ts`, `smoke-build.mts`), run with `tsx`.
- `public/` — static assets; `docs/` — architecture, marketing, archives; `private/` — local-only dev notes, **gitignored** (bugs, open problems, eng reference).
- Import via the `@/*` alias (`@/game/dayCycle`), configured in `tsconfig.json`.

## Build, Test, and Development Commands

| Command | Purpose |
|---|---|
| `npm install` | Install dependencies |
| `npm start` / `npm run dev` | Vite dev server at `http://localhost:5173` |
| `npm run build` | Type-check (`tsc -b`) then production build |
| `npm test` / `npm run test:watch` | Run Vitest once / watch mode |
| `npm run test:all` | Tests + type-check tests (`npm run test:types`) |
| `npm run lint` | ESLint (flat config, `eslint.config.js`) |
| `npm run audit` | Knip (dead code) + dependency-cruiser (import cycles) |
| `npm run dup` | jscpd duplicate scan (target: 0 clones) |

Headless sims run from `scripts/` via `tsx`, e.g. `npx tsx scripts/smoke-build.mts`.

## Coding Style & Naming Conventions

- TypeScript is strict (`strict`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`, `erasableSyntaxOnly`); run `npm run lint` and `npm run test:types` before pushing.
- Unused variables are errors; prefix intentionally unused args with `_`.
- Naming: camelCase logic modules (`dayCycle.ts`), PascalCase components (`SelectedBuildingPanel.tsx`), `useX` hooks, `BuildingType`-style enums for domain types.
- Architecture rule: UI never mutates the world ad hoc — send commands into the GameLoop and read published snapshots.
- Sim cadence is **72 ticks/day** (`TICKS_PER_HOUR = 3`). Scale systems with `dayTicks()` / `PER_TICK_RATE_SCALE` — never invent local `* TICKS_PER_HOUR` factors.

## Testing Guidelines

- Framework: Vitest (node environment). Tests colocate beside the code as `<module>.<scenario>.test.ts`, e.g., `frontierCombat.raidGold.test.ts`, `hotelStay.checkout.test.ts`.
- Write regression tests with a comment header explaining the bug (see `hotkeys.test.ts`).
- Current gates: ~390 tests, 0 skipped; lint 0 errors; jscpd 0 clones.

## Commit & Pull Request Guidelines

- No Git history in this checkout; match `CHANGELOG.md`: Keep a Changelog style with `Added` / `Changed` / `Fixed` sections and a `[version] — date` heading per release.
- Bump `GAME_VERSION` and update `CHANGELOG.md` for gameplay-affecting changes; keep saves migrating (`_version` field; 0.4.x+ saves step up).
- Track bugs with `<batch>-<item>` IDs (e.g., `EK-G4`) in `private/BUGS_TRACKER.md`; closed work moves to `private/archive/`.
- Keep PRs focused on one system; run `npm test`, `npm run lint`, `npm run audit` before opening, and link the relevant roadmap item or issue.

## Security & Configuration Tips

- `.env` holds local config; it is not covered by `.gitignore` — never commit secrets.
- Runtime flags: `VITE_USE_GAME_WORKER=1` (worker sim), `VITE_USE_SPATIAL_GRID=0` (fallback full-list scans), `VITE_SPATIAL_GRID_INVARIANT=1` (per-tick grid invariant asserts).
