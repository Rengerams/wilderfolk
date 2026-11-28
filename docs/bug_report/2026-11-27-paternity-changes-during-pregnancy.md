# Biological paternity changes during pregnancy

- Bug: Birth can attribute a child to a later spouse or lose the father's identity after removal.
- Status: investigating
- Severity: high
- Date discovered: 2026-11-27
- Version/build: PR #231, original inspected head f64c5648
- Reporter: owner request and source audit
- Area: conception, birth, family references, save migration
- Owner module: pregnancy.ts and simulation/humanLifecycle.ts
- Related PR: #231

## Status history
- 2026-11-27 — investigating: confirmed source paths, committed changes and regression cases; CI pending.

## Observed behavior
At conception, the current spouse's ID was omitted. Delivery then fell back to the mother's current partner. Removal cleanup also erased an explicitly stored father's ID.

## Expected behavior
Biological paternity is immutable for a pregnancy, independent of marriage or survival.

## Reproduction steps
1. Conceive with a spouse, then change partners before delivery.
2. Alternatively remove the recorded biological father before delivery.
3. Inspect the newborn's fatherId and family tree. The old path uses the new spouse or loses the identity.

## Evidence and root cause
startPregnancy omitted the spouse ID; tickPregnancyAndBirth used the current partner fallback; reconcileFamilyReferencesAfterRemoval erased pregnantById.

## Fix
Record the father at conception, including spouses, or null for explicitly unknown. Preserve historical identity through removal and use it at delivery. Keep historical IDs reserved on load.

## Save/migration impact
Existing missing IDs are inferred from the saved partner where available, before link cleanup; previously erased or incorrect historical identities cannot reliably be recovered. Explicit unknown is not re-inferred. Parked Moon Howler pregnancy state is migrated as well.

## Verification result
Source trace confirmed. Regression tests added for remarriage, removal and unknown father; family-reference contract updated. Tests and live simulation not run locally; CI pending. Genetic inheritance from a father whose live genome is no longer available remains outside the identity fix.

## Follow-up — 2026-11-28
New pregnancies require a valid father ID; the entity factory no longer uses the mother's own father. Ordinary births register available parents immediately. Legacy unknown paternity remains unknown rather than inventing ancestry. Adoption and immigration party rules are unchanged. Regression tests added; CI not yet verified.

## Factory follow-up — 2026-11-28

The remaining arriving-pregnancy spouse fallback is removed; the arrival caller already supplies the biological father's ID explicitly. Non-pregnant spawns no longer retain a supplied pregnancy father. Regression coverage extends the existing lifecycle test. Legacy unknown paternity remains unknown; adoption continues through the housing owner. CI not yet verified.

## Pregnancy-state owner follow-up — 2026-11-28

An accidental second call to startPregnancy previously reset progress, due date and paternity. The pregnancy owner now rejects active pregnancy restarts and invalid start inputs before any writes, validates the actual father entity for colony conception, and owns scheduled progress plus delivery resets. Arrival creation receives an explicit father ID from the immigration party owner; it has no world lookup. Existing save migration and Moon Howler restoration remain transport boundaries. Extended lifecycle regressions; CI not yet verified.
