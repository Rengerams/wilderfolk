# Coding-agent execution — dialogue trees single pipeline 0.6.5.2

**Task class:** REFACTOR + CONTENT MIGRATION. **Status:** IMPLEMENTED IN PR #93 BRANCH; final verification and merge pending.  
**Design authority:** [Dialogue AS-IS / TO-BE architecture](dialogue-single-pipeline-0.6.5.2.md).  
**Required style:** [Wilderfolk feature codebot template](CODEBOT_FEATURE_TEMPLATE.md); follow the DNA [architecture](personality-career-single-pipeline-0.6.5.2.md) + [execution tasks](personality-career-codebot-tasks-0.6.5.2.md) separation.  
**Application version:** current 0.6.5.1; next development target **0.6.5.2** (`AGENTS.md`). **Implementation:** phases A–D consolidated in PR #93; original four-merge delivery sequencing is superseded by the combined review.  
**Do not** modify gameplay implementation in response to this document alone without an implementation task. Do not claim that writing this plan completes the feature.

## PR #93 implementation checkpoint

- **Implemented in branch:** canonical 1.3 event/mode bank, domain cutovers A–D, one chat-state owner, validated 6–10 actor presentation binder, worker bundle install, session cleanup and deterministic content choice.
- **Legacy retired:** category-wide `pickDialogueTree` function and its old selection test; no active `sayHumanChatPhrase` production callers.
- **Legacy content decision:** all ten `Elections.json` IDs overlap `needs.json` but all ten historical versions differ, so the file stays quarantined, preserved and regression-tested instead of being silently removed.
- **Additional implementation tests:** `dialogue.bankIntegrity`, `dialogue.sessionModes`, `dialogue.domainEvents`, `dialogue.workerSaveParity`, `dialogue.legacyElectionsAudit`, and `dialogue.performance` (current p50/p95 only).
- **Release acceptance not yet asserted:** full standard CI, build at final head and merge; a code change or a newly added test alone is not proof it passed. Actual PR #91 overlay UI wiring remains a separate branch integration after PR #93.

## PR #93 typed content contract and context routing (28 October 2026)

- **Implemented in PR #93:** `DialogueEventKey` now lists all 94 authored event keys, including detailed social motives, visitor POIs, hospital variants, hotel service states and election phases. Invalid caller keys fail TypeScript instead of silently falling back to unrelated dialogue.
- **Compiled contract:** `DialogueTree` is readonly with mandatory `eventKey`, mandatory discriminated `solo`/`pair` mode and matching 1/2 speakers. Both the bundle and any worker/deserialized payload are checked against the explicit key registry and copied into nested frozen scenes, speakers and lines.
- **Domain correctness:** original event gates stay in their owners; the exact `eventKey` plus optional `treeId` selects only matching authored content. Regression tests enumerate all keys, sample specific outcomes and reject mismatched variants; none invent new speech timing or event RNG.
- **Worker:** `gameWorker.ts` installs the bundled `canonicalDialogueBank` at module initialization. Worker/main serialization parity tests now exercise every compiled tree. This validates content parity, **not** a live browser Worker round trip; live validation remains pending.
- **Spotlight PR #91:** not integrated in this change, as requested. Full standard/120-day and browser-worker acceptance pending.

## PR #93 follow-up acceptance hardening (28 October 2026)

- **Simulation gate:** the removed 360-day CI workflow is replaced by `.github/workflows/simulation-120-day.yml`. On relevant game-rule PRs and manual dispatch it runs `npx tsx scripts/run-full-year.mts --scenario=producers --days=120 --seed=12345 --bot`, using the existing checkpoint invariant checker. It does **not** run the full-year Vitest file; the historical long scenario remains separately available.
- **Chat sessions:** `humanChat.ts` retains the actual paired participants in the existing unsaved session Map, freeing both synchronously on scripted interruption even without a caller resolver. Same tick cadence and chat fields; `tests/dialogue.sessionModes.test.ts` pins immediate release.
- **Spotlight:** `bindNumberedPresentationSpeakers` now rejects presentations leaving any gathered actor silent. The PR #91 source still owns 31 captions and ten roles; `tests/dialogue.schema13.test.ts` validates cast sizes 6–10 with all actors speaking. Actual overlay hookup belongs to PR #91 after integration.
- **Domain and save/worker:** `tests/dialogue.domainEvents.test.ts` exercises real hospital and Town Hall outcome functions in addition to content routing; `tests/dialogue.workerSaveParity.test.ts` exercises serialized bank request parity and paired save/load orphan recovery. Full real Worker thread execution and visual tests remain unverified; do not claim otherwise.
- **Verification status:** changes committed on PR #93; full standard CI, 120-day workflow, strict cycle audit and production build at the final HEAD still require successful runs before merge.

## 0. Mandatory preflight — do this before editing

1. Read `AGENTS.md`, all of `docs/command.md`, the linked architecture document, `OWNERSHIP_OVERVIEW.md`, `src/game/simulation/decisionRegistry.ts`, `docs/bug_report/readme.md` and `package.json`. Verify executing shell *inside that shell* with `$PSVersionTable.PSVersion.ToString()`; if 5.1, switch to PowerShell 7 per command rules. No assumed Linux shell and no invented package scripts.
2. Inspect the current branch and changed files. Several agents change Wilderfolk concurrently. Fetch/read files immediately before each edit; revalidate all paths and function signatures, and do not overwrite other PR work.
3. Mini-RFC: **Problem:** authored dialogue and TS-hardcoded speech/direct chat writes coexist. **Minimal change:** one validated JSON content bank + event-specific selection through `dialogueTrees.ts`, with `humanChat.ts` as the only runtime writer. **Risks:** wrong event speech, invalid solo/pair data, orphaned sessions, double writes, shifted RNG, per-tick allocations, worker or save differences. **Scope:** speech bubbles only; preserve source event simulation, Chronicle and UI notices.
4. Run a text/AST inventory for all `sayHumanChatPhrase`, `chatPhrase`/`chatTicks` assignments, `FALLBACK_CHAT_LINES`, `bubble:` string sources, `RENFFR_OMEN_LINES`, `pickElectionGossipPhrase`, and sources producing spoken lines. Include files not yet named here. Search JSON imports and all `src/game/data` authored scene sources. Classify each text as **spoken bubble** vs **Chronicle event / notice / UI label**; only the former migrates. Use this document's baseline as a starting snapshot, not as an excuse to skip current reconnaissance.
5. Record baseline deterministic seed, representative starting world, 60–120 seconds of bounded simulation, existing dialogue distribution and p50/p95 tick cost. If measurement cannot run, mark `NOT MEASURED`. Do not make up performance figures.

**Every implementation PR A–D must:** update **both** `OWNERSHIP_OVERVIEW.md` and `src/game/simulation/decisionRegistry.ts`, and `CHANGELOG.md`; register real implemented functions, callers, cadence, writes and tests. Do not leave stale legacy owners in the registry. For a distinct confirmed bug, create a report under `docs/bug_report/` and index in `docs/BUG_REPORTS/SUMMARY.md` even if fixed in that PR; first de-duplicate against reports. Every PR description must have a `## Bug reports` section with exact **New: N** and **Updated existing: N**, links or explicit zero. No roadmap completion until implemented and merged. Historical docs and year narratives are read-only.

## 1. Binding architecture contract

~~~text
AS-IS
  domain event owner → humanChat.sayHumanChatPhrase(TS text) ──────┐
  factionWander → raw entity.chatPhrase/chatTicks write ──────────┤
  humanTick → humanChat.maybeDialogueChat → dialogueTrees.byCategory
                                                                    ↓
                                                         Entity chat fields

TO-BE
  EXISTING domain event gate or humanTick (no new clock)
         ↓ typed event key, participants, tick, narrow flags
  dialogueTrees.requestDialogue [ONE public content/request router]
         ↓ validate + indexed event-key/mode selection, deterministic
  humanChat [ONE internal session executor and chat-field writer]
         ↓ existing entity fields / worker / renderer bubble
  dialogueTrees.tickDialogue [called from existing human tick]
~~~

**Interpretation:** `dialogueTrees.ts` is the *main orchestrator for dialogue*, not the owner of elections, relationships, hospital treatment, visitor AI or story/raid resolutions. All domain event decisions, their state mutations, chance gates and log entries remain where they are. `humanChat.ts` remains only the internal transcript/session writer and does not choose content or import the bank at runtime. No new manager, game-wide event bus, timer, independent chat RNG stream, barrel, compatibility alias or second writer.

**Active pipeline after every phase:** A activates the single route for ambient; B and C cut over whole source files atomically; D retires the final legacy content API. Unconverted owners may temporarily use the existing `humanChat` writer, but never duplicate the same trigger across both routes.

### 1.1 JSON content contract and catalog import rule

- Keep the seven existing canonical category files as the baseline (115 trees at the audited snapshot). Use explicit separate event JSON sources under `src/game/data/dialogue/` **only for real event domains**. A file may hold multiple narrowly keyed scenes for that same domain; do not create one empty file per enum value.
- Every compiled scene gets an immutable, globally unique ID, one category, one *specific* eventKey, a discriminated `solo`/`pair` mode, 1 or 2 speaker-role names respectively, and 1+ valid lines referencing declared roles. Existing two-role ambient sources can be assigned explicit ambient keys as part of index normalization; avoid reformatting hundreds of unchanged lines merely for style.
- **Source audit:** `Family.json` (12 trees, 3 solo), `Famine.json` (4, 2 solo), `pregnancy.json` (15, 4 solo) are currently not loaded; normalize their category tags and modes before moving/importing. They must not be silently treated as ordinary two-person conversations.
- `Elections.json` currently names **ten IDs already present in `needs.json`**, with `category: needs`. **DO NOT** import as an election bank. Compare full tree content and track any uniquely authored lines first; remove the unused file only after explicit proof it is redundant (deletion part of the authorized legacy clean-up, not a broad data purge).
- Store text in JSON, not TS constants, not JSX, not a new TS lookup dictionary. Never duplicate one line across two sources simply to satisfy a type. Never use speaker keys as actual entity IDs or invent an absent partner.
- Context correctness: `election.tension` never uses general `social` lines; `townHall.foodAid` never uses a gold stipend line; pregnancy and famine content only when their true domain conditions hold. No fallback to unrelated category. If a requested key/mode is absent, fail closed with a diagnostic appropriate to development/test, never a random greeting.
- JSON imports are *explicit* and compiled once in `dialogueTrees.ts`; worker, browser and headless receive that same canonical bundle. No runtime fetch per conversation or extra JSON bank copy.

### 1.2 Proposed speech request contract (implement only once in owner)

~~~ts
type DialogueMode = 'solo' | 'pair';
type DialoguePriority = 'ambient' | 'scripted';
type DialogueRequest = Readonly<{
  eventKey: DialogueEventKey;
  speaker: ChatSpeaker;
  partner?: ChatSpeaker | null;
  tick: number;
  context?: Readonly<DialogueContext>;
  priority?: DialoguePriority;
}>;
function requestDialogue(request: DialogueRequest): boolean; // dialogueTrees.ts
function tickDialogue(entity: ChatSpeaker, resolvePartner: PartnerResolver): void; // dialogueTrees.ts
~~~

The exact `DialogueEventKey` union and JSON schema are specified in the architecture plan; expand only for proven triggers. Codebot may refine exact names after verifying caller semantics, but **one concrete key per distinguishable outcome/scene**, not one umbrella key for every event.

**Call contract:** domain owner has already checked its gameplay trigger/eligibility and retains its original chance roll. The speaker runtime checks **busy, priority, solo vs pair, and lifecycle**, selects content deterministically and starts a session. A declined speech request must never roll back or repeat a game event. Preserve the existing low-ID pair initiation, preferred-neighbour spatial search, sleep suppression for ambient and full release for scripted interruption. Forced speech does not get an unconditional override when a domain previously honored `isDialogueBusy`.

**Session lifecycle:** keep the current in-memory Map, session key, paired turn sequence, `chatPartnerId` and stale/orphan reclamation; make `humanChat` consume immutable selected trees without importing `dialogueTrees` functions at runtime. Do not mirror session state into another Map or world field. Handle Moon Howler transformation, removal/death, world reset, load and worker swaps. Current chat bubble duration semantics use `PER_TICK_RATE_SCALE` and game hours: migrate to explicit hour policy with matching observable timing, not old 24-tick numbers at each source.

**No duplicate ownership:** `dialogueTrees.ts` alone selects and routes; `humanChat.ts` alone assigns/clears the four speech fields; rendering reads only; domain modules cannot import the session writer. `humanSocial.ts` may own *spatial partner candidates* but not text. Type-only dependencies must pass the strict import-cycle gate.

## 2. Required AS-IS → TO-BE source migration inventory

The following table is a required checklist. Add every other discovered speech-emitting site before PR A; **no “we removed all TS chat” claim without global evidence**.

| AS-IS source and real symbol / behavior | TO-BE scene keys (minimum) | Mutation/eligibility that MUST remain in original owner | PR |
| --- | --- | --- | --- |
| `humanChat.ts` `DEFAULT_FALLBACK_LINES`, `FALLBACK_CHAT_LINES`, `pickRandomChatContext` and `maybeDialogueChat` | All 19 existing `HumanChatContext` values via explicit `ambient.*` event keys (including home, work, guard, courtship, rival, visitor, school, child, affair, food, winter, renffr, fear, sleep, pregnant, festival, election, hunt and social) | Keep actual ambient roll and bedtime gate in human tick; no hardcoded “emergency chat” from TS | A |
| `humanTick.ts` `simSettlerChat`/`simSettlerPairChat`/`tryAmbientRandomDialogue` | All supported ambient keys | Existing pair dedup, conditions, schedule and adaptive neighbour candidates | A |
| `socialLife.ts` `tryWorkplaceBanter`, `tryNeighborGreeting` | `workplace.banter` (solo/pair), `neighbor.greeting` (pair) | Work shift, proximity, time, existing trait probability | B |
| `socialLife.ts` `SocialImpulse.bubble` + `humanLeisureBehavior.ts` impulse rendering | `social.impulse` keyed by specific motive (e.g. sick/grief/weather/care/service; **no conflicting generic line**) | `pickSocialImpulse` remains only motive/route decider; no duplicate rest/venue choices | B |
| `humanLeisureBehavior.ts` `tickHumanChildLeisure` | `child.play` (solo, add paired only when actually eligible) | Real playmate and cadence/probability | B |
| `humanHuntingBehavior.ts` hunting shortage comments | `hunting.shortage` variants (scarce game / thin trails) | Real prey/scarcity/trait gates; no change to yield or chase | B |
| `factionWander.ts` `maybeArriveFlavor` visitor POI text + performer idle string array + direct chat assignments | `visitor.poi` with validated POI enum, `visitor.performer` | Wander/activity/POI/performer selection, existing faction RNG; **remove direct chat field writes** | B |
| `src/game/data/Family.json`, `Famine.json` | `family.daily` / `famine.hunger` with meaningful variants | Only trigger from real family/food situations, not a new parallel family/famine event scheduler | B/C |
| `hospitalCare.ts` treatment patient/doctor lines | `hospital.patient`, `hospital.doctor` | Treatment outcome, pregnancy state, existing chance/skill/reputation | C |
| `hotelStay.ts` arrival/service lines | `hotel.arrival`, `hotel.service` (busy-vs-welcome) | Guest booking and staffing, venue hours and existing roll | C |
| `townHall.ts` petition/aid/leader audience/official lines | `townHall.foodAid`, `townHall.petition`, `townHall.audience`, `townHall.goldAid`, `townHall.official` | Real outcomes, food/gold, reputation, speaker eligibility | C |
| `simulation/humanRelationships.ts` marriage “Yes!” | `marriage.accepted` | Marriage validity, partner/home registration, `logEvent` and notification | C |
| `src/game/data/pregnancy.json` | `pregnancy.daily` with actual mother/partner/family solo/pair roles | Existing pregnancy and support gates; **no invented pregnancy progression** | C |
| `villageLeadership.ts` `pickElectionGossipPhrase`/`tickElectionGossip` and winner statement | `election.buildup`, `election.ceremony`, `election.tension`, `election.winner` | Ceremony state machine, existing roll, winner/ballot names, notification/merit | D |
| `renffrStar.ts` `RENFFR_OMEN_LINES`/`beginRenffrSettlerChatter` | `renffr.omen`; ambient `renffr` uses relevant omen context only | Omen chance, speaker shuffle, gossip end tick, visual letters | D |
| `humanChat.ts` legacy public speech writer, direct callers and `renderer.ts` reset imports | Canonical lifecycle methods and request gateway | Chat owner remains sole writer; release all paired orphans | D |
| `src/game/data/Elections.json` stale duplicate IDs | No keys derived from misleading filename | Compare full content; retire only if actually redundant | D |

Treat `affair`, `courtship`, `festival`, `visitor` and `rival` existing ambient contexts distinctly: extend event keys/scene pools where current callers already distinguish them. Investigate potentially unlisted TS dialogue producers (including direct interpolation, `entity.chatPhrase`, array literals, or strings returned as `bubble`) rather than assuming this table is exhaustive.

### 2.1 Ownership registry delta

- `dialogueTrees.ts` row becomes “Canonical dialogue content and **speech request/tick orchestration**”; public entrypoint `requestDialogue` and `tickDialogue`, validation/index compilation, lifecycle reset route. Do not claim this file writes events or world mechanics.
- `humanChat.ts` row becomes “Speech session execution and entity chat-field writer”; private implementation for start/advance/reclaim/clear/busy/format; direct external *writers* removed on final cutover. Preserve truthful public read-only `isDialogueBusy` import only if needed by owners.
- `humanSocial.ts` retains adaptive partner candidates and pair dedup; its forwarding wrappers are deleted if they only forward. Update test/registry call ownership rather than adding aliases.
- Existing event owners continue owning their respective game outcomes; update their registry entry to mention dialogue request as a **side effect after** outcome, not a transfer of game rules to dialogueTrees.
- `decisionRegistry.ts` must identify exactly one writer for `human.chatPhrase`, `human.chatTicks`, `human.chatPartnerId`, `human.chatDialogueSessionKey` and the actual scheduler. Pure catalog methods have `writes: []`. No new fictional clock or generic “dialogue manager” key.

## 3. PR A — canonical keyed bank and ambient single entry

**Start:** seven category JSON files + `dialogueTrees.pickDialogueTree` category pools and `humanChat` mixed selection/runtime.

**CREATE**
- `tests/dialogue.bankIntegrity.test.ts`
- `tests/dialogue.eventRouting.test.ts`
- `tests/dialogue.sessionModes.test.ts`
- Add the real canonical event JSON scenes needed for **every reachable ambient event-key/mode combination**, especially solo when no eligible partner is present; never add unused placeholder sources. Keep the existing 19-context mapping complete and do not suppress ordinary chatter as a shortcut.

**EDIT**
- `src/game/dialogueTrees.ts` — validate JSON sources; indexed eventKey + mode lookup; typed `requestDialogue` and `tickDialogue`; deterministic relevant context selection; no category-wide fallback; compile once.
- `src/game/humanChat.ts` — remove authored ambient fallback arrays, category chooser and duplicate random selection; keep session engine and only chat-field mutations; remove runtime back-reference to dialogueTrees (keep immutable selected tree or injected lookup). Normalize line duration API to game-hour units and retain existing timings.
- `src/game/humanTick.ts`, `src/game/simulation/humanSocial.ts` — call the new one route at the real previous pulse, no extra tick or duplicate pair roll; keep neighbour index and scheduling. Do not change domain event decision functions.
- `src/App.tsx` and `src/game/simWorker/gameWorker.ts` **only if** bank preload/install contracts change; guarantee equivalent bundled content and headless tests.
- Both ownership registries and `CHANGELOG.md`.

**Prove:** (a) all seven original source categories load with globally unique IDs, (b) missing/wrong event/mode is rejected, (c) solo cannot impersonate pair, (d) same seed has same chosen tree and partner, (e) a pair is never double-started, (f) session interruption/reclaim and sleep remain correct, (g) worker/main install once. Preserve duration tests in real hours; do not simply change expected tick counts to hide time-scale regression.

**Active after PR A:** *all ambient* content routes through `dialogueTrees.requestDialogue → humanChat`; existing event-specific forced callers still use the **same** existing runtime writer, are enumerated and are not newly duplicated. No second manager. Merge A before B.

## 4. PR B — social, nature and visitor cutover

**Depends:** merged PR A; reread current code and confirm no ownership conflict.

**CREATE**
- `src/game/data/dialogue/workplace.json`, `neighbor.json`, `child-play.json`, `hunting.json`, `visitor.json` and `social-impulse.json`, or fewer domain-group files with the same distinct event keys.
- Normalize `Family.json` and `Famine.json` into the canonical content layout **only when their actual triggers are integrated**, retaining 12+4 distinct tree IDs and one-way modes.
- `tests/dialogue.socialEvents.test.ts` and `tests/dialogue.visitorPerformer.test.ts`.

**EDIT**
- `src/game/socialLife.ts`: change `SocialImpulse.bubble?: string` into a typed event outcome/projection, preserving the motive and all routing. Remove hardcoded workplace/doorstep dialogue and send one/paired request. Keep work-shift/intuitive trait chance, household distance and low-ID safeguards.
- `src/game/humanLeisureBehavior.ts` and `humanHuntingBehavior.ts`: send event keys with original event/roll gates. No extra chat attempt every tick.
- `src/game/factionWander.ts`: **remove** POI/performer TS dictionaries and direct `entity.chatPhrase/chatTicks` assignments. Pass exact POI kind or performer phase; choose a valid solo tree. Ensure these NPCs are already advanced in `humanTick`; don't start a second ticker inside wander.
- `src/game/dialogueTrees.ts`: import/index only content used in this PR; no unrelated event source preloads.
- Both ownership registries and `CHANGELOG.md`, plus bug reports if verified.

**Prove:** two nearby coworkers alternate speaking, no solo two-party banter, greeting distance/time unchanged, child at play actually gets child dialogue, shortage text not used when prey abundant, food/family content only at eligible triggers, a visitor speaks arrival text only on POI arrival, performers still talk at original cadence, and every direct visitor speech field write has disappeared. No duplicate `simSettlerChat` forwarding wrapper if no real responsibility remains.

**Active after PR B:** ambient + these social/nature/visitor triggers use **one content and session path**; other untouched domain triggers are explicitly pending.

## 5. PR C — civic, health, lodging and life events

**Depends:** merged PR B.

**CREATE**
- `src/game/data/dialogue/hospital.json`, `hotel.json`, `town-hall.json`, `marriage.json`; normalize/register `pregnancy.json` with real solo/pair roles and guarded outcomes.
- `tests/dialogue.domainEvents.test.ts` (focused source-event integration and no duplicate game consequences).

**EDIT**
- `src/game/hospitalCare.ts`: patient pregnancy versus other treatment and doctor advice are event variants, not generic chat. Preserve treatment result/skill/reputation and existing chance.
- `src/game/hotelStay.ts`: arrival and hotelier busy/welcome distinction; preserve guest logic, venue hours, tick roll and affordability rules.
- `src/game/townHall.ts`: exact petition/food aid/gold aid/leader audience/official greeting; no fake food/gold outcome based on random selected text. Keep all existing money, nutrition, stamina and reputation writes.
- `src/game/simulation/humanRelationships.ts`: marriage acceptance from valid completed marriage transition, not independent romance roll.
- `src/game/dialogueTrees.ts`: register new event pools; update both registries and `CHANGELOG.md`, verified bug reports.

**Prove:** outcome/text parity for every branch, including “aid_food” versus “aid_gold”, official and leader busy behavior, treatment eligibility and patient mode, hotel capacity/booking unaffected, pregnancy scene only from a pregnancy-relevant real trigger, marriage event logged **once** and both participants' chat locks released correctly. Old TS dialogue literals and imports removed from every migrated owner.

**Active after PR C:** one dialogue path for all migrated civic/life/health/hospitality events; no duplicate domain decisions or writes.

## 6. PR D — elections, omen, final legacy removal and architecture gate

**Depends:** merged PR C.

**CREATE**
- `src/game/data/dialogue/election.json` and `renffr-omen.json` with source-appropriate event variants, unique IDs, supported solo/pair role and dynamic name placeholders where needed.
- `tests/dialogue.workerSaveParity.test.ts` and final `tests/dialogue.ownershipAudit.test.ts` (or run the new static checker as a standard CI script).
- `scripts/check-dialogue-ownership.mjs`: single ownership static guard, integrated in existing source/check runner, not a parallel test framework.

**EDIT**
- `src/game/villageLeadership.ts`: remove `pickElectionGossipPhrase` TS text pools; route buildup, ceremony, tension and winner to specific scene keys; preserve vote/merit/candidate names, ceremony phases and existing chances.
- `src/game/renffrStar.ts`: remove `RENFFR_OMEN_LINES`; preserve omen creation, deterministic entity shuffle and `renffrChatterUntilTick`. Do not change visual star animation. Convert to a scene key with correct single-speaker mode; update tests relying on exported literal array.
- `src/game/data/Elections.json`: compare all 10 duplicate IDs to `needs.json` including text/metadata; remove only when proven wholly redundant and report result.
- `src/game/humanChat.ts`: eliminate `sayHumanChatPhrase` production export and `CHAT_DEFAULT_DURATION_LEGACY_TICKS`, any remaining TS emergency text; centralize reset/cleanup entry and ensure no runtime content lookup/cycles.
- `src/game/renderer.ts`, `src/game/moonHowler.ts`, `src/game/humanLifecycleCleanup.ts`: import from correct owning lifecycle API if changed, preserving session cleanup. `simWorker/gameWorker.ts`/`src/App.tsx` only when needed for canonical preload.
- All remaining callers/tests, both registries, `CHANGELOG.md`, active architecture document, bug reports and the roadmap **only after merged**.

**Required final static scan**, including tests versus production distinction:

~~~text
1. No production sayHumanChatPhrase(...) calls and no public legacy speech writer.
2. No authored speech text arrays / conditional literal speech in src/**/*.ts or tsx
   outside JSON content; preserve legitimate UI, log and notification strings.
3. No assignment to chatPhrase/chatTicks/chatPartnerId/chatDialogueSessionKey
   outside the sole humanChat runtime (initial entity construction / save hydration
   may require a narrowly documented exception, but NEVER a second dialogue writer).
4. No direct domain imports from humanChat writable session internals.
5. No unresolved duplicate JSON tree IDs, invalid category/role/mode/eventKey,
   orphaned JSON content assumed active, or null-partner two-way scenes.
6. No new import cycle, duplicate worker bank, extra timer or world-wide scan.
~~~

A static regex is **not** enough to enforce authored text restrictions by itself: use existing source parser/check infrastructure where practical and supplement with a reviewed search/allowlist of legitimate non-dialogue UI/Chronicle text. Do not false-positive ordinary `logEvent` narration or labels; do not weaken the check just to pass.

**Prove final acceptance:** identical gameplay consequences and real event cadence on deterministic saves; zero double chat sessions; correct participant-specific event text; formerly idle orphan sessions reclaim after save/load and Moon Howler; same bank in worker and main; 1/2-person scenes both work; no fallback text appears from TS; no unintended population scan; all targeted and broad checks pass or a specifically reported pre-existing blocker is isolated.

**Active after PR D:** **all spoken output → dialogueTrees.ts request/index → humanChat.ts one session owner → existing render metadata**. No second legacy chat content selection or field writer. Scope ends here, not at a new narrative engine.

## 7. Save, worker and deterministic acceptance — every relevant PR

- **No new saved field is authorized** by this refactor. `Entity` already defines the four chat fields. Inspect `saveSchema.ts` and `saveLoad.ts` before claiming save behavior; do not serialize the private session Map. Any new persisted data in a PR must be shipped with its complete entity type, save-schema, load normalization, worker/rollback copy and old-save tests *in that same PR*, never deferred.
- Preserve `humanChat` paired idle state, `resetDialogueSessions` behavior (world/load/render reset), `cleanupEntityDialogueState` (death/removal) and `releaseDialogueSession` (Moon Howler form). Ensure forced interruption frees the *counterpart* immediately with a resolver, otherwise the documented orphan reclaim on next tick; don't strand an idle participant.
- Verify no actor is ticked twice: `humanTick.ts` currently calls `tickHumanChat` in distinct branches of the Human loop; `factionWander` is reached from that loop for visitor/rival humans. Do not add a second ticking owner.
- Content deterministic: same seed, tick, event and participants → same scene and partner. Keep domain RNG draws exactly where they are; do not consume additional `factionWander`, election, health or relationship RNG merely to pick a text variant.
- Typed actor roles and interpolation: check all placeholders, valid entity names, juvenile/parent, father/mother/partner eligibility; avoid using static “husband/wife”, a gender or a relation when the participants do not match the event.
- The current split content is eagerly bundled and the worker calls `installDialogueBankPayload(canonicalDialogueBank)`. Verify the same imported source list and index on both sides and no per-tick JSON parse/load.

## 8. Verification commands and regression suite

First verify commands exist in current `package.json`. This plan has not executed tests or benchmark runs. Run a small targeted suite after each code change, then the required checkpoint before review:

~~~powershell
# After confirming the shell and project scripts:
npx vitest run tests/dialogue.bankIntegrity.test.ts tests/dialogue.eventRouting.test.ts
npx vitest run tests/humanChat.ambientPairing.test.ts tests/humanChat.duration.test.ts tests/humanChat.sleepAtHome.test.ts tests/pairDialogue.orphanReclaim.test.ts
npx vitest run tests/socialLife.dialogueBusy.test.ts tests/dialogueBusy.forcedLineGates.test.ts tests/low_chat.test.ts
npm run test:types
npm run lint
npm run build
npm run audit:deps:cycles:strict
npm run check:source
npm run test:standard
~~~

New proposed test file names only run once created by their respective PR. Include additional focused `electionGossip.dedup`, `hotelSettlerLodging.night`, actual town-hall/hospital/social/affair tests based on the changed call sites; don't run a nonexistent test file. The test runner accepts a focused `npx vitest run <test files>` because `vitest` is a current dev dependency; verify its version/CLI if package changed. No need for a 45-minute colony simulation to prove a line router: use bounded deterministic integration and a short representative performance profile. Never skip, delete or weaken broken tests.

### Test matrix by owner

| Invariant | Baseline tests / new tests | Gate phase |
| --- | --- | --- |
| Session roles, no solo pair impersonation, unique JSON/ID/event lookup | New bankIntegrity, eventRouting, sessionModes | A |
| Existing chat time units and bubble behavior | `humanChat.duration.test.ts`, `low_chat.test.ts` | A/D |
| Busy/stale paired session, orphan and transformation | `socialLife.dialogueBusy.test.ts`, `pairDialogue.orphanReclaim.test.ts`, `dialogueBusy.forcedLineGates.test.ts` | A/D |
| Ambient pair neighbour stability and real sleeping behavior | `humanChat.ambientPairing.test.ts`, `humanChat.sleepAtHome.test.ts` | A/B |
| Coworker/greeting/child/hunt and visitor/performer gates | New `dialogue.socialEvents.test.ts`, `dialogue.visitorPerformer.test.ts` plus current source tests | B |
| Treatment/hotel/town hall/marriage/pregnancy content actually matches real outcomes | New `dialogue.domainEvents.test.ts` and focused existing domain integration | C |
| Election/omen trigger, rare events, worker content, main fallback, reload and static ownership | `electionGossip.dedup.test.ts`, new workerSaveParity/ownership audit | D |
| No performance regression, no new per-tick allocations/scans | Representative fixed-seed baseline and before/after measurement | A/B/C/D |

**Performance target:** preindex JSON by eventKey+mode once; do not rebuild a category list on every chatter. Avoid per-request `new Set`, `[...allTrees]`, content-array copy, full-population search or parsing. Distinct source-event scans already present in the game must not be duplicated by the router. Report measured baseline vs after (p50/p95, visible bubbles, active sessions); if not measured, write `NOT MEASURED` instead of a speedup.

## 9. Required PR description, documentation and handover

Each codebot implementation PR must use this compact handover (replace all brackets, do not leave placeholders):

~~~markdown
## Scope
- Phase: A/B/C/D; exact migrated source owners and removed legacy calls.
- AS-IS before / one active pipeline after: precise functions and direct imports.
- What stayed unchanged: domain game outcomes, simulation cadence, save and worker contracts.

## Architecture
- Updated ownership rows and decision registry keys/caller/cadence/writes/tests.
- Event keys and JSON sources activated, solo/pair behavior, and cutover proof.
- Import cycle/performance consequences and any measured baseline.

## Verification
- Actual commands and PASS/FAIL/BLOCKED/NOT RUN status.
- Seeded regression evidence; no claimed tests not executed.

## Bug reports
- New: 0 (or actual count and linked paths)
- Updated existing: 0 (or actual count and linked paths)

## Files and cleanup
- Changelog updated, active architecture synchronized, no historical edits.
- Temporary files removed/verified; shell version and unresolved blockers listed.
~~~

For each PR: record exact modified files, bugs, de-duplicated report links, resulting SHA/PR and verification; never mark `DONE` for code not executed. `CHANGELOG.md` entries must be short and obey the repo docs checker; avoid file paths and overlong prose. Keep the 0.6.5.2 roadmap as a **feature implementation overview**, not a verification register. Any unmerged feature remains pending. Do not update inactive historic stories or archived audits.

## 10. Codebot stop conditions / final review

A PR is not review-ready if it duplicates a source event's speech path, retains TS-authored lines for that migrated source, fails to free a paired session, changes gameplay event frequency/reward, adds a second writer/clock, drops existing JSON scenes, creates fake 2-person solo dialogue, introduces a bank/worker mismatch, omits either registry/changelog, or misses a confirmed bug report.

The **whole refactor is complete only after PR D has merged** and the final static audit finds zero unauthorized spoken-text arrays/callers/direct writes. A valid completion report must include the final AS-IS→TO-BE diff, activated event-key inventory, tests and statuses, deterministic/performance findings, worker/save proof, ownership changes and bug-report counts. A document or open PR alone is **not** implementation.


## PR #91 JSON captions — strict integration contract

**Actual source now exists.** PR [#91](https://github.com/Rengerams/wilderfolk/pull/91), commit `89460fbc`, owns `src/game/data/dialogue/spotlight-lore.json`: 31 original text lines, `version:"1.3"`, `category:"festival"`, `eventKey:"spotlight.lore"`, `conversation_type:"group"`, ten sequential roles `speaker_1` through `speaker_10`. This is the **sole** scene text owner; do not copy its text into PR #93, other JSON or TypeScript.

**PR #93 reusable support (implemented):** `readPresentationDialogue(raw, 'spotlight.lore')` validates and returns immutable ordered lines. `bindNumberedPresentationSpeakers(presentation, performerIds)` accepts **6–10 unique positive real adult IDs** regardless of JSON role count: roles map in source order, surplus roles recycle the existing adult cast deterministically (index modulo actual cast size), and every real adult in a cast of six to ten receives at least one role across the 31 captions. With fewer than ten actors, the final roles reuse the existing cast deterministically. Source text, order and optional timing remain unchanged. Both helpers are in `dialogueTrees.ts`, outside the ambient solo/pair bank. The source-wide 1.3 test scanner must tolerate `group` and exclude it from ambient-bank comparisons.

**Overlay wiring required once the PRs share a common codebase** (do not add imports on a branch where the other PR's file/API is absent):

1. In PR #91's `SpotlightLoreOverlay.tsx`, import the JSON file and `readPresentationDialogue`, `bindNumberedPresentationSpeakers` from `dialogueTrees.ts`. Parse **once at module initialization**:
   ```ts
   const SPOTLIGHT_SCRIPT = readPresentationDialogue(spotlightLoreJson, 'spotlight.lore');
   ```
2. Bind the current real cast **once per scene**, not every animation frame: `const captions = bindNumberedPresentationSpeakers(SPOTLIGHT_SCRIPT, scene.performerIds)`. Use the scene/session key if memoizing. Resolve the current speaker via `resolveEntity(world, captions[lineIndex]?.speakerId ?? null)`, rather than `performerIds[lineIndex % performerIds.length]`. Important: when 6–10 adults gather, all are eligible to speak; `speaker_N` is assigned to `performerIds[(N - 1) % performerIds.length]`. No made-up speaker, rotation or actor instance.
3. Replace the overlay's hardcoded `LINES` constant with the 31 `captions[i].text` entries, **without modifying or retyping their texts**. Preserve caption formatting via the existing `formatChatLine`, spotlight/camera/controls, game pause, skip-once semantics and completion. Do not call `requestDialogue`, `startDialogueTreeChat`, or write to `chatPhrase` / `chatTicks`.
4. Timing: no `durationMs` fields are authored in PR #91. Keep existing `lineDuration(text) = Math.max(3000, Math.min(5300, 1900 + text.length * 43))`, introductory 2400 ms and closing 2800 ms. Support `captions[i].durationMs ?? lineDuration(captions[i].text)` if later authored. Preserve per-scene reload/session isolation.
5. Tests: assert actual JSON's exact 31-line text **and order** against the previous overlay (do not duplicate 31 strings in another new file), speaker_1→performerIds[0] through speaker_10→performerIds[9] for a ten-person cast, 6–10 real actors with safe reuse for smaller casts, abort/skip once, wall-clock while simulation is paused, save/reload and no simulated chat-field changes. Run focused dialogue and Spotlight tests, typecheck, build and standard suite. Report actual results; do not claim pass before running.
6. Update the relevant ownership rows, decision registry, changelog, bug-report summary/real counts and PR body when implementation is complete. Do not alter PR #91's domain eligibility, event frequency, real movement, world/save/worker model, Chronicle rules or gameplay balance.

**Branch dependency at 2026-10-28:** PR #91 owns the overlay and JSON; PR #93 owns the functions and tests. This means PR #93's helper can be merged independently, but the actual overlay import and replacement of `LINES` requires the branches to be integrated. Do not merge all of PR #91 into PR #93 or introduce a broken cross-branch dependency merely to mark the overlay as done.
