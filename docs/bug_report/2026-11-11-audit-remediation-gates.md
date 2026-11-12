# Verification-gate defects — audit remediation (2026-11-11)

- Bug: several gates could pass while proving nothing — a vacuous extinction assertion, a performance gate pointing at missing files, committed scratch tests, silently skipped docs, an undocumented test alias, a comment check that inspected nothing in CI, an untypechecked Node project, and an ownership gate with no coverage floor.
- Status: resolved
- Severity: high (W-10/W-11/W-12), medium (W-50/W-51/W-53/W-54/W-55)
- Date discovered: 2026-11-11
- Version/build: 0.6.5.1 → 0.6.5.2
- Reporter: full-code audit §4.7/§6
- Area: scripts, CI contracts, ownership gate
- Owner module: `scripts/*`

## Status history
- 2026-11-11 — resolved: each gate now fails when its input is broken; two vacuous files deleted.

## Observed behavior

- **W-10** `scripts/run-full-year.mts` asserted `world.entities.length > 0`, which trees, grass and wildlife satisfy, so an extinct colony still exited 0.
- **W-11** `scripts/benchmark-gate.mjs` invoked `scripts/run-sim.mjs` and `scripts/benchmark-city.ts`; neither exists and nothing referenced the gate.
- **W-12** `tests/tmp-gate.test.ts` case 1 had no `expect`; case 2 used `expect(decision?.command).not.toMatchObject(...)`, which passes when `decision` is `undefined`.
- **W-50** `check-docs.mjs` listed two wrong paths and silently skipped missing files, still printing "7 documents checked".
- **W-51** `npm test -- unit-all` was in the menu but had no alias entry.
- **W-53** `check-comments.mjs` diffed `HEAD`, so on a clean CI checkout it inspected nothing and passed.
- **W-54** The ownership gate had no coverage floor; any function in a file named by a table row got a module owner, so an empty/truncated index would still report "0 unowned".
- **W-55** The `types` step did not typecheck `tsconfig.node.json`; `tauri:dev:log` pointed at a script that does not exist.

## Expected behavior

A gate must fail when the thing it guards is broken, and must not report success while inspecting nothing.

## Reproduction steps

1. Kill every player settler, run the year harness: pre-fix it still passed.
2. `node scripts/benchmark-gate.mjs`: pre-fix MODULE_NOT_FOUND.
3. `npx vitest run tests/tmp-gate.test.ts` with the virtual-player action deleted: pre-fix green.
4. On a shallow CI checkout, `node scripts/check-comments.mjs`: pre-fix inspected nothing.
5. Delete a required doc and run `check-docs.mjs`: pre-fix skipped it and passed.

## Evidence

Audit traces (`run-full-year.mts:549`, `benchmark-gate.mjs:1-22`, `tmp-gate.test.ts:36-63`, `check-docs.mjs:13-21/35/82`, `test.mjs:108`, `check-comments.mjs:39`, `build-call-graph.mjs:641-660/743`, `test.mjs:36`, `package.json:27`) and the gate runs below.

## Root cause

Assertions were written against containers rather than the subject; some gates were wired to paths that drifted; some checks depended on a diff range that does not exist in CI.

## Fix / proposed fix

- Year harness asserts a living player human; invariants are collected per tick and asserted at checkpoints (also satisfies S-11's harness half).
- `benchmark-gate.mjs` deleted: it referenced no real harness, and the real perf runners are already covered by the perf workflows.
- `tmp-gate.test.ts` deleted; the virtual-player food gating it claimed to guard is covered by `tests/virtualPlayerHealthVerdict.test.ts` (63 tests).
- `check-docs.mjs` uses the real tracked paths and fails when a required document is missing.
- `unit-all` alias added.
- `check-comments.mjs` resolves a CI base (`COMMENTS_BASE_REF`, `PR_BASE_SHA`, or the event payload reduced by `merge-base`) and fails loudly when a configured base is unresolvable; local runs still diff `HEAD`. The one shallow-checkout workflow now fetches full history.
- `build-call-graph.mjs --verify-owners` now enforces coverage floors (files, functions, explicit owner entries) so a parser regression cannot pass as "0 unowned".
- `types` includes `tsc -p tsconfig.node.json --noEmit`; `tauri:dev:log` reported to the owner (it points at a never-tracked script; `package.json` was outside this batch).

## Save/migration impact

None.

## Verification result

- `check-docs`: **PASS** normally; with a required doc missing it exits 1 (verified on a scratch copy).
- `check-comments`: **PASS** on the tree; with `COMMENTS_BASE_REF=HEAD~40` it fails on a committed history comment (proves committed ranges are inspected); invalid base exits 1.
- `unit-all` alias: verified on a scratch copy (passes with the alias, exits 1 without).
- `types`: app/vitest/scripts/node tsconfigs each typecheck (full `standard` run after integration).
- Ownership floors: `node scripts/build-call-graph.mjs --json-only --verify-owners` → 399 files / 3,429 functions / 1,512 explicit entries, floors satisfied.
- Full-year harness, browser gate and perf workflows: not run in this batch (the year harness runs in the integration step).
