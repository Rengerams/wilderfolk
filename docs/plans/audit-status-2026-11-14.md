# Audit status — 2026-11-14

**Short answer: no, not all bugs are fixed.** This is the current entry point for an independent
review. It links the detailed registers instead of repeating 162 rows here.

## Current counts

| Group | Status |
|---|---|
| Numbered findings (`S-01…S-18`, `W-01…W-147`) | **159 fixed**; `W-85` obsolete, `W-95` refuted, `W-96` unproven |
| Unnumbered §4/§5 (`N-01…N-31`) | **18 fixed**, **8 open**, **5 need verification** |
| `N-32` / `N-33` (jail release, jailed priest) | **fixed**, regression pass 3/3 |
| `N-34` (skill multiplier) | **by design** — skill grows only while working |
| Focused re-audit `F-1…F-7` | fixed |
| Visitors | **retained** by owner decision (option 3) |

## Still open

**Open:** `N-14` registry drift, `N-16` combat LCG, `N-17` unseeded leisure, `N-19` scent grid,
`N-20` playmate cache, `N-24` global `Math.random`, `N-25` `Math.sin/cos`, `N-28` enemy capture
unreachable.

**Needs verification:** `N-15` two seed authorities, `N-22` floating text, `N-27` leadership null
branch, `N-29` relocation counters, `N-30` Moon Howler population dip.

**Gates:** `standard`, `calendar-scheduler`, `colony-integration`, `vite build` have **not** been
rerun after the latest war-captive / on-map-rival changes. The full-year harness is **RED** on its
birth non-vacuity assertion (a bad assertion for a random year, not a game bug).

## Recent code changes (2026-11-14)

- **War-captive system deleted**: `warPrisoners.ts`, `warPrisonerCustody.ts`, `warCaptive` /
  `raidPrisonerHistory`, POW UI, `resolveWarPrisoner` command, POW rations, and their tests. Normal
  prison sentences, guards, escapes and prisoner housing remain. `applyWarCommunityReaction` moved to
  `raidAftermath.ts` for mercy/tribute/raze.
- **On-map rival path removed**: all legacy rival entities are now pruned every rival pulse, not only
  orphans; the `rival.entityIds` roster code and its tests are gone; strategic rival settlements and
  raids remain.
- **Visitors retained** (option 3) — no visitor deletion yet.

## Canonical documents

| Document | What it contains |
|---|---|
| [audit-all-bugs-2026-11-12.md](audit-all-bugs-2026-11-12.md) | **All findings**, one row each: defect/fix, status, proof |
| [audit-open-items-2026-11-12.md](audit-open-items-2026-11-12.md) | **What still needs work**, grouped P1–P4 |
| [audit-remediation-evidence-2026-11-12.md](audit-remediation-evidence-2026-11-12.md) | Per-finding proof strength (R/F/A/S) and red→green demos |
| [audit-fix-list-2026-11-12.md](audit-fix-list-2026-11-12.md) | Plain ID / fix / test list |

## What an independent reviewer should check first

1. Run `npm run test:standard` on this tree and record the result.
2. Check the 8 open + 5 verification N-IDs above against the code.
3. Check that the war-captive references are zero (`grep -r warCaptive src tests`).
4. Check that no on-map rival entities can appear (`pruneOrphanRivalEntities` removes every
   `faction === 'rival'` entity).
5. Treat “fixed” in the numbered register as **implementation + proof row**, not as a fresh gate run.
