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
]

function manualChunks(id: string): string | undefined {
  const normalized = id.replace(/\\/g, '/')

  if (normalized.includes('/node_modules/react/') || normalized.includes('/node_modules/react-dom/')) {
    return 'react'
  }
  if (normalized.includes('/node_modules/react-router/')) {
    return 'router'
  }
  if (GAME_UI_MODULES.some((name) => normalized.includes(`/src/components/${name}`) || normalized.includes(`/src/game/${name}`))) {
    return 'game-ui'
  }
  if (normalized.includes('/src/game/data/')) {
    return 'game-data'
  }
  if (normalized.includes('/src/game/renderer/') || normalized.includes('/src/game/huntrenderer')) {
    return 'game-render'
  }
  if (normalized.includes('/src/game/') || normalized.includes('/src/audio/')) {
    return 'game'
  }

  return undefined
}

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    host: '127.0.0.1',
    strictPort: false,
    open: true,
  },
  preview: {
    port: 4173,
    host: '127.0.0.1',
    strictPort: false,
    open: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        manualChunks,
        minifyInternalExports: true,
      },
    },
  },
})
