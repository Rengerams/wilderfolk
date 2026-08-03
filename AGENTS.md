# Repository Guidelines

Wilderfolk is a client-only frontier colony sim: **React 19 + TypeScript + Vite + Canvas 2D**, with an optional **PixiJS v8 WebGL renderer** and an optional Web Worker sim. Player docs: `README.md` · `CHANGELOG.md` · `ROADMAP.md`. Technical design: `docs/ARCHITECTURE.md`.

## Project Structure & Module Organization

- `src/game/` — simulation + rendering. One file per system (`dayCycle.ts`, `combat.ts`, `economy.ts`), plus `data/` (catalogs), `simWorker/`, and the renderers: `renderer.ts` (Canvas 2D), `pixiRenderer.ts` (WebGL), `rendererLoader.ts` (dispatch + automatic fallback).
- `src/components/` — React UI (PascalCase `.tsx`); tab panels in `tabPanels/`. Plus `src/hooks/`, `src/audio/`.
- `scripts/` — tooling: headless sims via `tsx`, asset generators via plain Node (`generate-bridge-sprite.mjs`, `generate-water-sprites.mjs`, no deps), Playwright playtests (`playtest*.py`).
- `public/` — static assets (sprites, incl. self-generated art). `docs/` is the single docs home; `docs/private/` holds gitignored local dev notes.
- Import via the `@/*` alias (e.g., `@/game/dayCycle`).

## Build, Test, and Development Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server at `http://localhost:5173` |
| `npm run build` | Type-check (`tsc -b`) then production build |
| `npm test` / `npm run test:watch` | Vitest once / watch mode |
| `npm run lint` | ESLint (flat config, `eslint.config.js`) |
| `npm run audit` | Knip (dead code) + dependency-cruiser (import cycles) |

Headless sims: `npx tsx scripts/<file>.mts`. Regenerate procedural art: `node scripts/generate-water-sprites.mjs`.

## Coding Style & Naming Conventions

- TypeScript is strict (`noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`, `erasableSyntaxOnly`); unused variables are errors — prefix intentional ones with `_`.
- Naming: camelCase logic modules, PascalCase components, `useX` hooks, `BuildingType`-style enums.
- UI never mutates world state ad hoc — send commands into the GameLoop and read published snapshots.
- Sim cadence is **72 ticks/day** (`TICKS_PER_HOUR = 3`); scale systems with `dayTicks()` / `PER_TICK_RATE_SCALE`, never local `* TICKS_PER_HOUR` factors.

## Testing Guidelines

- Vitest (node environment), tests colocated beside code: `<module>.<scenario>.test.ts` (e.g., `frontierCombat.raidGold.test.ts`). Current gate: 7 files / 31 tests, 0 skipped; `npm run lint` 0 errors.
- Regression tests get a comment header explaining the bug (see `hotkeys.test.ts`).
- Browser playtests: `python .deepcode/skills/webapp-testing/scripts/with_server.py --server "npm run dev" --port 5173 -- python scripts/playtest.py` (screenshots land in `playtest/`).

## Commit & Pull Request Guidelines

- Conventional commits (`feat:`, `fix:`, `chore:`) with optional scope, e.g. `feat(A1 water): flowing wave bands`. Remote: `origin` → `github.com/Rengerams/wilderfolk`, branch `main` (LF-normalized via `.gitattributes`).
- Bump `GAME_VERSION` and update `CHANGELOG.md` for gameplay-affecting changes; keep saves migrating (`_version` field).
- Track bugs with `<batch>-<item>` IDs (e.g., `EK-G4`) in `docs/private/BUGS_TRACKER.md`; closed work moves to `docs/private/archive/`.
- Run `npm test`, `npm run lint`, `npm run audit` before pushing; keep PRs focused on one system.

## Graphics & Configuration Tips

- Any new render FX must flow through `RenderSnapshot` or it is never drawn; the Pixi path reuses the Canvas 2D bakes and overlay pass.
- `rendererLoader` tries Pixi (WebGL) first; set `VITE_USE_PIXI=0` to force Canvas 2D.
- Runtime flags: `VITE_USE_GAME_WORKER=1`, `VITE_USE_SPATIAL_GRID=0`, `VITE_SPATIAL_GRID_INVARIANT=1`.
- `.env` holds local config — never commit secrets. Gitignored: `docs/private/`, `.deepcode/`, `skills/`, `playtest/`, `test-results/`.
