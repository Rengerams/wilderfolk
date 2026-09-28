# Player-facing copy promised elections every 5 years; the simulation uses 2

- Bug: three player-visible strings still stated the old 5-year election cadence — the Guide entry, the leadership contextual tip, and the in-game roadmap — while `ELECTION_INTERVAL_YEARS` is 2, so the onboarding text told players to expect the first election in Year 5 instead of Year 2
- Status: resolved
- Date discovered: 2026-09-16 (UI-logic audit, finding F12 — it named two of the three copies)
- Date resolved: 2026-09-17
- Version/build: 0.6.4
- Reporter: UI-logic audit (`docs/private/audits/2026-09-16/ui-logic.md` F12), verified against the tree 2026-09-17
- Area: UI (content drift)
- Owner module: `src/game/villageLeadership.ts` (`ELECTION_INTERVAL_YEARS`)
- Cadence: presentation (static copy)

## Status history

- 2026-09-16 — open (found by the UI-logic audit pass; never filed as a report)
- 2026-09-17 — resolved (all three strings interpolate the owner constant)

## Observed behavior

```
src/components/tabPanels/MoreTabPanel.tsx:268
  "Village head 👑 — First male leads until Year 5; merit elections every 5 years after that."

src/game/contextualTutorial.ts:239
  "The first male pioneer leads until Year 5. After that, merit elections every 5 years with a ceremony. …"

src/game/roadmapContent.ts:164
  DONE('Village leadership — merit elections every 5 years')
```

while `villageLeadership.ts:29` is `export const ELECTION_INTERVAL_YEARS = 2`, documented there as
"every 2 years, at Years 2, 4, 6, …". `getYearsUntilElectionForYear` returns the 2-year cycle, and
`VillageLeadershipPanel` had already been corrected to render
`{ELECTION_INTERVAL_YEARS}` — which is why the earlier rename report concluded, correctly for that
panel only, that player-visible text was already right.

The audit named the Guide entry and the contextual tip. The roadmap line is a **third** copy it
missed; `roadmapContent.ts` renders in the in-game Roadmap panel (More → Roadmap), and the same
file already says "Elections every 2 years" 74 lines earlier, so the two lines contradicted each
other inside one panel.

## Expected behavior

Every surface states the cadence the simulation actually uses, and cannot drift again, because the
number comes from the constant rather than from prose.

## Reproduction steps

1. Open More → Guide and read the "Village head" bullet.
2. Or More → Roadmap and find the "Village leadership" line.
3. Compare with the first election actually held: Year 2.
4. **Before the fix:** both claim Year 5 / every 5 years. **After the fix:** both read 2.

## Evidence

Static trace of the four surfaces and the constant. `BUG_REPORTS/2026-09-10-election-term-token-decennial.md:51`
asserts "player-visible text was already correct", citing only the leadership panel's
`{ELECTION_INTERVAL_YEARS}` interpolation — true for that panel, and the reason these three copies
were not covered by it.

## Root cause

The constant had been reduced 10 → 5 → 2 across releases and the copy that hard-coded the number did
not follow. The fix is not to update the three strings to "2" — that is the same drift waiting to
happen — but to interpolate the constant in all three.

## Regression test

None added. A copy assertion would be a string match in a `.tsx`/`.ts` file with no behaviour
attached; the guarantee is structural (the literal is gone, the constant is used), and the repo's
`dup`/lint gates plus this report record the decision. Flagged as a deliberate gap.

## Invariants checked

- `roadmapContent.ts` had no imports; adding `ELECTION_INTERVAL_YEARS` introduced no import cycle —
  `npm run audit:deps:cycles:strict` reports "No runtime import cycles" on 323 modules (the one
  reported type-only cycle is the pre-existing `WorldState`/grid one).
- `roadmapContent.ts:90` ("Elections every 2 years") was already correct and is untouched; the two
  lines in that file no longer contradict each other.
- `contextualTutorial.ts` gained one import from `villageLeadership`; the cycle gate is clean, and
  the tip string is a template literal so no other text changed.

## Save/migration impact

None.

## Verification result

- `npm run audit:deps:cycles:strict` — "No runtime import cycles", 323 modules checked.
- `npx tsc -p tsconfig.app.json --noEmit` — passed (no output).
- `npm run lint` — 0 warnings / 0 errors.
- `npm run test:all` — passed (170 files / 915 tests), see the batch summary in `SUMMARY.md`.
- Reviewed by grep: no remaining `until Year 5` / `every 5 years` in `src/`.

## Related commits or files

- `src/components/tabPanels/MoreTabPanel.tsx` — Guide bullet
- `src/game/contextualTutorial.ts` — the leadership tip
- `src/game/roadmapContent.ts` — the roadmap line (the copy the audit missed)
- `src/game/villageLeadership.ts` — `ELECTION_INTERVAL_YEARS`
- `BUG_REPORTS/2026-09-10-election-term-token-decennial.md` — the rename report whose "copy was already correct" claim this qualifies
- `docs/private/audits/2026-09-16/ui-logic.md` — finding F12

## Fix

All three strings interpolate `ELECTION_INTERVAL_YEARS`.
