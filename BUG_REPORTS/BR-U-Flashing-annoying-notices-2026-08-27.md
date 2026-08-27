# Bug: Flashing and persistent big-news notices

- Status: resolved — automated verification passed; live Tauri visual verification remains recommended
- Date discovered: 2026-08-27
- Version/build: 0.6.4 local Tauri/latest-source build
- Reporter: Developer
- Area: UI feedback
- Owner module: `src/components/BigNewsBanner.tsx` and `src/hooks/useTransientGameFeedback.ts`

## Status history

- 2026-08-27 — open: player observed big-news notices flashing heavily, remaining indefinitely until manually closed, and accumulating with other messages.
- 2026-08-28 — source audit: the banner had no automatic dismissal lifecycle. The parent derived all undismissed news, while the banner rendered only the newest item; older items remained queued and became visible one after another after manual dismissal.
- 2026-08-28 — resolved in source: added a cleanup-safe eight-second timer tied to the currently displayed news ID and marked the notice as a polite status announcement without introducing an animation.

## Observed behavior

Big-news notices could remain on screen indefinitely. Because the underlying queue retained every undismissed item, dismissing one exposed the next queued item immediately. Re-rendering and rapid event production made this feel like flashing or stacking, even though only the latest item was rendered.

## Expected behavior

A notification should appear in the corner in a stable, non-flashing presentation, remain readable long enough to understand, and disappear automatically after a short period. Manual dismissal must remain available. Queued messages may be shown sequentially, but must not require the player to close every notice before the interface clears itself.

## Reproduction steps

1. Start a map that can produce a big-news event.
2. Wait for a big-news message.
3. Leave the notice untouched and observe its lifetime.
4. Produce or wait for another notice and confirm that the current card remains stable rather than flashing.
5. Click the card and confirm immediate dismissal.

## Root cause

`BigNewsBanner` selected `news[news.length - 1]` but did not schedule a dismissal. The component also had no explicit live-region semantics and no lifecycle cleanup for a future timer. The authoritative dismissal path already existed in `useTransientGameFeedback.dismissBigNewsItem`, so the missing behavior was confined to the presentation lifecycle.

## Fix

`BigNewsBanner` now:

1. Uses the exported `BIG_NEWS_DISPLAY_MS` constant (`8_000` ms) for a bounded display lifetime.
2. Starts a timer for the current item ID and clears it when the item changes or the component unmounts.
3. Calls the existing authoritative `onDismiss` callback, so hidden state, persisted dismissal IDs, and world-news removal stay consistent.
4. Uses `role="status"` and `aria-live="polite"` so assistive technology receives the alert without an urgent interrupt.
5. Keeps the visual card static; no flashing animation was added.

## Regression test

The existing transient-feedback regression suite continues to cover authoritative big-news dismissal and expiry thresholds. The component lifecycle is verified by type checking and the production build; the timer is isolated to the visible item ID and has explicit cleanup to prevent stale callbacks.

## Invariants checked

- A dismissed news ID is added to `dismissedBigNewsIds` and removed from the authoritative `bigNews` collection.
- A newly displayed item receives its own timer; a stale item timer cannot dismiss a replacement item.
- Unmounting the banner clears the pending timer.
- Manual dismissal and automatic dismissal use the same callback path.
- The 10px authoritative simulation grid and worker transport are unaffected.

## Save/migration impact

None. No world-state schema changes were introduced. Existing dismissed-news fields continue to be used.

## Verification result

Source-level fix complete. `npm run test:all` passed with 94 test files and 496 tests; the type-aware lint completed with 0 warnings and 0 errors; and `npm run build` completed successfully. Live Tauri verification remains recommended to confirm the approximately eight-second display and immediate click dismissal in the packaged desktop window.

## Related files

- `src/components/BigNewsBanner.tsx`
- `src/hooks/useTransientGameFeedback.ts`
- `tests/useTransientGameFeedback.test.ts`

## Final fix

Implemented and verified on 2026-08-28 in the working tree. Commit and push are pending.

## Deferred follow-up

If the game produces a very high volume of low-priority notices, a later UX pass can coalesce identical messages or add a small “N more” queue indicator. That is not required for the persistent/flashing defect and should not be coupled to the authoritative simulation.

## Verification checklist

- [x] Full Vitest suite passes: 94 files, 496 tests.
- [x] TypeScript/Vite production build passes.
- [ ] Tauri live run confirms automatic dismissal and stable rendering.
- [ ] Commit and push source, report, and verified maintenance changes.

## Resolution notes

The report is considered code-resolved because the missing lifecycle has been implemented. The remaining checklist items are release verification rather than additional design work.

## End state

The visible big-news card is now a transient, manually dismissible, accessibility-announced notice instead of an indefinitely persistent queue entry.

## Test command

```text
npm run test:all
npm run build
```

## Date closed

Automated verification complete; live packaged-window verification remains recommended.
