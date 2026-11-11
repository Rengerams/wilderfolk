
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"
import { srcAlias } from "./config/vite.shared.ts"

/** Pre-game / sidebar panels — safe to load after the simulation core. */
const GAME_UI_MODULES = [
  "IntroScreen", "MapSetupScreen", "StatisticsPanel", "EventLogPanel", 
  "FocusPanel", "PopulationPanel", "VillageLeadershipPanel", 
  "CombatPreviewPanel", "BuildCatalogPanel", "BlacksmithForgePanel", 
  "ChallengesPanel", "CombatLogPanel", "FrontierPanel"
]

// Dynamische regex bouwen voor alle GAME_UI_MODULES
const gameUiRegex = new RegExp(`src/(components|game)/(${GAME_UI_MODULES.join('|')})`)

export default defineConfig({
  base: './',
  plugins: [
    tailwindcss(),
    react()
  ],
  // 1. Worker configuratie toegevoegd voor native ES-module support in WebView2 (Windows)
  worker: {
    format: 'es',
    plugins: () => [
      react() // Zorgt dat de worker TypeScript en gedeelde game-logica correct compileert
    ]
  },
  optimizeDeps: {
    // react-router imports cookie's old CJS `parse`/`serialize`; prebundled, cookie exposes them.
    include: ["react-router-dom", "cookie"],
  },
  server: {
    port: 5173,
    host: '127.0.0.1',
    strictPort: false,
    open: true,
    watch: {
      ignored: ['**/src-tauri/target/**', '**/tmp/**', '**/*.tmpdir/**', '**/*.tmp'],
    },
  },
  preview: {
    port: 4173,
    host: '127.0.0.1',
    strictPort: false,
    open: false,
  },
  resolve: {
    alias: {
      ...srcAlias,
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
    // Rolldown specifieke configuratie voor Vite
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
            // 2. Geïsoleerde chunk-groep voor de simulatie-workers (vóór de algemene game chunks)
            {
              name: 'game-workers',
              test: /src\/simWorker\//,
              priority: 95
            },
            {
              name: 'router',
              test: /node_modules\/react-router\//,
              priority: 90
            },
            // Splits de zware opstartschermen af van elkaar om de individuele chunks onder de limiet te krijgen
            {
              name: 'game-ui-intro',
              test: /src\/(components|game)\/IntroScreen/,
              priority: 86
            },
            {
              name: 'game-ui-mapsetup',
              test: /src\/(components|game)\/MapSetupScreen/,
              priority: 85
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