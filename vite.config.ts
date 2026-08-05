import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

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
  plugins: [react()],
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

          // Renderer only (not rendererLoader — avoids chunk cycle with game)
          if (filePath.includes("/src/game/renderer.ts") || filePath.includes("/src/game/huntrenderer")) {
            return "game-render"
          }

          // Do NOT split buildingActions / lifeSimulation / villageLeadership:
          // they form cycles with the game hub (Rollup circular chunk warnings).
          // Barrel gameEngine.ts is left unassigned so Rollup places it with importers.

          // Remaining simulation, audio, and shared game logic
          if (filePath.includes("/src/game/") || filePath.includes("/src/audio/")) {
            return "game"
          }
        },
      },
    },
  },
})
