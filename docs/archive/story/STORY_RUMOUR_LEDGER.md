# Story Scenario: The Rumour Ledger

**Scenario type:** One-time social simulation and evidence-based gossip story  
**Recommended start:** After the colony has a Town Hall and at least one relationship, election, scandal, ecology, or frontier event in its history  
**Primary systems:** Event log, relationships, friendships, feuds, scandals, Town Hall, reputation, dialogue, Valley Chronicle  
**Suggested implementation owner:** A bounded weekly social-story module that reads recent event-log records and writes one active rumour at a time.

## Design premise

The colony’s people do not experience history directly. They experience fragments, guesses, and conversations. During one selected colony week, a real event can become a rumour. The weekly boundary is only the evaluation cadence; the authored story can start at most once per save. The rumour may be accurate, exaggerated, or completely backwards.

The player can correct it, exploit it, or ignore it. The system turns existing simulation output into social interpretation without adding a second world-state authority.

## Player fantasy

The player is managing not only what happens, but **what people believe happened**. A successful harvest can become a heroic story, an ordinary reassignment can become a political accusation, and a failed raid can become a joke that improves morale—or a humiliation that emboldens a rival.

## Rumour sources

Select from recent event-log categories only. The first implementation should support five sources:

| Source event | Possible rumour |
|---|---|
| Birth or family event | “The child carries an unusually lucky bloodline.” |
| Election or Town Hall action | “The officials are hiding grain.” |
| Ecology or hunting change | “The wolves have chosen a new leader.” |
| Frontier loss or victory | “The rival settlement is afraid of our guards.” |
| Affair, scandal, or prison event | “The entire family is planning a coup.” |

The rumour generator should never invent a specific fact that the source event contradicts without labeling it as hearsay. The humor should come from exaggeration and social interpretation, not arbitrary randomness.

## One-time seeded start cadence

This story may start **at most once per save**. It is not a recurring weekly rumour system in the first version. The weekly boundary is only the evaluation owner for the one-time event. Do not offer it before colony day 60, while another major story is active, or while the shared authored-story cooldown is running.

Use a deterministic roll derived from the colony seed, the first eligible week key, and `rumour_ledger` to select a randomized start window. Different seeds may start the story in different weeks, while the same seed and event-log history produce the same result. If no eligible source event exists during the selected window, defer evaluation to a later weekly boundary without creating a fixed universal start day.

Persist `rumour_ledger_offered` and set it when the first rumour card is created. A corrected, encouraged, ignored, or expired rumour must still consume the one-time story slot. The shared cooldown should keep the story at least 14 colony days away from another authored quest start or resolution, with a longer 28-day cooldown after an encouraged rumour if that branch creates a social or diplomatic effect.

## Story sequence

### Stage 1 — Someone heard something

A Town Hall notice or social notification presents one rumour. It identifies the general source category but not necessarily the exact truth.

Example:

> “Several villagers insist that the failed raid was planned by the chickens. The chickens have declined to comment.”

The player can inspect the relevant Chronicle or event-log entry before choosing a response.

### Stage 2 — Choose a response

| Choice | Immediate cost | Potential effect |
|---|---:|---|
| Correct the record | Small reputation or Town Hall effort | Reduces rumour strength; improves trust |
| Encourage the rumour | None or a small resource cost | Temporary morale, intimidation, or visitor interest; increases future exaggeration |
| Ignore it | None | Rumour may fade or spread depending on social conditions |
| Investigate | Small official time cost | Reveals whether the rumour is mostly true, partly true, or false |

Only offer “investigate” when a staffed Town Hall, official, or appropriate social role exists. Do not turn the rumour into a detective minigame in the first version.

### Stage 3 — Social interpretation

After several days, the rumour resolves. A truthful or corrected rumour may become a Chronicle note. An encouraged rumour may grant a temporary social or diplomatic effect but also make future corrections more difficult. An ignored rumour may expire naturally or increase one bounded feud/friendship value.

The system should never modify every villager individually. It should apply a small colony-level modifier or affect one or two selected relationships when the source event provides clear participants.

## Example outcomes

### The rumour becomes local folklore

A harmless exaggeration is repeated and becomes a positive Chronicle memory. The event adds flavor without changing major simulation outcomes.

### The rumour is corrected

A Town Hall notice restores the factual version. Reputation improves slightly, but the correction consumes official attention.

### The rumour helps diplomacy

The player allows a rival-related exaggeration to spread. Rival confidence or raid timing changes slightly, but the colony gains a reputation penalty if the lie is exposed.

### The rumour causes a feud

A relationship-related rumour increases one existing feud or reduces one friendship. The effect is bounded and can decay. No new feud should be created solely because of a joke in the first prototype.

## Persistent state

```ts
interface RumourRecord {
  id: string;
  sourceEventId: string;
  sourceKind: 'family' | 'civic' | 'ecology' | 'frontier' | 'scandal';
  text: string;
  truthLevel: 'true' | 'exaggerated' | 'false';
  status: 'active' | 'corrected' | 'encouraged' | 'ignored' | 'expired';
  createdDay: number;
  expiresDay: number;
  subjectIds?: number[];
}
```

Keep only one active rumour in the first version. Store a small bounded history only if the Chronicle or debugging tools need it. Do not store per-settler gossip counters initially.

## Trigger and cadence

Generate at a weekly colony boundary using a deterministic seed derived from colony seed, absolute day, and the most recent eligible event. Do not use a full-population scan. If no eligible source event exists, no rumour is created.

The rumour should have a cooldown after resolution so the player is not shown a card every week. The cooldown should be longer after an encouraged rumour to prevent exploitation.

## Implementation sequence

1. Define a stable read-only event-log query for recent eligible events.
2. Add a deterministic rumour selector and text variant table.
3. Add one bounded `RumourRecord` to `WorldState` or a namespaced story-state object.
4. Add the Town Hall/social notification and inspect-source affordance.
5. Implement correct, encourage, ignore, and optional investigate responses.
6. Apply bounded effects to reputation, morale, one relationship, or rival stance.
7. Expire or resolve the rumour at a daily boundary.
8. Add Chronicle and event-log records that preserve both the rumour and the factual source.

## Tests

Test the minimum-day gate, one-time-per-save behavior, different seeded start windows across seeds, same-seed reproducibility, shared cooldown blocking and deferral, source-event selection, no-source behavior, weekly evaluation without repeated offers, deterministic text, each response, invalid choices, expiry, and subject cleanup when a referenced settler dies or leaves.

Add tests proving that the system never mutates the original event-log entry and never performs a full-population scan. If a subject relationship is affected, test that the effect is bounded and reversible or decays as specified.

## Acceptance criteria

The player sees a rumour grounded in something that actually happened, can inspect or influence its interpretation, and receives a visible but bounded consequence. The system must create emergent comedy without flooding the player with cards or rewriting simulation truth, and it must start only once at a seeded non-fixed time with safe spacing from other authored quests.

## Non-goals

Do not build a general natural-language generator, a full social network simulation, permanent colony-wide misinformation, or a second event log. Use authored text templates with deterministic parameters for the first version.

## Feature priority

| Priority | System | Purpose | First implementation |
|---|---|---|---|
| Must | Source selection and one rumour | Prove history creates social content | Five source kinds, four responses |
| Should | Inspect truth | Preserve player understanding | Link to source Chronicle/event |
| Could | Relationship-specific spread | Increase depth | Affect one existing friendship or feud |

## Independent random-event rules

This story is an optional independent event. It may appear in any normal colony when recent social, civic, ecological, family, frontier, or scandal history provides a suitable source. It must not require a Campaign mode, a previous story, or completion of `tutorialCampaign.ts`.

Recommended start conditions are a staffed Town Hall or another suitable civic/social context, at least one eligible recent event-log entry, one active-rumour cooldown, and no competing major story card. Generate at a weekly colony boundary using a deterministic seed. The player may encounter several different rumour subjects across a long game, but only one rumour should be active at a time.

The primary implementation owner is a bounded weekly social-story module that reads the event log and existing relationship state. It should write only one rumour record and delegate reputation, friendship, feud, scandal, or rival effects to their existing owners. It must not become a second social network or event log.

### Independent-event tests

Test source-event selection, no-source behavior, weekly cooldown, deterministic text, save/load during an active rumour, expiry, subject cleanup, and operation without tutorial or Campaign state. Confirm that resolving the rumour does not unlock or require another story.
