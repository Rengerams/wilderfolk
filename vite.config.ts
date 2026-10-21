
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { srcAlias } from "./config/vite.shared.ts";

// Matches both Windows and Unix module paths.
const SEP = String.raw`[\\/]`;

// Only isolate large, logically separate subsystems.
// Everything else is optimized automatically by Rolldown.
const gameData = new RegExp(
  `src${SEP}game${SEP}data${SEP}`
);

const gameAudio = new RegExp(
  `src${SEP}audio${SEP}`
);

const gameCombat = new RegExp(
  `src${SEP}game${SEP}(frontierCombat|rivalEvents|defenseStructures|militiaBalance|groupEvents|watchtowerDetection)(?:\\.|${SEP})`
);

export default defineConfig({
  base: "./",

  plugins: [
    tailwindcss(),
    react(),
  ],

  resolve: {
    alias: {
      ...srcAlias,
    },
  },

  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: false,
    open: true,

    watch: {
      ignored: [
        "**/src-tauri/target/**",
        "**/tmp/**",
        "**/*.tmpdir/**",
        "**/*.tmp",
      ],
    },
  },

  preview: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: false,
    open: false,
  },

  build: {
    // Modern browser baseline, suitable for Vite 8.
    target: "baseline-widely-available",

    // Fast native minification using Oxc.
    minify: "oxc",

    // Fast CSS minification.
    cssMinify: "lightningcss",

    // Avoid generating production source maps.
    sourcemap: false,

    // Split CSS alongside lazy-loaded components.
    cssCodeSplit: true,

    // Keep Vite's native module-preload optimization.
    modulePreload: true,

    // Small assets are embedded to avoid extra requests.
    assetsInlineLimit: 4096,

    // Warning threshold only, not a chunk-size limit.
    chunkSizeWarningLimit: 800,

    rolldownOptions: {
      output: {
        minifyInternalExports: true,

        codeSplitting: {
          groups: [
            {
              name: "game-data",
              test: gameData,
              priority: 70,
            },
            {
              name: "game-audio",
              test: gameAudio,
              priority: 60,
            },
            {
              name: "game-combat",
              test: gameCombat,
              priority: 50,
            },
          ],
        },
      },
    },
  },
});
