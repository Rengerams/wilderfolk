# Ordinary end-of-day fatigue fills hospital wards as medical cases

- Bug: every settler under 42% stamina was eligible for hospital care, even though the normal 9-hour workday deliberately ends at about 30% stamina before sleep.
- Status: investigating — source fix and regression tests committed; CI and live-save verification pending
- Severity: medium
- Date discovered: 2026-11-23
- Version/build: 0.6.5.2 development (main at time of investigation)
- Reporter: player screenshot and day-176 New Frontier save
- Area: human physiology / hospital triage and roster
- Owner module: `src/game/hospitalCare.ts` (medical admission, urgency, ward roster); `simulation/humanPhysiology.ts` remains the sole critical-stamina threshold owner
- Related PR: hospital triage PR (2026-11-23, link added in PR description)

## Status history

- 2026-11-23 — open: player screenshot showed ten "exhausted" settlers in a single ward, including ordinary low stamina.
- 2026-11-23 — investigating: code trace showed a medical threshold below 42%, although physiology's intended baseline leaves 30% at bedtime and already marks below 15% stamina critical.
- 2026-11-23 — source fix committed: medical need/reason/urgency now uses the one critical threshold, keeps late pregnancy and grief, and excludes ordinary fatigue from ward rosters and clinician triage. CI still pending.

## Observed behavior

`hospitalCare.needsMedicalCare` returned true for `stamina < 0.42`; `medicalCareReason` labelled them `exhausted`. Both `getHospitalRoster` and `isRestingHospitalPatient` relied on this medical verdict; `medicalUrgency` separately prioritised people below 55% stamina and could select non-patients for nearby doctor treatment.

In the uploaded day-176 save (tick 50758), among 182 living player humans, 23 had stamina in [15%,42%) with no active grief, and five were below 15%. These 23 would count as medical cases from fatigue alone under the old gate. The screenshot came from a different observed moment; it is not asserted to match the JSON ward counts exactly.

## Expected behavior

Normal fatigue follows the established home/hotel sleep and needs-break path. Medical admission from stamina alone requires actual critical exhaustion below `HUMAN_NEEDS.STAMINA_CRITICAL` (15%). Late pregnancy, grief with low stamina, and physician-attended ward recovery continue unchanged. An otherwise healthy visitor standing inside a hospital must not be listed as an admitted patient.

## Reproduction steps

1. Construct an adult player settler with `needs.stamina=30` and legacy `energy` either full or depleted.
2. Before the fix, `needsMedicalCare(human, tick)` was true, `medicalCareReason` reported `exhausted`, and a staffed ward could list them as a patient if indoors.
3. A `needs.stamina=10` settler represents actual critical exhaustion and must remain eligible; a 60%-stamina grieving settler and a near-term pregnant settler must also remain eligible.

## Evidence

- Player screenshot: ten ward patients all marked `exhausted`.
- Day-176 save: 23 ordinary-fatigue settlers under 42% but at or above the existing 15% critical threshold (and no active grief).
- `humanPhysiology.HUMAN_NEEDS.STAMINA_CRITICAL=15`, `resolveHumanNeedsIntent` uses it for needs breaks; ordinary nightly sleep recovers the stamina reserve.
- Regression tests: `tests/hospitalCare.stamina.test.ts` and `tests/hospitalWalk.regression.test.ts`.

## Root cause

The hospital threshold of 42% was inconsistent with a day/night stamina model deliberately designed to approach 30% before bedtime. An independent urgency table extended treatment interest up to 55%, without matching actual medical eligibility.

## Fix / proposed fix

- `hospitalCare` consumes `HUMAN_NEEDS.STAMINA_CRITICAL / 100` for stamina-only care and reasons; no new threshold.
- `medicalUrgency(entity, tick)` derives urgency from the canonical `medicalCareReason`, preventing non-patients from being treated by a nearby doctor and keeping grief/late pregnancy triage.
- Ward roster and daily ward-round comparators pass the current tick.
- Normal sleep, breaks, pregnancy route to staffed wards, and verified indoor admissions retain their existing owners.

## Save/migration impact

None. No new state or version change. Existing saved ward patients below the old 42% threshold will cease to appear as medical admissions on the next simulation update unless they have some other real care need.

## Verification result

Focused regression tests added; CI status pending. No tests have been claimed as passed yet.
