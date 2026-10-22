# Three stale ZIP archives of live source files sit inside `src/` behind `.txt`/`.zip` names

- **Bug:** `src/components/tabPanels.zip`, `src/components/components.txt` and `src/hooks/hooks.txt`
  are ZIP archives (PKZIP signature `50 4B 03 04`), not text or build output. Each contains whole
  copies of files that also exist as live TypeScript sources under `src/`, and several of those
  copies have **drifted** from the live file. `npm run check:source` only catches a `.js` file
  shadowing a `.ts` module, so these duplicates are invisible to the integrity gate
- **Status:** resolved
- **Date discovered:** 2026-09-16
- **Version/build:** 0.6.4
- **Reporter:** autonomous full-audit pass (lead, "double code" audit)
- **Area:** Truth (repository hygiene / duplicated sources)
- **Owner module:** `src/components/`, `src/hooks/` (contents are stale copies, not owned code)

## Status history

- 2026-09-16 — open (found during the duplication/dead-code pass of the full audit)
- 2026-09-16 — resolved (owner decision: delete all three archives; nothing in the repository reads them, the live sources are the only authority, and `src/` now holds no non-source leftovers)

## Observed behavior

Three files inside the shipped source tree are archives of source files:

| Archive | Live counterparts inside it | Drifted copies |
|---|---|---|
| `src/components/tabPanels.zip` | all 8 `src/components/tabPanels/*.tsx` | `MoreTabPanel.tsx`, `NatureTabPanel.tsx`, `VillageTabPanel.tsx` |
| `src/components/components.txt` | many `src/components/*.tsx` | (spot-checked: first five identical) |
| `src/hooks/hooks.txt` | `src/hooks/*.ts(x)` | `useCanvasInteractions.ts`, `useFpsMeter.ts`, `useGameAudio.ts`, `useGamePersistence.ts` |

A reader or agent that greps the tree, or that extracts the archive believing `.txt` is a note,
gets a source file that is no longer the one the build compiles — silently.

## Expected behavior

Source ownership is one file, one path (`OWNERSHIP_OVERVIEW.md`, "Single-definition rule").
Duplicate snapshots of live modules should not exist inside `src/`; if an archive is wanted for
distribution it belongs outside the source tree (and outside the build inputs), and it must not be
disguised with a `.txt` extension.

## Reproduction steps

1. `Get-Content src\components\components.txt -TotalCount 1` → starts with `PK` control bytes.
2. `Copy-Item src\components\tabPanels.zip tmp\zipprobe -Force` style: `Expand-Archive` the three files.
3. Compare each extracted `.tsx`/`.ts` with its live counterpart (`Get-FileHash`), e.g.
   `MoreTabPanel.tsx` → DRIFTED, `DynastyPanel.tsx` → IDENTICAL.

## Evidence

- Header bytes of `src/hooks/hooks.txt`: `50 4B 03 04 14 00 00 00 08 00` (PKZIP local file header).
- `Expand-Archive src\components\tabPanels.zip` produced `tabPanels\DynastyPanel.tsx … VillageTabPanel.tsx` (8 files).
- MD5 comparison, extracted vs. live: `DynastyPanel.tsx` IDENTICAL, `FrontierTabPanel.tsx` IDENTICAL,
  `LogTabPanel.tsx` IDENTICAL, `ProgressTabPanel.tsx` IDENTICAL, `ValleyChroniclePanel.tsx` IDENTICAL,
  **`MoreTabPanel.tsx` DRIFTED**, **`NatureTabPanel.tsx` DRIFTED**, **`VillageTabPanel.tsx` DRIFTED**.
- From `src/hooks/hooks.txt`: `useContextualTutorial.ts` IDENTICAL, **`useCanvasInteractions.ts` DRIFTED**,
  **`useFpsMeter.ts` DRIFTED**, **`useGameAudio.ts` DRIFTED**, **`useGamePersistence.ts` DRIFTED**.
- Nothing in the repository reads them: a recursive grep for `components.txt`, `hooks.txt` and
  `tabPanels.zip` across `src/**/*.{ts,tsx,css,html}` returns **no matches** (the only hits in the
  tree are unrelated PixiJS doc examples inside `node_modules`).
- `npm run check:source` passes (`Source integrity OK: no JavaScript files shadow TypeScript modules`),
  confirming the existing integrity gate does not cover this class.
- `.gitignore` has no rule for `*.zip` or for these `.txt` names, so they are ordinary tracked
  candidates inside a tracked directory (`src/` is not ignored).

## Root cause

A working copy of `src/components/` and `src/hooks/` was zipped and dropped back into the source
tree (and renamed to `.txt`), most likely as a manual backup. The copies were then edited
independently of the live files, which is exactly the drift the "single source of truth" rule
exists to prevent.

## Regression test

Extend `scripts/check-source-shadow-files.mjs` (or add a sibling check under `scripts/`) to fail when
a file under `src/` has a non-source extension (`*.txt`, `*.zip`, `*.bak`, …) and its content starts
with a known archive signature or duplicates an existing module's basename. Not yet written.

## Invariants checked

`OWNERSHIP_OVERVIEW.md` "Single-definition rule" (one implementation per responsibility) is violated
in the weaker sense that two byte-different copies of the same module exist, one of them unreferenced.
No runtime invariant is affected — the build does not read the archives.

## Save/migration impact

None.

## Verification result

- Archive signature check — confirmed (PKZIP) on all three files.
- `Expand-Archive` + per-file MD5 comparison against live sources — confirmed 7 drifted copies.
- Recursive grep for the three paths in `src/**` — 0 consumers.
- `npm run check:source` — passed, i.e. the gate does not see them.
- `npm run build` — exit 0 with the archives present (they are inert build inputs).

## Related commits or files

- `src/components/tabPanels.zip`, `src/components/components.txt`, `src/hooks/hooks.txt`
- `scripts/check-source-shadow-files.mjs` (the gate that does not cover this class)
- `BUG_REPORTS/2026-09-08-generated-js-shadows-src.md` (the same family: shadow copies under `src/`)

## Fix

All three archives were deleted from the source tree: `src/components/tabPanels.zip`,
`src/components/components.txt` and `src/hooks/hooks.txt`. They had no consumer (a recursive grep for
the three paths under `src/**` returns nothing), the build never read them, and the live TypeScript
modules were already the only compiled authority — the archives were stale snapshots, seven of whose
members had drifted. `src/components/` and `src/hooks/` now contain only `.ts`/`.tsx` sources.

**Follow-up — closed 2026-09-16.** `scripts/check-source-shadow-files.mjs` (the `npm run check:source`
step of `npm test`) now fails on a ZIP or gzip file found anywhere under `src/`, `tests/`, `scripts/` or
`config/`, whatever its extension, in addition to the original `.js`-shadows-`.ts` rule. A manual backup
inside the source tree can no longer pass the gate.

## Verification result

After the deletion:

- `npm test` — passed: `check:source` (source integrity OK), `dup`, and the vitest suite; no file in the tree references the three paths any more (recursive grep over `*.md`, `*.json`, `*.ts`, `*.tsx`, `*.mjs`, `*.mts` leaves only this report's own quotations).
- `npm run build`, `npm run lint` (0 warnings / 0 errors), `npm run test:types` — passed.
- `Get-ChildItem src\components, src\hooks -File | Where-Object { $_.Extension -notin '.ts','.tsx' }` — no output.
- Before the fix (audit evidence): PKZIP headers on all three, seven drifted members, zero consumers, and `npm run check:source` green while they were present.
