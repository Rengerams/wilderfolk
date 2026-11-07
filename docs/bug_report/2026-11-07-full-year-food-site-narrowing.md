# Full-year food-site audit broke the harness type check

- Bug: The producer-bot audit filtered buildings with an untyped array literal, so `Array.includes` rejected `BuildingType` values outside those four members and the scripts type check was red; the literal also duplicated the auto-player's food-producer set.
- Status: resolved
- Severity: low
- Date discovered: 2026-11-07
- Version/build: 0.6.5.1
- Reporter: owner-supplied `node scripts/test.mjs scripts-types` output
- Area: developer tooling — long-run colony harness
- Owner module: `src/game/virtualPlayer.ts` (`FOOD_PRODUCER_TYPES`); the script only consumes it
- Related PR/commit: 8534c08e added the audit block

## Status history
- 2026-11-07 — open: TS2345 reported while resolving the literal's inferred member type.
- 2026-11-07 — resolved: the script now filters with the auto-player's shared, typed set.

## Observed behavior
`node scripts/test.mjs scripts-types` reports
`TS2345: Argument of type 'BuildingType' is not assignable to parameter of type '"farm" | "fishingSpot" | "greenhouse" | "huntingSpot"'`,
naming `"barn"` as one rejected member. The runtime list itself was correct.

## Expected behavior
The harness compiles against the same definition of "food producer" the auto-player uses, so the audit and
the decision path cannot drift apart.

## Reproduction steps
1. Run `node scripts/test.mjs scripts-types` on the unfixed source.
2. Observe the TS2345 error on the verbose producers audit filter in `scripts/run-full-year.mts`.

## Evidence
The literal `[BuildingType.Farm, BuildingType.FishingSpot, BuildingType.HuntingSpot, BuildingType.Greenhouse]`
is inferred as a tuple of four literal types, while `building.type` is the wider `BuildingType` union
(`barn`, `silo`, `mill`, …). `src/game/virtualPlayer.ts` already declares the identical set as
`FOOD_PRODUCER_TYPES: readonly BuildingType[]` and uses it in `decideFood`.

## Root cause
A second, untyped representation of a domain set; TypeScript correctly refused the narrowed `includes`
parameter. The duplication was latent until the scripts type check ran.

## Fix / proposed fix
Export `FOOD_PRODUCER_TYPES` from its owner (`virtualPlayer.ts`, now with a one-line label) and import it in
the harness, replacing the literal and the now-unused `BuildingType` import.

## Save/migration impact
None; no runtime set changed.

## Verification result
- `node scripts/test.mjs scripts-types` — PASS; the member set is identical to the removed literal.
- `npm run test:types` — PASS (app, vitest and scripts projects); `npm run lint` — PASS;
  `npm run build` — PASS.
- Runtime verbose producer audit — NOT RUN (type-level refactor; the filtered set is unchanged).
