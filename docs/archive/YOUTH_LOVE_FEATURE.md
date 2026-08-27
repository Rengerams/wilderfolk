# Youth Love Feature Reference

**Feature status:** Implemented in Wilderfolk v0.6.2  
**Primary owner:** `src/game/simulation/humanRelationships.ts`  
**Decision cadence:** One bounded pass per new calendar day through `tickLayerDaily.ts`  
**Purpose:** Give settlers a first-love phase between childhood school bonds and adult courtship without creating a second marriage, pregnancy, housing, or workforce system.

> **Design intent:** Youth Love is a small, visible life story. It begins from proximity and school history, may end naturally, and can become established adult courtship only after both settlers are old enough. It is never a shortcut to marriage or parenthood.

## 1. Player-facing summary

Youth Love lets eligible teenage settlers form a mutual sweetheart relationship. Their school history can make the relationship more likely, and the pair can either grow apart or carry their connection into adult courtship. The feature adds life to the village while deliberately leaving adult systems in control of adult outcomes.

| Stage | What the player sees | What changes in simulation | What does **not** happen |
|---|---|---|---|
| **Potential first love** | Nearby teenagers may become sweethearts; a small heart effect and Chronicle event appear. | A reciprocal youth-love link and attachment progress begin. | No marriage, pregnancy, shared house, job change, or resource cost. |
| **Growing together** | The relationship continues quietly; school history makes it more resilient. | Daily attachment progress rises; a daily breakup check occurs. | No adult relationship state is set. |
| **Growing apart** | A grey **Moved on** notice and Chronicle event explain the result. | Both youth-love links and progress fields clear. | No divorce, penalty, scandal, or adult relationship side effect. |
| **Coming of age** | A heart effect and Chronicle entry report that the pair are growing up together. | At age 18 for both settlers, the pair enter the existing adult courtship path with carried progress. | They do not marry immediately. |
| **Adult future** | Existing adult courtship, marriage, household, conception, and family systems take over. | The established adult owner may later progress the courtship toward marriage. | Youth Love no longer owns the pair. |

## 2. Age timeline and system boundary

Youth Love fills the social space between school friendship and adult commitment. The age gates are explicit so the player can understand why a relationship can begin, persist, or transition.

| Age | Life phase | Youth Love behavior | Existing-system behavior |
|---:|---|---|---|
| 0–11 | Child | Not eligible. | Childhood, family, and school preparation systems apply. |
| 12–13 | Graduated child | Not eligible. School history still accumulates as a lasting record. | `isJuvenile` clears at age 12; education graduation can grant existing bonuses. |
| **14–15** | Early teenager | Can begin Youth Love if all other requirements are met. | No adult courtship, marriage, or adult household result is created by Youth Love. |
| **16–17** | Later teenager | Can begin or continue Youth Love. An existing Youth Love link blocks overlapping adult courtship. | The adult courtship system exists in the wider simulation, but it cannot overlap this youth link. |
| **18** | Adult transition | If both linked settlers are 18, the pair transfer once into adult courtship. If only one is 18, the youth link can persist while the other is still 14–17. | Marriage is now explicitly blocked until **both** courtship partners are at least 18. |
| 19+ | Adult | New Youth Love cannot start. A stale unpromoted youth link is cleared. | Adult courtship, marriage, housing, conception, and lifecycle owners apply normally. |

## 3. Start eligibility

A Youth Love start is not a global random pairing. Both settlers must satisfy the current implementation’s eligibility and local matching rules.

| Requirement | Rule in the current implementation | Reason |
|---|---|---|
| Colony settler | Must be a living player-controlled human, not a visitor, rival, or trade-caravan carrier. | Youth Love describes settlement life, not transient factions. |
| Age | Must be at least **14** and younger than **18** when the relationship begins. | Preserves a separate first-love phase before adult commitment. |
| Relationship status | Must be `single`, have no adult `partnerId`, and have no existing youth-love partner. | Prevents overlap with marriage and prevents multiple youth partners. |
| Pregnancy | Must not be pregnant. | Youth Love has no pregnancy outcome and does not overlap adult family state. |
| Prison | Must not be imprisoned. | Avoids creating a relationship while the settler is outside ordinary village social life. |
| Gender field | Both settlers must have a defined gender. | The current relationship schema requires a usable matching field. |
| Candidate gender | The current implementation matches candidates whose recorded gender differs. | This is the **current technical rule**, not a replacement for a future inclusive relationship-design decision. Changing it must be a deliberate relationship-system change with tests and player-facing design review. |
| Age gap | The pair may differ by no more than **2** years. | Keeps the youth phase locally and narratively bounded. |
| Distance | The candidate must be found within **150 world units**. | Keeps matching local and uses the existing social spatial query. |

### What “nearby” means

The daily owner uses the existing human social grid when available, with an array fallback in tests or low-grid contexts. It selects the nearest eligible local candidate, then allows only one deterministic member of the pair to perform the update. This avoids duplicate starts and avoids a full-population romance scan every tick.

## 4. School influence

School does not become a second romance system. The education owner remains responsible for attendance and `schoolDays`; Youth Love only **reads** that history when calculating affinity.

| Input | Calculation | Effect on Youth Love |
|---|---|---|
| Shared school history | `sharedDays = min(a.schoolDays, b.schoolDays)` | The pair’s weaker school record defines the shared history. |
| Attendance affinity | `min(1, sharedDays / 15)` | Fifteen school days reaches the full attendance contribution. |
| Childhood friendship | A mutual or one-sided entry in `childhoodFriendsIds` adds **0.35** affinity, capped at 1. | A remembered school friend is more likely to become a sweetheart and has a more stable relationship. |
| Final school affinity | `min(1, attendanceAffinity + friendshipBonus)` | Used in the start chance, daily progress, and breakup chance. |

The school constants used by the feature are already part of education progression.

| Education milestone | School days | Youth Love relevance |
|---|---:|---|
| Maturation boost begins | 3 | May give the child an existing education-related age boost; it does not directly create a romance effect. |
| Basic graduation tier | **15** | Reaches full attendance affinity for Youth Love. |
| Full education tier | 45 | Still improves education; Youth Love affinity remains capped at 1. |
| School capacity | 10 children per staffed school | Limits attendance through the existing school system, not the relationship owner. |

### Example affinity outcomes

| Pair history | Affinity | Daily start chance | Daily breakup chance while paired |
|---|---:|---:|---:|
| No recorded shared school days and no friendship | 0.00 | 0.05% | 0.03625% |
| 7–8 shared school days and no friendship | 0.50 | 0.10% | 0.02875% |
| 15 shared school days and no friendship | 1.00 | 0.15% | 0.02125% |
| 0 shared days but retained school friendship | 0.35 | 0.085% | 0.03100% |
| 10 shared days plus school friendship | 1.00, capped | 0.15% | 0.02125% |

These percentages are per **daily** evaluation, not per simulation tick. The feature uses the current constants `0.0005 + affinity × 0.001` for a start and `0.00025 × (1.45 − affinity × 0.6)` for a breakup. The code comment calibrates a well-supported relationship to roughly a 30% chance of ending naturally across four school years; this is a design target, not a promise about any one pair.

## 5. Daily lifecycle

The feature has one authoritative daily pass. It does not add a new tick layer and does not perform romance work in the render loop or UI.

| Order | Daily step | Owner action | Player-visible result |
|---:|---|---|---|
| 1 | Reconcile | Inspect every player settler with a youth-love link and clear malformed links. | Usually invisible; prevents broken relationship state from lingering. |
| 2 | Read existing pair | Let one canonical pair member process an existing mutual relationship. | Prevents double rolls, duplicate effects, and two different outcomes in one day. |
| 3 | Adult handoff | If both partners are at least 18, convert Youth Love into adult courtship. | Heart effect and “growing up together” Chronicle event. |
| 4 | Age protection | Clear a pair if either has fallen below age 14 or the link cannot remain valid. | No misleading relationship survives an invalid lifecycle transition. |
| 5 | Natural breakup | Roll a school-sensitive daily breakup check. | **Moved on** text and a Chronicle entry when it happens. |
| 6 | Attachment | Add daily progress of `0.55 + affinity × 0.75`, up to 100. | Internal continuity for the future adult handoff. |
| 7 | New matching | For eligible single teens, find a nearby valid candidate and roll the school-sensitive start chance. | Heart effect and “became sweethearts” Chronicle event on success. |

## 6. State model

The state is stored on each `Entity` so it travels with the existing world, worker snapshot, save, and transformation mechanisms. All three fields are optional for compatibility with entities created before the feature.

| Field | Type | Written by | Meaning | Cleared when |
|---|---|---|---|---|
| `youthLovePartnerId` | `number?` | Youth Love owner only | The other settler in the mutual youth relationship. | Breakup, invalid reconciliation, or adult handoff. |
| `youthLoveProgress` | `number?` | Youth Love owner only | Daily attachment score, bounded to 100. | Breakup, invalid reconciliation, or adult handoff. |
| `youthLoveStartedDay` | `number?` | Youth Love owner only | Absolute calendar day on which the pair began. | Breakup, invalid reconciliation, or adult handoff. |
| `courtshipPartnerId` | Existing `number?` | Existing adult courtship owner | Adult courtship partner after a successful handoff. | Existing adult relationship rules. |
| `courtshipProgress` | Existing `number?` | Existing adult courtship owner | Adult courtship progress; receives carried value at handoff. | Existing adult relationship rules. |

### Adult handoff calculation

When both partners reach 18, the owner clears every youth field on both settlers, then creates reciprocal adult courtship state. The carried progress is intentionally neither zero nor an immediate marriage.

| Input | Formula | Result |
|---|---|---|
| Shared youth attachment | `min(a.youthLoveProgress, b.youthLoveProgress)` | The weaker partner’s progress is used; a one-sided value cannot overstate the relationship. |
| Carried courtship progress | `round(sharedProgress × 0.7)` | Converts most, but not all, youth attachment into adult courtship. |
| Minimum carried value | `max(25, calculatedValue)` | A lasting youth relationship enters adult courtship with meaningful momentum. |
| Maximum carried value | `min(70, result)` | The handoff never reaches adult courtship completion by itself. |
| Marriage | Existing adult system only, after courtship and only if both are 18 or older. | Youth Love cannot cause an instant marriage. |

## 7. What Youth Love deliberately does not own

The feature creates a social link, not a broad family simulator. The following boundaries protect the single-source-of-truth architecture.

| Domain | Authoritative owner | Youth Love may do | Youth Love must not do |
|---|---|---|---|
| School attendance | `education.ts` | Read school days and childhood friendships. | Credit attendance, assign schools, or alter education progression. |
| Adult courtship and marriage | `humanRelationships.ts` adult path | Transfer a qualifying 18+ pair once into courtship. | Marry a couple directly or run parallel adult courtship. |
| Housing | `dayCycle.ts` and its residence helpers | Nothing. | Assign a shared home, move settlers, or change occupants. |
| Work and assignments | `workforce.ts` | Nothing. | Change jobs, workplaces, construction crews, or occupation. |
| Pregnancy and birth | `humanRelationships.ts` conception owner and `humanLifecycle.ts` | Nothing. | Start pregnancy, alter fertility, or create a child. |
| Dialogue | `humanChat.ts` and social feedback | Provide Chronicle/floating feedback at lifecycle moments. | Create a second chat-session lifecycle. |
| Events and rendering | Event logger and renderer | Emit normal visual/event feedback. | Mutate simulation state from the renderer or UI. |

## 8. Validity, cleanup, and edge cases

The owner reconciles first, because a mutual relationship state must never silently drift into an invalid combination.

| Situation | Reconciliation result | Why |
|---|---|---|
| Partner is dead or missing | Clear the remaining settler’s Youth Love fields. | A relationship cannot reference a non-living person. |
| Link is one-sided | Clear the malformed link during the daily owner pass. | Mutuality is a hard invariant. |
| Either settler is imprisoned | Clear both fields. | The pair is outside normal village social life. |
| Either settler becomes married or has an adult partner | Clear both fields. | Youth Love cannot overlap adult partnership. |
| Either relationship status is no longer `single` | Clear both fields. | Prevents overlap with adult relationship state. |
| Age gap becomes greater than two years | Clear both fields. | Keeps the youth relationship within its stated boundary. |
| One is 18 and one is 17 | Keep the valid youth link temporarily. | The pair can wait for the younger partner to reach 18; adult courtship remains blocked for the already-18 partner while the link exists. |
| Both reach 18 | Hand off to adult courtship. | The relationship gains an adult path without instant marriage. |
| One reaches 19 before handoff | Clear the stale youth link. | A youth state is never allowed to linger into ordinary adult life. |
| Moon Howler transformation | Preserve Youth Love fields in the temporary saved human-form record and restore them at dawn. | A temporary full-moon form must not erase personal history. |
| Existing old save/entity | Missing optional Youth Love fields mean no youth relationship. | Compatibility is safe at the entity-schema level. The project’s release policy may still require a new settlement across versions. |

## 9. Feedback and readability

Current feedback is intentionally light and event-driven. There is no dedicated Youth Love panel or permanent relationship HUD in the current build.

| Moment | In-world feedback | Chronicle feedback | Notes |
|---|---|---|---|
| New sweethearts | Seven small heart particles above the pair. | “`[Name] and [Name] became sweethearts`”. | Starts at the pair’s midpoint. |
| Daily progress | None. | None. | Prevents routine daily notification spam. |
| Breakup | Grey **Moved on** floating notice. | “`[Name] and [Name] grew apart`”. | No punishment, scandal, or public shame mechanic. |
| Adult handoff | Nine heart particles above the pair. | “`[Name] and [Name] are growing up together`”. | Courtship begins; marriage still requires existing adult progress. |

## 10. Performance design

Youth Love is designed to improve narrative density without returning to expensive per-tick global social simulation.

| Concern | Implementation choice | Effect |
|---|---|---|
| Cadence | One new-calendar-day pass. | No relationship scans every render frame or every simulation tick. |
| Matching | Existing local human social grid with a nearest-candidate query. | Avoids a repeated all-pairs search. |
| Pair processing | A deterministic pair leader performs each paired decision. | Avoids two starts, two breakups, or doubled progress. |
| State size | Three optional scalar fields per affected entity. | Small snapshot/save footprint. |
| Existing systems | Reads school history; delegates adulthood to adult courtship. | No duplicate manager, no extra scheduler, and no new tick layer. |
| Visual feedback | Short particles, floating text, and ordinary event log entries. | Player feedback without persistent heavy UI work. |

## 11. Invariants and diagnostic safety

The simulation invariant collector is read-only. It reports a malformed youth link rather than repairing it; the daily Youth Love owner performs repair at the correct cadence.

| Invariant | Required truth | Detection / repair |
|---|---|---|
| Mutual link | `a.youthLovePartnerId === b.id` and `b.youthLovePartnerId === a.id`. | Invariant collector reports one-sided links; daily owner clears them. |
| Living colony settlers | Both endpoints are valid living settler entities. | Missing or invalid endpoint is reported then cleared by the owner. |
| No adult overlap | A settler with Youth Love cannot also have an adult `partnerId`. | Invariant collector reports overlap; daily owner clears the youth link. |
| Youth-only scope | A Youth Love link exists only within its eligible age/lifecycle boundary. | Daily reconciliation and adult handoff enforce it. |
| Adult transition | Courtship begins only when both are 18; marriage remains a separate adult decision. | Youth Love test proves the handoff does not set marriage or adult `partnerId`. |

## 12. Automated coverage

`tests/youthLove.lifecycle.test.ts` provides focused deterministic coverage. It deliberately injects random values so tests prove branch behavior without depending on real random chance.

| Test scenario | What it proves |
|---|---|
| Age gate | Age 13 cannot begin Youth Love; age 14 can; a new age-18 start cannot occur. |
| School effect | The same daily roll that fails without school history succeeds after both teens reach 15 school days. |
| Natural breakup | An established pair can clear cleanly while both settlers remain single. |
| One-sided invariant | The invariant collector reports a malformed link without mutating the world. |
| Adult handoff | A lasting age-18 pair clears youth fields, gains reciprocal adult courtship, carries at least 25 progress, remains single, and has no adult partner yet. |

Related coverage should continue to run whenever this feature changes.

| Area | Relevant regression coverage |
|---|---|
| School friendships | `tests/school.bonds.test.ts` |
| Simulation invariants | `tests/simulation.invariants.test.ts` |
| Adult relationship diagnostics | `tests/relationshipDiagnostics.test.ts` |
| Moon Howler persistence | Moon Howler transformation/reversion tests and state snapshot checks |
| Worker authority | Full worker command/delta suite; any newly added Youth Love field must remain visible in worker snapshots and rollback state |

## 13. Extension rules

Future work may enrich Youth Love, but only if it preserves the current owner and boundaries.

| Proposed extension | Safe direction | Unsafe direction |
|---|---|---|
| More dialogue | Add category-tagged lines to the canonical split dialogue bank and invoke existing chat ownership. | Start a separate youth-chat timer or UI-owned dialogue state. |
| Friendship and rivalry | Read existing friendship, school, or social history during the daily owner pass. | Add a new all-settler relationship manager or hourly global scan. |
| Visible profile detail | Render a read-only relationship label from the authoritative snapshot. | Let a profile control write Youth Love state directly. |
| Inclusive matching policy | Define a deliberate compatibility and relationship-design policy, update eligibility tests, and explain it player-facing. | Quietly change one candidate filter without schema, balance, or test review. |
| Family milestones | Trigger an event from existing adult lifecycle transitions. | Make Youth Love create pregnancy, housing, or children. |
| Festival social boost | Apply a clearly declared multiplier through the daily owner, with tests and cooldown review. | Run repeated festival romance rolls in realtime. |

## 14. Player FAQ

| Question | Answer |
|---|---|
| Why are two 14-year-olds not sweethearts immediately? | Youth Love uses a small **daily** chance and requires a nearby valid candidate. School history improves the chance, but does not guarantee a result on a particular day. |
| Does a school guarantee a relationship? | No. School makes affection more likely by building attendance history and childhood friendships. It does not assign partners. |
| Why did a pair break up? | First loves have a small daily natural-breakup chance. Better shared school affinity lowers that chance, but does not remove it. |
| Why did a pair disappear at age 18? | If both were 18, they should have entered adult courtship. If the link was invalid, one-sided, too far apart in age, overlapped an adult relationship, or lingered beyond the youth boundary, it was safely cleared. |
| Are youth sweethearts married? | No. They remain single and have no adult partner until the existing adult courtship and marriage system decides otherwise. |
| Can Youth Love create a baby? | No. Pregnancy remains exclusively under the adult conception and lifecycle owners. |
| Does Youth Love take a house or a job slot? | No. It never changes housing, building occupants, jobs, resources, or construction. |
| Does a Moon Howler transformation erase it? | No. The temporary human-form snapshot preserves Youth Love fields and restores them after the transformation. |

## 15. Source map

| Concern | Source file |
|---|---|
| Youth Love constants, eligibility, reconciliation, breakup, and handoff | `src/game/simulation/humanRelationships.ts` |
| Daily schedule entry | `src/game/tickLayerDaily.ts` |
| School attendance and school-day constants | `src/game/education.ts` |
| Age ladder and age-18 marriage gate | `src/game/dayCycle.ts`, `src/game/humanTick.ts` |
| Persisted entity fields | `src/game/gameTypes.ts` |
| Moon Howler preservation | `src/game/moonHowler.ts` |
| Read-only integrity checks | `src/game/simulation/simulationInvariants.ts` |
| Focused tests | `tests/youthLove.lifecycle.test.ts` |
| Governing feature rules | `docs/SIMULATION_AUTHORITY.md` |

## References

1. [Simulation Authority](SIMULATION_AUTHORITY.md) — ownership, cadence, and Youth Love invariants.
2. [Simulation Depth Roadmap](SIMULATION_DEPTH_ROADMAP.md) — the broader family, school, and personal-story direction.
3. [Youth Love Lifecycle Test](../tests/youthLove.lifecycle.test.ts) — executable examples of the current behavior.
