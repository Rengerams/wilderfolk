# Audit status — 2026-11-14

**Short answer: every known finding is resolved or explicitly closed as not-a-bug.** The current tree
passes the full `standard` gate. This is the entry point; the detailed registers are linked below.

## Current status

| Group | Status |
|---|---|
| Numbered (`S-01…S-18`, `W-01…W-147`) | **159 fixed**; `W-85` obsolete, `W-95` refuted, `W-96` unproven |
| Previously unnumbered (`N-01…N-31`) | **21 fixed with a regression**, 7 refuted/verified, 3 removed with the enemy-captive subsystem |
| Newly found `N-32` / `N-33` / `N-34` | **fixed** (jail release, jailed priest, skill attendance) |
| Focused re-audit `F-1…F-7` | **fixed** |
| Open findings | **none** in the current registers |
| Visitors | **retained** by owner decision (option 3) |

## Gate status on the current tree

- **`standard`: PASS** — 10/10 steps, **527 files / 3,478 tests**, 304.3 s.
- `types` (app/vitest/node/scripts), `owners`, `semantic`, `semantic-duplicate`, `cycles`, `dup`,
  `lint`, `check-docs`, `check-comments`: pass.
- **`calendar-scheduler`, `colony-integration`, `npm run build`:** green on the latest recorded run.
  They were not re-run after the war-captive / on-map-rival deletions; the `standard` gate was.
- **Full-year harness:** green on the latest recorded run; it asserts invariants and a valid terminal
  outcome, not scenario-dependent births/marriages.

## Recent code changes (2026-11-14)

- **War-captive system deleted**: `warPrisoners.ts`, `warPrisonerCustody.ts`, `warCaptive` /
  `raidPrisonerHistory`, POW UI, `resolveWarPrisoner`, POW rations, and their tests. Normal prison
  sentences, guards, escapes and prisoner housing remain. `applyWarCommunityReaction` moved to
  `raidAftermath.ts` for mercy/tribute/raze.
- **On-map rival path removed**: every legacy `faction === 'rival'` entity is pruned on the rival
  pulse; the `rival.entityIds` roster code and its on-map tests are gone. Strategic rival settlements,
  raids, diplomacy and the strategic map remain.
- **Visitors retained**: trader/refugee/performer/pilgrim/scholar/hunter events are unchanged.

## Canonical documents

| Document | What it contains |
|---|---|
| [audit-all-bugs-2026-11-12.md](audit-all-bugs-2026-11-12.md) | **All findings**, one row each: defect/fix, status, proof |
| [audit-open-items-2026-11-12.md](audit-open-items-2026-11-12.md) | Remaining-work view; currently says nothing is open |
| [audit-remediation-evidence-2026-11-12.md](audit-remediation-evidence-2026-11-12.md) | Per-finding proof strength (R/F/A/S) and red→green demos |
| [audit-fix-list-2026-11-12.md](audit-fix-list-2026-11-12.md) | Plain ID / fix / test list |

## Notes for an independent reviewer

1. `W-95` was refuted and `W-96` unproven — they are not fixes.
2. `W-85` is obsolete: rival settlements are strategic records, not on-map camps.
3. “Fixed” means implementation plus a cited proof row; only the four red→green demos were re-run by
   reverting the fix in this session.
4. The full-year harness is not a release gate; its scenario-dependent birth/marriage assertions were
   removed because a raid/Moon Howler can legitimately destroy the colony in year one.
