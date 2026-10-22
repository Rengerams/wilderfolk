# Bug: Generated JavaScript shadows under src/

- Status: resolved
- Date discovered: 2026-09-08
- Version/build: 0.6.4 (working tree)
- Reporter: developer via agent audit
- Area: tooling | Truth | UI (resolver preferred .js over .ts)
- Owner module: source integrity (`scripts/check-source-shadow-files.mjs`)
- Cadence: Not applicable — tooling / workspace integrity

## Status history
- 2026-09-08 — open (audit found 311 `.js` files under `src/` shadowing `.ts`/`.tsx`)
- 2026-09-08 — investigating (empty `tsconfig.test.json` re-emitted `.js` into `tests/`, `scripts/`, and root configs on `tsc`)
- 2026-09-08 — resolved (deleted all twins; removed empty `tsconfig.test.json`; restored `tsconfig.json` / `tsconfig.vitest.json` / `package.json` / vite configs from HEAD; expanded shadow checker; vitest 87/87 pass)

## Observed behavior
- `npm run check:source` failed: 257 `.js` files shadowed `.ts` modules (plus 54 more that shadowed `.tsx`, which the checker does not yet list).
- Vitest/Vite preferred many of those `.js` artifacts over the authoritative TypeScript sources.
- Broken emit in `src/game/challenges.js` imported `./building` (missing); that cascade failed **43** test files while only **220** tests in other files still ran/passed.
- Untracked/config damage accompanied the event: empty `tsconfig.test.json`, `test:types` pointed at it, `tsconfig.vitest.json` overwritten to look like `tsconfig.app.json`, `vite.config.ts` imported missing `@tailwindcss/vite`, `vitest` removed from `package.json` direct deps.

## Expected behavior
- Authoritative sources under `src/` are TypeScript/TSX only.
- No generated `.js` twins beside `.ts`/`.tsx` modules.
- `npm run check:source` passes; the module resolver loads `.ts`/`.tsx`.

## Reproduction steps
1. Place a `.js` twin next to any `src/**/*.ts` module (or run a transpile that emits into `src/`).
2. Run `npm run check:source` — fails.
3. Run `npx vitest run` — imports may resolve the `.js` twin first and fail or run stale logic.

## Evidence
- `check:source` listed 257 `.ts` shadows before cleanup.
- Inventory: 311 `src/**/*.js` (257 `.ts` + 54 `.tsx` twins), 0 orphans.
- Vitest before cleanup: `Test Files 43 failed | 44 passed`, error `Cannot find module './building' imported from .../challenges.js`.
- After deleting all `src/**/*.js` and restoring `challenges.ts`: `check:source` → OK.

## Root cause
Generated JavaScript was written into `src/` beside authoritative TypeScript. Bundler/test resolution preferred `.js`, so broken or stale emit (especially `challenges.js` with `./building` instead of `./buildings`) became the runtime path. Separately, workspace config drift (`tsconfig.test.json` empty and referenced from `tsconfig.json`) made `npm run test:types` report thousands of cascade errors (no `jsx` under default options).

## Fix
1. Delete every `src/**/*.js` file (311 files).
2. Delete `config/vite.shared.js` and `knip.js` shadows.
3. Restore `src/game/challenges.ts` imports from HEAD (`./gameTypes`, `./buildings`).
4. Confirm `npm run check:source` passes.

## Regression test
- `npm run check:source` (already gated by `npm run test:standard`).
- Prefer extending the shadow checker to also reject `.js` beside `.tsx`.

## Invariants checked
- Source integrity: TypeScript remains the only module authority under `src/`.
- No second mutation path via stale JS emit.

## Save/migration impact
Not applicable — contained tooling/workspace defect. No save schema change.

## Verification result
- `npm run check:source`: pass after deletion.
- `challenges.ts` wrong-import errors gone from `tsc -p tsconfig.app.json`.
- Remaining ~21 app type errors and broader config drift (`tsconfig.test.json`, vite tailwind plugin, missing `vitest` dep) are separate follow-ups; not caused solely by the JS twins.

## Related files
- `scripts/check-source-shadow-files.mjs`
- `src/game/challenges.ts` (restored)
- Deleted: all former `src/**/*.js`, `config/vite.shared.js`, `knip.js`
