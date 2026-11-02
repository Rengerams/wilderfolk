# Same settler repeated their own dialogue line

- Bug: variant rotation was scene-level only, so one settler could say the same authored line again while the pool cycled to another scene that shared that line.
- Status: resolved
- Severity: medium
- Date discovered: 2026-11-02
- Version/build: V.0.6.5.1 code base, PR #93 merge `a97704e1`
- Reporter: PR #93 implementation review, owner requirement
- Area: dialogue selection
- Owner module: `src/game/dialogueTrees.ts` (`requestDialogue`)
- Related PR/commit: [#93](https://github.com/Rengerams/wilderfolk/pull/93)

## Status history

- 2026-11-02 — open: pregnancy variants share opening lines, and only the initiating speaker's scene history advanced.
- 2026-11-02 — resolved: per-settler line history filters scenes that would reuse that settler's recent line; other settlers may still use it.

## Observed behavior

`dialogueRecentScenes` recorded one tree per event/mode/roles and rotated to the next tree. It did not record individual lines. Pregnancy pools contained shared lines (for example `wf_needs_alternative_wf_pregnant` repeats the opening lines of `wf_pregnant_kicking`, `wf_pregnant_cradle` and `wf_pregnant_sleep`), so rotation could choose a new scene and repeat a line the same mother or partner had just said. A pair scene also advanced only the initiating speaker's history, so the other participant could immediately pick the same scene.

## Expected behavior

A line may appear in different scenes and may be said by different settlers, but the same settler must not repeat their own line over and over. Solo scenes still use one settler; a paired scene still requires two real settlers.

## Reproduction steps

1. Install a two-scene pair bank with distinct lines.
2. As the same mother and partner, request the event twice.
3. Before the fix the second request could cycle back to a scene that shared a line; the regression now asserts the second request picks the other scene.

## Evidence

- `requestDialogue` now records a line hash and tick on the entity that actually says each line, after resolving swapped pair roles.
- A scene is filtered when any of its lines would be repeated by that speaker within `TICKS_PER_DAY * 3`; scripted exact scenes and explicit `treeId` bypass the filter.
- `tests/dialogue.lineRepeat.test.ts` pins same-settler rotation, different-settler reuse, and the real two-settler requirement for a pair scene.

## Root cause

History was scene-level and initiator-only; authored line reuse across different scenes was invisible to the selection policy.

## Fix / proposed fix

Added optional persisted `dialogueRecentLines` (line hash → tick) on entities and applied it in `requestDialogue`, pruning entries after three days. Solo/pair and role mapping remain the existing validated mode rules; the same line is still available to a different settler.

## Save/migration impact

Additive optional per-entity field; old saves start with no line history and remain valid.

## Verification result

- `npm run test:types` — PASS.
- `node scripts/test.mjs unit dialogue` — PASS, 15 files / 62 tests.
- `node scripts/test.mjs check` — circumstance and ownership gates run; result recorded in the final report.
