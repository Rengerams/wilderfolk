# Spotlight gathering positions can lie beyond map boundaries

- Bug: A valid rare Spotlight lineup can include off-map chorus targets, trapping actors until timeout.
- Status: investigating (source fix and regression added; CI/browser confirmation pending)
- Severity: medium (P2, feature-breaking)
- Date discovered: 2026-10-28
- Version/build: development PR #91, review head 1d88f94a4ec58e294e498f84f7ce0a25ddc4761a
- Reporter: [Codex review #4406318578](https://github.com/Rengerams/wilderfolk/pull/91#discussion_r4406318578)
- Area: Spotlight gathering slot placement
- Owner module: `src/game/spotlightLore.ts`
- Related PR: [#91](https://github.com/Rengerams/wilderfolk/pull/91)

## Status history

- 2026-10-28 — investigating: code review established an off-map placement path; source correction and focused edge test added, CI pending.

## Observed behavior

`nearestWalkableWorldPoint` clamps the grid-cell index when checking walkability, but on an unblocked edge cell it returns the original input coordinates. An edge-adjacent girl can therefore receive a chorus stage target with negative x or y, while the human movement integrator clamps real positions to the world.

## Expected behavior

Every accepted stage target lies inside playable map bounds. If valid, separated, walkable positions cannot be selected, reject the attempted event without setting its 90-day cooldown.

## Reproduction steps

1. Create a seeded eligible weekend 19:00 Spotlight attempt with an eligible girl near x=4 or y=world.height-4 and eight nearby adults.
2. Run `maybeStartSpotlightLore` and inspect accepted stage slots.
3. Before the source fix, an open clamped grid edge can allow a negative/out-of-map slot, which the real actor cannot reach.

## Evidence

Codex P2 review #4406318578; `spotlightLore.ts` computed raw semicircle coordinates before calling `nearestWalkableWorldPoint`, whose unblocked start-cell path returns `{ x, y }` unchanged.

## Root cause

Cell-index clamping in the shared pathfinding lookup does not guarantee returned point-coordinate bounds. Spotlight accepted the result without a world-boundary check.

## Fix

In the Spotlight event owner, clamp computed candidate coordinates to `[0, width-1]` and `[0, height-1]` before walkability lookup. Validate that the returned nearest point is also strictly inside map bounds, and keep the existing separation check. A rejected lineup never creates the scene or sets its cooldown. Shared pathfinding behavior, event probability and real movement rules are unchanged.

## Save / migration impact

None: same scene fields, player eligibility, trigger probability, 65-tick gathering timeout and 90-day cooldown after a successful start.

## Verification result

- Source-level failure path: confirmed by review.
- Added focused left/bottom edge placement regression to `tests/spotlightLore.test.ts`.
- Automated test, CI and browser verification: NOT YET CONFIRMED when report authored.
