# Function naming audit — one meaning, several names

Read-only survey of the source tree for named functions that do the same job under different names.
It complements the automated gates (`scripts/check-function-overlap.mjs`,
`scripts/check-semantic-duplicates.mjs`, jscpd): those compare *tokens*, this audit also compares the
*name* against the behaviour and the owner that already exists.

Scanned: 3,465 indexed functions across 384 source files at commit `214294c9`.

## How the list was produced

1. Rebuilt the call graph (`scripts/build-call-graph.mjs`) and re-extracted every function body.
2. Grouped bodies by a normalised shape (identifiers collapsed, keywords/punctuation kept) to find
   copies whose only difference is the names.
3. Grouped functions by calls/members/writes to catch same-behaviour bodies with different code order.
4. Clustered names by verb synonym (`get`/`read`/`resolve`, `is`/`has`, `start`/`begin`,
   `remove`/`clear`, …) and compared each cluster against the code.
5. Read every candidate body before listing it. A similarity score alone is not evidence, so
   look-alikes with different data, contracts or timing are listed separately as *not duplicates*.

Line numbers are from the commit above and will drift.

## Status — consolidated

The duplicate clusters this audit named have been merged into one function each. The canonical owner
is the module already responsible for the behaviour:

| Cluster | One owner now |
| --- | --- |
| Float sample in `[min, max)` | `randomFloat(rng, min, max)` — `simRng.ts`; `randomBetween` and `rnd` are gone |
| Smoothstep over `0..1` | `smoothstep01(value)` — `terrain/noise.ts`; the terrain, ecotone and spotlight copies are gone |
| Non-empty string guard | `isNonEmptyString(value)` — `inputGuards.ts`; `isStringId` is gone |
| Event-log line text | `formatEventLogLine(evt)` — `eventLog.ts`; both panels render it |
| Combat kind/stage | `resolveCombatLogField(evt, field)` — `eventLog.ts` |
| Spatial grid sync | `syncEntitySpatialGrid(...)` — `spatialGrid.ts`; the four grid-specific syncs are gone |
| Militia tiers | `getMilitiaTier(state, chain)` plus one balance table per armament — `militiaBalance.ts` |
| Friendship/feud score and key | `relationshipScore(e, id, kind)` and `relationshipKey(kind, id)` — `relationships.ts` |
| Hotkey predicate | `isHotkey(e, key, code)` — `hotkeys.ts` |
| First-name draw | `getRandomName(gender)` — `nameLoader.ts` |
| Grid env flags | `gridFeatureDisabled` / `runtimeEnvFlag` — `spatialGrid.ts` |
| First-gesture audio unlock | `useGestureUnlock(onGesture)` — `src/hooks/useGestureUnlock.ts` |
| `clamp` copies | canonical `clamp` from `terrain/noise.ts`; the finite-guard and rounded variants are named `clampFinite` and `clampScore` |
| Dialogue aliases | `tickDialogue` and `prepareScriptedDialogue` removed; callers use `tickHumanChat` and `clearCurrentEntityDialogue` |

Still intentionally separate (read and confirmed as different contracts): `worldToScreenX` /
`worldToScreenY` (hot-path axis split), `deltaClone` / `deltaCloneOptional` (null handling),
`isDoctorAtHospital` / `isOfficialAtHall` (domain job+building rules in their own modules), and the
`play*Sound` cues.


---

## 1. Same behaviour, different names — consolidate

These are real duplicates: same inputs and outputs, one canonical owner already exists or should.

| Behaviour | Names and locations | Evidence | Suggested owner |
| --- | --- | --- | --- |
| Float sample in `[min, max)` | `randomFloat` — `src/game/simRng.ts:310` (exported, **0 importers**)<br>`randomBetween` — `src/audio/ambient.ts:6`<br>`rnd` — `src/game/renderer/weather.ts:66` | All three are `min + rng() * (max - min)`; only the RNG stream differs | `randomFloat(rng, min, max)`; callers pass `getPresentationRng('ambientAudio')` / `getPresentationRng('weatherFx')` |
| Smoothstep over `0..1` | `smoothstep` — `src/game/terrain/noise.ts:32`<br>`smooth` — `src/game/terrain/ecotones.ts:9`<br>`fade` — `src/game/renderer/whittakerTerrain.ts:853` (local arrow)<br>`smooth` — `src/components/spotlightFarewell.ts:45` (inline) | Identical `t*t*(3-2t)` after `clamp(v, 0, 1)` (the spotlight copy omits the clamp) | One exported helper next to `smoothRange` in the terrain noise owner; `smoothRange` stays the edge-mapped wrapper |
| Non-empty string guard | `isStringId` — `src/game/saveLoad.ts:1023`<br>`isNonEmptyString` — `src/game/simWorker/commands.ts:174` | Byte-identical `typeof value === 'string' && value.length > 0` | One shared predicate (the name `isNonEmptyString` describes the check; `isStringId` claims an id rule it does not enforce) |
| Event-log line text | `formatLine` — `src/components/CombatLogPanel.tsx:18`<br>`formatEventLine` — `src/game/EventLogPanel.tsx:67` | Identical `` `Year ${displayYear(evt.year)}, Day ${evt.day} — ${evt.message}` `` | One formatter in the event-log owner; both panels import it |
| Alias that no longer matches its owner | `tickDialogue` — `src/game/dialogueTrees.ts:716` → `tickHumanChat`<br>`prepareScriptedDialogue` — `src/game/humanChat.ts:357` → `clearCurrentEntityDialogue`<br>`attempt` — local closure in `src/audio/bootstrap.ts:15` → `soundDirector.ensureIntroAudio` | Wrapper bodies are a single delegated call | Callers use the owner's name; a wrapper survives only as a documented compatibility alias |

Notes on the first row: `randomFloat` already documents itself as the canonical sampling helper, and
`randomInt`, `randomChoice` and `randomBool` live beside it, so two private copies are pure drift.

## 2. Same shape, different subject — one pattern, several names

Control flow is identical; the data, constants or domain differ. These are **not** duplicates of
meaning, but they are duplicated *implementations* that a shared helper or a documented distinction
should cover. Each pair was read in full.

| Pair | File(s) | What differs |
| --- | --- | --- |
| `isScentGridDisabled` / `isSpatialGridDisabled` | `src/game/scentGrid.ts:36`, `src/game/spatialGrid.ts:41` | Only the env flag name (`VITE_USE_SCENT_GRID` / `USE_SCENT_GRID` vs the spatial pair) |
| `getDeerParliamentChoiceEligibility` / `getTravelingTheatreChoiceEligibility` | `src/game/deerParliament.ts:102`, `src/game/travelingTheatre.ts:147` | Event choice ids and costs |
| `isDoctorAtHospital` / `isOfficialAtHall` | `src/game/hospitalCare.ts:56`, `src/game/townHall.ts:154` | Job and building type |
| `invalidateEntityByIdMap` / `invalidateCachedEntityByType` | `src/game/entityIndex.ts:34`, `src/game/entityTypeCache.ts:34` | Which cache and which `state` field |
| `syncGrassRenderGrid` / `syncTreeGrid` | `src/game/spatialGrid.ts:437`, `:455` | Grid kind |
| `syncMobileSimGrid` / `syncHumanSocialGrid` | `src/game/spatialGrid.ts:744`, `:757` | Grid kind |
| `getMilitiaSpearTier` / `getMilitiaShieldTier` | `src/game/militiaBalance.ts:50`, `:57` | Weapon vs armour tech chain |
| `getMilitiaSpearMultiplier` / `getMilitiaShieldPerAdult` | `src/game/militiaBalance.ts:64`, `:71` | Balance field per tier |
| `friendshipScore` / `feudScore` | `src/game/relationships.ts:74`, `:78` | Relationship field |
| `friendKey` / `feudKey` | `src/game/relationships.ts:22`, `:23` | Key prefix |
| `worldToScreenX` / `worldToScreenY` | `src/game/viewState.ts:607`, `:612` | Axis and viewport extent |
| `resolveCombatLogKind` / `resolveCombatLogStage` | `src/game/eventLog.ts:129`, `:134` | Event field |
| `pickEligibleRaidChoice` / `pickEligibleStoryChoice` | `src/game/virtualPlayer.ts:135`, `:150` | Event type and eligibility owner |
| `deltaClone` / `deltaCloneOptional` | `src/game/simBuffers/simDelta.ts:214`, `:218` | Null handling |
| `getSimRng` / `getPresentationRng` | `src/game/simRng.ts:283`, `:296` | Deterministic vs presentation stream |
| `getRandomMaleName` / `getRandomFemaleName` / `getRandomSurname` | `src/game/nameLoader.ts:259`, `:263`, `:267` | Name pool |
| `isLogisticsHotkey` / `isCouncilHotkey` | `src/game/hotkeys.ts:56`, `:69` | Hotkey constants |
| `resetPathfinderTickMetrics` / `resetSpatialQueryTickMetrics` | `src/game/pathfindingMetrics.ts:116`, `src/game/spatialQueryMetrics.ts:124` | Metric store |
| `playBuildSound` / `playDeathSound` / `playBirthSound` / `playMarriageSound` / `playUpgradeSound` / `playResearchCompleteSound` | `src/audio/sfx.ts` | Three-tone cue values |

Also in this class, but with the *same* name in each file (so out of the "different names" brief):
`clamp` is defined four times (`src/game/terrain/noise.ts:100` exports one;
`src/game/rivalProfiles.ts:7`, `src/game/factionWander.ts:14` and `src/game/villagePortrait.ts:32`
re-declare it), and `unlockOnGesture` is copied in `src/game/IntroScreen.tsx:211` and
`src/game/MapSetupScreen.tsx:180`.

## 3. Synonymous names for genuinely different responsibilities — disambiguate

Read and confirmed as different behaviour. The names are close enough that a caller can pick the
wrong one.

| Name A | Name B | Why they differ |
| --- | --- | --- |
| `startPregnancy` (`src/game/pregnancy.ts:44`) | `beginPregnancy` (`src/game/simulation/humanRelationships.ts:677`) | A mutates the entity's pregnancy fields; B orchestrates the conception event, flash, particles, log and notification and then calls A |
| `isDynasty` (`src/game/familyLegacy.ts:57`) | `hasDynasty` (`src/game/familyLegacy.ts:62`) | A tests one dynasty record; B scans the whole colony for any dynasty |
| `loadSprite` (`src/game/spriteLoader.ts:52`) | `getSprite` (`src/game/spriteLoader.ts:86`) | A is the async loader with caching and in-flight de-duplication; B is a synchronous cache read |
| `readPresentationDialogue` (`src/game/dialogueTrees.ts:342`) | `getPresentationDialogue` (`src/game/dialogueTrees.ts:421`) | A validates and freezes raw source; B returns the already-indexed scene |
| `findBuilding` (`src/game/factionWander.ts:22`) | `findPlayerBuilding` (`src/game/buildingStaffingActions.ts:91`), `resolveBuilding` (`src/game/viewState.ts:173`) | A picks a random completed player building of given types; the other two look up one building by id |
| `humanById` (`src/game/housingModel.ts:201`), `byId` (`src/game/familyTree.ts:229`), `livingById` (`src/game/prisonGuardDuty.ts:43`), `byId` (`src/game/simulation/humanSocial.ts:100`) | — | Three different entity lookups (any entity, alive human only, alive only) plus a sort comparator sharing the same short name |
| `getVolumePreset` (`src/audio/graph.ts:97`, `director.ts:112`, `index.ts:92`) | `loadVolumePreset` (`src/audio/preferences.ts:19`) | A reads live graph state; B reads persisted preferences |

The `audio/index.ts` pass-throughs (`ensureIntroAudio`, `getVolumePreset`, `setMute`, `toggleMute`, …)
are a deliberate public facade over `SoundDirector`; they are listed here only because their names
repeat the owner's.

## 4. Already reviewed as intentional

These look-alikes are recorded as distinct in `docs/tools/semantic-duplicates-reviewed.json` and
`docs/tools/semantic-overlap-reviewed.json` and were not re-opened:
`pushToGroup` / `pushId`, `ConfirmActionDialog` / `SubjectWindow`,
`resolveSessionSpeaker` / `byId`, and the genealogy path-compression vs delta field-coverage group.

## 5. Not duplicates — checked and cleared

`countArmedMilitia` / `getMilitiaStrength` (different fields of one breakdown),
`getRepairBuildingEligibility` / `getRepairBuildingEligibilityFor` (id overload),
`getHumanStatusCombatIcon` / `getHumanStatusCombatIconFromFlags` (flag-building adapter),
`EntityCatalog.getAliveHumans` / `resolveAliveHumans` (catalog-optional adapter),
`tickDialogue` / `prepareScriptedDialogue` (tick vs clear, despite the identical signature),
`validDay` / `validSite` (different bounds), `bounded` / `count` (clamp vs passthrough),
`getPartnerWaitTicks` / `getFirstCaravanDelay` (different durations).

## Follow-up

Sections 1 and 2 are now implemented: the duplicates were merged into the owners listed under
*Status — consolidated*, and their callers, tests and ownership entries were migrated with them.
The remaining rows in section 2 are the pairs kept apart on purpose above.
