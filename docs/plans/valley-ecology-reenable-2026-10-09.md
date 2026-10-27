# Valley ecology stage — re-enable investigation (2026-10-09)

The owner asked for the parked valley-stage ladder (`Stable → Strained → Damaged → Collapse`) to be
investigated before anything is turned on. This plan holds the evidence, the decision and the
one-line revert.

**Verdict: GO — the ladder is enabled.** It is not scenery: four simulation effects act on the stage
(hunt yield, farm yield, illness mortality, reputation), the stage is reachable and self-limiting in
a real 360-day run, and the colony gate stays green with it on.

**One-line revert:** set `ENABLED: false` at `src/game/gameConstants.ts:217` (the guards in
`ecologyStage.ts` then park the valley at a quiet `'stable'` again, exactly as before).

---

## 1. Why it was off — repository evidence

The flag is older than the tracked history, and the repository records the reason in prose rather
than in a commit that flipped it:

| Evidence | What it says |
| :--- | :--- |
| `git log -S'ValleyEcology' -- .` | two commits only: `e39d932` "Update vanaf computer" (2026-09-28, the tree import) and `7edb390` "Track tests/ and scripts/…" (2026-09-30). No commit in this history turns the ladder on or off. |
| `git show e39d932:src/game/gameConstants.ts` | the **first** tracked version already reads `ENABLED: false` — the park predates the tracked history (the flag comment dates it 2026-09-08). |
| `git log -S'ENABLED' -- src/game/gameConstants.ts` | `e39d932` only, so the value has never changed under version control. |
| `git blame -L 741,741 CHANGELOG.md` → `e39d932` | the recorded reason, verbatim: *"**Valley ecology parked, not deleted** — the Stable → Strained → Damaged → Collapse ladder is dormant behind `ValleyEcology.ENABLED = false`, because its strain messages gave the player no agency and had no real consequence. While parked, the effective stage always reads `stable`: no transitions, notifications, focus hints, or hidden hunt/farm/illness effects…"* |
| `git show bf79b38 -- src/game/ecologyStage.ts` | commit `bf79b38` "batch 1" (2026-10-08) only made the park **idempotent** (`isParkedValleyStageState`); it did not re-enable anything. |

So the historical complaint was two-part: the strain messages "gave the player no agency" and had
"no real consequence". Both halves have since been addressed in the parked code itself — the
drivers name player-controlled things (staffed hunting posts, wild wolves, wildlife preserve,
farming over hunting) and the stage multiplies hunt/farm yield, illness chance and reputation. The
one-day lag between the stage and the production it scales means every warning now precedes its
effect, which was not true of the design the changelog describes.

No `BUG_REPORTS/` entry is about the ladder; `BUG_REPORTS/2026-09-13-simulation-logic-audit.md`
records the L17/L18 fixes to it (recovery-notice cooldown, grazing cap) and nothing else.

## 2. Every consumer of the valley stage, and whether it acts

`path:line` is the current tree. "Acts" means the value changes simulation state or player resources;
"text" means it only reaches a label, hint, notification or the event log.

| # | Consumer (`path:line`) | What it does with the stage | Acts or text |
| :--- | :--- | :--- | :--- |
| 1 | `src/game/ecologyStage.ts:314` `getValleyHuntYieldMultiplier` | `strained 0.9 · damaged 0.7 · collapse 0.45` on hunted food | **acts** (via 2–3 below) |
| 2 | `src/game/dailyBuildingEconomy.ts:629` | multiplies the Hunting Spot's daily food yield | **acts** — food in storage |
| 3 | `src/game/simulation/humanNeeds.ts:108` (`freeHuntFoodGain`) | multiplies every free-roam kill's meat | **acts** — food in storage |
| 4 | `src/game/ecologyStage.ts:328` `getValleyFarmYieldMultiplier` | `damaged 0.95 · collapse 0.88` | **acts** (via 5) |
| 5 | `src/game/dailyBuildingEconomy.ts:471, 844` | multiplies Farm and Greenhouse output | **acts** — food in storage |
| 6 | `src/game/ecologyStage.ts:336` `getValleyIllnessChanceBonus` | `damaged +0.00008 · collapse +0.0002` daily chance | **acts** (via 7) |
| 7 | `src/game/simulation/humanRelationships.ts:956` | added to `HUMAN_DAILY_ILLNESS_CHANCE` (0.00012) — a death roll for adults | **acts** — settler death |
| 8 | `src/game/ecologyStage.ts:461` collapse entry | `addReputation(state, -4)`, once per collapse | **acts** — reputation (trade prices, raid odds) |
| 9 | `src/game/ecologyStage.ts:381-400` `announceStage` | notification / big news / event-log line, and one `getSimRng('simEffects')` draw per announcement | **acts** — state arrays + RNG stream position (deterministic, snapshot-carried) |
| 10 | `src/game/ecologyStage.ts:407` (`tickValleyEcologyStage`), writes at `:463-466` | writes `valleyStage`, `…SinceDay`, both streak fields | **acts** — the ladder's own state |
| 11 | `src/game/ecologyStage.ts:473` `ensureValleyEcologyOnLoad` | on load, steps the persisted stage at most one stage toward today's stress | **acts** — state on load |
| 12 | `src/game/humanHuntingBehavior.ts:180, 189` | `>= 1` gates two hunter chatter lines ("Game's getting scarce…") | text (floating speech) |
| 13 | `src/game/villagePortrait.ts:56, 105` | nature score `stable +25 · strained +10 · else 0` → identity label in Progress tab (`ProgressTabPanel.tsx:64`) | text |
| 14 | `src/game/dashboardData.ts:271-279` | adds a "Valley damaged/strained" concern card | text |
| 15 | `src/game/dashboardData.ts:495` → `src/components/dashboard/GameDashboard.tsx:612` | prints the raw stage name | text |
| 16 | `src/game/contextualTutorial.ts:313` | seeds the `valley_strained` tutorial tip | text |
| 17 | `src/game/focusHints.ts:105` → `ecologyStage.ts:488` | focus hint "Valley strained — be careful" | text |
| 18 | `src/components/tabPanels/NatureTabPanel.tsx:83-93, 191-192` | stage label, emoji, drivers, help lines | text |
| 19 | `src/game/valleyChronicle.ts:30-81` (`VALLEY_CHAPTERS`) | **nothing** — all ten chapters read buildings, resources, gold, peace or `year`; no chapter reads `valleyStage` | — (this is the "chronicle milestone" the audit hoped for: it does not exist) |
| 20 | `src/game/IntroScreen.tsx:41` (`HOOK_DETAIL`) | static front-page sentence "Build inside the food chain — or watch it collapse." | text (already shipped, independent of the flag) |
| 21 | `src/game/gameTypes.ts:784-788`, `worldGen.ts:653-657`, `saveSchema.ts:32-37`, `simWorker/simPrep.ts:58-62/203-207/316-320`, `simBuffers/simDelta.ts:77-81/306-310/449-453` | carries the stage fields through save, worker prep/rollback and tick deltas | plumbing (no behaviour of its own) |
| 22 | `src/game/gameEngine.ts:164-171` | re-exports the owner's readers to the UI surface | plumbing |

**Answer to "do we really do anything with it":** yes — rows 1–11 act. They are all *conservation
debt* (the player's own hunt/farm yield and a small illness bonus), plus a one-off −4 reputation on
collapse. Nothing acts on the stage in the other direction: no migration, no famine, no morale, no
deaths beyond the illness roll, no chronicle chapter, and no other system reads a stage value
expecting `'stable'`. Everything the owner would *see* (rows 12–18, 20) is text.

## 3. Does the logic still work?

* **Inputs are still produced.** `computeRawEcologyStress` (`ecologyStage.ts:123`) reads
  `getGrazingPressureReport` (`ecosystemPressure.ts:47`), `state.wildlifeCounts`,
  `getEcosystemHealth` (`dailyEcology.ts:36`), `state.pollutionLevel`, `state.humanPopulation` and a
  scan of staffed Hunting Spots. All are refreshed daily immediately before the stage by
  `tickEcosystemMetrics` (`dailyWorldEvents.ts:180` → `ecologyStage.ts` call at `:184`), and the
  story-driven ecology deltas are applied there too (`dailyEcology.ts:219-229`).
* **Deterministic under `simRng`.** The stage computation is pure — no RNG at all. The only draw is
  `addNotification`'s id salt inside `getSimRng('simEffects')` (`simEffects.ts`), a simulation stream
  whose position is carried by prep/delta/save, so worker, main thread and reload all agree. Enabling
  the ladder therefore *shifts* that stream whenever an announcement fires (seeded runs differ from
  the parked build, by design), but it introduces no non-determinism.
* **Persistence** is complete: the fields are in `saveSchema.ts:32-37`, both worker buffers
  (`simPrep.ts`, `simDelta.ts`) and `worldGen.ts:653-657`; `ensureValleyEcologyOnLoad` repairs a
  missing stage on load (`saveLoad.ts:1516`).
* **Self-limiting, not a dead end.** Upward movement needs `CONFIRM_UP_DAYS = 3` of confirmed raw
  stress per step; `ECOLOGY_COLLAPSE_MIN_DAY = 14` blocks collapse in the first fortnight and
  `DAMAGED_BEFORE_COLLAPSE_DAYS = 4` blocks it until Damaged has dwelled; recovery needs
  `RECOVERY_LAG_DAYS = 2` calm days per step (`ecologyStage.ts:72-80`). A `targetIdx` of 3 is the raw
  maximum, so once at Collapse the streak can only go calm and the ladder walks back down.
* **The one real wrinkle (not a blocker, now documented in code):** the call site runs *after*
  building production (`dailyWorldEvents.ts:184`), so a stage change scales the **next** day's
  yields — a one-day lag, which is what makes the warning always lead the effect. The old comment
  there claimed the opposite and said the question could not be validated while parked; both halves
  were false once the ladder ran, so that comment was rewritten.
* **Not found:** the design spec the module header points at ("design spec 2026-07-30",
  `ecologyStage.ts:4`) is not in this tree, and `NOTIFY_COOLDOWN_DAYS`'s one-line label
  (`ecologyStage.ts:80`) still reads as a same-stage rule while the code only ever silences a
  recovery step — the audit's L15 correction is not in this file. Neither changes behaviour.

## 4. Measurements

Test tier (the reachability proof), `npx vitest run tests/low-5-combat-ecology.test.ts
tests/huntLogic.test.ts` — **22 passed**:

* *stressed valley*: raw stress 2 confirmed for 3 days → `strained`; 3 more → `damaged`; raw stress
  3 (two bad drivers) → held at `damaged` until the 4-day dwell expired → `collapse` at day 29 with
  the documented `−4` reputation; then 2 calm days per step back → `damaged` → `strained` → `stable`.
* *healthy valley*: a quiet fixture ticks **360 days** and stays `stable` with zero notifications,
  zero big news and zero log lines (`tests/low-5-combat-ecology.test.ts:296`).
* the hunt-yield contract now pins both directions with the switch forced each way
  (`tests/huntLogic.test.ts:39`).

Colony gate, `npx tsx scripts/run-full-year.mts --days=360 --seed=12345` (the `npm run test:full-year`
step), seed 12345, restocked scenario:

| | ladder off (baseline) | ladder on |
| :--- | :--- | :--- |
| exit code | 0 | **0** |
| invariant violations | 0 | **0** |
| stalled ticks | 0 | **0** |
| serialization spikes (>50 ms) | 0 | 1 |
| colony verdict | healthy | **healthy** |
| settlers / births / deaths at day 360 | 48 / 15 / 129 | 48 / 15 / 129 |
| wildlife total | 85 | 88 |
| `Valley ecology:` transitions in the run | **0** | **7** |

The seven transitions are the no-runaway evidence: `stable → strained` on day 3, then an
oscillation `strained → damaged` (days 270, 299, 339) and `damaged → strained` (days 274, 316, 345)
as grazing pressure rose and eased. **Collapse was never reached in a real year**; the ladder
climbed one stage, held it, and walked back twice, ending at `strained`. Colony size, births and
deaths are identical to the parked baseline; the small wildlife differences come from the extra
`simEffects` draw on the seven announcement days.

Strict-economics scenario (`--scenario=producers`, no restock) is **red at baseline for an unrelated
reason** — `stalled(wood-pinned): wood 18/1700 and stone 0/500 at day 360 with 0 buildings raised`,
with the ladder off — so it cannot serve as a gate for this change. Run with the ladder on it fails
*identically* (`stalled(wood-pinned): wood 21/1700 and stone 0/500`), with the same settlers (43),
births (17) and deaths (138), and its 16 `Valley ecology:` transitions only ever visit
`stable ↔ strained` and `strained ↔ damaged` — again never Collapse. The change therefore does not
move that pre-existing failure; it is reported, not inherited.

Build gates: `npx tsc -p tsconfig.app.json --noEmit` (the src half of `npm run test:types`) exits 0,
`npm run lint` reports 0/0 on `src`, and `node scripts/check-comments.mjs` reports nothing from this
change. `npm run test:types` as a whole and the comment ratchet were **red at the moment of writing
on two other workers' in-flight files** — `tests/raids.cadence.test.ts:118` (`createFactionHuman` not
in `RivalEventCallbacks`) and `tests/workSkillAttribution.accrual.test.ts:4` (a "used to be" clause) —
neither of which this change touches; both were green earlier in the same session before those edits
landed.

## 5. The change and the revert

| File | Change |
| :--- | :--- |
| `src/game/gameConstants.ts:217` | `ENABLED: false` → `true`; the constant's comment now describes the switch instead of the park. |
| `src/game/ecologyStage.ts:42-45` | the "Parked … until it is rebalanced" comment was rewritten: it described a disabled ladder, which is no longer what the code does. Logic untouched (the `ENABLED` guards and the park helpers stay, so the one-line revert restores the old behaviour exactly). |
| `src/game/dailyWorldEvents.ts:182-183` | the call-site comment claimed the ladder was parked and the call order could not be validated; it now states the one-day lag it actually has. |
| `tests/low-5-combat-ecology.test.ts:240, 296, 318` | the reachability proof, the healthy-year proof, and the shipped-state guard. |
| `tests/huntLogic.test.ts:39` | the old case asserted "stage does not cut hunt yield while parked"; it now asserts both directions with the switch forced on and off. |
| `OWNERSHIP_OVERVIEW.md:120` | the owner row said "(parked, `ValleyEcology.ENABLED = false`)". |

**Revert in one line:** set `ENABLED: false` at `src/game/gameConstants.ts:217`. Nothing else needs
to change to park it again; only `tests/low-5-combat-ecology.test.ts:318` (the shipped-state guard)
then fails, deliberately, so the park is a decision someone makes on purpose.

## 6. README wording (owner's call — README is another worker's file)

The README currently promises the collapse at lines 17, 251, 255 and 530. With the ladder live the
promise is now true, and the honest wording would name what the player actually sees. Suggested
replacement for the front-page promise (`README.md:530`): *"Build inside the food chain — the valley
has a stage: strained, damaged, collapse. Overgraze it and your hunts thin out."* Suggested change
for the feature row (`README.md:255`): *"Focus hints, alert strip, sidebar tabs, **valley stages** —
Stable → Strained → Damaged → Collapse, driven by deer, wolves, meadows and town footprint — you
always know what to do next."* The marketing line at `README.md:251` ("balance or collapse") and the
opening paragraph at `README.md:17` need no change; they are accurate with the ladder on.
