# A stale `patchUi` overwrote worker-authored Big News and the active event, so banners and event cards vanished

- **Bug:** every UI change posts the main thread's whole UI snapshot to the worker (`extractUiPatch`), and the worker assigned `bigNews`, `floatingTexts`, `activeEvent` and `nextFloatingTextId` unconditionally — but those are authored by the **tick on the worker**, and the host's snapshot can be up to `MAX_PIPELINE_DEPTH` (4) ticks behind. A patch composed while a tick was in flight therefore rewound the worker and destroyed whatever that tick had produced
- **Status:** resolved
- **Date discovered:** 2026-09-16
- **Version/build:** 0.6.4
- **Reporter:** 2026-09-16 worker-boundary audit, finding **F2** (`docs/private/audits/2026-09-16/game-worker.md`); mechanism and race runtime-reproduced there (2 worker-authored Big News items → 0 after a stale patch, `activeEvent` → null) and pinned here
- **Area:** worker (host → worker control patch) with a Play consequence (lost banners and unanswerable event cards)
- **Owner module:** `src/game/simWorker/gameWorker.ts` (`case 'patchUi'`), new `src/game/simWorker/uiPatch.ts`
- **Cadence:** per UI change, including timer-driven work (Big News auto-dismiss, notification auto-dismiss, save bubble), not only player clicks

## Status history

- 2026-09-16 — open (audit finding; the two directions disagree — the delta ships worker-authored `bigNews`/`activeEvent` while the patch lets the host overwrite them)
- 2026-09-16 — resolved (only player-authored fields are adopted; the id allocator may only move forward; regression test `tests/workerUiPatch.merge.test.ts`)

## Observed behavior

```ts
// src/game/simWorker/gameWorker.ts (before)
case 'patchUi': {
  if (!world) break;
  world.bigNews = msg.bigNews;            // worker-authored, from a stale host snapshot
  world.floatingTexts = msg.floatingTexts;
  world.nextFloatingTextId = msg.nextFloatingTextId;   // can move backwards → duplicate ids
  …
  world.activeEvent = msg.activeEvent;    // a raid/story card can be replaced by null
```

Symptoms: a Big News banner flashed for one tick and vanished (the in-flight delta showed it, the next
patch removed it), a player could lose the chance to answer a raid or story card, and duplicate
floating-text ids were possible.

## Expected behavior

The worker adopts only what the player authors — `autoSave`, the three `dismissed*Ids` sets and
`tutorialSeen` — and keeps its own presentation state, with `nextFloatingTextId` monotonically floored
at the worker's own high-water mark. The delta remains the one direction in which those slices travel
(worker → host).

## Reproduction steps

1. Before the fix: `npx vitest run tests/workerUiPatch.merge.test.ts` — the "keeps worker-authored
   big news, floating texts and the active event" case fails (`bigNews` length 0, `activeEvent` null).
2. In a game: trigger a Big News item (a birth, a raid card) while a UI patch is composed in the same
   frame — with `MAX_PIPELINE_DEPTH` ticks in flight the banner appears for one tick only.

## Evidence

- `src/game/gameLoop.ts:641-643` — the host sends the patch on any UI change; `extractUiPatch`
  (`:68-84`) carries `bigNews`, `floatingTexts`, `activeEvent` and `nextFloatingTextId`.
- `src/game/simWorker/gameWorker.ts:296-308` (before) — unconditional assignment on the worker.
- `src/game/gameWorker.ts` authors those fields: `simEffects.addBigNews` (worker side) and
  `dailyWorldEvents.ts:195,204,216,226` (`activeEvent`), and every delta ships them
  (`simDelta.ts:325,357`).
- `GameWorkerHost.ts:61-62` (`MAX_PIPELINE_DEPTH = RENDER_BUFFER_POOL_SIZE - 1` = 4) plus one-message-at-a-time
  application (`gameLoop.ts:848-860`, `:546-571`) — why the host snapshot can be behind.
- `useTransientGameFeedback.ts:122-135,158-196` and `useGamePersistence.ts:95-107` — patches are sent
  from timers, so this needs no player click to trigger.
- Audit repro (quoted in the audit document): the worker held 2 worker-authored Big News items; a
  `patchUi` built from the pre-tick host snapshot left 0, and `worker activeEvent after the host patch: null`.

## Root cause

An ownership ambiguity that the code resolved in opposite directions on the two channels: the tick
authors `bigNews`/`floatingTexts`/`activeEvent` and the delta ships them, while the patch message was
treated as a full authoritative write of the same fields. Because the patch is composed from a
possibly-older snapshot, "host owns the field" is only safe if the host is the *only* author — which it
is for `autoSave`, `dismissed*` and `tutorialSeen`, and is not for the rest.

## Regression test

`tests/workerUiPatch.merge.test.ts` (4 tests), driving the extracted pure helper:
- worker-authored `bigNews`, `floatingTexts` and `activeEvent` survive a stale patch (fails before the fix);
- the player-authored fields are still adopted (`autoSave`, `dismissedBigNewsIds`, `dismissedNotificationIds`, `tutorialSeen`);
- a lower `nextFloatingTextId` from the host never rewinds the allocator;
- a higher one is accepted.

## Invariants checked

`npm run test:full-year` — 360 days / 25,920 ticks on seed 12345 completes with its invariant
assertions satisfied. `tests/workerBoundary.closure.test.ts` (5) and `tests/gameWorker.transport.test.ts`
(3) still pass, so the field-set closure and the transport contract are unchanged.

## Save/migration impact

None. No field, key or format changed; the worker simply stops letting a stale UI message overwrite
simulation-authored presentation state. A save taken after a patch no longer risks missing an event
that the player never got to answer.

## Verification result

- `npx vitest run tests/workerUiPatch.merge.test.ts tests/workerBoundary.closure.test.ts tests/gameWorker.transport.test.ts tests/simPrep.rollbackClosure.test.ts` — passed (15 tests).
- `npm test` — passed: 160 files / 865 tests, 0 failures.
- `npm run build`, `npm run lint` (0/0), `npm run test:types` — passed.
- `npm run test:full-year`, `npm run test:browser` — passed.

## Related commits or files

- `src/game/simWorker/uiPatch.ts` — new pure `applyWorkerUiPatch(world, patch)`
- `src/game/simWorker/gameWorker.ts` — `case 'patchUi'` delegates to it
- `tests/workerUiPatch.merge.test.ts` — new

## Fix

The patch semantics are now explicit in one pure function, `applyWorkerUiPatch`: adopt `autoSave`, the
dismissed-id sets and `tutorialSeen`; floor `nextFloatingTextId` at the worker's own value; leave
`bigNews`, `floatingTexts` and `activeEvent` to the tick. Extracting it also made the behaviour
testable without the worker's `self` shim.

**Follow-up (not done):** the host still *sends* those three fields in every patch. Dropping them from
`extractUiPatch` would shrink the message and remove the ambiguity at the source, but it changes when a
patch is considered "changed" (`uiPatchChanged`), so it deserves its own change and review.
