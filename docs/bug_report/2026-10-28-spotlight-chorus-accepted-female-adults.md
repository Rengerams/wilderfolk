# Male Spotlight chorus could select women as speakers

- Status: fixed in PR #91 source; live browser verification pending
- Severity: low
- Detected: 2026-10-28
- Area: cast selection / rare event
- Owner: `src/game/spotlightLore.ts`
- Related: https://github.com/Rengerams/wilderfolk/pull/91

## Observed defect

`eligibleChorus()` accepted any adult regardless of gender. The authored stage direction specifies a male chorus; the selection could assign male chorus roles to female villagers. The visual hearts drift toward male singers where present, but selecting a mixed cast made this inconsistent.

## Expected

At least six and at most ten **eligible adult male** villagers form the chorus; the 12–17-year-old girl remains a separately bound heroine, not one of the adult speakers. Other eligibility rules, 19:00 weekend check, 7.5% roll and 90-day cooldown remain intact.

## Correction

Require `entity.gender === 'male'` in `eligibleChorus`. Existing tests use male fixtures; new focused test introduces two nearby adult women while keeping six men, proving the scene includes only the six men. A save that refers to a no-longer-eligible chorus participant already follows existing validation and abort semantics.

## Verification

Source-level eligibility and regression fixture inspected. The updated latest-head Node.js CI and a browser playthrough remain pending.
