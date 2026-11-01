# Established lovers choose different overnight rendezvous houses

- Bug: The same established affair can select different buildings depending on which partner asks for the tryst site; sleep checks also privilege only the lover's registered home.
- Status: investigating
- Severity: medium
- Date discovered: 2026-11-01
- Version/build: Wilderfolk 0.6.5.2 development; main before this branch
- Reporter: Owner discussion followed by static code trace
- Area: Relationships / indoor sleep eligibility
- Owner modules: `src/game/simulation/humanRelationships.ts` (tryst venue), `src/game/humanTick.ts` (single sleep observation)
- Related PR/commit: branch `fix/central-sleep-and-affair-arrival-20261101`

## Status history
- 2026-11-01 — investigating: Reversing the two arguments to `getAffairTrystBuilding` changes the preferred residence; pair-stable selection and unified sleep observation committed. CI pending.

## Observed behavior
A married settler with an absent spouse chooses their own empty home as a tryst site; their single lover, evaluating the same pair in reverse order, previously lacks the married-home preference and may choose the other person's residence or no building. `sleepingAtLover` separately insists on `lover.residenceBuildingId` rather than the actual shared tryst site. A real indoor visit therefore can fail to qualify as sleep.

## Expected behavior
Both members of an established pair choose the same usable house regardless of processing order. An unmarried lover sleeping in the married partner's house should not lose their own residence assignment, and should receive ordinary sleep recovery only after actual indoor admission at the shared venue. A distant/outdoor encounter cannot count as indoor sleep.

## Reproduction steps
1. Put a married partner in home 10 with their spouse far away; give their unmarried lover home 20.
2. Compare `getAffairTrystBuilding(married, lover, ...)` with `getAffairTrystBuilding(lover, married, ...)` on main. The answers differ.
3. Put both at the agreed house on a night tick; require `indoorBuildingId` for both and subsequent sleep recovery while retaining each person's own `residenceBuildingId`.

## Evidence
`humanRelationships.getAffairTrystBuilding` originally selects its first argument's empty marital home, falling back to the second argument's single residence. `humanTick.sleepingAtLover` originally checks only the second argument's `residenceBuildingId`.

## Root cause
Actor-relative caller role changes the venue choice; sleep eligibility was duplicated across site-specific booleans instead of one location-aware observation.

## Fix / proposed fix
Make `getAffairTrystBuilding` choose canonical pair roles independent of caller order. Use one `observeHumanSleep` in `humanTick` to observe real location, duty and time across all eligible sleep sites; delegate all reserve writes to `advanceHumanNeeds`. The same tick owner also permits scheduled home movement to override an idle stamina pause.

## Save/migration impact
None; no new entity fields or serialization changes.

## Verification result
- Pair-order and indoor lover regressions: committed; execution NOT RUN from this connector-only environment.
- `npm run test:types`, `npm run lint`, `npm run build`: NOT RUN (no full local repository checkout).
- GitHub CI: pending.
