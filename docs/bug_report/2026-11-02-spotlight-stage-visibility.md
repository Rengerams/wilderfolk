# Spotlight lore captions and background settlers obscure the performance

- Bug: large captions, dark/narrow spotlight and unrelated settler labels hide the active cast
- Status: investigating
- Severity: medium
- Date discovered: 2026-11-02
- Version/build: 0.6.5.2 development main at 405a1aefae6fa9bf17aaa410d289efa77c415660
- Reporter: user-provided gameplay screenshot
- Area: Spotlight Lore presentation and stage selection
- Owner module: src/components/SpotlightLoreOverlay.tsx, src/game/spotlightLore.ts, src/game/renderer/overheadLayout.ts

## Status history
- 2026-11-02 — investigating: replaced the separate HTML caption with the existing canvas chat bubble painter; CI/browser validation pending

## Observed behavior
The user's screenshot shows a roughly 320-pixel wide central HTML caption covering the village scene, with nonparticipants and overhead name plates drawn during the performance. The spotlight gradient darkens much of the visible area. The normal event chose the girl's location rather than an existing Village Square.

## Expected behavior
Dialogue should use the same speaker-attached canvas chat bubble and wrapping as normal conversations. A wider spotlight should expose the cast, and a completed Village Square should be the stage. Only participants should draw during the ready performance; other settlers should not be deleted or moved.

## Reproduction steps
1. Play a colony with several settlers and a completed Village Square.
2. Start a Spotlight Lore scene and view a caption while the camera focuses.
3. Observe the oversized HTML caption, narrow visible area and unrelated people/labels.

## Evidence
User gameplay screenshot dated 2026-11-02 and source in SpotlightLoreOverlay.tsx and renderer/humans.ts: the 20rem bubble, 180×145px halo and lack of a ready-scene cast filter were explicit.

## Root cause
The overlay sized and painted its own HTML caption independently of normal canvas chat and used a relatively dark, small spotlight. The renderer drew all visible settlers regardless of spotlight participation. The stage generator defaulted to the heroine's location.

## Fix / proposed fix
Remove the duplicate HTML speech bubble and route the current speaker's authored line through the existing chat bubble renderer using a frame-scoped projection, without setting `chatPhrase` or `chatTicks`. Keep the wider lighter stage, completed-square staging and the render-only cast filter. Stage slots stay path-grid validated; villages without a Square keep the original gathering rule.

## Save/migration impact
No schema change. In a completed Square event, only cast members are transported to the Square in WorldState; unrelated settlers and world logic are unchanged by the render filter.

## Verification result
NOT RUN: local TypeScript, lint, build and browser checks are unavailable in the GitHub-only workspace. Regression tests were committed for Square staging, the visibility filter, speaker-bound frame projection and use of the existing chat painter; GitHub CI/browser confirmation pending. The prior Node.js CI run reached the semantic-duplicates gate and was blocked by a missing baseline file on main.
