import type { KnipConfig } from 'knip';


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
    'src/**/*.{ts,tsx,css}',
    'config/**/*.ts',
  ],

  ignoreIssues: {
    'src/audio/index.ts': ['exports'], // [C] soundDirector, TRACKS, TRACK_VOLUMES, playFailSfx, VOLUMES, NOTES, playHuntSound, playErrorSound, startIntroSong, isIntroMusicPlaying, startMusic, stopMusic, stopAllAudio, setMute, VOLUME_PRESETS, initAudio (16)
    'src/audio/interactionSfx.ts': ['exports'], // [C] playFailSfx (1)
    'src/audio/preferences.ts': ['exports'], // [C] VOLUME_PRESETS (1) — re-exported by the ignored audio barrel
    'src/game/apprenticeships.ts': ['exports'], // [A] apprenticeSkill (1)
    'src/game/canvasLayer.ts': ['exports'], // [C] resizeCanvasSurface (1)
    'src/game/citizenId.ts': ['exports'], // [A] findCitizenByQuery (1)
    'src/game/electionPromises.ts': ['types'], // [C] PromiseCode (1)
    'src/game/frontierCombat.ts': ['types'], // [C] RaidChoice, OutgoingRaidEvent (2)
    'src/game/huntingSpots.ts': ['exports'], // [A] getHuntingSpotPreyOption | [C] DEFAULT_HUNTING_SPOT_PREY (2)
    'src/game/moonHowler.ts': ['exports'],
    'src/game/pathfindingMetrics.ts': ['exports'], // [C] isPathfindingMetricsEnabled, getCurrentPathfinderTickCounters, formatPathfinderReport (3)
    'src/game/renderer/logistics.ts': ['exports'], // [C] LOGISTICS_LEGEND (1)
    'src/game/simBuffers/entityRenderMeta.ts': ['exports'], // [C] packRenderMetaForAlive, isHumanSlot (2)
    'src/game/simBuffers/packRenderSoA.ts': ['exports'], // [C] validateRenderBufferHeader (1)
    'src/game/simBuffers/schema.ts': ['exports', 'types'], // [C] isRenderFlagSet, setRenderFlag, clearRenderFlag (3) + RenderField, RenderHeaderIndex (2)
    'src/game/simEffects.ts': ['exports'], // [A] pushTransientParticle (1)
    'src/game/simulation/decisionRegistry.ts': ['exports'], // [A] getDecisionOwner, getDecisionsByCadence, isPropertyWritePermitted (3) — documented in OWNERSHIP_OVERVIEW.md:197
    'src/game/simWorker/protocol.ts': ['types'], // [C] SimPrepPayload (1)
    'src/game/spatialQueryMetrics.ts': ['exports'], // [C] getSpatialQueryGridMode, getCurrentTickMetrics, formatSpatialQueryReport (3)
    'src/game/speciesConfig.ts': ['exports'], // [A] getSpeciesConfig, getPreyEnergyGain (2)
    'src/game/spriteLoader.ts': ['exports'], // [A] isSpriteLoaded (1)
    'src/game/stripJunction.ts': ['exports'], // [A] detectBuildingJunction | [C] straightRotationFromConnections, findStripBuildingNear (3)
    'src/game/stripRender.ts': ['exports'], // [C] drawProceduralWallCorner, drawProceduralWallJunction (2)
    'src/game/terrainGen.ts': ['exports', 'types'], // [A] clusterMountainRegions | [C] GenerateWorldMapOptions (2)
    'src/game/tradeCaravans.ts': ['types'], // [C] TradeCaravanLeg (1)
    'src/game/viewState.ts': ['exports'], // [C] zoomCameraView, followFavoriteEntity (2)
    'src/game/villageLeadership.ts': ['exports', 'types'], // [C] isElectionCeremonyActive, setNewLeaderPromise (2) + ElectionCeremonyPhase, ElectionCeremonyState (2)
    'src/game/worldGen.ts': ['exports'], // [A] generateWorldMap, finalizeSettlerAge (2)
    'src/test/factories.ts': ['exports'], // [B] stubHuman (1) — test-factory surface
  },

  // Resolved by the Vite dev server inside the page, not by Node: the smoke script imports the
  // harness by URL at runtime, so knip cannot see the file behind the specifier.
  ignoreUnresolved: ['/tests/browser/villagePortraitUI.tsx'],

  ignoreDependencies: [
    'oxlint',
    'oxlint-tsgolint',
  ],
};

export default config;
