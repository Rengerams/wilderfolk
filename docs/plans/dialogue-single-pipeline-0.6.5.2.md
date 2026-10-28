# Wilderfolk — Dialogue single-pipeline architecture (0.6.5.2)

**Status:** IMPLEMENTED ON PR #93 BRANCH (phases A–D); final standard CI and merge acceptance pending. **Baseline reviewed:** main, 28 October 2026. **Target:** 0.6.5.2.  
**Companion execution plan:** [Dialogue codebot tasks](dialogue-codebot-tasks-0.6.5.2.md).  
**Template:** [CODEBOT_FEATURE_TEMPLATE](CODEBOT_FEATURE_TEMPLATE.md). **Comparable precedent:** [DNA/personality/career architecture](personality-career-single-pipeline-0.6.5.2.md) and its coding-agent tasks.  
**Authority:** `AGENTS.md`, `docs/command.md`, `OWNERSHIP_OVERVIEW.md`, `src/game/simulation/decisionRegistry.ts`. The architecture is implemented on PR #93; release completion requires final checks and merge, and PR #91 overlay integration remains a separate follow-up.


**PR #93 implementation evidence (28 October 2026):** Canonical JSON bank, exact eventKey+mode request gateway, one humanChat session writer, migrated domain triggers, shared worker bank and old-save reclaim logic are present. The unused category-wide `pickDialogueTree` selector was removed. Regression suites now include bank integrity, session modes, domain routing, real save/load recovery, legacy Elections quarantine and an indexed lookup p50/p95 microbenchmark. These are implementation facts, not a claim of final CI or historic before/after performance parity.

**Acceptance hardening on PR #93 (28 October 2026):** The PR now adds a real 120-day seeded bot-driven producer gate instead of restoring 360-day CI, immediate paired-session interruption cleanup in the sole `humanChat` writer, all-speaker participation for six-to-ten-person Spotlight casts, direct hospital/Town Hall handler regressions and serialized bank plus paired save/load tests. These are committed changes, **not** evidence of a passing final full CI, real Worker-thread transport, or a completed PR #91 overlay hookup.

**Typed/immutable contract hardening (PR #93, 28 October 2026):** `DialogueEventKey` is now the explicit 94-key authored union, including context-specific social and visitor outcomes. `DialogueTree` requires eventKey and discriminated solo/pair modes; both source compilation and worker payload installation validate keys, freeze the canonical bank and all tree/line/speaker arrays, and index by exact eventKey plus mode. Domain event conditions remain where they were; an explicit treeId must belong to that key and mode or the speech request is refused. Existing worker module initialization installs `canonicalDialogueBank`, while App preloads the same sources; all-tree serialized parity tests are added. Actual browser Worker-thread transport and final CI remain pending. Spotlight overlay hookup stays deferred to PR #91.

**Intentional content exception:** All ten `Elections.json` IDs already exist in `needs.json`, but all ten authorings differ in lines or speaker metadata. The historical file remains unimported and intact; explicit source tests and a source guard enforce this quarantine. Deleting or silently remapping it would lose content or change live dialogue probabilities.

## 0. Contract, problem, scope

| Dimension | Decision |
| --- | --- |
| Player result | Ambient chatter and event-specific one-/two-person scenes use authored, context-correct dialogue trees through one runtime pipeline. |
| Request | Remove legacy, hardcoded speech from TypeScript; create scenes for each real event type and route all speech through `dialogueTrees.ts`. |
| Main orchestration owner (target) | `src/game/dialogueTrees.ts`: bank, validation, event-key routing, choice, speech request and tick orchestration. |
| Only runtime mutation owner (target) | `src/game/humanChat.ts`: session lifecycle and writes to existing entity chat fields; no authored lines, context policy or bank lookup. |
| Event trigger owners | Remain in their existing domain files; dialogue never decides whether an election, marriage, illness, hospital treatment or hunt occurs. |
| Persistence | No new persisted fields proposed. Existing `Entity.chatPhrase`, `chatTicks`, `chatPartnerId` and `chatDialogueSessionKey` and their current transport/reset semantics must be audited and retained or migrated in the same PR as a change. |
| Non-goals | Rewrite event decisions, alter event probabilities, add gameplay rewards, add generic event managers, persist conversation histories, alter Chronicle logging, implement language generation/LLMs or invent new game events. |
| Delivery | Phases A→B→C→D are implemented together in PR #93 rather than four merges; final acceptance still requires an integrated, passing standard suite. |

**Problem.** JSON dialogue trees exist but are only one of several paths producing speech bubbles. TypeScript files also embed literal speech, choose text locally, or write chat fields directly. Existing broad categories mix unrelated events, and three authored event files are not part of the loaded bank. That creates duplicated text ownership, role mismatch, context drift, and inconsistent session interruption/duration. The goal is *one authoritative speech-request entrypoint*, not a second event simulator.

**Solution.** `dialogueTrees.ts` becomes the only public entrypoint for **starting or ticking spoken content**. Domain owners emit typed scene requests after their own real gates. A compiled, validated event-key/mode index selects a matching JSON tree. `humanChat.ts` executes the selected session and remains the sole entity-chat writer. Rendering remains a read-only consumer. No parallel speech writer, duplicate content bank or new scheduler.

**Done means:** every production TS-origin speech line has a JSON scene; no direct production writes to `chatPhrase`/`chatTicks` outside the sole runtime writer; no production `sayHumanChatPhrase` calls; event keys select context-appropriate solo/paired scenes; existing events/cadences remain valid; worker/main/save transitions pass; deterministic and bounded performance is verified.

### 0.1 Protected invariants

- Simulator remains open-ended. Dialogue does not affect story outcomes, elections, relationships, pregnancy, medical results, raids, visitor policy or economy. No automatic moral framing.
- Domain owners keep *eligibility* and *when to request*: `townHall` aid/petition, `villageLeadership` election, `renffrStar` omen, `socialLife` greeting/shift, `hospitalCare` treatment, etc. Dialogue may reject a request only for speech-level reasons (absent data, inappropriate speaker mode, busy, ineligible talker presentation, lifecycle).
- Preserve exact single-sided/both-partner busy rules, orphan reclaim, Moon Howler release, dead entity cleanup and sleep suppression. A scripted scene may continue at night; ordinary ambient chatter must not wake a sleeping resident.
- Preserve visible speech-bubble rendering, wrapping, role mapping, durations in game hours, worker-render metadata and deterministic same-seed behavior.
- Existing `WorldState.eventLog`, big news, notification, story-card narration and UI labels are **not speech bubbles**. Do not migrate or delete these textual systems; canonical game events continue logging through their current owners.

## 1. Evidence ledger — verified AS-IS on main

| Existing responsibility | Real owner and entrypoint | Real scheduling/input | Today |
| --- | --- | --- | --- |
| Split bank | `src/game/dialogueTrees.ts`: `buildCanonicalDialogueBank`, `indexDialogueBank`, `pickDialogueTree`, `getDialogueTreeById` | Static seven JSON imports, eager bundle install; preload at boot and worker | Category-indexed banks, broad context map and weather/food/festival expansion; no specific event key. |
| Sessions/display | `src/game/humanChat.ts`: `maybeDialogueChat`, `startDialogueTreeChat`, `tickHumanChat`, `sayHumanChatPhrase`, `releaseDialogueSession`, `cleanupEntityDialogueState` | Human realtime ticking + forced speech from domain owners | In-memory Map keyed by pair/solo; maps tree ID, step and speaker IDs; owner of `Entity` speech fields. Contains hardcoded fallback phrases and 24-tick legacy-duration conversion. |
| Ambient caller | `src/game/humanTick.ts`; `src/game/simulation/humanSocial.ts` | Realtime human tick; optional staggered adaptive-neighbour query | Selects context, possible partner, calls `simSettlerChat`/`simSettlerPairChat` and `tryAmbientRandomDialogue`. Pair initiates from lower entity ID. |
| Social/busy | `src/game/socialLife.ts`: `pickSocialImpulse`, `tryWorkplaceBanter`, `tryNeighborGreeting` | Motive, time, proximity and shift gates | Returns `bubble?: string` and embeds greeting/banter literals; calls `sayHumanChatPhrase` for one or two participants. |
| Leisure/hunting | `humanLeisureBehavior.ts`, `humanHuntingBehavior.ts` | Child play, motives, wildlife circumstances | Embed play, illness and hunting remarks; emit via `sayHumanChatPhrase`. |
| Civic, health, lodging | `townHall.ts`, `hospitalCare.ts`, `hotelStay.ts` | Petition/audience, treatment and guest/service triggers | Embed response lines and durations, call `sayHumanChatPhrase`. |
| Leadership/omens/family | `villageLeadership.ts` (`pickElectionGossipPhrase`, `tickElectionGossip`); `renffrStar.ts` (`RENFFR_OMEN_LINES`, `beginRenffrSettlerChatter`); `simulation/humanRelationships.ts` (wedding) | Election phases; star omen; marriage outcome | Independently choose forced lines; these bypass tree selection. |
| Visitors/performers | `factionWander.ts`: `maybeArriveFlavor` and performer idle branch | Visitor POI arrival / performer wandering | Holds a TS dictionary of ~20 POI speech pools; writes `entity.chatPhrase` and `chatTicks` **directly**, bypassing session owner. |
| Cleanup/reset/transport | `moonHowler.ts`, `humanLifecycleCleanup.ts`, `renderer.ts`, `simWorker/gameWorker.ts`, `simBuffers/entityRenderMeta.ts` | Transformation, death, session swap, worker startup, rendering | Runtime session release and reset; worker installs canonical bundle; render metadata carries bubble text/duration. |
| Documentation | `OWNERSHIP_OVERVIEW.md` rows “Ambient chat and dialogue sessions”, “Dialogue bank load and tree lookup”; `simulation/decisionRegistry.ts` social entry | Current authoritative registration | Two separate owners today (content vs runtime); target keeps this distinct *responsibility* split, but makes selection/request one public path. |

### 1.1 Actual current control flow

~~~text
gameTick → realtime humanTick
  ├─ humanSocial neighbour search / ambient pair-or-solo
  │     → humanChat.maybeDialogueChat → dialogueTrees.pickDialogueTree(category)
  │     → humanChat.startDialogueTreeChat → chatPhrase/chatTicks/session
  ├─ socialLife / leisure / hunting / hospital / hotel / townHall / election /
  │  renffrStar / marriage → humanChat.sayHumanChatPhrase(LITERAL IN TS)
  │     → chatPhrase/chatTicks (+ may interrupt a paired session)
  └─ factionWander arrival / performers → DIRECT entity.chatPhrase/chatTicks assignment

humanTick → humanChat.tickHumanChat (advance and orphan reclaim)
renderer → chatPhrase/chatTicks via render metadata → canvas bubble
renderer.resetRendererCaches → humanChat.resetDialogueSessions
worker bootstrap → installDialogueBankPayload(canonicalDialogueBank)
~~~

The text *content* has multiple owners and forced one-off lines can interrupt session pairs. `humanChat` is the main writer except the `factionWander` bypass. The current `pickDialogueTree` combines broad categories into a newly allocated pool; a `courtship` or `visitor` request mapped to `social` may receive unrelated social content. Every currently loaded bank tree has two speaker roles, but solo entrypoints can play both roles through one person.

### 1.2 Data audit — confirmed content inventory

At this snapshot the seven **imported** files contain 115 trees: `chaos.json` 13, `environment.json` 10, `existential.json` 12, `festival.json` 6, `needs.json` 26, `social.json` 32, `work.json` 16. These have two speaker roles and internally matching file/tree categories.

Also present but **not imported by `dialogueTrees.ts`**:

| File | Trees | Actual issue and required treatment |
| --- | ---: | --- |
| `src/game/data/Family.json` | 12 | Category `family` is unsupported by present seven-category union; contains 3 one-speaker scenes. Normalize as `social` *category* with `family.*` *event keys*, retaining authored lines/roles. |
| `src/game/data/Famine.json` | 4 | Category `famine` unsupported; contains 2 one-speaker scenes. Normalize as `needs` with `famine.*` event keys. |
| `src/game/data/pregnancy.json` | 15 | Category `pregnancy` unsupported; contains 4 one-speaker scenes. Normalize as `needs`/`social` as appropriate with `pregnancy.*` event keys; preserve whether each is one- or two-way. |
| `src/game/data/Elections.json` | 10 | Despite its filename, metadata category is `needs`; all ten IDs duplicate `needs.json`. **Do not import.** Compare actual contents before retiring; never discard unique text merely on filename assumptions. |

**Do not flatten one-speaker authored trees into two-speaker dummy dialogue.** Current `DialogueTree.speakers` is typed as exactly two roles and must be upgraded through a validated discriminated solo/pair schema. Check all JSON IDs, every line's speaker reference, unique ownership across files, mode, tags and placeholders before importing.

### 1.3 Current protected behavior and tests

| Contract | Existing evidence | Rule |
| --- | --- | --- |
| Busy includes idle half of an active pair | `tests/socialLife.dialogueBusy.test.ts`, `tests/dialogueBusy.forcedLineGates.test.ts` | Keep. |
| Save/load/reset orphan cleanup and transformation | `tests/pairDialogue.orphanReclaim.test.ts`, `moonHowler.ts`, `humanLifecycleCleanup.ts` | Keep no stranded partners. |
| Dialogue time scale and bubble layout | `tests/humanChat.duration.test.ts`, `tests/humanChat.sleepAtHome.test.ts`, `renderer/overheadLayout.ts` | Convert away legacy unit constants without changing intended observable hours; test clock migration. |
| Ambient partner determinism | `tests/humanChat.ambientPairing.test.ts`, `simulation/humanSocial.ts` ID-tier ordering | Preserve preferred kin/partner/coworker bias, stable ordering, low-ID pair dedup. |
| Worker content parity | `simWorker/gameWorker.ts` plus `App.tsx` preload | Same canonical compiled data in worker, main and headless; not multiple mutable banks. |
| Existing event log/rewards | Domain event writers and `eventLog.ts` | Speech must never re-execute an event or duplicate Chronicle entries. |

Measured runtime cost: **NOT MEASURED** in this planning pass. A codebot must measure before claiming an improvement.

## 2. TO-BE architecture — one dialogue orchestration path

~~~text
KEEP: existing domain event / human realtime pulse
  ├─ socialLife, election, hospital, hotel, visitor, pregnancy, famine, etc.
  └─ their OWN original guards, cadence, outcomes and RNG gates
                  |
                  v
MODIFY: typed request with exact DialogueEventKey + entity IDs/references
                  |
                  v
MODIFY: dialogueTrees.ts [SINGLE PUBLIC SPEECH ENTRYPOINT]
  ├─ immutable canonical JSON bank; validate unique IDs, modes, roles, event keys
  ├─ eventKey + solo/paired + optional *relevant* narrow context indexes
  ├─ deterministic selection using existing simRng convention
  ├─ speech-level priority/busy/sleep and forced-interrupt policy
  └─ requestDialogue / tickDialogue / release-or-reset orchestration
                  |
                  v
MODIFY: humanChat.ts [SOLE CHAT STATE WRITER, INTERNAL RUNTIME]
  ├─ start/advance/end session and paired orphan reclamation
  ├─ format/assign chosen line, speaker and duration
  └─ mutate EXISTING Entity chat fields, NEVER domain outcomes
                  |
                  v
KEEP: existing sim delta/render metadata → renderer bubble
      existing eventLog/notifications remain domain-owned and separate
~~~

**No runtime import cycle:** `dialogueTrees.ts` may import the session runtime. `humanChat.ts` must cease runtime-importing `dialogueTrees.ts`. It can receive a selected immutable tree and keep its reference in its *unsaved* session record, or accept an explicit lookup supplied by the orchestrator; choose the simpler verified implementation. Type-only imports are permitted only if strict cycle tests accept them. No new `DialogueManager` or second dispatcher.

### 2.1 Module and mutation ownership

| Module | Action | Unique responsibility | Writes |
| --- | --- | --- | --- |
| `src/game/dialogueTrees.ts` | **MODIFY** | Canonical bank compilation, event/mode validation and indexed selection; typed `requestDialogue` and `tickDialogue` entrypoints; explicit lifecycle orchestration. | No game outcome state; calls sole chat runtime for speech fields. In-memory immutable indexes only. |
| `src/game/humanChat.ts` | **MODIFY, retain** | Lower-level session key/step lifecycle, busy predicate, orphan cleanup, line formatting and timer; **zero story dialogue text**. Called for writes solely by orchestrator (including lifecycle reset/cleanup). | `chatPhrase`, `chatTicks`, `chatPartnerId`, `chatDialogueSessionKey` and private in-memory session Map. |
| `src/game/data/{existing seven}.json` | **KEEP/EDIT ONLY WHEN NEEDED** | Broad ambient content; remain source of canonical material, not fallback TS arrays. | None. |
| `src/game/data/dialogue/<event>.json` | **NEW as required** | Event-specific scenes, validated and imported exactly once by `dialogueTrees.ts`. E.g. `election`, `renffr`, `family`, `famine`, `pregnancy`, `workplace`, `neighbor`, `child-play`, `hunting`, `hospital`, `hotel`, `town-hall`, `visitor`, `marriage`, `social-impulse`. Create only for real identified triggers; combine related event *keys* inside one domain JSON where sensible. | None. |
| `src/game/simulation/humanSocial.ts` | **KEEP neighbour selection / MODIFY forwarding** | Adaptive spatial discovery, partner priority, lower-ID pair gating. No text composition. | None of the chat fields. |
| Existing event owners | **MODIFY speech sites** | Keep actual event, probability, consequences, state mutation; send typed event requests instead of lines. | Their original domain fields only. |
| `src/game/simBuffers/entityRenderMeta.ts` / renderer | **KEEP** | Transport and read-only drawing of current chat fields. | No chat state. |
| `src/game/simWorker/gameWorker.ts` / `src/App.tsx` | **KEEP/MODIFY if necessary** | Compile identical bundle for all execution modes. | No duplicated dialogue bank. |

**Important:** “`dialogueTrees.ts` is the main orchestrator” means **speech** orchestration only. It must not own `WorldState` scheduling, source-event eligibility, event-log mutations, economics or relationships. `humanChat.ts` remains a focused executor rather than a competing second selector.

### 2.2 Data/selection contract (implemented contract; abbreviated illustrative API)

~~~ts
type DialogueMode = 'solo' | 'pair';
type DialogueEventKey =
  | 'ambient.social' | 'ambient.home' | 'ambient.courtship'
  | 'ambient.work' | 'ambient.visitor' | 'ambient.rival'
  | 'ambient.hunt' | 'ambient.child' | 'ambient.school'
  | 'ambient.pregnancy' | 'ambient.affair' | 'ambient.sleep'
  | 'ambient.renffr' | 'ambient.fear' | 'ambient.winter'
  | 'ambient.festival' | 'ambient.guard' | 'ambient.food'
  | 'ambient.election'
  | 'family.daily' | 'famine.hunger' | 'pregnancy.daily'
  | 'workplace.banter' | 'neighbor.greeting' | 'child.play'
  | 'social.impulse' | 'hunting.shortage'
  | 'visitor.poi' | 'visitor.performer'
  | 'hotel.arrival' | 'hotel.service'
  | 'hospital.patient' | 'hospital.doctor'
  | 'townHall.foodAid' | 'townHall.petition' | 'townHall.audience'
  | 'townHall.goldAid' | 'townHall.official'
  | 'election.buildup' | 'election.ceremony'
  | 'election.tension' | 'election.winner'
  | 'renffr.omen' | 'marriage.accepted';
  // Expand only for a verified real trigger; audit distinct subevents.

type DialogueTree =
  | { id: string; category: DialogueCategory; eventKey: DialogueEventKey;
      mode: 'solo'; speakers: readonly [string]; lines: readonly DialogueLine[] }
  | { id: string; category: DialogueCategory; eventKey: DialogueEventKey;
      mode: 'pair'; speakers: readonly [string, string]; lines: readonly DialogueLine[] };

type DialogueRequest = {
  eventKey: DialogueEventKey;
  speaker: ChatSpeaker;
  partner?: ChatSpeaker | null;
  tick: number;
  context?: Readonly<DialogueContext>; // event-relevant flags only; no whole WorldState
  priority?: 'ambient' | 'scripted';    // do not expose arbitrary severity numbers
};

function requestDialogue(request: Readonly<DialogueRequest>): boolean;
function tickDialogue(entity: ChatSpeaker, resolvePartner: PartnerResolver): void;
~~~

The signatures below describe the design baseline; PR #93 exports the typed union and request API, including narrower caller-specific variants. Implement them in the actual owning file only. Domain owners keep existing chance/eligibility logic and call `requestDialogue` only on a real accepted speech trigger; `dialogueTrees` does not reroll the game's event chance. When a domain already supplies a deterministic outcome variant (e.g. aid kind, election phase, visitor POI), encode it in the event key or a narrow enum so the chosen text does not contradict reality. Dynamic name insertion uses existing formatter/escaped tokens, not assembled sentence literals in TS.

**Selection:** compile immutable `eventKey × mode` arrays on bank load; preserve all 19 existing `HumanChatContext` values through a verified explicit event-key mapping (never silently drop `school`, `guard`, `rival`, `courtship`, `affair` or `renffr`); never concatenate every category's trees per request or scan all entities. Validate that a line's speaker appears in the declared roles, no empty trees, duplicate IDs, invalid event keys/modes, oversized strings and missing event coverage. Seed selection from the existing deterministic sim convention with stable event, tick and participant IDs. Preserve event probability RNG independently: content choice must not change economy/marriage/election random streams. Prefer keyed stateless draws for scene choice. No arbitrary “category fallback” that makes famine chatter appear during an election.

**Solo vs pair:** a solo request must select a solo tree; paired request must select a pair tree; a missing partner must not let one settler speak both sides. For every *reachable* ambient event-key/mode combination, provide a real matching authored scene when activating PR A, including solo when no partner is available; do not silently suppress the majority of existing ambient bubbles. Where a domain currently permits both modes, ship actual authored solo and pair alternatives in the *same* integration PR. No fake second entity or silent mode coercion. Missing valid event content fails closed (no bubble + bounded diagnostic/test failure) rather than showing unrelated text.

**Priority/lifecycle:** ordinary ambient cannot interrupt busy/scripted/paired dialogue. Scripted events may interrupt only according to explicit existing forced-speech semantics; when interruption occurs, release both halves atomically. Preserve exactly one session per settler, partner symmetry, narrator/speaker role, actor eligibility and age/bed/faction guards. The current session Map is transient. Reset on world/session change and reclaim stale saved keys, including the idle half; do not use a new world-state queue or independent interval. Ensure visitors and performers are ticked through the existing human realtime path (they are Human entities today), not an additional faction timer.

**Time:** eliminate `legacyDurationTicks`/`CHAT_DEFAULT_DURATION_LEGACY_TICKS` from callers; represent duration explicitly in game hours or an authored bounded per-scene duration policy. Preserve intentional short greeting, medium exchange and rare omen visibility (compare their old effective `PER_TICK_RATE_SCALE` outputs). Do not conflate line time with whole-session time or create unbounded multi-hour spam.

### 2.3 AS-IS → TO-BE cutover matrix

| AS-IS source | Action | TO-BE owner and integration | PR |
| --- | --- | --- | --- |
| `dialogueTrees.ts` `pickDialogueTree` by categories, seven JSON imports | MODIFY | `dialogueTrees.ts` typed event/mode index and orchestrator; keep category index for ambient only | A |
| `humanChat.ts` `maybeDialogueChat`, `pickRandomChatContext`, TS fallback dictionary | MODIFY/REMOVE | Context scheduling stays with current human tick; chosen content only via `dialogueTrees.requestDialogue`; fallback content is JSON or fail-closed | A |
| `humanChat.ts` `startDialogueTreeChat`, `tickHumanChat` and `getDialogueTreeById` runtime dependency | MODIFY | `humanChat.ts` private session executor; no runtime import of catalog; only orchestrator calls it | A |
| `humanTick.ts`, `humanSocial.ts` ambient and pair paths | MODIFY | Existing neighbour/gates → typed ambient request; one realtime `dialogueTrees.tickDialogue` per eligible Human | A |
| `socialLife.ts` workplace/neighbor and `SocialImpulse.bubble` | MODIFY | Replace text with event keys, preserve event selection and probability; no `bubble?: string` | B |
| `humanLeisureBehavior.ts` / `humanHuntingBehavior.ts` | MODIFY | Emit child-play, social-motive and hunt event keys at identical real gates | B |
| `factionWander.ts` direct chat-field writes, POI and performers dictionaries | REMOVE direct writers | Visitor/performer event JSON and speech request; keep movement/activity RNG, no duplicate tick | B |
| `hotelStay.ts` / `hospitalCare.ts` | MODIFY | Specific arrival/service/patient/doctor event requests | C |
| `townHall.ts` | MODIFY | Typed aid/petition/audience/gold/official responses; preserve reputation/resource effects | C |
| `simulation/humanRelationships.ts` wedding “Yes!” | MODIFY | Marriage confirmation event; no change to relationship writer | C |
| `villageLeadership.ts` `pickElectionGossipPhrase`, winner literal | REMOVE text pools | Election buildup/ceremony/tension/winner event-specific scenes; original election phases/votes untouched | D |
| `renffrStar.ts` `RENFFR_OMEN_LINES` | REMOVE text array | JSON omen scene IDs; original omen activation/chatter duration and deterministic speaker selection untouched | D |
| `src/game/data/Family.json`, `Famine.json`, `pregnancy.json` | NORMALIZE/REGISTER | Typed event-specific trees; preserve role/mode and text after schema validation | B/C as owners land |
| `src/game/data/Elections.json` | AUDIT before possible deletion | Compare ten duplicate IDs/content against `needs.json`; if redundant, remove stale file only with proof | D |
| `renderer.ts`, `moonHowler.ts`, `humanLifecycleCleanup.ts`, worker/bootstrap | MODIFY imports if necessary | Call canonical reset/cleanup orchestration; retain lifecycle and main/worker parity | A/D |
| Production `sayHumanChatPhrase` and all direct `chatPhrase/chatTicks` assignments | REMOVE after callers migrated | Compile/static audit ensures one owned writer and one typed dispatch path | D |

This matrix governs every change; do not introduce compatibility aliases or leave dead TS content alongside its JSON replacement. Each owner-specific cutover removes the old line and its import **in the same PR** that introduces the working JSON scene and dispatch.

### 2.4 Import boundaries / isolation proof

~~~text
existing event owner / humanTick
     │ direct import: requestDialogue / tickDialogue
     ▼
dialogueTrees.ts [one selection + public request orchestrator]
     │ imports internal runtime
     ▼
humanChat.ts [one session engine and chat-field writer]
     │ no runtime import back to dialogueTrees.ts
     ▼
entity fields → existing worker delta/render metadata → renderer (READ ONLY)

humanSocial.ts → spatial-index/eligibility only
domain owners ─X─> raw humanChat session writer
domain owners ─X─> JSON bank, tree-index internals, direct chat field writes
dialogueTrees.ts ─X─> elections, hospital, housing, economy, rendering, WorldState
~~~

Use direct imports from the real owner, no barrel exports, generic manager, global event queue, duplicated switch tables or hidden pending scheduler. A pure event index is testable without `WorldState`; integration tests assert real speech bubbles. If moving an exported function, migrate **every** caller and test immediately and amend the ownership registry.

## 3. Save, main/worker and rollback contract

**N/A for new persisted fields:** none are authorized by this plan. Current chat fields exist on `Entity` but do not appear as additional names in `ENTITY_PERSISTED_FIELDS`; verify the actual generic entity save behavior before asserting those fields are or are not serialized. Existing module-local `dialogueSessions` Map is not a saved session ledger. Preserve its reset/reclaim contract without fabricated history.

- Audit `gameTypes.ts`, `saveSchema.ts`, `saveLoad.ts`, `simWorker/simPrep.ts`, `simBuffers/simDelta.ts`, `simBuffers/entityRenderMeta.ts`, `simWorker/gameWorker.ts` and main fallback. Do not introduce a second entity/session serialization channel.
- Same complete validated canonical bank on browser, worker and headless tests; loading must remain idempotent. Avoid double indexing or expensive disk read per tick.
- On new world, load, worker handoff, death, removal or transformation: no stranded partner/held key, no duplicate advancement and no stale bubble. Existing save data and RNG streams must not change because content was moved.
- If an implementation PR adds or changes saved dialogue fields, that **same PR** must include types, save schema, loader normalization, worker transport and rollback copy, old-save/round-trip tests. No deferred save migration.

## 4. Migration phases — required active architecture after each

| PR | Starts from | Exact switch | Active after PR / rollback |
| --- | --- | --- | --- |
| A — bank/one speech entry | Existing ambient tree route and legacy event one-offs | Add event-key/mode validated bank and public dispatch; decouple session runtime; migrate ambient `humanTick` callers atomically | Ambient uses `dialogueTrees → humanChat`; remaining historical forced sites still use same *single* chat writer, listed as debt; revert A restores previous ambient behavior |
| B — social/visitor/nature | A merged | Replace social impulse, workplace, doorstep, child-play, hunt, faction direct writes; import matching solo/pair JSON and orphan family/famine where used | These sources have **no legacy text path** and no direct chat writes; unconverted sources remain explicit in inventory |
| C — civic/health/life | B merged | Replace town hall, hospital, hotel, wedding and pregnancy; event-specific one-/two-way trees | Every converted owner calls same `requestDialogue`; domain state writers unchanged |
| D — leadership/omen/final sweep | C merged | Replace election and Renffr speech, verify duplicate `Elections.json`, remove fallback/legacy public API, update reset/worker tests, static guard | **All production spoken lines go through one orchestrator and one runtime writer**; no legacy chat phrase tables/callers/direct field writes; revert only on compatible dependency chain |

No phase may keep two independent writes for its *own migrated source*. A–C may retain documented legacy speech calls in **unmigrated** owners only; they must not create duplicate event subscriptions or double speech. Do not merge D before all sites are covered.

## 5. Determinism, performance and gameplay proof

- Preload/index once; selection by keyed arrays, approximately O(1) per emitted request, not O(total trees) allocation/copy. Use static/no-allocation read in the ordinary realtime loop. A candidate scan may stay where `humanSocial` already owns the adaptive query; **do not introduce a second population scan**.
- Keep existing low-ID pair dedup and ID-ordered neighbour preference. Speech selection must use a stable key and not consume unrelated world RNG, so the same seed/world/event yields the same content.
- Avoid new persistent per-settler dialogue objects. Active session state scales only with actual active sessions; cleanup clears both ends; no memory retained across session swaps.
- Preserve the current original event probability and cadence *before* speech selection. Replacing text must never make an event more or less likely or grant outcomes twice.
- Benchmark before/after a representative seeded short run and report p50/p95 tick time and active session count. Baseline **NOT MEASURED** when writing this plan; do not invent speedup percentages.
- Avoid large all-year/360-day suites for every PR; cover focused deterministic paths. Use bounded integration/worker tests and standard type/lint/build gates.

## 6. Mandatory tests / observable acceptance

| Proof | Test target (new names proposed where absent) |
| --- | --- |
| Unique bank IDs, valid category/eventKey/roles, solo vs paired, missing content error, duplicate/mislabel rejection | `tests/dialogue.bankIntegrity.test.ts` |
| Ambience stays event-appropriate; unknown/absent event fails closed, no context leakage or all-category fallback | `tests/dialogue.eventRouting.test.ts` |
| Solo lines spoken by one role; paired turns alternate, no one-person two-role conversations | `tests/dialogue.sessionModes.test.ts` |
| Forced interruption frees both people; no double pair; sleeping suppresses ambient not scripted; dead/transform/reload orphan recovery | Extend `tests/dialogueBusy.forcedLineGates.test.ts`, `tests/pairDialogue.orphanReclaim.test.ts`, `tests/humanChat.sleepAtHome.test.ts` |
| Worker/main bundle and render metadata carry identical content without lost bubbles after load | `tests/dialogue.workerSaveParity.test.ts`, extend existing worker closure tests where appropriate |
| Town-hall outcome never speaks unrelated award; election phase and winner matching; Renffr omen and pregnancy/famine guards | `tests/dialogue.domainEvents.test.ts`, focused existing domain tests |
| Visitor/performer has no direct field writes, advances once/tick and cleans up | `tests/dialogue.visitorPerformer.test.ts` |
| Static source audit finds no legacy authored spoken lines, direct chat writers or forbidden direct caller imports | `scripts/check-dialogue-ownership.mjs`, wired into existing check runner, not new parallel test framework |

**Preserve running tests:** `humanChat.ambientPairing.test.ts`, `humanChat.duration.test.ts`, `humanChat.sleepAtHome.test.ts`, `socialLife.dialogueBusy.test.ts`, `low_chat.test.ts`, `pairDialogue.orphanReclaim.test.ts`, `dialogueBusy.forcedLineGates.test.ts` plus election/affair/hotel and worker tests affected by changed text. Update tests to assert **event correctness and gameplay** rather than obsolete hardcoded literal strings; never weaken assertions.

## 7. Documentation, reports, handover

Every **implementation PR** updates both `OWNERSHIP_OVERVIEW.md` and `src/game/simulation/decisionRegistry.ts` for actual owners/cadences/fields and `CHANGELOG.md` with a concise compliant entry. Discover and report confirmed bugs through `docs/bug_report/readme.md` and `docs/BUG_REPORTS/SUMMARY.md`, even if fixed; no duplicate reports. Every PR description includes `## Bug reports` with numerical new/updated counts (use 0 when none). Update active architecture and roadmap only when code is merged; roadmap is not a verification list. Historical narratives/old bug reports remain read-only.

The codebot must follow `docs/plans/dialogue-codebot-tasks-0.6.5.2.md` for exact phase order, file inventory, checks and reporting. **No code implementation is established by this document.**

## 8. Final review gate

- [ ] One public speech-request pipeline and one chat-state writer; no TS-authored dialogue strings in production or direct scattered writes.
- [ ] Each identified source event has the correct eventKey and available mode, including family/famine/pregnancy and election/omen; no broad wrong-context fallback.
- [ ] Every migrated source's old call/import and TS text removed **in the activating PR**, not “later”.
- [ ] Existing event triggers, probabilities, domain writes, logging, rendering, deterministic RNG, workers and save semantics preserved.
- [ ] All old-session/lifecycle/busy/sleep protections and focused regression tests pass.
- [ ] No new hot-loop scans, duplicated banks, import cycles or unbounded session data.
- [ ] Each implementation PR contains both ownership registries, changelog, bug-report accounting, test evidence and handover; no roadmap completion before merge.


## PR #91 compatibility — JSON-authored group captions (schema v1.3)

PR [#91](https://github.com/Rengerams/wilderfolk/pull/91) owns the real Spotlight Lore scene (eligibility, 6–10 adults, gathering, camera, pause, captions, skip, save/worker state and Chronicle) and now supplies the **only** authored screenplay at `src/game/data/dialogue/spotlight-lore.json` (31 lines, ten authored speaking roles). Keep all 31 authored text lines in PR #91; do not duplicate or rewrite them in PR #93.

The checked-in source uses `version:"1.3"`, `game:"Wilderfolk Sim"`, `category:"festival"`, `categories:["festival"]`, `id:"spotlight.lore.performance"`, `eventKey:"spotlight.lore"`, `conversation_type:"group"`, and ten ordered named roles `speaker_1` to `speaker_10`. All 31 caption lines contain an explicit `speaker` and unchanged `text`; none defines `durationMs`.

The reusable, read-only functions in `src/game/dialogueTrees.ts` are:

- `readPresentationDialogue(spotlightLoreJson, 'spotlight.lore')`: validates 1.3 JSON, matching categories and group content, returns immutable ordered role-tagged lines, never inserts the scene into the ambient one-way/two-way chat bank.
- `bindNumberedPresentationSpeakers(presentation, scene.performerIds)`: validates a cast of **6–10 unique, positive real adult IDs**, assigns numbered roles in source order (`speaker_1`→first actor, etc.), and never assumes role count equals cast size. If the JSON declares **more roles than gathered adults**, the extra roles deterministically reuse existing actors in order (modulo cast length), without creating new actors. Because the script has ten roles, every cast member in a group of six to ten adults receives at least one line; roles exceeding the present cast size recycle the real actors. Output lines contain `speakerId`, `speaker`, `text` and optional `durationMs`.

The **existing** PR #91 `SpotlightLoreOverlay.tsx` remains the only wall-clock scene owner. Once the branches are integrated, it imports PR #91's JSON, parses it once at module initialization, binds real actors for the current scene, and uses the bound speakerId in place of `lineIndex % scene.performerIds.length`. It renders the same line text, speaker name, camera projection, stage, intro (2400 ms), applause (2800 ms), skip and completion. With no authored `durationMs`, keep the original `Math.max(3000, Math.min(5300, 1900 + text.length * 43))` pacing. This does not use `requestDialogue`, `humanChat.ts`, `chatPhrase/chatTicks`, a second clock, or RNG.

**Branch coordination:** PR #93 does not contain PR #91's overlay or content file; therefore its tests cover the mapper and schema, but the actual React-overlay wiring must be committed after the two branch contents are available together (for example, after PR #93 merges and PR #91 rebases). No cross-branch import is allowed on an unmerged branch. PR #91's actual 31 lines must be regression-checked against the former array, followed by pause/skip/reload and visual verification. No gameplay/save/worker changes are authorized by the dialogue integration.
