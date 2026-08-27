# Story Scenario: The Wedding That Nearly Started a War

**Scenario type:** Randomized colony story and diplomacy quest chain  
**Recommended start:** After the colony has one completed residence, one staffed production building, and at least one rival settlement  
**Primary systems:** Rival diplomacy, food, gold, reputation, visitors, families, event log, Valley Chronicle  
**Suggested implementation owner:** A focused story-quest module built on the existing `pendingStoryEvents` and `storyFlags` pattern; do not expand `groupEvents.ts` with all narrative logic.

## Design premise

A rival settlement sends an invitation to a politically important wedding. The invitation looks friendly, but every gift and every delay is interpreted as a statement about the colony’s strength, wealth, and intentions.

The player must decide whether to spend scarce resources on diplomacy, send a socially important settler as an envoy, or ignore the event and accept the possibility that the rival interprets the absence as an insult. The story should make diplomacy feel like a relationship between people rather than a sequence of abstract peace and raid buttons.

## Player fantasy

The player is not simply managing resources. The player is managing **meaning**. The same amount of food can be a generous wedding feast, an insulting ration, or an obvious bribe depending on the rival’s temperament and current relationship.

## One-time seeded start cadence

This story may start **at most once per save**. A rival may continue to use ordinary diplomacy and raid systems, but only one wedding story chain can be offered in the save. Evaluate the story only after colony day 40, when the existing rival and residence requirements are satisfied, no major authored story is active, and the shared authored-story cooldown is clear.

Use a deterministic daily-boundary roll derived from the colony seed, rival ID, and `wedding_diplomacy` story key. The roll selects a randomized eligible start window rather than a universal day. Different seeds may produce different start timing, while the same seed, rival state and history remain reproducible. If the rival requirements are not satisfied during the selected window, defer evaluation to a later eligible boundary without forcing the story.

Persist `wedding_diplomacy_offered` when the invitation is created. Declining, timing out, or completing the chain consumes the one-time story slot. The shared authored-story cooldown should keep this chain at least 28 colony days away from another authored quest start or resolution because it has multiple stages and diplomacy consequences.

## Story sequence

### Stage 1 — An invitation across the river

A rival messenger arrives with an invitation. The story text names the rival settlement and the couple, but the names are generated from existing rival and settler data.

The player receives three choices:

| Choice | Immediate cost | Hidden interpretation |
|---|---:|---|
| Send a practical gift | 20 food and 10 wood | Respectful but modest |
| Send an impressive gift | 15 gold or one finished iron item | Either generous or intimidating |
| Decline politely | None | Depends on rival temperament and relationship |

The player may also be offered a fourth choice if a suitable adult settler exists: **send an envoy**. This consumes time and temporarily changes the envoy’s social routine, but improves the chance of a peaceful outcome.

### Stage 2 — The gift is misunderstood

After two to four colony days, the rival responds. The response depends on the original relationship, temperament, selected gift, and whether an envoy was sent.

Possible responses include:

- The rival praises the colony’s generosity and offers a temporary trade discount.
- The rival suspects the iron gift is a threat and increases military readiness.
- The rival says the colony’s modest gift was honest and asks for a second practical contribution.
- The rival interprets the refusal as an insult and suspends friendly contact for a short period.

The player should receive a new choice only when there is a meaningful decision. Do not create a card for every intermediate state.

### Stage 3 — The wedding feast

The wedding party requests a final decision. The colony can host a feast, attend with a small delegation, or stay home and fortify the settlement.

| Choice | Outcome direction |
|---|---|
| Host a feast | Food cost, reputation gain, stronger treaty chance, temporary visitor activity |
| Attend with a delegation | Smaller cost, social relationship benefit, possible envoy-specific memory |
| Stay home and fortify | Security benefit, weaker diplomacy, increased chance of a tense response |

The final result should be visible in the Chronicle and event log. The result must not silently change the rival relationship without a player-facing explanation.

## Outcomes

### Peaceful alliance

The rival becomes friendly or receives a longer peace treaty. A short-term trade benefit is granted. The Chronicle records that the colony’s diplomacy began with a wedding rather than a battle.

### Uneasy respect

The rival remains competitive but delays its next hostile action. The colony gains reputation, but no treaty is created. This is a useful middle outcome and should be more common than a total success or total failure.

### Diplomatic insult

The rival becomes tense, a treaty is shortened or removed, and a future raid or border dispute becomes more likely. The event should explain the social cause rather than presenting a random punishment.

### Wedding catastrophe

This should be rare and require several poor or hostile choices. A food shortage, missing envoy, bad weather, or an existing tense relationship can cause the feast to fail. The result should create a recoverable problem, not an instant game-ending war.

## Persistent state

Add one bounded record or a small set of namespaced flags. Do not store a large conversation history.

```ts
interface WeddingDiplomacyState {
  status: 'offered' | 'gift_sent' | 'response_waiting' | 'feast_waiting' | 'resolved';
  rivalId: string;
  coupleLabel: string;
  giftId?: 'practical' | 'impressive' | 'none';
  envoyId?: number;
  startedDay: number;
  resolveAfterDay?: number;
  outcome?: 'alliance' | 'uneasy_respect' | 'insult' | 'catastrophe';
}
```

If adding a new saved field is undesirable during the first prototype, encode the state in `storyFlags` and use one active story event. Production integration should prefer a typed optional record if the story becomes permanent.

## Trigger and cadence

Use a deterministic daily-boundary check. The scenario should be eligible only when:

- at least one rival settlement exists;
- no other major authored story is occupying the same story slot;
- the colony has a completed residence and a staffed production building;
- the colony is not already in a severe disaster or active raid resolution;
- a deterministic seeded roll selects this start scenario.

The scenario must not be offered on the first tick and must not use an unseeded `Math.random()` call in a way that makes saves or tests irreproducible.

## Implementation sequence

1. Add a typed story key and state shape, or prototype with namespaced `storyFlags`.
2. Add deterministic eligibility and offer logic at the existing daily story boundary.
3. Add the invitation response and validate resource affordability before mutation.
4. Schedule the delayed response using an absolute colony day, not a realtime scan.
5. Add the feast/delegation response and resolve the outcome through one owner.
6. Apply only documented effects to rival relationship, treaty duration, reputation, resources, and Chronicle/event-log records.
7. Add UI copy for each event and make every resource cost visible before confirmation.
8. Add save/load coverage if the state persists across sessions.

## Tests

Focused tests should cover the minimum-day gate, one-time-per-save behavior, different seeded start windows across seeds, same-seed reproducibility, shared cooldown blocking and deferral, eligibility, each gift path, insufficient resources, delayed response timing, invalid choice IDs, repeated response attempts, rival temperament branches, and all four final outcomes.

At least one seeded test should prove that the same world state produces the same scenario and outcome. A worker/main-thread parity test is required if the story response is processed through worker commands.

## Acceptance criteria

The story is ready for a prototype when the player can complete one full three-stage chain, every choice has a visible cost or consequence, the rival response reflects the selected action, the event log explains the result, no existing raid, treaty, workforce, or save invariant fails, and the chain starts only once at a seeded non-fixed time with safe spacing from other authored quests.

## Non-goals

Do not add marriage simulation between player and rival settlers, a new diplomacy graph, a new quest engine, a second relationship owner, or a permanent population transfer in the first implementation.

## Feature priority

| Priority | System | Purpose | First implementation |
|---|---|---|---|
| Must | Story state and three-stage choices | Prove diplomacy has memory | One rival, one wedding, four outcomes |
| Should | Envoy identity | Make the story personal | One temporary envoy reference |
| Could | Generated wedding details | Add replayability | Trait- or temperament-based text variants |

## Independent random-event rules

This story is an optional independent event. It may appear when its own diplomacy conditions are satisfied, regardless of whether the colony has encountered any other proposed story. It must not require a Campaign mode, a previous story, or completion of `tutorialCampaign.ts`.

Recommended start conditions are at least one rival settlement, a completed residence and staffed production building, no active raid or major disaster resolution, and a relationship state that makes a diplomatic invitation plausible. A deterministic daily or visitor-boundary roll should select whether the wedding occurs. It should have a long cooldown so it feels special rather than routine.

The primary implementation owner is a focused diplomacy-story module that reads rival relationship, temperament, food, gold, reputation, family, visitor, and Chronicle state. It should delegate treaty, raid, resource, and relationship changes to existing owners. It must not create a second diplomacy graph or marriage system.

### Independent-event tests

Test rival eligibility, relationship and temperament branches, resource validation, delayed response timing, invalid choices, save/load during the chain, cooldown, deterministic triggering, and operation without tutorial or Campaign state. Confirm that resolving the wedding does not unlock or require another story.
