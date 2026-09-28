# Opening-night answers are misrouted into stage 2, making resolveStage3 unreachable and always applying the 'cancel the show' outcome

- **Bug:** Opening-night answers are misrouted into stage 2, making resolveStage3 unreachable and always applying the 'cancel the show' outcome
- **Status:** resolved
- **Date discovered:** 2026-09-13
- **Version/build:** 0.6.4
- **Reporter:** full simulation-logic audit (audit agent A20-diplomacy-trade; adversarially verified) — audit id H13
- **Area:** Truth
- **Owner module:** `src/game/travelingTheatre.ts`
- **Cadence:** see fix; the owning cadence is stated in `docs/archive/SIMULATION_AUTHORITY.md` §3–4

## Status history

- 2026-09-13 — open (found by automated simulation-logic audit, confirmed by independent adversarial verification, re-verified by the lead)
- 2026-09-13 — resolved (P1 batch: fix applied at the owning module with a regression test; see **Fix**, **Regression test** and **Verification result**)

## Observed behavior

Answering 'Opening Night' with any of its three choices runs the stage-2 cancel branch: FLAG_RESOLVED/'theatre_story_resolved' is stamped (210) and addBigNews reports 'The troupe leaves offended / The show is cancelled' (213). No reputation is ever granted and resolveStage3 (249-273), including the FLAG_SUPPORT qualityBonus (252) and the 'resolved' logEvent (272), is dead code reachable only if FLAG_STATUS were 0 or >=3. The guided campaign still marks the chapter complete because it reads theatre_story_resolved (guidedCampaign.ts:51), which hides the wrong outcome. Player-visible: three distinct choices always produce one identical 'cancelled' result.

## Expected behavior

Add a distinct status for the resolved-support state (e.g. `performing: 3` to STATUS), set `[FLAG_STATUS]: STATUS.performing` in resolveStage2 for the three non-cancel answers, extend tickTravelingTheatre's guard at 224 to accept it (`!== STATUS.preparing && !== STATUS.performing`), and route `status === STATUS.performing` to resolveStage3 in resolveTravelingTheatre.

## Reproduction steps

Static reproduction (no runtime repro was run during the audit):

1. Open `src/game/travelingTheatre.ts` at lines 148-152 | 148-153, 183-216, 249-273.
2. Note the offending code: `151: `if (status === STATUS.preparing) return resolveStage2(state, choiceId as Stage2Choice);` — resolveStage1 sets FLAG_STATUS to STATUS.preparing (157) and nothing ever changes it afterwards (resolveStage2 writes only FLAG_SUPPORT at 192/201/205), while the stage-3 card carries the same STORY_KEY (233) and the choices 'correct_story'/'let_legend_grow'/'interrupt' (238-240) match no case in resolveStage2's switch, so they fall into 207-215 `case 'cancel_show': default: {``.
3. Follow the call path/guard described under **Root cause** — that path is reachable in normal play.

## Evidence

Adversarial verification note (an independent agent re-read the code and the call sites):

> `FLAG_STATUS` is written only to `script_selected` (93) and `preparing` (158), and `tickTravelingTheatre` pushes the Opening Night card setting only `FLAG_STAGE3` (230), never changing the status; `resolveTravelingTheatre` therefore routes the stage-3 answer through `resolveStage2` (151) because the status is still `preparing`, and since no case in that switch matches `correct_story`/`let_legend_grow`/`interrupt` it falls into `case 'cancel_show': default:` (207-215), stamping `FLAG_RESOLVED` and posting '🎭 The troupe leaves offended'. The stage-3 rewards/reputation are consequently dead code — every Opening Night answer produces the cancellation outcome — and the story is reachable in normal play (storyEvents.ts:240-246 dispatches by `storyKey`, and no test in tests/ covers the theatre). Fix: dispatch on the answered card id (e.g. `if (STAGE3_CHOICES.has(choiceId)) return resolveStage3(...)` before the two status checks, since the id sets are disjoint), or add a `performance` status set by `tickTravelingTheatre` alongside `FLAG_STAGE3`.

## Root cause

`FLAG_STATUS` is written only to `script_selected` (93) and `preparing` (158), and `tickTravelingTheatre` pushes the Opening Night card setting only `FLAG_STAGE3` (230), never changing the status; `resolveTravelingTheatre` therefore routes the stage-3 answer through `resolveStage2` (151) because the status is still `preparing`, and since no case in that switch matches `correct_story`/`let_legend_grow`/`interrupt` it falls into `case 'cancel_show': default:` (207-215), stamping `FLAG_RESOLVED` and posting '🎭 The troupe leaves offended'. The stage-3 rewards/reputation are consequently dead code — every Opening Night answer produces the cancellation outcome — and the story is reachable in normal play (storyEvents.ts:240-246 dispatches by `storyKey`, and no test in tests/ covers the theatre). Fix: dispatch on the answered card id (e.g. `if (STAGE3_CHOICES.has(choiceId)) return resolveStage3(...)` before the two status checks, since the id sets are disjoint), or add a `performance` status set by `tickTravelingTheatre` alongside `FLAG_STAGE3`.

## Fix

`resolveTravelingTheatre` dispatches on the answered card id first — the three stages offer disjoint choice ids (`first_winter|wolf_mistake|town_hall_scandal|famine_foot`, `support_*`, `correct_story|let_legend_grow|interrupt`) — and only then consults the shared `FLAG_STATUS`. Stage-3 answers therefore reach `resolveStage3` instead of falling through `resolveStage2`'s `case 'cancel_show': default:`, which had been cancelling the show, emitting "the troupe leaves offended" and making every stage-3 reputation outcome unreachable.

## Regression test

`tests/travelingTheatre.stageRouting.test.ts` (3) — the real sequence (`maybeOfferTravelingTheatre` → script → support → `tickTravelingTheatre` opening night) applies `let_legend_grow` (+2 reputation, no cancellation), still honours an explicit stage-2 `cancel_show`, and routes `correct_story` (+1) and `interrupt` (−1).

## Invariants checked

Relevant hard invariants: `docs/archive/SIMULATION_AUTHORITY.md` §5. After the fix, `simulation/simulationInvariants.ts` and `simulation/simInvariants.ts` must stay clean in the existing invariant tests.

## Save/migration impact

None expected: the field(s) written here either already round-trip or are derived at load. Confirm with the save round-trip tests if state fields are touched.

## Verification result

`npm run test:all` passes; the first case fails on the pre-fix code (stage-3 answers were cancelled).

## Related commits or files

- `src/game/travelingTheatre.ts` (lines 148-152 | 148-153, 183-216, 249-273)
- Consolidated report: `BUG_REPORTS/2026-09-13-simulation-logic-audit.md` (audit id H13)
