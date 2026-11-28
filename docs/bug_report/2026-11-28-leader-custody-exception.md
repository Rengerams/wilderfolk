# Leader custody exception

- Bug: Ordinary separated-parent custody conflicts with the elected parent's manor entitlement.
- Status: investigating
- Severity: medium
- Date discovered: 2026-11-28
- Version/build: development target 0.6.5.2
- Reporter: player housing audit and New Frontier Y2 D43 save
- Area: housing / guardianship
- Owner module: `housingModel.ts`

## Status history
- 2026-11-28 — investigating: static cause confirmed against the saved family; owner rule corrected; CI and runtime replay pending.

## Observed behavior
The housing audit reports child #4913 living apart from custodian #2552. The save records child Stephane with her elected mother Shawnta (#2383) in manor #0, and father Nestor (#2552) in house #565. Both parents record separation at tick 88330.

## Expected behavior
The player's clarified rule gives the eligible elected biological parent priority over ordinary custody selection after separation. Ordinary custody applies when neither separated parent holds office, and dead or imprisoned parents remain ineligible.

## Reproduction steps
1. Load the reported family state with both parents alive and separated, the mother elected, and the child living with her in the manor.
2. Run the weekly housing assignment audit.
3. Before the change the custody hash selects the father and the audit reports a separation despite the child's legitimate manor residence.

## Evidence
The saved parent IDs, shared separation tick, occupation and residence IDs establish the static failure mode. The shared resolver's parity calculation selects the father before the change, while the manor entitlement includes the child.

## Root cause
The canonical `getChildCustodian` used ordinary custody even when one eligible separated parent held office, conflicting with leader housing policy.

## Fix
Prioritize the eligible elected biological parent within the existing separated-parent branch of `getChildCustodian`. Include elected leader identity in the existing housing signature. Keep the invariant observer and ordinary parent selection unchanged. Regressions cover both sexes, leaving office and the reported weekly audit scenario.

## Save/migration impact
No schema changes; existing leader occupation and family links are reused. Existing saves use the revised rule on reconciliation.

## Verification result
Static save and source trace confirmed; automated tests, TypeScript, lint and live replay not run locally. CI pending.
