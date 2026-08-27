# Story Scenario: The Deer Parliament

**Scenario type:** Humorous ecology story and one-time seasonal simulation event  
**Recommended start:** After the colony has hunting activity and visible ecology pressure  
**Primary systems:** Deer population, ecology stage, hunting spots, farms, paths, notifications, event log, Valley Chronicle  
**Suggested implementation owner:** A small daily ecology-story function called from the existing daily ecology boundary; do not add a new deer AI or tick layer.

## Design premise

The deer begin gathering near the colony during one unusual seasonal window in suspiciously organized groups. The event is a one-time authored story per save; later deer gatherings remain ordinary ecology behavior. Villagers conclude that the deer are holding a parliament to negotiate hunting rights. The player must interpret the gathering and choose whether to reduce hunting, designate a preserve, or ignore the “delegation.”

The deer do not literally become talking characters. They continue to behave as deer. The humor comes from villagers projecting political meaning onto a real ecological pattern.

## Player fantasy

The player becomes the caretaker of a valley where ecology is visible and occasionally absurd. The player should feel that animal behavior has consequences, while the colony’s people create stories about those consequences.

## Trigger conditions

Offer the event only when all of the following are true:

- deer exist in meaningful numbers;
- hunting activity or grazing pressure has crossed a bounded threshold;
- the colony is not already resolving a major disaster or story card;
- the event has not occurred in the current season;
- a deterministic daily roll succeeds.

The trigger should use existing ecology and hunting values. It must not scan every deer every tick or add persistent “political deer” state.

## One-time seeded start cadence

This story may start **at most once per save**, not once every season. The seasonal record remains useful for follow-up and debugging, but it must not reset eligibility for a new first-time event. Evaluate the trigger only after colony day 45, at the existing daily ecology boundary, and only when the shared authored-story cooldown is clear.

Use a deterministic roll derived from the colony seed, season key, and `deer_parliament` story key. The roll chooses a randomized eligible season/day window, so separate saves can receive the event at different times while the same save and seed remain reproducible. If the ecological conditions are not met when the selected window is reached, defer the check to later eligible boundaries without creating a guaranteed fixed-day event.

Persist `deer_parliament_offered` as a one-time save flag or typed record. Set it when the card is offered, including when the player ignores or declines it, and never create a second parliament in that save. The shared authored-story cooldown should keep this event at least 21 colony days away from another authored quest start or resolution.

## Story sequence

### Stage 1 — The delegation arrives

A notification announces that several deer have gathered near a road, field, or woodland edge. The player receives a humorous interpretation from an elder, hunter, or child.

Example copy:

> “The deer have formed a committee. No one knows who elected the antlered speaker, but the minutes appear to consist of hoofprints.”

The player is shown the relevant ecological facts: deer population, recent hunting pressure, food conditions, and current valley stage. This keeps the joke connected to real simulation state.

### Stage 2 — Choose a response

| Choice | Immediate effect | Delayed effect |
|---|---|---|
| Reduce hunting | Lower food income or suspend one hunting spot briefly | Deer recovery and ecology improvement |
| Create a preserve | Spend wood or reputation to mark a preserve area | Better ecology, fewer nearby hunting opportunities |
| Ignore the parliament | No immediate cost | Possible deer pressure near farms or a follow-up gathering |
| Offer a symbolic treaty | Spend a small amount of food | No major ecology change, but grants a Chronicle joke and morale effect |

The symbolic treaty is optional. It exists to make the event funny without pretending that deer diplomacy is a real system.

### Stage 3 — Follow-up consequence

After several days, the valley responds using existing ecology rules. A successful response may produce fewer farm incursions, improved wildlife recovery, or a positive Chronicle entry. Ignoring the event may produce a harmless but visible complication, such as deer crossing a road, eating at the edge of a farm, or appearing outside the Town Hall.

The follow-up must not bypass ordinary ecology calculations. The event should adjust only a documented bounded modifier or use an existing hunting/preserve effect.

## Outcomes

### The treaty is accepted

The villagers claim that the deer have agreed to “continue negotiations.” The colony gains a small morale or Chronicle benefit, while ecology remains unchanged or improves slightly.

### The preserve works

The preserve improves ecological recovery and creates a visible memory in the Chronicle. The player pays an opportunity cost through reduced hunting or construction resources.

### The hunters compromise

Food production drops temporarily, but deer and ecology recover. This should be the clearest educational outcome for the player.

### The deer demand is ignored

The event produces a short-lived nuisance or humorous follow-up. The game should not punish the player with a hidden disaster; the player should understand the connection between pressure and consequence.

## Persistent state

The first version should use a bounded seasonal record:

```ts
interface DeerParliamentState {
  seasonKey: string;
  status: 'offered' | 'resolved' | 'follow_up';
  response?: 'reduce_hunting' | 'preserve' | 'ignore' | 'symbolic_treaty';
  startedDay: number;
  followUpDay?: number;
}
```

If the project already has an ecology-memory record, reuse it rather than adding a second record. The event should never add fields to individual deer.

## Visual presentation

The first prototype needs no new animal behavior. A notification, Chronicle entry, and optional camera focus on an existing deer cluster are sufficient. If a visual effect is added, it should be render-only and must not change movement or topology.

A future polish pass could show a small group of deer near a road with one slightly larger deer in front, but this should be achieved through existing entities and presentation data rather than a new entity type.

## Implementation sequence

1. Define the trigger from existing ecology and hunting metrics.
2. Add a deterministic seasonal gate and one active event record.
3. Present the ecological evidence before the choices.
4. Apply one bounded response effect through the existing ecology or hunting owner.
5. Schedule the follow-up at a daily boundary.
6. Write an event-log and Chronicle entry that clearly separates joke from simulation fact.
7. Add optional render-only focus or particles after the logic is stable.

## Tests

Test the minimum-day gate, one-time-per-save behavior, different seeded start windows across seeds, same-seed reproducibility, shared cooldown blocking and deferral, each trigger threshold, seasonal evidence, insufficient resources for a preserve, repeated responses, invalid choices, and follow-up timing. Confirm that the event cannot create multiple active records or restart after a seasonal boundary.

Add invariant tests proving that deer remain ordinary entities, their population fields remain valid, and no new per-tick scan or simulation owner is introduced. A seeded test must produce the same response eligibility from the same state.

## Acceptance criteria

The event is successful when the player understands why the deer gathered, sees a funny interpretation, makes a meaningful ecological choice, and can observe a bounded consequence through existing systems. The humor must not obscure the underlying ecological truth, and the event must occur only once at a seeded non-fixed time with safe spacing from other authored quests.

## Non-goals

Do not add talking animals, animal politics as a general faction system, deer jobs, a new animal diplomacy graph, or a new realtime behavior loop.

## Feature priority

| Priority | System | Purpose | First implementation |
|---|---|---|---|
| Must | Trigger, choices, ecology response | Make ecology visible and funny | One seasonal event |
| Should | Follow-up nuisance | Show consequence without a new system | One deer-road or farm-edge follow-up |
| Could | Visual “committee” presentation | Improve comedy and discoverability | Camera focus and small render effect |

## Independent random-event rules

This story is an optional independent event. It may appear in Sandbox mode, Tutorial mode, or any other normal colony when its own conditions are satisfied. It must not require a Campaign mode, a previous story, or completion of `tutorialCampaign.ts`.

The event should use a deterministic daily-boundary eligibility roll with a cooldown. Recommended start conditions are meaningful deer population, measurable hunting or grazing pressure, no competing major story card, and no repeat during the current season. The player may encounter this story early, late, or not at all in a given colony.

The primary implementation owner is a focused ecology-story function that reads existing deer, hunting, farm, and ecology state. It should apply only a bounded ecology or hunting effect and should not create a second ecology authority, a new deer faction, or a new simulation layer.

### Independent-event tests

Test eligibility from each ecological threshold, seasonal cooldown, duplicate prevention, save/load during the active event, deterministic trigger behavior, and operation without tutorial or Campaign state. Confirm that resolving the event does not unlock or require another story.
