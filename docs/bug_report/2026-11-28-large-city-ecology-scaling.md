# Large settlements forced into ecological collapse

- Bug: flat building-count penalty overwhelms ecology regardless of map size or actual land use.
- Status: investigating
- Severity: high
- Date discovered: 2026-11-28
- Version/build: 0.6.5.2 development, base 8dd5190
- Reporter: player with more than 800 buildings
- Area: valley ecology
- Owner module: `dailyEcology.ts`

## Status history
- 2026-11-28 — investigating: reproduced by formula; implemented scale-aware ecology, regressions pending CI.

## Observed behavior
800 completed buildings alone subtract 1,600 health points; 768 additional preserves would be needed to reach 45 health even without pollution and with maximum wildlife. Roads and civic buildings are charged as heavily as mines.

## Expected behavior
Environmental management remains viable at city scale; actual occupied habitat and operational emissions drive pressure. The score remains bounded and preserve spam is not required.

## Reproduction and evidence
Read `calculateEcosystemMetrics` on base 8dd5190 and supply 800 completed buildings with 80 animals. Previous building impact = 800 × 2. Regression compares the same 800 houses on medium and huge maps and against low-impact roads.

## Fix
Use weighted built footprint relative to buildable map area; industrial pollution uses canonical witnessed work attendance and type weights; forestry mitigates industry, population emissions are map-scaled, preserve score capped at 20. Nature explanation reads the canonical metrics. Staffed preventive care mitigates sudden illness using living doctor coverage, without altering age mortality.

## Save/migration impact
No added save fields; existing health and stage update on their normal daily cadence, with normal recovery lag. Preventive care uses live assignment data.

## Verification
Static code review and arithmetic reproduction; Vitest and build not run in this environment. Player save not inspected; CI pending.
