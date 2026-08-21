# JavaScript Dialogue Package Research

**Date:** 2026-08-21  
**Scope:** JavaScript dialogue packages suitable for Wilderfolk’s worker-authoritative, deterministic settlement simulation.

## Conclusion

> **Do not replace the current runtime with a package now.** Retain the existing compact JSON dialogue-tree runtime for ambient settler conversations. If a writer-facing branching authoring workflow becomes necessary, trial **Ink + `inkjs`** only for bounded authored events such as petitions, elections, festival scenes, and quest-like village requests.

## Candidates

| Candidate | Evidence | Fit for Wilderfolk | Decision |
|---|---|---|---|
| **`inkjs` / Ink** | `inkjs` is a JavaScript port of Ink, has zero runtime dependencies, works in browsers and Node.js, and exposes a `Story` runtime, choices, variables, and function evaluation. The published npm package reports version 2.4.0, MIT license, and modification on 2026-02-17. [1] [2] | Can run inside the simulation worker, with one `Story` per bounded authored event. Its compiled JSON inputs and explicit state make deterministic integration practical if random selections remain owned by Wilderfolk. It is excessive for high-frequency ambient chatter. | **Best optional package** for hand-authored branch events; run a proof-of-concept only. |
| **Yarn Spinner** | Yarn Spinner provides a writer-friendly screenplay-like dialogue language and compiler. Official support focuses on Unity; the core repository directs games to engine-specific packages. The old `yarnspinner2js` npm package reports version 0.1.1 and last modification in 2024. [3] [4] [5] | Good writer experience, but no current official browser/TypeScript runtime is documented. Using the old JavaScript converter would add integration and maintenance risk. | **Reject for current web game.** Revisit only if official JS support appears. |
| **Current JSON dialogue trees** | Wilderfolk has 95 shipped alternating two-speaker trees, a worker-owned session lifecycle, spatially staggered partner search, and direct rendering from transient `chatTicks`/`chatPhrase` state. | Already matches deterministic tick ownership, save discipline, worker execution, and low per-tick cost. | **Keep as the ambient dialogue runtime.** |

## Safe adoption boundary for Ink

If an Ink proof-of-concept is approved, use it for a new `NarrativeEventSession` owner in the worker, not for every citizen interaction.

1. Compile `.ink` files to JSON during development or build time; do not compile during every simulation tick.
2. The worker creates a session only after an existing simulation owner emits an approved event intent.
3. Wilderfolk owns all random rolls, resource changes, relationship changes, and event-log writes. Ink receives read-only facts and emits tagged choices or narrative lines.
4. Persist the session JSON/state only when the event must survive save/load; otherwise treat it as transient like current chat sessions.
5. Continue using `humanChat.ts` for ambient two-person exchanges, reactions, and short visible bubbles.

## Non-negotiable integration constraints

- No browser-only APIs in worker simulation code.
- No hidden package-side random number generation for game outcomes.
- No package writes to `WorldState` outside canonical Wilderfolk owner modules.
- No full-population dialogue evaluation each tick; preserve spatial grid and cadence throttling.
- New package use requires a governed bug/feature report, deterministic save/load test, worker test, and build-size check.

## References

[1]: https://github.com/y-lohse/inkjs "inkjs README"
[2]: https://github.com/inkle/ink "Ink official repository"
[3]: https://docs.yarnspinner.dev/ "Yarn Spinner documentation"
[4]: https://github.com/YarnSpinnerTool/YarnSpinner "Yarn Spinner core compiler"
[5]: https://www.npmjs.com/package/yarnspinner2js "yarnspinner2js npm package"
