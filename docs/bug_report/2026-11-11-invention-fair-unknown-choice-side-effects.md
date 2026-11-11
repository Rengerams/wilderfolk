# Unknown Invention Fair choices reject or refund the story

- Bug: An unsupported story-card choice silently acts as a real reject or dismantle instruction.
- Status: investigating (fix and regressions committed; awaiting CI)
- Severity: medium
- Date discovered: 2026-11-11
- Version/build: V.0.6.5.1 main 926eb5f (2026-11-11)
- Reporter: source-backed review against the Invention Fair scenario specification
- Area: authored story events / worker story choices
- Owner module: `src/game/inventionFair.ts`; `src/game/storyEvents.ts` is the command dispatch and UI gate adapter
- Related PR/commit: audit/invention-fair-contract-20261111, commit 352249b

## Status history

- 2026-11-11 — investigating: source trace confirms unsupported answers trigger fallback branches in both stages.
- 2026-11-11 — investigating: fixed via shared stage-choice sets and new regressions; runtime checks pending.

## Observed behavior

In `resolveStage1`, the `switch` default falls through to `reject` and stamps the one-time `invention_fair_resolved` flag. In `resolveStage2`, the final `else` branch treats any choice other than `keep` and `improve` as `dismantle`, awarding 4 wood through the capped resource writer. `getInventionFairChoiceEligibility` previously returned `ok: true` for every unknown choice id when it had no wood entry.

## Expected behavior

Only the authored choices valid for the current stage can mutate the story; unknown/stale stage choices are refused without resource, status or reputation changes. An answer for the wrong stage cannot silently become reject or dismantle.

## Reproduction steps

1. Seed an ordinary world and set `storyFlags.invention_fair_status=1`.
2. Call `resolveInventionFair(world, 'refund_all_materials')`. Before the fix it returns true and sets `invention_fair_resolved` (as though rejecting).
3. Set `invention_fair_status=2` in a fresh world, then call the same unknown answer. Before the fix it returns true, grants a 4-wood dismantle refund and ends the story.
4. Before the fix, `getInventionFairChoiceEligibility(world, 'refund_all_materials')` returns `{ok:true}`.

## Evidence

Observed in `src/game/inventionFair.ts` switch/default and final else branches on original main, and the eligibility lookup into `FUNDING_WOOD_COST`. Regression fixture `tests/inventionFair.invalidChoices.test.ts` exercises unknown, cross-stage and valid controls.

## Root cause

The resolver assumes every incoming `choiceId` is one of the current card's choices. Its fallback branches were treated as legitimate gameplay choices rather than invalid input.

## Fix / proposed fix

Use stage-specific canonical sets in `inventionFair.ts` for both eligibility and authoritative resolution, and pass the actual event id from `storyEvents.ts` to enforce stage matching in the UI gate. Preserve all existing valid choice effects and capped refunds.

## Save/migration impact

None: no changes to `WorldState`, story flags, choice IDs, save schema, worker command protocol or gameplay costs.

## Verification result

- Source trace: **CONFIRMED** on main 926eb5f.
- Focused tests: **NOT RUN** locally (remote GitHub workflow will verify).
- Standard and build: **PENDING** on new PR.
