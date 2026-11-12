# Social, story, leadership and stats defects — audit remediation (2026-11-11)

- Bug: a day-stable roll gated per-tick social scenes, lifetime stats shrank after year 50, the ceremony tally counted dead ballots, the wedding outcome could retarget another rival, the guided-campaign choice was a dead mechanic, the wildkin sighting guard was lost on clone, tutorial milestones fired at the wrong time, affair fertility ignored its activity factor, barricades priced soldier DNA, and the dialogue owner trusted a caller roll and exposed dead paths.
- Status: resolved
- Severity: medium/low
- Date discovered: 2026-11-11
- Version/build: 0.6.5.1 → 0.6.5.2
- Reporter: full-code audit §4.5 and round-2 closure
- Area: social cadence, dialogue, elections, family, campaign/story, stats, genetics pricing
- Owner module: `socialLife.ts`, `dialogueTrees.ts`, `humanChat.ts`, `humanLeisureBehavior.ts`, `humanTick.ts`, `stats.ts`, `villageLeadership.ts`, `familyTree.ts`, `weddingDiplomacy.ts`, `guidedCampaign.ts`, `wildkinChronicle.ts`, `tutorialCampaign.ts`, `humanRelationships.ts`, `militiaBalance.ts`, `dashboardData.ts`, `renderer.ts`, `gameLoop.ts`

## Status history
- 2026-11-11 — resolved: each defect fixed at its owner; W-102's silent-settler line history is bounded (48) but not age-swept because no daily dialogue hook exists outside the human tick.

## Observed behavior

- **W-104** A day-stable `personDayRoll` was a per-tick gate, so once it passed every non-busy tick in the window requested another 4-tick scene: the pair played the whole pool, then went silent for three days.
- **W-105** The movement inspector re-ran `pickSocialImpulse` with empty neighbours, so it could name a venue the settler was not walking to.
- **W-106** The social-stagger predicate and greeting window were duplicated in three modules; `humanTick` passed a literal `true` for `onDayShift`.
- **W-41/W-42** Lifetime births/deaths were re-derived from the 50-year window (so they went down after year 50), and "longest living human" could credit a rival.
- **W-44** The ceremony fallback left dead ballots in `totalVotes` while the winner's votes came from eligible nominees only.
- **W-45** The family tree preferred the birth parent even when adoption was the real custody.
- **W-46** The renderer cleared live dialogue scenes when a colony was re-opened.
- **W-47** A landed famine bite charged the friendship hit twice.
- **W-65** `weddingDiplomacy` stored the rival by array index and could retarget another rival after extermination.
- **W-66** `recordGuidedCampaignChoice` had no caller; the persisted `choices` array was never written; a later chapter could show Remembered while an earlier showed Locked.
- **W-67** `socialLife.needsFoodAid` was a second food-shortage rule with different numbers.
- **W-68** The "announced once" wildkin guard was a `WeakMap` keyed on the world object, so a clone re-announced.
- **W-69** Tutorial `winter_watch` completed at day 250 (~110 days early) and `year_two` disagreed with its copy.
- **W-78/W-79** The affair conception roll ignored the `conception` activity factor; soldier DNA priced barricades.
- **W-101/W-102/W-103** `requestDialogue` trusted a non-finite `selectionRoll` (NaN pool index → mid-tick throw), the disk fallback was unreachable while line history was pruned only when a settler spoke again, and rain/storm drew winter ambient lines.

## Expected behavior

One decision per person per colony day for social scenes; lifetime totals monotonic; a tally must credit only eligible ballots; story outcomes bind to a stable id; a public boundary validates its inputs; disabled/dead code paths must not masquerade as features.

## Reproduction steps

1. Observe a pair in the 11:00–13:00 window: pre-fix the pool played back-to-back.
2. Run past year 50: pre-fix lifetime births/deaths decreased.
3. Exterminate the wedding rival: pre-fix the outcome retargeted another camp.
4. Clone the world after a wildkin sighting: pre-fix the line repeated.
5. Pass `NaN` as `selectionRoll`: pre-fix the tick threw.
6. Set rain: pre-fix ambient dialogue could be a winter/snow line.

## Evidence

Audit traces (`socialLife.ts:426/459`, `dashboardData.ts:948`, `humanTick.ts:1587`, `stats.ts:262-265/276-280`, `villageLeadership.ts:846-857/997-1000`, `familyTree.ts:358-359`, `renderer.ts:29`, `famineDesperation.ts:68/77`, `weddingDiplomacy.ts:68-98`, `guidedCampaign.ts:120-147`, `socialLife.ts:158-163`, `wildkinChronicle.ts:84-88`, `tutorialCampaign.ts:66-73`, `humanRelationships.ts:843`, `militiaBalance.ts:156-159`, `dialogueTrees.ts`) plus the new regressions.

## Root cause

Day-scoped rolls used as tick gates, window-derived totals presented as lifetime totals, a tally that mixed credited and uncredited ballots, index-based identity, an unwired mechanic, a clone-unsafe guard, and two asymmetric activity-factor sites.

## Fix / proposed fix

- `hasDialogueSceneOnDay` (scene owner) + per-participant scene history: one scene per person per colony day, same day odds; mate/friend selection skips already-spoken partners.
- `socialImpulseNearbyAdults` extracted and shared by the tick and the inspector; `isSocialStaggerTick`/`isGreetingHour` are the one predicate set for all three callers; `onDayJobShift` passed instead of `true`.
- `updateLifetimeStats` carries `prev + latest` reconciled with the window; longest-life filters player humans.
- `creditedCeremonyBallot` derives ballots/winner votes from currently eligible nominees.
- Family tree resolves each parent slot through `getChildCustodian`; the scene owner keeps live pairs on re-open and clears on world replacement (`retainDialogueSessionsForWorld`).
- One friendship hit per landed famine bite.
- Wedding rival stored as a stable id (`weddingRival`); legacy index saves resolve to no rival with generic wording rather than retargeting.
- `recordGuidedCampaignChoice` and the persisted `choices` are removed; Remembered requires the chapter to be unlocked.
- `needsFoodAid` deleted; civic petition uses `isFoodAlert`.
- Wildkin sighting uses a persisted story flag keyed by entity id.
- Tutorial milestones keyed to the canonical winter onset/day 360 with goal-oriented copy.
- Affair conception multiplies the activity factor; barricades use a DNA-free total.
- `requestDialogue` falls back to the seeded content roll for a non-finite roll; the dead disk path is removed; recent lines are capped at 48; rain/storm map to `bad_weather` contexts.

## Save/migration impact

`guidedCampaign.choices` is no longer written; old saves carrying it load unchanged (unknown extra key ignored). Legacy wedding-index saves lose the rival reference instead of retargeting. New story flags are plain keys in `storyFlags`, which is already persisted.

## Verification result

- 16 focused files: **156 passed**; dialogue/social/worker set: **80 passed**; humanChat/low-8/low_chat: **37**; civic/social busy: **19**; lifecycle/affair: **25**; gameLoop/fallback: **51**.
- `npx tsc` app/vitest/scripts: **PASS**; strict cycles: **PASS**; comment check: **PASS**; oxlint: **0**.
- Full `standard` suite: run after integration (see remediation log).
