# Settler trait effects — one + and one − per trait, with the professions they help and hurt

Plan only. No production code has been written for this. Owner's request, verbatim:

> "and we have 15 eigenschappen voor een persoon, we moeten voor eidere eigenschap een + en een - vaststellen
> denk ik en bij welke beroepen ze een + krijgen en bij welke ene - nu doen we nog te weinig me de eigenschappen"

## 1. The real trait count: **14**, not 15

`src/game/settlerTraits.ts:20` `TRAIT_DEFS` holds **14** entries, `TRAIT_POOL` (`:107`) lists the same 14, and
`SettlerTrait` in `src/game/gameTypes.ts:136-150` unions the same 14. There is no 15th trait anywhere in the
tree. The reconciled list — `hardy, brave, gregarious, timid, greenthumb, lucky, nurturing, insightful,
chivalrous, resourceful, stoic, graceful, intuitive, fierce` — matches all three definitions exactly.

**Needs the owner:** is a 15th trait missing on purpose, or was "15" a round number? Nothing in the code
suggests a dropped trait, so this plan assumes 14 and the table has 14 rows.

### What traits do **today** (the honest starting point)

Not "nothing": traits are already read in five places, and the code is inconsistent about which trait is read
where. Nothing reads them for **production output**, **skill gain**, **casualty chance**, or **illness**.

| Where | Traits actually read today |
| :--- | :--- |
| `src/game/settlerTraits.ts:244` `traitMultiplier` | the only generic helper; a single trait → a constant |
| `src/game/skills.ts:115-120` `getWorkerSkillMultiplier` | `resourceful` inline (+10 % each, cap +30 %) — **production only** |
| `src/game/simulation/humanNeeds.ts:142,173,174` `humanEnergyLoss` | `greenthumb` (winter ×0.7), `hardy` (×0.85), `fierce` (×0.9) |
| `src/game/humanTick.ts:795,1145-1147` | `timid` (flee ×1.35), `gregarious` (court ×1.4), `timid` (×0.7), `graceful` (×1.2) |
| `src/game/humanHuntingBehavior.ts:88,174` | `brave` (hunt range ×1.25, chase ×1.2) |
| `src/game/simulation/humanRelationships.ts:851,891` | `lucky` (conception ×1.15 on two paths) |
| `src/game/relationships.ts:52` `traitClashCount` | pair clashes → feud chance (reads both settlers) |

So 10 of the 14 traits are read mechanically somewhere and **4 are read nowhere**: `nurturing`, `insightful`,
`chivalrous`, `intuitive`. None of the 14 affects production or skill except `resourceful`. That matches the
owner's "we still do too little with the traits".

## 2. The design table

Every effect is a number on a mechanic that **already exists** — no new system, no new resource. Magnitudes are
small on purpose: skill already multiplies output by up to 3× at skill 100 (`skills.ts:121`,
`(1 + avg × 0.02)`), so a trait must be a nudge, not a second skill ladder.

| Trait | `TraitDef` text today | proposed **+** | proposed **−** | Helps | Hurts |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `hardy` | Loses energy 15 % slower — works the frontier longer. | production +6 % (energy drain ×0.85 exists) | skill gain −6 % (set in his ways) | Miner, Lumberjack, Builder | Teacher, Doctor |
| `brave` | Ranges farther and chases game harder while hunting. | production +6 % (hunt range ×1.25 exists) | skill gain −6 % (rushes in) | Hunter, Soldier, Fisher, Guard, Lumberjack, Blacksmith | Doctor, Teacher |
| `gregarious` | Courts faster and chats more around the village. | production +6 % (court ×1.4 exists) | skill gain +8 % (learns from everyone he talks to) | Merchant, Innkeeper, Hotelier | Hunter, Lumberjack, Miner, Builder |
| `timid` | Courts slower and flees sooner from predators. | skill gain +8 % (careful, studies the work) | production −6 % (won't take the risk; flee ×1.35 exists) | Doctor, Teacher, Priest | Hunter, Soldier, Fisher, Lumberjack, Blacksmith |
| `greenthumb` | Farms yield more and winters cost less. | production +6 % (winter resist ×0.7 exists) | skill gain −6 % (does it by feel) | Farmer, Fisher | Miner, Blacksmith |
| `lucky` | Better hunt luck and a bit more likely to conceive. | skill gain +8 % (things fall into place) | production −6 % (trusts luck over method) | Hunter, Fisher, Miner | Blacksmith |
| `nurturing` | Children mature faster while they live in the village. | production +6 % (patient with the work) | skill gain −6 % (too gentle to drill) | Teacher, Doctor, Farmer, Priest | Hunter, Soldier, Miner |
| `insightful` | A sharp mind — the village researches a little faster. | production +6 % (head in the problem, not the task) | skill gain −6 % | Teacher, Doctor, Blacksmith | Lumberjack, Miner, Farmer |
| `chivalrous` | Gallant and protective — adds militia strength in a raid. | production +6 % (must do it the honourable way) | skill gain −6 % | Soldier, Guard, Builder | Merchant, Miner, Hunter |
| `resourceful` | Solves practical problems fast — builds quicker on site. | production +6 % (already live at `skills.ts:115` as +10 %, capped +30 %) | skill gain −6 % (improvises instead of learning it properly) | Builder, Lumberjack, Blacksmith, Miner | Farmer, Teacher |
| `stoic` | Calm and steady — mourns loss and recovers sooner. | production +6 % (unfazed all shift) | skill gain −6 % (never asks) | Guard, Soldier, Miner, Lumberjack, Doctor, Builder, Priest, Farmer | Merchant, Innkeeper |
| `graceful` | Poised and elegant — courts and charms a little faster. | production +6 % (court ×1.2 exists) | skill gain −6 % (all presentation, no practice) | Merchant, Innkeeper, Hotelier, Blacksmith | Miner, Lumberjack, Soldier |
| `intuitive` | Sharp instincts and empathy — chats up coworkers more. | production +6 % (reads the animal / the patient) | skill gain −6 % (trusts instinct over method) | Hunter, Fisher, Doctor, Teacher | Miner, Blacksmith |
| `fierce` | Passionate and determined — burns energy slower on the job. | production +6 % (energy ×0.9 exists) | skill gain −6 % (burns out, won't be taught) | Hunter, Soldier, Guard, Lumberjack, Builder | Doctor, Merchant |

**How to read the two columns.** Production is the **job-dependent** axis: a trait helps some trades and hurts
others, and the mirror rule in §2.1 is enforced on exactly this axis. Skill gain is a **per-trait constant**
(three traits learn faster — `timid` +8 %, `lucky` +8 %, `insightful` +8 %, `chivalrous` +8 %; the other ten
−6 %), and it does **not** depend on the job. That split is deliberate and is what makes the mirror rule
provable; §2.1 says why an axis that is simultaneously job-dependent and fixed-size cannot mirror.

**Magnitudes, fixed per direction and identical on every row:**

| Direction | Hit | Hurt | Example |
| :--- | :--- | :--- | :--- |
| production (job-dependent) | **+6 %** | **−6 %** | `brave` ×1.06 at the Hunting Spot, ×0.94 in the Hospital |
| skill gain (per trait, job-independent) | **+8 %** | **−6 %** | `timid` learns any trade faster, `insightful` faster still, `brave` slower |
| aggregate clamp | production **×[0.85, 1.15]** | skill gain **×[0.85, 1.15]** | three matching production traits = ×1.18 → clamped to ×1.15 |

Hit and hurt are the same size on each axis, so a trait is a straight trade and the declared opposite pairs
cancel exactly. This is the "smallest complete slice": production and skill gain only, for all 14 traits. A
3-trait draw that matches the job moves output by about 6–18 % and skill gain by about −18 %…+8 %, so the
numbers themselves are a Stage 0 decision for the owner.

### 2.1 Internal consistency — and the one rule that does **not** work

The declared opposites are in `TRAIT_OPPOSITES` (`settlerTraits.ts:151`): **`brave/timid`** and
**`gregarious/timid`**. The rule to enforce is the strong one — for every job the pair's production factors
multiply to **exactly 1.0**, because the roll never lets both exist on one settler and the effects should
cancel if it ever did. (The skill-gain constant then cancels too: `timid` +8 % against `brave` −6 % is not
exact, see §6.5 — the owner should make the learning traits +6 % if exactness is wanted on both axes.)

**It only works on the production axis. That is a real design constraint, not a shortcut:**

* Production is **job-dependent**: a trait's helped and hurt sets are disjoint, so flipping the sets and the
  signs of an opposite gives `help(timid) = hurt(brave)`, `hurt(timid) = help(brave)` and an exact reciprocal.
* Skill gain here is a **per-trait constant**, because an axis that is both job-dependent and fixed-size
  cannot satisfy both pairs: if `H_p` (production helped) and `H_s` (skill helped) may overlap, a job can sit
  in `H_p` and `H_s` at once, its reciprocal then needs one sign for production and the other for skill, and
  no fixed `+hit / −hurt` encoding produces that vector. Checked explicitly: with `brave.hurt = {doctor,
  teacher}` and `brave.skill-help` also containing `doctor`, the inverse of `brave` at doctor is a
  production *hurt* and a skill *help* simultaneously — unrepresentable.
* The same reason rules out widening the mirror to `TRAIT_CLASHES`: `brave` and `gregarious` are both
  opposites of `timid`, so both pairs mirroring would force `help(brave) = help(gregarious)`, i.e. the two
  traits would have to be the same trait. `TRAIT_CLASHES` (`relationships.ts:38`) therefore stays a **social**
  table only: `gregarious/stoic` are inverse in spirit (one trades, one endures), `fierce/stoic` likewise
  (one burns, one banks), and `chivalrous/fierce` is deliberately not inverse — both are brave, one honourable
  and one brutal. None of the three is required to cancel and none is asserted to.
* The requirement "the opposites mirror" is therefore met **literally** for the two pairs the roll forbids,
  and met **in kind** for the three pairs that merely clash.

The same invariant, as the table defines it: **no trait appears in both its own helps and its own hurts**,
and **no job is in one trait's helps and its opposite's helps** (that is what makes the flip well-defined).
Checked row by row for all 14: both hold. `Settler` (unemployment) and `Guard` (legacy, `gameTypes.ts:126`)
carry no rows by design; every live post has at least one claim.

Arithmetic for the two declared pairs:

```
brave      : prod help {hunter, soldier, fisher, guard, lumberjack, blacksmith} ×1.06
             prod hurt {doctor, teacher} ×0.94                      skill gain ×0.94
timid      : prod help = exactly brave.hurt, prod hurt = exactly brave.help,
             with the signs flipped, so for every job  prod(timid) == 1 / prod(brave)  exactly
gregarious : prod help {merchant, innkeeper, hotelier} ×1.06, prod hurt {hunter, lumberjack,
             miner, builder} ×0.94
=> the stage-1 test does not read these constants: it derives each opposite's expected
   factor from the base trait's own table row and asserts the product is 1 ± 1e-9 for every JobType.
```

Three more rows of the table exist purely so no post is dead: `timid` claims the Hospital and the School,
`insightful` claims the Blacksmith, and `stoic` claims the Prison and the Church — the four "never read today"
traits each have a live claim.

## 3. Where it plugs in — one owner per hook

Every hook below already has a single owner. The one new owner is the trait-effects reader, and it belongs to
`settlerTraits.ts` (`OWNERSHIP_OVERVIEW.md:140`, "Settler trait rolls and their multipliers").

| Hook | Sole owner today (`path:line`) | Stage | Note |
| :--- | :--- | :--- | :--- |
| Trait effects table + per-entity-per-job reader (NEW) | `src/game/settlerTraits.ts:243-251` (beside `traitMultiplier`/`hasTrait`) | **1** | one owner; never `traits.includes(...)` at a call site |
| Production multiplier (`totalMult`, all 10 producers) | `src/game/skills.ts:102-122` `getWorkerSkillMultiplier`, called at `src/game/dailyBuildingEconomy.ts:456` and `:254` (construction), plus `src/game/workshopEconomy.ts:69` | **1** | the trait factor multiplies in beside the existing `resourcefulMult` |
| Skill-gain amount (worked shift) | `src/game/skills.ts:90-100` `rewardBuildingWork` / `:72-81` `rewardProductionSkills` / `:47-58` `gainSkill`, called at `src/game/dailyBuildingEconomy.ts:493` and the per-producer `gainSkill(..., 0.2, ...)` calls (`:525`, `:266`, `:270`) | **1 — BLOCKED** | `skills.ts` is being edited by another worker now; and per the brief the hook lands **at the caller** (`dailyBuildingEconomy.ts`), never inside `skills.ts` |
| Casualty chance (wolf fight-back) | `src/game/huntingSpot.ts:310` `huntingFightBackKillChance` / `:327` `huntingFightBackFate`, consumed at `src/game/dailyBuildingEconomy.ts:618-621` | **2 — BLOCKED** | owned by the wolf work, which is mid-change (the signature grew a `HuntingFightBackHunter` context) |
| Illness / exhaustion | `src/game/simulation/humanRelationships.ts:956` (illness roll, `HUMAN_DAILY_ILLNESS_CHANCE` from `src/game/dayCycle.ts:316`); `src/game/simulation/humanNeeds.ts:127-177` (`humanEnergyLoss`, `killFromExhaustion` `:73-89`) | **3** | `humanNeeds` already reads three traits; this stage only makes the set complete |
| Relationships (feuds / friendship / courtship) | `src/game/relationships.ts:38-57` `traitClashCount`, `:148` `advanceSocialRelationships`; courtship at `src/game/humanTick.ts:1145-1147`; conception at `src/game/simulation/humanRelationships.ts:851,891` | **4** | already live; this stage only adds the second axis (which trades a settler clashes with) |

## 4. TODO — one checkbox per work item, with its acceptance criterion

Legend: **[B]** = blocked on another worker's file or the wolf work; do not start until that lands. Each
stage's revert is the same shape: `git revert <stage commit>` — one stage per commit, nothing else in it.

### Stage 0 — freeze the design (no code)

- [ ] **0.1 Owner signs off the magnitudes** (production ±6 %, skill gain +8 %/−6 %, clamps ×[0.85, 1.15]) and the
      help/hurt assignments in §2. *Acceptance:* the owner's answer is recorded in this file. *If not signed off,
      stop — everything below is unblocked work on unapproved numbers.*
- [ ] **0.2 Owner answers §6** (the 15th trait, whether traits touch combat at all, whether `resourceful` keeps
      its existing live +10 %/+30 % or is folded into the new table, and whether the learning traits go to +6 %
      so skill gain cancels exactly too).
      *Revert:* delete the answers.

### Stage 1 — the shared owner + production and skill gain (the owner's core request)

- [ ] **1.1 Add the effects table and `getTraitJobModifier(entity, job)` to `src/game/settlerTraits.ts`**
      (pure; reads `entity.traits`; unknown/absent traits → `1.0`; no `NaN` when `traits` is undefined).
      *Acceptance (new test `tests/settlerTraitEffects.test.ts`):* an untraited settler and a settler carrying an
      unknown trait both return exactly `1.0` for every `JobType`.
      *Revert:* remove the table and the reader.
- [ ] **1.2 Route the production factor through the owner** at `src/game/skills.ts:118-121` (multiply the
      aggregate into the existing return, beside `resourcefulMult`) and delete the inline
      `h.traits?.includes('resourceful')` at `:115` so `resourceful` lives only in the table.
      *Acceptance:* `tests/settlerTraitEffects.test.ts` builds two identical mill crews, one with `hardy`
      (helps Miner, not Lumberjack) and one with `resourceful` (helps Lumberjack), and asserts the resourceful
      crew's `getWorkerSkillMultiplier` is strictly greater; **and** `tests/uiSingleOwner.test.ts:197` (which
      pins `getWorkerSkillMultiplier` at the `SelectedBuildingPanel` call site) still passes.
      *Revert:* restore the inline `resourceful` count, drop the multiplication.
- [ ] **1.3 Route the skill-gain amount through the owner at the callers, not inside `skills.ts`.**
      **[B]** — `src/game/skills.ts` is being edited by another worker right now; and the brief forbids editing
      it for this hook. The modifier is applied where the amount is passed:
      `src/game/dailyBuildingEconomy.ts:493` (`rewardBuildingWork(..., WORK_SKILL_PER_SHIFT, ...)`) and the
      `gainSkill(..., 0.2, ...)` calls at `:266`, `:270`, `:525`. The owner reader exposes the per-trait
      skill-gain constant (§2: job-independent), so the call sites multiply the amount and nothing else.
      *Acceptance:* `tests/settlerTraitEffects.test.ts` runs one `gameTick` on a fixture in the shape of
      `tests/workSkillAttribution.accrual.test.ts:54` (`staffedWorld`) with an `insightful` teacher and a `brave`
      teacher, and asserts the insightful one's `readSkill(..., JobType.Teacher)` is strictly higher after the
      same tick, both above 0.
      *Revert:* pass the raw `WORK_SKILL_PER_SHIFT` / `0.2` again.
- [ ] **1.4 Prove the opposite pairs mirror on the production axis.** *Acceptance:*
      `tests/settlerTraitEffects.test.ts` derives, for every `JobType`, each opposite's expected production
      factor from the base trait's own row (helped job of the base → hurt job of its opposite and vice versa)
      and asserts `factor(base) × factor(opposite) === 1.0` within `1e-9` — for both `brave/timid` and
      `gregarious/timid`. The test must not hard-code the percentages, so a later magnitude change cannot fake it.
      *Revert:* with 1.1.
- [ ] **1.5 Prove each of the four "never read today" traits is now measurable** (`nurturing`, `insightful`,
      `chivalrous`, `intuitive`). *Acceptance:* one assertion per trait that its factor differs from `1.0` on a
      job it helps and on a job it hurts.
      *Revert:* with 1.1.
- [ ] **1.6 Bounded and symmetric.** *Acceptance:* a property assertion over every `JobType` that the factor
      stays inside `[0.85, 1.15]`, and that no factor is `NaN` for a settler with `traits: undefined`,
      `traits: []`, or three traits that all hurt the job.
      *Revert:* with 1.1.
- [ ] **1.7 Register the new owner in `OWNERSHIP_OVERVIEW.md:140`** (add `getTraitJobModifier` to the
      `settlerTraits.ts` row; keep the row's single owner). *Acceptance:* the row names the function.
      *Revert:* remove the name from the row.
- [ ] **1.8 Full-year economy check.** *Acceptance:* `npx tsx scripts/run-full-year.mts --days=180` before and
      after shows the invariants (no negative stores, population not zeroed, buildings still completing) and
      colony health no worse than before. Record both numbers in the stage commit.
      *Revert:* with the stage commit.
- [ ] **1.9 Gate the stage:** `npm run test:types`, `npx vitest run tests/settlerTraitEffects.test.ts
      tests/settlerTraits.test.ts tests/workSkillAttribution.accrual.test.ts`, `npm run lint`, `npm run build`.
      *Acceptance:* all green except the two suites already red from other workers' edits — `tests/raids.cadence.test.ts`
      and `tests/workSkillAttribution.accrual.test.ts` must be reported as observed, not fixed here.
      *Revert:* n/a (read-only gate).

### Stage 2 — combat and casualty (later)

- [ ] **2.1 Add the casualty factor to the effects table** (`brave`/`fierce`/`timid`/`chivalrous` only).
      **[B]** — the wolf work owns `huntingSpot.ts` and is mid-change.
      *Acceptance:* a unit assertion on the pure table, no fight-back roll involved.
      *Revert:* drop the casualty column.
- [ ] **2.2 Apply it at `huntingFightBackKillChance(skill)`** by widening the context it already takes
      (`HuntingFightBackHunter`, `huntingSpot.ts:319`) rather than adding a second parameter.
      *Acceptance:* `tests/huntingFightBack.fate.test.ts` style test showing a `brave` hunter's fatal band is
      strictly smaller than an untraited one's, and a `timid` hunter's strictly larger, at equal skill.
      *Revert:* the single call-site change.

### Stage 3 — illness and exhaustion (later)

- [ ] **3.1 `hardy`/`fierce` energy drain comes from the table, not two hand-written `traitMultiplier` calls**
      (`src/game/simulation/humanNeeds.ts:173-174`). *Acceptance:* `humanEnergyLoss` unchanged for an untraited
      settler; the existing energy tests still pass. *Revert:* restore the two lines.
- [ ] **3.2 Add an illness-recovery direction** using the existing daily illness roll
      (`src/game/simulation/humanRelationships.ts:956`). *Acceptance:* a `stoic` settler's daily illness chance
      is strictly lower than an untraited one's at equal age and valley stage. *Revert:* the one expression.
- [ ] **3.3 Add the winter/cold direction for `stoic`** (currently only `greenthumb` resists winter,
      `humanNeeds.ts:142`). *Acceptance:* the unheated-winter loss for a `stoic` settler is strictly below an
      untraited settler's, above a `greenthumb` one's. *Revert:* the one modifier.

### Stage 4 — relationships (later)

- [ ] **4.1 Give `traitClashCount` (`relationships.ts:46`) its second axis: which *trades* a settler clashes
      with**, read from the same effects table (two settlers whose helped jobs are each other's hurt jobs are
      more likely to feud). *Acceptance:* a pure test that a pair of opposite-trade settlers produces a strictly
      higher clash count than a pair of matching-trade settlers. *Revert:* the added term.
- [ ] **4.2 Move the court/charm multipliers (`humanTick.ts:1145-1147`) onto the owner** so `gregarious`,
      `timid`, `graceful` are read from the table, not by name at the call site. *Acceptance:* the existing
      courtship tests pass unchanged; the numbers are identical for those three traits. *Revert:* restore the
      three `traitMultiplier` calls.
- [ ] **4.3 Facade copy:** `src/components/SelectedEntityPanel.tsx:17` reads `TRAIT_DEFS` descriptions. Update the
      `description` strings so each states its plus and its minus (the table's wording). *Acceptance:* one
      `TRAIT_DEFS` assertion that every description of the 14 traits is non-empty and names both a help and a
      hurt. *Revert:* restore the description strings.

### Stage 5 — release bookkeeping (last)

- [ ] **5.1 Changelog wording** (owner's wording is in §7; another worker owns `CHANGELOG.md`, so hand it over,
      do not edit it). *Acceptance:* the owner pastes it.
- [ ] **5.2 Roadmap registration** in `Roadmap_V0_6.5.MD`. *Acceptance:* the item exists in the existing format.
- [ ] **5.3 Full checklist:** `npm run test:types`, `node scripts/check-comments.mjs`, `node scripts/check-docs.mjs`,
      `npx vitest run <touched suites>`, `npm run lint`, `npm run build`,
      `npx tsx scripts/run-full-year.mts --days=360`. *Acceptance:* all green except the pre-existing reds named
      in 1.9. *Revert:* n/a.

**Item count:** Stage 0 → 2, Stage 1 → 9, Stage 2 → 2, Stage 3 → 3, Stage 4 → 3, Stage 5 → 3. **22 items**, of
which **2 are blocked** (1.3 on `skills.ts`, 2.1/2.2 on the wolf work).

## 5. Comment discipline and boundaries for whoever implements this

* Comments max 2 lines, no dates, no file:line, no "used to be" (`node scripts/check-comments.mjs` ratchets
  newly added comments only). The rationale for a magnitude goes here, not in the code.
* Do not touch, from the current briefing: `README.md`, `CHANGELOG.md`, `src/game/frontierCombat.ts`,
  `src/game/rivalEvents.ts`, `src/components/FrontierPanel.tsx`, `src/game/simWorker/commands.ts`,
  `src/game/huntingSpot.ts`, `src/game/humanLifecycleCleanup.ts`, `src/game/villageLeadership.ts`,
  `src/game/simQueries.ts`, `src/game/speciesConfig.ts`, `src/game/ecosystemPressure.ts`, `src/game/skills.ts`,
  `BUG_REPORTS/**`, `tests/raids.cadence.test.ts`, `tests/workSkillAttribution.accrual.test.ts`.
* `tests/raids.cadence.test.ts` and `tests/workSkillAttribution.accrual.test.ts` were **already red** when this
  plan was written, from other workers' edits. Report, never fix.

## 6. Not decided yet — needs the owner

1. **The 15th trait.** The code has 14 everywhere. Add a 15th, or is 14 correct?
2. **Does a trait affect combat at all?** Stage 2 assumes yes for `brave`/`fierce`/`timid`/`chivalrous`. The
   owner may prefer combat left to skill and the militia rule.
3. **`resourceful`'s existing live numbers.** It currently gives **+10 % each, capped +30 %** inline
   (`skills.ts:115-120`) — far bigger than the table's +6 %. Fold it down to +6 % (consistent, but a real nerf
   to a trait already in the wild) or keep it as a documented exception?
4. **Does skill gain have to cancel exactly?** Production does, to the last decimal. Skill gain is a per-trait
   constant (+8 % for the four learning traits, −6 % for the other ten) and cannot be derived reciprocally from
   a job-dependent table — §2.1 shows why. Making it exact means every learning trait goes to **+6 %**, the
   reciprocal of −6 %. Owner's call: an exact swap, or a slightly bigger reward for learning?
5. **Do the learning traits keep the +8 % edge at all?** Ten of fourteen traits are net −6 % on skill gain,
   which is a real drag on a colony where skill drives output up to 3×. If that reads as too punishing, the
   lever is the learning set (add `nurturing`, `graceful`) rather than the magnitude.
6. **Magnitudes themselves.** §2's numbers are the smallest slice that is still measurable. If the owner wants
   traits to *feel* stronger, the lever is the clamp (`[0.85, 1.15]`), not the per-trait percentages.
7. **Should the inspector show the numbers?** Stage 4.3 proposes the `TraitDef` text carry the + and −. That is
   player-facing copy and needs a yes.
8. **`TRAIT_OPPOSITES` versus `TRAIT_CLASHES`.** Not a blocker, and §2.1 shows the mirror rule cannot be
   widened to the clash pairs without making `brave` and `gregarious` the same trait. The owner may still want
   the *roll* to forbid all five clash pairs as a separate, social decision.

## 7. Changelog wording (for the owner to paste — do not edit `CHANGELOG.md`)

> **Added: every settler trait now helps some trades and hinders others** — the 14 personalities each gained a
> stated plus and minus, feeding building output and how fast that settler learns the trade, so a posted
> settler's traits finally matter as much as their skill.

Under 300 characters, names no files or paths. Two further entries for the later stages:

> **Changed: a hunter's nerve now shows in how a wolf's bite resolves** — brave and fierce hunters face a
> narrower fatal band, timid ones a wider one, at equal skill.

> **Changed: traits now read on illness, winter and feuds, not only on energy** — a settler's personality
> reaches the daily illness roll, the cold and who they fall out with.

## 8. Verification of this plan document

* `node scripts/check-docs.mjs` — **passed** when this file was written: *"Docs check passed: 7 documents linked
  clean, newest changelog section concise."* (It checks tracked documents' links and the newest changelog
  section; a new file under `docs/plans/` is not a tracked link document, so it cannot break it, and
  `CHANGELOG.md` was not edited.)
* No file under `src/`, `tests/`, `OWNERSHIP_OVERVIEW.md`, `CHANGELOG.md` or `BUG_REPORTS/**` was touched for
  this plan. `git status --short -- src tests OWNERSHIP_OVERVIEW.md CHANGELOG.md BUG_REPORTS` shows only other
  workers' in-flight edits, and `git status --short -- docs` shows this one file.
* Not run, deliberately (documentation-only change): the test suites, the type check, the lint and the build.
  Stage 1's checklist in §4 is where those run.
