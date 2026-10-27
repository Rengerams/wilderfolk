# Bug: Ambient dialogue often becomes a leader monologue

- Status: resolved
- Date discovered: 2026-08-21
- Version/build: 0.6.1.1
- Reporter: User-reported live behavior defect
- Area: Play | Truth
- Owner module: `src/game/humanChat.ts`
- Cadence: Human simulation tick; worker-authoritative dialogue session state

## Status history

- 2026-08-21 — open (user observed that only the village leader appears to say things)
- 2026-08-21 — investigating (ambient initiation and all shipped dialogue trees inspected)
- 2026-08-21 — resolved — live verification pending (nearby participants are now mandatory for ambient exchanges and alternating-turn coverage passed)
- 2026-08-21 — resolved (player confirmed that ordinary settlers now participate in dialogue)

## Observed behavior

Nearby ordinary settlers often do not visibly participate in everyday talk. The village leader can appear to speak alone even when other free settlers are near enough to answer.

## Expected behavior

When a free eligible neighbor is available, ambient social dialogue should begin as a two-person exchange. The existing tree speaker roles should then alternate visible lines between ordinary participants; solo lines are only appropriate when the speaker is genuinely alone.

## Evidence

All 95 shipped dialogue trees contain both of their declared speaker roles, so paired sessions already alternate lines correctly. However, `tryAmbientRandomDialogue()` selects a nearby free partner only 60% of the time and otherwise starts a solo dialogue even when candidates exist. The initiator is the citizen currently processed by the tick loop, making this especially noticeable when the leader is centered/in focus.

## Root cause

Ambient initiation treats a partner as optional despite nearby eligible settlers. This discards the pair-turn capability already present in the dialogue bank and makes normal social activity read as repeated leader monologue.

## Fix

Resolved. `tryAmbientRandomDialogue()` now selects a nearby free participant whenever candidates exist and starts a paired dialogue. Solo dialogue remains only for a genuinely isolated speaker. Dialogue tree selection, timer ownership, and social-event chance remain unchanged.

## Regression test

Implemented in `tests/humanChat.ambientPairing.test.ts`. It proves a nearby eligible settler joins even on the value that previously selected the optional solo branch, and it advances a shipped tree to prove the ordinary participant receives the next visible line.

## Invariants checked

- `humanChat.ts` remains the session/timer owner.
- `humanSocial.ts` remains the owner of neighborhood eligibility and preferences.
- No leader-specific speech privilege is introduced.
- Worker-authoritative simulation and read-only renderer contracts are unchanged.

## Save/migration impact

None. Dialogue session data is transient and not a save migration field.

## Verification result

Resolved — focused pairing, duration, and dialogue-busy tests, TypeScript, scoped ESLint, production build, and the complete suite (**61 files / 363 tests**) passed. Player live verification confirmed that ordinary settlers now participate in dialogue.

## Related files

- `src/game/humanChat.ts`
- `src/game/simulation/humanSocial.ts`
- `src/game/humanTick.ts`
- `tests/humanChat.ambientPairing.test.ts`
- `BUG REPORTS/2026-08-21-ambient-dialogue-often-becomes-leader-monologue.md`
