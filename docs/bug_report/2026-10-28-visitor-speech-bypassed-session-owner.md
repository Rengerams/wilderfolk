# Visitor speech bypassed the dialogue session owner

- Bug: Faction visitors and performers wrote visible chat fields without checking an active dialogue session.
- Status: investigating — fix implemented, focused CI passed; worker/browser verification pending
- Severity: medium
- Date discovered: 2026-10-28
- Version/build: Wilderfolk 0.6.5.2 migration branch
- Reporter: single-pipeline coding audit
- Area: visitor behavior and dialogue session ownership
- Owner module: `src/game/factionWander.ts`
- Related PR: [#93](https://github.com/Rengerams/wilderfolk/pull/93)

## Status history

- 2026-10-28 — investigating: code trace confirmed the defect and a targeted correction was committed to PR #93.
- 2026-10-28 — focused regression passed in GitHub Actions run 40732825550; full standard, worker/save and live verification remain pending.

## Observed behavior

Before migration, `maybeArriveFlavor` set `entity.chatPhrase` and `entity.chatTicks` directly after the 35% arrival roll. The performer idle branch independently wrote both fields after its existing 20-tick/40% roll. Neither path checked `isDialogueBusy` or relinquished an existing two-person dialogue session.

A visitor could therefore acquire an unrelated visible line while still retaining `chatDialogueSessionKey` and the counterpart's session membership. The two mechanisms also disagreed over display-duration ownership.

## Expected behavior

`factionWander.ts` chooses only the same arrival or performer opportunity with the existing RNG stream and movement cadence. Authored POI and performer text comes from `src/game/data/dialogue/visitor.json`, and the sole simulation dialogue writer in `humanChat.ts` manages the session and participant state. An already-busy participant must not have its speech overwritten by a visitor caption.

## Root cause

The visitor behavior owned both the opportunity decision and raw chat-field assignments. It bypassed the central session writer used by other human speech.

## Implemented correction

- Preserve the original POI labels, 35% opportunity roll, source content selection draw and duration draw.
- Move the original 58 POI lines and 4 performer lines to version-1.3 JSON; use `requestDialogue` with the real Entity and source event key.
- Keep the original performer's 20-tick interval and 40% opportunity roll; prevent a busy session from being overwritten.
- Remove direct assignments to `chatPhrase` and `chatTicks` in `factionWander.ts`.
- Add a source ownership checker to the existing standard-check runner.

## Regression coverage and verification

Static before/after diff: direct writes removed and equivalent 62 text variants indexed. JSON event/solo-mode presence is asserted by `tests/dialogue.eventRouting.test.ts`. Ownership checker is installed in `scripts/test.mjs`.

- Targeted Vitest, TypeScript, lint and build: **NOT RUN** on this head.
- Worker/save parity and live visitor/performer cadence: **NOT VERIFIED**.
- Expected behavioral difference: a busy actor's speech no longer gets overwritten; normal arrival and performer rolls retain their existing cadence.

## Save and migration impact

No new save fields, no new dialogue clock, no extra visitor spawn or destination choice. Existing worker/render chat-field serialization remains unchanged.
