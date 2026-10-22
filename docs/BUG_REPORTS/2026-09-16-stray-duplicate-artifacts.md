# Stray duplicated artifacts in the working tree: a byte-identical 1 MB PNG pair, stale `.mjs` script twins, and a 0-byte junk file

- **Bug:** four unrelated pieces of dead weight sit in the working tree and confuse both tooling and
  readers: (a) `src/image.png` and `tests/log` are **byte-identical** 1 025 202-byte PNG files that no
  source references; (b) `scripts/run-full-year.mjs`, `scripts/repro-worker-stall.mjs` and
  `scripts/smoke-build.mjs` are stale twins of live `.mts` siblings that have since diverged (the
  `.mjs` copies are what a reader finds first, but `package.json` runs the `.mts` ones); (c)
  `scripts/tsx perf-all.ts` is a 0-byte file whose name is a mis-typed shell redirect
- **Status:** resolved
- **Date discovered:** 2026-09-16
- **Version/build:** 0.6.4
- **Reporter:** autonomous full-audit pass (lead, "double code" audit)
- **Area:** Truth (repository hygiene)
- **Owner module:** repository root / `scripts/`

## Status history

- 2026-09-16 — open (found during the duplication/dead-code pass of the full audit)
- 2026-09-16 — resolved (owner decision: delete the whole set — both copies of the PNG, the three superseded `.mjs` twins and the 0-byte junk file; the `.mts` siblings are what `package.json` runs and they are untouched)

## Observed behavior

**(a) The PNG pair.** `src/image.png` and `tests/log` have the same SHA-256
(`c62058aa556ca23ef222a7838f0fb9afab1b42a5a2ad9e5216eb87a14510d613`) and the same size. Both start
with the PNG signature `89 50 4E 47 0D 0A 1A 0A`. No file in `src/**` references either path.
`src/` is not gitignored (`.gitignore` ignores `tests/*` but has no rule for `src/` or for `*.png`),
so `src/image.png` is a 1 MB binary that the source tree carries; `tests/log` is a misleading bare
name (no extension) inside the test directory, which also makes `Get-ChildItem tests -Directory`
style exploration read it as a directory entry. (No `.git` directory exists in this working copy, so
tracked-vs-untracked status could not be read from the repository itself; the claim is limited to
what `.gitignore` does and does not cover.)

**(b) Script twins.** Three script stems exist as both `.mjs` and `.mts` and the pairs are no longer
the same program:

| Stem | `.mjs` | `.mts` | Identical | `.mts` modified |
|---|---|---|---|---|
| `run-full-year` | 302 lines | 401 lines | no | later (2026-09-14) |
| `repro-worker-stall` | 176 lines | 191 lines | no | — |
| `smoke-build` | 56 lines | 65 lines | no | — |

`package.json:20` runs `tsx scripts/run-full-year.mts`, so the `.mjs` twin is dead code that still
looks authoritative.

**(c) The junk file.** `scripts/tsx perf-all.ts` is 0 bytes; its name is the literal text of a
mistyped command (`tsx perf-all.ts` run without a redirect target), creating a file instead of
running the real `scripts/perf-all.ts`.

## Expected behavior

The working tree contains only files the project reads or deliberately ships. Duplicated binaries and
superseded script copies are removed, or the surviving copy is the only one present.

## Reproduction steps

1. `Get-FileHash src\image.png; Get-FileHash tests\log` → identical SHA-256.
2. `Get-ChildItem scripts -File | Where-Object { $_.Length -eq 0 }` → `tsx perf-all.ts`.
3. For each `.mjs` under `scripts/`, compare with the same-stem `.mts`; three pairs differ.

## Evidence

- `src\image.png` SHA-256 `c62058aa…10d613`; `tests\log` SHA-256 `c62058aa…10d613`.
- Primitive grep across `src/**/*.{ts,tsx,css,html}` for `image\.png` → **no matches** in `src/`
  (the only repository hits are PixiJS documentation strings under `node_modules`).
- `scripts/run-full-year.mjs` 14 911 bytes / 302 lines (2026-09-08) vs `scripts/run-full-year.mts`
  17 133 bytes / 401 lines (2026-09-14); `package.json:20` → `"test:full-year": "tsx scripts/run-full-year.mts"`.
- `scripts/tsx perf-all.ts` — 0 bytes.
- `tmp/audit-baseline/audit.log` — knip's unused-export list is separate; these files are not
  reported by knip because they are unreferenced non-module assets.

## Root cause

Manual backups and mis-typed shell invocations accumulated in the working tree. `tests/*` and
`scripts/*` are gitignored (`.gitignore:20`, `.gitignore:72`), so nothing ever surfaced the duplicates
in review, and no check treats a zero-byte or duplicate-binary file as a defect.

## Regression test

Not written. A cheap guard would extend `scripts/check-source-shadow-files.mjs` to fail on
zero-byte files under `scripts/`/`src/` and on duplicate-content files inside `src/`. Ownership of
that decision belongs to the repository owner (the files are local-only and gitignored).

## Invariants checked

Not applicable (no runtime behaviour). Related to the "single source of truth" rule in `AGENTS.md`
§5.2 for the script twins.

## Save/migration impact

None.

## Verification result

- Hash comparison and PNG signature check — confirmed identical pair.
- Recursive grep — confirmed `src/image.png` has no consumer.
- Package-script inspection — confirmed only the `.mts` full-year runner is wired.
- `npm run build` / `npm run lint` / `npm run test:standard` — green with these files present, so
  they are inert at runtime; the risk is reader/tooling confusion and 1 MB of tracked binary.

## Related commits or files

- `src/image.png`, `tests/log`
- `scripts/run-full-year.mjs`, `scripts/repro-worker-stall.mjs`, `scripts/smoke-build.mjs`
- `scripts/tsx perf-all.ts`, `scripts/perf-all.ts`
- `BUG_REPORTS/2026-09-16-stale-source-archives-hidden-in-src.md` (same family: duplicated sources)

## Fix

Every artifact in the set was deleted, on the owner's instruction:

| Deleted | Why |
|---|---|
| `src/image.png`, `tests/log` | byte-identical 1 MB PNGs (`c62058aa…10d613`), no consumer in `src/`, one of them a misleading extensionless name inside `tests/` |
| `scripts/run-full-year.mjs`, `scripts/repro-worker-stall.mjs`, `scripts/smoke-build.mjs` | superseded `.mjs` twins of the live `.mts` scripts; `package.json` runs the `.mts` files, and the twins had diverged |
| `scripts/tsx perf-all.ts` | 0-byte file created by a mistyped shell command, not a source file |

The `.mts` siblings and the real `scripts/perf-all.ts` are untouched. No reference to any deleted path
remains outside this report (recursive grep over `*.md`, `*.json`, `*.ts`, `*.tsx`, `*.mjs`, `*.mts`).

**Follow-up — half closed 2026-09-16.** `scripts/check-source-shadow-files.mjs` (the
`npm run check:source` step of `npm test`) now fails on any zero-byte file under `src/`, `tests/`,
`scripts/` or `config/`, so `scripts/tsx perf-all.ts` could not come back unnoticed; it also fails on
ZIP/gzip content anywhere under those roots. Duplicate **content** (the byte-identical PNG pair) is not
detected — that would need a hash pass over every file, which is a deliberate separate decision.

## Verification result

After the deletions:

- `Get-ChildItem scripts -File -Filter *.mjs` — the remaining 16 `.mjs` scripts are all live ones (browser smoke, cut-sprite-sheet, cycle scripts, …); none of the three twins is present.
- `Get-ChildItem src\components, src\hooks -File | Where-Object { $_.Extension -notin '.ts','.tsx' }` — no output.
- `npm test` — passed (`check:source`, `dup`, vitest suite); `npm run build`, `npm run lint` (0/0), `npm run test:types` — passed.
- Before the fix (audit evidence): identical SHA-256 for the PNG pair, three diverged `.mjs`/`.mts` pairs, and a 0-byte `scripts/tsx perf-all.ts`.
