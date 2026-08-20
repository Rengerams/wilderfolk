# Bug: Moon Howler replacement is guaranteed every full moon, not rare

- Status: verified
- Date discovered: 2026-08-20
- Version/build: 0.6.1 (0.6.1-line development)
- Reporter: Deep Code (Objective 10)
- Area: Truth
- Owner module: moonHowler.ts (shouldApplyNewMoonHowlerCurse)
- Cadence: full-moon-event

## Status history
- 2026-08-20 — open (discovered in Objective 10: `shouldApplyNewMoonHowlerCurse` had no rarity roll)
- 2026-08-20 — fixed (rare replacement roll `MOON_HOWLER_REPLACEMENT_CHANCE = 0.15` + injectable rng)
- 2026-08-20 — verified (deterministic rare-event tests + full suite green)

## Observed behavior

`shouldApplyNewMoonHowlerCurse` returned true for every full moon at nightfall
with no active curse and more than 5 humans — a NEW Howler was guaranteed
every full moon after the previous one was killed or cured. This violated
SIMULATION_AUTHORITY.md §5: "A replacement Howler appears only through a rare
replacement roll" and "A full moon must not guarantee a new Howler."

## Expected behavior

- If a cursed Howler survives, later full moons are quiet (the survivor
  returns — never a second curse).
- If the Howler is killed or cured, later full moons may be quiet.
- A replacement appears only through a rare replacement roll.

## Reproduction steps

1. Run a sim where the Moon Howler is killed/cured on some day.
2. Reach the next full moon at nightfall with no active curse.
3. Observe a new settler is cursed unconditionally (no roll).

## Evidence

- `src/game/moonHowler.ts` (before fix): `shouldApplyNewMoonHowlerCurse` had
  no `rng()` roll — the boolean was purely deterministic on the gates.
- `SIMULATION_ARCHITECTURE_0_6_1.md`: "Survivor return, rare replacement event".

## Root cause

The new-curse predicate was written when the Howler was a guaranteed recurring
threat; the rarity requirement was added later in the authority contract but
never wired into the decision.

## Fix

`shouldApplyNewMoonHowlerCurse(colonyDay, hourOfDay, humanCount, activeCursed, rng = Math.random)`
now requires `rng() < MOON_HOWLER_REPLACEMENT_CHANCE` (0.15) on top of the base
gates. `tickMoonHowlerCycle` accepts the same injectable `rng` and uses it for
the replacement roll and the candidate pick, so quiet moons, survivor returns,
and rare replacements are deterministic in tests. Production callers use the
`Math.random` default — no call-site changes.

## Regression test

`tests/moonHowler.rare.test.ts` (7 tests): survivor quiet-moon predicate,
quiet-after-kill (roll fails), rare replacement (roll passes), base gates
(population/hour/full-moon) still enforced, and three deterministic
`tickMoonHowlerCycle` runs — survivor returns the SAME Howler (count stays 1),
quiet moon when the roll fails (0 cursed, no curse news), and exactly one
replacement when the roll passes. Invariant check: never more than one living
Howler.

## Invariants checked

- At most one living cursed Moon Howler.
- A surviving Howler returns on later full moons (never replaced).
- Replacement only through the rare roll; full moon never guarantees a new Howler.

## Save/migration impact

None (RNG cadence only; no state field changes).

## Verification result

Focused tests pass; full suite green.

## Related commits or files

- `src/game/moonHowler.ts`
- `tests/moonHowler.rare.test.ts`
