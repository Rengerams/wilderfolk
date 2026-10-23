# Housing and relocation — how I would build it

Design date: 2026-10-23. Version 0.6.6.0[Unreleased]. Status: **§4 and §6 are implemented on this branch;
§1–§3 and §5 are not.**

Implemented so far: §4's per-member travel bound (`RELOCATION_MAX_MEMBER_REGRESSION_HOURS`) and the
daily move cap (`MAX_RELOCATIONS_PER_DAY`), and §6 in full — a sentence now holds the settler's bed and
their post. The remaining open item is §5: the mandate's confirmed model lets a free home take an adult
child at 18, which is exactly what §5 argues it should not do.
Companion to `docs/plans/housing-architecture-2026-10-22.md` (the mandate and its confirmed decisions) and
to the 2026-10-22 audit of the original specification. Where the mandate already decided something, this
document keeps it and says so; where it left a decision open (§9 adult children, prison reservation, the
shape of relocation), this is my answer, argued from the code as it stands today.

## 1. What I think is actually wrong

The individual rules are mostly right. The **shape** is what produces churn, and that is what I would fix
first — not by adding rules, but by removing the ability of three engines to undo each other:

1. **Three engines move households and none knows the others' intent.** Placement
   (`assignFamilyToResidence`) fills a home that fits; nest-leaving
   (`rebalanceAdultChildrenFromFamilyHomeWhenEmptyAvailable`, `residencyReconciliation.ts`) moves an adult
   child into *any* empty home, before the same day's sweep has decided anything else; the commute trade
   (`relocateHouseholdsForCommute`) then trades a settled household's home for a nearer one. Each is sane
   alone. Together they are a machine for generating move events, which is exactly the shape the Day 121
   report described. The symptom is guarded by `tests/leaderHouse.moonHowlerChurn.test.ts`; the cause is
   the shape.
2. **Two notions of "who belongs here".** Capacity (`getResidenceCapacity`, `residenceRoomFor`) and
   move-eligibility are asked separately at different moments, so a house can read as having room while
   the pass refuses to move anyone. The manor bug fixed on 2026-10-22 was this class; the class survives.
3. **A relocation is scored on the household *total*.** `pickCommuteRelocation` compares the sum of every
   worker's trip to work plus every pupil's trip to school. `pupilsKeepSchoolReach` protects pupils' school
   reach, but nothing protects an individual worker: one person's commute may get much worse while the
   total improves, and the household still moves.
4. **Twelve writers still set `residenceBuildingId`** (audit §4.2). A housing rule that lives in the
   caller — divorce, a Moon Howler form switch, a caravan leaving — cannot be reasoned about from the
   housing module, and cannot be tested there either.

## 2. The model I would hold to

* **The bed is the currency, not the house.** One derived capacity per residence, one authoritative link
  per settler (`residenceBuildingId`), everything else derived. Every rule is then a statement about beds:
  who has one, whose is at risk, which house can hold this set of people.
* **Entitlement is not a move.** A right to a bed (the leader's household in the manor) and a request to
  move (a leaver, a household trade) are different things. The Leader's House already taught us this; I
  would make it the general shape, and keep the current rule that the manor protects its household only
  while a manor stands.
* **Events invalidate; the pulse decides.** An event (marriage, divorce, birth, death, demolition, arrest,
  form switch, caravan cleanup) may clear or set the link it owns and mark the household for
  reconsideration. It never picks a house. This is §14 of the mandate, and I would finish it rather than
  keep the twelve doors.
* **One writer, one reason.** `moveResident(human, buildingId | undefined, reason)` stays the only write
  of a residence, with the reason carried through (`'family'`, `'commute'`, `'prison'` today). A reason is
  what lets the chronicle and the diagnostics explain a move, and what lets a test name it.
* **Pure and ordered.** Every decision is a pure function of `(alive, residences, occupancy, tick)`,
  evaluated in settler-id order, so the same save decides the same way after a load. No rule may depend on
  array order.
* **One move per household per day.** A household that moved today is not a candidate for anything else
  today. That single rule removes more churn than any threshold.

## 3. The housing day I would specify

One order, fixed, each step seeing the previous step's result — written down as the module's contract:

1. **Reconcile links** — clear references to dead settlers and demolished buildings.
2. **Over-capacity** — rehouse unrelated residents first; only if the shortage remains, move the whole
   family together (mandate, confirmed).
3. **Fill empty beds** — anyone homeless while a bed exists gets it; family-first, custodian-follow for
   children, unrelated couples never share a house (mandate, confirmed).
4. **Nest-leaving** — seekers only, under the rule in §5.
5. **Commute trade** — once a day, in the last of the four reassignment buckets, under the rules in §4.
6. **Derive rosters once** — `syncResidenceOccupants`, after all writes of the day.

The point of writing this list down is that steps 2–5 currently overlap in intent. A family that is
rehoused in step 2 must not be re-rehoused in step 5 on the same day, and an adult child who leaves in
step 4 must not be counted as a commute candidate in step 5 against the home they just left.

## 4. Relocation — my rules

Keep the model that shipped: a **daily, batched, route-aware trade**, never a per-tick search, with the
Leader's House exempt. What I would add or change:

* **Score.** Unchanged in spirit: each household's daily travel = every worker's route hours to their
  workplace + every pupil's route hours to their school, priced through `estimatedCommuteHours` so roads
  matter, per-pass cached by leg.
* **Gate, keep and extend.** A move must save at least `RELOCATION_MIN_SAVED_HOURS` (0.5 h/day) and beat
  the current home by `RELOCATION_MIN_IMPROVEMENT_RATIO` (25 %) — the existing anti-oscillation margins.
  **New:** no individual member's own travel may worsen by more than `RELOCATION_MAX_MEMBER_REGRESSION_HOURS`
  (0.25 h/day). This is the fairness rule the total-only score lacks.
* **Cooldown.** A household that moved within `RELOCATION_COOLDOWN_DAYS` (4) is not a candidate. Cheapest
  churn brake there is, and it is independent of the margins, so it also covers the case where a *new*
  building appears and makes a second move look attractive immediately.
* **Quota.** At most `MAX_RELOCATIONS_PER_DAY` (8) moves per colony per day, one per household, in id
  order. A newly built row of houses should not reshuffle the whole valley in one evening.
* **Candidates by corridor, not by list.** Today `buildCommuteRelocationIndex` collects every vacant
  residence and every household prices all of them. I would index vacant homes in the same spatial grid
  the movement code uses and price only those within the household's reach. `buildCommuteRelocationIndex`
  and the per-pass cache already exist; this is a candidate-set change inside them, not a new engine.
* **Explain every move.** The reason already travels with the write; I would let it carry numbers
  (before → after hours) into the chronicle, and have `housingDiagnostics.ts` total relocations per day so
  the long-run gate can assert a ceiling on churn instead of only on consistency.

## 5. Adult children at 18 — my answer to §9

The mandate asks for "an option, not a requirement" and the specification for "never automatically
evicted"; the code does the opposite — an adult child is moved into any empty home as soon as one exists,
whether the family is cramped or not. I would ship neither extreme:

* At 18 a settler becomes a **leaver**: a preference for a home of their own, not a move order.
* Leaving becomes **binding only when the family's home is over capacity** — and only after step 2 has
  tried to rehouse unrelated residents first. Then the eldest leaver goes first. That is not an eviction;
  it is a household that has more people than beds.
* A leaver prefers a **singles' house with another leaver** over an empty family home, so family-sized
  homes stay available for families (this is the "lone settler belongs in a singles' house" decision
  already confirmed, applied at the moment of leaving).
* A leaver is not a candidate again for `RELOCATION_COOLDOWN_DAYS`, and a leaver's destination must not
  lengthen any sibling's school trip (`pupilsKeepSchoolReach` already expresses this idea for the commute
  trade; I would apply the same check here).

Consequence to accept openly: an 18-year-old in a well-housed family **stays**, which changes the tests
that currently assert "any empty home ⇒ move". That is the decision I am asking for.

## 6. Prison stays — reservation, my version

Arrest is, today, a housing event as well as a criminal one: it clears the workplace
(`clearWorkerAssignment`), strips the prisoner from the home's `occupants`, and drops the residence
through `moveResident(..., 'prison')`. The mandate says a prison stay retains both home and workplace.
I would implement it by removing the housing side of the arrest entirely:

* **Links unchanged.** `prisonBuildingId` is set; `residenceBuildingId` and `workerBuildingId` are left
  exactly as they were. No `moveResident` call, and no direct edit of `occupants`.
* **The bed is reserved, not free.** The prisoner still counts as a resident of that house for capacity —
  so nobody is moved into their bed — and the housing pass must never treat it as an empty bed.
* **The post is held.** The prisoner keeps `workerBuildingId`, but `isImprisoned` already gates work, so
  they produce nothing and take no shift credit while jailed. Holding the slot stops the colony from
  hiring a second settler into a job that still has an owner — which is the practical reason the mandate
  asks for this.
* **Prison roster stays a split, not a merge.** A prison's `occupants` is guards ∪ prisoners; a prisoner
  is not a worker there (the counting in `workforce.ts` already does this deliberately).
* **Release is uneventful.** The settler walks home to the house that never changed.
* **Family rule.** An imprisonment alone must never relocate the household; a test should hold the home,
  the workplace and every family member's residence invariant across the whole sentence.
* **Leader rule.** An imprisoned leader keeps the manor — already true through the successor handover
  path; I would state it as a rule rather than a consequence.

## 7. What I would not do

* No new roster arrays and no "housing manager": rosters stay derived from the links, in one place.
* No housing work per tick, no route search outside the daily bucket — the sweep stays four bucketed
  pulses with the trade in the last one.
* No second capacity notion (the manor's beds come from its type, not its stored level).
* No global re-sort to make relocation smarter: bounded local decisions, and the churn ceiling as the
  safety net.
* No reopening of the finished identity work (ids, the `workerBuildingId` rename, birthdates).

## 8. How I would verify it

* Per change: `npm run test:types`, `npm run lint`, `npm run build`, plus the targeted tests; the full
  unit run at the end of each stage.
* Relocation: before/after numbers from the existing population benchmark at ≥ 2400 settlers — the target
  is a daily sweep under 20 ms, and the earlier index work measured 66 ms, so I would re-measure rather
  than assume either number still holds.
* Stability: a full-year run (`scripts/run-full-year.mts`) asserting the housing verdict plus counters for
  relocations and nest-leavings per day under a ceiling, so churn becomes a failure, not a log line.
* Prison: a test that jails a settled worker with a family, steps the sentence, and asserts home,
  workplace, family residences and production stay invariant throughout.
* The §9 rule: a well-housed family's 18-year-old stays; a cramped family's eldest leaves; nobody leaves
  twice in a season.
* Acceptance: the browser gate and the full acceptance run (`npm test -- accept`).
* **Day 121 is still not settled and cannot be from the repository alone.** The closest fixture here is
  `docs/private/saves/wilderfolk-New-Frontier-Y4-D69.json` (year 4, day 69), which is not the reported
  day. A later export from the same colony would let the original event pair be reproduced; until then the
  churn guard stays a guard, not a reproduction.

## 9. Staging

1. **Writers → one door** (behaviour-preserving): every site in audit §4.2 calls `moveResident` with a
   reason; rostering unchanged. Test per event owner.
2. **Prison reservation**: the §6 rule. Gameplay-visible, small, independently verifiable.
3. **Nest-leaving (§5)**: the leaver rule, the per-member travel ceiling, the cooldown.
4. **Corridor candidates, quota and the churn metric (§4)**: performance and stability work last, on top
   of a rule set that is already stable.

Each stage ships and is verified on its own, so a stage that turns out to be a bad idea can be dropped
without unpicking the others.

## 10. What I need from the owner

* **§9**: the leaver rule above, or the stricter "a settled adult is never moved out"?
* **The reserved bed**: is a prisoner's bed theirs while they are jailed (my rule), or is it released to
  the family and re-taken on release?
* **Taste numbers**: quota (8/day) and cooldown (4 days) are guesses that should be picked by watching a
  full year, not by argument.
