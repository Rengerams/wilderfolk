import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

/** Pre-game / sidebar panels — safe to load after the simulation core. */
const GAME_UI_MODULES = [
  "IntroScreen", "MapSetupScreen", "StatisticsPanel", "EventLogPanel", 
  "FocusPanel", "PopulationPanel", "VillageLeadershipPanel", "RoadmapPanel", 
  "CombatPreviewPanel", "BuildCatalogPanel", "BlacksmithForgePanel", 
  "ChallengesPanel", "CombatLogPanel", "FrontierPanel"
]

// Dynamische regex bouwen voor alle GAME_UI_MODULES
const gameUiRegex = new RegExp(`src/(components|game)/(${GAME_UI_MODULES.join('|')})`)

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
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 800,
    // Rolldown specifieke configuratie voor Vite 8
    rolldownOptions: {
      output: {
        minifyInternalExports: true,
        codeSplitting: {
          // Prioriteit werkt van hoog (eerst matchen) naar laag
          groups: [
            {
              name: 'react',
              test: /node_modules\/(react|react-dom)\//,
              priority: 100
            },
            {
              name: 'router',
              test: /node_modules\/react-router\//,
              priority: 90
            },
            {
              name: 'game-ui',
              test: gameUiRegex,
              priority: 80
            },
            {
              name: 'game-data',
              test: /src\/game\/data\//,
              priority: 70
            },
            {
              name: 'game-core',
              test: /src\/game\/(gameTypes|buildings)/,
              priority: 60
            },
            {
              name: 'game-audio',
              test: /src\/audio\//,
              priority: 50
            },
            {
              name: 'game-sim',
              test: /src\/game\/simulation\//,
              priority: 40
            },
            {
              name: 'game-combat',
              test: /src\/game\/(frontierCombat|rivalEvents|defenseStructures|militiaBalance|groupEvents|watchtowerDetection)/,
              priority: 30
            },
            {
              name: 'game-world',
              test: /src\/game\/(worldGen|entityFactory|migration|terrainGen)/,
              priority: 25
            },
            {
              name: 'game-render',
              test: /src\/game\/(renderer\/|huntrenderer)/,
              priority: 20
            },
            {
              name: 'game',
              test: /src\/(game|audio)\//,
              priority: 10
            }
          ]
        }
      }
    }
  }
})