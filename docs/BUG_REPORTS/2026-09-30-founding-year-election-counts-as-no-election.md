# File: 2026-09-30

- Bug: An election held in the founding year (stored year 0) does not count — its campaign promises are inert and never judged, and after a save/load the next vacancy is filled by a silent "founding" appointment instead of an election
- Status: open
- Date discovered: 2026-09-30
- Version/build: working tree 0.6.5.x (`package.json` 0.6.5.0); owner's colony from play was v0.6.5.0
- Reporter: Owner (play) — *"i had my leader died after 3 months no elections then after a year they where elections for the year 0 ?"* and *"well if a leader dies after 0.33 years elections"*
- Area: Play
- Owner module: `villageLeadership.ts` (`tickLeaderVacancy`, `validateVillageLeaderOnLoad`, `tryStartVacancyElectionCeremony`, `startElectionCeremony`) and `electionPromises.ts` (`recordElectionPromises`, `getActiveElectionPromises`, `tickElectionPromises`)
- Cadence: daily for the vacancy path, year rollover for the term path

## Status history

- 2026-09-30 — open (owner reported from play, while the audit was reading the election-year fixture in `tests/electionPromises.secondElection.test.ts:27`)
- 2026-09-30 — investigating (reproduced against the shipped engine with `tmp/audit/repro-election-year0.mts`; root cause located; **no production change made** — two of the three symptoms share one sentinel and the repair needs an owner decision on existing saves)
- 2026-09-30 — investigating (**field-confirmed in the owner's live save**; the second chronicle export, `…chronicle (8).txt`, contains the whole mechanism — a ceremony begins, a reload two days later installs an unelected "founding" leader and the election never completes)

## Observed behavior

The owner's account: the leader died about 3 months into the colony, **no election followed**, and roughly a year later an election did run — but it was "for the year 0".

Reproduced against the shipped engine (seed 12345, medium, founder dies day 90). The election *delay* is correct — the death at day 91 produced an election at day 213, i.e. **122 days = 0.34 year**, matching `VACANCY_ELECTION_DELAY_YEARS = 1/3` — but the run exposes three separate defects:

```
year=0 day=0    Thomas Sterling leads the founding colony until the first merit election (Year 3)
year=0 day=91   The village head can no longer lead — merit election scheduled for Year 1
year=0 day=211  Leadership election postponed (Year 1) — no eligible candidates
year=0 day=212  Leadership election postponed (Year 1) — no eligible candidates
year=0 day=213  Election revelry began — 1 days of celebration
year=0 day=213  Harley Vance succeeded as village head — 1 of 1 ballots · merit 8
year=0 day=335  Levi Mercer succeeded as village head — 2 of 5 ballots · merit 9
year=0 day=352  The village head can no longer lead — merit election scheduled for Year 2
year=1 day=112  Charity Ashford succeeded as village head — 5 of 6 ballots · merit 13
year=2 day=87   William Batten succeeded as village head — 5 of 6 ballots · merit 12
```

1. **"No election for a year" is the eligibility gate, and it re-logs every single day.** `startElectionCeremony` refuses to start while `rankLeadershipCandidates` is empty (`villageLeadership.ts:921-747`), and the **vacancy** path only clears `pendingElectionYear` when the ceremony actually starts (`:1121-1123`) — so a past-due pending date is re-attempted **daily**, writing one `Leadership election postponed (Year X) — no eligible candidates` line per day until an adult becomes eligible. In the trace above that was 2 days; in a colony whose remaining adults are dead, imprisoned (`isEligibleForLeadership` excludes `isImprisoned`, `:277`) or still under 18, it lasts until a settler comes of age — which is how a vacancy can go a year without an election. The term path does not do this: it arms one `+1/3` year retry (`:1151`).
2. **An election held in year 0 is stored as "no election has ever happened".** `runVillageElection` writes `state.lastElectionYear = year` (`:972`), and the founding year is stored as 0 — the same value `appointFoundingLeader` writes for "never elected" (`:571`) and the same value `validateVillageLeaderOnLoad` tests for (`:1215`). On any load, a dead leader plus `lastElectionYear === 0` therefore takes the "no election yet" branch: `findFoundingColonyLeader` (`:560`) silently installs a founder and **arms no election at all**. Reproduced: after a year-0 election, loading with the seat vacant produced `villageLeaderId = 8912 (Gideon)`, `pendingElectionYear = null` — *"NO vacancy election armed"*.
3. **A year-0 election's campaign promises are inert.** `recordElectionPromises(state, 0)` writes `election_promises_active_year = 0` and `election_promises_0_*` (`electionPromises.ts:200-216`), but both readers treat year 0 as "nothing active": `getActiveElectionPromises` returns `null` on `year <= 0` (`:191`) and `tickElectionPromises` returns early on `year <= 0` (`:235`). So a leader elected in the founding year has an empty promises panel and its promises are **never judged** — no reputation swing, ever.

The engine's own word for the first election is "Year 3" (`displayYear(2) = 3`, `dayCycleClock.ts:54`), so the persisted year-0 identity is invisible in the log text and surfaces only in panel behaviour and after a reload.

## Expected behavior

- A vacancy produces an election about a third of a year after the office empties — which it does, when a candidate exists.
- While no candidate is eligible, the player sees the postponement **once**, not once per day, and the office notice does not imply an election is imminent.
- An election that happened in the founding year is an election: `lastElectionYear` distinguishes it from "never elected", a later vacancy schedules a new election rather than appointing a founder, and its promises appear in the panel and are judged on their evaluation day.

## Reproduction steps

1. `npx tsx tmp/audit/repro-election-year0.mts` — ticks the real engine, kills the founder on day 90 of year 0, prints two simulated years of state transitions, every `election` log line, and both load-path checks.
2. In play: let the founding leader die in the first year, then reload the page (or load a save) while the seat is vacant.
3. Watch the event log for `Leadership election postponed …` repeating daily, and the Village → Leadership panel for a missing promises row.

## Evidence

Engine trace and the two load-path checks, `tmp/audit/repro-election-year0.out.txt` (script kept at `tmp/audit/repro-election-year0.mts`):

```
an election happened in year 0: true
lastElectionYear now: 0  (0 means BOTH "never elected" and "elected in year 0")

=== load-path check: leader dies after a year-0 election ===
  lastElectionYear=0  pendingElectionYear=null -> after load: null
  villageLeaderId after load: 8912 (Gideon)
  >>> NO vacancy election armed: the seat was silently re-filled with a "founding" leader
```

Sentinel spellings found in the tree for the same concept:

| Site | Value | Meaning it is used for |
|---|---|---|
| `worldGen.ts:688` | `-1` | fresh world |
| `saveLoad.ts:823` | `?? -1` | missing field in an old save |
| `villageLeadership.ts:571` (`appointFoundingLeader`) | `0` | no election has happened |
| `villageLeadership.ts:972` (`runVillageElection`) | `year` → `0` in the founding year | an election happened |
| `villageLeadership.ts:1215` (`validateVillageLeaderOnLoad`) | tests `=== 0` | "no election yet" |

## Root cause

Year 0 is a legal, reachable value for `state.year` (it is the founding year) **and** the sentinel used for "no election yet" / "no active promises" — in three different spellings (`-1` at init and on load, `0` from the founder path, and `0` again from a real year-0 election). The two meanings are indistinguishable after the fact, so both the load repair and the promises window misread a real founding-year election as the absence of one. The daily-postponement log is a separate, smaller defect in the vacancy retry loop.

**Correction (2026-09-30, found while auditing the log lines): the load-path half is much wider than "a year-0 election".** `runVillageElection` writes `lastElectionYear` **only** for `term` and `founding` (`villageLeadership.ts:971-973`):

```ts
if (reason === 'term' || reason === 'founding') {
  state.lastElectionYear = year;
}
```

A **succession** — the vacancy path, i.e. every election caused by a death, which is the common one — leaves `lastElectionYear` untouched. So the field answers *"when was the last **term** election?"* while `validateVillageLeaderOnLoad:1215` asks it *"has this colony **ever** elected a leader?"*. Measured consequence: a 720-day run in which leadership changed three times (successions at Y1 D60, Y1 D230, Y2 D5) ends with `lastElectionYear = 0` — the identical value a colony that has never voted holds. **Every colony that has not yet had a term election (i.e. every colony before Year 2, and any colony whose heads kept dying) therefore takes the "never elected" branch on load: a silent founding appointment and no election armed.** One field is being asked two questions, and it can only answer the first.

## Logging coverage for the leader's death and the election (owner request: *"check it's good logged in the eventlog about death of the leader and elections"* and *"if an election is diverted it should be in the logs of course"*)

Measured with the death routed through the engine's own mortality owner (`tmp/audit/repro-leader-death-log.mts`, which sets the leader's `age = maxAge` so `humanRelationships.ts:936-947` kills and logs them — the first repro's manual `alive = false` bypassed logging by construction):

```
[Y1 D109] [death]    #8560 Margaret Sterling succumbed to exhaustion — at the age of 43 years (adult)   (entity: #8560 Margaret Sterling)
[Y1 D110] [election] The village head can no longer lead — merit election scheduled for Year 2        (entity: The village head)
```

**What is good.** The death itself is fully logged by the mortality owner: one `death` line with name, cause and age (`formatDeathLog`, `citizenId.ts:111`) plus a "Death" HUD notification, via `logDeath` (`eventLog.ts:47-54`). Elections have their own log type and a filter (`eventLogFilters.ts:11`, *"Elections & leadership"*), and ten distinct lines cover founding appointment (`:577`), buildup, ceremony began (`:774`), postponement (`:745`), revelry (`:865`), election/re-election (`:994`), succession (`:1003`), founding election (`:987`), scheduling with no candidate (`:937`), an exception (`:882`), and the vacancy itself (`:1087`).

**What is not good.**

1. **The vacancy line loses the leader's name in the normal case.** `tickLeaderVacancy` re-derives the name from `state.entities` (`:1068`, `:1086`) a day *after* the death, by which time the corpse has been removed — so it writes the fallback `'The village head'`. Measured above: the death line names Margaret Sterling, the vacancy line a day later names nobody, and the player has to join the two lines by timing.
2. **No reason is ever given.** One string (`"$name can no longer lead"`) covers death, deposition, imprisonment-until-ineligible and plain ineligibility. The player cannot tell a dead head from a jailed one.
3. **A diverted *term* election is silent.** `tryStartTermElectionCeremony` returns `false` with no log for every diversion — including `state.pendingElectionYear != null`, i.e. *"a vacancy election is already scheduled, so this term election is skipped"* (`:1133-1142`). That is exactly the case the owner means by "diverted": a scheduled election that did not happen and left no trace. The file's own comment at `dailyWorldEvents.ts:251-258` records this as a defect that was noticed once and only half-fixed — the vacancy *date* was fixed to be evaluated daily, but the term skip is still silent.
4. **The postponement log repeats every day.** The vacancy path keeps the past-due `pendingElectionYear` when the ceremony cannot start (`:1121-1123`), so `"Leadership election postponed (Year X) — no eligible candidates"` (`:745`) is written on **every** retry — a daily line for as long as nobody is eligible.
5. **`"Election revelry began — 1 days of celebration"`** — `ELECTION_PARTY_DAYS = 1` (`:37`) interpolated unpluralised at `:865-868`.

## Observability: the 2000-entry cap is too small to debug from (owner: *"the limit of 2000 lines is a problem if want to debug bugs"*)

`EVENT_LOG_MAX_ENTRIES = 2000` (`eventLog.ts:7`), enforced by `pop()` on a newest-first log (`:33-43`) and again on the worker delta path (`simBuffers/simDelta.ts:584`). The chronicle export has no cap of its own — it exports whatever the log still holds (`eventLogExport.ts:14-94`) — so **2000 entries is the whole debugging horizon**, and the export silently truncates.

Measured against the owner's own exports: the "New Frontier" chronicle (population 451) was a **full 2 000-event export covering Y0 D197-D278 — 81 days, under three in-game months** (recorded in `BUG_REPORTS/2026-09-30-hunting-yield-unbounded.md`). The in-code justification is now stale: `citizenOverview.ts:161` says 2000 *"holds a year comfortably: the same run logged 230 …"*, and `legacyGoals.ts:22` reasons from the same bound. In this report's own failure mode the horizon is worse than average, because every day of a pending election writes a `postponed` line (defect 4) — the noise that buries the evidence is generated by the bug being investigated.

Two further truncations compound it: HUD notifications keep only the newest **20** (`simEffects.ts:82`), so the toast that announced the vacancy is long gone; and the log is newest-first with no export-on-demand of the dropped tail. Nothing here is a code defect on its own — it is a recorded limit that makes player-side diagnosis of exactly this class impossible, and it is the reason this report's evidence comes from a Node repro rather than the owner's save.

**The truncation is in the saved state, not only in the display.** `eventLog` is a normal `WorldState` field, so the same 2 000-entry cap is applied when the world is serialised and when the worker delta is built (`simDelta.ts:584`) — meaning a load cannot recover what was dropped, ever. And the owner's chronicle export is not a manual action: `useGamePersistence.ts:117-119` downloads a chronicle **on every save** while `loadExportChronicleOnSave()` is on, and it **defaults to on** (`eventLogExport.ts:108-116`). That is why the attached file is `…chronicle (7).txt`: seven save-triggered snapshots, each capped at 2 000 events, none of them complete, and no cumulative archive anywhere. The owner's summary of it is the requirement: *"its not complete"*.

So "everything logged" has two separate gaps — *what* is written (the four missing lines above) and *whether it survives* (the cap). The second one silently invalidates the first: the four missing lines could not have been seen in this chronicle even if they had been logged, because the days they belong to were evicted before export.

### What fills the window: 56-60 % of it is friendship chatter — and HEAD has already removed it

Measured on the owner's two exports (`have become friends` lines ÷ 2 000):

| Export | Log | Days covered | `have become friends` | Share | Window without them |
|---|---|---|---|---|---|
| `…(7).txt` (Y0, pop 451) | 2 000 | **82** (D197-D278) | **1 197** | **59.9 %** | ~204 days |
| `…(8).txt` (Y2, pop 641) | 2 000 | **89** (Y1 D312-Y2 D40) | **1 108** | **55.4 %** | ~200 days |

So the owner's *"the log … is spammed with people who becoming friends"* is exact: the majority of the chronicle is one routine background process, and removing it more than doubles how far back the same 2 000-entry cap reaches. **This half is already fixed in the tree, and the fix cites this very file:** `relationships.ts:101-109` records the ruling — *"an exported 2 000-event chronicle from a real village was **1 197 lines of "X and Y have become friends"** — 60 % of the log — which also buried the leadership election the player was looking for. The owner's ruling: a total once a year is fine"* — and in HEAD the string survives **only inside that comment**; the per-bond `logEvent` is gone, replaced by one yearly census line (`gameTick.ts:96-99`). The owner's build (v0.6.5.0) predates it, which is why both exports still show the spam. The remaining social lines are the curated ones (`became sweethearts`, `became friends at school` — `humanRelationships.ts:697,490`), 75-114 lines per window.

That leaves the cap itself as the open question: even with the chatter gone, ~200 days is under one in-game year at population 641, and `legacyGoals.ts:22` derives two gameplay goals from this same log — so the retained window is both the debugging horizon and a gameplay variable that shrinks as the colony grows.



### The owner's own chronicle proves the cap hides the evidence

`wilderfolk-New-Frontier-chronicle (7).txt` (attached 2026-09-30, `sha256 96d710bc…`, game v0.6.5.0):

```
Wilderfolk — Village Chronicle
Settlement: New Frontier
Game year 0, day 278 (tick 20023) · population 451
Exported: 9/30/2026, 1:46:50 AM · game v0.6.5.0
Events: 2000 (newest listed first)
...
[Y0 D278] ... newest ...
[Y0 D197] [building] Road completed     ← oldest surviving line
```

2 000 events span **D197 → D278: 81 days**. The colony is 278 days old, so **the first 197 days are gone** — and the owner's leader died about three months in (≈D90), i.e. *outside the window*. That is why the play report could not be checked against the chronicle: the evidence had already been evicted by the cap. Quoted verbatim because it is the argument: *"the limit of 2000 lines is a problem if want to debug bugs"*.

One line the window does still hold, and it matters:

```
[Y0 D267] [event] Moustapha Stapleton can no longer lead — merit election scheduled for Year 0
```

**This is the owner's "elections for the year 0"**, and the file settles what it means: that export is **0-based throughout** — the header says *"Game year 0"* on day 278 of the colony's first year, and every prefix is `[Y0 D…]` — so "Year 0" here is simply the first year, printed raw. It is a *formatting* era, not a mis-scheduled election. (An earlier draft of this report inferred a stored `-1` from HEAD's `displayYear`; that inference is withdrawn — it assumed the owner's build formatted years the same way HEAD does, and the file shows it does not.)

What the line does prove is that the wording changed after the owner's build: HEAD logs this vacancy with type `'election'` (`villageLeadership.ts:1089`) and interpolates `displayYear(...)` (`:1090`), so HEAD would print `[election] … scheduled for Year 1` for the same event. The owner's build had a raw-year, `'event'`-typed spelling. Repository history is squashed (`git log -S "can no longer lead"` returns a single commit), so the change cannot be dated from git — but **the four defects above were each re-verified against HEAD and are all still open**; they are independent of this line's wording.

### Applied 2026-09-30 (the owner's two asks: *"make the log bigger? its not that big"* and *"do something so not everyone become friends lol"*)

Neither change fixes this bug — the load-path defect below is still open. They are the owner's response to the two things this investigation exposed.

1. **The cap is 6 000, not 2 000** (`eventLog.ts:7`), with the measured basis in the comment. At the measured busy-colony rate (~10 meaningful entries a day once friendship lines are gone) that is ~600 days instead of ~200; at the small-colony rate in the reproduction (2.0/day, population 91) the cap now covers 3 037 days. Serialised cost rises from 405 KiB to ~1.2 MiB.
2. **Close friendships are capped at 6 per settler** (`MAX_CLOSE_FRIENDS_PER_SETTLER`, `relationships.ts`), the mirror of the feud cap that friendships never had. Measured over 720 days in a prepared colony, seed 12345:

| | before | after |
|---|---|---|
| close bonds (score ≥ 60) | 2 347 — **26.1 per settler** | 331 — **3.6 per settler** |
| close bonds per settler p50 / p90 / max | 40 / 49 / **54** | 6 / 6 / **7** |

The energy bonus is untouched: it saturates at 2.5 bonds (`strongCount * 0.8`, capped at 2), so a settler with six close friends earns exactly what one with fifty-four did. The ceiling refuses *new* close bonds only — it never prunes what a save already holds, which is why an old colony keeps its existing friendships and simply stops adding more. Two tests pin it in `tests/relationships.sharedHomeFriendship.test.ts` (the ceiling holds across a year; a loaded save's above-ceiling bonds survive and a newcomer still takes on none).

**Honest limit of change 2:** it bounds the *close* graph, not the stored map. Ordinary warming still creates one key per co-located pair, so total keys barely moved (4 942 → 4 620; max on one settler 81 → 82). If save and delta size matters, that needs a separate change — evicting bonds that never warmed, or not opening a key until a pair passes a floor.

**Verified:** `tsc` clean on the app and test projects; `node scripts/test.mjs standard` → **247 files / 1 511 passed / 2 skipped / 0 failed**, all three steps (check, dup, unit) PASS.

**And the goals really are live**, which is why the cap is a gameplay variable and not only a debugging window: `src/components/tabPanels/ValleyChroniclePanel.tsx:3,12,54,60` imports `collectLegacyGoals`, renders a met/total counter and one row per goal, and two of the four goals read this log (`legacyGoals.ts:19-20`, the "chronicle window" rows). Raising the cap therefore lengthens the memory those two goals draw on. (An earlier pass of this audit missed that the panel existed — a PowerShell `src\**\*.tsx` glob silently skips nested folders; the recursive search found it.)

### Feuds: present in HEAD, but a drift feud can never log that it settled

Worth recording because the owner's *"i never saw a feud"* is also true of his exports: `(7)` contains **0** feud lines against 1 197 friendship lines, and `(8)` contains **9** against 1 108 — a 123:1 ratio, and the reason no feud is noticeable even when one exists. In HEAD feuds do fire (134 "A feud is brewing" lines over 720 days at population 91), but **"settled their feud" is unreachable for them**: `startFeud` opens a drift feud at `INCOMPATIBLE_PAIR_FEUD_AMOUNT = 30` and the line only prints when a feud expires from `currentScore >= 60` (`relationships.ts:311`), so every drift feud fades quietly from 30 to 0 over ~75 days. The only feuds that can announce their end are the ones a wrong opens at 60+. That is a logging gap of the same family as the four in the coverage table below, not a balance claim.



The owner's requirement: *"if an election is diverted it should be in the logs of course"* and *"expect all things logged"*. Audit of the election chain, HEAD:

### What "everything logged" still needs

| Event | Logged at HEAD? |
|---|---|
| A settler's death (name, cause, age) + Death notification | **yes** — `logDeath`, `eventLog.ts:47-54`, from every mortality site |
| The leader's death *as a leader* (that the office is now vacant, and why) | **no** — only the generic death line; the link is the player's inference |
| The vacancy, by name | **no** — usually anonymous (`'The village head'`, `:1086`) because the corpse is gone |
| The vacancy, with a reason (died / deposed / jailed / ineligible) | **no** — one string for all four |
| The scheduled successor date | **yes** — `:1090` (in the owner's build: raw year, type `event`) |
| A postponement for want of candidates | **yes** — `:745`, but re-logged **every day** the retry fails |
| A term election diverted because a vacancy election is pending | **no — silent** (`tryStartTermElectionCeremony` returns false with no log, `:1133-1142`) |
| A term election diverted because a ceremony is already running, or the year is not a term year | **no** — arguably correct to stay silent |
| The ceremony beginning, the ballot, the winner, revelry, election vs re-election vs succession | **yes** — `:774`, `:865`, `:987`, `:994`, `:1003` |
| The campaign promises recorded, and their verdict | **yes** — `electionPromises.ts:223` and the judgement line — but **inert for a year-0 election** (`year <= 0` guards) |
| The vacancy notice reaching the player as a toast | **yes** — `dailyWorldEvents.ts:200`, but only the newest 20 toasts survive (`simEffects.ts:82`) |

So "all things logged" currently has four gaps: the leader-specific death, the name and reason on the vacancy, the silent diverted term election, and the once-not-daily postponement. The cap then decides whether any of it is still readable when the player wants it.

## Field evidence: the owner's live save contains the whole mechanism

Second export, `wilderfolk-New-Frontier-chronicle (8).txt` (attached 2026-09-30 22:50, `sha256 bdd0ab4e…`, game v0.6.5.0, **year 2 day 40, population 641**). Verbatim, newest-first, two days apart:

```
[Y1 D359] [event] Shad Benoit leads the founding colony until the first merit election (Year 2)   ← appointFoundingLeader
[Y1 D359] [event] 👑 Shad Benoit's household moved into the Leader's House                          ← syncLeaderHouseResidency
[Y1 D357] [event] The 0 election chose growth — the forest edge retreated and the ledger grew.
[Y1 D357] [event] Leadership election ceremony began at the Town Hall (Year 0)                     ← startElectionCeremony
```

`appointFoundingLeader` has exactly **two** callers: `worldGen.ts:842` (a fresh world, once) and `villageLeadership.ts:1217` — inside **`validateVillageLeaderOnLoad`**, the load repair. The colony is at stored year 1, far from a fresh world, so the D359 line can only mean **the game was loaded at D359**, and the load repair did this:

1. found no acting head — the office was vacant, mid-ceremony;
2. read `lastElectionYear === 0`, which is the founder sentinel because **a term election has never happened** (the first term year is year 2);
3. therefore took the "no election yet" branch, called `findFoundingColonyLeader`, and installed **Shad Benoit as a founding leader** — clearing `pendingElectionYear` and **discarding the ceremony that began two days earlier**.

Nothing in the window records that election completing: no `succeeded as village head`, no ballot, no revelry, and no `[election]`-typed line at all (the export's type histogram is event/scandal/building/migration/marriage/birth/conception/combat/divorce/trade/milestone/death/season/research). **The owner's report is this trace**: a leader died with no election, then an election "for the year 0", then a crowned head nobody voted for.

Severity follows from step 2: `lastElectionYear` stays at the sentinel until the **first term election**, so in stored years 0–1 — i.e. for every colony before Year 2 — *any* load while the office is vacant throws away the election in progress and appoints an unelected leader. This is the normal path, not an edge case, and it silently contradicts the founding line's own promise (*"leads the founding colony until the first merit election"*).

The window also shows the raw-year formatting that made the owner read "year 0": their build prints stored years in prose, so `[Y1 D357] … (Year 0)` and *"The 0 election chose growth"* are the first year written as 0. HEAD's equivalents are `displayYear`-based (`storyEvents.ts:670`, `villageLeadership.ts:774,580`), so they read "The 1 election…" / "(Year 2)" — the wording has moved on; the defect has not.

## Regression test

None yet — no code change has been made. Proposed: a real-tick test that kills the leader inside year 0, ticks past the delay, and asserts (a) an election occurred while `state.year === 0`, (b) `getActiveElectionPromises` is non-null for it and `tickElectionPromises` on its evaluation day changes `villageReputation`, and (c) after `validateVillageLeaderOnLoad` on a state whose leader died after that election, `pendingElectionYear` is armed rather than `villageLeaderId` being re-filled. The promises half needs no new fixture: `tests/electionPromises.secondElection.test.ts` already drives `recordElectionPromises` directly and would fail on (b) as soon as the `year <= 0` guards are replaced by an explicit "no active promises" marker.

## Save/migration impact

**This is the reason the repair needs an owner decision.** A save written after a founding-year election stores `lastElectionYear = 0`, which is genuinely ambiguous: it means either "the founder still leads and nobody has been elected" or "somebody was elected in year 0". The disambiguating evidence exists but is indirect — `election_promises_0_*` story flags, a `year=0` `election` event in `eventLog`, or `leaderSinceYear === 0` — and a save may have been pruned of the log. Suggested reading rule, to be confirmed: treat `lastElectionYear === 0` as "never elected" **only** when no year-0 election evidence is present; otherwise treat it as an election in year 0. Fresh worlds are unaffected either way, because `worldGen` already writes `-1`.

## Fix

Not applied. Proposed minimal repair, one meaning per value:

1. **One sentinel.** Keep `-1` for "no election yet" (`worldGen.ts:688`, `saveLoad.ts:823` already use it), change `appointFoundingLeader` (`:571`) to write `-1`, and change `validateVillageLeaderOnLoad` (`:1215`) to test `< 0`. `runVillageElection` keeps writing the real `year`, so a year-0 election becomes distinguishable.
2. **Promises: stop using year 0 as "nothing".** Replace the `year <= 0` guards in `getActiveElectionPromises` (`:191`) and `tickElectionPromises` (`:235`) with an explicit marker (e.g. `FLAG_ACTIVE_YEAR` set to `-1`/cleared when there is no active window), so year 0 is a legal promise year. Pair it with the migration rule above.
3. **Log the postponement once.** In the vacancy path, when `startElectionCeremony` returns false, do not re-enter the "postponed" log every day — record the postponement against the pending election (a flag or the ceremony's own state) so the player sees it once per scheduling attempt, not once per day.
4. **Make the history complete, or make the loss visible.** The cap is population-dependent (the same 2 000 entries are 81 days at population 451 and about a year in a small village), and `legacyGoals.ts:22` derives two gameplay goals from the log — so the window is also a gameplay variable that shrinks as the colony grows. Options, cheapest first:
   - retain a **separate, larger archive** for the save and the export (the UI list can keep its 2 000-entry budget), so `eventLog` stops being the only copy;
   - redefine the bound as **retention** rather than a count — e.g. keep at least one in-game year, or cap by serialised bytes — which needs no new structure;
   - since export-on-save already fires on every save, make it **append to one rolling file** instead of downloading a fresh truncated snapshot each time.
   Whatever is chosen, the header should state the window it actually covers (`Events: 2000, oldest Y0 D197`) so a reader can see the file is partial — the owner had to work that out by hand.

Unrelated, noticed while tracing and deliberately not touched here: `villageLeadership.ts:1227 setNewLeaderPromise` is documented as a "Backward-compatible hook" and has no caller in `src/` or `tests/`.

## Related commits or files

- `src/game/villageLeadership.ts`, `src/game/electionPromises.ts`, `src/game/saveLoad.ts`, `src/game/worldGen.ts`
- `tests/electionPromises.secondElection.test.ts` (drives `recordElectionPromises` directly; its `YEAR = 7` fixture also cannot be a term year — see the audit note)
- `docs/private/audits/2026-09-30/tests-and-scripts-audit.md` §5.2 and §5.6 (how this was found)
