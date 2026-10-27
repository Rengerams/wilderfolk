# Compatibility-only TypeScript facade migration

**Acceptance:** PR #68 merged into `main` on 27 October 2026 and is accepted. The checks below remain the verification recipe for later changes and do not imply the accepted PR is still pending.

Use `node scripts/migrate-compat-facades.mjs --scan` to identify pure re-export modules. A scan result is a **candidate**, not permission to remove a public API.

Run `node scripts/migrate-compat-facades.mjs src/game/example.ts` for a dry run. Review its caller list, then add `--apply` to rewrite static named imports and re-exports to their owning files and remove the facade. The migration rejects modules with implementation logic, unsupported import forms, unknown exports, and unresolved static references. Review literal file references and documentation separately. Keep the refactor and deletion in one commit.

**2026-10-27 migration:** `src/game/buildingActions.ts` was a pure re-export-only barrel. App, worker, UI, tests, and the remaining `gameEngine.ts` public barrel now import/re-export directly from the owning placement, staffing, residency, routing, maintenance, configuration, workshop, and interaction files.

`src/game/rendererLoader.ts` required a manual migration because it was not a pure re-export: `preloadRenderer()` was a no-op returning `Promise.resolve()`. App no longer awaits that no-op, and the game loop imports render functions directly from `renderer.ts`.

This is a **source-code migration**, not a save-data migration. `buildingActionRouting.ts` remains because it contains real behavior. `gameEngine.ts` remains an established public API; its existence is not sufficient evidence that it is safe to delete. For future facade migrations and release-hardening runs, run `npm run test:types`, `npm run lint`, `npm run build`, and `npm run audit:deps:cycles:strict` in a complete checkout.
