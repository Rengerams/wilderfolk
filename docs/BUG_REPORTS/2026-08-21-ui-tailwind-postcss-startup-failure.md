# Bug: UI fails to start because Tailwind is configured as a PostCSS plugin

- Status: resolved
- Date discovered: 2026-08-21
- Status history: 2026-08-21 — verified after live Vite restart and browser confirmation
- Version/build: 0.6.1.1
- Reporter: Live UI test
- Area: UI | Play
- Owner module: `postcss.config.*`, `tailwind.config.*`, and package dependencies
- Cadence: Development-server startup / CSS transform

## Observed behavior

Opening `http://127.0.0.1:5173/` shows the Vite error overlay instead of the game. The overlay reports that Tailwind CSS is being used directly as a PostCSS plugin and instructs installing `@tailwindcss/postcss` and updating the PostCSS configuration.

## Expected behavior

The development server should compile `src/index.css` and render the game UI without a Vite error overlay.

## Evidence

Live browser UI test on 2026-08-21 displayed the Vite overlay at `src/index.css` with the message that the PostCSS plugin moved to a separate package.

## Root cause

The installed Tailwind version is newer than the current PostCSS integration configuration. The project has `tailwindcss` but not the adapter package requested by the current Tailwind/PostCSS runtime.

## Fix

Restored the declared Tailwind 3 dependency with `npm install --save-dev tailwindcss@3.4.19`, aligning `node_modules` and `package-lock.json` with the existing `postcss.config.js` and Tailwind 3 stylesheet directives. No UI component code was changed.

## Regression test

Restarted Vite and reopened `http://127.0.0.1:5173/`. The Vite error overlay disappeared and the player-facing intro screen rendered with the BETA version, food-chain messaging, `CHOOSE YOUR LAND` action, and mute control. Further interaction testing is continuing.

## Save/migration impact

None expected.

