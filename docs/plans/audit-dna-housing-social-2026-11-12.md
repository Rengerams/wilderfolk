# DNA, housing and marriage/social — focused re-audit (2026-11-12)

**Scope:** current working tree (including the uncommitted camp cleanup), specifically:
- DNA / genetics / personal marks
- Housing pipeline and its invariant audit
- Marriage, affairs, conception and the social/dialogue cadence
- The recent architecture documents for those systems

**Method:** read the owners and their callers, compare against the stated contracts, and run the
focused suites. Tests are treated as regression evidence, not proof that the original failure mode is
gone; every finding below is backed by the current code path.

**Baseline:** at the start of the audit the full `standard` gate was **red at step 7/10 (types)**
because `tests/saveMigration.roundtrip.test.ts:69` still wrote the removed `Building.campLabel`
field. **The fixture was fixed during the audit (11:38)** and
`tsc -p tsconfig.vitest.json --noEmit` exits **0**. The subsequent full run passed steps 1–9; its
unit step failed once only because `tests/zz-probe.test.ts` was deleted while vitest was scanning it.
After the deletion settled, the unit step passed **527 files / 3,493 tests**. The gate is green.
The three focused suites below also pass independently.

---

## Findings

| ID | Severity | Finding | Evidence | Impact | Fix |
|---|---|---|---|---|---|
| F-1 | **Resolved during audit** | The working tree briefly did not typecheck: the camp cleanup removed `Building.campLabel`, but the legacy-save migration test still set it. The fixture now casts the legacy shape (`Building & { campLabel?: string }`) and typecheck passes. | `tests/saveMigration.roundtrip.test.ts:63-74`; `npx tsc -p tsconfig.vitest.json --noEmit` exits 0. | The gate briefly stopped before the unit tests. It no longer does. | Keep the cast as the explicit legacy-save fixture; no further change needed. |
| F-2 | **Medium** | `personDayRoll` salts collide: the dynamic neighbor salts overlap fixed social salts, so separate decisions are perfectly correlated. | `src/game/socialLife.ts:386` uses `715 + abs(h.id)`; for `h.id === 1` that is salt **716**, the same as the comfort roll at `:388`. For `h.id === 2` it is **717**, the same as the comfort dialogue roll at `:393`. `src/game/socialLife.ts:472` uses `724 + abs(other.id)`; for `other.id === 1/2` that is **725/726**, the greeting variant/reply rolls. For large colonies the same expression reaches 839–841, the named leisure/hospital salts in `src/game/simRng.ts:82`. | A neighbor with id 1 can only be chosen as “weary” when the comfort roll also passes, doubling/distorting the intended odds; the greeting gate and its variant are coupled for low ids. | Add one pair-day salt helper (or a reserved high range) that hashes `(entity, other)` and cannot overlap fixed salts. Add a test enumerating ids 1–200 and asserting no two social rolls share a salt. |
| F-3 | **Medium (architecture docs)** | The DNA architecture is current in code but the documents still describe the retired pipeline and omit the citizenship owner. | `docs/plans/personality-career-single-pipeline-0.6.5.2.md` names `traitEffectCatalog.ts`, `evaluateTraitInfluence`, `TraitContext` and `TraitInfluence`; those files/functions do not exist. The live code uses `personality/activityAptitudes.ts` and `evaluateAptitudeInfluence`. `docs/DNA_APTITUDES_ARCHITECTURE.md` lists the `settlerTraits.ts` public API without `establishCitizenIdentity`, and its `conception` row says “Married/youth” although `humanRelationships.ts` now applies the mark factor to the affair route too. `OWNERSHIP_OVERVIEW.md` names `establishCitizenIdentity` only in the save/rollback row, not in the `settlerTraits.ts` genome-identity row. | A developer following the old plan could create a second trait catalog/evaluator; the citizenship owner is missing from the DNA API/owner table; the conception contract no longer matches the code. | Mark `personality-career-single-pipeline-0.6.5.2.md` as superseded (or update its references). Add `establishCitizenIdentity` to the `settlerTraits.ts` row and the DNA public-API table; change the conception row to “married/youth/affair”. |
| F-4 | **Medium/Low (contract)** | The “one social scene per person per colony day” rule is enforced per event family, not per person. | `socialLife.ts:432` checks `hasDialogueSceneOnDay(entity, tick, WORKPLACE_SCENE_KEYS)` and `:470` checks `GREETING_SCENE_KEYS`. A settler can greet in the morning and banter at noon on the same day. `tests/socialCadence.oneScenePerDay.test.ts` only tests repeated banter and repeated greeting, not greeting + banter. | The original W-104 burst is fixed, but the stated one-scene-per-day contract is broader than the implementation and the test name overstates coverage. | If one scene per person is intended, gate both paths on a shared social-scene key set (or a per-day social flag). Otherwise correct the contract/test name to “one scene per family per day”. |
| F-5 | Low (documentation) | The housing architecture status line is stale. | `docs/HOUSING_ARCHITECTURE.md:3/44` still says the pipeline is finished and “the only open item is the relocation-churn investigation”, while the same document’s §10 marks tests/acceptance PARTIAL and the recent remediation added W-70/W-75 fixes. | A reader can mistake housing for fully accepted; the document contradicts its own status table. | Update the status line to 2026-11-12 and list the remaining partials (acceptance matrix, relocation churn, invariant-audit scope). |
| F-6 | **Resolved during audit** | `tests/zz-probe.test.ts` was tracked scratch: four of its five cases used `expect(true)` and only `console.log`; the fifth only asserted `welcomed.length > 0`. It was deleted during the audit; the unit scan then failed once because vitest had already indexed the removed file. | `tests/zz-probe.test.ts` no longer exists; the unit rerun is recorded in the verification table. | The five fixes W-77/W-81/W-82/W-85/W-86 now have no coverage at all — deleting the vacuous probe is better than keeping it, but real regressions are still missing. | Add real regressions for those five before claiming them fixed. |
| F-7 | Low (documentation/trust) | The audit remediation documents claimed a green verification while the tree was still mid-cleanup. | `docs/plans/audit-remediation-log-2026-11-11.md` says `types` passes and every finding is fixed; at the start of this audit the working tree failed at `campLabel`, then passed after the fixture fix. `docs/plans/full-code-audit-2026-11-11.md` §0.3 makes the same claim. | The status was written ahead of the tree, so “all fixed / types PASS” was briefly false. The broader issue remains: the log records no baseline-failing regression per finding. | Mark the log “implemented, not verified” until the full gate is green and the baseline counterfactuals are recorded; keep the fixture-fix timeline in the log. |

---

## System verdicts

### DNA / genetics

**Code:** one genome per settler (`settlerTraits.ts`), one signed activity registry
(`personality/activityAptitudes.ts`), one bounded evaluator (`personality/traitEvaluation.ts`), and
one mark writer (`personalMarks.ts`). Founder allocation, inheritance, mutation, expression, save
allow-list, worker prep/delta and legacy backfill all match the DNA architecture. The `conception`
activity has no aptitude weights and reads only the acquired lucky mark; `tryDailyConception` applies
that factor on the married, youth and affair routes. No parallel evaluator or second genome exists.

**Tests:** 7 files / **87 tests passed** (`settlerTraits`, activity registry, evaluator, legacy DNA,
legacy consumer audit, personal marks, romance context).

**Audit result:** no DNA code defect found in the audited paths. The problems are documentation and
ownership registration (F-3), not the genotype/evaluator logic.

### Housing

**Code:** `assignMissingResidences` is the one scheduler; `relocateHousehold` is the one household
writer; `writeResidence` is the one `residenceBuildingId` write and enforces the bed cap; the
capacity pass protects custodian groups, never sheds a minor/custodian, and unhouses a dependent
unit together when no destination exists. The weekly audit reads `report.violations` and the manor
family is included. The documented contracts in `HOUSING_ARCHITECTURE.md` match the code on the
audited points.

**Tests:** 10 files / **70 tests passed** (custodian split, pipeline invariants, authority, completion,
capacity writers, leader-house capacity/expansion, divorce/blended custody, pulse audit).

**Audit result:** no new housing code defect found. Residual risks, both already documented:
- the writer gate depends on the caller supplying `context.buildings`/occupancy (W-74 caveat);
- `collectHousingInvariantViolations` reports splits/overcapacity/missing references, not a whole
  homeless family with free assignable beds; the latter is a shortage (`collectFamilyHousingShortages`),
  not an invariant violation.

### Marriage / social

**Code:** one dialogue entrypoint (`dialogueTrees.requestDialogue`), one session writer
(`humanChat`), no direct `chatPhrase`/`chatTicks` writes outside the owner; `factionWander` and
`humanSocial` request through the dialogue owner. Marriage, affair, conception and divorce remain in
`humanRelationships`/`relationships`; the affair conception roll uses the same mark factor as the
married/youth routes. The W-104 burst is fixed: a scene is requested at most once per family per day.

**Tests:** 14 files / **67 tests passed** (social cadence, busy gates, chat pairing/duration/sleep,
dialogue pipeline/routing/save parity, affair cadence/age, amicable divorce, custody, friendship/feud).

**Audit result:** the social/dialogue pipeline is consolidated. Two issues remain: the salt collisions
(F-2) and the per-family vs per-person day gate (F-4).

---

## Recent architecture documents reviewed

| Document | Status | Code match |
|---|---|---|
| `docs/DNA_APTITUDES_ARCHITECTURE.md` (6 Nov) | Current; one genome/evaluator/mark pipeline | Yes, except the missing `establishCitizenIdentity` API/owner row and the “married/youth” conception wording |
| `docs/HOUSING_ARCHITECTURE.md` (11 Nov) | Current on the pipeline contracts | Yes; status line and §10 are stale (F-5) |
| `docs/plans/dialogue-single-pipeline-0.6.5.2.md` (2 Nov) | Current; one speech entrypoint | Yes; no legacy `sayHumanChatPhrase`/`maybeDialogueChat` bypass found |
| `docs/plans/personality-career-single-pipeline-0.6.5.2.md` (28 Oct) | **Superseded** by the 14-dimension DNA architecture | No: names `traitEffectCatalog.ts`/`evaluateTraitInfluence`, which no longer exist (F-3) |
| `docs/plans/genetic-aptitudes-personality-overhaul-2026-11-02.md` (2 Nov) | Current design source, but its “current state” section still names the retired trait catalog | Partly; the implementation note is current, the evidence section is historical |
| `docs/plans/full-code-audit-2026-11-11.md` + `audit-remediation-log` (12 Nov) | Status claims were written ahead of the tree | The gate is now green, but the log still records no baseline-failing regression per finding (F-7) |

---

## Verification

| Check | Result |
|---|---|
| DNA focused suite | 7 files / 87 tests passed |
| Housing focused suite | 10 files / 70 tests passed |
| Social/marriage focused suite | 14 files / 67 tests passed |
| `npm run test:standard` | **PASS** — steps 1–9 green; unit step **527 files / 3,493 tests** after the probe deletion. The one earlier step-10 failure was a race with the deleted `zz-probe` file, not a test failure. |
| `npx tsc -p tsconfig.vitest.json --noEmit` | **PASS** (exit 0) |

**Not covered:** `calendar-scheduler`, `colony-integration`, the year/parity harness, and a browser
run. This audit is a focused code/doc review, not a full release verification.

---

## Recommended order

1. Fix F-2 with one pair-salt helper and a collision test.
2. Update F-3/F-5/F-7 documentation/ownership rows; decide F-4’s intended contract and either
   enforce it globally or correct the test/report wording.
3. Add real regressions for W-77/W-81/W-82/W-85/W-86 now that `zz-probe` is gone (F-6).
4. Re-run the remaining gates; only then mark the remediation log “verified”.

---

## Resolution (2026-11-12, same tree)

| ID | Status | What changed |
|---|---|---|
| F-2 | **Fixed** | `simRng.personPairDayRoll(aId, bId, tick, salt)` hashes both ids; the weary-comfort and greeting gates use it, so no `salt + id` arithmetic can collide with fixed salts. Regression: `tests/socialCadence.oneScenePerDay.test.ts` enumerates 200 partner ids and rejects any id-added salt in `socialLife.ts`. |
| F-3 | **Fixed** | `docs/DNA_APTITUDES_ARCHITECTURE.md` lists `establishCitizenIdentity` in the `settlerTraits.ts` API and the conception row now says married/youth/affair with the mark factor on all routes; `OWNERSHIP_OVERVIEW.md` names the citizenship owner in the genome-identity row; `personality-career-single-pipeline-0.6.5.2.md` is marked superseded. |
| F-4 | **Fixed** | `hasDialogueSceneOnDay` now counts any event family when no keys are passed; greeting and workplace banter are both gated by the same per-person day check. Regression: the same social suite proves a greeting blocks same-day banter. |
| F-5 | **Fixed** | `docs/HOUSING_ARCHITECTURE.md` status line is now 2026-11-12 and names the writer gate, weekly invariant audit and the spend/arrival budget instead of the stale open investigation. |
| F-6 | **Fixed** | `tests/zz-probe.test.ts` is deleted; real frontier regressions are `tests/frontier.legacyEvents.test.ts`, `tests/campKey.contract.test.ts` and `tests/invariants.collectorCanFail.test.ts`. |
| F-7 | **Addressed** | The claims in the remediation log now carry the final gate evidence; per-finding proof is in `docs/plans/audit-remediation-evidence-2026-11-12.md` (R/F/A/S kinds, four demonstrated red→green reverts). |
