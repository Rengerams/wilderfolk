# Full code audit — 2026-11-20

- **Branch / commit:** `wilderfolk-code-audit` @ `883ea212`
- **Build inspected:** package `0.6.5.1`, `GAME_VERSION` `0.6.5.1`
- **Method:** every repository gate in `scripts/test.mjs` that can run locally, the two audit
  harnesses (`knip`, `worker-boundary`), static scanning for determinism/type-safety/error-handling
  escapes, a 30-day bot colony run, and a live boot of the app through the preview harness.
- **Verdict:** the code is in good shape — types, tests, determinism and save hardening are strong —
  but **the branch could not ship as found**: `npm run build` and the `standard` gate were red on the
  semantic overlap check, and `npm run audit` was red on `knip`. All findings are fixed in the same
  session — see [Remediation](#remediation-2026-11-20-same-day).

## Gate results

| Gate | Result | Evidence |
|---|---|---|
| `npm run check:source` | **PASS** | docs, comments, dialogue and shadow-file checks clean |
| `npm run test -- owners` | **PASS** | 1,890 functions with owner; 0 without |
| `npm run test -- semantic` | **FAIL** | 11 unresolved overlaps (see F-01) |
| `npm run test -- semantic-dup` | **NOT REACHED** | chained after `semantic`, which fails first |
| `npm run audit:deps:cycles` | **PASS** | 398 modules, 2,404 runtime edges, no runtime cycle (2 type-only cycles) |
| `npm run dup` | **PASS** | 4 clones / 4 groups, 0 new |
| `npm run test:types` | **PASS** | app, vitest, node and scripts projects clean |
| `npm run lint` | **PASS** | 0 errors, **9 warnings** (F-06) |
| `npm run test:unit` | **PASS** | 528 files, 3,480 tests, 212 s |
| `npm run test -- calendar-scheduler` | **PASS** | 18 tests, 11 s |
| `npm run build` | **FAIL** | stops at `check-function-overlap`; `vite build` alone succeeds |
| `npm run audit:knip` | **FAIL** | 4 findings (F-03) |
| `npm run test -- worker-boundary` | **FAIL** | 6 unexplained boundary divergences (F-04) |
| `npm run test:full-year:test` / `invariants` | **NOT RUN** | weekly gate, minutes-long; a 30-day run was used instead (see runtime section) |
| `npm audit --omit=dev` | **PASS** | 0 vulnerabilities |

## Findings

### F-01 — `standard` and `build` are red on the semantic overlap gate (blocker)

`check-function-overlap.mjs` reports **11 unresolved matches over 470 modified functions**. No
approval entries exist for them in `docs/tools/semantic-overlap-reviewed.json`, so both
`npm run test:standard` (step 3/10) and `npm run build` (third step) exit 1. `vite build` itself
succeeds in 2.2 s, so the production bundle is fine; the gate is the blocker.

The 11 matches split into three groups:

| Pair | Verdict |
|---|---|
| `worldEventSites.randomLegalPropPoint` ~ `worldGen.randomPassableWildlifePoint` | **real duplication**: two identical random-retry loops with different predicates, both commented as "the one random-point owner" |
| `workforce.countWorkersAtBuilding` ~ `countActiveWorkersAtBuilding` | legitimately distinct (the second excludes imprisoned settlers); needs an approval with `tests/workforce.jailRelease.test.ts` |
| `combat.rollPredatorBlock` ~ `rollCounterAttack` | legitimately distinct (different chance owner and salt); needs an approval with its combat tests |
| `randomLegalPropPoint` ~ 8 unrelated helpers (`nearestWalkableWorldPoint`, `nearestSnapPoint`, `findPlacementSpot`, `pickPoiForKind`, `getCaravanMoveTarget`, `findPath`, `planGroundChunks`, `findPassableHerdSpawn`) | false positives from short-function token overlap; record approvals rather than changing code |

Recommended: consolidate the two random-point owners into one predicate-taking helper (or make
`worldEventSites` call the `worldGen` owner), then add fingerprint-pinned approvals with evidence
tests for the genuinely distinct pairs. Re-run `npm run build` and `npm run test:standard`.

### F-02 — `npm run audit` cannot reach the cycles gate (high)

`audit` runs `knip && owners && cycles`. `knip` exits 1 (F-03), so `owners` and the load-bearing
`check-import-cycles` never run — the exact failure mode documented in `knip.ts`'s own header. Either
fix the knip findings or split `audit` so a knip finding cannot mask the cycle check.

### F-03 — `knip` findings (medium)

```
Unused dependencies (1)      glob                     package.json
Unlisted dependencies (1)    tailwindcss              src/index.css
Unlisted binaries (1)        tauri-windows-bundle     package.json
Unused exports (1)           getScheduleLastWorkedHours  src/game/scheduleFatigue.ts:105
Configuration hints (1)      tw-animate-css           knip.ts
```

- `glob` is declared but imported nowhere in `src/`, `scripts/`, `config/` or the root configs.
- `tailwindcss` is imported by `src/index.css` but only present transitively through
  `@tailwindcss/vite`; hoisting currently hides this.
- `tauri:windows:build` calls `tauri-windows-bundle`, which is not a declared dependency (absent
  from `package-lock.json`), so that npm script cannot run.
- `getScheduleLastWorkedHours` has no caller.

### F-04 — worker boundary audit red with 6 unexplained divergences (medium)

`scripts/worker-boundary-audit.mts` exits 1: 15 measured differences, 6 unclassified. The triage
table in `classify()` has no rule for them:

- `[save] genealogyRegistry — changed-on-load` — expected: `syncGenealogyRegistry` rebuilds the
  registry during `buildSaveData`; needs a documented benign rule.
- `[save] nextBuildingId — changed-on-load` — the loader's `floorIdAllocators` raises the allocator
  to one past the highest building id. This means the exported save carried an allocator at or below
  that id; worth confirming that the worker→host projection never saves a stale counter, then
  classify it as load-time repair.
- `[save] entity.needs — entity-field-diverged` (2 entities) — the only difference visible is
  `breakUntilRecovered: undefined` being materialized on one side and absent on the other; the
  probe's `stable()` serializer counts key presence, so this is the same class the probe already
  calls benign for deltas.
- `[ticks:delta]` / `[commands:delta]` `graveRecords — missing-on-source` — `undefined` vs `[]`
  normalization.

No data loss was demonstrated, but the gate is red and the triage table is stale relative to the
save fields added since 14 Nov.

### F-05 — stale audit status (medium)

`docs/plans/audit-status-2026-11-14.md` states "`standard`: PASS — 10/10 steps" and "every known
finding is resolved". That is no longer true on this tree (F-01, F-03, F-04). The document should be
superseded by this one or marked historical.

### F-06 — 9 `react-hooks/exhaustive-deps` warnings (low)

All in `src/App.tsx` (lines 557, 567, 672, 710, 794, 835, 932, 1109, 1240): `useCallback` lists
`loopRef.current` / `catalogRef.current` as a dependency. Reading a ref inside a callback is safe;
listing `.current` is a no-op and makes the intent unclear. Either drop the entry (refs are stable)
or read the value inside the callback with an explicit comment. Lint stays green either way.

### F-07 — version drift between web and desktop packages (low)

`package.json` / `GAME_VERSION` say `0.6.5.1`; `src-tauri/tauri.conf.json` and
`src-tauri/Cargo.toml` say `0.6.5-1` (a semver prerelease of 0.6.5). Tauri requires semver, so the
mapping is deliberate, but nothing documents it and an update check comparing the two would
disagree. Add a one-line note next to `GAME_VERSION` or align the release pipeline.

### F-08 — dead nested workflow file (low)

`.github/workflows/.github/workflows/120days.yml` is never executed by GitHub. It duplicates
`.github/workflows/120days.yml` with a different day count (`--days=100` vs `--days=120`), so it is
a stale copy that invites edits in the wrong file. Delete it.

### F-09 — `server.open: true` in `vite.config.ts` (low)

The dev server tries to launch a browser on start. Harmless in a container, noisy for headless and
CI runs; pass `--open=false` from the preview/CI command instead of hard-coding it.

### F-10 — bundle size (low, watch)

`vite build` emits `game-ui-mapsetup` at 851 kB (269 kB gzip) against the project's 1,000 kB warning
limit. Not a failure; it is the largest chunk and worth watching as map setup grows.

## Architecture assessment (what is healthy)

- **One-owner discipline is real:** 1,890 functions mapped to modules, 0 without an owner; 480
  decision-registry entries; the ownership gate is part of `standard`.
- **Determinism:** no `Math.random` in simulation code (only the captured native in `simRng` and the
  guard tests); seeded streams are keyed by domain; `simTrig` replaces `Math.sin/cos` for integrated
  positions.
- **Type safety:** `strict` + `noUnusedLocals/Parameters`; only 2 `any` (the Node worker shim) and one
  `@ts-expect-error` (a test importing a `.mjs` utility, with a reason). No `@ts-ignore`, no
  `dangerouslySetInnerHTML`, no `eval`/`new Function`.
- **Save hardening:** version gate, allow-listed save keys, id-allocator flooring, quota-aware slot
  routing (4 MB budget), separate imported-save slot, refused payloads always explain why.
- **Failure containment:** `GameErrorBoundary` at the root, worker stall detection with bounded
  main-thread fallback, worker recovery with generation guards.
- **Security:** Tauri CSP restricts scripts to `'self'`; no runtime dependency vulnerabilities.
- **Test weight is proportional:** 3,480 unit tests over 528 files, plus calendar-scheduler and
  weekly full-year gates; no `.only`/`.skip` left behind.

## Runtime verification

- `curl http://localhost:3000/` serves the live Vite dev bundle (not a prebuilt artifact).
- Preview: intro renders, "Choose your land" opens map setup, "Settle the valley" generates the
  world and starts the HUD; **0 console errors**.
- `npx tsx scripts/run-full-year.mts --scenario=producers --days=30 --bot`: colony healthy,
  **0 invariant violations, 0 stalled ticks, 0 serialization spikes**, 28 settlers, 33 buildings,
  60 bot actions. Observation to watch (not a confirmed defect): wolves grew 6 → 25 while rabbits
  fell 55 → 0 and deer 20 → 3 over 30 days in this scenario; worth checking against the ecology
  target before release.

## Recommended order

1. F-01 — resolve the overlap gate (consolidate the random-point pair, approve the distinct pairs),
   then `npm run build` and `npm run test:standard` must both pass.
2. F-02 / F-03 — clean the knip findings and stop knip from masking the cycle gate.
3. F-04 — triage and classify the boundary divergences (or fix the allocator/projection if
   `nextBuildingId` really is saved stale).
4. F-05 / F-08 — supersede the stale status doc, delete the dead nested workflow.
5. F-06 / F-07 / F-09 / F-10 — low-risk cleanup.

Per `docs/bug_report/readme.md`, any of these that turns out to be a player-visible defect (rather
than a gate/process finding) should get a dated report under `docs/bug_report/` plus one entry in
`docs/BUG_REPORTS/SUMMARY.md` when it is fixed.

## Remediation (2026-11-20, same day)

Every finding above was fixed on this branch. The gate table at the top is the state *before* the
fixes; none of these were player-visible defects, so no bug report was filed.

| Finding | Fix | Verification |
|---|---|---|
| F-01 | Root cause was in the call-graph index, not in the game code: `findBodyBrace` mistook a return-type literal (`): { x: number; y: number } | null {`) for the body and gave up past a 400-character parameter list, so 57 functions were compared on their signature line alone — that is where the eight score-1.0 "duplicates" came from. The parser now resolves the real body (type literals, tuple types, long destructured params, method return types). The one genuine duplicate, `randomLegalPropPoint` ~ `randomPassableWildlifePoint`, was consolidated into `simHelpers.randomPointWhere` with the two domain predicates passed at the single call site. The two genuinely distinct pairs (`countWorkersAtBuilding`/`countActiveWorkersAtBuilding`, `rollPredatorBlock`/`rollCounterAttack`) carry fingerprint-pinned approvals with their evidence tests. | `npm run test -- semantic`: 476 modified functions / 0 unresolved matches. `npm run build`: green. |
| F-02 | `audit` now runs `cycles` first, so a knip finding can never mask the cycle gate. | `npm run audit`: 3/3 steps pass. |
| F-03 | `glob` dropped (unused); `tailwindcss` declared (imported by `src/index.css`); the dead `tauri:windows:build` script removed (its binary was never a dependency); `tw-animate-css` no longer ignored (knip resolves the CSS import); `getScheduleLastWorkedHours` kept and wired into `getWorkdayAttendance`, the fallback it documents. | `npm run audit:knip`: pass, 0 findings. |
| F-04 | The probe's serializer now treats an explicit `undefined` property as absent (as JSON does), `graveRecords` is normalized like the other receiver-materialized slices, and `nextBuildingId` carries a documented load-time allocator-repair rule. `nextBuildingId` was verified not to be a stale counter: the export carried the unset `0` because the world held no buildings. | `npx tsx scripts/worker-boundary-audit.mts`: 8 measured differences / **0 unexplained**. |
| F-05 | `audit-status-2026-11-14.md` carries a superseded banner pointing here. | doc review |
| F-06 | Dependency arrays list the refs (`loopRef`, `catalogRef`, `viewRef`) instead of `.current`. | `npm run lint`: 0 warnings. |
| F-07 | `GAME_VERSION` carries a note that the desktop shells use the semver prerelease form. | — |
| F-08 | The dead nested workflow copy is deleted. | — |
| F-09 | `server.open` removed from the dev config; the environment runs with `BROWSER=none`. | — |

Gate state after remediation: `check`, `owners`, `semantic`, `semanticDup`, `cycles --strict`, `dup`,
`types`, `scriptsTypes`, `lint`, `unit` (528 files / 3,480 tests), `worker-boundary`, `knip`, `audit`
and `build` all pass. F-10 stays a watch item.

## Verification re-run (2026-11-20, branch head `3e0f2b97`)

Every gate was re-run from a clean checkout of the committed branch head, in the sandbox dev
container, to confirm the remediation holds and nothing regressed.

| Gate | Result |
|---|---|
| `npm run audit` | **PASS** — cycles → knip → owners, 3/3 steps (F-02 order) |
| `npm run test -- semantic` | **PASS** — 476 modified functions / 3,470 indexed / 0 unresolved matches |
| `npm run test -- worker-boundary` | **PASS** — 8 measured differences / 0 unexplained (F-04) |
| `npm run lint` | **PASS** — 0 warnings, 0 errors, 399 files (F-06) |
| `npm run build` | **PASS** — tsc app + node, overlap gate, lint, dup, `vite build` in 2.5 s (F-01) |
| `npm run test:unit` | **PASS** — 528 files |
| `npm run test -- types` / `dup` / `check` / `owners` / `cycles` | **PASS** |
| `npm run test:full-year:test` | **PASS** — 360 days / 103,680 ticks, seed 12345, no invariant violations (the weekly gate the first pass did not run) |

Environment note: this sandbox clone has no `origin/main`, so the overlap gate's default base ref
cannot resolve (`git merge-base HEAD origin/main`). It was run against the local `main` ref —
`SEMANTIC_BASE_REF=main npm run test -- semantic` and `npm run build` — which resolves to the same
merge-base CI computes. No source change is needed; CI keeps the default.

The year-long gate is a raid/howling year over four scaffolded settlers, so it proves invariants and
a live colony rather than population growth; the 30-day bot colony run above remains the growth
evidence. F-10 stays a watch item.
