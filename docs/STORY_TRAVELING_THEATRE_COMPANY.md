# Story Scenario: The Traveling Theatre Company

**Scenario type:** Randomized visitor story and temporary social quest  
**Recommended start:** After the colony has a Tavern, Hotel, or Town Hall and at least one recent Chronicle entry  
**Primary systems:** Visitor groups, performers, hotel/tavern, food, reputation, social impulses, event log, Valley Chronicle  
**Suggested implementation owner:** Extend the existing visitor/story pattern with a focused performer-story module.

## Design premise

A traveling theatre company arrives with costumes, scenery, and a dangerously incomplete understanding of the colony’s history. They want to perform a play about Wilderfolk, but the player must decide which version of history the valley will see.

The story creates humor from the difference between **what actually happened** and **what sounds good on stage**. The Chronicle stores the factual version; the performers create a temporary public version.

## Player fantasy

The player becomes the colony’s cultural director. The goal is not merely to house visitors, but to decide how the settlement remembers itself and how outsiders interpret it.

## One-time seeded start cadence

This story may start **at most once per save**. A performer group can still visit normally, but only one group may trigger this authored theatre story. Do not offer it before colony day 50, during another major story, during an active raid/disaster resolution, or while the shared authored-story cooldown is running.

At the existing daily visitor boundary, use a deterministic roll derived from the colony seed, visitor group ID, and `traveling_theatre_company` story key. The roll selects a randomized eligible arrival window rather than a fixed day shared by every game. The same save/seed and visitor history must reproduce the same decision; different seeds may start the story at different times.

Persist `theatre_story_offered` when the script-selection card is created. If the player cancels, refuses support, or the troupe leaves before opening night, the story remains consumed and cannot start again in that save. Keep the shared cooldown at least 21 colony days from other authored quest starts or resolutions so visitor arrivals do not create a story pile-up.

## Story sequence

### Stage 1 — Curtains at the gate

A performer group arrives through the existing visitor system. The leader offers three scripts based on recent real events:

| Play | Source material | Tone |
|---|---|---|
| “The First Winter” | Food, heating, survival, first-year records | Heroic and sincere |
| “The Great Wolf Mistake” | Wolf choice, ecology, hunting | Absurd and self-mocking |
| “The Scandal at the Town Hall” | Election, gossip, or relationship history | Risky and embarrassing |

The available scripts should be selected from actual world history. If the relevant event never happened, that script should not appear.

### Stage 2 — Build the production

The player chooses one support package:

- provide food and lodging;
- provide a venue and basic materials;
- allow the troupe to perform with whatever it has;
- cancel the show because the colony is under pressure.

The support package determines production quality and cost. A poor production is not a simple failure; it creates a different kind of comedy.

### Stage 3 — Opening night

The selected play is performed. Existing villagers receive short-lived social impulses toward the venue if a Tavern, Town Hall, or suitable building exists. The game need not simulate every spectator; a bounded event and a few nearby social reactions are sufficient.

The player receives a final response choice:

| Choice | Meaning |
|---|---|
| Correct the story | Preserve factual history and modest reputation |
| Let the legend grow | Gain visitor excitement and reputation, but create an exaggerated Chronicle note |
| Interrupt the performance | Avoid embarrassment, but lose the troupe’s goodwill |

## Example humorous outcomes

If the player selected “The Great Wolf Mistake” after thinning the wolf pack, the actors may portray the colony as heroic wolf slayers. The Chronicle remains factual: the pack was thinned and ecology declined. Villagers may proudly repeat the stage version while the ranger quietly disagrees.

If the player selected “The Scandal at the Town Hall,” an official may be portrayed as a heroic statesman when the actual event log records that they forgot the meeting. The player can allow the flattering version, correct it, or let the scandal spread.

If food was insufficient, the troupe can perform a shorter show called “The Tragedy of the Empty Pantry,” which gives the colony a small morale benefit but makes its food shortage visible to visitors.

## Outcomes

### A living legend

The selected history receives a Chronicle tag and a temporary reputation or visitor-interest bonus. The factual event is not overwritten.

### Honest history

The event is recorded plainly. The colony gains a smaller but more reliable reputation effect and a modest social benefit.

### A public embarrassment

The show damages reputation for a short period but increases gossip, social activity, or future performer visits. This should be a funny complication, not a punitive disaster.

### The troupe leaves offended

If the player cancels or refuses all support, the troupe leaves. The colony loses the opportunity but no permanent system is damaged.

## Persistent state

```ts
interface TheatreStoryState {
  status: 'offered' | 'preparing' | 'performed' | 'resolved';
  visitorGroupId: string;
  scriptId: 'first_winter' | 'wolf_mistake' | 'town_hall_scandal';
  supportId?: 'hospitality' | 'venue' | 'improvise' | 'cancel';
  performanceDay: number;
  outcome?: 'legend' | 'honest_history' | 'embarrassment' | 'cancelled';
}
```

Only one theatre story should be active at a time. The visitor group already supplies identity and lifespan; do not create a second performer population model.

## Trigger and cadence

Check at a daily boundary when a performer group arrives or when a performer camp is active. The scenario should be selected from real Chronicle or event-log evidence. Use deterministic selection based on the group ID and colony seed.

The event should be eligible only if there is an appropriate venue or if the player is allowed to stage an improvised outdoor performance. Do not force a building construction requirement for the first prototype.

## Implementation sequence

1. Add a story state linked to the existing performer visitor group.
2. Add a function that selects available scripts from factual event history.
3. Add support-cost validation and a delayed performance day.
4. Add a small venue presentation effect or notification; keep the simulation unchanged.
5. Add temporary social feedback and one Chronicle entry without replacing the factual record.
6. Add expiry handling when the visitor group leaves.
7. Add a development UI or story card for script selection and final response.

## Tests

Test the minimum-day gate, one-time-per-save behavior, different seeded arrival windows across seeds, same-seed reproducibility, shared cooldown blocking and deferral, script availability with and without the required historical events, each support package, insufficient resources, visitor departure before performance, duplicate event prevention, and the rule that the factual Chronicle is never overwritten.

Add a deterministic test proving that the same history and seed choose the same scripts. If visitor state is persisted, test save/load while the theatre story is in preparation.

## Acceptance criteria

A player can host one performance, understand which real event inspired it, choose how much support to provide, see a humorous but coherent result, and observe a bounded effect on reputation, social feedback, or visitor interest. The show must not create a new simulation authority or rewrite historical facts, and it must start only once at a seeded non-fixed time with safe spacing from other authored quests.

## Non-goals

Do not add a full theatre building, a general culture skill tree, voice acting, a permanent arts profession, or a procedurally generated dialogue engine in the first version.

## Feature priority

| Priority | System | Purpose | First implementation |
|---|---|---|---|
| Must | Script selection and performance outcome | Prove history can become content | Three scripts, one performer group |
| Should | Venue and social response | Make the event visible | One venue effect and temporary bubbles |
| Could | Repeated troupe repertoire | Improve replayability | New scripts from later Chronicle events |

## Independent random-event rules

This story is an optional independent event. It may appear whenever a performer visitor group arrives and its own venue, history, and cooldown conditions are satisfied. It must not require a Campaign mode, a previous story, or completion of `tutorialCampaign.ts`.

Recommended start conditions are an active performer group, at least one suitable venue or an allowed outdoor performance space, and at least one recent Chronicle or event-log entry that can inspire a script. A deterministic visitor/day roll should decide whether the story appears. It may occur in any season and should not repeat while another theatre story is active.

The primary implementation owner is a focused performer-story module that reads visitor, venue, event-log, reputation, and Chronicle state. It should delegate venue, resource, and social effects to existing owners rather than creating a culture subsystem.

### Independent-event tests

Test script availability with and without historical events, performer arrival and departure, cooldown, save/load during preparation, deterministic script selection, and operation without tutorial or Campaign state. Confirm that resolving the show does not unlock or require another story.
