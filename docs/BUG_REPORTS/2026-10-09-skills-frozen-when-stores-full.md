# Name of file: 2026-10-09

- Bug: Trade skill is paid for accepted output, so every profession whose store is full stops learning
- Status: resolved
- Date discovered: 2026-10-09
- Version/build: 0.6.5.0
- Reporter: reported from play by the owner ("i noticed i have alot of masters in farming +100"), traced and measured by the agent
- Area: Play
- Owner module: `src/game/skills.ts` — the skill credit; wired by `src/game/dailyBuildingEconomy.ts`
- Cadence: new-calendar-day (`SKILL_CREDIT_INTERVAL_TICKS`), per staffed workplace

## Status history

- 2026-10-09 — open (found while explaining why only farming produced masters in the owner's Year 3 save)
- 2026-10-09 — resolved (shift credit added for every profession; regression tests red before, green after)

## Observed behavior

A census of the owner's save `wilderfolk-New-Frontier-Y3-D183.TXT` (Year 3, day 903, read from the saved
entity fields) shows one trade growing and every other trade frozen at its entry skill:

| job | holders | skill 100 | 90-99 | mean |
|---|---|---|---|---|
| farmer | 112 | 12 | 0 | 25.3 |
| lumberjack | 99 | 1 | 1 | 11.1 |
| miner | 132 | 1 | 0 | 4.4 |
| blacksmith | 34 | 0 | 0 | 3.0 |
| merchant | 35 | 0 | 0 | 6.6 |
| hunter | 106 | 0 | 0 | 2.0 |
| teacher | 152 | 0 | 0 | 0.4 |

Only **44 of 1 055** job-holders are master-eligible (skill ≥ 40 in their own job) and only **28 of 608**
juveniles are apprenticed. Every store in that save stands at exactly its cap
(`wood 13200/13200, stone 7700/7700, food 14800/14800, gold 20000/20000, iron 1800/1800`), which is the
witness for the cause below: the trades whose goods nobody consumes had nothing left to sell.

## Expected behavior

A settler who works a trade grows in it. Three years at a forge, a quarry or a school desk should produce
a master, not a beginner — and the game's own apprenticeship bar (skill ≥ 40) and election merit
(`Σ skills × 2`) both assume it does.

## Reproduction steps

1. Let a colony run until its stores reach their caps (the owner's save: day 903).
2. Read `skills` for the holders of each job in the save.
3. Farmers hold skill in the tens; miners, blacksmiths, merchants and hunters sit at single digits; teachers
   sit at zero.

Reproduced in the harness as a unit fixture: a staffed Lumber Mill with `resources.wood` at `storageMax`
credits its lumberjack `0` skill for a full day's work before the fix
(`tests/workSkillAttribution.accrual.test.ts`).

## Evidence

Per-profession credit paths, as they stood before the fix (`path:line`):

| profession | credit source before | rate | reached 100? |
|---|---|---|---|
| farmer | harvest accepted — `dailyBuildingEconomy.ts:523` (0.2) | ~0.2/day | yes, 12 of 112 |
| lumberjack | wood accepted — `:783` (0.2) | ~0.2/day | 1 of 99 |
| miner | stone/ore accepted — `:826`, `:853` | ~0.2/day | 1 of 132 |
| blacksmith | workshop cycle sold — `:980` | ~0.1/day | no |
| merchant | store/market gold accepted — `:760`, `:921` | ~0.1/day | no |
| hunter | a kill in reach — `:690` | ~0.17/day, prey-dependent | no (max 17) |
| teacher | **nothing** | 0 | no (mean 0.4) |
| official | town-hall civic — `townHall.ts:218` (0.06 / 3 days) | ~0.02/day | no |
| doctor | a ward round — `hospitalCare.ts:197` (0.08) | patient-dependent | no |
| prison guard, priest, soldier, innkeeper, hotelier, builder | a special path only, or nothing | ≈0 | no |

The stored `skills` for those teachers confirm it: 65 of 152 held any teacher skill at all, and their
highest skill was usually in a trade they had produced in (`builder` for 23 of them).

## Root cause

Every production credit sat behind the storage clamp:

```
src/game/dailyBuildingEconomy.ts:523   if (added > 0 && productionJob) { … gainSkill(…, 0.2, …) }
src/game/dailyBuildingEconomy.ts:826   if (addProductionOutput(…) > 0) rewardProductionSkills(…, 0.2, …)
src/game/dailyBuildingEconomy.ts:980   if (getAvailableStorageHeadroom(state, 'gold') < amount) { … no credit … }
```

`addResource` caps at `storageMax` and returns what it accepted, so on a full store the credit paid `0` —
the crew kept working, the store refused the goods, and the trade stopped learning. Food and wood kept
flowing (they are eaten and burned), which is why farming was the one trade that produced masters, and why
the owner's election could only ever be won by a farmer. Civic posts had no credit path at all.

## Fix

Skill is now paid for the shift, not for the goods:

- `src/game/skills.ts:43` — `WORK_SKILL_BUILDING_TYPES` is derived from `BUILDING_JOB_TYPES`, so every
  staffing post the game can assign is covered and a new workplace teaches its trade without a second edit.
- `src/game/skills.ts:90` — `rewardBuildingWork` credits each occupant that trade at `WORK_SKILL_PER_SHIFT`
  (`0.2`, line 32) on `SKILL_CREDIT_INTERVAL_TICKS` (one day, line 35).
- `src/game/dailyBuildingEconomy.ts:491` — called for every completed staffed post, whether or not storage
  accepted anything. The old output-based credits are kept as the bonus they are: an accepted harvest still
  pays its own 0.2 on top, so a working store out-earns a full one rather than a full one earning nothing.
- `src/game/dailyBuildingEconomy.ts:269` — a construction crew's own trade is now paid the same shift
  credit, so a Builder on a site learns Building (before: 0.15/day of the site's trade only, and nothing
  for Builder itself).

No credit stacks twice for one shift: a settler is at one post per day, and the special paths (soldier XP
from fighting, doctor from ward rounds, hotelier from guests, hunter from a kill) pay for an event on top of
the shift — which is the design the hunter and soldier paths already had.

## Per-profession result

| profession | credit after the fix | rate at full attendance | 100 in |
|---|---|---|---|
| farmer, lumberjack, miner, blacksmith, merchant | shift `:491` + accepted-goods bonus | 0.2–0.4/day | ~250–500 days |
| hunter | shift `:491` + a kill (`:690`) | ~0.2–0.37/day | ~270–500 days |
| teacher, prison guard, priest, official, innkeeper | shift `:491` | 0.2/day | ~500 days |
| soldier | shift `:491` + raid XP (`frontierCombat.ts:583`) | 0.2/day + raids | ~500 days |
| doctor | shift `:491` + a ward round (`hospitalCare.ts:197`) | 0.2/day + ward | ~500 days |
| hotelier | shift `:491` + a guest (`hotelStay.ts:378`) | 0.2/day + guests | ~500 days |
| builder | construction site `:269` (0.15 progress + 0.2 shift) | ~0.35/day on an active site | ~290 days of site work |
| settler, guard (legacy) | no trade — a settler is not a profession | — | n/a |

Master-eligible (≥ 40) now arrives at about **200 days** in every trade, where before only farming could
reach it. That is what unblocks apprenticeships (`MASTER_SKILL = 40`, `apprenticeships.ts:13`) and feeds
election merit, so the leadership pool stops being a farmer monopoly by accrual rather than by fiat.

## Regression test

`tests/workSkillAttribution.accrual.test.ts` — 6 cases, **5 red before the change** (proven by reverting
`SKILL_CREDIT_INTERVAL_TICKS` and the two new credit calls, then restoring):

- a lumberjack earns a shift into a full wood store, where the output was refused
- an accepted load still pays its bonus on top, so an idle store out-earns a full one
- a teacher, a prison guard and a priest each earn a full shift (civic posts had no path at all)
- a hunter earns the shift at the post as well as the kill
- a builder earns the shift on a site
- the trade set stays derived from `BUILDING_JOB_TYPES`, so no post can be silently dropped

## Invariants checked

- One credit per shift: the shift credit is paid once per workplace per day, and the output bonus and
  special paths are separate events, not a second payment for the same hours.
- The credit never depends on an output that does not exist — a civic post has no store to refuse.
- `collectSimulationInvariantErrors` remains clean in the leadership suites; the year-gate harnesses were
  not re-run (see Verification result).

## Save/migration impact

None. `skills` is already persisted and `gainSkill` clamps at 100; the fix changes which settlers accrue,
not the save shape. Existing saves keep the (low) skills they earned and begin growing in their trade from
the next colony day, so the owner's Year 3 save recovers without a migration.

## Verification result

- `tests/workSkillAttribution.accrual.test.ts` — 6/6 pass; 5/6 fail with the fix reverted.
- `tests/villageLeadership.test.ts` — 23/23 pass (merit rebalance in the same pass; see below).
- `npm run test:types` — PASS on the changed files; one **pre-existing** failure remains outside this diff
  (`tests/dailyEvents.chronicleCopy.test.ts(31,10)`, an untracked file another writer added — `TickContext`
  cast missing `predators`).
- `node scripts/check-comments.mjs` — PASS.
- Forward measurement (**seeded control colony**, one staffed post per trade, 720 colony days): 12 of 14
  trades at skill 100 (farmer, miner, blacksmith, merchant, hunter, teacher, soldier, innkeeper, hotelier,
  official, doctor, priest), against the same run with the fix reverted where only the producing trades
  moved and every civic trade stayed at 0. One further 6-day fixture measured a populated Lumber Mill
  paying its lumberjack **0.4/day** (site trade 0.2 + shift 0.2). The owner's own save is the before
  census above; it recovers from the next colony day after loading the fixed build.

## Related commits or files

- `src/game/skills.ts` — `WORK_SKILL_PER_SHIFT`, `SKILL_CREDIT_INTERVAL_TICKS`, `WORK_SKILL_BUILDING_TYPES`, `rewardBuildingWork`
- `src/game/dailyBuildingEconomy.ts:269`, `:491` — the two credit sites
- `BUG_REPORTS/2026-09-30-officials-never-recorded-on-shift.md` — the *attendance* half (open, separate);
  it is why the shift credit is paid at a flat rate rather than scaled by `presenceMult` for civic posts
- `CHANGELOG.md` — merit rebalance entry for the election half of the same player-visible problem

## Fix

Landed 2026-10-09. Shift credit for every profession (`src/game/skills.ts`, wired at
`dailyBuildingEconomy.ts:269` and `:491`), with the output bonus retained as a bonus. The merit weighting
was assessed separately at the owner's request and rebalanced in the same pass (experience, service,
community and title now reach roughly one capped trade skill together; a scandal is softened to −4 rather
than −5 with the loss of the clean-term bonus).
