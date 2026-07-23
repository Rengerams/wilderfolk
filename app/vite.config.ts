import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

/** Pre-game / sidebar panels — safe to load after the simulation core. */
const GAME_UI_MODULES = [
  "IntroScreen",
  "MapSetupScreen",
  "StatisticsPanel",
  "EventLogPanel",
  "FocusPanel",
  "PopulationPanel",
  "VillageLeadershipPanel",
  "RoadmapPanel",
  "CombatPreviewPanel",
  "BuildCatalogPanel",
  "BlacksmithForgePanel",
  "ChallengesPanel",
  "CombatLogPanel",
  "FrontierPanel",
] as const

function isGameUiModule(filePath: string): boolean {
  return GAME_UI_MODULES.some(
    (name) =>
      filePath.includes(`/src/game/${name}`) || filePath.includes(`/src/components/${name}`),
  )
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [inspectAttr(), react()],
  server: {
    // Port 3000 is in Windows Hyper-V excluded range 2944–3043 on many PCs (EACCES).
    port: 5173,
    host: '127.0.0.1',
    strictPort: false,
    open: true,
  },
  preview: {
    port: 4173,
    host: '127.0.0.1',
    strictPort: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const filePath = id.replace(/\\/g, "/")

          if (filePath.includes("node_modules")) {
            if (filePath.includes("react-dom") || /\/react\//.test(filePath)) return "react"
            if (filePath.includes("react-router")) return "router"
            return "vendor"
          }

          // Menus / panels — keeps the main simulation chunk smaller.
          if (isGameUiModule(filePath)) {
            return "game-ui"
          }

          if (filePath.includes("sim_dialogue_trees.json")) {
            return "game-dialogue"
          }

          // Renderer files only (not rendererLoader — avoids chunk cycle)
          if (filePath.includes("/src/game/renderer.ts") || filePath.includes("/src/game/huntrenderer")) {
            return "game-render"
          }

          // Heavy leaf modules — split out to keep main game chunk small.
          // NOTE: "hub" modules (groupEvents, dayCycle, frontierCombat, combat,
          // gameTypes, gameTick, gameLoop) stay in 'game' because they're imported
          // bidirectionally by many modules; splitting them causes chunk cycles.
          if (filePath.includes("/src/game/lifeSimulation")) return "game-life"
          if (filePath.includes("/src/game/buildingActions")) return "game-build"
          if (filePath.includes("/src/game/villageLeadership")) return "game-social"

          // Barrel file — keep with its importer (App.tsx / index) to avoid re-export cycles
          if (filePath.includes("/src/game/gameEngine.ts")) return

          // Remaining simulation, audio, and shared game logic
          if (filePath.includes("/src/game/") || filePath.includes("/src/audio/")) {
            return "game"
          }
          // NOTE: "hub" modules (groupEvents, dayCycle, frontierCombat, combat,
          // gameTypes, gameTick, gameLoop) stay in 'game' because they're imported
          // bidirectionally by many modules; splitting them causes chunk cycles.
          if (filePath.includes("/src/game/lifeSimulation")) return "game-life"
          if (filePath.includes("/src/game/buildingActions")) return "game-build"
          if (filePath.includes("/src/game/villageLeadership")) return "game-social"

          // Remaining simulation, audio, and shared game logic
          if (filePath.includes("/src/game/") || filePath.includes("/src/audio/")) {
            return "game"
          }
        },
      },
    },
  },
})
