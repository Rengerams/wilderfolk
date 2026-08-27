# Wilderfolk — Full Game Product, Code, Simulation, and Terrain Review

**Review date:** 27 August 2026  
**Reviewer:** Manus AI  
**Repository target:** Wilderfolk development tree, target 0.6.3.1  
**Review posture:** Experienced simulation/strategy-game production review; read-only audit with automated validation and representative visual inspection. No source behavior was changed by this review.

## Executive assessment

Wilderfolk has a strong foundation for a simulation-led settlement strategy game. The project already demonstrates unusually explicit ownership rules, a fixed cadence model, a worker-authoritative state boundary, deterministic world generation, broad invariant coverage, and a substantial amount of player-facing content. The architecture is not a prototype held together by a single loop: it has separated domain modules for relationships, lifecycle, workforce, ecology, buildings, events, terrain, pathfinding, rendering, persistence, worker transport, and diagnostics.

The principal product risk is no longer “does the game contain enough systems?” It is **whether the player can understand and strategically steer the systems that already exist**. The roadmap correctly identifies diagnostics, explainable choices, worker/save truth, selected-settler inspection, seeded health scenarios, resource-flow visibility, and movement traces as the highest-value next steps. These should take priority over adding another major simulation subsystem.

The principal technical finding from the initial baseline was a worker transport test failure caused by the Node adapter using top-level `await` in a CommonJS-transformed Vitest path. The repository’s bug report documents the repair: an asynchronous bootstrap now buffers early messages until the shared worker installs its handler. After the repair, the targeted transport test and the complete test suite passed. This finding is therefore **resolved**, not an outstanding release blocker.

| Dimension | Assessment | Confidence | Main implication |
|---|---:|---:|---|
| Simulation architecture | Strong, with high integration complexity | High | Preserve ownership law; invest in observability and contract tests |
| Simulation correctness | Good automated evidence; long-run truth is promising | High | Expand seeded health and worker/main-thread parity scenarios |
| Worker transport | Repaired and verified | High | Keep regression coverage; do not reintroduce top-level-await startup paths |
| Terrain generation | Ambitious and deterministic, with clear river/mountain intent | High | Improve local algorithms and validate connectivity/readability at map scale |
| Terrain presentation | Rich, readable, but rendering-heavy and layered | Medium-high | Measure bake cost and reduce repeated passes without losing clarity |
| Player experience | Deep systems, insufficient explanation at decision points | High | Make “why” and “what changed” a core product layer |
| Delivery health | Builds; tests pass; tooling has configuration noise | High | Fix audit scope and TypeScript 7 dependency-cruiser compatibility |
| Product readiness | Strong development foundation, not yet fully legible to new players | Medium-high | Prioritize clarity, recovery, and acceptance evidence before feature breadth |

## Scope and evidence

The review covered the repository guidance, active roadmap, simulation authority, project manifest, source tree, tests, worker transport, terrain generation, terrain baking/decor, representative visual assets, build output, and automated test results. The source inventory found **274 TypeScript/TSX files and approximately 58,136 source lines** under `src/`. The repository contains a large simulation core under `src/game/`, a React/Pixi presentation layer, worker transport code, persistence and migration code, extensive tests, 203 PNG assets, 5 MP3 files, 2 OGG files, 5 WAV files, and one JPG in the inspected public/source asset areas.

The final automated evidence is strong:

| Check | Result | Interpretation |
|---|---:|---|
| Targeted `tests/gameWorker.transport.test.ts` | 1 file passed, 1 test passed | The repaired Node worker bootstrap works under the test runner |
| `npm test` | 92 files passed, 487 tests passed | Broad regression suite is green |
| `npm run build` | Passed | Production bundle can be generated |
| `npm run test:types` | Passed | Vitest TypeScript configuration type-checks |
| Duplicate-code audit | Passed; 0 clones reported | No significant duplication detected under configured thresholds |
| Dependency audit | Exit 0, but incomplete | Tool warns that installed TypeScript 7 is outside its supported range |
| Lint audit | Not a clean signal | The command scanned generated `tmp/` fixtures and reported noise/errors outside the product source |
| Full-year integration | Passed in the earlier baseline | 360-day, 25,920-tick seeded run completed without invariant violation |

The working tree was already non-clean before the review. It contained tracked changes to package/configuration files, a modified worker adapter, a deleted `buildcheck.gypi`, untracked package files, `Agents.md`, and generated temporary output. These changes must not be attributed to this audit as authored modifications.

## 1. Product identity and strategic strengths

Wilderfolk’s strongest identity is a **living valley whose inhabitants, ecology, work, relationships, leadership, threats, and terrain interact over time**. The project’s systems support emergent stories rather than a purely decorative city builder. Relationships include courtship, marriage, affairs, scandals, youth love, pregnancy, birth, family references, social feedback, and diagnostics. The settlement layer includes workforce assignment, housing, construction, civic staffing, leadership, defense, venues, education, hospitals, hotels, requests, festivals, and story events. The ecology layer includes wildlife, grass, trees, forage, rivers, mountains, hunting, animal care, and ecosystem pressure. This is a valuable differentiator.

The current danger is that systemic richness can become **opaque complexity**. A player may experience a settler commuting, failing to work, changing residence, becoming involved in a story, or being blocked by a resource condition without understanding the causal chain. The roadmap’s O1–O5 priorities are therefore not secondary polish. They are the product work required to convert simulation depth into strategy.

Using the game-design filter, Wilderfolk is strongest on **Motivation** and **Fit**: persistent people, family histories, rare threats, and seasonal ecology give actions meaning and support the valley’s identity. It is weaker on **Clarity** and sometimes **Response**, because a typed command or a visible status does not always appear to expose the complete reason, authoritative state, or next recovery action. **Satisfaction** is supported by events, dialogue, visual terrain, audio assets, and feedback modules, but major outcomes need consistent multi-channel confirmation.

## 2. Architecture review

### 2.1 Simulation authority and cadence

The authority documents are a major strength. The project declares a single worker-owned `WorldState` when the worker is active and restricts mutations to `gameTick()`, `applyWorkerCommand()`, or named transitions called by those boundaries. It also fixes four layers: realtime, systems, assignment, and daily. The explicit ban on casually adding `tickLayerSocial.ts`, `tickLayerPregnancy.ts`, or similar convenience layers is healthy: it protects cadence clarity and prevents rules from becoming scattered across duplicate schedulers.

`gameTick.ts` is appropriately thin relative to the breadth of the game. It advances the calendar, derives season and modifiers, builds indexes and context, runs the fixed layers, reconciles births/deaths and denormalized counts, maintains workforce totals, rebuilds type indexes when composition changes, and flushes metrics. The ordering is readable and tested. The main architectural risk is **coordination surface area**: hundreds of modules can still create subtle cross-owner assumptions even when the top-level structure is sound. The next quality investment should be contract matrices and owner-level transition tests rather than another manager or event bus.

### 2.2 Worker transport and reconciliation

The worker system is thoughtfully designed. `gameWorker.ts` handles initialization, simulation preparation, save import/export, typed commands, ticks, render-buffer packing, scent sidecars, pause/speed updates, and UI patches. `GameWorkerHost.ts` manages readiness, in-flight ticks, held buffers, pending commands, idle waiters, and authoritative reconciliation. The worker path supports both browser rendering and headless transport tests.

The repaired issue was localized to `gameWorker.node.ts`. Top-level `await import('./gameWorker.ts')` was incompatible with the CommonJS-compatible transform used by the transport test. The repair moved startup into an asynchronous bootstrap and buffered early parent-port messages until `gameWorker.ts` finished installing `self.onmessage`. This is the correct shape of fix because it addresses the transform boundary without weakening worker authority or dropping early `init` messages. The bug report confirms that command, tick, invalid-command, export, worker-authority, and startup-order invariants were considered.

The remaining worker risks are integration risks, not evidence of a current failure. They should be tested as a matrix: command arriving during a tick, multiple commands before a tick result, held render-buffer exhaustion, worker restart after failure, save export while a command is pending, optimistic display reconciliation, malformed command payloads, and fallback parity. The repository authority explicitly says an older tick delta must not overwrite a newer command result; that invariant deserves a dedicated high-stress test rather than only ordinary round trips.

### 2.3 Domain ownership and mutation hygiene

The ownership map is unusually clear. Workforce is owned by `workforce.ts`; construction is divided between command/crew transitions and daily progress; relationships and conception are separated from lifecycle and birth; Moon Howler state is isolated; leadership and residency have named owners; diagnostics are read-only. This is the right approach for a simulation where one accidental second mutation path can create unreproducible states.

The static mutation scan identified concentrated mutation activity in expected authoritative modules such as `moonHowler.ts`, `humanRelationships.ts`, `humanTick.ts`, `dayCycle.ts`, `workforce.ts`, `buildingActions.ts`, and lifecycle files. It also found some UI-side mutation matches, including selected panels and app files. Those matches may be presentation state or optimistic display copies, and the authority document allows temporary optimistic display through the same domain implementation. Nevertheless, they are worth keeping under a narrow rule: every UI-side entity mutation should be either clearly presentation-only, a documented optimistic projection, or replaced by a typed command. This should be enforced through code review and a lightweight architectural test.

### 2.4 Persistence and save truth

The existence of `saveLoad.ts`, `saveSchema.ts`, `migration.ts`, delta extraction/application, preparation sync, and save-version tests is a strong foundation. The roadmap correctly recognizes that local module correctness is not enough: a field can work in the live worker but disappear from deltas, save serialization, load normalization, or UI projection.

The highest-value persistence improvement is the O3 contract matrix. It should cover stories/campaign, elections, animal care, residence, workforce/staffing, family references, pregnancy, defense, venue schedules, active requests, and any durable diagnostic state. For each field, the matrix should name owner, mutation boundary, delta extraction, delta application, serialization, normalization, UI reader, invalid-input behavior, and test. This is more useful than a broad rewrite and directly protects the game’s long-running colony promise.

## 3. Simulation logic review

### 3.1 Calendar and cadence

The project’s 72 simulation ticks per in-game day are treated as a public contract. `gameTick.ts` derives day, season, year rollover, yearly statistics, grass growth, reproduction, winter penalties, and daily boundaries. This is a sound foundation because strategy pacing depends on consistent temporal semantics. The daily boundary is also a useful player-facing rhythm: it can become the basis of a Daily Council Report that explains net resources, housing, births, deaths, assignments, relationships, stories, raids, and unresolved warnings.

A subtle risk is that cadence correctness can be tested while **decision visibility** remains weak. The simulation may faithfully process a daily transition, but the player may not know which decisions were made or why. The product should treat daily summaries and selected-settler transition history as read-only projections of the existing cadence, not as additional simulation systems.

### 3.2 Workforce, housing, and assignment

Workforce is one of the project’s most important strategic systems. The authority protects core invariants: no living human appears in multiple occupant lists, occupants agree with `homeBuildingId`, manual buildings are not generic auto-staffed, the Church remains manually staffed, the leader can retain office/residency while working, and demolitions clean assignments and selection. Dedicated tests cover workforce transitions, Church staffing, leader behavior, commands, and leadership.

The main product gap is not likely assignment correctness; it is **assignment explanation**. Rejection reasons should be first-class results with stable codes and authoritative current values. A player needs to distinguish capacity, manual protection, duplicate assignment, juvenile status, imprisonment, invalid workplace, missing housing, or a special event interruption. A workforce policy layer is promising later, but policy presets should come only after the current assignment reasons and overrides are visible and trustworthy.

### 3.3 Relationships, lifecycle, and family

The relationship system is deep and unusually well instrumented. The code and tests distinguish courtship, marriage, youth love, affairs, gossip, scandal, conception candidates, active pregnancies, and completed births. The authority protects conception as a single-owner decision and birth as a lifecycle-owner decision. The full-year run and relationship diagnostics provide meaningful evidence that long-run relationship simulation is being exercised rather than only unit-tested.

The complexity risk is high because `humanRelationships.ts`, `humanTick.ts`, `dayCycle.ts`, lifecycle modules, social modules, family cleanup, and diagnostics must agree on cadence and state. The highest-value tests are family-reference removal scenarios, pregnancy save/load round trips, conception-to-birth traces, and worker/fallback parity over multiple daily boundaries. The roadmap’s P7 Family Reference Coverage is particularly important for a game built around legacy and social memory.

### 3.4 Ecology, wildlife, and animal care

The ecology architecture uses named owners and existing tick layers rather than proliferating schedulers. Blueberry foraging is explicitly bounded by the existing tree grid, staggered target search, yield range, regrowth timing, and player-priority conditions. Animal care is separated as a named domain owner while taming and follow behavior remain with their existing owners. This is a good example of extending the game without breaking authority.

The key design concern is that ecology must be both **simulation truth and player-readable geography**. If a tree, hunting spot, river, or animal-care state matters strategically, the player needs a way to locate it, understand its current condition, and know whether the bottleneck is distance, season, yield, workforce priority, storage, or danger. An infrastructure/logistics overlay and resource-flow panel would connect ecology to settlement planning.

### 3.5 Threats, Moon Howler, combat, and defense

The Moon Howler design is strong because it preserves rarity, continuity, and consequence: at most one living cursed Howler, the same survivor returns, cure or death can make later full moons quiet, and replacement is not guaranteed. This is exactly the type of rare event that creates memorable stories without becoming a predictable monthly tax.

Defense systems include patrol detection, standing militia, watchtowers, walls, raids, frontier combat, and balance logic. The main risk is feedback alignment. The player must see the difference between a detected enemy, a patrol reveal, a militia calculation, a raid threat, and a combat resolution. Defense should be evaluated through a readable threat timeline and explicit recovery options, not only through counters or event text.

### 3.6 Determinism and seeded simulation

World generation and simulation use seeded random helpers and named streams. The roadmap’s T3 Unified Deterministic RNG Helpers is justified. The current code has a local Park–Miller generator in `terrainGen.ts` plus shared simulation RNG use, which is workable but creates two patterns that should be documented and tested. A unified helper convention should specify stream naming, seed derivation, draw ownership, and whether adding a draw in one system is allowed to perturb unrelated systems.

The strongest future evidence will be seeded snapshots at daily checkpoints: population, resources, buildings, assignments, relationships, events, ecology, threats, and digest values. The goal is not to freeze every incidental ordering detail, but to make meaningful state changes explainable and reproducible.

## 4. Terrain generation and terrain logic

### 4.1 Generation strengths

`terrainGen.ts` has an explicit pipeline: seeded elevation/moisture fields, temperature, preset modifiers, smoothed elevation for river routing, peak detection, peak-fed rivers, a guaranteed primary river, shore/bank marking, terrain type assignment, mountain clustering, camp clearing, buildability checks, and campsite search. This is a strong design direction for a strategy game because terrain is not merely visual: it affects building placement, routes, ecology, water readability, and settlement identity.

The river logic has clearly been iterated to solve real readability problems. Rivers are forced into a continuous primary north-to-south spine, peak-fed tributaries are widened, diagonal paths receive bridge cells, banks are marked, and the terrain renderer adds a clarity pass. Mountain clustering similarly removes isolated peaks and fills high-elevation gaps to make ridges read as regions rather than noise.

### 4.2 Generation risks and recommendations

The local noise implementation is fast and deterministic, but it is a sine/cosine hash-like field rather than a conventional coherent noise field. That is acceptable for a stylized game if the output is consistently validated, but it can create directional artifacts, repeated bands, or weakly connected biome shapes. The correct next step is not automatically replacing it. First measure map quality across many seeds using metrics such as buildable-land percentage, water percentage, largest connected buildable region, river length, mountain cluster count, starting-area accessibility, forest fragmentation, and preset differentiation. Replace or augment the field only if those measurements show player-visible failures.

The `forEachTileInRadius` helper loops over the entire tile grid and filters by distance. That is safe and easy to reason about during generation, but it is an avoidable cost for large maps and is used by clearing operations. Replace it with bounded index ranges around the radius while preserving exact inclusion semantics. This is a low-risk optimization because it does not change the simulation cadence or game rules; it only avoids examining obviously out-of-radius cells.

`findCampSite` uses a spiral search followed by increasingly broad scans. This is robust as a fallback, but the final scan can become expensive on large maps, especially when buildability is sparse. A precomputed buildability integral grid, connected-region map, or sampled candidate list would provide better scaling. The failure behavior of returning the preferred position when no site exists should remain explicit and surfaced to the player; otherwise the game can create a visually or strategically invalid opening.

The current mountain and river rules use several fixed thresholds and neighborhood sizes. These are plausible starting values, not universal standards. They should be validated per map preset with seed batches and acceptance bands. The important design target is not a particular percentage; it is that each preset produces a recognizable strategic geography without trapping the founding camp or turning every map into the same river-and-forest composition.

### 4.3 Terrain rendering and visual quality

`terrainLayer.ts` is ambitious. It supports view rectangles and LOD, terrain atlas stamping, material-family blending, relief sorting, seasonal washes, water punch-outs, water glaze, river clarity glints, shoreline reflections, deterministic clutter, mountain sprites, snow mounds, sand ripples, and map-rim treatment. The visual strategy is coherent: use a textured base where available, procedural fallback where necessary, and reinforce gameplay-critical materials such as water, rivers, snow, beaches, and mountains with additional readability layers.

Representative asset inspection found a compact grass atlas containing terrain, water, paths, structures, trees, fences, and building-like sprites. It is visually readable at native size, with a saturated green base and strong blue water separation. The mixed atlas is also a maintenance risk because it combines multiple material and object families in one sheet. The beach/shallow-water tile inspected had a clean silhouette and transparent background, but the pale sand-to-shallow-water relationship warrants grayscale and native-size checks across straight, inner-corner, outer-corner, and junction variants.

The primary rendering risk is **pass accumulation**. The terrain bake may traverse visible tiles multiple times for the base, relief, shallow/deep transitions, LOD patchwork, seasonal water-hole collection, water glaze, and river clarity. The decor bake separately traverses the map for river strokes, shore reflection, clutter, mountain peaks, and the rim. This is understandable because each pass solves a readability problem, but it needs measured budgets. Capture bake time by map size and LOD, canvas allocation size, visible tile count, draw-call-like operation counts, and invalidation frequency. Cache only what is stable; do not sacrifice season, water, or river readability for a premature one-pass rewrite.

The visual treatment has three notable strengths: rivers receive explicit contrast protection, relief cues communicate 2.5D height, and deterministic prop placement prevents the map from looking like a repeating random texture. Three defects to guard against are: low-contrast beach/shallow transitions in grayscale, clutter competing with buildings and roads at normal zoom, and repeated large mountain sprites becoming a visual wall. The acceptance process should inspect the terrain at native size, normal play zoom, reduced overview zoom, and grayscale, with the settlement, roads, and selected entities visible rather than terrain alone.

### 4.4 Terrain/gameplay coupling

Terrain is correctly connected to buildability, camp placement, pathfinding, road avoidance, tree grids, hunting, ecology, and render overlays. The risk is that different systems may use slightly different spatial assumptions: terrain uses 10-pixel tiles in buildability checks, terrain maps use `TERRAIN_TILE_SIZE`, entities use spatial grids, and renderer relief can shift apparent positions. The project should document one coordinate contract and add tests for terrain-to-world conversion at boundaries, negative/out-of-map positions, footprint edges, raised terrain, roads crossing banks, and buildings placed next to water or mountain edges.

## 5. Rendering, UI, audio, and presentation

The renderer is well factored into focused modules for animals, buildings, entities, grass, grid, humans, markers, night effects, overhead layout, overlays, particles, terrain, trees, weather, and shared drawing. This decomposition is preferable to a single monolithic renderer. The challenge is presentation hierarchy: when many systems produce labels, dialogue, weather, terrain props, markers, status effects, event notices, and selection overlays, the player can lose the important signal.

The roadmap’s O1, O4, P3, P4, P5, P6, and F8 priorities form a coherent presentation layer. The selected-settler inspector should show current activity, home, workplace, schedule, target, blocked reason, latest transition, and the authoritative source of the information. The diagnostics drawer should be optional and calm by default, with a debug mode for daily and cumulative reports. The player-facing version should not look like a developer console.

Audio is present and includes work-detection and interaction coverage. The game-design requirement for significant actions is at least two feedback channels. For assignment, construction completion, danger detection, major relationship changes, birth, death, Moon Howler return, and story resolution, aim for a visual state change plus an audio or readable event cue. Avoid adding noise to ordinary ticks; reserve strong feedback for state transitions.

The product should also add an accessibility pass. The existing information density and pixel-art palette make contrast, text scaling, focus order, keyboard navigation, non-color status indicators, and reduced-motion behavior important. This is especially relevant for diagnostics, alerts, resource warnings, and selected-entity status.

## 6. Performance and package health

The build succeeds and produces a meaningful chunked output. The reported production assets include a 431.27 kB worker chunk, approximately 637.07 kB game-render chunk, approximately 628.33 kB game-ui chunk, approximately 217.27 kB index chunk, approximately 189.60 kB React chunk, and approximately 108.98 kB game-data chunk before gzip. The roadmap’s T2 Smaller Initial Game Bundle is therefore well founded. The renderer and UI chunks are the clearest candidates for lazy loading and route/panel boundaries, but the worker must remain available early enough to preserve startup responsiveness.

The project’s full-year test is valuable: it exercised 360 days and 25,920 ticks with a fixed seed and completed without invariant violation in the observed baseline. However, long-run correctness is not the same as scale performance. The proposed P2 scenario should capture p50/p95/max tick time, path calls, delta size, memory trend, fallback count, render-buffer pressure, and console volume for small, medium, large, and huge maps. It should also separate warm-cache from cold-cache terrain bake time.

The dependency audit reports no violations but warns that the installed TypeScript 7 toolchain is outside the analyzer’s supported TypeScript range, so the result is not fully trustworthy. The roadmap’s T1 should either update the dependency analyzer or explicitly document a supported compatibility mode. The lint command also scanned generated `tmp/` fixtures created during the review environment and reported many unrelated warnings/errors. The project should exclude generated audit artifacts and temporary fixtures from lint/type-aware analysis, or write them outside the repository. A clean health command must distinguish product-source findings from tool-generated test fixtures.

The duplicate-code audit reported zero clones under its configured thresholds. This is positive, but it should not be interpreted as proof of ideal abstraction. In a simulation, semantically duplicated rules can differ while remaining textually distinct. Ownership and contract tests are more important than clone percentages.

## 7. Highest-priority findings

| Priority | Finding | Severity | Why it matters | Recommended action |
|---:|---|---|---|---|
| P0 | Player-facing explanation is behind simulation depth | Product blocker for onboarding and strategic mastery | Players cannot reliably predict, diagnose, or recover from complex state transitions | Complete O1/O2/O4 and make stable reason codes a shared presentation contract |
| P0 | Worker/save/delta field parity needs one contract matrix | Truth/release risk | A correct local owner can still lose state across worker deltas or saves | Implement O3 matrix and seeded parity tests |
| P1 | Large-map and long-run performance evidence is incomplete | Scale risk | Existing full-year success does not prove huge-map browser performance | Implement O4/P2 metrics with memory, path, delta, and bake measurements |
| P1 | Terrain generation has avoidable whole-grid radius scans | Performance risk | Camp-clearing and similar operations can scale poorly on large maps | Bound radius iteration and benchmark before/after |
| P1 | Terrain bake/decor uses many full visible-map passes | Rendering risk | Layered readability can become frame or rebuild cost | Instrument bake passes and invalidation frequency; optimize only measured hotspots |
| P1 | Terrain coordinate contracts are distributed | Correctness risk | Buildability, relief, pathfinding, spatial grids, and rendering can disagree at edges | Add conversion and boundary tests; document tile/world/relief conventions |
| P1 | Tooling health commands are not isolated from generated files | Delivery risk | Lint and analysis output can be noisy or misleading | Exclude `tmp/`, generated fixtures, and artifacts; fix TypeScript 7 analyzer support |
| P2 | Mixed terrain/prop/building atlas organization | Art pipeline risk | Lookup, scaling, and asset maintenance become harder as content grows | Split by material/object family or generate documented atlas metadata |
| P2 | Preset differentiation needs batch evidence | Design/balance risk | Fixed thresholds may produce presets that feel too similar or unreliable | Add multi-seed geography metrics and map-preview acceptance checks |
| P2 | Defense and rare-event feedback needs a unified threat timeline | Readability risk | Detection, militia, raids, and Moon Howler consequences can blur together | Add a calm event/threat history with recovery actions |
| P2 | Accessibility and normal-zoom acceptance are not yet a visible release gate | Presentation risk | Dense strategy UI and pixel art can fail at actual play scale | Add WCAG-oriented UI checks and normal/reduced/grayscale visual checklist |

## 8. Recommended production sequence

### Phase A — Make the existing simulation legible

Finish the diagnostics drawer and selected-settler inspector without changing simulation rules. Resolve selected entities from authoritative worker state first. Show activity, home, workplace, schedule, target, blocked reason, latest transition, tick, response latency, and worker/fallback mode. Then standardize typed action results so staffing, construction, housing, story choices, animal care, and other blocked actions expose stable reason codes, human-readable explanations, current/required values, and recovery hints.

### Phase B — Prove truth across boundaries

Create the O3 contract matrix for durable fields and add seeded worker-versus-fallback parity scenarios. Include active requests, venue schedules, residence, staffing, family references, pregnancy, elections, stories, campaign projection, animal care, defense, and diagnostics. Verify command result precedence when ticks and commands overlap. Keep save compatibility unchanged unless a separate explicit decision is made.

### Phase C — Measure the whole package at scale

Add seeded 100-day colony-health and huge-map performance runs. Report p50/p95/max tick time, path calls, delta bytes, memory trend, render-buffer pressure, fallback count, console volume, terrain bake time, and invalidation count. Keep normal mode quiet and make verbose output opt-in. Pair every headless measurement with one browser acceptance run because a passing headless simulation does not validate camera scale, UI hierarchy, asset readability, or worker presentation reconciliation.

### Phase D — Improve terrain and logistics as strategy

After measurement, optimize bounded terrain scans and terrain baking where data identifies a real cost. Add infrastructure/logistics visualization showing roads, commute pressure, blocked paths, supply routes, and poorly connected buildings. Use terrain presets as strategic identities: coastal should change food, trade, and defense geography; mountainous should change mining, travel, and shelter; riverlands should change agriculture and crossing decisions; arid and harsh should change preparation and risk. The terrain must affect choices, not only appearance.

### Phase E — Add higher-level colony planning

Once explanations and measurement are reliable, build the Colony Operations Center, Daily Council Report, workforce policy presets, settlement memory, preparation-window crises, replay/what-changed mode, and shared Why interaction layer. These features will have much more value once the player trusts the underlying state and can see the consequences of decisions.

## 9. Focused acceptance tests for the next milestone

| Scenario | Pass condition |
|---|---|
| New player starts a verdant map | The player can identify buildable land, water, camp, roads, and the next useful action without debug knowledge |
| Settler commutes to work | Inspector shows home, workplace, route/target, current activity, and any blocked reason consistently |
| Staffing rejection | The game states the exact authoritative gate and shows a recovery action where possible |
| Unaffordable story choice | The choice remains visible when authored to persist and explains missing resource/condition |
| Worker command during tick | The command result cannot be overwritten by an older tick delta |
| Save/load after daily boundary | Durable story, residence, staffing, relationships, pregnancy, animal-care, and election state survives or normalizes explicitly |
| Full moon after Howler cure/death | The game does not guarantee a replacement and communicates quiet or rare outcomes clearly |
| Large-map terrain bake | Bake time and memory remain within measured budget; water, rivers, beaches, mountains, and settlement remain readable |
| Grayscale and reduced zoom | Buildings, roads, people, water, and selected state remain distinguishable by value, silhouette, or redundant indicators |
| 100-day seeded colony | No invariant violations; health report separates conceptions, active pregnancies, births, deaths, assignments, stories, threats, and resource flow |

## 10. Final verdict

Wilderfolk is a technically serious and creatively differentiated simulation game with a solid foundation. Its strongest achievement is **disciplined simulation ownership without giving up rich social and ecological behavior**. The repaired worker bootstrap confirms that the project is actively maintaining the transport boundary rather than ignoring it, and the green final suite provides meaningful confidence: **92 test files and 487 tests passed after the repair**.

The game is now at the stage where the best production decision is not to add more invisible complexity. The best decision is to make the existing complexity observable, explainable, testable across boundaries, and strategically consequential. If the team completes diagnostics, explainable blocked actions, worker/save truth contracts, seeded health/performance baselines, and normal-zoom presentation acceptance, Wilderfolk will be in a much stronger position to turn its systems into a memorable player experience.

> **Recommendation:** Treat “the valley explains itself” as the next product milestone. Preserve the current authority and cadence architecture, make every important refusal and transition legible, prove durable state across worker/save boundaries, then expand the strategic layer with logistics, crises, memory, and replay.

## References

[1]: `Agents.md` — repository session authority and simulation ownership rules  
[2]: `docs/SIMULATION_AUTHORITY.md` — worker authority, cadence, invariants, and forbidden changes  
[3]: `Roadmap_V0_6.3.1.MD` — active product roadmap and evidence-based objectives  
[4]: `package.json` — build, test, lint, duplication, and dependency-audit scripts  
[5]: `src/game/gameTick.ts` — calendar, fixed layer orchestration, indexes, and post-tick reconciliation  
[6]: `src/game/simWorker/gameWorker.ts` — shared worker request handling and authoritative result packaging  
[7]: `src/game/simWorker/gameWorker.node.ts` — Node worker bootstrap repaired during this review period  
[8]: `src/game/simWorker/GameWorkerHost.ts` — browser worker host and main-thread reconciliation  
[9]: `src/game/terrainGen.ts` — seeded terrain generation, rivers, mountains, buildability, and camp placement  
[10]: `src/game/terrainLayer.ts` — terrain baking, relief, seasonal treatment, water/river clarity, and decor  
[11]: `BUG_REPORTS/BR-W-game-worker-top-level-await-2026-08-27.md` — documented worker transport root cause, repair, and verification  
[12]: `tests/gameWorker.transport.test.ts` — end-to-end Node worker transport regression test  
[13]: `tmp/audit_npm_test_after_repair.log` — final full-suite evidence: 92 files and 487 tests passed  
[14]: `tmp/audit_npm_run_build.log` — successful production build and chunk-size evidence  
[15]: `tmp/terrain_visual_findings.md` — representative terrain asset inspection notes
