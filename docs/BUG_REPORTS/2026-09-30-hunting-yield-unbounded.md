# File: 2026-09-30

- Bug: Hunting Spot meat yield is unbounded and wildly inconsistent — one rabbit paid +2 and another +116 on the same day
- Status: investigating
- Date discovered: 2026-09-30
- Version/build: v0.6.5.0 (chronicle export header); working tree 0.6.5.1
- Reporter: Owner (play), via village chronicle export of the "New Frontier" settlement
- Area: Play
- Owner module: `dailyBuildingEconomy.ts` (`tickBuildingProduction`, hunting branch)
- Cadence: per successful shot

## Status history

- 2026-09-30 — open (owner pasted two chronicle lines from the same in-game day, D262, showing the same prey type yielding +2 and +116 meat, and asked *"how can a rabbit give +116 meat)"*)
- 2026-09-30 — investigating (formula located and read; multiplier stack enumerated; no code change made yet — the fix is a balance decision, see "Fix")

## Observed behavior

Two events logged on the same in-game day for the same building type:

```
[Y0 D262] [event] Hunting Spot bagged a rabbit (+2 meat)
[Y0 D262] [event] Hunting Spot bagged a rabbit (+116 meat)
```

A rabbit is the **smallest** prey in the game, yet it can pay more than a deer, and the same prey can pay 58× more between two consecutive shots.

## Expected behavior

A rabbit should be worth a small, roughly bounded amount — on the order of a few meat — with deer and wolves meaningfully above it. Two kills of the same prey by the same settlement on the same day should be of comparable magnitude, varying only with genuinely different conditions (crew, fatigue, festival), not by a factor of 58.

## Reproduction steps

1. Play until a Hunting Spot is completed with at least one worker assigned.
2. Let it take multiple shots across a day (the log line is emitted per successful shot in `dailyBuildingEconomy.ts`).
3. Compare the `(+N meat)` values in the Chronicle / event log.

Observed in the "New Frontier" chronicle export: 42 rabbit entries, 81 total hunting entries, over Y0 D197–D278.

## Evidence

Chronicle export `wilderfolk-New-Frontier-chronicle (7).txt`, settlement "New Frontier", population 451, game v0.6.5.0, 2 000 events (the full log cap) covering Y0 D197–D278:

- event-type counts: 1516 `event`, 145 `scandal`, 94 `building`, 77 `migration`, 47 `birth`, 38 `conception`, 33 `marriage`, 17 `combat`, 16 `trade`, 8 `research`, 4 `divorce`, **3 `death`**
- hunting lines within `event`: `Hunting Spot bagged a deer` ×42, `bagged a rabbit` ×29, `bagged a wolf` ×10 (message text varies with the yield)
- the two D262 lines quoted above

## Root cause

Owner's framing (2026-09-30), which supersedes the first reading of this report:
*"the hunung spot cannot hunt its just a spot from where they hunt but they free to walk the people who
work there they just should hunt its not a tower that can fire"* and *"the range can be 350 where is
looking but to kil it you have stand ne xt to it"*.

The hunting branch fired **from the building, at anything within 320 px, with no distance term at all**:
the target was chosen by distance to `building.x + width/2` and `success` was a flat 85 % roll.

The yield is computed at `src/game/dailyBuildingEconomy.ts`:

```js
const amount = Math.floor((12 + workers * 6) * carcass * totalMult * huntMult * globalEff * valleyHunt);
```

Contributions, with the source of each:

- `12 + workers * 6` — base output, **scales with the building's crew**, not with the animal.
- `carcass` — the **only** prey-specific term: deer `1.35`, wolf `0.85`, everything else (rabbit) `1.0`.
- `totalMult = levelMult * terrainMult * adjacencyMult * festivalMult * skillMult * …` — building level
  (×1–3), terrain, adjacency, **festival ×1.5** (`:357`), skill, fatigue, work-hour/presence.
- `huntMult` — `hunt_food` research, up to ×1.95 stacked.
- `globalEff` — research × Town Hall governance.
- `valleyHunt` — `ecologyStage.ts:308`; only ever **reduces** (0.45–1.0), so it is not a contributor to
  the high end.

No term is bounded as a product, and the animal's own weight enters at a factor of at most 1.35 — so a
rabbit is worth whatever the building's multiplier stack says. That is how one rabbit paid +116 while
another paid +2.

`festivalMult` is hoisted once for the whole production pass rather than per-branch, so a festival boosts
**every** producer including hunting, apparently incidentally. The Mill bonus is applied to the Farm line
but **not** to hunting, so the shared-multiplier rule is inconsistent between branches.

## Changes made (2026-09-30)

1. **Targeting is anchored on the assigned hunter, not the building** — `bx`/`by` are the hunter's
   position, so the shot comes from the person and the spot no longer fires on its own behalf.
2. **Looking and killing are separate distances** — `OWNER_HUNT_SEARCH_RADIUS = 350` (the owner's
   number, "where is looking") for the search, and `HUNTER_KILL_REACH = 120` for the shot.
3. **A distinct "Too far to shoot" message** so "nothing out there" reads differently from "the animal
   is over there and nobody has walked to it".
4. `findLiveAssignedWorker` no longer throws when `occupants` is absent.

### Why the kill reach is 120 and not the adjacency rule

The first attempt used the free-roam rule verbatim — `hunter.size + prey.size` ≈ **22 px** — and the spot
**stopped producing food entirely**. Measured directly: a fixture deer started 30 px from the hunter,
drifted to **34.5 px** on the production tick, against a 22 px reach, so the shot never happened. Prey
wanders, so a strict adjacency gate is only survivable if the hunter **walks to the animal**, and **no
such pursuit exists** — assigned hunters hold position.

**The honest remaining fix is the chase**: give an assigned hunter a move-to-prey order while on shift,
after which `HUNTER_KILL_REACH` can drop to the adjacency rule that matches the owner's words exactly.

## Open test failure (blocked, not resolved) — **CLOSED 2026-09-30**

**Fixed on the owner's instruction** (*"doesnt matter if your fault fix t he error"*), by the second of the two routes this section prescribed: **seed the entity map from the replaced entities**. `harvest()` in `tests/foodLedger.acceptedCatch.test.ts` replaces `state.entities` wholesale, and `ensureEntityByIdMap` trusts only the map built **for that world object** (`entityIndex.ts:29-33`) — so the map `initGame` built for the generated world survived the replacement and the spot's crew resolved to nobody. One call to `rebuildEntityByIdMap(state)` after the replacement (the function is documented for exactly this: *"Full rebuild from alive entities — load recovery, init, and tests only"*) staffs the fixture honestly. **No production guard was touched** — the no-hunter rule stands, as this section required.

Verified: `npx vitest run tests/foodLedger.acceptedCatch.test.ts` → **2 passed**; the whole gate `npm run test:standard` → **245 files / 1493 passed / 2 skipped / 0 failed**, `tsc` clean on both projects.

**One neighbouring defect observed and deliberately left alone** (recorded so the next reader does not have to rediscover it): the fixture gives the deer `PREY_ID = 2`, which collides with the crew ids `1..8` from `human(i + 1)`, so the engine's invariant checks print `tick 144: duplicate entity id 2` and *"human 2 listed in workplace #10 (fishingSpot) occupants but homeBuildingId is unset"* on every run. It is **pre-existing and non-failing** — the invariant reads `state.entities`, which this fix does not alter — and changing `PREY_ID` re-keys the fixture's seeded shot roll (`hunt:<spot>:<tick>:<prey>:success`), so it is its own small change rather than a drive-by in this one.

`tests/foodLedger.acceptedCatch.test.ts` → "records the accepted catch, not the nominal one, for the
Hunting Spot" fails, and it is a **fixture problem, not an engine one**:

- diagnosed with a temporary log: `{ hasHunter: false, occupants: 8, deer: 1, staffed: true }`
- the test calls `initGame(...)` and then **replaces** `state.entities` with hand-built settlers whose ids
  are 1..8, while `entityById` still refers to the generated world — so the spot's `occupants` do not
  resolve to live entities and the hunter lookup finds nobody.
- it passed before because the old code only used the hunter to *draw* the projectile and hunted anyway
  without one, which is the defect being removed.

**Fix:** rebuild that fixture through the game's own assignment path (or seed the entity map from the
replaced entities) so the spot is genuinely staffed. Do not weaken the no-hunter guard to make it pass —
that guard is the owner's rule.


## Regression test

None yet — no code change has been made.

## Fix

Open, and it is a **design decision**, not a mechanical one. Two candidate directions were put to the owner:

1. **Let the carcass establish the yield** — rabbit ~1–2, deer ~40–60, with the building's multipliers scaling *within* that band rather than setting it. This is the change that makes hunting read sensibly.
2. **Damp the shared stack** — clamp `totalMult` for the hunting branch, or drop the `workers * 6` term, so a large hunting operation stops snowballing.

Either way, two side decisions belong with it: whether a **festival** should boost hunting at all (currently it does, by accident of hoisting), and whether the Mill bonus's absence from hunting is intended.

Do not apply a threshold or constant until the +2 mechanism above is confirmed, so the fix is not compensating for an unverified second cause.
