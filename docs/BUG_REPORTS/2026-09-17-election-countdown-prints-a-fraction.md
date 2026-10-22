# The leadership focus hint printed a raw fractional year

- Bug: the vacancy focus hint interpolated `getYearsUntilElection` directly while a vacancy is pending, and that value is a fraction (`pendingElectionYear - (year + dayInYear / DAYS_PER_YEAR)`), so the panel rendered `merit election in 0.08333333333333333 years`; the owner already had the formatter (`formatElectionDelay`) but it was module-private
- Status: resolved
- Date discovered: 2026-09-16 (UI-logic audit, finding F11)
- Date resolved: 2026-09-17
- Version/build: 0.6.4
- Reporter: UI-logic audit (`docs/private/audits/2026-09-16/ui-logic.md` F11), verified against the tree 2026-09-17
- Area: UI
- Owner module: `src/game/villageLeadership.ts` (consumer: `src/game/focusHints.ts`)
- Cadence: presentation (panel render)

## Status history

- 2026-09-16 — open (found by the UI-logic audit pass; never filed as a report)
- 2026-09-17 — resolved (`formatElectionDelay` exported and used by the hint)

## Observed behavior

`focusHints.ts`:

```ts
const until = getYearsUntilElection(state);
if (!leader && state.pendingElectionYear != null) {
  hints.push({
    detail: until > 0
      ? `No village head — merit election in ${until} year${until === 1 ? '' : 's'} (Year ${state.pendingElectionYear}).`
```

`getYearsUntilElection` returns a fraction on exactly this path:

```ts
if (state.pendingElectionYear != null) {
  const currentFraction = state.year + (state.dayInYear ?? 0) / DAYS_PER_YEAR;
  return Math.max(0, state.pendingElectionYear - currentFraction);
}
```

and `pendingElectionYear` is `currentFraction + VACANCY_ELECTION_DELAY_YEARS` (0.25). The
`until === 1` plural branch could therefore never be right, and the Year was printed as a
fraction too.

## Expected behavior

A countdown reads in human units ("3 months", "1 year"), the same way the leadership panel's
ceremony status already renders it.

## Reproduction steps

1. Have the village head die or be imprisoned with no eligible successor.
2. Open the Focus panel while the vacancy campaign runs.
3. **Before the fix:** "No village head — merit election in 0.08333333333333333 years (Year 4.083333333333333)."
4. **After the fix:** "No village head — merit election in 3 months (Year 4)."

## Evidence

Static trace of the two functions and of `VACANCY_ELECTION_DELAY_YEARS`. `formatElectionDelay`
was reached only through `getElectionCeremonyStatus`, which is why the panel's own ceremony text
was already correct while this hint was not — the audit's F11 quote and this trace agree.

## Root cause

Two surfaces rendered the same countdown and only one had the formatter. Both the value and its
presentation are owned by `villageLeadership`, so the presentation belongs there too and the
consumer should not be able to reach the raw number.

## Regression test

None added. This is a pure formatting path, but the value it formats only exists in a world with a
pending vacancy, and the assertion would be on a Chinese-whisper-free string produced by a
one-line call to an exported formatter that `getElectionCeremonyStatus` already exercises. Adding
a fixture world to re-assert `formatElectionDelay` would test the formatter, not the wiring.
Disclosed rather than faked with a source-scan.

## Invariants checked

- `formatElectionDelay(years)` is total: `>= 1` renders whole years, below that renders at least
  "1 month", so a 0 or a tiny fraction can no longer produce "0 years"/"0 months".
- `Math.floor(state.pendingElectionYear)` matches the wording `getElectionCeremonyStatus` already
  uses at `villageLeadership.ts:487`, so the two vacancy surfaces now say the same thing.
- `VillageLeadershipPanel.tsx:39` also interpolates `yearsUntil`, but only in its `leader` branch,
  where `getYearsUntilElection` reduces to `getYearsUntilElectionForYear` — a whole number. That
  surface is left as it is; it cannot receive the fraction this report is about.

## Save/migration impact

None.

## Verification result

- `npx tsc -p tsconfig.app.json --noEmit` — passed (no output).
- `npm run lint` — 0 warnings / 0 errors.
- `npm run test:all` — passed, see the batch summary in `SUMMARY.md`.
- Not verified in a browser (no DOM tier): the hint text was not read on screen. The fraction is
  arithmetic from the two functions above, and the audit's quoted symptom matches it exactly.

## Related commits or files

- `src/game/villageLeadership.ts` — `formatElectionDelay` is exported
- `src/game/focusHints.ts` — uses it for the vacancy hint
- `docs/private/audits/2026-09-16/ui-logic.md` — finding F11

## Fix

`formatElectionDelay` is exported with a comment stating why no surface may interpolate the raw
value, and the hint reads
`No village head — merit election in ${formatElectionDelay(until)} (Year ${Math.floor(state.pendingElectionYear)}).`
