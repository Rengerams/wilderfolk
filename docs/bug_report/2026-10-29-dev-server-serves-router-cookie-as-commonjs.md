# Dev server serves the router's cookie dependency as raw CommonJS and the game fails to load

- Bug: the browser throws `SyntaxError: The requested module '/node_modules/cookie/dist/index.js' does not provide an export named 'parse'`, so no application module runs
- Status: resolved — fix in the shared dev configuration, cold-cache browser verification passed
- Severity: high (the app does not boot at all, no gameplay reachable)
- Date discovered: 2026-10-29
- Version/build: 0.6.5.1, dependency set `react-router-dom` 7.18.4 with nested `react-router` 7.18.4 and `cookie` 1.1.1
- Reporter: owner, browser console on the dev-server page
- Area: development server module graph (not simulation or rendering)
- Owner module: `vite.config.ts` (dependency optimization); no game module is involved
- Related PR/commit: none

## Status history

- 2026-10-29 — open: owner pastes the uncaught syntax error from the dev-server page
- 2026-10-29 — investigating: the served router chunk requests `parse`/`serialize` from a raw CommonJS file, reproduced by requesting that chunk from the running dev server
- 2026-10-29 — resolved: cookie prebundled with the router in the shared dev configuration; cold-cache load renders with no console errors and no failed requests

## Observed behavior

The console reports the error at `chunk-H4DAEOV7.mjs:249` (development build of the nested router). Because it is a module-graph failure at import time, the entry module never finishes evaluating and the page stays blank.

Requesting the same chunk from the running dev server shows the import it actually makes:

```js
// lib/server-runtime/cookies.ts
import { parse, serialize } from "/node_modules/cookie/dist/index.js?v=b5fdb547";
```

That file is the CommonJS build (`exports.parse = parseCookie`), so the browser sees no ESM named export.

## Expected behavior

A dev-server page must load its dependency graph without unresolved named exports. The installed `cookie` version still provides `parse` and `serialize` as CommonJS properties, so the bundler's CommonJS interop must supply them.

## Reproduction steps

1. Start the dev server (`npm run dev`) with the current dependency tree, with `node_modules/.vite` absent or stale.
2. Load the page in a browser.
3. Request `/node_modules/react-router-dom/node_modules/react-router/dist/development/chunk-H4DAEOV7.mjs` and read its `cookie` import: it points at the raw CommonJS file rather than a prebundled dependency.

## Evidence

- `node_modules/react-router-dom/node_modules/react-router/dist/development/chunk-H4DAEOV7.mjs:249` imports `{ parse, serialize }` from `"cookie"`; the production chunk does the same.
- `node_modules/cookie/package.json` declares only `main: dist/index.js`, no `exports` map and no module build, so the file is CommonJS.
- The prebundled `react-router-dom` bundle inlines cookie and loads correctly, which is why the app normally works; only the raw router chunk path fails.

## Root cause

The router's dependency (nested `react-router`) imports the pre-1.0 cookie API. When its development chunk is served straight from `node_modules`, Vite resolves the bare `cookie` import to the CommonJS file and serves it as an ES module, which has no `parse`/`serialize` named exports. Vite only applies CommonJS interop to dependencies it prebundles, and cookie was not in the optimized set.

## Fix / proposed fix

Added an explicit dependency-optimizer list to the shared dev configuration covering the router and `cookie`, so cookie is prebundled into an ES module with interop exports and the raw router chunk imports that prebundled copy (`__vite_cjsImport…cookie`).

## Regression coverage

The failure is a dependency-graph resolution, not a game rule, so it has no unit test. Verification: after clearing the optimizer cache and restarting the dev server, the served raw router chunk now imports the prebundled cookie dependency, and the page loads with an empty console error log and no failed requests. TypeScript for the node configuration passes.

## Save compatibility

None — no gameplay, simulation or save-format code changed.
