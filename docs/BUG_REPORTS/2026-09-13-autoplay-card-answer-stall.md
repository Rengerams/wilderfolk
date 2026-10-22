# Bug: Auto-play re-proposed card answers the card owner refused

- Bug: Auto-play stalls the whole colony ladder on an unanswerable raid / story card
- Status: resolved
- Date discovered: 2026-09-13
- Version/build: Wilderfolk 0.6.4.1 working tree
- Reporter: Developer ("virtual player doesnt build farms or other things it seems")
- Area: Play | worker
- Owner module: `src/game/virtualPlayer.ts` (`answerOpenCard`), with eligibility provided by `frontierCombat.ts` and `storyEvents.ts`
- Cadence: One proposed command per in-game hour (no new tick layer)

## Status history

- 2026-09-13 — open: reported from play — with Auto-play on, the bot stops building anything; the header status keeps repeating one card answer while the card stays open.
- 2026-09-13 — resolved: every card answer is now gated on the owner's own accept rule before it is proposed, with regression tests that fail without the gate.

## Observed behavior

With 🤖 Auto-play enabled the bot stops making colony progress entirely: no Farm
is ever built, no workplace is staffed, no House is started. The header status
line keeps naming the same card answer, hour after hour, while the card itself
never closes.

## Expected behavior

Answering an open card must resolve it (or be skipped) so the colony ladder
below it — staffing, the Leader's House, housing, food, research, festival —
still gets its turn. The bot must never spend its one act per hour re-proposing
an answer the command owner will refuse.

## Reproduction steps

1. `npm run dev`, start a colony, enable **🤖 Auto-play** (dev-only toggle).
2. Let the **Travelling Theatre** reach its stage-2 card *Build the Production*
   with fewer than 20 food in store, and 15+ wood.
3. Watch the header status: every in-game hour it repeats
   `answer the story card — Build the Production`, the card stays open, and no
   building is ever started again.
4. The same shape reproduces with an incoming raid while the colony has no
   stone or iron spears: the bot re-proposes `defend`, `respondToRaidEvent`
   refuses it (card stays open) until the raid expires after 2–6 days.

## Evidence

`answerOpenCard` is priority 1 and returns a decision for as long as a card is
open, so priorities 2–7 never run. Both owners refuse answers without telling
the caller:

- `frontierCombat.respondToRaidEvent` — `defend` is refused without spears or
  militia strength, `barricade` without 20 wood + 10 stone, `payoff` without the
  tribute food. Each refusal leaves the event in `pendingRaidEvents`.
- `storyEvents.respondToStoryEvent` — a refused answer is **re-queued** onto
  `pendingStoryEvents` by design (so the player can choose again).

The bot picks by regex preference, else the card's first declared choice, so it
picks `defend` and `support_hospitality` (a 20-food offer) regardless of whether
those can be paid for.

## Root cause

The engine assumed "a card answer always resolves the card". For raids and story
cards that is false, and because the bot is stateless it cannot learn from the
refusal — it recomputes the same answer from the same world every hour.

`getDiplomacyChoiceEligibility` already existed for exactly this reason (and the
Village Request branch mirrors its own gates); the raid and story branches were
simply never given the same treatment.

## Fix

- `src/game/frontierCombat.ts` — new `getRaidChoiceEligibility(state, event,
  choiceId, allAlive?)`, and `respondToRaidEvent` now applies its three guards
  through it, so the accept rule has one definition. Identical messages.
- `src/game/storyEvents.ts` — new `getStoryChoiceEligibility(state, event,
  choiceId)` dispatching per `storyKey`; story keys with no gate answer `ok`.
- `src/game/travelingTheatre.ts`, `src/game/deerParliament.ts`,
  `src/game/weddingDiplomacy.ts`, `src/game/inventionFair.ts` — each exports the
  eligibility of its own gated answers, so the rule stays with the module that
  owns the gate and nothing is restated in the bot.
- `src/game/virtualPlayer.ts` — `pickEligibleRaidChoice` / `pickEligibleStoryChoice`
  prefer the pattern match only when the owner accepts it, else the first
  acceptable answer, else `null` (which lets the colony ladder run).

## Regression test

`tests/virtualPlayer.test.ts` (local-only):

1. a raid is answered with `payoff` when `defend` is impossible, and applying the
   proposal really empties `pendingRaidEvents`;
2. a theatre story card is answered with `support_venue` when only the 20-food
   hospitality offer is out of reach;
3. a card whose paid answers are all out of reach still gets the free
   `support_improvise`;
4. `getRaidChoiceEligibility` agrees with the responder for all three answers;
5. an unanswerable raid on a healthy colony yields **no** command, and on a
   colony that needs housing yields the House (the ladder runs).

Verified load-bearing: with the raid gate replaced by the old `pickChoice`,
3 tests fail with `choiceId: "defend"`; with the story gate replaced, 2 fail.

## Invariants checked

- The engine stays pure and stateless: no history, no mutation, same world →
  same answer (existing determinism test still passes).
- No new tick layer, no new command, no second mutation path: the bot still
  proposes one real `WorkerCommand` per in-game hour through the player's door.
- No accept rule is duplicated in the bot; each owner exports its own.

## Save/migration impact

None. No field was added, removed, or reinterpreted; the eligibility helpers
read existing state and `respondToRaidEvent`'s observable behaviour is
unchanged (same guards, same floating-text messages).

## Verification result

Automated: `tsc -p tsconfig.vitest.json --noEmit` clean, `oxlint --type-aware
--type-check` 0 warnings / 0 errors on all eight changed source files, and the
full local suite passes (see the task report). Player-facing confirmation in a
real browser session is not recorded.

## Related commits or files

- `src/game/virtualPlayer.ts`
- `src/game/frontierCombat.ts` (`getRaidChoiceEligibility`)
- `src/game/storyEvents.ts` (`getStoryChoiceEligibility`)
- `src/game/travelingTheatre.ts`, `src/game/deerParliament.ts`,
  `src/game/weddingDiplomacy.ts`, `src/game/inventionFair.ts`
- `tests/virtualPlayer.test.ts`
