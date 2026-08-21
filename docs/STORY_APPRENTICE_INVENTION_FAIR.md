# Story Scenario: The Apprentice’s Terrible Invention Fair

**Scenario type:** Annual workshop story, humorous experiment, and temporary systems challenge  
**Recommended start:** After at least one active apprenticeship and one completed workshop, forge, or research building  
**Primary systems:** Apprenticeships, workshops, research, resources, settler traits, jobs, event log, Valley Chronicle  
**Suggested implementation owner:** A focused annual story module that reads apprenticeship and workshop state; it should not become a general item-crafting system.

## Design premise

During one selected annual fair opportunity, apprentices present inventions intended to solve village problems. The fair is a one-time authored story per save, even though the world fiction can describe the fair as an annual tradition. Some are brilliant, some are useless, and some are technically successful in ways that nobody wanted. The player funds one experiment and lives with its consequences for a limited time.

The feature gives apprentices personality and gives the workshop economy a chance to produce surprising outcomes instead of only predictable resource conversion.

## Player fantasy

The player is the patron of a slightly underfunded frontier research culture. The player must decide which bad idea is worth trying because it might become a useful idea.

## Story sequence

### Stage 1 — The fair opens

At an annual boundary, a suitable apprentice presents three inventions. The invention list is selected from the apprentice’s master job, the colony’s current shortage, and the apprentice’s traits.

Example inventions:

| Invention | Possible benefit | Obvious risk |
|---|---|---|
| The Self-Counting Granary | Better food-ledger visibility | Consumes wood and occasionally counts the same sack twice |
| The Polite Gate | Small reputation or visitor benefit | Opens at the wrong social moments |
| The Emergency Bell | Faster disaster alerts | Rings for harmless events such as birthdays or fox sightings |
| The Overbuilt Plough | Temporary farm output increase | Increases worker fatigue or material consumption |
| The Automatic Laundry Line | Minor morale benefit | Requires repeated cloth or rope maintenance |

The first version should use three authored inventions, not a procedural item generator.

### Stage 2 — Choose an experiment

The player chooses one invention to fund, rejects all three, or asks for a safer redesign. The safer redesign costs extra resources and reduces the possible benefit.

| Choice | Result |
|---|---|
| Fund invention | Pay the listed cost and start a timed experiment |
| Reject the proposals | No cost; the apprentices gain a small disappointment event |
| Fund a safer redesign | Higher cost, lower benefit, lower risk |

The chosen invention must display its resource cost, expected duration, possible benefit, and known risk before confirmation.

### Stage 3 — The demonstration

After several days, the invention demonstrates its result. The outcome depends on the apprentice’s traits, the master’s job, the selected risk level, and whether the colony supported the experiment.

The experiment should create a temporary modifier or one small resource/event effect. It should not permanently rewrite the economy without a separate design decision.

### Stage 4 — Keep, improve, or dismantle

The player chooses whether to keep the invention active, improve it with another cost, or dismantle it. Dismantling returns part of the materials and ends the nuisance.

## Example outcomes

### Useful success

The invention provides a modest resource, research, or information benefit. The Chronicle records the apprentice and master by name.

### Useful failure

The device fails at its intended purpose but creates a different benefit. The “Emergency Bell” may not improve alerts but could improve festival attendance because everyone hears it.

### Comic malfunction

The device creates a harmless inconvenience. The gate opens for a fox, the granary announces an empty shelf that is full, or the laundry line becomes a village landmark.

### Dangerous failure

A rare failure costs materials, reduces worker energy, or creates a short-lived work disruption. It must be recoverable and clearly explained.

## Persistent state

```ts
interface InventionFairState {
  status: 'offered' | 'funded' | 'demonstrating' | 'active' | 'resolved';
  year: number;
  apprenticeId: number;
  masterId?: number;
  inventionId: 'granary_counter' | 'polite_gate' | 'emergency_bell' | 'overbuilt_plough';
  riskMode?: 'experimental' | 'safe';
  startedDay: number;
  resolveDay?: number;
  outcome?: 'success' | 'useful_failure' | 'malfunction' | 'dangerous_failure';
}
```

Keep one active invention. Any temporary modifier must have an explicit expiry day. Do not add a general inventory item unless the selected invention genuinely requires a persistent object.

## Trigger and cadence

Offer the fair once per colony year when at least one apprentice has accumulated enough teaching progress and a suitable master or workshop exists. Use the existing apprenticeship data rather than adding a second eligibility system.

Select the apprentice deterministically from eligible apprentices using colony seed and year. A player should be able to recognize why the selected apprentice is presenting the invention.

## One-time seeded start cadence

This story may start **at most once per save**. It must not be scheduled on a fixed day that repeats across every game. At the existing annual or daily story boundary, evaluate eligibility only after colony day 30 and only when no other major authored story is active. Use a deterministic seeded roll derived from the colony seed, current year, and the `invention_fair` story key. The roll selects a start window inside the eligible year rather than a universal start day.

Once the fair is offered, persist `invention_fair_offered` and never offer it again in the same save, even if the player rejects all inventions. The shared authored-story cooldown must block this story for at least 14 colony days after another quest starts or resolves, whichever contract the shared story owner defines. If the cooldown blocks the selected day, defer the roll to the next eligible boundary instead of forcing the event.

The implementation should use a namespaced story flag or typed one-time record for `eligible`, `offered`, `resolved`, and `offerDay`. It must use the existing seeded/random-authority helper and must not call unseeded `Math.random()`.

## Implementation sequence

1. Add an annual eligibility check at an existing daily/year-boundary owner.
2. Select an apprentice and authored invention definition deterministically.
3. Show an offer card with cost, duration, risk, and possible benefit.
4. Validate and deduct resources only when the player confirms funding.
5. Schedule the demonstration by absolute colony day.
6. Apply a bounded temporary effect through the owning domain system.
7. Add success, failure, and dismantle outcomes.
8. Record the apprentice, master, invention, and result in the event log and Chronicle.

## Tests

Test the minimum-day gate, one-time-per-save behavior, different seeded offer windows across seeds, same-seed reproducibility, shared cooldown blocking and deferral, apprentice eligibility, missing workshop behavior, insufficient resources, deterministic invention selection, funding and refusal, experiment expiry, all outcome branches, dismantling, and temporary-effect cleanup.

If the invention affects farms, alerts, resources, or fatigue, test the owning subsystem’s invariants and ensure the story module does not write those fields directly outside the appropriate transition.

## Acceptance criteria

The event is successful when an identifiable apprentice presents a comprehensible invention, the player knowingly accepts a risk, the result is funny but mechanically bounded, the colony can recover without a save repair or permanent hidden penalty, and the event starts only once at a seeded non-fixed time with adequate spacing from other authored quests.

## Non-goals

Do not add a general technology tree, random loot, permanent item inventory, uncontrolled physics, or a full crafting mini-game. The fair should be an authored story wrapper around existing workshop and apprenticeship systems.

## Feature priority

| Priority | System | Purpose | First implementation |
|---|---|---|---|
| Must | Annual offer and experiment | Prove apprentice-driven surprise | Three inventions, one selected |
| Should | Trait-aware outcome | Make settlers matter | One trait modifies one risk roll |
| Could | Persistent invention history | Build cultural memory | Chronicle list of notable failures |

## Independent random-event rules

This story is an optional independent event. It may appear in any normal colony when its own apprenticeship, workshop, and annual cooldown conditions are satisfied. It must not require a Campaign mode, a previous story, or completion of `tutorialCampaign.ts`.

Recommended start conditions are at least one active apprenticeship and one completed workshop, forge, or research building. The event should be eligible once per colony year, use a deterministic selection of an eligible apprentice, and be suppressed during a major disaster or another active story card.

The primary implementation owner is a focused annual story module that reads apprenticeship, workshop, research, resources, settler traits, and job state. It should delegate any resource, fatigue, farm, alert, or research effect to the existing domain owner. It must not become a general item-crafting system.

### Independent-event tests

Test annual cooldown, apprentice eligibility, missing workshop behavior, insufficient resources, deterministic invention selection, save/load during the experiment, temporary-effect cleanup, and operation without tutorial or Campaign state. Confirm that resolving the fair does not unlock or require another story.
