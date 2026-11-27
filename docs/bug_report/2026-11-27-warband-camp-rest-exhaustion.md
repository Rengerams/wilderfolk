# War-band soldiers never recover rest while deployed

- Bug: A soldier away on an outgoing raid loses rest and stamina continuously without a camp sleep window.
- Status: investigating
- Severity: high
- Date discovered: 2026-11-27
- Version/build: 0.6.5.2 development, PR #225
- Reporter: player screenshot of deployed Shawnta Sibley with Rest 0/100, Stamina 0/100 and an expectant status
- Area: war-band deployment / human needs
- Owner module: `src/game/humanTick.ts` (sleep observation), `src/game/simulation/humanPhysiology.ts` (single needs owner)
- Related PR/commit: [PR #225](https://github.com/Rengerams/wilderfolk/pull/225)

## Status history
- 2026-11-27 — open: player reported a deployed pregnant soldier at zero rest and stamina.
- 2026-11-27 — investigating: field-camp sleeping was added through the normal physiology owner. Previous CI uncovered a wrongly timed 22:00 test start; the canonical 23:00 start is now used, pending CI.

## Observed behavior
`observeHumanSleep` returned `sleeping: false` for every deployed person. `advanceHumanNeeds` still ran each tick before the deployment early return, so neither rest nor stamina recovered over a multi-day campaign. The screenshot confirms a real player's depleted stats; its original save was not inspected.

## Expected behavior
Deployed soldiers camp and sleep during the existing 23:00–06:00 night, regaining rest/stamina through the one physiology system. They do not occupy village homes while deployed. Existing pregnancies continue advancing.

## Reproduction steps
1. Create a player human with `raidDeploymentId` and needs `rest: 0`, `stamina: 0`, optionally pregnant.
2. Run `tickHumans` for a complete night from `NIGHT_START` (23:00) through the next day at 06:00 in `tests/low-8-humans.test.ts`.
3. Before the fix, deployment blocks all sleep recovery. After the fix, both needs should recover strongly without removing the deployment flag.

## Evidence
The code branch in `humanTick.observeHumanSleep` unconditionally rejected deployed sleep before PR #225. The original PR CI on `a7a904a` reported 85.714 rest rather than >90 because the new seven-hour fixture started at 22:00, containing only six sleeping hours. That CI result does **not** refute field sleep; the test setup was wrong.

## Root cause
Off-map deployment suppressed physical village movement but also suppressed the only sleep-observation signal, while the needs owner continued applying its normal awake drains.

## Fix / proposed fix
Use `isNightHour` in the existing `observeHumanSleep` deployment branch. Feed the observed camp sleep and daytime march effort to `advanceHumanNeeds`; do not add another stamina counter or make an off-map camp a village building. Start the regression at `NIGHT_START`.

## Save/migration impact
No new save fields. Depleted needs in existing saves recover over subsequent nights; no automatic reset or teleport.

## Verification result
- FAIL (old head): Node.js CI on `a7a904a`, `tests/low-8-humans.test.ts` measured 85.714 rest due to incorrect test time.
- PENDING: repeat build, correct 23:00–06:00 regression, other CI checks and actual player-save verification on the updated PR.
