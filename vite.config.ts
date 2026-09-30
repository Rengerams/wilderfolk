import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite" // 1. Hier geïmporteerd [1]
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
    tailwindcss(), // 2. Hier toegevoegd (vóór react) [1]
    react()
  ],
  server: {
    port: 5173,
    host: '127.0.0.1',
    strictPort: false,
    open: true,
    watch: {
      // `src-tauri/target/` is Rust build output, and `cargo doc` writes thousands of
      // generated HTML files into `src-tauri/target/doc/**`. The dev server watched them all
      // and issued a full-page reload per file, so opening the game in a browser (or driving
      // it from `scripts/*.mjs`) produced a reload storm and the page never settled.
      // Nothing under `target/` is ever imported by the app — it is build output.
      //
      // `tmp/**` is the same class of problem for a different reason: it is scratch — probe scripts,
      // extracted archives, third-party payloads — and none of it is imported by the app either. A
      // *locked* file there does not just cause noise, it **kills the dev server**: chokidar's EBUSY on
      // `tmp/godot-ai-inspect/v4payload/addons/godot_ai/LICENSE` threw from the watcher and took the
      // whole process down (the owner's server died six times in one session that way, each time leaving
      // them with a page that could not reload). Ignoring `tmp/` removes the cause rather than the
      // symptom, and keeps scratch out of the reload graph entirely.
      //
      // `.*.tmpdir/**` is the third and most annoying one, because it is not the project's own scratch at
      // all: the agent harness writes root files (this run: `command.md`) by atomically replacing them
      // through a temporary directory *at the project root*
      // (`.command.md.<pid>.<guid>.tmpdir/command.md.tmp`). Vite watched that locked temp file, threw
      // `EBUSY` from the watcher, and died — so editing the harness's own instructions killed the dev
      // server. Nothing inside a `*.tmpdir` is ever imported by the app; they are mid-write staging dirs.
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
