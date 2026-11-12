# Audit remediation — Phase 0 fixes and open backlog (2026-11-11)

One consolidated report for the fixes made from [the full audit](../plans/full-code-audit-2026-11-11.md). Supersedes the per-bug files created during this phase; historical reports in `docs/BUG_REPORTS/` are untouched.

## Status

| State | Meaning |
|---|---|
| **Fixed** | Code changed, regression test written, targeted suite green. |
| **Verified** | Fixed and the full standard/calendar gate ran green. |
| **Open** | Confirmed, not yet fixed. |

**Phase 0: 11 defects fixed.** Full-gate verification is recorded in [the remediation log](../plans/audit-remediation-log-2026-11-11.md).

## Fixed in Phase 0

| ID | Severity | Defect | Root cause | Fix (canonical owner) | Regression |
|---|---|---|---|---|---|
| S-01 | Blocker | Forge orders consume inputs but never progress | `tickVillageForge` gated on the current tick with a midnight-only predicate while the only call runs at 18:00 | Gate on the caller-owned `productionDayTick` with `FORGE_PACE_INTERVAL_TICKS` (`forge.tickVillageForge`); sibling producers already use that anchor | `tests/forge.cadence.test.ts` (red→green), `mapScale.pacing` 5 |
| S-03/W-01 | Blocker | Leaving loses the session; tab close saves nothing; new game can delete an unsaved colony | Session cleanup nulled `loopRef` before persistence read it; no `pagehide`; setup confirm armed only on a browser slot | `useGameSession` saves via `onBeforeStop` before clearing the ref; `persistOnSessionStop` + synchronous `pagehide` slot write; `waitForPendingSave` before `deleteSave`; confirm on `hasRunningColony` | `tests/leaveColony.save.test.ts` 4, `useGamePersistence` 10 |
| S-02 | High | Wildkin grazing → `NaN` energy → never starves/breeds/is hunted | Retired grazer wiring left in place while its diet became meat-only | Removed from `GRAZER_METABOLISM`/grazer ease/scent flee/grass bite; added to `tickWildlife` hunting (deer/rabbit), `rebuildPredators` and `HUNTER_TYPES`; spawn energy from config | `tests/wildkin.apexRole.test.ts` 12, ecosystem demand 2 |
| W-02 | High | `disasters:[null]` permanently wedges every systems tick | Transient pools cast from JSON without element validation | Element-wise filtering in `restoreTransientWorldFieldsFromSave`; `disasters:[null]` loads as `[]` | `tests/saveBoundary.malformed.test.ts` 7 |
| W-145 | Medium | A `NaN` energy saves as `null` and kills the animal on reload | `entityFieldRules` did not validate the field metabolism reads | Finite `energy`/`maxEnergy` when present; absence still allowed for legacy saves | same save-boundary test |
| W-03 | Medium | Crafted Fishing Spot footprint can freeze the loader | Building width/height trusted as loop bounds | `buildingFieldRules` bounds width/height to the map before sampling | same save-boundary test |
| W-04 | Medium | Non-compact `worldMap` bypasses the map-size guard | Nested dimensions trusted on the non-compact path | `findUnrestorableField` validates tile dims through `isUsableMapTileCount` | same save-boundary test |
| W-111 | High | Stale strip-demolition confirm destroys buildings in a loaded colony | Per-colony component state outlived the colony | `clearColonySessionState` cancels it at the one leave/enter boundary | `tests/leaveColony.save.test.ts` |
| W-112 | Medium | Family-tree target survives a load and opens the wrong entity | Same residue | Same boundary clears `familyTreeFor` | same test |
| W-113 | Medium | Stale battle report can resolve a raid id from the loaded war | Same residue | Same boundary clears `battleReport` | same test |
| W-07 | Medium | Intro silent after one colony; colony music never stops | `stopAllAudio` had no caller; director state never cleared | Boundary calls it; begin-audio effect restarts on session/setup transitions | same test |

### Notes that matter

- **Forge pace is two days per step**, not one. That is the advertised `FORGE_PROGRESS_PER_TWO_DAY_TICK` pace; the fix restores it rather than retuning balance.
- **Pagehide cannot await a worker export.** It writes the display shadow synchronously and reports `authoritative: false`; normal exits still save the authoritative export. This is the honest trade-off, not a silent downgrade.
- **Load deliberately does not save the outgoing colony** — that would overwrite the slot/file being loaded; the load dialog already warns about losing unsaved progress.
- **W-136 is still open and paired with S-06**: production currently fails open at zero attendance samples, so fixing off-screen movement alone would hide lost output.

**Phase 0: 11 defects fixed.** Phase 1: 9 workstreams fixed. Full-gate verification is recorded in [the remediation log](../plans/audit-remediation-log-2026-11-11.md).

## Fixed in Phase 1

| ID | Severity | Fix | Regression |
|---|---|---|---|
| S-06 | High | Out-of-focus settlers keep the commanded walk and integrate it every throttled tick; decisions still run 1-in-24 | `tests/production.attendancePacing.test.ts` |
| W-136 | Med-High | `getWorkdayAttendance`: a positive rota/presence tick is the sample, so zero presence pays 0; all-zero/legacy uses the settled hours | same |
| S-18 | High | `isPassiveBuild = House || maxOccupants === 0`; uncrewed passive pace 1.0, so crewless Wall/Barn/Mill finish on advertised days | same |
| W-09 | High | Defense order Barracks, Prison, then trades | same |
| S-17 / W-70 | High | Custodian groups seat whole or legally split (custodian + youngest together), never unhousing a seated adult; repair uses the legal split first | `tests/housing.custodianSplit.test.ts` 7 + 197 housing |
| W-64 + W-123–W-125 | High | One expiry contract; each story resolves its own chain with an explicit fate; lapsed ranger gives the traveller howler variant, not the false returning-ranger beat | `tests/story.expiryResolvers.test.ts` 10 + 82 |
| W-05 | High | Terrain patches coalesce per tile in a Map; nothing evicted | `tests/terrain.patchQueue.test.ts` |
| W-118–W-122 | Med-High | Canonical `getBuildingCenter`/`isAtHall`/`isLegalCampSite`; anchor, town-hall reach, faction/venue centres, validated camps | `tests/geometry.footprintCentre.test.ts` 4 + 153 |
| Pregnancy duplication | High | Dedicated `src/game/pregnancy.ts` owns start/due/validity/fraction; `entityFactory` and `humanRelationships` delegate; no import cycle | `tests/humanLifecycle.test.ts`, `dupA` 16 |

## Open backlog (next), by verified size

### Phase 1 — core simulation

| ID | Size | Defect |
|---|---|---|
| S-06 + W-136 | High + Med-High | Off-screen humans move 1/24 speed; production pays full output for a crew that never reached the post — fix together |
| S-18 | High | Zero-occupancy builds can never be crewed → 4.55× advertised days |
| S-17 | High | Custodian+minors larger than any home stay homeless beside free beds |
| W-64 + W-123–W-125 | High | Expired story cards orphan their chain; guided campaign 5/5 unreachable; year-0 arc also affected |
| W-09 | High | Defense preset ranks Barracks/Prison last despite “barracks first” |
| W-05 | High | Terrain patch queue drops the oldest 256 patches |
| W-118/W-119 | Med-High | Camp anchor and Town Hall service double-count the footprint half-size |
| S-08/S-09/S-10 | Medium | Trade food ledger, grass regrowth, hospital geometry |
| W-104, W-107/W-108 | Medium | Social cadence burst, worker command/recovery freezes |

### Phase 2 — shell, rendering, UI

W-06, W-08, W-30, W-131/W-132/W-130, W-21/W-22, W-62, W-69, W-48, W-135, plus the existing lows in audit §11.

### Phase 3–4 — economy, ecology, world

S-14/S-16, W-36, W-77, W-81, W-126–W-129, W-133/W-134, W-137–W-144, and the rest of the medium register.

### Phase 5 — gates/tests/ownership

Wire the year-long test into CI; make invariants fail; remove `--passWithNoTests`; delete the vacuous scratch test; ownership coverage floor; fix the stale tracked call-graph artifact.

## Verification

- Targeted: 113 tests across Phase 0/1 suites; housing 197; story 82; geometry 153; production 14; pregnancy 72 — all pass.
- Full gate: `npm run test:standard` **PASS** — 515 files / 3,347 passed / 2 skipped / 10 steps / 301.7 s.
- Owners, semantic-duplicate and import-cycle gates pass; all three TypeScript projects pass; lint 0 errors.
- Open: S-10 hospital geometry; faction camp/hotel/march off-screen paths; S-08/S-09, W-104, W-107/W-108 and the rest of the audit register.
