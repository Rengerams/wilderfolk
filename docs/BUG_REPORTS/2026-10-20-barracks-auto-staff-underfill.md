# 2026-10-20 — Barracks auto staffing below capacity despite idle settlers

## Player report
The underfilled Auto-staffing issue also affects **Barracks**, not only Taverns or Hotels. In the UI, Barracks show open staff positions while the settlement has idle settlers.

## Source inspection
`workforce.assignWorkerInPlace` uses the full configured `staffingCapFor` for Barracks and filters to living, player-controlled adults with no current job, no prison assignment and no unfinished-building crew. It prioritizes nearby candidates but does **not** reject a worker solely for distant commutes. `assignMissingWorkers` runs construction staffing first and then fills completed Auto workplaces in policy order. The regular assignment layer runs at 6-hour intervals.

Consequently, the confirmed venue-specific minimum-shift cap bug **cannot alone explain Barracks**. Idle-count display and assignment eligibility can diverge transiently; competition for workers between sites, an in-progress construction crew, pending tick, or a broken assignment transition remain hypotheses, not confirmed causes.

## Test added
`tests/workforce.barracksAutoFill.test.ts` verifies a completed Auto Barracks fills every slot when surplus eligible adult settlers exist.

## Status
**Open / awaiting reproduction with affected save.** Do not declare this solved by the earlier Tavern/Hotel patch. Capture building id, configured capacity, occupants, `staffingMode`, human job assignments, construction crews and latest assignment tick to identify the blocker. Preserve existing save history.

## Player clarification
The global **Auto-staff All** action also fails to fill the Barracks; assigning soldiers **manually** succeeds. Thus this is not just periodic scheduling. The manual command includes a donor-worker transfer fallback; automatic job balancing transfers workers only to **completely empty** buildings, not partially staffed ones. This is an identified behavioral difference, but availability of eligible truly idle adults at the moment of the action still needs confirmation. Investigate this split before changing priorities or worker reassignment policies.

## Targeted fix — 2026-10-20

- Commit `d0301cb`: when normal auto staffing has no eligible idle worker remaining, a **partially filled auto Barracks or Prison** may recruit from surplus workers at other non-manual workplaces using the existing manual-equivalent donor selector. A donor must retain at least one worker; transfers obey the 60-day auto-transfer cooldown.
- Commit `635764f`: regression fixture for a partially staffed Barracks where all other adults have jobs at a donor workplace. The test expects automatic transfer while preserving a donor worker.
- **Not yet tested in runtime**; this changes only the donor fallback, not how idle adults are counted. If Auto-staff still fails with genuinely unassigned adults, inspect the saved worker state and the assignment command pipeline.
