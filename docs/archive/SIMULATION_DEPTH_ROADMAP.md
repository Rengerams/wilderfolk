# Wilderfolk Simulation Depth Roadmap

**Status:** Proposed feature direction  
**Goal:** make the settlement generate more understandable, personal, and surprising stories without compromising the worker-authoritative simulation, its fixed cadence, or the “single owner per decision” rule.

> **Design rule:** add consequences and choices to systems that already exist before adding another broad manager. A feature is only worth adding when a player can notice it, understand why it happened, and make a meaningful response.

## Current foundation to build on

Wilderfolk already has more simulation material than a new system should duplicate: households, work and manual staffing, housing, school, weather consequences, beauty, trade, visitors, reputation, raids, quests, festivals, social chat, courtship, affairs, pregnancy, birth, leadership, wildlife, hunting, and a day/year calendar.

The highest-value improvements therefore connect these parts into **visible loops**. The player should see a condition, make a choice, and later observe a consequence.

| Existing foundation | Use it for | Avoid |
|---|---|---|
| Visitors, trade, reputation, quests | Requests, bargains, regional stories | A second generic event engine |
| Weather, food, storage, production | Seasonal preparation and recoverable crises | Random punishment with no preparation |
| Beauty, houses, tavern, festival | Neighborhood life and morale | A permanent hidden happiness tax |
| School, skills, workplaces | Apprenticeship and local expertise | Per-tick skill grinding |
| Courtship, families, gossip | Personal stories and civic consequences | A second relationship implementation |
| Wildlife, hunting, terrain | Ecological clues and expedition decisions | Pure invisible RNG depletion |
| Town Hall, leadership, election | Civic dilemmas and promises | A second leadership owner |

## The simulation pillars

The roadmap focuses on four player-facing pillars.

1. **A living village:** settlers have recognizable small ambitions, friendships, families, rivalries, and routines.
2. **A demanding frontier:** seasons, terrain, wildlife, and distance create problems that can be prepared for rather than merely endured.
3. **Meaningful civic choices:** the player trades one benefit for another and sees the human result.
4. **Regional stories:** visitors, caravans, camps, and expeditions make the valley feel connected to a wider world.

## Recommended feature backlog

| ID | Feature | Why it is fun | Primary owner/cadence | Performance posture | Risk |
|---|---|---|---|---|---|
| S1 | **Village Requests and Personal Projects** | Named settlers ask for a practical, social, or civic response; each resolution creates a small story | `groupEvents.ts` / daily or season start | Generate at most one or two active requests; no realtime population scan | Low–medium |
| S2 | **Seasonal Preparation** | Winter stores, fuel, repairs, and preserved food turn the calendar into planning | Daily economy/season owner | One daily ledger evaluation; clear forecast UI | Medium |
| S3 | **Apprenticeship and Mastery** | A child or novice learns from a skilled worker, producing recognizable specialists | School/workforce/skill owner; daily progress | Pair only assigned apprentices; no global matching every tick | Medium |
| S4 | **Neighborhood Stories** | Beauty, crowding, tavern, lamps, and nearby families influence where leisure happens and what locals talk about | Social feedback owner; staggered social | Spatial-grid local queries only | Medium |
| S5 | **Expeditions and Frontier Camps** | Send a small named group to hunt, salvage, map, or escort; choose risk/reward | `groupEvents.ts` / daily event resolution | Abstract travel state; no off-map entity simulation | Medium |
| S6 | **Ecology Signals and Migration** | Wildlife scarcity, tracks, damaged crops, and predator pressure become legible rather than “RNG” | Ecology/system owner; daily/system | Existing wildlife data, bounded regional counters | Medium |
| S7 | **Civic Dilemmas** | The player decides how the village handles refugees, trade terms, justice, defense, or a bad harvest | Town Hall/group events/leadership; player command + daily resolve | One active decision card; deterministic outcome ledger | Medium |
| S8 | **Festival Roles and Results** | Festivals become distinct: harvest fair, memorial, election feast, hunter’s rite | Festival lifecycle owner; active festival window | Existing gathering behavior; small event summary | Low |
| S9 | **Family and Household Milestones** | Coming of age, bereavement, adoption, reunion, and inheritance make lineages memorable | Lifecycle + relationship owners, event notification only | Trigger from existing state transitions; no polling loop | Medium–high |
| S10 | **Settlement Character / Traditions** | Repeated player choices establish traditions such as hospitable, hardy, scholarly, mercantile, or martial | New declared culture decision; seasonal aggregation | Sparse seasonal counters, not per-settler traits | High |

## Priority order

The most valuable work is not the largest system. The order below starts with features that reveal existing simulation, then adds depth with bounded state and clear player choices.

| Priority | Work | Player value | Engineering cost | Why now |
|---:|---|---|---|---|
| 0 | Lifecycle golden contracts and worker/browser integration coverage | Trust | Low–medium | New content is only enjoyable if births, commands, and worker authority remain reliable. |
| 1 | **S1 — Village Requests and Personal Projects** | Very high | Medium | Gives named settlers and existing resources immediate narrative meaning. |
| 2 | **S8 — Festival Roles and Results** | High | Low | The festival gathering behavior already exists; this makes it feel intentional and memorable. |
| 3 | **S2 — Seasonal Preparation** | Very high | Medium | Turns weather and economy into planning rather than background modifiers. |
| 4 | **S6 — Ecology Signals and Migration** | High | Medium | Makes hunting and nature fairer and more readable. |
| 5 | **S3 — Apprenticeship and Mastery** | High | Medium | Connects school, family, work, and long-term village identity. |
| 6 | **S5 — Expeditions and Frontier Camps** | High | Medium | Adds exploration without adding a second map simulation. |
| 7 | S4, S7, S9 | Medium–high | Medium | Add once the core daily-life feedback loops are proven. |
| 8 | S10 | High | High | Strong long-term identity system, but it needs stable outcomes and UI explanation first. |

## First bounded objective: S1 — Village Requests and Personal Projects

This is the recommended next fun simulation feature.

### Player experience

Once in a while, a named settler, household, or small group brings a request. The request must be caused by current game state, not arbitrary flavor text. The player sees who wants help, why it matters now, the cost, and the likely trade-off.

| Situation | Trigger from existing state | Example player choice | Possible result |
|---|---|---|---|
| Hunter’s concern | Wolves are near or game is scarce | Fund a hunt, build protection, or decline | Food/pelts, safety, injury risk, reputation |
| Crowded household | Households are homeless or cramped | Prioritize a house, offer Town Hall aid, or defer | Relationship/beauty/reputation effect; no hidden eviction |
| Apprentice request | School exists and a workplace has a skilled adult | Assign an apprentice, pay materials, or wait | Future skill progress or a small current output cost |
| Festival proposal | Festival date is approaching and food/beauty are sufficient | Sponsor a feast, keep it modest, or cancel | Mood/reputation/social feedback with visible resource cost |
| Visitor bargain | A visitor has a matching need or supply | Trade now, make a promise, or refuse | Real goods/gold transfer and future visitor/reputation consequence |

### Ownership and cadence contract

| Contract item | Decision |
|---|---|
| Owner | Extend the existing `groupEvents.ts` / visitor-quest event domain; do not create a competing event manager. |
| Generation cadence | Daily gate or season boundary only. Generate at most one active request and use cooldowns. |
| Resolution cadence | Player command validates the chosen option; daily owner applies deferred result when due. |
| State | One explicit active-request record, event history, cooldowns, and existing resource/reputation fields. |
| UI | A read-only card renders the snapshot; clicking an option sends one typed command. |
| Performance | Bounded candidate shortlist; use existing data/nearby relationships; no repeated full-population scans. |
| Failure behavior | If prerequisites disappear, resolve visibly as expired/withdrawn—never silently mutate resources or people. |

### Required proof before implementation

1. Write the feature owner row and state fields before coding.
2. Create a design note with request types, cooldowns, prerequisite conditions, and a deterministic seeded test table.
3. Add a bug report if an existing event/visitor rule must be corrected during implementation.
4. Test one request per type for generation, deduplication, command validation, payout/cost, cancellation, save/load, and worker/main-thread parity.
5. Record event frequency per 30 days and p50/p95 tick cost at the agreed population tiers.

## Feature rules that preserve the feel

- **Never make a new feature only a number modifier.** Every effect must have a visible scene, event log entry, card, floating text, or changed routine.
- **Avoid surprise punishment.** A drought, predator problem, or family concern should have a readable precursor and at least one reasonable response.
- **Use sparse decisions.** One strong seasonal or daily story is better than twenty generic notifications.
- **Keep personal systems low-cost.** Nearby social feedback stays staggered and spatial; broad decisions stay daily or seasonal.
- **Reuse existing owners.** A request involving pregnancy does not create pregnancy; it only asks the player to respond to existing household conditions.
- **Separate visual and simulation work.** A festival banner, smoke plume, road decal, or dialogue line must be derived from the render snapshot, not become a second state mutation path.

## What to avoid

Do not add a broad “life simulation manager” that owns social, work, needs, ecology, festivals, and events. That would recreate the earlier ownership problem in one large file.

Do not add individual hourly needs, personality rolls, or relationship checks for every settler if a daily/seasonal aggregation would make the same player-visible story. The game should feel alive because relevant moments are surfaced—not because it spends more CPU calculating invisible detail.

Do not add permanent stat decay simply to make decisions feel meaningful. Prefer recoverable problems, clear trade-offs, and durable stories over busywork.

## Success criteria for the roadmap

A good new simulation feature should let a player say:

> “I saw why this happened, I decided what to do, and later I saw the village change because of it.”

If a proposed feature cannot meet that sentence, it should remain a design note rather than enter the realtime simulation.
