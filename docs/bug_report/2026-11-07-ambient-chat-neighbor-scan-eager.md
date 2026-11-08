# Ambient chat built a neighbour scan for every settler even when the chatter roll failed

- Bug: the per-tick ambient social pass collected and sorted every nearby settler for all eligible settlers, then discarded the list for the ~96% whose chatter roll failed. At 1,800 settlers this was 61% of the simulation tick.
- Status: resolved
- Severity: high
- Date discovered: 2026-11-07
- Version/build: V.0.6.5.1 on `master-approach-buglist`
- Reporter: A8 frame/tick-cost audit, reproduced with the city-scale performance harness
- Area: simulation tick, ambient dialogue and child leisure
- Owner module: `dialogueTrees.ts` (`tryAmbientRandomDialogue`), `humanLeisureBehavior.ts` (`tickHumanChildLeisure`)
- Related PR/commit: this branch (`master-approach-buglist`)

## Status history
- 2026-11-07 — open: 1,800-settler harness measured 624.9 ms average tick; the CPU profile put 61.3% of sampled time in `simAmbientChatNeighbors`.
- 2026-11-07 — resolved: the neighbour read is now deferred until the chance roll fires, and a child that will not play skips the playmate scan. Same simulation output, 106.2 ms average tick.

## Observed behavior
`humanTick` evaluated the ambient-chat guard and then called
`tryAmbientRandomDialogue(entity, ambientChatNeighbors(entity), …)` with an already-built array.
The owner then rolled `chat-ambient:<id>:<tick>` and returned when the roll exceeded `0.036` per tick,
so roughly 96% of those scans and both id sorts were thrown away.

The same shape appeared one level down: `tickHumanChildLeisure` cached one playmate per child per
hour, but scanned the social grid for every child before applying the stateless `personDayRoll`
that only 72% of children pass.

Measured at tier 1800 of `scripts/perf-at-pop.ts` (25 ticks, 5 warmup, default seed):

- before: `avg=624.9 ms p50=588.4 ms p95=1217.0 ms max=1243.1 ms`, 1.60 ticks/s
- CPU profile, 25 ticks: `simAmbientChatNeighbors` 9,576 ms of 15,610 ms sampled (61.3%);
  the `adaptiveSpatialQuery` grid callback alone was 4,395 ms of self time (28.2%).
- after the first fix only: `avg=111.2 ms`, 8.99 ticks/s; the remaining profile put
  `forEachAdaptiveInRadius` via `tickHumanChildLeisure` at 1,322 ms (25.4%).
- after both fixes: `avg=106.2 ms p50=70.0 ms p95=468.8 ms max=629.2 ms`, 9.42 ticks/s.

## Expected behavior
A settler that will not start a conversation this tick must not pay for candidate collection, and a
child that failed its play roll must not scan for playmates. Both rolls are stateless seeded hashes
(`seededRandomForRun`, `personDayRoll`), so reordering them costs no determinism.

## Reproduction steps
1. `PERF_TICKS=25 PERF_WARMUP=5 PERF_POPS=1800 npx tsx scripts/perf-at-pop.ts`
2. Observe `avg` above 600 ms and the 10:00/11:00 worst hours.
3. `NODE_OPTIONS="--cpu-prof --cpu-prof-dir=/tmp/prof"` on the same command, then
   `node scripts/analyze-cpuprofile.mjs /tmp/prof/<child>.cpuprofile --top=25`.
4. `simAmbientChatNeighbors` dominates the samples at 1,800 settlers.

## Evidence
- Profile self time: `adaptiveSpatialQuery` grid callback 4,395 ms (28.2%); `humanSocial` callback
  3,570 ms (22.9%); `simAmbientChatNeighbors` total 9,576 ms (61.3% of sampled time).
- The simulation hash was unchanged by both fixes: `deltaHash=1ac99bd018f315e5` before and after,
  so the tick produces the same world.
- `tests/deterministicSeed.test.ts` (3), `tests/gameWorker.seed.test.ts` (3),
  `tests/workerMainThread.parity.test.ts` (1), `tests/humanChat.ambientPairing.test.ts` (3) and
  `tests/humanLeisureBehavior.test.ts` (3) all pass; the new case asserts the provider is never
  read when the chance roll fails.

## Root cause
The neighbour list was an argument expression, so it was built before the owner could decide whether
the tick had any use for it; and the child playmate cache computed its candidates before its own
chance roll.

## Fix / proposed fix
- `tryAmbientRandomDialogue` takes a `readNearbyCandidates: () => ChatSpeaker[]` provider and reads it
  only after the dialogue-busy check and the chance roll. `humanTick` passes
  `() => ambientChatNeighbors(entity)`; the ambient pairing test passes `() => [ordinarySettler]`.
- `tickHumanChildLeisure` evaluates `personDayRoll(…) < KID_PLAY_CHANCE` first and only then scans
  the social grid, storing the same `{ tickBucket, mate }` entry.

No other caller of either path changed; ownership stays with the same two modules.

## Save/migration impact
None. No persisted field, protocol message or save version changed.

## Verification result
- `npm run test:types` — PASS
- `npm run lint` — PASS (0 warnings, 0 errors)
- Targeted suites listed under Evidence — PASS
- Performance harness tiers 250/750/1800/3000 — 18.5 / 38.8 / 106.2 / 319.8 ms average tick
- NOT RUN: the full test suite and the browser autoplay probe.
