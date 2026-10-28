# Solo dialogue remains busy after its final line without a partner resolver

- Bug: a standalone JSON dialogue retained its session key when ticked without a partner resolver.
- Status: corrected on PR #93; tests/CI verification pending
- Severity: medium (session lifecycle; reproducible in headless and direct callers)
- Date discovered: 2026-10-28
- Version/build: Wilderfolk 0.6.5.2 dialogue migration branch
- Reporter: pipeline implementation audit
- Area: dialogue lifecycle
- Owner module: `src/game/humanChat.ts`
- Related PR: [#93](https://github.com/Rengerams/wilderfolk/pull/93)

## Reproduction and observed behavior

1. Start a solo JSON event via `requestDialogue({ eventKey: 'social.impulse.grief.home', speaker, tick })`.
2. Advance `tickHumanChat(speaker)` without `resolvePartner` until the only line's visible `chatTicks` reaches zero.
3. Prior to this correction, `tickHumanChat` skipped `advanceDialogue` entirely when `resolvePartner` was not supplied, even for a solo scene which needs no partner. `clearEntityChat` hid the line but never removed the live `solo:<id>` entry or `chatDialogueSessionKey`.
4. `isDialogueBusy(speaker)` therefore remained true and later events were refused.

## Expected behavior

A solo scene ends and releases its session automatically when its final line expires, independently of a partner resolver. A multi-line solo scene advances to the next authored line. Genuine paired sessions still require their real partner resolver and must not invent a partner or clear another actor's session.

## Correction

The existing `tickHumanChat` now calls `advanceDialogue` for solo sessions with a stable no-partner resolver when the caller did not provide one. It retains the unchanged paired-session behavior and the same realtime tick. The original `dialogueSessions` Map and `chatDialogueSessionKey` continue to be the only state owner.

## Regression and verification

- `tests/humanChat.duration.test.ts` covers a one-line JSON event expiring after the expected ticks with `isDialogueBusy=false`.
- The same test file now covers advancing **both** lines of a solo script and reclaiming its session after the last line, without a partner resolver.
- Targeted Vitest, full standard suite, TypeScript, build and worker/save parity: **pending CI result at documentation time**.

## Save/worker impact

No added save fields, session map, RNG call, or new tick cadence. Only the behavior of a resolvable, existing solo session after its line completes is corrected.
