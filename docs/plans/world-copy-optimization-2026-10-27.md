# World-copy optimization

**Acceptance:** optimization PR #64 merged into `main` on 27 October 2026 and is accepted. The performance measurements and further rollback-design conditions below remain future evidence, not unfulfilled conditions on the accepted merge.

Base: main f34c5ecac7db9d65b0c61517dbc685eda6572611.

## Implemented contracts

- Building configuration actions keep their immutable API, copying the world shell, building array and changed building only. Other slices retain identity; repeated settings return the input.
- Venue schedule changes copy the world shell only. Explicit owned assignment mode reuses the already isolated optimistic display or worker-owned state; default callers retain isolation. Routing and eligibility remain with the existing staffing and residency owners.
- Building delta baselines store JSON fingerprints. Extraction computes each current fingerprint once. The next baseline is published locally only after postMessage succeeds. Failed packing/posting retains the previous baseline and the existing rollback.
- Normal worker ticks omit unchanged grave records, population history, yearly stats, chronicle chapters, village request history and genealogy. Property absence means retain; explicit empty arrays or undefined clear. Nested edits are detected by content, not identity. Session uploads and successful commands reset baselines; headless and standalone extraction retain full slices.
- Save export copies only the world shell, strips runtime cache fields from that shell, and stamps its RNG snapshot there. Synchronous postMessage serialization copies the nested state. Live simulation caches, scent state and RNG stamp remain untouched, including when serialization fails.
- Rollback content is unchanged. The existing opt-in profiler now measures simulation.rollbackSnapshot in both worker and main-thread paths.

## Measurement and next rollback gate

No FPS or elapsed-time improvement is claimed from code inspection. Compare the same saved colony, seed, speed and focus before/after through the existing autoplay harness and performance profiler. Include a small village, a large settled colony and a history-heavy long-running save. Warm up, then compare p50/p95/p99 for rollbackSnapshot, worker.extractDelta, worker.packRenderSoA and frame time, plus payload size and command latency. Fingerprinting histories still scans their content; reduced serialization is not automatically a CPU win.

Only replace rollback copies after these measurements identify worthwhile slices. A replacement must cover nested writes, creation/deletion, RNG streams and scent state, preserve worker/main-thread parity, and pass the existing rollback-closure and failure-injection tests. Do not substitute shallow copies. A mutation journal requires complete owner coverage and is a separate measured implementation step.
