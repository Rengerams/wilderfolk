# Prisoners are counted as idle adults and as homeless in the dashboard concerns

- Bug: `dashboardData.deriveConcerns` counts a prisoner as an idle adult and as homeless, because imprisonment clears both `homeBuildingId` and `residenceBuildingId`; the same panel's settler table and the Village/People tabs exclude prisoners, so the dashboard raises advice that cannot be followed
- Status: resolved — owner ruling: a prisoner is neither homeless nor idle
- Date discovered: 2026-09-16 (UI-logic audit, finding F9)
- Version/build: 0.6.4
- Reporter: UI-logic audit (`docs/private/audits/2026-09-16/ui-logic.md` F9), verified against the tree 2026-09-17
- Area: UI (council concerns)
- Owner module: `src/game/dashboardData.ts`

## Status history

- 2026-09-16 — open (found by the UI-logic audit pass; never filed as a report)
- 2026-09-17 — verified against the tree; held open pending an owner decision
- 2026-09-17 — **resolved.** Owner ruling: "a prisoner is neither homeless nor idle" — reading 1 below.
  Applied to both the council counters (`deriveConcerns`) and the settler table's `noHome` field. See
  "## Fix".

## Observed behavior

```ts
for (const e of state.entities) {
  if (!e.alive || e.type !== EntityType.Human || !isPlayerHuman(e)) continue;
  humans++;
  if (e.residenceBuildingId == null) homeless++;
  if (e.prisonBuildingId != null) imprisoned++;
  if (!e.isJuvenile && e.homeBuildingId == null) idleAdults++;
  …
}
```

Imprisonment deliberately clears both links — `humanRelationships.ts` sets
`offender.homeBuildingId = undefined` and `offender.residenceBuildingId = undefined` before
stamping `offender.prisonBuildingId = prison.id` — so every prisoner is counted as homeless and,
having no workplace, as an idle adult.

The same data set excludes them elsewhere, which is what makes the advice internally
contradictory:

- `dashboardData.ts:404` — `noWork: !e.isJuvenile && e.homeBuildingId == null && e.prisonBuildingId == null`
- `uiSimSummary.ts:71-74` — a prisoner is tallied as imprisoned and `continue`s before the idle tally

So the Council lines read "1 idle adult — Not assigned to a workplace … assign workers" and
"1 settler without a home — build Houses" for someone serving a sentence, while the settlers table
on the same screen and the Village/People tabs report zero idle.

## Expected behavior

**Decided 2026-09-17 — reading 1** ("a prisoner is neither homeless nor idle"). The ruling matters
because reading 2 would have left the council advice unfollowable: the player cannot house a settler the
simulation has deliberately jailed. Reading 2 is kept below as the rejected alternative.

1. A prisoner is neither idle nor homeless: skip them in both counters, mirroring the guard already
   present for `noWork`. **← applied**
2. A prisoner is not *idle* (they are confined, and the "assign workers" hint is wrong) but is
   genuinely without a residence for the duration, so they should still count as homeless — or be
   reported separately, since the existing `imprisoned` concern already tells the player about them.
   **← rejected**

## Reproduction steps

1. Cause a scandal imprisonment in a small colony.
2. Open the dashboard and read the Council concerns.
3. **Before the fix:** "N idle adults" / "N settlers without a home", plus the separate "N prisoners"
   line. **After:** the prisoner is counted only by the "N prisoners" line.
4. Compare with the settlers table on the same screen: the prisoner's row shows `status: 'prison'`,
   `noWork: false` and `noHome: false`, and clicking it explains the prison rather than suggesting a
   House.

## Evidence

Static trace of the two counters, the prison-clearing block in `humanRelationships.ts`, the
`:404` guard, and `uiSimSummary`'s tallies.

## Root cause

The concern counters were written before (or independently of) the prison-residency rule, and they
read the absence of the two links as a player-actionable gap rather than as a consequence of
imprisonment.

## Regression test

`tests/dashboardData.prisonAndCouncil.test.ts` (3 of its 4 tests cover this ruling): a jailed
settler's row is not flagged `noWork`/`noHome` and still reports `status: 'prison'`; the prisoner is
removed from the homeless and idle council counts, asserted as an exact −1 against a settler made
homeless and idle before the arrest; and `explainSettler` offers no "Build and finish a House"
suggestion for a prisoner while still reporting the Prison line.

All four guards were reverted together to confirm these are real guards rather than descriptions:
**4 tests failed**, and the file was restored byte-identically afterwards (sha256 unchanged).

Coverage note: the tree's other `collectDashboard` test
(`tests/conceptionEvent.labelling.test.ts`) only pins the 'Life events' line.

## Invariants checked

- `import`/`humanPopulation` totals are unaffected either way; only the two concern flags and the
  `noHome` field are in question.
- The separate `imprisoned` concern is kept, so prisoners do not vanish from the report.

## Save/migration impact

None.

## Verification result

Resolved 2026-09-17. `test:types` exit 0 · `lint` 0 warnings / 0 errors · `build` exit 0 ·
`npm test` 172 files / 923 tests passed · `audit:deps:cycles:strict` exit 0.
`tests/dashboardData.prisonAndCouncil.test.ts` passes with the guards in place and failed 4/4 with all
four reverted together (the source then restored byte-identically), so they are load-bearing.

## Related commits or files

- `src/game/dashboardData.ts` — `deriveConcerns` counters, the `noHome` field and `explainSettler`'s House suggestion
- `src/game/simulation/humanRelationships.ts` — `prisonBuildingId` stamping and the link clearing
- `src/game/uiSimSummary.ts` — the exclusion the dashboard contradicted
- `docs/private/audits/2026-09-16/ui-logic.md` — finding F9

## Fix

**Applied 2026-09-17** under the owner ruling "a prisoner is neither homeless nor idle":

- `deriveConcerns` — a jailed settler counts only as imprisoned and is skipped by the homeless and
  idle-adult tallies (`const jailed = e.prisonBuildingId != null`).
- `collectDashboard` — `noHome` now carries the same `&& e.prisonBuildingId == null` guard its
  adjacent `noWork` field already had, so the settler table no longer shows a prisoner a rose
  "no home" badge.
- `explainSettler` — the residence suggestion gained the same guard its workplace suggestion two
  branches above already carried. Without it a prisoner's detail panel read "Suggested: Build and
  finish a House so they have somewhere to sleep." — the unfollowable advice this report is about, in
  the third surface, and the one the first two guards did not cover (found 2026-09-17 while checking
  the fix against the owner ruling).

All three surfaces — the council counters, the settler table and the per-settler explanation — now
agree with each other, with `uiSimSummary`, and with the ruling.
