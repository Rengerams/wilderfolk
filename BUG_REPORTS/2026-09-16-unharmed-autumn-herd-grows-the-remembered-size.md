# An unharmed autumn herd grows the remembered size, so "let them pass" no longer keeps next year's herd intact

- **Bug:** when a migrating herd left the valley with no losses, `tickMigration` still wrote `state.migrationNextHerdSize` (`base + 2`, capped), contradicting the pinned contract that an unharmed pass leaves the herd memory untouched and next autumn brings `HERD_BASE_SIZE` again
- **Status:** resolved
- **Date discovered:** 2026-09-16
- **Version/build:** 0.6.4
- **Reporter:** autonomous build-repair pass (surfaced by `npm test` after the build was repaired)
- **Area:** Truth
- **Owner module:** `src/game/migration.ts`; pinned by `tests/migration.herds.test.ts` and `tests/low-9-simdata.test.ts`
- **Cadence:** once per calendar day, from `tickMigration` (`tickLayerDaily`)

## Status history

- 2026-09-16 — open (found by the standard suite: 1 failing test in `tests/migration.herds.test.ts`)
- 2026-09-16 — resolved (recovery branch removed at the owning module; the file and the full standard suite pass)

## Observed behavior

```text
FAIL tests/migration.herds.test.ts > autumn deer migration
     > letting the herd pass unharmed keeps next year's herd intact
AssertionError: expected 12 to be undefined
- Expected: undefined
+ Received: 12
❯ tests/migration.herds.test.ts:104:41
    104|     expect(state.migrationNextHerdSize).toBeUndefined(); // memory untouched
```

The player-visible half was the accompanying notification: *"The deer passed through unharmed — they will return fatter next autumn (next herd: 12)."* The herd then arrived the next autumn at 12, 14, 16 … (capped at `HERD_MAX_SIZE`) rather than the documented "back fat as ever" baseline.

## Expected behavior

`README.md:276` and `CHANGELOG.md:799` describe the rule as: every deer taken makes next year's herd smaller, and **letting them pass unharmed brings them back fat as ever** — i.e. the baseline herd, not a larger one. `tests/migration.herds.test.ts:96-108` pins exactly that: an unharmed pass leaves `state.migrationNextHerdSize` `undefined` ("memory untouched"), and the next arrival spawns `HERD_BASE_SIZE` (10) deer. `tests/migration.herds.test.ts:89` and `tests/low-9-simdata.test.ts:345` pin the shrink side (`HERD_BASE_SIZE - n`).

## Reproduction steps

1. `npx vitest run tests/migration.herds.test.ts`
2. The case `letting the herd pass unharmed keeps next year's herd intact` fails with `expected 12 to be undefined`.
3. Or in play/headless: let a herd arrive, hunt nothing, advance to the end of the migration window, and read `state.migrationNextHerdSize` — it becomes 12 (and grows again every unharmed year).

## Evidence

- `tests/migration.herds.test.ts:96-108` — the failing case; the file is untouched by the 2026-09-16 working-tree revision, so it is the authority.
- `src/game/migration.ts:143-154` (before the fix) — the `else` branch reached only when `lost === 0`, writing `Math.min(HERD_MAX_SIZE, base + 2)` and logging the "fatter next autumn (next herd: 12)" notification.
- `BUG_REPORTS/2026-09-13-simulation-logic-audit.md:1885` — the audit records the green behaviour as shrink-only: "`migrationNextHerdSize` only ever decreases … The file header promises 'let them pass and next autumn brings them back, fat as ever', which holds only if the player never takes a single deer, ever. The shrink is locked by `tests/migration.herds.test.ts`; **recovery is not specified anywhere I found. Needs a design decision** (intentional permanent memory vs. slow recovery)."

## Root cause

The 2026-09-16 damaged revision of `src/game/migration.ts` added an unharmed-recovery `else` branch to the departure block. Because the audit explicitly leaves herd recovery as an undecided design question, the branch was an unratified behaviour change that also broke the pinned contract; the surrounding shrink path (`lost > 0`) was untouched and still passes its own cases.

## Regression test

`tests/migration.herds.test.ts` — `autumn deer migration > letting the herd pass unharmed keeps next year's herd intact` (pre-existing; it failed before the fix and passes after it), with `hunting the herd shrinks next year's herd` and `herd size clamps between min and max` covering the shrink half. No new test was added: the pinned case already asserts both the untouched memory and the next arrival's size.

## Invariants checked

- `tests/saveMigration.roundtrip.test.ts` — `migrationNextHerdSize` still survives save/load unchanged (the field stays in the save allow-list and its value is untouched by this change).
- `tests/low-9-simdata.test.ts:345` — the loss path still records `HERD_BASE_SIZE - 3`.

## Save/migration impact

None. `migrationNextHerdSize` keeps its name, type and persistence, and the memory is still written only on a loss (`lost > 0`). No save-format or migration change is needed; existing saves that carry a grown value simply keep it until the next loss, which is the pre-existing "memory" semantics.

## Verification result

- `npx vitest run tests/migration.herds.test.ts tests/low-2-events-defense.test.ts` — passed (18 tests).
- `npm test` — passed: **143 files / 796 tests, 0 failures**.
- `npm run test:full-year` — passed (exit 0, 360 days / 25,920 ticks on seed 12345; the autumn window is crossed with no invariant error).

## Related commits or files

- `src/game/migration.ts` — removed the unharmed-recovery `else` branch and the now-unused `addNotification` import
- `tests/migration.herds.test.ts:96-108` — the pinning case (unchanged)
- `README.md:276`, `CHANGELOG.md:799` — the documented "fat as ever" rule

## Fix

`tickMigration`'s departure block is back to the single `if (lost > 0)` shrink: a herd that leaves with no losses no longer writes `migrationNextHerdSize`, so next autumn brings `HERD_BASE_SIZE` and the "fewer deer next year" news only ever follows a real loss. Whether an unharmed herd should ever recover a previously shrunk memory remains the design decision the simulation audit left open; this repair deliberately restores the pinned behaviour instead of inventing either option.
