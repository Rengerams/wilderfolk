import type { KnipConfig } from 'knip';

/**
 * Knip configuration — Wilderfolk.
 *
 * This project has several independent runtime graphs that knip cannot infer by
 * itself, so they must be declared as entry points:
 *
 *   1. The React app bootstrap:              src/main.tsx
 *   2. The browser simulation web worker:    src/game/simWorker/gameWorker.ts
 *      (created at runtime via `new Worker(new URL('./gameWorker.ts', ...))`,
 *      which knip cannot statically follow).
 *   3. The Node / Tauri worker_threads build: src/game/simWorker/gameWorker.node.ts
 *      (dynamically `import('./gameWorker')`, also not statically reachable).
 *
 * Tests and scripts are legitimate consumers of the source (they exercise and
 * profile sim functions), so they are included in `project` to make sure their
 * imports count toward "used". Without them, everything used only by a test or
 * a perf/audit script would be reported as dead.
 *
 * Public barrel/facade modules (gameEngine, gameTypes, dayCycle,
 * groupEvents, etc.) intentionally re-export a stable API surface even when
 * internal callers import the leaf modules directly. Those deliberate re-exports
 * are added as entries below so the audit does not report them as "unused".
 *
 * ---------------------------------------------------------------------------
 * `ignoreIssues` — the tolerated unused-export surface (2026-09-20, X-1)
 * ---------------------------------------------------------------------------
 *
 * Why this exists: `npm run audit` chained `audit:knip && audit:deps`, and knip exited 1 on a
 * always-non-empty list of unreferenced exports, so `scripts/check-import-cycles.mjs` (the
 * load-bearing gate) never ran under `npm run audit`. A gate that always fails is not a gate.
 * The first pass of this fix deleted every export this lane owns or was asked to delete (see
 * "Removed" below); the remainder is tolerated here, per file, with the exact symbols named.
 *
 * Why per file and not per symbol: knip 6 matches `ignoreIssues` on the **file path** only
 * (`node_modules/knip/dist/IssueCollector.js` → `shouldIgnoreIssue(filePath, issueType)`); the
 * `file#symbol` form of `ignore` was a knip 5 feature and no longer suppresses anything. The only
 * per-symbol mechanism knip 6 has left is a `@public` JSDoc tag in the declaring file, which would
 * mean ~92 edits in files owned by other lanes of the running fix campaign.
 *
 * The three tolerated groups, with counts (80 `exports` + 12 `types` = 92 symbols, 49 files):
 *
 *   [A] 16 symbols — **declared owner-module surface**. These are named in `OWNERSHIP_OVERVIEW.md`
 *       as the module's public API (`getDecisionOwner`, `generateWorldMap`, `getSpeciesConfig`, …),
 *       i.e. the deliberate façade the 2026-09-20 audit baseline called out as the reason the
 *       failure had been tolerated. Keep them; they are the module's advertised surface.
 *   [B] 1 symbol — **test-factory surface**: `src/test/factories.ts#stubHuman`. The file is imported
 *       by 12 test files for `building`/`human`/`byType`/`finishedBuilding`; `stubHuman` is the
 *       factory's human-shaped helper that six test files currently re-implement locally, and the
 *       recovered test copies in `tmp/recovered/tests/` import it. Intentional test surface.
 *   [C] 75 symbols — **unreferenced exports whose file this lane does not own**. Deleting them is
 *       their owning lane's call (the campaign's one-writer-per-file rule), so they are listed here
 *       as named debt rather than removed: 29 have no reference anywhere in `src/`, `tests/`,
 *       `scripts/` or the docs, and the rest appear only in the audit/bug narrative that found them
 *       dead (or name-match an unrelated local symbol). Two are worth naming for their owners:
 *       `gameConstants.ts#DAYS_PER_YEAR` is a second home for a constant that `dayCycleClock.ts`
 *       already exports and every caller imports from there, and `simBuffers/*` +
 *       `simWorker/protocol.ts` hold render-buffer helpers kept for the worker ABI.
 *
 * LIMITATION, stated plainly: an entry tolerates *any* new unused export in that file, not only the
 * symbols named on its line. Knip still fails on a new unused export in any other file, on new
 * unused files, and on unlisted/duplicate dependencies repo-wide. Shrinking this list means each
 * owner lane deleting its own [C] entries; the campaign tracker carries them as follow-up.
 *
 * Removed in this pass (route 1, verified dead by knip + grep): buildCatalog.formatBuildingCost,
 * buildingRotation.isCornerRotation, buildingPlacementActions' re-export of
 * isFootprintWithinMapBounds, hospitalCare.findStaffedHospital, hotelStay.isPlayerNearHotel,
 * resourceTypes.{isResourceKey,createEmptyResources,cloneResources,hasEnoughResources,RESOURCE_KEYS},
 * venueSchedule.isVenueServiceTick, workSchedule.isWorkScheduleStartTick,
 * workshops.isValidWorkshopRecipeId, scentGrid.scentSidecarByteLength, gameTypes.{leaderPromise,
 * LeaderPromise}, humanSprites.{USE_NEW_SETTLER_ART_PREVIEW, LEGACY_WALK_SHEET_PATHS}.
 */
const config: KnipConfig = {
  entry: [
    // Independent runtime module graphs that knip cannot infer statically:
    // the browser web worker (loaded via `new Worker(new URL('./gameWorker.ts',...))`)
    // and the Node/Tauri worker_threads build (`import('./gameWorker')`).
    'src/game/simWorker/gameWorker.ts',
    'src/game/simWorker/gameWorker.node.ts',
    // Consumers whose imports should count as real usage.
    'tests/**/*.{test,spec}.{ts,tsx}',
    'scripts/**/*.{ts,mts,mjs}',
    // Public barrel / facade re-export surfaces kept as stable API.
    'src/game/gameEngine.ts',
    'src/game/gameTypes.ts',
    'src/game/dayCycle.ts',
    'src/game/groupEvents.ts',
  ],
  project: [
    'src/**/*.{ts,tsx}',
    'config/**/*.ts',
  ],
  ignoreExportsUsedInFile: true,
  /**
   * Tolerated unused-export surface — see the block comment above for the group definitions,
   * counts and the reason this is file-level rather than symbol-level. Each line names every
   * tolerated symbol in that file and its count, so drift is visible in review.
   */
  ignoreIssues: {
    'src/audio/index.ts': ['exports'], // [C] soundDirector, TRACKS, TRACK_VOLUMES, playFailSfx, VOLUMES, NOTES, playHuntSound, playErrorSound, startIntroSong, isIntroMusicPlaying, startMusic, stopMusic, stopAllAudio, setMute, VOLUME_PRESETS, initAudio (16)
    'src/audio/interactionSfx.ts': ['exports'], // [C] playFailSfx (1)
    'src/audio/sampleLoader.ts': ['exports'], // [C] clearSampleCache (1)
    'src/audio/session.ts': ['exports'], // [C] isGameplayAudioActive (1)
    'src/audio/tracks.ts': ['types'], // [C] TrackId (1)
    'src/game/apprenticeships.ts': ['exports'], // [A] apprenticeSkill (1)
    'src/game/canvasLayer.ts': ['exports'], // [C] resizeCanvasSurface (1)
    'src/game/citizenId.ts': ['exports'], // [A] findCitizenByQuery (1)
    'src/game/combat.ts': ['exports'], // [C] COMBAT_TECH, getHumanStatusCombatIcon (2)
    'src/game/contextualTutorial.ts': ['exports'], // [C] markTutorialsSeen (1)
    'src/game/dialogueTrees.ts': ['exports'], // [C] getDialogueCategories (1)
    'src/game/electionPromises.ts': ['types'], // [C] PromiseCode (1)
    'src/game/forge.ts': ['exports'], // [C] hasAnyForgeUpgrade (1)
    'src/game/frontierCombat.ts': ['types'], // [C] RaidChoice, OutgoingRaidEvent (2)
    'src/game/gameConstants.ts': ['exports'], // [C] DAYS_PER_YEAR (1) — second home; dayCycleClock.ts is the live one
    'src/game/humanSchedule.ts': ['exports'], // [C] isOnWorkShiftFor (1)
    'src/game/humanSprites.ts': ['exports'], // [A] getHumanSpritePath (1) — named in OWNERSHIP_OVERVIEW.md
    'src/game/huntingSpots.ts': ['exports'], // [A] getHuntingSpotPreyOption | [C] DEFAULT_HUNTING_SPOT_PREY (2)
    'src/game/juiceEffects.ts': ['exports'], // [C] LIGHT_POOL_TYPES, getNightGlowIntensity (2)
    'src/game/militiaBalance.ts': ['exports'], // [C] getMilitiaStrengthFromBreakdown, getBarricadeStrengthFromBreakdown (2)
    // [C] MOON_HOWLER_PRIEST_KILL_CHANCE (1). `MoonHowlerSavedState` used to be here; the shape moved to
    // `gameTypes.ts` (which owns `Entity`) so the saved form has one declaration instead of two that
    // disagreed — see bug 38 in `docs/private/audits/2026-09-20/BUG-REGISTER.md`.
    'src/game/moonHowler.ts': ['exports'],
    'src/game/pathfindingMetrics.ts': ['exports'], // [C] isPathfindingMetricsEnabled, getCurrentPathfinderTickCounters, formatPathfinderReport (3)
    'src/game/preferences.ts': ['exports'], // [C] resetPreferencesCache (1)
    'src/game/relationships.ts': ['exports'], // [C] activeFeudCount (1)
    'src/game/renderer/logistics.ts': ['exports'], // [C] LOGISTICS_LEGEND (1)
    'src/game/renderer/nightEffects.ts': ['exports'], // [C] drawNightBuildingGlow (1)
    'src/game/renderer/overlay.ts': ['exports'], // [C] drawNightAtmosphere, drawDayAtmosphere (2)
    'src/game/renderer/shared.ts': ['exports'], // [C] clearNameWidthCache (1)
    'src/game/resourceUtils.ts': ['exports'], // [C] isFoodLow (1)
    'src/game/rivalPresence.ts': ['exports'], // [A] getRivalActivityLabel (1)
    'src/game/simBuffers/entityRenderMeta.ts': ['exports'], // [C] packRenderMetaForAlive, isHumanSlot (2)
    'src/game/simBuffers/packRenderSoA.ts': ['exports'], // [C] validateRenderBufferHeader (1)
    'src/game/simBuffers/schema.ts': ['exports', 'types'], // [C] isRenderFlagSet, setRenderFlag, clearRenderFlag (3) + RenderField, RenderHeaderIndex (2)
    'src/game/simEffects.ts': ['exports'], // [A] pushTransientParticle (1)
    'src/game/simRng.ts': ['exports'], // [C] randomFloat (1)
    'src/game/simulation/decisionRegistry.ts': ['exports'], // [A] getDecisionOwner, getDecisionsByCadence, isPropertyWritePermitted (3) — documented in OWNERSHIP_OVERVIEW.md:197
    'src/game/simWorker/protocol.ts': ['types'], // [C] SimPrepPayload (1)
    'src/game/spatialQueryMetrics.ts': ['exports'], // [C] getSpatialQueryGridMode, getCurrentTickMetrics, formatSpatialQueryReport (3)
    'src/game/speciesConfig.ts': ['exports'], // [A] getSpeciesConfig, getPreyEnergyGain (2)
    'src/game/spriteLoader.ts': ['exports'], // [A] isSpriteLoaded (1)
    'src/game/stripJunction.ts': ['exports'], // [A] detectBuildingJunction | [C] straightRotationFromConnections, findStripBuildingNear (3)
    'src/game/stripRender.ts': ['exports'], // [C] drawProceduralWallCorner, drawProceduralWallJunction (2)
    'src/game/terrainAtlas.ts': ['exports'], // [C] atlasScale (1)
    'src/game/terrainGen.ts': ['exports', 'types'], // [A] clusterMountainRegions | [C] GenerateWorldMapOptions (2)
    'src/game/tradeCaravans.ts': ['types'], // [C] TradeCaravanLeg (1)
    'src/game/viewState.ts': ['exports'], // [C] zoomCameraView, followFavoriteEntity (2)
    'src/game/villageLeadership.ts': ['exports', 'types'], // [C] isElectionCeremonyActive, setNewLeaderPromise (2) + ElectionCeremonyPhase, ElectionCeremonyState (2)
    'src/game/worldGen.ts': ['exports'], // [A] generateWorldMap, finalizeSettlerAge (2)
    'src/test/factories.ts': ['exports'], // [B] stubHuman (1) — test-factory surface
  },
  /**
   * `tw-animate-css` is consumed from CSS (`src/index.css`), which knip's JS/TS follower cannot see,
   * and removing it breaks the build. `tailwindcss` itself is *not* listed: it is not a direct
   * dependency here (the build uses `@tailwindcss/vite`), and knip correctly says so.
   */
  ignoreDependencies: [
    'tw-animate-css',
  ],
};

export default config;
