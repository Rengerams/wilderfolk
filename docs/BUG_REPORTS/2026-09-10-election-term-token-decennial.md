# Bug: Elections still called "decennial" after the term became 2 years

- Status: resolved
- Date discovered: 2026-09-10
- Version/build: Wilderfolk 0.6.4
- Reporter: Developer note ("elections are each 2 year")
- Area: Truth | UI copy | save/migration
- Owner module: `src/game/villageLeadership.ts`
- Cadence: Year-boundary election scheduling (`tryStartTermElectionCeremony`)

## Status history

- 2026-09-10 — open: the scheduled election token, a public function name, type
  unions, and code comments all said "decennial" (every 10 years) while
  `ELECTION_INTERVAL_YEARS = 2`.
- 2026-09-10 — resolved: token renamed to `'term'`, function renamed to
  `tryStartTermElectionCeremony`, legacy save values migrated on load.

## Observed behavior

A term election happens every `ELECTION_INTERVAL_YEARS` (2) years — Years 2, 4, 6,
…, with 3 months of buildup gossip before the vote — and the docs said so
(`CHANGELOG.md` "Elections every 2 years", `src/game/roadmapContent.ts`). The code
did not:

- `LeadershipElectionReason` and `ElectionCeremonyState.reason` used `'decennial'`.
- `tryStartDecennialElectionCeremony()` named the scheduled-election entry point.
- `dailyWorldEvents.ts` kept the local `decennialCeremony`.
- `gameTypes.ts` described `lastElectionYear`, `electionCeremony`, and the reason
  union in 10-year terms.
- The leadership panel carried a stray apostrophe and called the incumbent "the
  founding male" although `findFoundingColonyLeader` prefers the first adult male
  and falls back to the first adult settler.

## Expected behavior

Names, comments, and player copy describe the real cadence without hardcoding a
number that a balance change can invalidate: a scheduled **term** election every
`ELECTION_INTERVAL_YEARS` years.

## Reproduction steps

1. Read `LeadershipElectionReason` in `src/game/villageLeadership.ts`.
2. Compare with `ELECTION_INTERVAL_YEARS = 2` two lines above it.
3. Note `tryStartDecennialElectionCeremony` and the `'decennial'` literals.

## Evidence

`ELECTION_INTERVAL_YEARS = 2` (`villageLeadership.ts`), `roadmapContent.ts` line 90
("Elections every 2 years"), `CHANGELOG.md` line 776 (same), and `getYearsUntilElectionForYear`
returning a 2-year cycle. Player-visible text was already correct — the panel
renders "every {ELECTION_INTERVAL_YEARS} years" — so this was a naming and
documentation defect, not a wrong interval.

## Root cause

The token described a term length, and that length changed twice without the
token following: the original 10-year term named it `decennial`, terms were then
shortened to 5 years, and are now 2 (`ELECTION_INTERVAL_YEARS`). `'decennial'`
was also persisted inside `electionCeremony.reason`, so a rename needed a
compatibility path rather than a find-and-replace.

Why the term moved at all, recorded so it is not mistaken for a lore bug: it is a
session-length decision from playtesting, not a real-time simulation error.
An in-game day is 48 real seconds at 1×, so a year runs ~4.8 h at 1×, ~1.6 h at 3×,
and ~29 min at 10× — and ordinary play sessions are not five hours long, so a
10-year term spans many sittings and most colonies never reached a second election
(the developer's own estimate for the old term was ~100 h). The rationale now lives
beside the constant in `villageLeadership.ts`.

## Fix

- `LeadershipElectionReason` and `ElectionCeremonyState.reason` are now
  `'founding' | 'term' | 'succession'`, with the reason documented in
  `gameTypes.ts`.
- `startElectionCeremony` takes the named `LeadershipElectionReason` type instead
  of restating the union.
- `tryStartDecennialElectionCeremony` → `tryStartTermElectionCeremony`
  (caller in `dailyWorldEvents.ts` updated; the stale `decennialCeremony` local
  became `termCeremony`).
- `validateVillageLeaderOnLoad` rewrites a stored `'decennial'` reason to `'term'`,
  so imported saves keep correct ceremony and re-election wording.
- The leadership panel's stray apostrophe is gone and the founding-leader sentence
  now matches `findFoundingColonyLeader`'s male-preference-with-fallback rule.
- Historical `CHANGELOG.md` entries that recorded the old 10-year design are
  intentionally untouched — they are history, not current truth.

## Regression test

`tests/villageLeadership.legacyElectionToken.test.ts` (local-only) — migrates a
stored `'decennial'` ceremony to `'term'` while preserving phase and countdown,
leaves an already-current `'term'` ceremony untouched, and still clears a
corrupted ceremony instead of migrating it.

## Invariants checked

- Election scheduling and cadence are unchanged: `ELECTION_INTERVAL_YEARS` is
  still 2, `lastElectionYear` semantics are unchanged, and vacancy elections still
  fire 3 months (`VACANCY_ELECTION_DELAY_YEARS`) after a vacancy.
- Worker authority, command boundaries, and save schema shape are unchanged.
- The migration is additive: it rewrites one string value on load and never drops
  ceremony state.

## Save/migration impact

Backward compatible, no save-version bump. Saves written before the rename carry
`reason: 'decennial'`; `validateVillageLeaderOnLoad` (called from
`saveLoad.ts` on every load) normalizes it to `'term'`. `isValidElectionCeremony`
accepts any string reason, so legacy ceremonies are validated normally and only
then rewritten.

## Verification result

`tsc -b` clean, `npm run lint` 0 warnings / 0 errors, full suite 91 files / 482
tests passing (includes the 3 new token-migration cases).

## Related files

- `src/game/villageLeadership.ts`
- `src/game/gameTypes.ts`
- `src/game/dailyWorldEvents.ts`
- `src/game/VillageLeadershipPanel.tsx`
- `src/game/saveLoad.ts`
- `tests/villageLeadership.legacyElectionToken.test.ts`
